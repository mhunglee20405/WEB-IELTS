"use client";

import { useId } from "react";
import type { ExerciseQuestionPublic, QuestionOption } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

export interface QuestionRendererProps {
  question: ExerciseQuestionPublic;
  value: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}

const TFNG_DEFAULTS: readonly QuestionOption[] = [
  { id: "TRUE", label: "TRUE", text: "TRUE" },
  { id: "FALSE", label: "FALSE", text: "FALSE" },
  { id: "NOT GIVEN", label: "NOT GIVEN", text: "NOT GIVEN" },
];

const YNNG_DEFAULTS: readonly QuestionOption[] = [
  { id: "YES", label: "YES", text: "YES" },
  { id: "NO", label: "NO", text: "NO" },
  { id: "NOT GIVEN", label: "NOT GIVEN", text: "NOT GIVEN" },
];

function getChoiceOptions(question: ExerciseQuestionPublic): readonly QuestionOption[] {
  if (question.options && question.options.length > 0) {
    return question.options;
  }
  if (question.type === "tfng") return TFNG_DEFAULTS;
  if (question.type === "ynng") return YNNG_DEFAULTS;
  return [];
}

/**
 * Modular IELTS question input renderer covering MCQ, TFNG, YNNG, Matching,
 * Fill-in-the-blank, and Short Answer.
 * Radio options avoid redundant list wrappers per `accessibility` and nest `<input>` inside
 * sized `<label className="lms-choice-label">` (`>= 44x44` hit target) per `form-factor-adaptation`.
 */
export function QuestionRenderer({
  question,
  value,
  disabled = false,
  onChange,
}: QuestionRendererProps) {
  const controlId = useId();
  const groupName = `question-${question.id}-${controlId}`;
  const isAnswered = value.trim().length > 0;

  if (question.type === "mcq" || question.type === "tfng" || question.type === "ynng") {
    const options = getChoiceOptions(question);
    return (
      <fieldset className="lms-card space-y-3" disabled={disabled}>
        <legend className="flex w-full items-start justify-between gap-3 text-sm font-semibold text-slate-900">
          <span>
            <span className="mr-1.5 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
              Câu {question.orderIndex}
            </span>
            {question.prompt}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium",
              isAnswered
                ? "border-blue-200 bg-blue-50 text-blue-900"
                : "border-slate-200 bg-slate-100 text-slate-700",
            )}
          >
            {isAnswered ? "Đã chọn" : `${question.points} điểm`}
          </span>
        </legend>

        <div className="space-y-2">
          {options.map((opt) => {
            const optionValue = opt.id || opt.label;
            const isSelected = value === optionValue;
            return (
              <label key={optionValue} className="lms-choice-label">
                <input
                  type="radio"
                  name={groupName}
                  value={optionValue}
                  checked={isSelected}
                  onChange={() => onChange(optionValue)}
                  className="h-4 w-4 shrink-0 accent-blue-700"
                />
                <span className="text-sm text-slate-900">
                  {question.type === "mcq" && opt.label && opt.text !== opt.label ? (
                    <>
                      <strong className="mr-1.5 font-semibold">{opt.label}.</strong>
                      {opt.text}
                    </>
                  ) : (
                    opt.text || opt.label
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (question.type === "matching" && question.options && question.options.length > 0) {
    return (
      <div className="lms-card space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <label htmlFor={controlId} className="text-sm font-semibold text-slate-900">
            <span className="mr-1.5 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
              Câu {question.orderIndex}
            </span>
            {question.prompt}
          </label>
          <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {question.points} điểm
          </span>
        </div>
        <select
          id={controlId}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="lms-input"
        >
          <option value="">— Chọn đáp án ghép cặp —</option>
          {question.options.map((opt) => {
            const optionValue = opt.id || opt.label;
            return (
              <option key={optionValue} value={optionValue}>
                {opt.label ? `${opt.label}. ${opt.text}` : opt.text}
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  return (
    <div className="lms-card space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={controlId} className="text-sm font-semibold text-slate-900">
          <span className="mr-1.5 inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
            Câu {question.orderIndex}
          </span>
          {question.prompt}
        </label>
        <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
          {question.points} điểm
        </span>
      </div>
      <p id={`${controlId}-hint`} className="text-xs text-slate-600">
        Nhập chính xác từ/cụm từ tiếng Anh theo nội dung bài {question.type === "fill_blank" ? "điền khuyết" : "trả lời ngắn"}.
      </p>
      <input
        id={controlId}
        type="text"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        aria-describedby={`${controlId}-hint`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nhập câu trả lời của bạn..."
        className="lms-input"
      />
    </div>
  );
}
