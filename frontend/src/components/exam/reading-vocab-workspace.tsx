"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, BookMarked, BookmarkCheck, BookmarkPlus, Check, ExternalLink, Layers, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button, Card, ConfirmDialog, SafeHtml } from "@/components/ui";
import { vocabularyApi } from "@/lib/api/endpoints/vocabulary";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { vocabKeys } from "@/lib/api/query-keys";
import type {
  PassageVocabItem,
  UserVocabNotebookEntry,
  VocabPartOfSpeech,
  VocabReviewStatus,
} from "@/lib/api/types";
import {
  VOCAB_POS_OPTIONS,
  VOCAB_STATUS_LABELS,
  extractContextSentence,
  splitSentenceByWord,
} from "@/lib/exam/vocab-context";
import { cn } from "@/lib/utils/cn";

export interface SelectedVocabCandidate {
  word: string;
  contextSentence: string;
  rect: { top: number; left: number };
}

/**
 * Shared selection detector for Reading passages. When enabled, captures non-empty
 * text selections inside `containerRef`, computes exact sentence context, and exposes
 * coordinates for rendering a floating "Lưu vào sổ từ" popover.
 */
export function usePassageSelectionCapture(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [candidate, setCandidate] = useState<SelectedVocabCandidate | null>(null);

  const captureSelection = useCallback(() => {
    if (!enabled || typeof window === "undefined") {
      setCandidate(null);
      return;
    }

    const container = containerRef.current;
    const selection = window.getSelection();
    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setCandidate(null);
      return;
    }

    const rawText = selection.toString().replace(/\s+/g, " ").trim();
    if (!rawText || rawText.length > 140) {
      setCandidate(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      setCandidate(null);
      return;
    }

    const startNode =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as HTMLElement | null);
    const blockEl = startNode?.closest("p, li, td, blockquote, div") ?? container;
    const blockText = blockEl.textContent ?? "";

    let offsetStart = 0;
    try {
      const prefixRange = document.createRange();
      prefixRange.setStart(blockEl, 0);
      prefixRange.setEnd(range.startContainer, range.startOffset);
      offsetStart = prefixRange.toString().length;
    } catch {
      offsetStart = Math.max(0, blockText.toLowerCase().indexOf(rawText.toLowerCase()));
    }

    const contextSentence = extractContextSentence(blockText, rawText, offsetStart);
    const rect = range.getBoundingClientRect();
    const centerLeft = Math.min(
      Math.max(96, rect.left + rect.width / 2),
      window.innerWidth - 110,
    );
    const topPos = Math.max(12, rect.top - 46);

    setCandidate({
      word: rawText,
      contextSentence,
      rect: { top: topPos, left: centerLeft },
    });
  }, [containerRef, enabled]);

  const clearCandidate = useCallback(() => {
    setCandidate(null);
  }, []);

  return {
    candidate,
    captureSelection,
    clearCandidate,
  };
}

export interface ReadingVocabWorkspaceProps {
  passageId: string;
  testId?: string;
  testTitle?: string;
  passageTitle?: string;
  initialItems?: PassageVocabItem[];
  enabled: boolean;
  drawerOpen: boolean;
  onOpenDrawerChange: (open: boolean) => void;
  selectionCandidate: SelectedVocabCandidate | null;
  onClearSelection: () => void;
}

export function ReadingVocabToolbarButton({
  passageId,
  enabled,
  initialItems,
  onClick,
}: {
  passageId: string;
  enabled: boolean;
  initialItems?: PassageVocabItem[];
  onClick: () => void;
}) {
  const passageVocabsQuery = useQuery({
    queryKey: vocabKeys.studentPassage(passageId),
    queryFn: () => vocabularyApi.getPassageVocabs(passageId),
    enabled: enabled && Boolean(passageId),
  });

  const savedNotebookQuery = useQuery({
    queryKey: vocabKeys.notebookList(undefined, passageId, undefined, 1),
    queryFn: () => vocabularyApi.listNotebook({ passageId, limit: 100 }),
    enabled: enabled && Boolean(passageId),
  });

  if (!enabled) return null;

  const teacherCount = passageVocabsQuery.data?.items.length ?? initialItems?.length ?? 0;
  const savedCount = savedNotebookQuery.data?.total ?? 0;
  const badgeCount = teacherCount + savedCount;

  return (
    <button
      type="button"
      data-testid="reading-vocab-drawer-btn"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800 transition-colors hover:bg-indigo-100"
    >
      <BookMarked className="h-3.5 w-3.5 text-indigo-700" />
      <span>Sổ từ vựng</span>
      <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
        {badgeCount}
      </span>
    </button>
  );
}

