"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api, call, connectSession } from "@/lib/api/client";
import { clearDrafts, deletePref } from "@/lib/db";
import type { components } from "@/sdk";
import { loginUrl } from "./redirect";
import { getSession } from "./session-browser";
import type { SessionSnapshot, SessionUser } from "./session";

export type Me = components["schemas"]["MeDto"];
export type Membership = components["schemas"]["MyMembershipDto"];
export type Role = components["schemas"]["Role"];

export const ACTIVE_ORG_PREF = "activeOrgId";
export const meQueryKey = ["account", "me"] as const;

interface AuthActions {
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
}

const ActionsContext = createContext<AuthActions | null>(null);

const SERVER_SNAPSHOT: SessionSnapshot = { status: "loading", user: null, endedReason: null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = getSession();
  const queryClient = useQueryClient();
  const router = useRouter();

  const clearAppState = useCallback(async () => {
    queryClient.clear();
    await deletePref(ACTIVE_ORG_PREF).catch(() => undefined);
  }, [queryClient]);

  useEffect(() => {
    connectSession(session, () => {
      void clearAppState();
      router.replace(loginUrl(window.location.pathname + window.location.search));
    });
    void session.restore();
  }, [session, router, clearAppState]);

  // Another tab signed out, or the session ended: drop cached data.
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  useEffect(() => {
    if (snapshot.status === "anonymous") queryClient.clear();
  }, [snapshot.status, queryClient]);

  const actions = useMemo<AuthActions>(
    () => ({
      async login(email, password) {
        const tokens = await call((signal) =>
          api.POST("/api/auth/login", { body: { email, password }, signal }),
        );
        queryClient.clear();
        await session.acceptTokens(tokens);
      },
      async register(name, email, password) {
        const tokens = await call((signal) =>
          api.POST("/api/auth/register", { body: { name, email, password }, signal }),
        );
        queryClient.clear();
        await session.acceptTokens(tokens);
      },
      async logout() {
        // From M4: block this behind a warning when unsynced entries exist.
        await session.logout();
        await clearAppState();
        await clearDrafts().catch(() => undefined);
      },
      async logoutAll() {
        await call((signal) => api.POST("/api/auth/logout-all", { signal }));
        await session.endLocally("logout", true);
        await clearAppState();
        await clearDrafts().catch(() => undefined);
      },
      async changePassword(currentPassword, newPassword) {
        const tokens = await call((signal) =>
          api.PATCH("/api/auth/password", { body: { currentPassword, newPassword }, signal }),
        );
        await session.acceptTokens(tokens);
      },
    }),
    [session, queryClient, clearAppState],
  );

  return <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>;
}

export function useAuthActions(): AuthActions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error("useAuthActions must be used inside AuthProvider");
  return actions;
}

export interface SessionState {
  status: SessionSnapshot["status"];
  user: SessionUser | null;
  endedReason: SessionSnapshot["endedReason"];
  /** From GET /auth/me. Undefined until loaded (or while offline). */
  memberships: Membership[] | undefined;
  meError: unknown;
}

export function useSession(): SessionState {
  const session = getSession();
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  const me = useQuery({
    queryKey: meQueryKey,
    queryFn: () => call((signal) => api.GET("/api/auth/me", { signal })),
    enabled: snapshot.status === "authenticated",
    staleTime: 60_000,
  });

  return {
    status: snapshot.status,
    user: me.data ? { id: me.data.id, name: me.data.name, email: me.data.email } : snapshot.user,
    endedReason: snapshot.endedReason,
    memberships: me.data?.memberships,
    meError: me.error,
  };
}

/** The caller's role in an organisation, from /auth/me. The API remains the enforcer. */
export function useRole(orgId: string | undefined): Role | undefined {
  const { memberships } = useSession();
  return memberships?.find((m) => m.organization.id === orgId)?.role;
}

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

export function roleAtLeast(role: Role | undefined, minimum: Role): boolean {
  return role !== undefined && RANK[role] >= RANK[minimum];
}
