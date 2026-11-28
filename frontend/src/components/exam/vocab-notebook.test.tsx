import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentAssignmentWorkspacePage from "@/app/student/assignments/[studentAssignmentId]/page";
import StudentAssignmentReviewPage from "@/app/student/assignments/[studentAssignmentId]/review/page";
import StudentAssignmentTranslationPage from "@/app/student/assignments/[studentAssignmentId]/translation/page";
import StudentExamAttemptPage from "@/app/student/exam/[attemptId]/page";
import StudentVocabNotebookPage from "@/app/student/vocab-notebook/page";
import { assignmentsApi, examAttemptsApi } from "@/lib/api/endpoints";
import { resetMockStore } from "@/lib/api/mocks/router";
import { ReadingExamView } from "./reading-exam-view";
import type { ExamAnswerValue, ExamPartPublic } from "@/lib/api/types";
import { extractContextSentence, splitSentenceByWord } from "@/lib/exam/vocab-context";

let mockParams: Record<string, string> = {};

vi.mock("next/navigation", () => ({
  useParams: () => mockParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    status: "authenticated" as const,
    user: {
      id: "stu-01",
      email: "student@ielts.vn",
      fullName: "Khổng Phú Cường",
      roles: ["student"],
      status: "active" as const,
      timezone: "Asia/Ho_Chi_Minh",
    },
  }),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isMockApiMode: () => true,
  };
});

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const SAMPLE_READING_PARTS: ExamPartPublic[] = [
  {
    id: "part-r1-p1",
    partNumber: 1,
    partType: "PASSAGE",
    title: "Passage 1 — Urban Microclimates",
    passageTitle: "Vertical Farming and Urban Microclimates",
    passageHtml:
      "<p>Modern cities absorb solar radiation far more intensely than surrounding rural landscapes, generating urban heat islands that drive up summer cooling demand. Dr. Smith noted a 2.5 percent drop in surface heat near green facades.</p>",
    questionCount: 1,
    questionNumberRange: { start: 1, end: 1 },
    questionGroups: [
      {
        id: "grp-r-1",
        partId: "part-r1-p1",
        groupNumber: 1,
        title: "Question 1",
        instructionHtml: "<p>Choose TRUE, FALSE or NOT GIVEN.</p>",
        questionType: "TRUE_FALSE_NOT_GIVEN",
        questionNumberStart: 1,
        questionNumberEnd: 1,
        questions: [
          {
            id: "1",
            groupId: "grp-r-1",
            questionNumber: 1,
            prompt: "Urban surfaces absorb less heat than rural fields.",
            questionType: "TRUE_FALSE_NOT_GIVEN",
          },
        ],
      },
    ],
  },
];