export function ReadingVocabWorkspace({
  passageId,
  testId,
  testTitle,
  passageTitle,
  initialItems,
  enabled,
  drawerOpen,
  onOpenDrawerChange,
  selectionCandidate,
  onClearSelection,
}: ReadingVocabWorkspaceProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"teacher" | "saved">("teacher");
  const [quickSaveOpen, setQuickSaveOpen] = useState(false);
  const [quickForm, setQuickForm] = useState<{
    word: string;
    partOfSpeech: VocabPartOfSpeech;
    meaningVi: string;
    contextSentence: string;
    personalNote: string;
  }>({
    word: "",
    partOfSpeech: "n",
    meaningVi: "",
    contextSentence: "",
    personalNote: "",
  });
  const [editingEntry, setEditingEntry] = useState<UserVocabNotebookEntry | null>(null);
  const [editForm, setEditForm] = useState<{
    word: string;
    partOfSpeech: VocabPartOfSpeech;
    meaningVi: string;
    contextSentence: string;
    personalNote: string;
    status: VocabReviewStatus;
  } | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<UserVocabNotebookEntry | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  const passageVocabsQuery = useQuery({
    queryKey: vocabKeys.studentPassage(passageId),
    queryFn: () => vocabularyApi.getPassageVocabs(passageId),
    enabled: enabled && Boolean(passageId),
  });

  const savedInPassageQuery = useQuery({
    queryKey: vocabKeys.notebookList(undefined, passageId, undefined, 1),
    queryFn: () => vocabularyApi.listNotebook({ passageId, limit: 100 }),
    enabled: enabled && Boolean(passageId),
  });

  useEffect(() => {
    if (!drawerOpen && !quickSaveOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (quickSaveOpen) setQuickSaveOpen(false);
        else if (editingEntry) {
          setEditingEntry(null);
          setEditForm(null);
        } else if (drawerOpen) {
          onOpenDrawerChange(false);
        }
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [drawerOpen, quickSaveOpen, editingEntry, onOpenDrawerChange]);

  const invalidateVocabQueries = () => {
    void queryClient.invalidateQueries({ queryKey: vocabKeys.notebookRoot });
    void queryClient.invalidateQueries({ queryKey: vocabKeys.studentPassage(passageId) });
  };

  const teacherVocabs = passageVocabsQuery.data?.items ?? initialItems ?? [];
  const savedEntries = useMemo(
    () => savedInPassageQuery.data?.items ?? [],
    [savedInPassageQuery.data?.items],
  );
  const resolvedPassageTitle =
    passageTitle ?? passageVocabsQuery.data?.passageTitle ?? "Bài đọc IELTS Reading";
  const resolvedTestTitle = testTitle ?? passageVocabsQuery.data?.testTitle;
  const resolvedTestId = testId ?? passageVocabsQuery.data?.testId;

  const savedNormalizedSet = useMemo(
    () => new Set(savedEntries.map((e) => e.word.trim().toLowerCase())),
    [savedEntries],
  );

  const saveOneMutation = useMutation({
    mutationFn: (payload: {
      word: string;
      partOfSpeech: VocabPartOfSpeech;
      ipa?: string;
      meaningVi: string;
      contextSentence?: string;
      personalNote?: string;
      paraphraseNote?: string;
      sourcePassageVocabId?: string;
    }) =>
      vocabularyApi.createNotebookEntry({
        passageId,
        testId: resolvedTestId,
        sourcePassageTitle: resolvedPassageTitle,
        sourceTestTitle: resolvedTestTitle,
        ...payload,
      }),
    onSuccess: (created) => {
      invalidateVocabQueries();
      setFeedback({ type: "success", text: `Đã lưu "${created.word}" vào sổ tay từ vựng.` });
      setQuickSaveOpen(false);
      onClearSelection();
    },
    onError: (err) => {
      setFeedback({ type: "error", text: getFriendlyErrorMessage(err) });
    },
  });

  const bulkSaveMutation = useMutation({
    mutationFn: () =>
      vocabularyApi.bulkSaveFromPassage({
        passageId,
        testId: resolvedTestId,
        sourcePassageTitle: resolvedPassageTitle,
        sourceTestTitle: resolvedTestTitle,
        items: teacherVocabs.map((v) => ({
          word: v.word,
          partOfSpeech: v.partOfSpeech,
          ipa: v.ipa,
          meaningVi: v.meaningVi,
          paraphraseNote: v.paraphraseNote,
          contextSentence: v.contextSentence,
        })),
      }),
    onSuccess: (res) => {
      invalidateVocabQueries();
      setFeedback({
        type: "success",
        text:
          res.savedCount > 0
            ? `Đã lưu ${res.savedCount} từ mới${res.skippedCount > 0 ? ` (bỏ qua ${res.skippedCount} từ đã có)` : ""}.`
            : "Tất cả từ vựng trọng tâm bài này đã có trong sổ của bạn.",
      });
    },
    onError: (err) => {
      setFeedback({ type: "error", text: getFriendlyErrorMessage(err) });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: VocabReviewStatus }) =>
      vocabularyApi.updateNotebookStatus(id, nextStatus),
    onSuccess: () => invalidateVocabQueries(),
    onError: (err) => setFeedback({ type: "error", text: getFriendlyErrorMessage(err) }),
  });

  const updateEntryMutation = useMutation({
    mutationFn: () => {
      if (!editingEntry || !editForm) {
        throw new Error("Thiếu dữ liệu chỉnh sửa.");
      }
      return vocabularyApi.updateNotebookEntry(editingEntry.id, {
        word: editForm.word.trim(),
        partOfSpeech: editForm.partOfSpeech,
        meaningVi: editForm.meaningVi.trim(),
        contextSentence: editForm.contextSentence.trim(),
        personalNote: editForm.personalNote.trim(),
        status: editForm.status,
      });
    },
    onSuccess: () => {
      invalidateVocabQueries();
      setEditingEntry(null);
      setEditForm(null);
      setFeedback({ type: "success", text: "Đã cập nhật từ vựng trong sổ tay." });
    },
    onError: (err) => setFeedback({ type: "error", text: getFriendlyErrorMessage(err) }),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => vocabularyApi.deleteNotebookEntry(id),
    onSuccess: () => {
      invalidateVocabQueries();
      setDeletingEntry(null);
      setFeedback({ type: "success", text: "Đã xóa từ khỏi sổ tay." });
    },
    onError: (err) => setFeedback({ type: "error", text: getFriendlyErrorMessage(err) }),
  });

  if (!enabled) return null;

  const openQuickSaveFromSelection = () => {
    if (!selectionCandidate) return;
    setFeedback(null);
    setQuickForm({
      word: selectionCandidate.word,
      partOfSpeech: selectionCandidate.word.includes(" ") ? "phrase" : "n",
      meaningVi: "",
      contextSentence: selectionCandidate.contextSentence,
      personalNote: "",
    });
    setQuickSaveOpen(true);
    window.getSelection()?.removeAllRanges();
  };

  const handleSaveTeacherVocab = (item: PassageVocabItem) => {
    setFeedback(null);
    saveOneMutation.mutate({
      word: item.word,
      partOfSpeech: item.partOfSpeech,
      ipa: item.ipa,
      meaningVi: item.meaningVi,
      contextSentence: item.contextSentence,
      paraphraseNote: item.paraphraseNote,
      sourcePassageVocabId: item.id,
    });
  };

  const unsavedTeacherCount = teacherVocabs.filter(
    (v) => !savedNormalizedSet.has(v.word.trim().toLowerCase()),
  ).length;

  return (
    <>
      {/* Flow B: Floating Popover right above selected text */}
      {selectionCandidate &&
        !quickSaveOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-testid="vocab-selection-popover"
            style={{
              top: `${selectionCandidate.rect.top}px`,
              left: `${selectionCandidate.rect.left}px`,
              transform: "translateX(-50%)",
            }}
            className="fixed z-[90] flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900 p-1 text-white shadow-xl"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openQuickSaveFromSelection}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-500"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Lưu vào sổ từ
            </button>
          </div>,
          document.body,
        )}

      {/* Flow B: Quick Save Modal with Auto-Filled Word, Context Sentence & Source Passage */}
      {quickSaveOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Lưu từ vựng vào sổ tay"
            data-testid="vocab-quick-save-modal"
            onClick={() => setQuickSaveOpen(false)}
            className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-2xs"
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickForm.word.trim() || !quickForm.meaningVi.trim()) return;
                saveOneMutation.mutate({
                  word: quickForm.word.trim(),
                  partOfSpeech: quickForm.partOfSpeech,
                  meaningVi: quickForm.meaningVi.trim(),
                  contextSentence: quickForm.contextSentence.trim() || undefined,
                  personalNote: quickForm.personalNote.trim() || undefined,
                });
              }}
              className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Lưu vào sổ tay từ vựng</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Nguồn: <span className="font-semibold text-indigo-700">{resolvedPassageTitle}</span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={() => setQuickSaveOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Từ / Cụm từ *
                  </label>
                  <input
                    required
                    value={quickForm.word}
                    onChange={(e) => setQuickForm((p) => ({ ...p, word: e.target.value }))}
                    className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Từ loại
                  </label>
                  <select
                    value={quickForm.partOfSpeech}
                    onChange={(e) =>
                      setQuickForm((p) => ({
                        ...p,
                        partOfSpeech: e.target.value as VocabPartOfSpeech,
                      }))
                    }
                    className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                  >
                    {VOCAB_POS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Nghĩa tiếng Việt *
                </label>
                <input
                  required
                  autoFocus
                  value={quickForm.meaningVi}
                  onChange={(e) => setQuickForm((p) => ({ ...p, meaningVi: e.target.value }))}
                  placeholder="Nhập nghĩa tiếng Việt phù hợp ngữ cảnh..."
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Câu ngữ cảnh (trích từ bài đọc)
                </label>
                <textarea
                  rows={2}
                  value={quickForm.contextSentence}
                  onChange={(e) =>
                    setQuickForm((p) => ({ ...p, contextSentence: e.target.value }))
                  }
                  className="lms-input w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-800"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Ghi chú cá nhân (tuỳ chọn)
                </label>
                <input
                  value={quickForm.personalNote}
                  onChange={(e) =>
                    setQuickForm((p) => ({ ...p, personalNote: e.target.value }))
                  }
                  placeholder="Cách nhớ nhanh, cụm collocation hoặc paraphrase..."
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              {feedback?.type === "error" && (
                <p role="alert" className="text-xs font-medium text-rose-700">
                  {feedback.text}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button type="button" variant="secondary" onClick={() => setQuickSaveOpen(false)}>
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={saveOneMutation.isPending}
                  disabled={!quickForm.word.trim() || !quickForm.meaningVi.trim()}
                >
                  <Check className="h-4 w-4" />
                  Lưu
                </Button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* Slide-over Drawer (Right Side Overlay — preserves 2-column Reading layout) */}
      {drawerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Sổ tay từ vựng theo ngữ cảnh"
            data-testid="reading-vocab-drawer"
            className="fixed inset-0 z-[85] flex justify-end bg-slate-950/40 backdrop-blur-[1px]"
            onClick={() => onOpenDrawerChange(false)}
          >
            <aside
              onClick={(e) => e.stopPropagation()}
              className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <BookMarked className="h-4 w-4 text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">Sổ tay từ vựng</h2>
                  </div>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                    {resolvedPassageTitle}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Đóng sổ từ vựng"
                  onClick={() => onOpenDrawerChange(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Drawer Tabs */}
              <div
                role="tablist"
                aria-label="Phân loại từ vựng bài đọc"
                className="grid grid-cols-2 gap-1.5 border-b border-slate-200 bg-slate-50 px-5 py-2.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "teacher"}
                  onClick={() => setActiveTab("teacher")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    activeTab === "teacher"
                      ? "bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  Từ vựng bài này ({teacherVocabs.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "saved"}
                  onClick={() => setActiveTab("saved")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    activeTab === "saved"
                      ? "bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  Đã lưu trong bài ({savedEntries.length})
                </button>
              </div>

              {feedback && (
                <div
                  role="status"
                  className={cn(
                    "mx-5 mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                    feedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800",
                  )}
                >
                  <span>{feedback.text}</span>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className="text-[11px] font-bold underline"
                  >
                    Đóng
                  </button>
                </div>
              )}

              {/* Tab Content */}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {activeTab === "teacher" ? (
                  <>
                    {teacherVocabs.length > 0 && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-950">
                          <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                          <span>
                            {unsavedTeacherCount > 0
                              ? `Còn ${unsavedTeacherCount} từ chưa lưu`
                              : "Đã lưu toàn bộ từ vựng gợi ý"}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          disabled={unsavedTeacherCount === 0}
                          loading={bulkSaveMutation.isPending}
                          onClick={() => bulkSaveMutation.mutate()}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Lưu tất cả
                        </Button>
                      </div>
                    )}

                    {passageVocabsQuery.isLoading ? (
                      <p className="py-8 text-center text-xs text-slate-500">
                        Đang tải từ vựng trọng tâm...
                      </p>
                    ) : teacherVocabs.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                        <p className="text-xs font-medium text-slate-600">
                          Giảng viên chưa gắn từ vựng trọng tâm cho Passage này.
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Bạn có thể bôi đen trực tiếp từ bất kỳ trên bài đọc để tự lưu vào sổ tay!
                        </p>
                      </div>
                    ) : (
                      teacherVocabs.map((item) => {
                        const isSaved = savedNormalizedSet.has(item.word.trim().toLowerCase());
                        return (
                          <div
                            key={item.id}
                            className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-bold text-slate-900">
                                    {item.word}
                                  </span>
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                                    {item.partOfSpeech}
                                  </span>
                                </div>
                                {item.ipa && (
                                  <p className="font-mono text-[11px] text-slate-500">{item.ipa}</p>
                                )}
                              </div>

                              {isSaved ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                  <BookmarkCheck className="h-3.5 w-3.5" />
                                  Đã lưu
                                </span>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  loading={saveOneMutation.isPending}
                                  onClick={() => handleSaveTeacherVocab(item)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Lưu vào sổ
                                </Button>
                              )}
                            </div>

                            <p className="text-xs font-medium text-slate-800">{item.meaningVi}</p>

                            {item.paraphraseNote && (
                              <p className="rounded-md bg-amber-50/80 px-2.5 py-1.5 text-[11px] text-amber-950 ring-1 ring-amber-200/70">
                                <span className="font-bold">Paraphrase:</span> {item.paraphraseNote}
                              </p>
                            )}

                            {item.contextSentence && (
                              <p className="text-[11px] italic leading-relaxed text-slate-600">
                                &ldquo;
                                {splitSentenceByWord(item.contextSentence, item.word).map(
                                  (seg, sIdx) =>
                                    seg.highlight ? (
                                      <strong key={sIdx} className="font-bold text-slate-900">
                                        {seg.text}
                                      </strong>
                                    ) : (
                                      <span key={sIdx}>{seg.text}</span>
                                    ),
                                )}
                                &rdquo;
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
                ) : savedInPassageQuery.isLoading ? (
                  <p className="py-8 text-center text-xs text-slate-500">
                    Đang tải các từ đã lưu...
                  </p>
                ) : savedEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                    <p className="text-xs font-medium text-slate-600">
                      Bạn chưa lưu từ vựng nào trong bài đọc này.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Bôi đen chữ trong bài đọc hoặc bấm &ldquo;Lưu vào sổ&rdquo; ở tab bên cạnh.
                    </p>
                  </div>
                ) : (
                  savedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-slate-900">{entry.word}</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                              {entry.partOfSpeech}
                            </span>
                          </div>
                          {entry.ipa && (
                            <p className="font-mono text-[11px] text-slate-500">{entry.ipa}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                id: entry.id,
                                nextStatus:
                                  entry.status === "mastered" ? "learning" : "mastered",
                              })
                            }
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 transition-colors",
                              entry.status === "mastered"
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                                : "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
                            )}
                          >
                            {VOCAB_STATUS_LABELS[entry.status]}
                          </button>
                          <button
                            type="button"
                            aria-label={`Sửa ${entry.word}`}
                            onClick={() => {
                              setEditingEntry(entry);
                              setEditForm({
                                word: entry.word,
                                partOfSpeech: entry.partOfSpeech,
                                meaningVi: entry.meaningVi,
                                contextSentence: entry.contextSentence ?? "",
                                personalNote: entry.personalNote ?? "",
                                status: entry.status,
                              });
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Xóa ${entry.word}`}
                            onClick={() => setDeletingEntry(entry)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs font-medium text-slate-800">{entry.meaningVi}</p>

                      {entry.contextSentence && (
                        <p className="text-[11px] italic leading-relaxed text-slate-600">
                          &ldquo;
                          {splitSentenceByWord(entry.contextSentence, entry.word).map(
                            (seg, sIdx) =>
                              seg.highlight ? (
                                <strong key={sIdx} className="font-bold text-slate-900">
                                  {seg.text}
                                </strong>
                              ) : (
                                <span key={sIdx}>{seg.text}</span>
                              ),
                          )}
                          &rdquo;
                        </p>
                      )}

                      {entry.personalNote && (
                        <p className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                          Ghi chú: {entry.personalNote}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Drawer Footer */}
              <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
                <Link
                  href="/student/vocab-notebook"
                  onClick={() => onOpenDrawerChange(false)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Mở trang Sổ từ vựng của tôi
                </Link>
              </div>
            </aside>
          </div>,
          document.body,
        )}

      {/* Drawer Edit Modal */}
      {editingEntry &&
        editForm &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Chỉnh sửa từ vựng"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-2xs"
            onClick={() => {
              setEditingEntry(null);
              setEditForm(null);
            }}
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                updateEntryMutation.mutate();
              }}
              className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-bold text-slate-900">Chỉnh sửa từ vựng đã lưu</h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEntry(null);
                    setEditForm(null);
                  }}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Từ / Cụm từ *</label>
                  <input
                    required
                    value={editForm.word}
                    onChange={(e) => setEditForm((p) => (p ? { ...p, word: e.target.value } : p))}
                    className="lms-input w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Từ loại</label>
                  <select
                    value={editForm.partOfSpeech}
                    onChange={(e) =>
                      setEditForm((p) =>
                        p ? { ...p, partOfSpeech: e.target.value as VocabPartOfSpeech } : p,
                      )
                    }
                    className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                  >
                    {VOCAB_POS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Nghĩa tiếng Việt *</label>
                <input
                  required
                  value={editForm.meaningVi}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, meaningVi: e.target.value } : p))}
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Câu ngữ cảnh</label>
                <textarea
                  rows={2}
                  value={editForm.contextSentence}
                  onChange={(e) =>
                    setEditForm((p) => (p ? { ...p, contextSentence: e.target.value } : p))
                  }
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Ghi chú cá nhân</label>
                  <input
                    value={editForm.personalNote}
                    onChange={(e) =>
                      setEditForm((p) => (p ? { ...p, personalNote: e.target.value } : p))
                    }
                    className="lms-input w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Trạng thái</label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((p) =>
                        p ? { ...p, status: e.target.value as VocabReviewStatus } : p,
                      )
                    }
                    className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                  >
                    <option value="learning">Đang học</option>
                    <option value="mastered">Đã thuộc</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setEditingEntry(null);
                    setEditForm(null);
                  }}
                >
                  Hủy
                </Button>
                <Button type="submit" variant="primary" loading={updateEntryMutation.isPending}>
                  Lưu thay đổi
                </Button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={Boolean(deletingEntry)}
        title={`Xóa từ "${deletingEntry?.word ?? ""}"?`}
        description="Từ vựng này sẽ bị xóa khỏi Sổ tay từ vựng cá nhân của bạn."
        confirmLabel="Xóa từ vựng"
        cancelLabel="Hủy"
        variant="danger"
        isSubmitting={deleteEntryMutation.isPending}
        onConfirm={() => {
          if (deletingEntry) deleteEntryMutation.mutate(deletingEntry.id);
        }}
        onClose={() => setDeletingEntry(null)}
      />
    </>
  );
}

export interface ContextualPassageItem {
  passageId: string;
  partNumber: number;
  title: string;
  passageTitle?: string;
  passageHtml: string;
  passageVocabs?: PassageVocabItem[];
}

export interface ContextualPassageReaderProps {
  passages: ContextualPassageItem[];
  testId?: string;
  testTitle?: string;
  enableVocab: boolean;
  selectedPassageId?: string;
  onSelectPassageId?: (passageId: string) => void;
  drawerOpen?: boolean;
  onOpenDrawerChange?: (open: boolean) => void;
  showHeader?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
  passageContainerClassName?: string;
}

/**
 * Shared contextual Reading passage reader with multi-passage selector, Select-to-Save
 * floating popover, and Slide-over Vocabulary Notebook Drawer for Assignment workspaces.
 */
export function ContextualPassageReader({
  passages,
  testId,
  testTitle,
  enableVocab,
  selectedPassageId: controlledPassageId,
  onSelectPassageId,
  drawerOpen: controlledDrawerOpen,
  onOpenDrawerChange,
  showHeader = false,
  headerTitle = "Đọc lại bài & Sổ tay từ vựng theo ngữ cảnh",
  headerSubtitle = "Bôi đen từ bất kỳ trên bài đọc để lưu vào sổ cá nhân hoặc mở Sổ từ vựng gợi ý từ Giảng viên.",
  passageContainerClassName,
}: ContextualPassageReaderProps) {
  const [internalPassageId, setInternalPassageId] = useState<string>(
    passages[0]?.passageId ?? "",
  );
  const [internalDrawerOpen, setInternalDrawerOpen] = useState(false);

  const effectivePassageId =
    controlledPassageId ??
    (passages.some((p) => p.passageId === internalPassageId)
      ? internalPassageId
      : (passages[0]?.passageId ?? ""));
  const setEffectivePassageId = onSelectPassageId ?? setInternalPassageId;

  const isDrawerOpen = controlledDrawerOpen ?? internalDrawerOpen;
  const setIsDrawerOpen = onOpenDrawerChange ?? setInternalDrawerOpen;

  const activePassage =
    passages.find((p) => p.passageId === effectivePassageId) ?? passages[0];

  const passageRef = useRef<HTMLDivElement>(null);
  const { candidate, captureSelection, clearCandidate } = usePassageSelectionCapture(
    passageRef,
    enableVocab && Boolean(activePassage?.passageId),
  );

  if (!activePassage) {
    return null;
  }

  const passageSelector =
    passages.length > 1 ? (
      <div className="mb-3 flex flex-wrap gap-2">
        {passages.map((p) => (
          <button
            key={p.passageId}
            type="button"
            onClick={() => {
              setEffectivePassageId(p.passageId);
              clearCandidate();
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              p.passageId === activePassage.passageId
                ? "bg-indigo-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            Passage {p.partNumber}
          </button>
        ))}
      </div>
    ) : null;

  const body = (
    <>
      {passageSelector}
      <div
        ref={passageRef}
        onMouseUp={captureSelection}
        className={cn("select-text", passageContainerClassName)}
      >
        {passages.length > 1 && (
          <p className="mb-2 text-sm font-bold text-slate-900">
            {activePassage.passageTitle ?? activePassage.title}
          </p>
        )}
        <SafeHtml
          html={activePassage.passageHtml || "<p>Không có nội dung bài đọc.</p>"}
          lang="en"
          preset="richText"
        />
      </div>

      <ReadingVocabWorkspace
        passageId={activePassage.passageId}
        testId={testId}
        testTitle={testTitle}
        passageTitle={activePassage.passageTitle ?? activePassage.title}
        initialItems={activePassage.passageVocabs}
        enabled={enableVocab}
        drawerOpen={isDrawerOpen}
        onOpenDrawerChange={setIsDrawerOpen}
        selectionCandidate={candidate}
        onClearSelection={clearCandidate}
      />
    </>
  );

  if (!showHeader) {
    return body;
  }

  return (
    <Card className="space-y-4 border-indigo-200 bg-indigo-50/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-700" />
            <h2 className="text-base font-bold text-slate-900">{headerTitle}</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">{headerSubtitle}</p>
        </div>
        <ReadingVocabToolbarButton
          passageId={activePassage.passageId}
          enabled={enableVocab}
          initialItems={activePassage.passageVocabs}
          onClick={() => setIsDrawerOpen(true)}
        />
      </div>
      {body}
    </Card>
  );
}
