import { queryOptions } from "@tanstack/react-query";
import type { components } from "@/sdk";
import { api, call } from "./client";
import { isApiError } from "./errors";

export type EventDto = components["schemas"]["EventDto"];
export type AwardeeDto = components["schemas"]["AwardeeDto"];
export type EventSummary = components["schemas"]["EventSummaryDto"];
export type MemberDto = components["schemas"]["MemberDto"];
export type InviteDto = components["schemas"]["InviteDto"];
export type AuditEntry = components["schemas"]["AuditEntryDto"];
export type AuditEntity = AuditEntry["entity"];

/**
 * Query keys. Everything owned by an organisation starts with ['org', orgId], so switching
 * organisation (OrgShell) and signing out can drop it in one go.
 */
export const keys = {
  org: (orgId: string) => ["org", orgId] as const,
  events: (orgId: string) => ["org", orgId, "events"] as const,
  event: (orgId: string, eventId: string) => ["org", orgId, "event", eventId] as const,
  awardees: (orgId: string, eventId: string) =>
    ["org", orgId, "event", eventId, "awardees"] as const,
  summary: (orgId: string, eventId: string) => ["org", orgId, "event", eventId, "summary"] as const,
  members: (orgId: string) => ["org", orgId, "members"] as const,
  invites: (orgId: string) => ["org", orgId, "invites"] as const,
  audit: (orgId: string, filters: AuditFilters) => ["org", orgId, "audit", filters] as const,
};

export interface AuditFilters {
  entity?: AuditEntity;
  userId?: string;
  offset: number;
}

export const AUDIT_PAGE_SIZE = 50;

export const eventsQuery = (orgId: string) =>
  queryOptions({
    queryKey: keys.events(orgId),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/orgs/{orgId}/events", { params: { path: { orgId } }, signal }),
      ),
  });

export const eventQuery = (orgId: string, eventId: string) =>
  queryOptions({
    queryKey: keys.event(orgId, eventId),
    queryFn: async () => {
      const event = await call((signal) =>
        api.GET("/api/events/{id}", { params: { path: { id: eventId } }, signal }),
      );
      // The event route is nested under the organisation in the URL. Refuse a mismatch rather
      // than show another organisation's event under this one's name.
      if (event.organizationId !== orgId) throw new EventNotInOrgError();
      return event;
    },
  });

export class EventNotInOrgError extends Error {
  constructor() {
    super("Event belongs to another organisation");
    this.name = "EventNotInOrgError";
  }
}

export const awardeesQuery = (orgId: string, eventId: string) =>
  queryOptions({
    queryKey: keys.awardees(orgId, eventId),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/events/{eventId}/awardees", { params: { path: { eventId } }, signal }),
      ),
  });

export const summaryQuery = (orgId: string, eventId: string) =>
  queryOptions({
    queryKey: keys.summary(orgId, eventId),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/events/{eventId}/summary", { params: { path: { eventId } }, signal }),
      ),
  });

export const membersQuery = (orgId: string) =>
  queryOptions({
    queryKey: keys.members(orgId),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/orgs/{orgId}/members", { params: { path: { orgId } }, signal }),
      ),
  });

export const invitesQuery = (orgId: string) =>
  queryOptions({
    queryKey: keys.invites(orgId),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/orgs/{orgId}/invites", { params: { path: { orgId } }, signal }),
      ),
  });

export const auditQuery = (orgId: string, filters: AuditFilters) =>
  queryOptions({
    queryKey: keys.audit(orgId, filters),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/orgs/{orgId}/audit-log", {
          params: {
            path: { orgId },
            query: {
              entity: filters.entity,
              userId: filters.userId,
              limit: AUDIT_PAGE_SIZE,
              offset: filters.offset,
            },
          },
          signal,
        }),
      ),
  });

/** A 409 because the event is closed (the backend says "This event is closed"). */
export function isClosedEventConflict(error: unknown): boolean {
  return isApiError(error) && error.status === 409 && /closed/i.test(error.serverMessage);
}

/** 404, or 400 for a malformed id in the URL: show "not found", not an error. */
export function isNotFound(error: unknown): boolean {
  return (
    error instanceof EventNotInOrgError ||
    (isApiError(error) && (error.status === 404 || error.status === 400))
  );
}
