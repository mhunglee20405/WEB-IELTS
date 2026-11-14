"use client";

import { useId } from "react";
import { Flag } from "lucide-react";
import { SafeHtml } from "@/components/ui/safe-html";
import { isSafeExternalUrl } from "@/lib/sanitize/html";
import {
  COMPLETION_QUESTION_TYPES,
  EXAM_QUESTION_TYPE_LABELS,
  MATCHING_QUESTION_TYPES,
  countWords,
} from "@/lib/exam/question-meta";
import type {
  ExamAnswerValue,
  ExamQuestionGroupPublic,
  ExamQuestionOption,
  ExamQuestionPublic,
} from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

export interface ExamQuestionGroupRendererProps {
  group: ExamQuestionGroupPublic;
  answers: Record<string, ExamAnswerValue | undefined>;
  flaggedIds: Set<string>;
  disabled?: boolean;
  readOnly?: boolean;
  onAnswerChange: (questionId: string, value: ExamAnswerValue) => void;
  onToggleFlag?: (questionId: string) => void;
  activeQuestionId?: string | null;
}

const TRUE_FALSE_OPTIONS: ExamQuestionOption[] = [
  { key: "TRUE", text: "TRUE" },
  { key: "FALSE", text: "FALSE" },
  { key: "NOT_GIVEN", text: "NOT GIVEN" },
];

const YES_NO_OPTIONS: ExamQuestionOption[] = [
  { key: "YES", text: "YES" },
  { key: "NO", text: "NO" },
  { key: "NOT_GIVEN", text: "NOT GIVEN" },
];

function resolveMatchingOptions(
  question: ExamQuestionPublic,
  group: ExamQuestionGroupPublic,
): ExamQuestionOption[] {
  if (question.options && question.options.length > 0) {
    return question.options;
  }
  return group.sharedOptions ?? [];
}

function getChoiceKindLabel(question: ExamQuestionPublic): string {
  switch (question.questionType) {
    case "FLOW_CHART_COMPLETION":
      return "Bước lưu đồ";
    case "TABLE_COMPLETION":
      return "Ô bảng thông tin";
    case "DIAGRAM_LABEL_COMPLETION":
      return "Nhãn sơ đồ";
    case "SUMMARY_COMPLETION":
      return "Điền đoạn tóm tắt";
    case "NOTE_COMPLETION":
      return "Ghi chú";
    default:
      return "Câu trả lời";
  }
}

