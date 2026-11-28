"use client";

import { Flag } from "lucide-react";
import type { ExamAnswerValue, ExamPartPublic, ExamSkill } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

export interface QuizExamViewProps {
  skill: ExamSkill;
  parts: ExamPartPublic[];
  answers: Record<string, ExamAnswerValue | undefined>;
  flaggedIds: Set<string>;
  activeQuestionId: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  onAnswerChange: (questionId: string, value: ExamAnswerValue) => void;
  onToggleFlag?: (questionId: string) => void;
}

export function QuizExamView({
  skill,
  parts,
  answers,
  flaggedIds,
  activeQuestionId,
  disabled = false,
  readOnly = false,
  onAnswerChange,
  onToggleFlag,
}: QuizExamViewProps) {
  const locked = disabled || readOnly;
  const flatQuestions = parts.flatMap((part) =>
    part.questionGroups.flatMap((group) => group.questions),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-10">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-2xs">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">
            {skill === "VOCABULARY" ? "IELTS Vocabulary Practice" : "IELTS Grammar Practice"}
          </p>
          <p className="mt-0.5 text-sm text-slate-600">
            Chọn một đáp án đúng nhất cho mỗi câu hỏi trắc nghiệm bên dưới ({flatQuestions.length} câu).
          </p>
        </div>

        {flatQuestions.map((q) => {
          const selectedValue = typeof answers[q.id] === "string" ? (answers[q.id] as string) : "";
          const isFlagged = flaggedIds.has(q.id);
          const isActive = activeQuestionId === q.id;
          const options = q.options ?? [];

          return (
            <section
              key={q.id}
              id={`exam-question-${q.id}`}
              tabIndex={-1}
              className={cn(
                "scroll-mt-24 rounded-2xl border bg-white p-5 shadow-2xs transition-colors focus:outline-hidden",
                isActive ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-2 text-xs font-bold text-white tabular-nums">
                    {q.questionNumber}
                  </span>
                  <p className="whitespace-pre-line text-sm sm:text-[15px] font-semibold leading-relaxed text-slate-900">
                    {q.prompt}
                  </p>
                </div>

                {onToggleFlag && (
                  <button
                    type="button"
                    disabled={locked}
                    aria-label={`Gắn cờ câu ${q.questionNumber}`}
                    onClick={() => onToggleFlag(q.id)}
                    className={cn(
                      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      isFlagged
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600",
                    )}
                  >
                    <Flag className={cn("h-3.5 w-3.5", isFlagged && "fill-current")} />
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-2" role="radiogroup" aria-label={`Câu ${q.questionNumber}`}>
                {options.map((opt) => {
                  const isChecked = selectedValue === opt.key;
                  return (
                    <label
                      key={opt.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
                        locked && "cursor-not-allowed opacity-75",
                        isChecked
                          ? "border-blue-600 bg-blue-50/70 text-slate-950 ring-1 ring-blue-500/30"
                          : "border-slate-200 bg-slate-50/40 text-slate-800 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`quiz-q-${q.id}`}
                        value={opt.key}
                        disabled={locked}
                        checked={isChecked}
                        onChange={() => onAnswerChange(q.id, opt.key)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                      />
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold",
                          isChecked
                            ? "bg-blue-600 text-white"
                            : "bg-white text-slate-700 ring-1 ring-slate-200",
                        )}
                      >
                        {opt.key}
                      </span>
                      <span className="flex-1 leading-relaxed">{opt.text}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
