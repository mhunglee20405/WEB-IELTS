"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setUnauthorizedHandler } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import { tokenStore } from "@/lib/api/token-store";
import type { AuthUser, LoginRequest } from "@/lib/api/types";
import { isMockApiMode } from "@/lib/env";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  isLoggingOut?: boolean;
  login: (payload: LoginRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [logoutFromPath, setLogoutFromPath] = useState<string | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      tokenStore.clear();
      queryClient.clear();
      setUser(null);
      setStatus("unauthenticated");
    });

    return () => {
      setUnauthorizedHandler(null);
    };
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      const existingToken = tokenStore.getAccessToken();

      if (isMockApiMode() && !existingToken) {
        await Promise.resolve();
        if (!cancelled) {
          setUser(null);
          setStatus("unauthenticated");
        }
        return;
      }

      try {
        const verifiedUser = await authApi.me();
        if (cancelled) return;
        const currentTokens = {
          accessToken: tokenStore.getAccessToken() ?? "",
          refreshToken: tokenStore.getRefreshToken() ?? undefined,
        };
        if (currentTokens.accessToken) {
          tokenStore.setSession({ user: verifiedUser, tokens: currentTokens });
        }
        setUser(verifiedUser);
        setStatus("authenticated");
      } catch {
        if (cancelled) return;
        tokenStore.clear();
        setUser(null);
        setStatus("unauthenticated");
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (payload: LoginRequest): Promise<AuthUser> => {
      const response = await authApi.login(payload);
      setLogoutFromPath(null);
      queryClient.clear();
      tokenStore.setSession({
        user: response.user,
        tokens: response.tokens,
      });
      setUser(response.user);
      setStatus("authenticated");
      return response.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    setLogoutFromPath(pathname);
    try {
      if (tokenStore.getAccessToken()) {
        await authApi.logout();
      }
    } catch {
      // Clear local session regardless of remote revocation network errors
    } finally {
      tokenStore.clear();
      queryClient.clear();
      setUser(null);
      setStatus("unauthenticated");
      router.replace("/login");
    }
  }, [pathname, queryClient, router]);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const verifiedUser = await authApi.me();
      const accessToken = tokenStore.getAccessToken();
      if (accessToken) {
        tokenStore.setSession({
          user: verifiedUser,
          tokens: {
            accessToken,
            refreshToken: tokenStore.getRefreshToken() ?? undefined,
          },
        });
      }
      setUser(verifiedUser);
      setStatus("authenticated");
      return verifiedUser;
    } catch {
      tokenStore.clear();
      setUser(null);
      setStatus("unauthenticated");
      return null;
    }
  }, []);

  const isLoggingOut = logoutFromPath !== null && pathname === logoutFromPath;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isLoggingOut,
      login,
      logout,
      refreshUser,
    }),
    [status, user, isLoggingOut, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }
  return ctx;
}

