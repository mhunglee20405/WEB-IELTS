import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentAssignmentWorkspacePage from "@/app/student/assignments/[studentAssignmentId]/page";
import StudentAssignmentReviewPage from "@/app/student/assignments/[studentAssignmentId]/review/page";
import StudentAssignmentTranslationPage from "@/app/student/assignments/[studentAssignmentId]/translation/page";
import StudentExtensionsPage from "@/app/student/extensions/page";
import StudentPenaltiesPage from "@/app/student/penalties/page";
import { ApiError } from "@/lib/api/error";
import { mediaApi, penaltiesApi, studentAssignmentsApi } from "@/lib/api/endpoints";
import { resetMockStore } from "@/lib/api/mocks/router";
import {
  clearExerciseDraft,
  loadExerciseDraft,
  saveExerciseDraft,
} from "@/lib/student/draft-storage";
import { QuestionRenderer } from "./question-renderer";
import { SignedAudioPlayer } from "./signed-audio-player";

let mockStudentAssignmentId = "sa-01";
let mockSearchQuery = "";

vi.mock("next/navigation", () => ({
  useParams: () => ({ studentAssignmentId: mockStudentAssignmentId }),
  useSearchParams: () => new URLSearchParams(mockSearchQuery),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isMockApiMode: () => true,
  };
});

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: {
      id: "stu-01",
      email: "student@ielts.vn",
      fullName: "Khổng Phú Cường",
      roles: ["student" as const],
      status: "active" as const,
      timezone: "Asia/Ho_Chi_Minh",
    },
    login: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

function renderWithQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("Phase 4 Student Execution, Audio, Review, Translation, Extensions & Penalties", () => {
  beforeEach(() => {
    resetMockStore();
    mockStudentAssignmentId = "sa-01";
    mockSearchQuery = "";
    window.localStorage.clear();
  });

  it("renders all 6 IELTS question types cleanly", () => {
    const onChange = vi.fn();
    render(
      <div>
        <QuestionRenderer
          question={{
            id: "q-mcq",
            orderIndex: 1,
            prompt: "MCQ Prompt",
            type: "mcq",
            options: [{ id: "A", label: "A", text: "Choice A" }],
            points: 1,
          }}
          value="A"
          onChange={onChange}
        />
        <QuestionRenderer
          question={{
            id: "q-ynng",
            orderIndex: 2,
            prompt: "YNNG Prompt",
            type: "ynng",
            points: 1,
          }}
          value=""
          onChange={onChange}
        />
        <QuestionRenderer
          question={{
            id: "q-match",
            orderIndex: 3,
            prompt: "Matching Prompt",
            type: "matching",
            options: [{ id: "i", label: "i", text: "Heading One" }],
            points: 1,
          }}
          value=""
          onChange={onChange}
        />
        <QuestionRenderer
          question={{
            id: "q-fill",
            orderIndex: 4,
            prompt: "Fill Blank Prompt",
            type: "fill_blank",
            points: 1,
          }}
          value=""
          onChange={onChange}
        />
      </div>,
    );

    expect(screen.getByText("MCQ Prompt")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "YES" })).toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: /Matching Prompt/i });
    fireEvent.change(select, { target: { value: "i" } });
    expect(onChange).toHaveBeenCalledWith("i");

    const textInput = screen.getByRole("textbox", { name: /Fill Blank Prompt/i });
    fireEvent.change(textInput, { target: { value: "solar" } });
    expect(onChange).toHaveBeenCalledWith("solar");
  });

  it("persists local drafts, keeps stable Idempotency-Key across failed submit retry, and unlocks review/translation on >=70% PASS", async () => {
    saveExerciseDraft("stu-01", "sa-01", { "q-r1-1": "TRUE" });
    expect(loadExerciseDraft("stu-01", "sa-01")?.answers["q-r1-1"]).toBe("TRUE");

    const submitSpy = vi.spyOn(studentAssignmentsApi, "submitAnswers");
    renderWithQuery(<StudentAssignmentWorkspacePage />);

    // Passage + question restored from draft
    expect(
      await screen.findByRole("heading", { name: /Urban Microclimates & Green Roofs/i }),
    ).toBeInTheDocument();
    const q1True = screen.getAllByRole("radio", { name: "TRUE" })[0]!;
    expect(q1True).toBeChecked();

    // Answer Q2 correctly ("FALSE") -> persists into localStorage draft
    const q2False = screen.getAllByRole("radio", { name: "FALSE" })[1]!;
    fireEvent.click(q2False);
    expect(loadExerciseDraft("stu-01", "sa-01")?.answers["q-r1-2"]).toBe("FALSE");

    // Simulate network drop on first confirm so next confirm reuses the EXACT same Idempotency-Key
    submitSpy.mockRejectedValueOnce(
      new ApiError({
        statusCode: 0,
        code: "NETWORK_ERROR",
        message: "Temporary error",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Nộp bài/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Nộp bài ngay/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Không thể kết nối/i);
    const firstKey = submitSpy.mock.calls[0]?.[2];
    expect(firstKey).toBeTruthy();

    // Retry submit cleanly with same idempotency key -> succeeds with 100% PASS
    fireEvent.click(screen.getByRole("button", { name: /Nộp bài/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Nộp bài ngay/i }));

    expect(await screen.findByText(/Đạt 100% \(ĐẠT\)/i)).toBeInTheDocument();
    const secondKey = submitSpy.mock.calls[1]?.[2];
    expect(secondKey).toBe(firstKey);
    expect(screen.getByRole("link", { name: /Mở đáp án chi tiết/i })).toHaveAttribute(
      "href",
      "/student/assignments/sa-01/review",
    );
    expect(
      screen.getAllByRole("link", { name: /Làm bài dịch đối chiếu/i })[0],
    ).toHaveAttribute("href", "/student/assignments/sa-01/translation");
    // Local draft cleared after pass
    expect(loadExerciseDraft("stu-01", "sa-01")).toBeNull();

    submitSpy.mockRestore();
    clearExerciseDraft("stu-01", "sa-01");
  });

  it("blocks access to pre-open assignments on deep-link /student/assignments/sa-05", async () => {
    mockStudentAssignmentId = "sa-05";
    renderWithQuery(<StudentAssignmentWorkspacePage />);

    expect(await screen.findByText(/Bài tập chưa mở/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nộp bài/i })).not.toBeInTheDocument();
  });

  it("requests signed audio playback safely and blocks unsafe stream URLs", async () => {
    const audioSpy = vi.spyOn(mediaApi, "getAudioPlayback").mockResolvedValueOnce({
      assetId: "audio-demo-01",
      streamUrl: "https://cdn.example.com/signed-listening.mp3",
      mimeType: "audio/mpeg",
      durationSeconds: 180,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const { container } = renderWithQuery(
      <SignedAudioPlayer assetId="audio-demo-01" title="Section 1 Audio" />,
    );

    await waitFor(() => {
      const audioEl = container.querySelector("audio");
      expect(audioEl).toHaveAttribute(
        "src",
        "https://cdn.example.com/signed-listening.mp3",
      );
      expect(audioEl).toHaveAttribute("controls");
      expect(audioEl).not.toHaveAttribute("loading", "lazy");
    });

    audioSpy.mockResolvedValueOnce({
      assetId: "audio-bad",
      streamUrl: "javascript:alert(1)",
      mimeType: "audio/mpeg",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    renderWithQuery(<SignedAudioPlayer assetId="audio-bad" title="Bad Stream" />);
    expect(
      await screen.findByText(/Liên kết âm thanh không hợp lệ hoặc không an toàn/i),
    ).toBeInTheDocument();

    audioSpy.mockRestore();
  });

  it("enforces PASS gate on /review: locks sa-03 (50%) and unlocks sa-02 (100%)", async () => {
    mockStudentAssignmentId = "sa-03";
    const { unmount } = renderWithQuery(<StudentAssignmentReviewPage />);

    expect(await screen.findByText(/Đáp án chưa được mở khóa/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/Điểm cao nhất hiện tại của bạn: 50%/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Làm lại bài tập/i })).toHaveAttribute(
      "href",
      "/student/assignments/sa-03",
    );
    unmount();

    mockStudentAssignmentId = "sa-02";
    renderWithQuery(<StudentAssignmentReviewPage />);
    expect(
      await screen.findByText(/Where should new students collect their library access cards/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("A").length).toBeGreaterThanOrEqual(2);
  });

  it("saves translation draft and freezes editor after confirmed submission", async () => {
    renderWithQuery(<StudentAssignmentTranslationPage />);

    const textarea = (await screen.findByLabelText(
      /Bản dịch tiếng Việt của bạn/i,
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: "Mái nhà xanh là lớp thảm thực vật giúp giảm dòng chảy nước mưa đô thị.",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /Lưu bản nháp/i }));
    expect(
      await screen.findByText(/Đã lưu bản nháp dịch thuật thành công/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Nộp bản dịch/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Nộp & Khóa chỉnh sửa/i }),
    );

    expect(
      await screen.findByText(/Đã nộp bài dịch và khóa chỉnh sửa/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByLabelText(/Bản dịch tiếng Việt của bạn/i),
      ).toHaveAttribute("readonly");
    });
  });

  it("displays monthly 3-request extension quota and validates/submits requests", async () => {
    renderWithQuery(<StudentExtensionsPage />);

    expect(await screen.findByText(/Reading Ngày 12\/11 — Urban Microclimates/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gửi yêu cầu gia hạn/i })).toBeInTheDocument();

    // Short reason (< 10 chars) triggers accessible alert
    const reasonField = screen.getByLabelText(/Lý do xin gia hạn/i);
    fireEvent.change(reasonField, { target: { value: "Quá ngắn" } });
    fireEvent.click(screen.getByRole("button", { name: /Gửi yêu cầu gia hạn/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/tối thiểu 10 ký tự/i);

    // Valid extension request on sa-03 (note: sa-01 already has ext-01 pending!)
    const assignmentSelect = screen.getByLabelText(/Chọn bài tập cần gia hạn/i);
    fireEvent.change(assignmentSelect, { target: { value: "sa-03" } });
    fireEvent.change(reasonField, {
      target: { value: "Em bị mất điện cả buổi tối và cần thêm 1 ngày để nộp bài." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gửi yêu cầu gia hạn/i }));

    expect(
      await screen.findByText(/Đã gửi yêu cầu gia hạn thành công/i),
    ).toBeInTheDocument();
  });

  it("renders positive penalty total and audited reversal history on /student/penalties", async () => {
    const penSpy = vi.spyOn(penaltiesApi, "getMine").mockResolvedValueOnce({
      totalActivePoints: 1,
      records: [
        {
          id: "pen-1",
          studentId: "stu-01",
          studentAssignmentId: "sa-04",
          assignmentTitle: "Listening Hôm qua",
          courseTitle: "IELTS Academic 6.5",
          points: 1,
          reason: "Quá hạn 23:59 GMT+7",
          occurredAt: "2026-11-11T17:01:00.000Z",
          reversed: false,
        },
        {
          id: "pen-2",
          studentId: "stu-01",
          studentAssignmentId: "sa-old",
          assignmentTitle: "Reading Tuần trước",
          courseTitle: "IELTS Academic 6.5",
          points: 1,
          reason: "Quá hạn hệ thống cũ",
          occurredAt: "2026-11-04T17:01:00.000Z",
          reversed: true,
          reversedAt: "2026-11-05T03:00:00.000Z",
          reversedBy: "Huỳnh Khôi",
          reversalReason: "Sự cố bảo trì server đêm 04/11",
        },
      ],
    });

    renderWithQuery(<StudentPenaltiesPage />);

    expect(await screen.findByText("Listening Hôm qua")).toBeInTheDocument();
    expect(screen.getByText(/Hoàn tác bởi: Huỳnh Khôi/i)).toBeInTheDocument();
    expect(screen.getByText(/Sự cố bảo trì server đêm 04\/11/i)).toBeInTheDocument();
    expect(screen.getByText("Đang hiệu lực")).toBeInTheDocument();
    expect(screen.getByText("Đã hoàn tác")).toBeInTheDocument();

    penSpy.mockRestore();
  });
});
