"use client";

import { Headphones } from "lucide-react";
import { ExamListeningPlayer } from "./exam-listening-player";
import { ExamQuestionGroupRenderer } from "./question-renderer-v2";
import type { ExamAnswerValue, ExamPartPublic } from "@/lib/api/types";
import { isAnsweredValue } from "@/lib/exam/question-meta";
import { cn } from "@/lib/utils/cn";

export interface ListeningExamViewProps {
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

export function ListeningExamView({
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
}: ListeningExamViewProps) {
  const activePart = parts.find((p) => p.id === activePartId) ?? parts[0];
  if (!activePart) return null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      {/* Section Tabs */}
      <div
        role="tablist"
        aria-label="Danh sách phần nghe"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
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
              <Headphones className="h-3.5 w-3.5" />
              <span>Section {part.partNumber}</span>
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

      {/* Render each section kept mounted via CSS visibility so audio play count / playback state persists */}
      {parts.map((part) => {
        const isCurrent = part.id === activePart.id;
        return (
          <div
            key={part.id}
            role="tabpanel"
            aria-label={part.title}
            className={isCurrent ? "space-y-4" : "hidden"}
          >
            <ExamListeningPlayer
              sectionTitle={part.title}
              audioAsset={part.audioAsset}
              disabled={disabled || !isCurrent}
            />

            {part.instructions && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-sm text-blue-950">
                {part.instructions}
              </div>
            )}

            <div className="space-y-4">
              {part.questionGroups.map((group) => (
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
        );
      })}
    </div>
  );
}
