import { env, isMockApiMode } from "@/lib/env";
import { ApiError, normalizeApiError, type ApiErrorPayload } from "./error";
import { tokenStore } from "./token-store";
import type { AuthTokens } from "./types";

export interface ApiRequestOptions<TBody = unknown> {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: TBody;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  skipAuth?: boolean;
  signal?: AbortSignal;
}

type UnauthorizedHandler = () => void;

let onUnauthorizedHandler: UnauthorizedHandler | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorizedHandler = handler;
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  try {
    const json = (await response.json()) as Partial<ApiErrorPayload> & { error?: string };
    const rawMessage = json.message ?? json.error ?? response.statusText ?? "Yêu cầu thất bại.";
    const message = Array.isArray(rawMessage) ? rawMessage.join("; ") : String(rawMessage);
    return new ApiError({
      statusCode: json.statusCode ?? response.status,
      code: json.code ?? (typeof json.error === "string" ? json.error : `HTTP_${response.status}`),
      message,
      requestId: json.requestId,
      timestamp: json.timestamp,
      details: json.details,
    });
  } catch {
    return new ApiError({
      statusCode: response.status,
      code: `HTTP_${response.status}`,
      message: response.statusText || "Yêu cầu thất bại.",
      timestamp: new Date().toISOString(),
    });
  }
}

async function attemptTokenRefresh(): Promise<string | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    const existingSession = tokenStore.getSession();
    try {
      const response = await fetch(buildUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refreshToken ? { refreshToken } : {}),
        credentials: "include",
      });

      if (!response.ok) {
        tokenStore.clear();
        onUnauthorizedHandler?.();
        return null;
      }

      const rawRes = await response.json();
      const tokens = (
        rawRes && typeof rawRes === "object" && "statusCode" in rawRes && "data" in rawRes
          ? (rawRes as { data: AuthTokens }).data
          : rawRes
      ) as AuthTokens;

      if (existingSession) {
        tokenStore.setSession({
          user: existingSession.user,
          tokens,
        });
      } else {
        tokenStore.setTokens(tokens);
      }
      return tokens.accessToken;
    } catch {
      tokenStore.clear();
      onUnauthorizedHandler?.();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

function buildUrl(path: string): string {
  const base = env.NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export async function apiRequest<TResponse, TBody = unknown>(
  options: ApiRequestOptions<TBody>,
): Promise<TResponse> {
  const method = options.method ?? "GET";
  const requestHeaders: Record<string, string> = {
    ...(options.headers ?? {}),
  };

  if (options.idempotencyKey) {
    requestHeaders["Idempotency-Key"] = options.idempotencyKey;
  }

  const accessToken = options.skipAuth ? null : tokenStore.getAccessToken();
  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const isMock = isMockApiMode();
  if (isMock) {
    const { dispatchMockRequest } = await import("./mocks/router");
    return dispatchMockRequest<TResponse>({
      method,
      path: options.path,
      body: options.body,
      headers: requestHeaders,
      accessToken,
    });
  }

  let requestBody: unknown = options.body;
  const isJsonBody = requestBody !== undefined && !(requestBody instanceof FormData);
  if (isJsonBody) {
    requestHeaders["Content-Type"] = "application/json";
    if (
      options.idempotencyKey &&
      typeof requestBody === "object" &&
      requestBody !== null &&
      !("idempotencyKey" in (requestBody as Record<string, unknown>))
    ) {
      requestBody = {
        ...(requestBody as Record<string, unknown>),
        idempotencyKey: options.idempotencyKey,
      };
    }
  }

  const maxAttempts = method === "GET" ? 2 : 1;
  let hasRetriedRefresh = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(buildUrl(options.path), {
        method,
        headers: requestHeaders,
        body:
          requestBody === undefined
            ? undefined
            : requestBody instanceof FormData
              ? requestBody
              : JSON.stringify(requestBody),
        credentials: "include",
        signal: options.signal,
      });

      if (response.status === 401 && !options.skipAuth && !hasRetriedRefresh) {
        hasRetriedRefresh = true;
        const newAccessToken = await attemptTokenRefresh();
        if (newAccessToken) {
          requestHeaders.Authorization = `Bearer ${newAccessToken}`;
          attempt -= 1;
          continue;
        }
      }

      if (!response.ok) {
        const apiError = await parseErrorResponse(response);
        if (method === "GET" && apiError.isRetryable && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          continue;
        }
        throw apiError;
      }

      if (response.status === 204) {
        return undefined as TResponse;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const json = await response.json();
        if (
          json !== null &&
          typeof json === "object" &&
          "statusCode" in json &&
          "data" in json &&
          typeof (json as Record<string, unknown>).statusCode === "number"
        ) {
          return (json as { data: TResponse }).data;
        }
        return json as TResponse;
      }
      return (await response.text()) as TResponse;
    } catch (error) {
      const normalized = normalizeApiError(error);
      if (
        method === "GET" &&
        normalized.isRetryable &&
        attempt < maxAttempts &&
        normalized.statusCode === 0
      ) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        continue;
      }
      throw normalized;
    }
  }

  throw new ApiError({
    statusCode: 500,
    code: "REQUEST_FAILED",
    message: "Không thể hoàn thành yêu cầu đến máy chủ.",
    timestamp: new Date().toISOString(),
  });
}

export function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      sp.set(key, String(value));
    }
  }
  const str = sp.toString();
  return str ? `?${str}` : "";
}

