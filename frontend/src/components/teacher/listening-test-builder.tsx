"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Headphones,
  HelpCircle,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Badge, Button, Card, RichTextEditor } from "@/components/ui";
import { ListeningExamView } from "@/components/exam/listening-exam-view";
import { resolveBackendMediaUrl } from "@/lib/api/client";
import { mediaApi } from "@/lib/api/endpoints/media";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import type {
  ExamAnswerValue,
  ExamPartPublic,
  ExamQuestionType,
} from "@/lib/api/types";
import {
  EXAM_QUESTION_TYPE_LABELS,
  MATCHING_QUESTION_TYPES,
} from "@/lib/exam/question-meta";
import {
  LISTENING_WORD_LIMIT_PRESETS,
  buildBlankSpanHtml,
  generateBlankUid,
  isRichBlankCompletionType,
} from "@/lib/exam/listening-template";
import { cn } from "@/lib/utils/cn";
import {
  computeGroupStartNumbers,
  createEmptyDraftPart,
  createEmptyQuestion,
  parseOptionsFromText,
  syncListeningPartsBlanks,
  type DraftGroup,
  type DraftPart,
} from "./exam-builder-types";

export interface ListeningTestBuilderProps {
  testTitle: string;
  parts: DraftPart[];
  setParts: React.Dispatch<React.SetStateAction<DraftPart[]>>;
  isPublishedLocked: boolean;
  uploadPercent: Record<number, number>;
  previewAudioUrl: Record<number, string>;
  onAudioFileChange: (partIdx: number, file: File | undefined) => void;
  onSetPreviewAudioUrl: (partIdx: number, url: string) => void;
  onError: (msg: string) => void;
  markDirty: () => void;
  savedPreviewHref?: string;
}

const MAX_RECORDINGS = 4;

