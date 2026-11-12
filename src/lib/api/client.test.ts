import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, setUnauthorizedHandler } from "./client";
import { ApiError } from "./error";
import { tokenStore } from "./token-store";

describe("apiRequest HTTP client invariants", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:4000/api/v1");
    tokenStore.clear();
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    tokenStore.clear();
    setUnauthorizedHandler(null);
  });

  it("never retries unsafe POST mutations and attaches Idempotency-Key + Bearer header", async () => {
    tokenStore.setSession({
      user: {
        id: "stu-01",
        email: "student@ielts.vn",
        fullName: "Khổng Phú Cường",
        roles: ["student"],
        status: "active",
        timezone: "Asia/Ho_Chi_Minh",
      },
      tokens: {
        accessToken: "acc-initial",
        refreshToken: "ref-initial",
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "Tạm thời bận",
          requestId: "req-post-1",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest({
        method: "POST",
        path: "/student-assignments/sa-01/submissions",
        idempotencyKey: "attempt-uuid-1234",
        body: { answers: [{ questionId: "q-1", value: "TRUE" }] },
      }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("attempt-uuid-1234");
    expect(headers.Authorization).toBe("Bearer acc-initial");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("retries safe GET on transient 503 error once, but never retries 403 ANSWER_LOCKED", async () => {
    const fetchRetryMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ statusCode: 503, code: "TEMP_DOWN", message: "Retry me" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchRetryMock);

    const okResult = await apiRequest<{ ok: boolean }>({ method: "GET", path: "/health/ready" });
    expect(okResult).toEqual({ ok: true });
    expect(fetchRetryMock).toHaveBeenCalledTimes(2);

    const fetchForbiddenMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ statusCode: 403, code: "ANSWER_LOCKED", message: "Locked" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchForbiddenMock);

    await expect(
      apiRequest({ method: "GET", path: "/student-assignments/sa-01/review" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "ANSWER_LOCKED" });
    expect(fetchForbiddenMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent 401 refresh calls and updates session tokens", async () => {
    tokenStore.setSession({
      user: {
        id: "stu-01",
        email: "student@ielts.vn",
        fullName: "Khổng Phú Cường",
        roles: ["student"],
        status: "active",
        timezone: "Asia/Ho_Chi_Minh",
      },
      tokens: {
        accessToken: "expired-token",
        refreshToken: "valid-refresh",
      },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return new Response(
          JSON.stringify({ accessToken: "fresh-token", refreshToken: "fresh-refresh" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (authHeader === "Bearer fresh-token") {
        return new Response(JSON.stringify({ url }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ statusCode: 401, code: "UNAUTHORIZED", message: "Expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [res1, res2] = await Promise.all([
      apiRequest<{ url: string }>({ method: "GET", path: "/courses" }),
      apiRequest<{ url: string }>({ method: "GET", path: "/notifications" }),
    ]);

    expect(res1.url).toContain("/courses");
    expect(res2.url).toContain("/notifications");
    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
    expect(tokenStore.getAccessToken()).toBe("fresh-token");
  });

  it("clears tokenStore and invokes unauthorized handler when token refresh fails", async () => {
    const unauthorizedHandler = vi.fn();
    setUnauthorizedHandler(unauthorizedHandler);

    tokenStore.setSession({
      user: {
        id: "stu-01",
        email: "student@ielts.vn",
        fullName: "Khổng Phú Cường",
        roles: ["student"],
        status: "active",
        timezone: "Asia/Ho_Chi_Minh",
      },
      tokens: {
        accessToken: "expired-token",
        refreshToken: "revoked-refresh",
      },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return new Response(JSON.stringify({ statusCode: 401, code: "INVALID_REFRESH" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ statusCode: 401, code: "UNAUTHORIZED", message: "Expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiRequest({ method: "GET", path: "/auth/me" })).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(unauthorizedHandler).toHaveBeenCalledTimes(1);
    expect(tokenStore.getAccessToken()).toBeNull();
  });
});

