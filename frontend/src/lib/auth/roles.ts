import type { UserRole } from "@/lib/api/types";

export type PortalRole = UserRole;

export interface PortalNavEntry {
  href: string;
  label: string;
}

const ROLE_LABELS_VI: Record<PortalRole, string> = {
  student: "Học viên",
  teacher: "Giảng viên",
  admin: "Quản trị viên",
};

const PORTAL_HOMES: Record<PortalRole, string> = {
  student: "/student/dashboard",
  teacher: "/teacher/dashboard",
  admin: "/admin/users",
};

const PORTAL_NAV_ITEMS: Record<PortalRole, PortalNavEntry[]> = {
  student: [
    { href: "/student/dashboard", label: "Tổng quan" },
    { href: "/student/calendar", label: "Lịch học" },
    { href: "/student/courses", label: "Khóa học" },
    { href: "/student/assignments", label: "Bài tập" },
    { href: "/student/practice", label: "Luyện thi IELTS" },
    { href: "/student/extensions", label: "Xin gia hạn" },
    { href: "/student/penalties", label: "Điểm phạt" },
    { href: "/student/notifications", label: "Thông báo" },
    { href: "/student/profile", label: "Hồ sơ" },
  ],
  teacher: [
    { href: "/teacher/dashboard", label: "Tổng quan" },
    { href: "/teacher/calendar", label: "Lịch dạy" },
    { href: "/teacher/students", label: "Học viên" },
    { href: "/teacher/courses", label: "Khóa học" },
    { href: "/teacher/question-bank", label: "Kho đề thi IELTS" },
    { href: "/teacher/exercises", label: "Ngân hàng đề" },
    { href: "/teacher/assignments", label: "Giao bài tập" },
    { href: "/teacher/extensions", label: "Duyệt gia hạn" },
    { href: "/teacher/translations", label: "Chấm bài dịch" },
  ],
  admin: [
    { href: "/admin/users", label: "Tài khoản" },
    { href: "/admin/courses", label: "Quản lý khóa học" },
    { href: "/admin/audit", label: "Kiểm toán & Phạt" },
    { href: "/admin/settings", label: "Cấu hình hệ thống" },
  ],
};

export function getRoleLabelVi(role: PortalRole): string {
  return ROLE_LABELS_VI[role];
}

export function getDefaultHomeForRole(role: PortalRole): string {
  return PORTAL_HOMES[role];
}

export function getDefaultHomeForUser(
  roles: PortalRole[],
  preferredRole?: PortalRole | null,
): string {
  if (preferredRole && roles.includes(preferredRole)) {
    return PORTAL_HOMES[preferredRole];
  }
  const primary = roles[0] ?? "student";
  return PORTAL_HOMES[primary];
}

export function getPortalNavItems(portal: PortalRole): PortalNavEntry[] {
  return PORTAL_NAV_ITEMS[portal];
}

export function getPortalFromPathname(pathname: string): PortalRole | null {
  if (pathname === "/student" || pathname.startsWith("/student/")) {
    return "student";
  }
  if (pathname === "/teacher" || pathname.startsWith("/teacher/")) {
    return "teacher";
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin";
  }
  return null;
}

export function canAccessRoles(userRoles: PortalRole[], allowedRoles: PortalRole[]): boolean {
  return allowedRoles.some((role) => userRoles.includes(role));
}

/**
 * Validates and sanitizes `?next=` redirect targets against open redirects and mismatched portals.
 */
export function sanitizeNextPath(
  nextParam: string | null | undefined,
  userRoles: PortalRole[],
): string | null {
  if (!nextParam) {
    return null;
  }
  const trimmed = nextParam.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return null;
  }
  if (trimmed === "/login" || trimmed === "/unauthorized") {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed, "http://localhost");
  } catch {
    return null;
  }
  if (parsedUrl.origin !== "http://localhost") {
    return null;
  }

  const targetPortal = getPortalFromPathname(parsedUrl.pathname);
  if (targetPortal && !userRoles.includes(targetPortal)) {
    return null;
  }

  return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
}

const APP_TITLE_SUFFIX = "IELTS Academic LMS";

