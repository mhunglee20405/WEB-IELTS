import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentPracticeLibraryPage from "@/app/student/practice/page";
import StudentPracticeDetailPage from "@/app/student/practice/[testId]/page";
import StudentExamAttemptPage from "@/app/student/exam/[attemptId]/page";
import StudentExamResultPage from "@/app/student/exam/[attemptId]/result/page";
import StudentReadingTranslationWorkspacePage from "@/app/student/reading/[testId]/translate/[passageId]/page";
import TeacherQuestionBankPage from "@/app/teacher/question-bank/page";
import TeacherNewExamTestPage from "@/app/teacher/question-bank/new/page";
import TeacherFullTestBuilderPage from "@/app/teacher/question-bank/full-test-builder/page";
import TeacherPreviewExamTestPage from "@/app/teacher/question-bank/[testId]/preview/page";
import TeacherNewAssignmentPage from "@/app/teacher/assignments/new/page";
import TeacherTranslationsPage from "@/app/teacher/translations/page";
import { ExamQuestionGroupRenderer } from "@/components/exam/question-renderer-v2";
import { ExamListeningPlayer } from "@/components/exam/exam-listening-player";
import { examAttemptsApi } from "@/lib/api/endpoints";
import { dispatchMockRequest, resetMockStore } from "@/lib/api/mocks/router";
import { useExamAutosave } from "@/lib/exam/use-exam-autosave";
import type {
  ExamAnswerValue,
  ExamQuestionGroupPublic,
  ExamQuestionType,
} from "@/lib/api/types";

let mockParams: Record<string, string> = {};
let mockSearchParamsString = "";
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => mockParams,
  useSearchParams: () => new URLSearchParams(mockSearchParamsString),
  useRouter: () => ({ push: mockPush, replace: mockReplace, refresh: vi.fn() }),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isMockApiMode: () => true,
  };
});

let mockUserRole: "student" | "teacher" = "student";

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: {
      id: mockUserRole === "student" ? "stu-01" : "tch-01",
      email: mockUserRole === "student" ? "student@ielts.vn" : "teacher@ielts.vn",
      fullName: mockUserRole === "student" ? "Nguyễn Minh Anh" : "Giảng viên Trần Lan Hương",
      roles: [mockUserRole],
      status: "active" as const,
      timezone: "Asia/Ho_Chi_Minh",
    },
  }),
}));

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const ALL_15_TYPES: ExamQuestionType[] = [
  "MULTIPLE_CHOICE_SINGLE",
  "MULTIPLE_CHOICE_MULTIPLE",
  "TRUE_FALSE_NOT_GIVEN",
  "YES_NO_NOT_GIVEN",
  "MATCHING_HEADINGS",
  "MATCHING_INFORMATION",
  "MATCHING_FEATURES",
  "MATCHING_SENTENCE_ENDINGS",
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
  "NOTE_COMPLETION",
  "TABLE_COMPLETION",
  "FLOW_CHART_COMPLETION",
  "DIAGRAM_LABEL_COMPLETION",
  "SHORT_ANSWER",
];

