"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Flag, Highlighter, Info, RotateCcw, X, ZoomIn } from "lucide-react";
import { SafeHtml } from "@/components/ui/safe-html";
import { ExamListeningPlayer } from "./exam-listening-player";
import type {
  ExamAnswerValue,
  ExamPartPublic,
  ExamQuestionGroupPublic,
  ExamQuestionOption,
  ExamQuestionPublic,
} from "@/lib/api/types";
import {
  COMPLETION_QUESTION_TYPES,
  EXAM_QUESTION_TYPE_LABELS,
  countWords,
  isAnsweredValue,
} from "@/lib/exam/question-meta";
import { isSafeExternalUrl } from "@/lib/sanitize/html";
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

function wrapSelectionInHighlight(container: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    return false;
  }

  // Walk text nodes intersecting the range so wrapping across bold/table elements never fails
  const walker = document.createTreeWalker(
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode ?? container
      : range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
  );

  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (
      node.nodeType === Node.TEXT_NODE &&
      node.textContent &&
      node.textContent.trim().length > 0 &&
      range.intersectsNode(node)
    ) {
      // Skip blank placeholder badges
      const parentEl = node.parentElement;
      if (!parentEl?.closest(".ielts-blank")) {
        textNodes.push(node as Text);
      }
    }
    node = walker.nextNode();
  }

  let wrappedAny = false;
  for (const textNode of textNodes) {
    // Skip if already highlighted
    if (textNode.parentElement?.closest("mark[data-ielts-hl]")) {
      continue;
    }
    const len = textNode.textContent?.length ?? 0;
    const startOffset = textNode === range.startContainer ? range.startOffset : 0;
    const endOffset = textNode === range.endContainer ? range.endOffset : len;
    if (endOffset <= startOffset) continue;

    const subRange = document.createRange();
    subRange.setStart(textNode, startOffset);
    subRange.setEnd(textNode, endOffset);

    const mark = document.createElement("mark");
    mark.setAttribute("data-ielts-hl", "true");
    mark.className =
      "cursor-pointer rounded-xs bg-amber-200/85 px-0.5 text-slate-900 hover:bg-amber-300/90";
    mark.title = "Bấm để xóa highlight";
    try {
      subRange.surroundContents(mark);
      wrappedAny = true;
    } catch {
      // Fallback ignored if browser cannot wrap partial node
    }
  }

  selection.removeAllRanges();
  return wrappedAny;
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
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [highlightInfoOpen, setHighlightInfoOpen] = useState(false);
  const [highlightResetCounter, setHighlightResetCounter] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null);

  const activePart = parts.find((p) => p.id === activePartId) ?? parts[0];

  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImage]);

  // Auto-scroll to selected question from QuestionNavigator
  useEffect(() => {
    if (!activeQuestionId) return;
    const targetElement =
      document.getElementById(`listening-answer-row-${activeQuestionId}`) ??
      document.getElementById(`exam-question-${activeQuestionId}`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeQuestionId]);

  if (!activePart) return null;

  return (
    <div className="flex h-full max-h-full w-full max-w-none min-h-0 flex-1 flex-col overflow-hidden px-3 pt-2.5 pb-2 sm:px-5 lg:px-6">
      {/* Main Large White Card Container — hugs content naturally when short, shrinks + scrolls when tall */}
      <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {/* Top Control Zone (2 Stacked Rows + Full-Width Audio Player Bar) */}
        <div className="shrink-0 space-y-2.5 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          {/* Row 1: Highlight Content Toggle + Info (i) */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex items-center gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={highlightEnabled}
                onClick={() => setHighlightEnabled((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500",
                  highlightEnabled ? "bg-blue-600" : "bg-slate-300",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform",
                    highlightEnabled ? "translate-x-4.5" : "translate-x-1",
                  )}
                />
              </button>

              <span
                onClick={() => setHighlightEnabled((v) => !v)}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-700 select-none"
              >
                <Highlighter
                  className={cn(
                    "h-3.5 w-3.5",
                    highlightEnabled ? "text-amber-600" : "text-slate-500",
                  )}
                />
                Highlight nội dung
              </span>

              <button
                type="button"
                aria-label="Thông tin tính năng Highlight"
                onClick={() => setHighlightInfoOpen((v) => !v)}
                onMouseEnter={() => setHighlightInfoOpen(true)}
                onMouseLeave={() => setHighlightInfoOpen(false)}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <Info className="h-3.5 w-3.5" />
              </button>

              {highlightInfoOpen && (
                <div
                  role="tooltip"
                  className="absolute left-0 top-7 z-40 w-72 rounded-xl border border-slate-200 bg-slate-900 px-3 py-2 text-[11px] leading-relaxed text-white shadow-lg"
                >
                  Khi bật, hãy kéo chọn từ khóa hoặc đoạn văn bản ở đề bài bên trái để tô sáng màu vàng. Bấm vào phần đã tô để gỡ bỏ.
                </div>
              )}

              {highlightEnabled && (
                <button
                  type="button"
                  onClick={() => setHighlightResetCounter((c) => c + 1)}
                  className="ml-1 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  <RotateCcw className="h-3 w-3" />
                  Xóa hết highlight
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Recording Pill Tabs (Recording 1 - Recording 4) */}
          <div
            role="tablist"
            aria-label="Danh sách phần nghe"
            className="flex flex-wrap items-center gap-2"
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
                    "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs transition-all",
                    isSelected
                      ? "bg-blue-50 font-bold text-blue-700 ring-1 ring-blue-300 shadow-2xs"
                      : "bg-slate-100 font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-900",
                  )}
                >
                  <span>Recording {part.partNumber}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "bg-white text-slate-600",
                    )}
                  >
                    {answeredInPart}/{totalInPart}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Full 100% Width Audio Player Bar per Recording (mounted with hidden CSS to preserve state) */}
          {parts.map((part) => {
            const isCurrent = part.id === activePart.id;
            return (
              <div key={`player-${part.id}`} className={isCurrent ? "block" : "hidden"}>
                <ExamListeningPlayer
                  sectionTitle={part.title}
                  audioAsset={part.audioAsset}
                  disabled={disabled || !isCurrent}
                  compact
                />
              </div>
            );
          })}
        </div>

        {/* Scrollable Workspace for Question Groups (keeps audio player stationary above) */}
        {parts.map((part) => {
          const isCurrent = part.id === activePart.id;
          return (
            <div
              key={part.id}
              role="tabpanel"
              aria-label={part.title}
              className={
                isCurrent
                  ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2"
                  : "hidden"
              }
            >
              {part.instructions && (
                <div className="border-b border-blue-100 bg-blue-50/40 px-6 py-2.5 text-xs font-medium text-blue-950">
                  {part.instructions}
                </div>
              )}

              <div className="divide-y divide-slate-200">
                {part.questionGroups.map((group) => (
                  <ListeningSplitGroupBlock
                    key={`${group.id}-${highlightResetCounter}`}
                    group={group}
                    answers={answers}
                    flaggedIds={flaggedIds}
                    activeQuestionId={activeQuestionId}
                    highlightEnabled={highlightEnabled}
                    disabled={disabled}
                    readOnly={readOnly}
                    onAnswerChange={onAnswerChange}
                    onToggleFlag={onToggleFlag}
                    onOpenImage={(img) => setLightboxImage(img)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox phóng to hình ảnh (bản đồ / biểu đồ / sơ đồ IELTS Listening) */}
      {lightboxImage &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Xem phóng to hình ảnh"
            data-testid="listening-image-lightbox"
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative flex max-h-[92vh] max-w-[94vw] flex-col items-center gap-3"
            >
              <button
                type="button"
                aria-label="Đóng xem ảnh"
                onClick={() => setLightboxImage(null)}
                className="absolute -right-2 -top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-slate-900/90 text-white shadow-lg transition-colors hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImage.src}
                alt={lightboxImage.alt}
                className="max-h-[82vh] max-w-[90vw] rounded-xl bg-white object-contain shadow-2xl"
              />

              <div className="flex items-center gap-2 rounded-full bg-slate-900/80 px-4 py-1.5 text-xs text-slate-200 ring-1 ring-white/15">
                <ZoomIn className="h-3.5 w-3.5 text-blue-400" />
                <span>{lightboxImage.alt}</span>
                <span className="text-slate-400">· Bấm ESC hoặc ra ngoài để đóng</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

interface ListeningSplitGroupBlockProps {
  group: ExamQuestionGroupPublic;
  answers: Record<string, ExamAnswerValue | undefined>;
  flaggedIds: Set<string>;
  activeQuestionId: string | null;
  highlightEnabled: boolean;
  disabled: boolean;
  readOnly: boolean;
  onAnswerChange: (questionId: string, value: ExamAnswerValue) => void;
  onToggleFlag?: (questionId: string) => void;
  onOpenImage?: (image: { src: string; alt: string }) => void;
}

function ListeningSplitGroupBlock({
  group,
  answers,
  flaggedIds,
  activeQuestionId,
  highlightEnabled,
  disabled,
  readOnly,
  onAnswerChange,
  onToggleFlag,
  onOpenImage,
}: ListeningSplitGroupBlockProps) {
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const locked = disabled || readOnly;
  const hasRichTemplate = Boolean(group.summaryTemplateHtml && group.summaryTemplateHtml.trim());

  // Fallback gracefully to ExamQuestionGroupRenderer if it's a legacy group without template and non-completion
  const useDualPane = hasRichTemplate || COMPLETION_QUESTION_TYPES.has(group.questionType) || group.questionType === "SHORT_ANSWER";

  if (!useDualPane && !hasRichTemplate) {
    // Still render inside clean 60/40 synchronized split for MCQ / Matching Listening groups
    return (
      <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,60fr)_minmax(0,40fr)]">
        {/* Left 60%: Stimulus, Instructions, Shared Options & Question Prompts */}
        <div
          ref={leftPaneRef}
          onMouseUp={() => {
            if (highlightEnabled && leftPaneRef.current) {
              wrapSelectionInHighlight(leftPaneRef.current);
            }
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const imgEl = target.closest("img");
            if (imgEl instanceof HTMLImageElement && imgEl.src) {
              e.preventDefault();
              onOpenImage?.({
                src: imgEl.currentSrc || imgEl.src,
                alt: imgEl.alt || "Hình ảnh minh họa đề thi IELTS Listening",
              });
              return;
            }
            const mark = target.closest("mark[data-ielts-hl]");
            if (mark && mark.parentNode) {
              const parent = mark.parentNode;
              while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
              parent.removeChild(mark);
            }
          }}
          className={cn(
            "min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 p-5 space-y-4",
            highlightEnabled ? "select-text cursor-text" : "",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {group.title ||
                  (group.questionNumberStart === group.questionNumberEnd
                    ? `Question ${group.questionNumberStart}`
                    : `Questions ${group.questionNumberStart}–${group.questionNumberEnd}`)}
              </h3>
              <SafeHtml
                html={group.instructionHtml}
                preset="richText"
                className="mt-1 text-xs leading-relaxed text-slate-600 [&_p]:mb-1"
              />
            </div>
            <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              {EXAM_QUESTION_TYPE_LABELS[group.questionType]}
            </span>
          </div>

          {group.sharedOptions && group.sharedOptions.length > 0 && (
            <div className="rounded-lg border border-blue-100 bg-white p-3.5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-800">
                Lựa chọn chung
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {group.sharedOptions.map((opt) => (
                  <li key={opt.key} className="flex items-start gap-2 text-xs text-slate-800">
                    <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded bg-blue-50 px-1.5 py-0.5 font-mono font-bold text-blue-700 ring-1 ring-blue-200">
                      {opt.label ?? opt.key}
                    </span>
                    <span>{opt.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {group.diagramImageUrl && isSafeExternalUrl(group.diagramImageUrl) && (
            <figure className="rounded-lg border border-slate-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={group.diagramImageUrl}
                alt={group.title ?? "Sơ đồ bài nghe"}
                className="max-h-72 w-full rounded object-contain"
              />
            </figure>
          )}

          {/* Prompts & option descriptions */}
          <div className="space-y-3">
            {group.questions.map((q) => (
              <div
                key={q.id}
                className="rounded-lg border border-slate-200/80 bg-white p-3.5 text-sm text-slate-800"
              >
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-200 tabular-nums">
                    {q.questionNumber}
                  </span>
                  <div className="flex-1 space-y-1.5">
                    <p className="font-medium leading-relaxed text-slate-900 whitespace-pre-line">
                      {q.prompt}
                    </p>
                    {q.options && q.options.length > 0 && (
                      <ul className="space-y-1 text-xs text-slate-600">
                        {q.options.map((o) => (
                          <li key={o.key}>
                            <strong className="text-slate-800">{o.label ?? o.key}.</strong> {o.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right 40%: Clean White Panel with Answer Rows */}
        <div className="min-w-0 space-y-2.5 bg-white">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Câu trả lời của bạn ({group.questions.length} câu)
          </p>
          {group.questions.map((q) => (
            <ListeningRightAnswerRow
              key={q.id}
              group={group}
              question={q}
              value={answers[q.id]}
              isFlagged={flaggedIds.has(q.id)}
              isHighlighted={activeQuestionId === q.id}
              locked={locked}
              showPromptPreview={false}
              onChange={(val) => onAnswerChange(q.id, val)}
              onToggleFlag={onToggleFlag ? () => onToggleFlag(q.id) : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,60fr)_minmax(0,40fr)]">
      {/* Left Column (~60%): Light Gray Formatted Notes / Tables / Blanks */}
      <div
        ref={leftPaneRef}
        onMouseUp={() => {
          if (highlightEnabled && leftPaneRef.current) {
            wrapSelectionInHighlight(leftPaneRef.current);
          }
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const imgEl = target.closest("img");
          if (imgEl instanceof HTMLImageElement && imgEl.src) {
            e.preventDefault();
            onOpenImage?.({
              src: imgEl.currentSrc || imgEl.src,
              alt: imgEl.alt || "Hình ảnh minh họa đề thi IELTS Listening",
            });
            return;
          }
          // Clicking an existing highlight removes it
          const mark = target.closest("mark[data-ielts-hl]");
          if (mark && mark.parentNode) {
            const parent = mark.parentNode;
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
            parent.removeChild(mark);
            return;
          }
          // Clicking a numbered blank focuses corresponding input in Right Column
          const blankEl = target.closest(".ielts-blank");
          if (blankEl) {
            const numMatch = /\((\d+)\)/.exec(blankEl.textContent || "");
            if (numMatch?.[1]) {
              const targetQ = group.questions.find(
                (q) => String(q.questionNumber) === numMatch[1],
              );
              if (targetQ) {
                const input = document.getElementById(`listening-answer-input-${targetQ.id}`);
                input?.focus();
                input?.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }
          }
        }}
        className={cn(
          "min-w-0 rounded-xl border border-slate-200/80 bg-slate-50/80 p-5 space-y-4",
          highlightEnabled ? "select-text cursor-text" : "",
        )}
      >
        {/* Group Header & Instructions */}
        <div className="border-b border-slate-200/70 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">
              {group.title ||
                (group.questionNumberStart === group.questionNumberEnd
                  ? `Question ${group.questionNumberStart}`
                  : `Questions ${group.questionNumberStart}–${group.questionNumberEnd}`)}
            </h3>
            <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              {EXAM_QUESTION_TYPE_LABELS[group.questionType]}
            </span>
          </div>
          {group.instructionHtml && (
            <SafeHtml
              html={group.instructionHtml}
              preset="richText"
              className="mt-1.5 text-sm font-medium italic text-slate-700 [&_p]:mb-1"
            />
          )}
        </div>

        {/* Rich Text Teacher Formatted Content (headings, bullets, tables, images, (1)_____) */}
        {hasRichTemplate ? (
          <div className="min-w-0 overflow-x-auto overflow-y-hidden">
            <SafeHtml
              html={group.summaryTemplateHtml!}
              preset="richText"
              className="flow-root text-sm leading-relaxed text-slate-800 [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200 [&_img]:transition-opacity [&_img:hover]:opacity-95 [&_p]:mb-2.5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_strong]:font-bold [&_strong]:text-slate-900 [&_table]:w-full [&_table]:border-collapse [&_table]:bg-white [&_td]:border [&_td]:border-slate-300 [&_td]:p-2.5 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2.5 [&_th]:font-bold [&_.ielts-blank]:mx-0.5 [&_.ielts-blank]:inline-block [&_.ielts-blank]:cursor-pointer [&_.ielts-blank]:rounded-md [&_.ielts-blank]:border [&_.ielts-blank]:border-blue-300 [&_.ielts-blank]:bg-blue-50 [&_.ielts-blank]:px-2 [&_.ielts-blank]:py-0.5 [&_.ielts-blank]:font-bold [&_.ielts-blank]:text-blue-700"
            />
          </div>
        ) : (
          /* Legacy fallback when no summaryTemplateHtml: show formatted prompt lines */
          <div className="space-y-2.5">
            {group.questions.map((q) => (
              <div
                key={q.id}
                className="flex items-start gap-2.5 rounded-lg bg-white/80 px-3.5 py-2.5 text-sm text-slate-800 ring-1 ring-slate-200/70"
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-200 tabular-nums">
                  {q.questionNumber}
                </span>
                <p className="flex-1 whitespace-pre-line leading-relaxed">{q.prompt}</p>
              </div>
            ))}
          </div>
        )}

        {group.sharedOptions && group.sharedOptions.length > 0 && (
          <div className="rounded-lg border border-blue-100 bg-white p-3.5">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-800">
              Lựa chọn chung
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {group.sharedOptions.map((opt) => (
                <li key={opt.key} className="flex items-start gap-2 text-xs text-slate-800">
                  <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded bg-blue-50 px-1.5 py-0.5 font-mono font-bold text-blue-700 ring-1 ring-blue-200">
                    {opt.label ?? opt.key}
                  </span>
                  <span>{opt.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {group.diagramImageUrl && isSafeExternalUrl(group.diagramImageUrl) && (
          <figure className="rounded-lg border border-slate-200 bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={group.diagramImageUrl}
              alt={group.title ?? "Sơ đồ bài nghe"}
              className="max-h-72 w-full rounded object-contain"
            />
          </figure>
        )}
      </div>

      {/* Right Column (~40%): White Background Synchronized Answer Inputs */}
      <div className="min-w-0 space-y-3 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Nhập đáp án ({group.questionNumberStart}–{group.questionNumberEnd})
          </span>
          {group.maxWords && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              Tối đa {group.maxWords} từ
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {group.questions.map((q) => (
            <ListeningRightAnswerRow
              key={q.id}
              group={group}
              question={q}
              value={answers[q.id]}
              isFlagged={flaggedIds.has(q.id)}
              isHighlighted={activeQuestionId === q.id}
              locked={locked}
              showPromptPreview={false}
              onChange={(val) => onAnswerChange(q.id, val)}
              onToggleFlag={onToggleFlag ? () => onToggleFlag(q.id) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ListeningRightAnswerRowProps {
  group: ExamQuestionGroupPublic;
  question: ExamQuestionPublic;
  value: ExamAnswerValue | undefined;
  isFlagged: boolean;
  isHighlighted: boolean;
  locked: boolean;
  showPromptPreview: boolean;
  onChange: (value: ExamAnswerValue) => void;
  onToggleFlag?: () => void;
}

function ListeningRightAnswerRow({
  group,
  question,
  value,
  isFlagged,
  isHighlighted,
  locked,
  onChange,
  onToggleFlag,
}: ListeningRightAnswerRowProps) {
  const inputId = useId();
  const qType = question.questionType;
  const effectiveMaxWords = question.maxWords ?? group.maxWords;
  const effectiveMaxSelections = question.maxSelections ?? group.maxSelections ?? 2;

  const matchingOptions =
    question.options && question.options.length > 0
      ? question.options
      : group.sharedOptions ?? [];

  const textValue = typeof value === "string" ? value : "";
  const words = countWords(textValue);
  const exceedsWordLimit = Boolean(effectiveMaxWords && words > effectiveMaxWords);

  return (
    <div
      id={`listening-answer-row-${question.id}`}
      data-testid={`exam-question-${question.questionNumber}`}
      className={cn(
        "rounded-xl border p-2.5 transition-colors",
        isHighlighted
          ? "border-blue-400 bg-blue-50/40 ring-2 ring-blue-100"
          : "border-slate-200/80 bg-white hover:border-slate-300",
      )}
    >
      <div className="flex items-center gap-3">
        {/* Light-blue circular number badge */}
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 tabular-nums"
          aria-label={`Câu số ${question.questionNumber}`}
        >
          {question.questionNumber}
        </span>

        {/* Answer Input Control */}
        <div className="min-w-0 flex-1">
          {qType === "MULTIPLE_CHOICE_SINGLE" && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Câu ${question.questionNumber}`}>
              {(question.options ?? []).map((opt) => {
                const selected = value === opt.key;
                return (
                  <label
                    key={opt.key}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      selected
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      locked && "cursor-not-allowed opacity-70",
                    )}
                  >
                    <input
                      type="radio"
                      name={`mcq-${inputId}`}
                      value={opt.key}
                      checked={selected}
                      disabled={locked}
                      onChange={() => onChange(opt.key)}
                      className="sr-only"
                    />
                    <span>{opt.label ?? opt.key}</span>
                  </label>
                );
              })}
            </div>
          )}

          {qType === "MULTIPLE_CHOICE_MULTIPLE" && (
            <div className="flex flex-wrap gap-1.5">
              {(question.options ?? []).map((opt) => {
                const currentArr = Array.isArray(value) ? value : [];
                const checked = currentArr.includes(opt.key);
                const disableAdd = !checked && currentArr.length >= effectiveMaxSelections;
                return (
                  <label
                    key={opt.key}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                      checked
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      (locked || disableAdd) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked || disableAdd}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...currentArr, opt.key]
                          : currentArr.filter((k) => k !== opt.key);
                        onChange(next);
                      }}
                      className="h-3.5 w-3.5 rounded text-blue-600"
                    />
                    <span>{opt.label ?? opt.key}</span>
                  </label>
                );
              })}
            </div>
          )}

          {(qType === "TRUE_FALSE_NOT_GIVEN" || qType === "YES_NO_NOT_GIVEN") && (
            <div className="flex flex-wrap gap-1.5">
              {(qType === "TRUE_FALSE_NOT_GIVEN" ? TRUE_FALSE_OPTIONS : YES_NO_OPTIONS).map(
                (opt) => {
                  const selected = value === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={locked}
                      onClick={() => onChange(opt.key)}
                      className={cn(
                        "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                        selected
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      {opt.text}
                    </button>
                  );
                },
              )}
            </div>
          )}

          {(qType === "MATCHING_HEADINGS" ||
            qType === "MATCHING_INFORMATION" ||
            qType === "MATCHING_FEATURES" ||
            qType === "MATCHING_SENTENCE_ENDINGS") && (
            <select
              id={`listening-answer-input-${question.id}`}
              disabled={locked}
              value={typeof value === "string" ? value : ""}
              onChange={(e) => onChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
            >
              <option value="">-- Chọn đáp án --</option>
              {matchingOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label ?? opt.key} — {opt.text}
                </option>
              ))}
            </select>
          )}

          {(COMPLETION_QUESTION_TYPES.has(qType) || qType === "SHORT_ANSWER") && (
            <input
              id={`listening-answer-input-${question.id}`}
              type="text"
              disabled={locked}
              value={textValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`Nhập đáp án câu ${question.questionNumber}...`}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "w-full rounded-lg border px-3 py-1.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-hidden focus:ring-2",
                exceedsWordLimit
                  ? "border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-100"
                  : "border-slate-300 bg-white focus:border-blue-500 focus:ring-blue-100",
                locked && "bg-slate-100 text-slate-600",
              )}
            />
          )}
        </div>

        {/* Optional Flag button */}
        {onToggleFlag && !locked && (
          <button
            type="button"
            onClick={onToggleFlag}
            aria-label={
              isFlagged
                ? `Bỏ đánh dấu câu ${question.questionNumber}`
                : `Đánh dấu câu ${question.questionNumber}`
            }
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors",
              isFlagged
                ? "bg-amber-100 text-amber-700"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
            )}
          >
            {isFlagged ? (
              <Flag className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {exceedsWordLimit && (
        <p className="mt-1 pl-10 text-[11px] font-semibold text-rose-700">
          Vượt giới hạn {effectiveMaxWords} từ ({words} từ)
        </p>
      )}
    </div>
  );
}