describe("Contextual Vocabulary Notebook — Context Extraction, Reading Modes & Student Page", () => {
  beforeEach(() => {
    resetMockStore();
    mockParams = {};
  });
  it("extracts exact sentence containing selected text while preserving decimals and abbreviations", () => {
    const paragraph =
      "Dr. Smith reported a 2.5 percent cooling shift. Meanwhile, urban heat islands intensify summer electricity peaks in dense megacities.";
    const selected = "urban heat islands";
    const offset = paragraph.indexOf(selected);

    const extracted = extractContextSentence(paragraph, selected, offset);
    expect(extracted).toBe(
      "Meanwhile, urban heat islands intensify summer electricity peaks in dense megacities.",
    );

    const segments = splitSentenceByWord(extracted, "urban heat islands");
    expect(segments.some((s) => s.highlight && s.text.toLowerCase() === "urban heat islands")).toBe(
      true,
    );
  });

  it("hides Contextual Vocab Drawer in Exam Mode (enableVocabNotebook=false) and activates it in Review/Practice Mode", async () => {
    function Harness({ enableVocab }: { enableVocab: boolean }) {
      const [answers, setAnswers] = useState<Record<string, ExamAnswerValue | undefined>>({});
      return (
        <ReadingExamView
          parts={SAMPLE_READING_PARTS}
          activePartId="part-r1-p1"
          onSelectPart={vi.fn()}
          answers={answers}
          flaggedIds={new Set()}
          activeQuestionId={null}
          enableVocabNotebook={enableVocab}
          onAnswerChange={(id, v) => setAnswers((p) => ({ ...p, [id]: v }))}
        />
      );
    }

    const { rerender } = renderWithQuery(<Harness enableVocab={false} />);
    expect(screen.getByRole("switch", { name: /Highlight/i })).toBeInTheDocument();
    expect(screen.queryByTestId("reading-vocab-drawer-btn")).not.toBeInTheDocument();

    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Harness enableVocab={true} />
      </QueryClientProvider>,
    );

    const drawerBtn = await screen.findByTestId("reading-vocab-drawer-btn");
    expect(drawerBtn).toBeInTheDocument();

    fireEvent.click(drawerBtn);
    const drawer = await screen.findByTestId("reading-vocab-drawer");
    expect(drawer).toBeInTheDocument();
    expect(
      await within(drawer).findByText(/vi khí hậu \(khí hậu cục bộ trong khu vực nhỏ\)/i),
    ).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: /Lưu tất cả/i })).toBeInTheDocument();
  });

  it("supports listing, toggling status, editing, and deleting vocabulary in /student/vocab-notebook", async () => {
    renderWithQuery(<StudentVocabNotebookPage />);

    // Seeded vocab entry appears
    expect(await screen.findByText(/hiệu ứng đảo nhiệt đô thị/i)).toBeInTheDocument();
    expect(screen.getAllByText("urban heat island").length).toBeGreaterThanOrEqual(1);

    // Quick status toggle: Đang học -> Đã thuộc
    const statusPill = screen.getByTitle(/Bấm để chuyển nhanh trạng thái/i);
    expect(statusPill).toHaveTextContent("Đang học");
    fireEvent.click(statusPill);
    await waitFor(() => {
      expect(screen.getByTitle(/Bấm để chuyển nhanh trạng thái/i)).toHaveTextContent("Đã thuộc");
    });

    // Edit entry modal
    fireEvent.click(screen.getByRole("button", { name: /Sửa urban heat island/i }));
    const editModal = await screen.findByTestId("vocab-notebook-edit-modal");
    expect(editModal).toBeInTheDocument();
    const meaningInput = within(editModal).getByDisplayValue("hiệu ứng đảo nhiệt đô thị");
    fireEvent.change(meaningInput, {
      target: { value: "hiệu ứng đảo nhiệt tại khu vực đô thị" },
    });
    fireEvent.click(within(editModal).getByRole("button", { name: /Lưu thay đổi/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("vocab-notebook-edit-modal")).not.toBeInTheDocument();
      expect(screen.getByText("hiệu ứng đảo nhiệt tại khu vực đô thị")).toBeInTheDocument();
    });

    // Delete confirmation & removal
    fireEvent.click(screen.getByRole("button", { name: /Xóa urban heat island/i }));
    expect(
      await screen.findByText(/Xóa từ "urban heat island" khỏi sổ từ vựng\?/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận xóa/i }));

    await waitFor(() => {
      expect(screen.queryByText("hiệu ứng đảo nhiệt tại khu vực đô thị")).not.toBeInTheDocument();
    });
  });

  it("shows Contextual Vocab Drawer in Reading Assignment workspace, CBT assignment mode, and Review/Translation when not strictExamMode, while hiding during strictExamMode", async () => {
    // 1. Create a standard homework Reading assignment from ExamTest exam-read-full-01 (PART part-r1-p1)
    const todayIso = new Date().toISOString().slice(0, 10);
    await assignmentsApi.create({
      courseId: "crs-01",
      exerciseId: "exam-read-full-01",
      examTestId: "exam-read-full-01",
      title: "Homework Reading Passage 1",
      assignedDate: todayIso,
      openAt: new Date(Date.now() - 60_000).toISOString(),
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      requiredScope: "PART",
      requiredPartId: "part-r1-p1",
      allowRetake: true,
      strictExamMode: false,
    });

    const listRes = await assignmentsApi.listMine({ page: 1, limit: 20 });
    const hwSa = listRes.items.find((i) => i.title === "Homework Reading Passage 1");
    expect(hwSa).toBeDefined();

    // Opening Assignment Workspace shows Sổ từ vựng button & seeded PassageVocab for part-r1-p1
    mockParams = { studentAssignmentId: hwSa!.studentAssignmentId };
    const { unmount: unmountAsg } = renderWithQuery(<StudentAssignmentWorkspacePage />);
    const vocabBtn = await screen.findByTestId("reading-vocab-drawer-btn");
    expect(vocabBtn).toBeInTheDocument();

    fireEvent.click(vocabBtn);
    const drawer = await screen.findByTestId("reading-vocab-drawer");
    expect(
      await within(drawer).findByText(/vi khí hậu \(khí hậu cục bộ trong khu vực nhỏ\)/i),
    ).toBeInTheDocument();
    unmountAsg();

    // Opening CBT Exam Attempt linked to normal homework assignment enables Sổ từ vựng while IN_PROGRESS
    const cbtHwAttempt = await examAttemptsApi.start({
      testId: "exam-read-full-01",
      mode: "PART",
      partId: "part-r1-p1",
      studentAssignmentId: hwSa!.studentAssignmentId,
    });
    mockParams = { attemptId: cbtHwAttempt.attemptId };
    const { unmount: unmountCbtHw } = renderWithQuery(<StudentExamAttemptPage />);
    expect(await screen.findByTestId("reading-vocab-drawer-btn")).toBeInTheDocument();
    unmountCbtHw();

    // 2. Strict timed exam assignment hides Sổ từ vựng during active doing, while Translation screen allows it
    await assignmentsApi.create({
      courseId: "crs-02",
      exerciseId: "exam-read-full-01",
      examTestId: "exam-read-full-01",
      title: "Strict Exam Reading Passage 1",
      assignedDate: todayIso,
      openAt: new Date(Date.now() - 60_000).toISOString(),
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      requiredScope: "PART",
      requiredPartId: "part-r1-p1",
      allowRetake: false,
      strictExamMode: true,
    });
    const listRes2 = await assignmentsApi.listMine({ page: 1, limit: 20 });
    const strictSa = listRes2.items.find((i) => i.title === "Strict Exam Reading Passage 1");
    expect(strictSa).toBeDefined();

    mockParams = { studentAssignmentId: strictSa!.studentAssignmentId };
    const { unmount: unmountStrict } = renderWithQuery(<StudentAssignmentWorkspacePage />);
    expect(await screen.findByText(/Tiến độ trả lời/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reading-vocab-drawer-btn")).not.toBeInTheDocument();
    unmountStrict();

    // 3. Passed assignment review & translation screens show Sổ từ vựng with linked passageId
    mockParams = { studentAssignmentId: "sa-06" };
    const { unmount: unmountRev } = renderWithQuery(<StudentAssignmentReviewPage />);
    expect(await screen.findByTestId("reading-vocab-drawer-btn")).toBeInTheDocument();
    unmountRev();

    const { unmount: unmountTrans } = renderWithQuery(<StudentAssignmentTranslationPage />);
    expect(await screen.findByTestId("reading-vocab-drawer-btn")).toBeInTheDocument();
    unmountTrans();
  });
});