export function ExamQuestionGroupRenderer({
  group,
  answers,
  flaggedIds,
  disabled = false,
  readOnly = false,
  onAnswerChange,
  onToggleFlag,
  activeQuestionId,
}: ExamQuestionGroupRendererProps) {
  const locked = disabled || readOnly;
  const rangeLabel =
    group.questionNumberStart === group.questionNumberEnd
      ? `Câu ${group.questionNumberStart}`
      : `Câu ${group.questionNumberStart}–${group.questionNumberEnd}`;

  return (
    <section
      aria-label={group.title ?? rangeLabel}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
    >
      <header className="mb-4 border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">
            {group.title ? `${group.title} (${rangeLabel})` : rangeLabel}
          </h3>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {EXAM_QUESTION_TYPE_LABELS[group.questionType]}
          </span>
        </div>

        <SafeHtml
          html={group.instructionHtml}
          preset="richText"
          className="mt-2 text-sm leading-relaxed text-slate-700 [&_p]:mb-1.5"
        />

        {group.sharedOptions && group.sharedOptions.length > 0 && (
          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-blue-900 uppercase">
              Danh sách lựa chọn chung
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {group.sharedOptions.map((opt) => (
                <li
                  key={opt.key}
                  className="flex items-start gap-2 text-sm text-slate-800"
                >
                  <span className="inline-flex min-w-6 shrink-0 items-center justify-center rounded bg-white px-1.5 py-0.5 font-mono text-xs font-bold text-blue-700 ring-1 ring-blue-200">
                    {opt.label ?? opt.key}
                  </span>
                  <span>{opt.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {group.summaryTemplateHtml && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            <SafeHtml html={group.summaryTemplateHtml} preset="richText" />
          </div>
        )}

        {group.diagramImageUrl && isSafeExternalUrl(group.diagramImageUrl) && (
          <figure className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={group.diagramImageUrl}
              alt={group.title ? `Sơ đồ ${group.title}` : `Sơ đồ ${rangeLabel}`}
              className="max-h-72 w-full rounded object-contain"
            />
          </figure>
        )}
      </header>

      <div className="space-y-4">
        {group.questions.map((question) => (
          <ExamSingleQuestionItem
            key={question.id}
            group={group}
            question={question}
            value={answers[question.id]}
            isFlagged={flaggedIds.has(question.id)}
            isHighlighted={activeQuestionId === question.id}
            locked={locked}
            onChange={(val) => onAnswerChange(question.id, val)}
            onToggleFlag={onToggleFlag ? () => onToggleFlag(question.id) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

interface ExamSingleQuestionItemProps {
  group: ExamQuestionGroupPublic;
  question: ExamQuestionPublic;
  value: ExamAnswerValue | undefined;
  isFlagged: boolean;
  isHighlighted: boolean;
  locked: boolean;
  onChange: (value: ExamAnswerValue) => void;
  onToggleFlag?: () => void;
}

function ExamSingleQuestionItem({
  group,
  question,
  value,
  isFlagged,
  isHighlighted,
  locked,
  onChange,
  onToggleFlag,
}: ExamSingleQuestionItemProps) {
  const inputId = useId();
  const qType = question.questionType;
  const effectiveMaxWords = question.maxWords ?? group.maxWords;
  const effectiveMaxSelections = question.maxSelections ?? group.maxSelections ?? 2;

  return (
    <div
      id={`exam-question-${question.id}`}
      tabIndex={-1}
      data-testid={`exam-question-${question.questionNumber}`}
      className={cn(
        "rounded-lg border p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
        isHighlighted
          ? "border-blue-500 bg-blue-50/30 ring-1 ring-blue-300"
          : "border-slate-200 bg-slate-50/50",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 px-2 text-xs font-bold text-white"
            aria-label={`Câu số ${question.questionNumber}`}
          >
            {question.questionNumber}
          </span>
          <div className="space-y-1">
            <p className="text-sm leading-relaxed font-medium text-slate-900">
              {question.prompt}
            </p>
            {(question.blankLabel || effectiveMaxWords) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                {question.blankLabel && (
                  <span className="rounded bg-white px-2 py-0.5 ring-1 ring-slate-200">
                    {getChoiceKindLabel(question)}: <strong>{question.blankLabel}</strong>
                  </span>
                )}
                {effectiveMaxWords && COMPLETION_QUESTION_TYPES.has(qType) && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">
                    Tối đa {effectiveMaxWords} từ
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {onToggleFlag && (
          <button
            type="button"
            disabled={locked}
            aria-pressed={isFlagged}
            onClick={onToggleFlag}
            className={cn(
              "inline-flex min-h-10 min-w-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
              isFlagged
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
            title={isFlagged ? "Bỏ đánh dấu xem lại" : "Đánh dấu xem lại"}
          >
            <Flag className={cn("h-3.5 w-3.5", isFlagged && "fill-amber-500 text-amber-600")} />
            <span className="hidden sm:inline">{isFlagged ? "Đã gắn cờ" : "Gắn cờ"}</span>
          </button>
        )}
      </div>

      {/* 1. Multiple Choice Single & True/False/NG & Yes/No/NG */}
      {(qType === "MULTIPLE_CHOICE_SINGLE" ||
        qType === "TRUE_FALSE_NOT_GIVEN" ||
        qType === "YES_NO_NOT_GIVEN") && (
        <fieldset className="space-y-2" disabled={locked}>
          <legend className="sr-only">
            Chọn một đáp án cho câu {question.questionNumber}
          </legend>
          {(qType === "TRUE_FALSE_NOT_GIVEN"
            ? TRUE_FALSE_OPTIONS
            : qType === "YES_NO_NOT_GIVEN"
              ? YES_NO_OPTIONS
              : (question.options ?? [])
          ).map((opt) => {
            const selectedVal = typeof value === "string" ? value : "";
            const isChecked = selectedVal === opt.key;
            return (
              <label
                key={opt.key}
                className={cn(
                  "lms-choice-label flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                  isChecked
                    ? "border-blue-600 bg-blue-50 text-blue-950"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
                  locked && "cursor-not-allowed opacity-80",
                )}
              >
                <input
                  type="radio"
                  name={`q-${question.id}`}
                  value={opt.key}
                  checked={isChecked}
                  disabled={locked}
                  onChange={() => onChange(opt.key)}
                  className="h-4 w-4 accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <span className="font-mono text-xs font-bold text-slate-600">
                  {opt.label ?? opt.key}
                </span>
                {opt.text !== opt.key && (
                  <span className="leading-snug">{opt.text}</span>
                )}
              </label>
            );
          })}
        </fieldset>
      )}

      {/* 2. Multiple Choice Multiple (Checkboxes with array answer) */}
      {qType === "MULTIPLE_CHOICE_MULTIPLE" && (
        <fieldset className="space-y-2" disabled={locked}>
          <legend className="mb-1 text-xs font-medium text-slate-600">
            Chọn {effectiveMaxSelections} đáp án đúng (đã chọn{" "}
            {Array.isArray(value) ? value.length : 0}/{effectiveMaxSelections})
          </legend>
          {(question.options ?? []).map((opt) => {
            const selectedArr = Array.isArray(value) ? value : [];
            const isChecked = selectedArr.includes(opt.key);
            const atLimit = !isChecked && selectedArr.length >= effectiveMaxSelections;
            return (
              <label
                key={opt.key}
                className={cn(
                  "lms-choice-label flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                  isChecked
                    ? "border-blue-600 bg-blue-50 text-blue-950"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
                  (locked || atLimit) && "cursor-not-allowed opacity-75",
                )}
              >
                <input
                  type="checkbox"
                  value={opt.key}
                  checked={isChecked}
                  disabled={locked || atLimit}
                  onChange={() => {
                    const next = isChecked
                      ? selectedArr.filter((k) => k !== opt.key)
                      : [...selectedArr, opt.key].slice(0, effectiveMaxSelections);
                    onChange(next);
                  }}
                  className="h-4 w-4 rounded accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <span className="font-mono text-xs font-bold text-slate-600">
                  {opt.label ?? opt.key}
                </span>
                <span className="leading-snug">{opt.text}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {/* 3. Matching (Headings, Information, Features, Sentence Endings) */}
      {MATCHING_QUESTION_TYPES.has(qType) && (
        <MatchingField
          inputId={inputId}
          question={question}
          options={resolveMatchingOptions(question, group)}
          value={typeof value === "string" ? value : ""}
          locked={locked}
          onChange={onChange}
        />
      )}

      {/* 4. Completion & Short Answer Types */}
      {COMPLETION_QUESTION_TYPES.has(qType) && (
        <CompletionField
          inputId={inputId}
          question={question}
          value={typeof value === "string" ? value : ""}
          maxWords={effectiveMaxWords}
          locked={locked}
          onChange={onChange}
        />
      )}

      {question.note && (
        <p className="mt-2 text-xs text-slate-500">Gợi ý: {question.note}</p>
      )}
    </div>
  );
}

function MatchingField({
  inputId,
  question,
  options,
  value,
  locked,
  onChange,
}: {
  inputId: string;
  question: ExamQuestionPublic;
  options: ExamQuestionOption[];
  value: string;
  locked: boolean;
  onChange: (value: ExamAnswerValue) => void;
}) {
  if (options.length <= 5 && options.length > 0 && question.options && question.options.length > 0) {
    return (
      <fieldset className="space-y-2" disabled={locked}>
        <legend className="sr-only">Chọn đáp án nối cho câu {question.questionNumber}</legend>
        {options.map((opt) => {
          const isChecked = value === opt.key;
          return (
            <label
              key={opt.key}
              className={cn(
                "lms-choice-label flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm transition-colors",
                isChecked
                  ? "border-blue-600 bg-blue-50 text-blue-950"
                  : "border-slate-200 bg-white text-slate-800 hover:border-slate-300",
              )}
            >
              <input
                type="radio"
                name={`match-${question.id}`}
                value={opt.key}
                checked={isChecked}
                disabled={locked}
                onChange={() => onChange(opt.key)}
                className="h-4 w-4 accent-blue-600"
              />
              <span className="font-mono text-xs font-bold text-slate-600">
                {opt.label ?? opt.key}
              </span>
              <span>{opt.text}</span>
            </label>
          );
        })}
      </fieldset>
    );
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-xs font-semibold text-slate-700"
      >
        Chọn đáp án tương ứng (Câu {question.questionNumber})
      </label>
      <select
        id={inputId}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className="lms-input min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
      >
        <option value="">-- Chọn đáp án --</option>
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label ?? opt.key} — {opt.text}
          </option>
        ))}
      </select>
    </div>
  );
}

function CompletionField({
  inputId,
  question,
  value,
  maxWords,
  locked,
  onChange,
}: {
  inputId: string;
  question: ExamQuestionPublic;
  value: string;
  maxWords?: number;
  locked: boolean;
  onChange: (value: ExamAnswerValue) => void;
}) {
  const wordsEntered = countWords(value);
  const exceedsLimit = Boolean(maxWords && wordsEntered > maxWords);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="block text-xs font-semibold text-slate-700"
      >
        Đáp án câu {question.questionNumber}
      </label>
      <input
        id={inputId}
        type="text"
        value={value}
        disabled={locked}
        autoComplete="off"
        spellCheck={false}
        placeholder={
          maxWords
            ? `Nhập tối đa ${maxWords} từ...`
            : "Nhập đáp án của bạn..."
        }
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "lms-input min-h-11 w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900",
          exceedsLimit ? "border-amber-500 ring-1 ring-amber-400" : "border-slate-300",
        )}
      />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Số từ hiện tại: {wordsEntered}</span>
        {exceedsLimit && (
          <span role="status" aria-live="polite" className="font-medium text-amber-700">
            Cảnh báo: Bạn đang nhập vượt quá giới hạn {maxWords} từ.
          </span>
        )}
      </div>
    </div>
  );
}