const EXACT_ROUTE_TITLES: Record<string, string> = {
  "/": "Điều hướng cổng học tập",
  "/login": "Đăng nhập hệ thống",
  "/unauthorized": "Không đủ quyền truy cập",
  "/student/dashboard": "Tổng quan học tập",
  "/student/calendar": "Lịch học trực tuyến",
  "/student/courses": "Khóa học của tôi",
  "/student/assignments": "Bài tập hằng ngày",
  "/student/practice": "Thư viện luyện thi IELTS",
  "/student/extensions": "Xin gia hạn bài tập",
  "/student/penalties": "Điểm phạt quá hạn",
  "/student/notifications": "Thông báo học tập",
  "/student/profile": "Hồ sơ học viên",
  "/teacher/dashboard": "Tổng quan giảng dạy",
  "/teacher/calendar": "Lịch giảng dạy",
  "/teacher/students": "Danh sách học viên",
  "/teacher/courses": "Quản lý khóa học",
  "/teacher/courses/new": "Tạo khóa học mới",
  "/teacher/question-bank": "Kho đề thi IELTS",
  "/teacher/question-bank/new": "Tạo đề Passage / Section mới",
  "/teacher/question-bank/full-test-builder": "Ghép Full Test IELTS",
  "/teacher/exercises": "Ngân hàng đề thi",
  "/teacher/exercises/new": "Tạo đề thi mới",
  "/teacher/assignments": "Quản lý giao bài tập",
  "/teacher/assignments/new": "Giao bài tập mới",
  "/teacher/extensions": "Duyệt yêu cầu gia hạn",
  "/teacher/translations": "Chấm bài dịch đối chiếu",
  "/admin/users": "Quản lý tài khoản",
  "/admin/courses": "Quản lý khóa học toàn hệ thống",
  "/admin/audit": "Kiểm toán & Hoàn tác điểm phạt",
  "/admin/settings": "Cấu hình & Trạng thái hệ thống",
};

/**
 * Resolves a distinct, front-loaded browser `<title>` for every static and dynamic route
 * so SPA navigation updates document titles consistently for tabs and screen readers.
 */
export function getDocumentTitleForPathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const exact = EXACT_ROUTE_TITLES[normalized];
  if (exact) {
    return `${exact} | ${APP_TITLE_SUFFIX}`;
  }

  let matched = "Hệ thống học tập";
  if (/^\/student\/assignments\/[^/]+\/review$/.test(normalized)) {
    matched = "Xem đáp án & giải thích";
  } else if (/^\/student\/assignments\/[^/]+\/translation$/.test(normalized)) {
    matched = "Bài dịch đối chiếu";
  } else if (/^\/student\/assignments\/[^/]+$/.test(normalized)) {
    matched = "Làm bài luyện tập";
  } else if (/^\/student\/practice\/[^/]+$/.test(normalized)) {
    matched = "Chi tiết đề thi & Chọn chế độ";
  } else if (/^\/student\/exam\/[^/]+\/result$/.test(normalized)) {
    matched = "Kết quả thi & Đánh giá";
  } else if (/^\/student\/exam\/[^/]+$/.test(normalized)) {
    matched = "Phòng thi máy tính IELTS";
  } else if (/^\/student\/reading\/[^/]+\/translate\/[^/]+$/.test(normalized)) {
    matched = "Dịch bài đọc theo Passage";
  } else if (/^\/teacher\/courses\/[^/]+\/students$/.test(normalized)) {
    matched = "Học viên trong khóa học";
  } else if (/^\/teacher\/courses\/[^/]+$/.test(normalized)) {
    matched = "Chi tiết & Sửa khóa học";
  } else if (/^\/teacher\/students\/[^/]+$/.test(normalized)) {
    matched = "Hồ sơ học viên phụ trách";
  } else if (/^\/teacher\/question-bank\/[^/]+\/edit$/.test(normalized)) {
    matched = "Biên soạn đề thi IELTS";
  } else if (/^\/teacher\/question-bank\/[^/]+\/preview$/.test(normalized)) {
    matched = "Xem trước đề thi (Góc nhìn học viên)";
  } else if (/^\/teacher\/exercises\/[^/]+\/edit$/.test(normalized)) {
    matched = "Biên soạn đề thi";
  } else if (/^\/teacher\/assignments\/[^/]+\/results$/.test(normalized)) {
    matched = "Kết quả giao bài theo lớp";
  }

  return `${matched} | ${APP_TITLE_SUFFIX}`;
}

