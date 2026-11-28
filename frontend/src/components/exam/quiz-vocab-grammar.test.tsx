import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import StudentPracticeLibraryPage from "@/app/student/practice/page";
import TeacherQuestionBankPage from "@/app/teacher/question-bank/page";
import { QuizExamView } from "./quiz-exam-view";
import { ExamTestBuilder } from "@/components/teacher/exam-test-builder";
import type { ExamAnswerValue, ExamPartPublic } from "@/lib/api/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
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

describe("Vocabulary & Grammar Multiple-Choice Tests (Teacher & Student)", () => {
  it("lists Vocabulary and Grammar tests and filters in Teacher Question Bank", async () => {
    renderWithQuery(<TeacherQuestionBankPage />);

    expect(
      await screen.findByText(/Academic Vocabulary — Environment & Urbanisation/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/IELTS Grammar — Complex Clauses & Inversion/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Grammar" }));
    expect(
      screen.queryByText(/Academic Vocabulary — Environment & Urbanisation/i),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(/IELTS Grammar — Complex Clauses & Inversion/i),
    ).toBeInTheDocument();
  });

  it("switches Teacher ExamTestBuilder into 1-column Vocabulary/Grammar Quiz authoring mode", () => {
    renderWithQuery(<ExamTestBuilder />);

    const skillSelect = screen.getByLabelText(/Kỹ năng \/ Dạng bài IELTS/i);
    fireEvent.change(skillSelect, { target: { value: "VOCABULARY" } });

    expect(
      screen.getByText(/2\. Danh sách câu hỏi Trắc nghiệm/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Thời gian làm bài \(phút, nhập 0 nếu không giới hạn\)/i),
    ).toBeInTheDocument();

    // Add a second question cleanly
    fireEvent.click(screen.getByTestId("quiz-add-question-btn"));
    expect(screen.getByPlaceholderText(/Nhập nội dung câu hỏi số 2/i)).toBeInTheDocument();
    expect(screen.getByTestId("teacher-save-draft-btn")).toBeInTheDocument();
    expect(screen.getByTestId("teacher-publish-exam-btn")).toBeInTheDocument();
  });

  it("displays Vocabulary & Grammar filters in Student Practice Library and 1-column QuizExamView", async () => {
    renderWithQuery(<StudentPracticeLibraryPage />);
    expect(await screen.findByRole("tab", { name: "Vocabulary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Grammar" })).toBeInTheDocument();
    expect(
      await screen.findByText(/Academic Vocabulary — Environment & Urbanisation/i),
    ).toBeInTheDocument();

    const quizParts: ExamPartPublic[] = [
      {
        id: "part-quiz-test",
        partNumber: 1,
        partType: "QUIZ",
        title: "Vocabulary Quiz",
        questionCount: 1,
        questionNumberRange: { start: 1, end: 1 },
        questionGroups: [
          {
            id: "grp-quiz-test",
            partId: "part-quiz-test",
            groupNumber: 1,
            instructionHtml: "",
            questionType: "MULTIPLE_CHOICE_SINGLE",
            questionNumberStart: 1,
            questionNumberEnd: 1,
            questions: [
              {
                id: "1",
                groupId: "grp-quiz-test",
                questionNumber: 1,
                prompt: "Choose the synonym of mitigate.",
                questionType: "MULTIPLE_CHOICE_SINGLE",
                options: [
                  { key: "A", text: "alleviate" },
                  { key: "B", text: "worsen" },
                  { key: "C", text: "ignore" },
                  { key: "D", text: "delay" },
                ],
              },
            ],
          },
        ],
      },
    ];

    function QuizHarness() {
      const [answers, setAnswers] = useState<Record<string, ExamAnswerValue | undefined>>({});
      return (
        <QuizExamView
          skill="VOCABULARY"
          parts={quizParts}
          answers={answers}
          flaggedIds={new Set()}
          activeQuestionId={null}
          onAnswerChange={(id, val) => setAnswers((p) => ({ ...p, [id]: val }))}
        />
      );
    }

    renderWithQuery(<QuizHarness />);
    const optA = screen.getByLabelText(/alleviate/i) as HTMLInputElement;
    expect(optA.checked).toBe(false);
    fireEvent.click(optA);
    expect(optA.checked).toBe(true);
  });
});