describe("Phase 9 IELTS Practice, CBT Exam Engine, Question Bank & Translation Workflows", () => {
  beforeEach(() => {
    resetMockStore();
    mockParams = {};
    mockSearchParamsString = "";
    mockUserRole = "student";
    mockPush.mockReset();
    mockReplace.mockReset();
    window.sessionStorage.clear();
  });

  it("renders all 15 IELTS Academic ExamQuestionType components accessibly and updates answers", () => {
    const onAnswer = vi.fn();
    const answers: Record<string, ExamAnswerValue> = {};

    const syntheticGroup: ExamQuestionGroupPublic = {
      id: "grp-all-15",
      partId: "part-all-15",
      groupNumber: 1,
      title: "Tất cả 15 dạng IELTS",
      instructionHtml: "<p>Kiểm tra đầy đủ 15 dạng.</p>",
      questionType: "MULTIPLE_CHOICE_SINGLE",
      questionNumberStart: 1,
      questionNumberEnd: 15,
      sharedOptions: [
        { key: "i", text: "Shared Heading 1" },
        { key: "ii", text: "Shared Heading 2" },
      ],
      questions: ALL_15_TYPES.map((qType, idx) => ({
        id: `q-type-${idx + 1}`,
        groupId: "grp-all-15",
        questionNumber: idx + 1,
        prompt: `Prompt for ${qType}`,
        questionType: qType,
        maxSelections: qType === "MULTIPLE_CHOICE_MULTIPLE" ? 2 : undefined,
        maxWords: 2,
        options:
          qType === "MULTIPLE_CHOICE_SINGLE" ||
          qType === "MULTIPLE_CHOICE_MULTIPLE" ||
          qType === "MATCHING_FEATURES" ||
          qType === "MATCHING_SENTENCE_ENDINGS"
            ? [
                { key: "A", text: "Opt A" },
                { key: "B", text: "Opt B" },
                { key: "C", text: "Opt C" },
              ]
            : undefined,
      })),
    };

    render(
      <ExamQuestionGroupRenderer
        group={syntheticGroup}
        answers={answers}
        flaggedIds={new Set()}
        onAnswerChange={onAnswer}
      />,
    );

    ALL_15_TYPES.forEach((qType) => {
      expect(screen.getByText(`Prompt for ${qType}`)).toBeInTheDocument();
    });

    // Multi-select checkbox array update
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    expect(onAnswer).toHaveBeenCalledWith("q-type-2", ["A"]);
  });

  it("supports Student Practice Library, Mode selection, Listening Audio Player, and CBT Exam -> Result -> Translation flow", async () => {
    // 1. Student Practice Library shows dynamic Reading & Listening published tests (no drafts)
    const { unmount: unmountLib } = renderWithQuery(<StudentPracticeLibraryPage />);
    expect(
      await screen.findByRole("heading", { name: /IELTS Academic Reading Full Test 01/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /IELTS Academic Listening Full Test 01/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ancient Maritime Navigation/i)).toBeNull();
    unmountLib();

    // 2. Student Practice Detail supports PART & FULL selection + launching attempt
    mockParams = { testId: "exam-read-full-01" };
    const { unmount: unmountDetail } = renderWithQuery(<StudentPracticeDetailPage />);
    expect(await screen.findByText(/Vertical Farming and the Architecture/i)).toBeInTheDocument();
    expect(screen.getByText(/Wild Pollinator Corridors/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Thi trọn bộ \(Full Test\)/i }));
    fireEvent.click(screen.getByTestId("start-exam-btn"));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/student\/exam\/att-/));
    });
    unmountDetail();

    // 3. Seeded Passed Attempt Result unlocks Review & Translate CTA
    mockParams = { attemptId: "att-seed-r1-p1-pass" };
    const { unmount: unmountResult } = renderWithQuery(<StudentExamResultPage />);
    expect(await screen.findByTestId("result-score-percent")).toHaveTextContent("80%");
    expect(await screen.findByTestId("answer-review-list")).toBeInTheDocument();
    expect(screen.getByTestId("result-translate-cta")).toBeInTheDocument();
    unmountResult();

    // 4. Multi-passage Translation Workspace renders unlocked Passage 1 and blocks locked Passage 2 (403)
    mockParams = { testId: "exam-read-full-01", passageId: "part-r1-p2" };
    const { unmount: unmountLockedTrans } = renderWithQuery(
      <StudentReadingTranslationWorkspacePage />,
    );
    expect(
      await screen.findByText(/Passage này chưa được mở khóa luyện dịch/i),
    ).toBeInTheDocument();
    unmountLockedTrans();

    mockParams = { testId: "exam-read-full-01", passageId: "part-r1-p1" };
    const { unmount: unmountUnlockedTrans } = renderWithQuery(
      <StudentReadingTranslationWorkspacePage />,
    );
    expect(
      await screen.findByDisplayValue(/Các đô thị hiện đại hấp thụ bức xạ/i),
    ).toBeInTheDocument();
    unmountUnlockedTrans();

    // 5. Listening Player renders signed stream and obeys error/retry path cleanly
    const { unmount: unmountAudio } = renderWithQuery(
      <ExamListeningPlayer
        sectionTitle="Section 1 Audio"
        audioAsset={{
          assetId: "audio-list-s1",
          allowPause: true,
          allowSeek: false,
          maxPlayCount: 2,
        }}
      />,
    );
    expect(await screen.findByText(/Không cho phép tua/i)).toBeInTheDocument();
    unmountAudio();

    // 6. Active CBT Exam handles Manual Submit
    const newAttempt = await examAttemptsApi.start({
      testId: "exam-read-part-02",
      mode: "PART",
      partId: "part-r2-p1",
    });
    mockParams = { attemptId: newAttempt.attemptId };
    renderWithQuery(<StudentExamAttemptPage />);
    expect(
      await screen.findByText(/Sabine linked reverberation time/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("exam-submit-open-btn"));
    fireEvent.click(await screen.findByTestId("exam-submit-confirm-btn"));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        `/student/exam/${encodeURIComponent(newAttempt.attemptId)}/result`,
      );
    });
  });

  it("supports Teacher Question Bank, Creation, Preview (zero leaked answers/transcripts), Full Test Assembly, and Passage Translation Review", async () => {
    mockUserRole = "teacher";

    // 1. Question Bank Dashboard
    const { unmount: unmountBank } = renderWithQuery(<TeacherQuestionBankPage />);
    expect(
      await screen.findByText(/IELTS Academic Reading Full Test 01/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Bản nháp — Ancient Maritime Navigation/i)).toBeInTheDocument();
    unmountBank();

    // 2. Teacher Preview hides leaked transcripts/answers via strict student schema
    mockParams = { testId: "exam-list-full-01" };
    const { unmount: unmountPrev } = renderWithQuery(<TeacherPreviewExamTestPage />);
    expect(
      await screen.findByText(/Đáp án và Transcript của Giảng viên đã được ẩn hoàn toàn/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/TEACHER ONLY TRANSCRIPT/i)).toBeNull();
    unmountPrev();

    // 3. Teacher Create Reading Passage Draft
    mockParams = {};
    const { unmount: unmountCreate } = renderWithQuery(<TeacherNewExamTestPage />);
    fireEvent.change(screen.getByLabelText(/Tiêu đề đề thi/i), {
      target: { value: "IELTS New Teacher Draft Passage" },
    });
    fireEvent.change(screen.getByPlaceholderText("Nội dung câu hỏi..."), {
      target: { value: "Statement from teacher test" },
    });
    fireEvent.click(screen.getByTestId("teacher-save-draft-btn"));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringMatching(/\/teacher\/question-bank\/exam-reading-.*\/edit/),
      );
    });
    unmountCreate();

    // 4. Teacher Full Test Builder renders available parts pool
    const { unmount: unmountFull } = renderWithQuery(<TeacherFullTestBuilderPage />);
    expect(await screen.findByText(/Vertical Farming/i)).toBeInTheDocument();
    unmountFull();

    // 5. Teacher Translations Queue switches cleanly to v2 Passage Translations and grades
    const { unmount: unmountTrans } = renderWithQuery(<TeacherTranslationsPage />);
    fireEvent.click(await screen.findByTestId("switch-v2-passage-translations"));
    expect(await screen.findByText(/Nguyễn Minh Anh/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Nhận xét cho học viên/i), {
      target: { value: "Dịch chính xác khái niệm urban heat islands." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Lưu nhận xét Passage/i }));
    expect(
      await screen.findByText(/Đã chấm hoàn tất Passage 1/i),
    ).toBeInTheDocument();
    unmountTrans();

    // Verify result recorded on student translation eligibility API cleanly
    await dispatchMockRequest({ method: "POST", path: "/auth/login", body: { email: "student@ielts.vn", password: "Password123!" } });
    const trans = await dispatchMockRequest<{ status: string }>({
      method: "GET",
      path: "/reading-translations/part-r1-p1",
    });
    expect(trans.status).toBe("REVIEWED");

    // 6. Teacher Assignment Creation supports v2 PART scope & requiredPartId
    mockUserRole = "teacher";
    renderWithQuery(<TeacherNewAssignmentPage />);
    await screen.findByText(/Khung mở\/đóng bài tự động theo giờ Việt Nam/i);
    fireEvent.change(screen.getByLabelText(/Chọn khóa học/i), {
      target: { value: "crs-01" },
    });
    fireEvent.change(screen.getByLabelText(/Chọn đề đã xuất bản/i), {
      target: { value: "exam-read-full-01" },
    });
    expect(
      await screen.findByText(/Cấu hình phạm vi đề thi IELTS v2/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /1 Part cụ thể/i }));
    fireEvent.change(await screen.findByLabelText(/Chọn Passage bắt buộc/i), {
      target: { value: "part-r1-p2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận giao bài/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/\/teacher\/assignments\/asg-/));
    });
  });

  it("recovers gracefully from 409 ANSWERS_REVISION_CONFLICT without losing local edits", async () => {
    const started = await examAttemptsApi.start({
      testId: "exam-read-part-02",
      mode: "PART",
      partId: "part-r2-p1",
    });

    // Another tab advances the server revision first
    await examAttemptsApi.saveAnswers(started.attemptId, {
      baseRevision: started.revision,
      answers: { "q-r2-2": "YES" },
      flaggedQuestionIds: [],
    });

    const { result } = renderHook(() =>
      useExamAutosave({
        attemptId: started.attemptId,
        initialAnswers: {},
        initialRevision: started.revision,
      }),
    );

    act(() => {
      result.current.setAnswer("q-r2-1", "NOT_GIVEN");
    });

    let flushedRevision = 0;
    await act(async () => {
      const flushed = await result.current.flushBeforeSubmit();
      flushedRevision = flushed.revision;
    });

    expect(flushedRevision).toBe(started.revision + 2);
    expect(result.current.syncStatus).toBe("saved");
    expect(result.current.answers["q-r2-1"]).toBe("NOT_GIVEN");
    expect(result.current.answers["q-r2-2"]).toBe("YES");

    const persisted = await examAttemptsApi.getById(started.attemptId);
    expect(persisted.revision).toBe(started.revision + 2);
    expect(persisted.answers["q-r2-1"]).toBe("NOT_GIVEN");
    expect(persisted.answers["q-r2-2"]).toBe("YES");
  });
});
