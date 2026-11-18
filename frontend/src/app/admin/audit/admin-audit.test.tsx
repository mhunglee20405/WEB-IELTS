import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminAuditPage from "./page";
import { penaltiesApi } from "@/lib/api/endpoints";
import type { PenaltyRecord } from "@/lib/api/types";
import { ApiError } from "@/lib/api/error";

vi.mock("@/lib/api/endpoints", () => ({
  penaltiesApi: {
    list: vi.fn(),
    reverse: vi.fn(),
  },
}));

vi.mock("@/lib/teacher/data-helpers", () => ({
  fetchAllPenaltiesForAudit: vi.fn(),
}));

import { fetchAllPenaltiesForAudit } from "@/lib/teacher/data-helpers";

const mockPenalties: PenaltyRecord[] = [
  {
    id: "pen-01",
    studentId: "student-1",
    studentName: "Nguyen Van A",
    studentAssignmentId: "sa-01",
    assignmentTitle: "IELTS Reading Passage 1",
    courseTitle: "IELTS 6.5 Intensive",
    points: 1,
    reason: "Nộp bài trễ hạn 24 giờ",
    occurredAt: "2026-11-17T10:00:00.000Z",
    reversed: false,
  },
  {
    id: "pen-02",
    studentId: "student-2",
    studentName: "Tran Thi B",
    studentAssignmentId: "sa-02",
    assignmentTitle: "IELTS Listening Section 2",
    courseTitle: "IELTS Foundation",
    points: 1,
    reason: "Quá hạn hiệu lực",
    occurredAt: "2026-11-16T15:30:00.000Z",
    reversed: true,
    reversedAt: "2026-11-17T08:00:00.000Z",
    reversedBy: "Admin Hoang",
    reversalReason: "Học viên có giấy xác nhận điều trị y tế",
  },
];

function renderComponent() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminAuditPage />
    </QueryClientProvider>,
  );
}

describe("AdminAuditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state cleanly without network error when no penalties exist", async () => {
    vi.mocked(fetchAllPenaltiesForAudit).mockResolvedValueOnce([]);

    renderComponent();

    expect(await screen.findByText("Không có bản ghi điểm phạt nào")).toBeInTheDocument();
    expect(
      screen.getByText("Chưa phát sinh điểm phạt hoặc không có mục nào khớp bộ lọc."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Không thể tải dữ liệu")).not.toBeInTheDocument();
    expect(screen.queryByText(/Không thể kết nối đến máy chủ/i)).not.toBeInTheDocument();
  });

  it("renders populated penalties with student names, assignment titles and status badges", async () => {
    vi.mocked(fetchAllPenaltiesForAudit).mockResolvedValueOnce(mockPenalties);

    renderComponent();

    expect(await screen.findByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText("IELTS Reading Passage 1")).toBeInTheDocument();
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
    expect(screen.getByText("IELTS Listening Section 2")).toBeInTheDocument();
    expect(screen.getAllByText("Đang hiệu lực").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Đã hoàn tác").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Admin Hoang")).toBeInTheDocument();
  });

  it("filters penalties by active and reversed tabs", async () => {
    vi.mocked(fetchAllPenaltiesForAudit).mockResolvedValue(mockPenalties);

    renderComponent();

    expect(await screen.findByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();

    // Click "Đang hiệu lực"
    const activeTab = screen.getByRole("tab", { name: "Đang hiệu lực" });
    fireEvent.click(activeTab);

    expect(screen.getByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.queryByText("Tran Thi B")).not.toBeInTheDocument();

    // Click "Đã hoàn tác"
    const reversedTab = screen.getByRole("tab", { name: "Đã hoàn tác" });
    fireEvent.click(reversedTab);

    expect(screen.queryByText("Nguyen Van A")).not.toBeInTheDocument();
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
  });

  it("validates mandatory reversal reason and submits reversal request", async () => {
    vi.mocked(fetchAllPenaltiesForAudit).mockResolvedValue(mockPenalties);
    vi.mocked(penaltiesApi.reverse).mockResolvedValueOnce({
      ...mockPenalties[0],
      reversed: true,
      reversedBy: "Admin",
      reversalReason: "Xác nhận sự cố kỹ thuật phòng thi.",
    } as PenaltyRecord);

    renderComponent();

    expect(await screen.findByText("Nguyen Van A")).toBeInTheDocument();

    // Click "Hoàn tác phạt" on active penalty
    const reverseBtn = screen.getByRole("button", { name: /Hoàn tác phạt/i });
    fireEvent.click(reverseBtn);

    expect(await screen.findByText("Hoàn tác điểm phạt có kiểm toán")).toBeInTheDocument();

    const textarea = screen.getByLabelText(/Lý do hoàn tác bắt buộc/i);
    const submitBtn = screen.getByRole("button", { name: /Xác nhận hoàn tác phạt/i });

    // Try submitting short reason (< 10 chars)
    fireEvent.change(textarea, { target: { value: "Ngắn" } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/tối thiểu 10 ký tự/i)).toBeInTheDocument();
    expect(penaltiesApi.reverse).not.toHaveBeenCalled();

    // Enter valid reason (>= 10 chars)
    fireEvent.change(textarea, {
      target: { value: "Xác nhận sự cố kỹ thuật phòng thi diện rộng." },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(penaltiesApi.reverse).toHaveBeenCalledWith("pen-01", {
        reason: "Xác nhận sự cố kỹ thuật phòng thi diện rộng.",
      });
      expect(screen.getByText(/Đã hoàn tác điểm phạt/i)).toBeInTheDocument();
    });
  });

  it("surfaces friendly error alert when network or server fails", async () => {
    vi.mocked(fetchAllPenaltiesForAudit).mockRejectedValueOnce(
      new ApiError({
        statusCode: 500,
        code: "INTERNAL_ERROR",
        message: "Lỗi máy chủ nội bộ.",
      }),
    );

    renderComponent();

    expect(await screen.findByText("Không thể tải dữ liệu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Thử lại/i })).toBeInTheDocument();
  });
});
