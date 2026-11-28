import { describe, expect, it } from "vitest";
import {
  canAccessRoles,
  getDefaultHomeForRole,
  getDefaultHomeForUser,
  getDocumentTitleForPathname,
  getPortalFromPathname,
  sanitizeNextPath,
} from "./roles";

describe("auth role & redirect helpers", () => {
  it("resolves portal homes for single and multi-role users", () => {
    expect(getDefaultHomeForRole("student")).toBe("/student/dashboard");
    expect(getDefaultHomeForRole("teacher")).toBe("/teacher/dashboard");
    expect(getDefaultHomeForRole("admin")).toBe("/admin/users");

    expect(getDefaultHomeForUser(["teacher"])).toBe("/teacher/dashboard");
    expect(getDefaultHomeForUser(["admin", "teacher"])).toBe("/admin/users");
    expect(getDefaultHomeForUser(["admin", "teacher"], "teacher")).toBe("/teacher/dashboard");
    expect(getDefaultHomeForUser(["student"], "admin")).toBe("/student/dashboard");
  });

  it("extracts portal prefix and evaluates RBAC overlap", () => {
    expect(getPortalFromPathname("/student/assignments/sa-01")).toBe("student");
    expect(getPortalFromPathname("/teacher/exercises")).toBe("teacher");
    expect(getPortalFromPathname("/admin/audit")).toBe("admin");
    expect(getPortalFromPathname("/login")).toBeNull();

    expect(canAccessRoles(["student"], ["teacher"])).toBe(false);
    expect(canAccessRoles(["admin", "teacher"], ["teacher"])).toBe(true);
  });

  it("blocks open redirects, auth loops, and cross-portal next paths", () => {
    expect(sanitizeNextPath("https://evil.com/phish", ["student"])).toBeNull();
    expect(sanitizeNextPath("//evil.com", ["student"])).toBeNull();
    expect(sanitizeNextPath("/\\evil.com", ["student"])).toBeNull();
    expect(sanitizeNextPath("/login", ["student"])).toBeNull();
    expect(sanitizeNextPath("/unauthorized", ["student"])).toBeNull();

    // Cross-portal redirect blocked
    expect(sanitizeNextPath("/teacher/exercises", ["student"])).toBeNull();

    // Matching portal preserved with query params
    expect(
      sanitizeNextPath("/student/assignments/sa-01?view=split", ["student"]),
    ).toBe("/student/assignments/sa-01?view=split");
  });

  it("maps static and dynamic portal routes to distinct front-loaded document titles", () => {
    expect(getDocumentTitleForPathname("/student/dashboard")).toContain("Tổng quan học tập");
    expect(getDocumentTitleForPathname("/student/assignments/sa-01")).toContain("Làm bài luyện tập");
    expect(getDocumentTitleForPathname("/student/assignments/sa-01/review")).toContain(
      "Xem đáp án & giải thích",
    );
    expect(getDocumentTitleForPathname("/teacher/exercises/ex-01/edit")).toContain("Biên soạn đề thi");
    expect(getDocumentTitleForPathname("/admin/audit")).toContain("Kiểm toán & Hoàn tác điểm phạt");
  });
});

