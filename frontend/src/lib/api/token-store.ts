import type { AuthTokens, AuthUser } from "./types";

export interface AuthSession {
  user: AuthUser;
  tokens: AuthTokens;
}

const SESSION_STORAGE_KEY = "web_ielts_dev_session";

let memorySession: AuthSession | null = null;
let memoryTokens: AuthTokens | null = null;

export const tokenStore = {
  getSession(): AuthSession | null {
    if (memorySession) {
      return memorySession;
    }
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      memorySession = JSON.parse(raw) as AuthSession;
      memoryTokens = memorySession.tokens;
      return memorySession;
    } catch {
      return null;
    }
  },

  getAccessToken(): string | null {
    return memoryTokens?.accessToken ?? this.getSession()?.tokens.accessToken ?? null;
  },

  getRefreshToken(): string | null {
    return memoryTokens?.refreshToken ?? this.getSession()?.tokens.refreshToken ?? null;
  },

  setTokens(tokens: AuthTokens | null): void {
    memoryTokens = tokens;
    if (memorySession && tokens) {
      this.setSession({ user: memorySession.user, tokens });
    }
  },

  setSession(session: AuthSession | null): void {
    memorySession = session;
    memoryTokens = session?.tokens ?? null;
    if (typeof window === "undefined") {
      return;
    }
    try {
      if (session) {
        window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  },

  clear(): void {
    this.setSession(null);
  },
};

