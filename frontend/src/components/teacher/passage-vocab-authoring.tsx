"use client";

import { useState } from "react";
import { BookMarked, Check, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Badge, Button } from "@/components/ui";
import { vocabularyApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import type { VocabPartOfSpeech } from "@/lib/api/types";
import { VOCAB_POS_OPTIONS } from "@/lib/exam/vocab-context";
import type { DraftPassageVocab } from "./exam-builder-types";

export interface PassageVocabAuthoringProps {
  passageId?: string;
  testId?: string;
  partNumber: number;
  vocabs: DraftPassageVocab[];
  disabled?: boolean;
  onChange: (nextVocabs: DraftPassageVocab[]) => void;
}

const EMPTY_FORM: DraftPassageVocab = {
  word: "",
  partOfSpeech: "n",
  ipa: "",
  meaningVi: "",
  paraphraseNote: "",
  contextSentence: "",
};

export function PassageVocabAuthoring({
  passageId,
  testId,
  partNumber,
  vocabs,
  disabled = false,
  onChange,
}: PassageVocabAuthoringProps) {
  const [form, setForm] = useState<DraftPassageVocab>(EMPTY_FORM);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const syncMutation = useMutation({
    mutationFn: () =>
      vocabularyApi.syncTeacherPassageVocabs(passageId!, {
        testId,
        partNumber,
        items: vocabs.map((v) => ({
          word: v.word.trim(),
          partOfSpeech: v.partOfSpeech,
          ipa: v.ipa.trim() || undefined,
          meaningVi: v.meaningVi.trim(),
          paraphraseNote: v.paraphraseNote.trim() || undefined,
          contextSentence: v.contextSentence.trim() || undefined,
        })),
      }),
    onSuccess: (res) => {
      onChange(
        res.items.map((item) => ({
          id: item.id,
          word: item.word,
          partOfSpeech: item.partOfSpeech,
          ipa: item.ipa ?? "",
          meaningVi: item.meaningVi,
          paraphraseNote: item.paraphraseNote ?? "",
          contextSentence: item.contextSentence ?? "",
        })),
      );
      setSyncNotice("Đã lưu danh sách từ vựng trọng tâm cho bài đọc này.");
    },
    onError: (err) => {
      setSyncNotice(null);
      setFormError(getFriendlyErrorMessage(err));
    },
  });

  const handleSaveItem = () => {
    const cleanWord = form.word.trim().replace(/\s+/g, " ");
    const cleanMeaning = form.meaningVi.trim();
    if (!cleanWord) {
      setFormError("Vui lòng nhập từ hoặc cụm từ.");
      return;
    }
    if (!cleanMeaning) {
      setFormError("Vui lòng nhập nghĩa tiếng Việt.");
      return;
    }

    const normalized = cleanWord.toLowerCase();
    const isDuplicate = vocabs.some(
      (item, idx) => idx !== editingIndex && item.word.trim().toLowerCase() === normalized,
    );
    if (isDuplicate) {
      setFormError(`Từ "${cleanWord}" đã tồn tại trong danh sách bài đọc này.`);
      return;
    }

    const nextItem: DraftPassageVocab = {
      id: editingIndex !== null ? vocabs[editingIndex]?.id : undefined,
      word: cleanWord,
      partOfSpeech: form.partOfSpeech,
      ipa: form.ipa.trim(),
      meaningVi: cleanMeaning,
      paraphraseNote: form.paraphraseNote.trim(),
      contextSentence: form.contextSentence.trim(),
    };

    if (editingIndex !== null) {
      onChange(vocabs.map((v, idx) => (idx === editingIndex ? nextItem : v)));
    } else {
      onChange([...vocabs, nextItem]);
    }

    setForm(EMPTY_FORM);
    setEditingIndex(null);
    setFormError(null);
    setSyncNotice(null);
  };

  const handleStartEdit = (idx: number) => {
    const target = vocabs[idx];
    if (!target) return;
    setEditingIndex(idx);
    setForm({ ...target });
    setFormError(null);
    setSyncNotice(null);
  };

  const handleRemove = (idx: number) => {
    onChange(vocabs.filter((_, i) => i !== idx));
    if (editingIndex === idx) {
      setEditingIndex(null);
      setForm(EMPTY_FORM);
    } else if (editingIndex !== null && idx < editingIndex) {
      setEditingIndex(editingIndex - 1);
    }
    setSyncNotice(null);
  };

  return (
    <div className="space-y-3 rounded-xl border border-indigo-200/80 bg-indigo-50/35 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-indigo-700" />
          <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
            Từ vựng trọng tâm của bài đọc (Passage Vocab)
          </h4>
          <Badge variant="info">{vocabs.length} từ</Badge>
        </div>

        {passageId && !disabled && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            <Save className="h-3.5 w-3.5" />
            Lưu nhanh từ vựng Passage
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-600">
        Gắn các từ khóa học thuật &amp; cặp paraphrase quan trọng để học viên xem và lưu vào sổ tay khi luyện tập, chữa bài hoặc dịch Passage.
      </p>

      {syncNotice && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
        >
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span>{syncNotice}</span>
        </div>
      )}

      {!disabled && (
        <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs">
          <div className="grid gap-2.5 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Từ / Cụm từ *
              </label>
              <input
                value={form.word}
                onChange={(e) => {
                  setForm((p) => ({ ...p, word: e.target.value }));
                  setFormError(null);
                }}
                placeholder="Ví dụ: bioluminescence"
                className="lms-input w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Từ loại
              </label>
              <select
                value={form.partOfSpeech}
                onChange={(e) =>
                  setForm((p) => ({ ...p, partOfSpeech: e.target.value as VocabPartOfSpeech }))
                }
                className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
              >
                {VOCAB_POS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-4">
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Phiên âm IPA (tuỳ chọn)
              </label>
              <input
                value={form.ipa}
                onChange={(e) => setForm((p) => ({ ...p, ipa: e.target.value }))}
                placeholder="/ˌbaɪ.oʊˌluː.mɪˈnes.əns/"
                className="lms-input w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Nghĩa tiếng Việt *
              </label>
              <input
                value={form.meaningVi}
                onChange={(e) => {
                  setForm((p) => ({ ...p, meaningVi: e.target.value }));
                  setFormError(null);
                }}
                placeholder="Ví dụ: hiện tượng phát quang sinh học"
                className="lms-input w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>

            <div className="sm:col-span-6">
              <label className="mb-1 block text-[11px] font-semibold text-slate-700">
                Ghi chú Paraphrase / Đồng nghĩa trong đề
              </label>
              <input
                value={form.paraphraseNote}
                onChange={(e) => setForm((p) => ({ ...p, paraphraseNote: e.target.value }))}
                placeholder="Ví dụ: emit natural light = produce biological glow"
                className="lms-input w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-700">
              Câu ngữ cảnh trích từ bài đọc (tuỳ chọn)
            </label>
            <input
              value={form.contextSentence}
              onChange={(e) => setForm((p) => ({ ...p, contextSentence: e.target.value }))}
              placeholder="Ví dụ: Deep-sea organisms rely on bioluminescence to evade predators."
              className="lms-input w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-rose-700">
              {formError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {editingIndex !== null && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingIndex(null);
                  setForm(EMPTY_FORM);
                  setFormError(null);
                }}
              >
                <X className="h-3.5 w-3.5" />
                Hủy sửa
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="primary"
              data-testid={`passage-${partNumber}-add-vocab-btn`}
              onClick={handleSaveItem}
            >
              {editingIndex !== null ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Cập nhật từ vựng
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Thêm từ vựng
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {vocabs.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Từ / Cụm từ</th>
                <th className="px-3 py-2">Nghĩa tiếng Việt</th>
                <th className="px-3 py-2">Paraphrase &amp; Ngữ cảnh</th>
                {!disabled && <th className="px-3 py-2 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vocabs.map((item, idx) => (
                <tr key={`${item.word}-${idx}`} className="align-top hover:bg-slate-50/70">
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900">{item.word}</span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                        {item.partOfSpeech}
                      </span>
                    </div>
                    {item.ipa && (
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">{item.ipa}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-800">{item.meaningVi}</td>
                  <td className="px-3 py-2.5 space-y-1 text-[11px] text-slate-600">
                    {item.paraphraseNote && (
                      <p>
                        <span className="font-semibold text-amber-800">Paraphrase:</span>{" "}
                        {item.paraphraseNote}
                      </p>
                    )}
                    {item.contextSentence && (
                      <p className="italic text-slate-500">&ldquo;{item.contextSentence}&rdquo;</p>
                    )}
                    {!item.paraphraseNote && !item.contextSentence && (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  {!disabled && (
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        aria-label={`Sửa từ ${item.word}`}
                        onClick={() => handleStartEdit(idx)}
                        className="mr-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa từ ${item.word}`}
                        onClick={() => handleRemove(idx)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white/70 px-3 py-3 text-center text-xs text-slate-500">
          Chưa có từ vựng trọng tâm nào cho bài đọc này.
        </p>
      )}
    </div>
  );
}