export function ListeningTestBuilder({
  testTitle,
  parts,
  setParts,
  isPublishedLocked,
  uploadPercent,
  previewAudioUrl,
  onAudioFileChange,
  onSetPreviewAudioUrl,
  onError,
  markDirty,
}: ListeningTestBuilderProps) {
  const [activePartIdx, setActivePartIdx] = useState(0);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewPartId, setPreviewPartId] = useState("preview-part-0");
  const [previewAnswers, setPreviewAnswers] = useState<
    Record<string, ExamAnswerValue | undefined>
  >({});
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(
    () => new Set(),
  );

  // Isolate background AppShell scroll height while Live Preview Modal is open
  useEffect(() => {
    if (!previewModalOpen) return;
    const mainEl = document.getElementById("main-content");
    if (!mainEl) return;
    const prevOverflow = mainEl.style.overflowY;
    mainEl.style.overflowY = "hidden";
    return () => {
      mainEl.style.overflowY = prevOverflow;
    };
  }, [previewModalOpen]);

  const safePartIdx = Math.min(activePartIdx, Math.max(0, parts.length - 1));
  const activePart = parts[safePartIdx];

  const groupStartNumbers = useMemo(() => computeGroupStartNumbers(parts), [parts]);

  const applyPartsUpdate = (updater: (prev: DraftPart[]) => DraftPart[]) => {
    setParts((prev) => syncListeningPartsBlanks(updater(prev)));
    markDirty();
  };

  // Total question count across all recordings
  const totalQuestions = useMemo(
    () =>
      parts.reduce(
        (acc, p) => acc + p.groups.reduce((s, g) => s + g.questions.length, 0),
        0,
      ),
    [parts],
  );

  // Convert live DraftPart[] to ExamPartPublic[] for faithful Student CBT Preview
  const previewStudentParts: ExamPartPublic[] = useMemo(() => {
    let qCursor = 1;
    return parts.map((p, pIdx) => {
      const partId = `preview-part-${pIdx}`;
      const pStart = qCursor;
      const groups = p.groups.map((g, gIdx) => {
        const gStart = qCursor;
        const gId = `preview-grp-${pIdx}-${gIdx}`;
        const questions = g.questions.map((q) => {
          const qNum = qCursor++;
          return {
            id: `preview-q-${qNum}`,
            groupId: gId,
            questionNumber: qNum,
            prompt: q.prompt.trim() || `Câu ${qNum}`,
            questionType: q.questionType,
            maxWords: q.maxWords,
            maxSelections: q.maxSelections,
            options:
              q.optionsText.trim().length > 0
                ? parseOptionsFromText(q.optionsText)
                : undefined,
          };
        });
        const gEnd = questions.length > 0 ? qCursor - 1 : gStart;
        return {
          id: gId,
          partId,
          groupNumber: gIdx + 1,
          title: g.title || undefined,
          instructionHtml: g.instructionHtml || "<p>Complete the questions below.</p>",
          summaryTemplateHtml: g.summaryTemplateHtml || undefined,
          questionType: g.questionType,
          questionNumberStart: gStart,
          questionNumberEnd: gEnd,
          sharedOptions: MATCHING_QUESTION_TYPES.has(g.questionType)
            ? parseOptionsFromText(g.sharedOptionsText)
            : undefined,
          maxWords: g.maxWords,
          maxSelections: g.maxSelections,
          questions,
        };
      });
      const pEnd = qCursor > pStart ? qCursor - 1 : pStart;
      const playbackUrl = previewAudioUrl[pIdx] || p.audioPlaybackUrl;
      return {
        id: partId,
        partNumber: pIdx + 1,
        partType: "SECTION",
        title: p.title || `Recording ${pIdx + 1}`,
        instructions: p.instructions || undefined,
        audioAsset:
          p.audioAssetId.trim() || playbackUrl
            ? {
                assetId: p.audioAssetId.trim() || `preview-audio-${pIdx + 1}`,
                playbackUrl: playbackUrl || undefined,
                durationSeconds: p.durationMinutes * 60,
                allowPause: p.audioAllowPause,
                allowSeek: p.audioAllowSeek,
                maxPlayCount: p.audioMaxPlayCount.trim()
                  ? Number(p.audioMaxPlayCount)
                  : null,
              }
            : undefined,
        durationSeconds: p.durationMinutes * 60,
        questionCount: pEnd - pStart + (groups.some((g) => g.questions.length > 0) ? 1 : 0),
        questionNumberRange: { start: pStart, end: pEnd },
        questionGroups: groups,
      };
    });
  }, [parts, previewAudioUrl]);

  if (!activePart) return null;

  const updateGroup = (
    partIndex: number,
    groupIndex: number,
    updater: (g: DraftGroup) => DraftGroup,
  ) => {
    applyPartsUpdate((prev) =>
      prev.map((p, pi) =>
        pi === partIndex
          ? {
              ...p,
              groups: p.groups.map((g, gi) => (gi === groupIndex ? updater(g) : g)),
            }
          : p,
      ),
    );
  };

  const moveGroup = (partIndex: number, groupIndex: number, delta: -1 | 1) => {
    applyPartsUpdate((prev) =>
      prev.map((p, pi) => {
        if (pi !== partIndex) return p;
        const nextIdx = groupIndex + delta;
        if (nextIdx < 0 || nextIdx >= p.groups.length) return p;
        const copy = [...p.groups];
        const [moved] = copy.splice(groupIndex, 1);
        copy.splice(nextIdx, 0, moved!);
        return { ...p, groups: copy };
      }),
    );
  };

  return (
    <div className="space-y-5">
      {/* Section Header & Recording Pill Tabs + Quick Preview Button */}
      <Card className="space-y-4 border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              2. Cấu trúc đề thi IELTS Listening ({parts.length}/{MAX_RECORDINGS} Recordings · {totalQuestions} câu)
            </h2>
            <p className="text-xs text-slate-600">
              Mỗi Recording quản lý tệp âm thanh riêng và các nhóm câu hỏi 2 cột đồng bộ (60% nội dung / 40% đáp án).
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setPreviewPartId(`preview-part-${safePartIdx}`);
              setPreviewModalOpen(true);
            }}
            data-testid="listening-live-preview-btn"
          >
            <Eye className="h-4 w-4 text-blue-600" />
            Xem trước giao diện học sinh
          </Button>
        </div>

        {/* Recording 1 - 4 Pill Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {parts.map((part, pIdx) => {
            const pStart = groupStartNumbers[pIdx]?.[0] ?? 1;
            const pCount = part.groups.reduce((s, g) => s + g.questions.length, 0);
            const isSelected = pIdx === safePartIdx;
            const hasAudio = Boolean(part.audioAssetId.trim() || previewAudioUrl[pIdx]);

            return (
              <button
                key={pIdx}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setActivePartIdx(pIdx)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all",
                  isSelected
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    hasAudio ? "bg-emerald-400" : "bg-amber-400",
                  )}
                  title={hasAudio ? "Đã gắn audio" : "Chưa có file audio"}
                />
                <span>Recording {pIdx + 1}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    isSelected ? "bg-blue-800 text-white" : "bg-white text-slate-600",
                  )}
                >
                  {pCount > 0 ? `Q${pStart}–${pStart + pCount - 1}` : "0 câu"}
                </span>
              </button>
            );
          })}

          {!isPublishedLocked && parts.length < MAX_RECORDINGS && (
            <button
              type="button"
              onClick={() => {
                const nextIdx = parts.length;
                applyPartsUpdate((prev) => [
                  ...prev,
                  createEmptyDraftPart("LISTENING", prev.length),
                ]);
                setActivePartIdx(nextIdx);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-blue-300 bg-blue-50/60 px-3.5 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm Recording ({parts.length}/{MAX_RECORDINGS})
            </button>
          )}
        </div>
      </Card>

      {/* Active Recording Workspace */}
      <Card className="space-y-6 border-slate-300">
        {/* Recording Header & Delete Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Headphones className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Recording {safePartIdx + 1}: {activePart.title}
              </h3>
              <p className="text-[11px] text-slate-500">
                Cài đặt tên phần nghe, tải file âm thanh riêng và biên soạn các nhóm câu hỏi.
              </p>
            </div>
          </div>

          {!isPublishedLocked && parts.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                applyPartsUpdate((prev) => prev.filter((_, i) => i !== safePartIdx));
                setActivePartIdx(Math.max(0, safePartIdx - 1));
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
              Xóa Recording {safePartIdx + 1}
            </Button>
          )}
        </div>

        {/* Recording Metadata (Title & Duration) */}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Tiêu đề Recording {safePartIdx + 1}
            </label>
            <input
              disabled={isPublishedLocked}
              value={activePart.title}
              placeholder={`Ví dụ: Recording ${safePartIdx + 1} — Accommodation Enquiry`}
              onChange={(e) => {
                const v = e.target.value;
                applyPartsUpdate((prev) =>
                  prev.map((item, i) =>
                    i === safePartIdx ? { ...item, title: v } : item,
                  ),
                );
              }}
              className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Thời lượng riêng (phút)
            </label>
            <input
              type="number"
              min={1}
              max={120}
              disabled={isPublishedLocked}
              value={activePart.durationMinutes}
              onChange={(e) => {
                const v = Number(e.target.value) || 10;
                applyPartsUpdate((prev) =>
                  prev.map((item, i) =>
                    i === safePartIdx ? { ...item, durationMinutes: v } : item,
                  ),
                );
              }}
              className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Dedicated Audio Upload & Live Player Area for this Recording */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Headphones className="h-4 w-4 text-blue-700" />
              Tệp âm thanh Recording {safePartIdx + 1} (Bắt buộc)
            </div>
            {activePart.audioAssetId ? (
              <Badge variant="success">Asset: {activePart.audioAssetId}</Badge>
            ) : (
              <Badge variant="warning">Chưa gắn tệp âm thanh</Badge>
            )}
          </div>

          {!isPublishedLocked && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-blue-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-blue-700 shadow-2xs hover:bg-blue-50">
                <Upload className="h-3.5 w-3.5" />
                Tải tệp audio (MP3/WAV/M4A)
                <input
                  type="file"
                  accept="audio/*"
                  className="sr-only"
                  onChange={(e) =>
                    onAudioFileChange(safePartIdx, e.target.files?.[0])
                  }
                />
              </label>
              <input
                value={activePart.audioAssetId}
                placeholder="Hoặc nhập audioAssetId / đường dẫn /audio/... có sẵn"
                onChange={(e) => {
                  const v = e.target.value;
                  applyPartsUpdate((prev) =>
                    prev.map((item, i) =>
                      i === safePartIdx ? { ...item, audioAssetId: v } : item,
                    ),
                  );
                }}
                className="lms-input flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
              />
            </div>
          )}

          {uploadPercent[safePartIdx] !== undefined &&
            uploadPercent[safePartIdx]! < 100 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-blue-700">
                  <span>Đang tải tệp âm thanh lên máy chủ & Database...</span>
                  <span>{uploadPercent[safePartIdx]}%</span>
                </div>
                <progress
                  className="lms-progress h-2 w-full"
                  value={uploadPercent[safePartIdx]}
                  max={100}
                />
              </div>
            )}

          {previewAudioUrl[safePartIdx] ? (
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-600">
                Nghe thử Recording {safePartIdx + 1}:
              </p>
              <audio
                controls
                src={previewAudioUrl[safePartIdx]}
                className="h-9 w-full"
              />
            </div>
          ) : activePart.audioAssetId.trim() ? (
            <div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void mediaApi
                    .getAudioPlayback(activePart.audioAssetId.trim())
                    .then((res) => {
                      if (res?.streamUrl) {
                        onSetPreviewAudioUrl(
                          safePartIdx,
                          resolveBackendMediaUrl(res.streamUrl),
                        );
                      }
                    })
                    .catch((err) => {
                      onError(getFriendlyErrorMessage(err));
                    });
                }}
              >
                <Headphones className="h-3.5 w-3.5" />
                Nghe thử audio đã lưu
              </Button>
            </div>
          ) : null}

          <div className="grid gap-3 pt-1 text-xs sm:grid-cols-3">
            <label className="inline-flex min-h-9 items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                disabled={isPublishedLocked}
                checked={activePart.audioAllowPause}
                onChange={(e) => {
                  const checked = e.target.checked;
                  applyPartsUpdate((prev) =>
                    prev.map((item, i) =>
                      i === safePartIdx
                        ? { ...item, audioAllowPause: checked }
                        : item,
                    ),
                  );
                }}
              />
              Cho phép tạm dừng
            </label>
            <label className="inline-flex min-h-9 items-center gap-2 text-slate-700">
              <input
                type="checkbox"
                disabled={isPublishedLocked}
                checked={activePart.audioAllowSeek}
                onChange={(e) => {
                  const checked = e.target.checked;
                  applyPartsUpdate((prev) =>
                    prev.map((item, i) =>
                      i === safePartIdx
                        ? { ...item, audioAllowSeek: checked }
                        : item,
                    ),
                  );
                }}
              />
              Cho phép tua thanh tiến độ
            </label>
            <input
              type="number"
              min={1}
              disabled={isPublishedLocked}
              placeholder="Giới hạn lượt nghe (trống = không giới hạn)"
              value={activePart.audioMaxPlayCount}
              onChange={(e) => {
                const v = e.target.value;
                applyPartsUpdate((prev) =>
                  prev.map((item, i) =>
                    i === safePartIdx ? { ...item, audioMaxPlayCount: v } : item,
                  ),
                );
              }}
              className="lms-input rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Transcript / Audio Script (Chỉ giảng viên xem & mở khóa cho học sinh khi đạt ≥ 70%)
            </label>
            <textarea
              rows={2}
              disabled={isPublishedLocked}
              value={activePart.transcript}
              placeholder="Nhập toàn văn lời thoại hội thoại / bài giảng..."
              onChange={(e) => {
                const v = e.target.value;
                applyPartsUpdate((prev) =>
                  prev.map((item, i) =>
                    i === safePartIdx ? { ...item, transcript: v } : item,
                  ),
                );
              }}
              className="lms-input w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
            />
          </div>
        </div>

        {/* Question Groups Stacked Vertically inside Active Recording */}
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900">
              Nhóm câu hỏi trong Recording {safePartIdx + 1} ({activePart.groups.length})
            </h4>
            {!isPublishedLocked && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const uid = generateBlankUid();
                  const nextNum =
                    (groupStartNumbers[safePartIdx]?.[0] ?? 1) +
                    activePart.groups.reduce((s, g) => s + g.questions.length, 0);
                  applyPartsUpdate((prev) =>
                    prev.map((p, i) =>
                      i === safePartIdx
                        ? {
                            ...p,
                            groups: [
                              ...p.groups,
                              {
                                title: `Nhóm câu ${p.groups.length + 1}`,
                                instructionHtml:
                                  "<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p>",
                                summaryTemplateHtml: `<p>Item note: <span class="ielts-blank blank-uid-${uid}">(${nextNum})_____</span></p>`,
                                questionType: "NOTE_COMPLETION",
                                sharedOptionsText: "",
                                maxWords: 1,
                                maxSelections: 2,
                                questions: [
                                  {
                                    ...createEmptyQuestion("NOTE_COMPLETION"),
                                    blankUid: uid,
                                    maxWords: 1,
                                  },
                                ],
                              },
                            ],
                          }
                        : p,
                    ),
                  );
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm nhóm câu hỏi
              </Button>
            )}
          </div>

          {activePart.groups.map((group, groupIdx) => {
            const startNumber = groupStartNumbers[safePartIdx]?.[groupIdx] ?? 1;
            const endNumber =
              group.questions.length > 0
                ? startNumber + group.questions.length - 1
                : startNumber;
            const nextBlankNumber = startNumber + group.questions.length;
            const isRichCompletion = isRichBlankCompletionType(group.questionType);

            return (
              <div
                key={groupIdx}
                className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xs"
              >
                {/* Group Toolbar Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/70 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-bold text-white tabular-nums">
                      {group.questions.length > 0
                        ? startNumber === endNumber
                          ? `Câu ${startNumber}`
                          : `Câu ${startNumber}–${endNumber}`
                        : `Nhóm #${groupIdx + 1}`}
                    </span>

                    <select
                      disabled={isPublishedLocked}
                      value={group.questionType}
                      aria-label="Dạng câu hỏi của nhóm"
                      onChange={(e) => {
                        const nextType = e.target.value as ExamQuestionType;
                        updateGroup(safePartIdx, groupIdx, (g) => ({
                          ...g,
                          questionType: nextType,
                          questions: g.questions.map((q) => ({
                            ...q,
                            questionType: nextType,
                          })),
                        }));
                      }}
                      className="lms-input rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
                    >
                      {(
                        Object.entries(EXAM_QUESTION_TYPE_LABELS) as Array<
                          [ExamQuestionType, string]
                        >
                      ).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>

                    {isRichCompletion && (
                      <select
                        disabled={isPublishedLocked}
                        aria-label="Giới hạn số từ mặc định"
                        value={String(group.maxWords)}
                        onChange={(e) => {
                          const maxW = Number(e.target.value) || 2;
                          updateGroup(safePartIdx, groupIdx, (g) => ({
                            ...g,
                            maxWords: maxW,
                            questions: g.questions.map((q) => ({
                              ...q,
                              maxWords: maxW,
                            })),
                          }));
                        }}
                        className="lms-input rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="1">Giới hạn: 1 từ (ONE WORD)</option>
                        <option value="2">Giới hạn: Tối đa 2 từ / số</option>
                        <option value="3">Giới hạn: Tối đa 3 từ / số</option>
                        <option value="4">Giới hạn: Tối đa 4 từ</option>
                      </select>
                    )}
                  </div>

                  {!isPublishedLocked && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={groupIdx === 0}
                        onClick={() => moveGroup(safePartIdx, groupIdx, -1)}
                        title="Di chuyển nhóm lên"
                        className="rounded p-1.5 text-slate-600 hover:bg-slate-200 disabled:opacity-35"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={groupIdx === activePart.groups.length - 1}
                        onClick={() => moveGroup(safePartIdx, groupIdx, 1)}
                        title="Di chuyển nhóm xuống"
                        className="rounded p-1.5 text-slate-600 hover:bg-slate-200 disabled:opacity-35"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      {activePart.groups.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            applyPartsUpdate((prev) =>
                              prev.map((p, pi) =>
                                pi === safePartIdx
                                  ? {
                                      ...p,
                                      groups: p.groups.filter((_, gi) => gi !== groupIdx),
                                    }
                                  : p,
                              ),
                            );
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          Xóa nhóm
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* 2-Column 60% / 40% Authoring Layout */}
                <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[60fr_40fr]">
                  {/* LEFT COLUMN (~60%): Rich Text Stimulus & Blank Insertion */}
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Tiêu đề nhóm (tuỳ chọn)
                        </label>
                        <input
                          disabled={isPublishedLocked}
                          value={group.title}
                          placeholder="Ví dụ: Questions 1–10"
                          onChange={(e) => {
                            const v = e.target.value;
                            updateGroup(safePartIdx, groupIdx, (g) => ({
                              ...g,
                              title: v,
                            }));
                          }}
                          className="lms-input w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                        />
                      </div>

                      {isRichCompletion && (
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-slate-700">
                            Mẫu hướng dẫn nhanh
                          </label>
                          <select
                            disabled={isPublishedLocked}
                            defaultValue=""
                            onChange={(e) => {
                              const preset = LISTENING_WORD_LIMIT_PRESETS.find(
                                (p) => p.value === e.target.value,
                              );
                              if (!preset) return;
                              updateGroup(safePartIdx, groupIdx, (g) => ({
                                ...g,
                                maxWords: preset.maxWords,
                                instructionHtml: `<p>Complete the notes below. ${preset.hint}</p>`,
                                questions: g.questions.map((q) => ({
                                  ...q,
                                  maxWords: preset.maxWords,
                                })),
                              }));
                            }}
                            className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                          >
                            <option value="">-- Chọn mẫu hướng dẫn IELTS --</option>
                            {LISTENING_WORD_LIMIT_PRESETS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Hướng dẫn làm bài của nhóm
                      </label>
                      <input
                        disabled={isPublishedLocked}
                        value={group.instructionHtml.replace(/<\/?p>/gi, "")}
                        placeholder="Ví dụ: Complete the notes below. Write ONE WORD ONLY for each answer."
                        onChange={(e) => {
                          const v = e.target.value;
                          updateGroup(safePartIdx, groupIdx, (g) => ({
                            ...g,
                            instructionHtml: v ? `<p>${v}</p>` : "",
                          }));
                        }}
                        className="lms-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium italic text-slate-800"
                      />
                    </div>

                    {/* Rich Text Editor for Notes / Tables / Bullet Lists + Insert Blank */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-700">
                          {isRichCompletion
                            ? "Nội dung đề bài & vị trí chỗ trống (TinyMCE hỗ trợ Hình ảnh, Bảng biểu, Danh sách, In đậm)"
                            : "Nội dung ngữ cảnh / Hình ảnh / Bảng thông tin chung (tuỳ chọn)"}
                        </label>
                      </div>

                      <RichTextEditor
                        id={`listening-group-editor-${safePartIdx}-${groupIdx}`}
                        disabled={isPublishedLocked}
                        value={group.summaryTemplateHtml}
                        height={290}
                        placeholder="Nhập nội dung ghi chú, bullet points, chèn bảng (Table) hoặc chèn/dán/kéo thả hình ảnh biểu đồ, đặt con trỏ và bấm 'Chèn chỗ trống'..."
                        insertBlankLabel={
                          isRichCompletion
                            ? `Chèn chỗ trống (${nextBlankNumber})_____`
                            : undefined
                        }
                        onBuildBlankHtml={
                          isRichCompletion
                            ? () => buildBlankSpanHtml(generateBlankUid(), nextBlankNumber)
                            : undefined
                        }
                        onChange={(html) => {
                          updateGroup(safePartIdx, groupIdx, (g) => ({
                            ...g,
                            summaryTemplateHtml: html,
                          }));
                        }}
                      />

                      {group.summaryTemplateHtml.includes("data:image/") && (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
                          Phát hiện ảnh tạm thời (Base64) chưa hoàn tất tải lên máy chủ. Vui lòng đợi tiến trình upload kết thúc hoặc tải lại ảnh qua nút Chèn hình ảnh trên thanh công cụ.
                        </p>
                      )}

                      {isRichCompletion && (
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <HelpCircle className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                          <span>
                            Mẹo: Đặt con trỏ vào dòng văn bản, gạch đầu dòng hoặc ô bảng rồi bấm{" "}
                            <strong>Chèn chỗ trống</strong> (phím tắt <kbd className="rounded bg-slate-200 px-1">Ctrl+Shift+B</kbd>). Hỗ trợ chèn/kéo thả hoặc dán (<kbd className="rounded bg-slate-200 px-1">Ctrl+V</kbd>) ảnh biểu đồ, bản đồ (PNG, JPG, WebP, GIF tối đa 10MB).
                          </span>
                        </p>
                      )}
                    </div>

                    {MATCHING_QUESTION_TYPES.has(group.questionType) && (
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Bảng lựa chọn chung (mỗi dòng `key|nội dung`, ví dụ `A|Ground floor`)
                        </label>
                        <textarea
                          rows={3}
                          disabled={isPublishedLocked}
                          value={group.sharedOptionsText}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateGroup(safePartIdx, groupIdx, (g) => ({
                              ...g,
                              sharedOptionsText: v,
                            }));
                          }}
                          className="lms-input w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* RIGHT COLUMN (~40%): Synchronized Answer Keys */}
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div>
                        <h5 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                          Đáp án đúng đồng bộ ({group.questions.length} câu)
                        </h5>
                        {isRichCompletion && (
                          <p className="text-[11px] text-slate-500">
                            Nhập nhiều đáp án cách nhau bằng dấu <code className="rounded bg-slate-100 px-1 font-bold">/</code> (vd: <code className="rounded bg-slate-100 px-1">grey / gray</code>)
                          </p>
                        )}
                      </div>
                    </div>

                    {group.questions.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
                        {isRichCompletion
                          ? "Chưa có chỗ trống nào trong khung soạn thảo bên trái. Hãy bấm 'Chèn chỗ trống' để tự động tạo ô đáp án tại đây."
                          : "Nhóm chưa có câu hỏi. Bấm '+ Thêm câu hỏi' bên dưới để tạo."}
                      </div>
                    ) : (
                      <div className="max-h-[460px] space-y-2.5 overflow-y-auto pr-1">
                        {group.questions.map((q, qIdx) => {
                          const globalQNum = startNumber + qIdx;
                          const expKey = `${safePartIdx}-${groupIdx}-${qIdx}`;
                          const showExp = expandedExplanations.has(expKey);

                          return (
                            <div
                              key={q.blankUid ?? qIdx}
                              className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/40 p-2.5"
                            >
                              <div className="flex items-center gap-2.5">
                                {/* Circular Blue Badge */}
                                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-xs font-bold text-blue-700 tabular-nums">
                                  {globalQNum}
                                </span>

                                <div className="min-w-0 flex-1 space-y-1.5">
                                  {!isRichCompletion && (
                                    <input
                                      disabled={isPublishedLocked}
                                      value={q.prompt}
                                      placeholder={`Nội dung câu hỏi ${globalQNum}...`}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        updateGroup(safePartIdx, groupIdx, (g) => ({
                                          ...g,
                                          questions: g.questions.map((qq, qi) =>
                                            qi === qIdx ? { ...qq, prompt: v } : qq,
                                          ),
                                        }));
                                      }}
                                      className="lms-input w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                                    />
                                  )}

                                  <input
                                    disabled={isPublishedLocked}
                                    value={q.correctAnswerText}
                                    placeholder={
                                      isRichCompletion
                                        ? `Đáp án câu ${globalQNum} (vd: harbour / harbor)`
                                        : q.questionType === "MULTIPLE_CHOICE_MULTIPLE"
                                          ? "Đáp án đúng (vd: A, B)"
                                          : "Đáp án đúng (vd: A)"
                                    }
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      updateGroup(safePartIdx, groupIdx, (g) => ({
                                        ...g,
                                        questions: g.questions.map((qq, qi) =>
                                          qi === qIdx
                                            ? { ...qq, correctAnswerText: v }
                                            : qq,
                                        ),
                                      }));
                                    }}
                                    className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
                                  />
                                </div>

                                {!isPublishedLocked && !isRichCompletion && group.questions.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateGroup(safePartIdx, groupIdx, (g) => ({
                                        ...g,
                                        questions: g.questions.filter((_, qi) => qi !== qIdx),
                                      }));
                                    }}
                                    className="text-xs font-medium text-rose-600 hover:underline"
                                    title="Xóa câu"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>

                              {(q.questionType === "MULTIPLE_CHOICE_SINGLE" ||
                                q.questionType === "MULTIPLE_CHOICE_MULTIPLE" ||
                                q.questionType === "MATCHING_FEATURES" ||
                                q.questionType === "MATCHING_SENTENCE_ENDINGS") && (
                                <textarea
                                  rows={2}
                                  disabled={isPublishedLocked}
                                  placeholder="Các lựa chọn (mỗi dòng A|Nội dung)"
                                  value={q.optionsText}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    updateGroup(safePartIdx, groupIdx, (g) => ({
                                      ...g,
                                      questions: g.questions.map((qq, qi) =>
                                        qi === qIdx ? { ...qq, optionsText: v } : qq,
                                      ),
                                    }));
                                  }}
                                  className="lms-input w-full rounded-md border border-slate-300 bg-white p-1.5 font-mono text-[11px]"
                                />
                              )}

                              <div className="flex flex-wrap items-center justify-between gap-2 pl-9 text-[11px]">
                                {isRichCompletion && (
                                  <select
                                    disabled={isPublishedLocked}
                                    value={String(q.maxWords)}
                                    onChange={(e) => {
                                      const mw = Number(e.target.value) || 2;
                                      updateGroup(safePartIdx, groupIdx, (g) => ({
                                        ...g,
                                        questions: g.questions.map((qq, qi) =>
                                          qi === qIdx ? { ...qq, maxWords: mw } : qq,
                                        ),
                                      }));
                                    }}
                                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                                  >
                                    <option value="1">Tối đa 1 từ</option>
                                    <option value="2">Tối đa 2 từ / số</option>
                                    <option value="3">Tối đa 3 từ</option>
                                    <option value="4">Tối đa 4 từ</option>
                                  </select>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedExplanations((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(expKey)) next.delete(expKey);
                                      else next.add(expKey);
                                      return next;
                                    })
                                  }
                                  className="text-[11px] font-medium text-blue-600 hover:underline"
                                >
                                  {showExp ? "Ẩn giải thích" : "+ Thêm giải thích"}
                                </button>
                              </div>

                              {showExp && (
                                <div className="pl-9">
                                  <input
                                    disabled={isPublishedLocked}
                                    value={q.explanation}
                                    placeholder="Giải thích đáp án (hiển thị khi review >= 70%)..."
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      updateGroup(safePartIdx, groupIdx, (g) => ({
                                        ...g,
                                        questions: g.questions.map((qq, qi) =>
                                          qi === qIdx ? { ...qq, explanation: v } : qq,
                                        ),
                                      }));
                                    }}
                                    className="lms-input w-full rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!isPublishedLocked && !isRichCompletion && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          updateGroup(safePartIdx, groupIdx, (g) => ({
                            ...g,
                            questions: [
                              ...g.questions,
                              createEmptyQuestion(g.questionType),
                            ],
                          }));
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm câu hỏi vào nhóm
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Interactive Live Student Preview Modal (portaled to document.body to isolate scroll & fixed viewport) */}
      {previewModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Xem trước giao diện làm bài IELTS Listening"
            className="fixed inset-0 z-50 flex h-screen h-dvh max-h-dvh w-screen flex-col overflow-hidden bg-slate-100"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3 shadow-xs">
              <div className="flex items-center gap-3">
                <Badge variant="info">Chế độ Xem trước (Student View)</Badge>
                <h3 className="text-sm font-bold text-slate-900">
                  {testTitle.trim() || "Đề thi IELTS Listening"}
                </h3>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPreviewModalOpen(false)}
              >
                <X className="h-4 w-4" />
                Đóng xem trước
              </Button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 py-2 sm:py-3">
              <ListeningExamView
                parts={previewStudentParts}
                activePartId={previewPartId}
                onSelectPart={setPreviewPartId}
                answers={previewAnswers}
                flaggedIds={new Set()}
                activeQuestionId={null}
                onAnswerChange={(qId, val) =>
                  setPreviewAnswers((prev) => ({ ...prev, [qId]: val }))
                }
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
