"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  FilterToolbar,
  PageHeader,
  QueryState,
  SearchInput,
} from "@/components/ui";
import { vocabularyApi } from "@/lib/api/endpoints/vocabulary";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { vocabKeys } from "@/lib/api/query-keys";
import type {
  UserVocabNotebookEntry,
  VocabPartOfSpeech,
  VocabReviewStatus,
} from "@/lib/api/types";
import {
  VOCAB_POS_OPTIONS,
  VOCAB_STATUS_LABELS,
  splitSentenceByWord,
} from "@/lib/exam/vocab-context";
import { cn } from "@/lib/utils/cn";

type StatusFilter = "" | VocabReviewStatus;

export default function StudentVocabNotebookPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [passageFilter, setPassageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);
  const limit = 15;

  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Add / Edit Modal state
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingEntry, setEditingEntry] = useState<UserVocabNotebookEntry | null>(null);
  const [formState, setFormState] = useState<{
    word: string;
    partOfSpeech: VocabPartOfSpeech;
    meaningVi: string;
    contextSentence: string;
    personalNote: string;
    status: VocabReviewStatus;
  }>({
    word: "",
    partOfSpeech: "n",
    meaningVi: "",
    contextSentence: "",
    personalNote: "",
    status: "learning",
  });
  const [deletingEntry, setDeletingEntry] = useState<UserVocabNotebookEntry | null>(null);

  const notebookQuery = useQuery({
    queryKey: vocabKeys.notebookList(
      search.trim() || undefined,
      passageFilter || undefined,
      statusFilter || undefined,
      page,
    ),
    queryFn: () =>
      vocabularyApi.listNotebook({
        search: search.trim() || undefined,
        passageId: passageFilter || undefined,
        status: statusFilter || undefined,
        page,
        limit,
      }),
  });

  useEffect(() => {
    if (!modalMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalMode(null);
        setEditingEntry(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalMode]);

  const statusToggleMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: VocabReviewStatus }) => {
      setTogglingId(id);
      return vocabularyApi.updateNotebookStatus(id, nextStatus);
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: vocabKeys.notebookRoot });
      setBanner({
        type: "success",
        text: `Đã chuyển "${updated.word}" sang trạng thái "${VOCAB_STATUS_LABELS[updated.status]}".`,
      });
    },
    onError: (err) => {
      setBanner({ type: "error", text: getFriendlyErrorMessage(err) });
    },
    onSettled: () => setTogglingId(null),
  });

  const saveModalMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        word: formState.word.trim(),
        partOfSpeech: formState.partOfSpeech,
        meaningVi: formState.meaningVi.trim(),
        contextSentence: formState.contextSentence.trim(),
        personalNote: formState.personalNote.trim(),
        status: formState.status,
      };
      if (modalMode === "edit" && editingEntry) {
        return vocabularyApi.updateNotebookEntry(editingEntry.id, payload);
      }
      return vocabularyApi.createNotebookEntry(payload);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: vocabKeys.notebookRoot });
      setModalMode(null);
      setEditingEntry(null);
      setBanner({
        type: "success",
        text:
          modalMode === "edit"
            ? `Đã cập nhật từ "${saved.word}" thành công.`
            : `Đã thêm từ "${saved.word}" vào sổ từ vựng.`,
      });
    },
    onError: (err) => {
      setBanner({ type: "error", text: getFriendlyErrorMessage(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vocabularyApi.deleteNotebookEntry(id),
    onSuccess: () => {
      const deletedWord = deletingEntry?.word ?? "";
      void queryClient.invalidateQueries({ queryKey: vocabKeys.notebookRoot });
      setDeletingEntry(null);
      setBanner({
        type: "success",
        text: `Đã xóa từ "${deletedWord}" khỏi sổ từ vựng.`,
      });
    },
    onError: (err) => {
      setDeletingEntry(null);
      setBanner({ type: "error", text: getFriendlyErrorMessage(err) });
    },
  });

  const openCreateModal = () => {
    setBanner(null);
    setEditingEntry(null);
    setFormState({
      word: "",
      partOfSpeech: "n",
      meaningVi: "",
      contextSentence: "",
      personalNote: "",
      status: "learning",
    });
    setModalMode("create");
  };

  const openEditModal = (entry: UserVocabNotebookEntry) => {
    setBanner(null);
    setEditingEntry(entry);
    setFormState({
      word: entry.word,
      partOfSpeech: entry.partOfSpeech,
      meaningVi: entry.meaningVi,
      contextSentence: entry.contextSentence ?? "",
      personalNote: entry.personalNote ?? "",
      status: entry.status,
    });
    setModalMode("edit");
  };

  const data = notebookQuery.data;
  const items = data?.items ?? [];
  const stats = data?.stats ?? { total: 0, learningCount: 0, masteredCount: 0 };
  const sources = data?.sources ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sổ từ vựng của tôi"
        subtitle="Tổng hợp toàn bộ từ vựng học thuật bạn đã lưu theo ngữ cảnh từ các bài đọc IELTS Reading."
        actions={
          <Button type="button" variant="primary" onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Thêm từ mới
          </Button>
        }
      />

      {/* Stats Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center justify-between border-slate-200 py-3.5">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase">Tổng số từ đã lưu</p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <BookMarked className="h-5 w-5" />
          </span>
        </Card>

        <Card className="flex items-center justify-between border-amber-200 bg-amber-50/35 py-3.5">
          <div>
            <p className="text-xs font-semibold text-amber-800 uppercase">Đang học</p>
            <p className="mt-1 text-2xl font-bold text-amber-900 tabular-nums">
              {stats.learningCount}
            </p>
          </div>
          <Badge variant="warning">Learning</Badge>
        </Card>

        <Card className="flex items-center justify-between border-emerald-200 bg-emerald-50/35 py-3.5">
          <div>
            <p className="text-xs font-semibold text-emerald-800 uppercase">Đã thuộc</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900 tabular-nums">
              {stats.masteredCount}
            </p>
          </div>
          <Badge variant="success">Mastered</Badge>
        </Card>
      </div>

      {banner && (
        <div
          role={banner.type === "error" ? "alert" : "status"}
          className={cn(
            "flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-medium",
            banner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900",
          )}
        >
          <span className="flex items-center gap-2">
            {banner.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {banner.text}
          </span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-xs font-bold underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <FilterToolbar>
        <div className="min-w-[240px] flex-1">
          <SearchInput
            value={search}
            onChange={(next) => {
              setSearch(next);
              setPage(1);
            }}
            placeholder="Tìm từ vựng, nghĩa tiếng Việt, câu ngữ cảnh..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="vocab-source-filter" className="sr-only">
            Lọc theo bài đọc nguồn
          </label>
          <select
            id="vocab-source-filter"
            value={passageFilter}
            onChange={(e) => {
              setPassageFilter(e.target.value);
              setPage(1);
            }}
            className="lms-input min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
          >
            <option value="">Tất cả bài đọc nguồn</option>
            {sources.map((src) => (
              <option key={src.passageId} value={src.passageId}>
                {src.passageTitle} ({src.count})
              </option>
            ))}
          </select>

          <div
            role="group"
            aria-label="Lọc theo trạng thái ôn tập"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
          >
            {(
              [
                { value: "", label: "Tất cả" },
                { value: "learning", label: "Đang học" },
                { value: "mastered", label: "Đã thuộc" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value || "ALL"}
                type="button"
                onClick={() => {
                  setStatusFilter(opt.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  statusFilter === opt.value
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </FilterToolbar>

      {/* Vocabulary Table */}
      <QueryState
        isLoading={notebookQuery.isLoading}
        isError={notebookQuery.isError}
        error={notebookQuery.error}
        isEmpty={items.length === 0}
        emptyTitle="Chưa có từ vựng nào phù hợp"
        emptyDescription="Hãy mở một bài đọc IELTS Reading ở chế độ luyện tập, chữa bài hoặc dịch Passage và bôi đen từ để lưu vào sổ tay nhé!"
        onRetry={() => void notebookQuery.refetch()}
      >
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 uppercase">
                <tr>
                  <th className="px-4 py-3">Từ / Cụm từ &amp; Từ loại</th>
                  <th className="px-4 py-3">Nghĩa tiếng Việt</th>
                  <th className="px-4 py-3 w-[28%]">Câu ngữ cảnh</th>
                  <th className="px-4 py-3">Ghi chú cá nhân</th>
                  <th className="px-4 py-3">Bài đọc nguồn</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {items.map((entry) => {
                  const isMastered = entry.status === "mastered";
                  const isToggling = togglingId === entry.id && statusToggleMutation.isPending;
                  return (
                    <tr key={entry.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900">{entry.word}</span>
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                            {entry.partOfSpeech}
                          </span>
                        </div>
                        {entry.ipa && (
                          <p className="mt-0.5 font-mono text-xs text-slate-500">{entry.ipa}</p>
                        )}
                        {entry.paraphraseNote && (
                          <p className="mt-1 text-[11px] text-amber-800">
                            <span className="font-semibold">Paraphrase:</span>{" "}
                            {entry.paraphraseNote}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-slate-800">{entry.meaningVi}</td>

                      <td className="px-4 py-3.5 text-xs leading-relaxed text-slate-700">
                        {entry.contextSentence ? (
                          <span>
                            {splitSentenceByWord(entry.contextSentence, entry.word).map(
                              (seg, sIdx) =>
                                seg.highlight ? (
                                  <strong
                                    key={sIdx}
                                    className="rounded-xs bg-indigo-50 px-0.5 font-bold text-indigo-950"
                                  >
                                    {seg.text}
                                  </strong>
                                ) : (
                                  <span key={sIdx}>{seg.text}</span>
                                ),
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {entry.personalNote || <span className="text-slate-400">—</span>}
                      </td>

                      <td className="px-4 py-3.5 text-xs">
                        {entry.passageId && entry.testId ? (
                          <Link
                            href={`/student/practice/${encodeURIComponent(entry.testId)}?partId=${encodeURIComponent(entry.passageId)}`}
                            className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
                          >
                            <BookOpen className="h-3.5 w-3.5 shrink-0" />
                            <span className="line-clamp-2">
                              {entry.sourcePassageTitle || "Mở bài đọc"}
                            </span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </Link>
                        ) : entry.sourcePassageTitle ? (
                          <span className="font-medium text-slate-700">
                            {entry.sourcePassageTitle}
                          </span>
                        ) : (
                          <span className="text-slate-400">Tự thêm</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() =>
                            statusToggleMutation.mutate({
                              id: entry.id,
                              nextStatus: isMastered ? "learning" : "mastered",
                            })
                          }
                          title="Bấm để chuyển nhanh trạng thái Đang học / Đã thuộc"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 transition-colors",
                            isMastered
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100"
                              : "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100",
                            isToggling && "opacity-60 cursor-wait",
                          )}
                        >
                          {VOCAB_STATUS_LABELS[entry.status]}
                        </button>
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Sửa ${entry.word}`}
                            onClick={() => openEditModal(entry)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Sửa</span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Xóa ${entry.word}`}
                            onClick={() => setDeletingEntry(entry)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/70 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Xóa</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <span>
                Trang {data.page} / {data.totalPages} ({data.total} từ)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </QueryState>

      {/* Create / Edit Modal */}
      {modalMode &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modalMode === "edit" ? "Chỉnh sửa từ vựng" : "Thêm từ vựng mới"}
            data-testid="vocab-notebook-edit-modal"
            onClick={() => {
              setModalMode(null);
              setEditingEntry(null);
            }}
            className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-2xs"
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                if (!formState.word.trim() || !formState.meaningVi.trim()) return;
                saveModalMutation.mutate();
              }}
              className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  {modalMode === "edit" ? "Chỉnh sửa từ vựng" : "Thêm từ vựng vào sổ tay"}
                </h2>
                <button
                  type="button"
                  aria-label="Đóng"
                  onClick={() => {
                    setModalMode(null);
                    setEditingEntry(null);
                  }}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
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
                    value={formState.word}
                    onChange={(e) => setFormState((p) => ({ ...p, word: e.target.value }))}
                    className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Từ loại
                  </label>
                  <select
                    value={formState.partOfSpeech}
                    onChange={(e) =>
                      setFormState((p) => ({
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
                  value={formState.meaningVi}
                  onChange={(e) => setFormState((p) => ({ ...p, meaningVi: e.target.value }))}
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Câu ngữ cảnh
                </label>
                <textarea
                  rows={2}
                  value={formState.contextSentence}
                  onChange={(e) =>
                    setFormState((p) => ({ ...p, contextSentence: e.target.value }))
                  }
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-xs leading-relaxed"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Ghi chú cá nhân
                  </label>
                  <input
                    value={formState.personalNote}
                    onChange={(e) =>
                      setFormState((p) => ({ ...p, personalNote: e.target.value }))
                    }
                    className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Trạng thái ôn tập
                  </label>
                  <select
                    value={formState.status}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        status: e.target.value as VocabReviewStatus,
                      }))
                    }
                    className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                  >
                    <option value="learning">Đang học</option>
                    <option value="mastered">Đã thuộc</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setModalMode(null);
                    setEditingEntry(null);
                  }}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={saveModalMutation.isPending}
                  disabled={!formState.word.trim() || !formState.meaningVi.trim()}
                >
                  {modalMode === "edit" ? "Lưu thay đổi" : "Lưu từ mới"}
                </Button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deletingEntry)}
        title={`Xóa từ "${deletingEntry?.word ?? ""}" khỏi sổ từ vựng?`}
        description="Thao tác này sẽ gỡ từ vựng khỏi sổ tay cá nhân của bạn và không thể hoàn tác."
        confirmLabel="Xác nhận xóa"
        cancelLabel="Hủy"
        variant="danger"
        isSubmitting={deleteMutation.isPending}
        onConfirm={() => {
          if (deletingEntry) deleteMutation.mutate(deletingEntry.id);
        }}
        onClose={() => setDeletingEntry(null)}
      />
    </div>
  );
}
