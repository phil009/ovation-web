import { z } from "zod";
import type { components } from "@/sdk";
import { isCalendarDay } from "./dates";
import { parseNairaInput, type NairaParseResult } from "./money";
import { strings } from "./strings";

// No JIT: zod would probe `new Function`, which the CSP (no unsafe-eval) blocks and reports.
z.config({ jitless: true });

const v = strings.validation;

export const emailSchema = z.string().trim().min(1, v.emailRequired).pipe(z.email(v.emailInvalid));

// Matches the backend: 8 to 128 characters. No other rules (length beats complexity).
export const newPasswordSchema = z
  .string()
  .min(1, v.passwordRequired)
  .min(8, v.passwordTooShort)
  .max(128, v.passwordTooLong);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, v.passwordRequired),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  name: z.string().trim().min(1, v.nameRequired).max(100, v.nameTooLong),
  email: emailSchema,
  password: newPasswordSchema,
});
export type RegisterValues = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, v.currentPasswordRequired),
    newPassword: newPasswordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: v.passwordsDiffer,
    path: ["newPassword"],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const orgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, v.orgNameRequired)
    .min(2, v.orgNameTooShort)
    .max(120, v.orgNameTooLong),
});
export type OrgValues = z.infer<typeof orgSchema>;

/** The backend ignores case, spaces and dashes; the alphabet has no 0/O or 1/I/L. */
export function normaliseInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, "");
}

export const joinSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, v.codeRequired)
    .refine((c) => /^[A-Z0-9]{6,20}$/.test(normaliseInviteCode(c)), v.codeInvalid),
});
export type JoinValues = z.infer<typeof joinSchema>;

// ---- events ------------------------------------------------------------------------------

export const eventSchema = z.object({
  // 2 to 200 characters, as in the OpenAPI document (CreateEventDto.name).
  name: z
    .string()
    .trim()
    .min(1, v.eventNameRequired)
    .min(2, v.eventNameTooShort)
    .max(200, v.eventNameTooLong),
  date: z
    .string()
    .min(1, v.dateRequired)
    .refine((value) => isCalendarDay(value), v.dateInvalid),
});
export type EventValues = z.infer<typeof eventSchema>;

// ---- awardees ----------------------------------------------------------------------------

export const PAYMENT_MODES = ["CASH", "TRANSFER", "PLEDGE"] as const;
export type PaymentMode = components["schemas"]["PaymentMode"];

/** "" (or "0") means no own donation. Otherwise a naira amount that parseNairaInput accepts. */
function optionalAmount(raw: string): NairaParseResult | null {
  const trimmed = raw.trim();
  if (trimmed === "" || /^0+$/.test(trimmed)) return null;
  return parseNairaInput(trimmed);
}

/** Form values stay strings; `awardeeBody` turns them into the API body. */
export const awardeeSchema = z.object({
  number: z
    .string()
    .trim()
    .refine((value) => value === "" || /^\d{1,9}$/.test(value), v.numberInvalid),
  name: z.string().trim().min(1, v.awardeeNameRequired).max(200, v.awardeeNameTooLong),
  amount: z.string().superRefine((value, ctx) => {
    const parsed = optionalAmount(value);
    if (parsed && !parsed.ok)
      ctx.addIssue({ code: "custom", message: strings.money[parsed.error] });
  }),
  paymentMode: z.enum(PAYMENT_MODES),
});
export type AwardeeValues = z.infer<typeof awardeeSchema>;

export type AwardeeBody = components["schemas"]["CreateAwardeeDto"];

/**
 * The create or update body. A blank number or amount is left out on create. On update, a
 * cleared amount is sent as "0" (the backend has no way to unset it), and the payment mode
 * only goes with an amount.
 */
export function awardeeBody(values: AwardeeValues, mode: "create" | "update"): AwardeeBody {
  const parsed = optionalAmount(values.amount);
  const body: AwardeeBody = { name: values.name.trim() };
  const number = values.number.trim();
  if (number !== "") body.number = Number.parseInt(number, 10);
  if (parsed?.ok) {
    body.amountKobo = parsed.kobo;
    body.paymentMode = values.paymentMode;
  } else if (mode === "update") {
    body.amountKobo = "0";
  }
  return body;
}

/** Turns a kobo string back into what the amount field shows when editing. */
export function koboToNairaInput(kobo: string): string {
  if (!/^\d+$/.test(kobo) || /^0+$/.test(kobo)) return "";
  const value = BigInt(kobo);
  const naira = (value / 100n).toString();
  const rest = value % 100n;
  // Whole naira only in the input; kobo remainders cannot come from this app.
  return rest === 0n ? naira : `${naira}.${rest.toString().padStart(2, "0")}`;
}

