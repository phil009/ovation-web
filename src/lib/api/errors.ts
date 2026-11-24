import { strings } from "@/lib/strings";
import type { components } from "@/sdk";

/**
 * The API's error body (`ErrorResponseDto`): `message` is a list of strings on 400, a single
 * string otherwise. Partial, because a proxy or a sleeping host can answer with something else.
 */
export type ApiErrorBody = Partial<components["schemas"]["ErrorResponseDto"]>;

export type ApiErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "gone"
  | "rateLimited"
  | "server"
  | "network"
  | "timeout";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or 0 for network failures and timeouts. */
  readonly status: number;
  /** Server messages, as sent (for 400s: one per failed rule). */
  readonly serverMessages: string[];
  /** 400 validation messages grouped by the field they start with, e.g. { email: [...] }. */
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, body?: ApiErrorBody | null, kind?: ApiErrorKind) {
    const serverMessages = normaliseMessages(body?.message);
    const resolvedKind = kind ?? kindForStatus(status);
    super(strings.errors[resolvedKind]);
    this.name = "ApiError";
    this.kind = resolvedKind;
    this.status = status;
    this.serverMessages = serverMessages;
    this.fieldErrors = resolvedKind === "validation" ? groupByField(serverMessages) : {};
  }

  /** True when retrying the same request later could succeed. */
  get retriable(): boolean {
    return this.kind === "network" || this.kind === "timeout" || this.kind === "server";
  }

  /** The server's message for a 409, to tell the specific conflict cases apart. */
  get serverMessage(): string {
    return this.serverMessages.join(" ");
  }
}

function normaliseMessages(message: ApiErrorBody["message"]): string[] {
  if (Array.isArray(message)) return message.filter((m) => typeof m === "string");
  return typeof message === "string" && message ? [message] : [];
}

function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return "validation";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    case 410:
      return "gone";
    case 429:
      return "rateLimited";
    default:
      return status >= 500 ? "server" : status === 0 ? "network" : "server";
  }
}

/** class-validator messages start with the property name: "email must be an email". */
function groupByField(messages: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const message of messages) {
    const field = /^([A-Za-z][\w.]*)\s/.exec(message)?.[1];
    if (!field) continue;
    (out[field] ??= []).push(message);
  }
  return out;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
