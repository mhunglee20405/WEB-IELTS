import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TeacherNewAssignmentPage from "./page";
import {
  assignmentsApi,
  coursesApi,
  exercisesApi,
  teacherExamTestsApi,
} from "@/lib/api/endpoints";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api/endpoints", () => ({
  coursesApi: { list: vi.fn() },
  exercisesApi: { list: vi.fn() },
  teacherExamTestsApi: { list: vi.fn(), getById: vi.fn() },
  assignmentsApi: { create: vi.fn() },
}));

const mockCourses = [
  { id: "crs-01", code: "IELTS-65", title: "IELTS 6.5 Intensive", status: "active" },
];

const mockExamTests = [
  {
    id: "test-v2-reading",
    title: "Cambridge 18 Reading Test 1",
    skill: "READING",
    status: "PUBLISHED",
    version: 1,
    allowedModes: ["FULL", "PART"],
    totalQuestions: 13,
    partCount: 1,
    parts: [
      {
        id: "part-01",
        partNumber: 1,
        partType: "PASSAGE",
        title: "Urban Microclimates",
        questionCount: 13,
      },
    ],
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TeacherNewAssignmentPage />
    </QueryClientProvider>,
  );
}

describe("TeacherNewAssignmentPage — IELTS v2 Scope & Payload Contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(coursesApi.list).mockResolvedValue({
      items: mockCourses as any,
      total: 1,
      totalPages: 1,
      page: 1,
      limit: 100,
    });
    vi.mocked(exercisesApi.list).mockResolvedValue({
      items: [],
      total: 0,
      totalPages: 0,
      page: 1,
      limit: 100,
    });
    vi.mocked(teacherExamTestsApi.list).mockResolvedValue({
      items: mockExamTests as any,
      total: 1,
      totalPages: 1,
      page: 1,
      limit: 100,
    });
    vi.mocked(teacherExamTestsApi.getById).mockResolvedValue(mockExamTests[0] as any);
  });

  it("renders correctly without 'undefined phần' when selecting an IELTS v2 test", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Cambridge 18 Reading Test 1/i)).toBeInTheDocument();
    });

    const exSelect = screen.getByLabelText(/Chọn đề đã xuất bản/i);
    fireEvent.change(exSelect, { target: { value: "test-v2-reading" } });

    await waitFor(() => {
      expect(
        screen.getByText(/Cấu hình phạm vi đề thi IELTS v2 \(READING\)/i),
      ).toBeInTheDocument();
    });

    // Verify no 'undefined phần'
    expect(screen.queryByText(/undefined phần/i)).toBeNull();
    // Verify badge shows '1 phần · 13 câu'
    expect(screen.getByText(/1 phần · 13 câu/i)).toBeInTheDocument();
    // Verify summary shows 'toàn bộ 1 phần (13 câu)'
    expect(screen.getByText(/toàn bộ 1 phần \(13 câu\)/i)).toBeInTheDocument();
  });

  it("allows selecting a specific PART and submits clean payload to assignmentsApi.create", async () => {
    vi.mocked(assignmentsApi.create).mockResolvedValue({ id: "asg-new-01" } as any);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/IELTS-65 — IELTS 6.5 Intensive/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Chọn khóa học/i), {
      target: { value: "crs-01" },
    });
    fireEvent.change(screen.getByLabelText(/Chọn đề đã xuất bản/i), {
      target: { value: "test-v2-reading" },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("1 Part cụ thể")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("1 Part cụ thể"));

    await waitFor(() => {
      expect(screen.getByLabelText(/Chọn Passage bắt buộc/i)).toBeInTheDocument();
    });

    const partSelect = screen.getByLabelText(/Chọn Passage bắt buộc/i);
    expect(partSelect).toBeInTheDocument();
    expect(screen.getByText(/Passage 1: Urban Microclimates \(13 câu\)/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Xác nhận giao bài/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(assignmentsApi.create).toHaveBeenCalled();
    });

    const payload = vi.mocked(assignmentsApi.create).mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload?.courseId).toBe("crs-01");
    expect(payload?.exerciseId).toBe("test-v2-reading");
    expect(payload?.requiredScope).toBe("PART");
    expect(payload?.requiredPartId).toBe("part-01");
  });
});