// ---- invite codes ------------------------------------------------------------------------

export const INVITE_ROLES = ["EDITOR", "VIEWER"] as const;

export const inviteSchema = z.object({
  role: z.enum(INVITE_ROLES),
  maxUses: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (/^\d{1,4}$/.test(value) && +value >= 1 && +value <= 1000),
      v.maxUsesInvalid,
    ),
  expiresInDays: z
    .string()
    .trim()
    .refine((value) => /^\d{1,2}$/.test(value) && +value >= 1 && +value <= 90, v.expiresInvalid),
});
export type InviteValues = z.infer<typeof inviteSchema>;

export function inviteBody(values: InviteValues): components["schemas"]["CreateInviteDto"] {
  const body: components["schemas"]["CreateInviteDto"] = {
    role: values.role,
    expiresInDays: Number.parseInt(values.expiresInDays, 10),
  };
  if (values.maxUses.trim() !== "") body.maxUses = Number.parseInt(values.maxUses, 10);
  return body;
}

// ---- donations ---------------------------------------------------------------------------

export type DonationDto = components["schemas"]["DonationDto"];
export type DonationStatus = components["schemas"]["DonationStatus"];
export type CreateDonationBody = components["schemas"]["CreateDonationDto"];
export type UpdateDonationBody = components["schemas"]["UpdateDonationDto"];

/** The awardee select's value for a general donation (for all awardees). */
export const GENERAL = "";

/** Form values stay strings; `donationCreateBody` and `donationUpdateBody` build the API body. */
export const donationSchema = z.object({
  awardeeId: z.string(),
  // 1 to 200 characters, as in the OpenAPI document (CreateDonationDto.donorName).
  donorName: z.string().trim().min(1, v.donorNameRequired).max(200, v.donorNameTooLong),
  amount: z.string().superRefine((value, ctx) => {
    const parsed = parseNairaInput(value);
    if (!parsed.ok) ctx.addIssue({ code: "custom", message: strings.money[parsed.error] });
  }),
  paymentMode: z.enum(PAYMENT_MODES),
  /** Only used when editing a pledge: has it been paid? */
  status: z.enum(["PLEDGED", "RECEIVED"]),
  needsReview: z.boolean(),
  note: z.string().trim().max(500, v.noteTooLong),
});
export type DonationValues = z.infer<typeof donationSchema>;

function parsedKobo(amount: string): string {
  const parsed = parseNairaInput(amount);
  if (!parsed.ok) throw new Error("donation amount was not validated");
  return parsed.kobo;
}

/** The create body. `id` is the client id made when the form opened (safe to retry). */
export function donationCreateBody(
  values: DonationValues,
  ids: { id: string; eventId: string },
): CreateDonationBody {
  const body: CreateDonationBody = {
    id: ids.id,
    eventId: ids.eventId,
    awardeeId: values.awardeeId === GENERAL ? null : values.awardeeId,
    donorName: values.donorName.trim(),
    amountKobo: parsedKobo(values.amount),
    paymentMode: values.paymentMode,
  };
  if (values.needsReview) body.needsReview = true;
  const note = values.note.trim();
  if (note) body.note = note;
  return body;
}

/**
 * The update body, with the version that was read (a stale one gets 409). A pledge keeps
 * the status chosen in the form; cash and transfers are always received. An empty note is
 * sent as "" to clear it.
 */
export function donationUpdateBody(values: DonationValues, version: number): UpdateDonationBody {
  return {
    version,
    awardeeId: values.awardeeId === GENERAL ? null : values.awardeeId,
    donorName: values.donorName.trim(),
    amountKobo: parsedKobo(values.amount),
    paymentMode: values.paymentMode,
    status: values.paymentMode === "PLEDGE" ? values.status : "RECEIVED",
    needsReview: values.needsReview,
    note: values.note.trim(),
  };
}

/** The form values for an existing donation (edit page). */
export function donationToValues(d: DonationDto): DonationValues {
  return {
    awardeeId: d.awardeeId ?? GENERAL,
    donorName: d.donorName,
    amount: koboToNairaInput(d.amountKobo),
    paymentMode: d.paymentMode,
    status: d.status,
    needsReview: d.needsReview,
    note: d.note ?? "",
  };
}
