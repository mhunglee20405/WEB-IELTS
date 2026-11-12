"use client";

import { useState } from "react";
import { BookOpen, Columns2, HelpCircle, Type } from "lucide-react";
import { SafeHtml } from "@/components/ui/safe-html";
import { ExamQuestionGroupRenderer } from "./question-renderer-v2";
import type { ExamAnswerValue, ExamPartPublic } from "@/lib/api/types";
import { isAnsweredValue } from "@/lib/exam/question-meta";
import { cn } from "@/lib/utils/cn";

export interface ReadingExamViewProps {
  parts: ExamPartPublic[];
  activePartId: string;
  onSelectPart: (partId: string) => void;
  answers: Record<string, ExamAnswerValue | undefined>;
  flaggedIds: Set<string>;
  activeQuestionId: string | null;
  disabled?: boolean;
  readOnly?: boolean;
  onAnswerChange: (questionId: string, value: ExamAnswerValue) => void;
  onToggleFlag?: (questionId: string) => void;
}

type SplitRatio = "50/50" | "45/55" | "60/40";
type MobileTab = "passage" | "questions";

const SPLIT_GRID_CLASS: Record<SplitRatio, string> = {
  "50/50": "lg:grid-cols-2",
  "45/55": "lg:grid-cols-[45fr_55fr]",
  "60/40": "lg:grid-cols-[60fr_40fr]",
};

export function ReadingExamView({
  parts,
  activePartId,
  onSelectPart,
  answers,
  flaggedIds,
  activeQuestionId,
  disabled = false,
  readOnly = false,
  onAnswerChange,
  onToggleFlag,
}: ReadingExamViewProps) {
  const [splitRatio, setSplitRatio] = useState<SplitRatio>("50/50");
  const [largeFont, setLargeFont] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("passage");

  const activePart = parts.find((p) => p.id === activePartId) ?? parts[0];
  if (!activePart) return null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-3 px-4 py-4 sm:px-6">
      {/* Passage Tabs & Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <div
          role="tablist"
          aria-label="Danh sách bài đọc"
          className="flex flex-wrap items-center gap-1.5"
        >
          {parts.map((part) => {
            const totalInPart = part.questionGroups.reduce(
              (acc, g) => acc + g.questions.length,
              0,
            );
            const answeredInPart = part.questionGroups.reduce(
              (acc, g) =>
                acc +
                g.questions.filter((q) => isAnsweredValue(answers[q.id])).length,
              0,
            );
            const isSelected = part.id === activePart.id;
            return (
              <button
                key={part.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectPart(part.id)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  isSelected
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                <span>Passage {part.partNumber}</span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                    isSelected
                      ? "bg-blue-800 text-white"
                      : "bg-white text-slate-700",
                  )}
                >
                  {answeredInPart}/{totalInPart}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLargeFont((v) => !v)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Type className="h-3.5 w-3.5" />
            {largeFont ? "Cỡ chữ chuẩn" : "Chữ lớn hơn"}
          </button>

          <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 lg:inline-flex">
            <Columns2 className="ml-1.5 h-3.5 w-3.5 text-slate-500" />
            {(["45/55", "50/50", "60/40"] as const).map((ratio) => (
              <button
                key={ratio}
                type="button"
                onClick={() => setSplitRatio(ratio)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-semibold",
                  splitRatio === ratio
                    ? "bg-white text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Tab Toggle */}
      <div className="grid grid-cols-2 gap-2 lg:hidden" role="tablist" aria-label="Chế độ xem trên di động">
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "passage"}
          onClick={() => setMobileTab("passage")}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold",
            mobileTab === "passage"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-700",
          )}
        >
          <BookOpen className="h-4 w-4" />
          Bài đọc
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "questions"}
          onClick={() => setMobileTab("questions")}
          className={cn(
            "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-semibold",
            mobileTab === "questions"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-700",
          )}
        >
          <HelpCircle className="h-4 w-4" />
          Câu hỏi ({activePart.questionCount})
        </button>
      </div>

      {/* Independent Scrollable Two-Pane Workspace */}
      <div
        className={cn(
          "grid flex-1 gap-4 lg:h-[calc(100vh-14.5rem)] lg:overflow-hidden",
          SPLIT_GRID_CLASS[splitRatio],
        )}
      >
        {/* Left Pane: Passage */}
        <article
          aria-label={activePart.passageTitle ?? activePart.title}
          className={cn(
            "rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:h-full lg:overflow-y-auto",
            mobileTab === "passage" ? "block" : "hidden lg:block",
          )}
        >
          <header className="mb-4 border-b border-slate-100 pb-3">
            <p className="text-xs font-bold tracking-wide text-blue-700 uppercase">
              {activePart.title}
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {activePart.passageTitle ?? activePart.title}
            </h2>
            {activePart.instructions && (
              <p className="mt-1.5 text-xs text-slate-600">{activePart.instructions}</p>
            )}
          </header>

          <div
            className={cn(
              "select-text space-y-4 leading-relaxed text-slate-800",
              largeFont ? "text-base leading-7" : "text-[15px] leading-7",
            )}
          >
            {activePart.paragraphs && activePart.paragraphs.length > 0 ? (
              activePart.paragraphs.map((para) => (
                <div key={para.label} className="flex items-start gap-3">
                  <span className="mt-1 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-slate-100 px-1.5 text-xs font-bold text-slate-700">
                    {para.label}
                  </span>
                  <p className="flex-1">{para.text}</p>
                </div>
              ))
            ) : activePart.passageHtml ? (
              <SafeHtml html={activePart.passageHtml} preset="richText" />
            ) : (
              <p className="text-sm text-slate-500">Chưa có nội dung bài đọc.</p>
            )}
          </div>
        </article>

        {/* Right Pane: Question Groups */}
        <div
          className={cn(
            "space-y-4 lg:h-full lg:overflow-y-auto lg:pr-1",
            mobileTab === "questions" ? "block" : "hidden lg:block",
          )}
        >
          {activePart.questionGroups.map((group) => (
            <ExamQuestionGroupRenderer
              key={group.id}
              group={group}
              answers={answers}
              flaggedIds={flaggedIds}
              disabled={disabled}
              readOnly={readOnly}
              onAnswerChange={onAnswerChange}
              onToggleFlag={onToggleFlag}
              activeQuestionId={activeQuestionId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
