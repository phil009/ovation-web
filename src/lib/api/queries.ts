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
export type DonationDto = components["schemas"]["DonationDto"];

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
  /** Prefix for every donation list of an event (lists, donor names). */
  donations: (orgId: string, eventId: string) =>
    ["org", orgId, "event", eventId, "donations"] as const,
  donationList: (orgId: string, eventId: string, filters: DonationFilters) =>
    ["org", orgId, "event", eventId, "donations", "list", filters] as const,
  donorNames: (orgId: string, eventId: string) =>
    ["org", orgId, "event", eventId, "donations", "names"] as const,
  donation: (orgId: string, donationId: string) => ["org", orgId, "donation", donationId] as const,
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

export interface DonationFilters {
  awardeeId?: string;
  offset: number;
}

export const DONATIONS_PAGE_SIZE = 100;
/** The API's largest page. Donor-name suggestions read the first page of this size. */
export const DONATIONS_MAX_PAGE = 500;

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

export const donationsQuery = (orgId: string, eventId: string, filters: DonationFilters) =>
  queryOptions({
    queryKey: keys.donationList(orgId, eventId, filters),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/donations", {
          params: {
            query: {
              eventId,
              awardeeId: filters.awardeeId,
              limit: DONATIONS_PAGE_SIZE,
              offset: filters.offset,
            },
          },
          signal,
        }),
      ),
  });

/**
 * Donor names already used at this event, for autocomplete. Reads the first 500 donations
 * (the API's largest page); later names are not suggested.
 */
export const donorNamesQuery = (orgId: string, eventId: string) =>
  queryOptions({
    queryKey: keys.donorNames(orgId, eventId),
    queryFn: async () => {
      const page = await call((signal) =>
        api.GET("/api/donations", {
          params: { query: { eventId, limit: DONATIONS_MAX_PAGE, offset: 0 } },
          signal,
        }),
      );
      const names = new Map<string, string>();
      for (const d of page.items) {
        const key = d.donorName.trim().toLocaleLowerCase("en-GB");
        if (!names.has(key)) names.set(key, d.donorName.trim());
      }
      return [...names.values()].sort((a, b) => a.localeCompare(b, "en-GB"));
    },
    staleTime: 60_000,
  });

export const donationQuery = (orgId: string, donationId: string) =>
  queryOptions({
    queryKey: keys.donation(orgId, donationId),
    queryFn: () =>
      call((signal) =>
        api.GET("/api/donations/{id}", { params: { path: { id: donationId } }, signal }),
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
