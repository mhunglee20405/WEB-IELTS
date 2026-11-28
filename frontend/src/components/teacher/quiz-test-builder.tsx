"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Card } from "@/components/ui";
import type { DraftPart } from "./exam-builder-types";
import { createEmptyQuestion, parseOptionsFromText } from "./exam-builder-types";

export interface QuizTestBuilderProps {
  skill: "VOCABULARY" | "GRAMMAR";
  parts: DraftPart[];
  setParts: React.Dispatch<React.SetStateAction<DraftPart[]>>;
  disabled?: boolean;
  markDirty: () => void;
}

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

export function normalizeFourOptions(
  rawOptionsText: string,
): Array<{ key: "A" | "B" | "C" | "D"; text: string }> {
  const parsed = parseOptionsFromText(rawOptionsText);
  const byKey = new Map(parsed.map((o) => [o.key.toUpperCase(), o.text]));
  return OPTION_KEYS.map((key, idx) => ({
    key,
    text: byKey.get(key) ?? parsed[idx]?.text ?? "",
  }));
}

export function QuizTestBuilder({
  skill,
  parts,
  setParts,
  disabled = false,
  markDirty,
}: QuizTestBuilderProps) {
  const questions = parts[0]?.groups[0]?.questions ?? [];

  const updateQuestions = (
    updater: (prev: typeof questions) => typeof questions,
  ) => {
    setParts((prevParts) => {
      const basePart: DraftPart = prevParts[0] ?? {
        title: `${skill === "VOCABULARY" ? "Vocabulary" : "Grammar"} Quiz`,
        passageTitle: "",
        passageHtml: "",
        instructions: "",
        durationMinutes: 15,
        audioAssetId: "",
        audioAllowPause: true,
        audioAllowSeek: true,
        audioMaxPlayCount: "",
        transcript: "",
        groups: [
          {
            title: "Trắc nghiệm",
            instructionHtml: "<p>Chọn đáp án đúng nhất cho mỗi câu hỏi.</p>",
            summaryTemplateHtml: "",
            questionType: "MULTIPLE_CHOICE_SINGLE",
            sharedOptionsText: "",
            maxWords: 1,
            maxSelections: 1,
            questions: [],
          },
        ],
      };

      const baseGroup = basePart.groups[0] ?? {
        title: "Trắc nghiệm",
        instructionHtml: "<p>Chọn đáp án đúng nhất cho mỗi câu hỏi.</p>",
        summaryTemplateHtml: "",
        questionType: "MULTIPLE_CHOICE_SINGLE" as const,
        sharedOptionsText: "",
        maxWords: 1,
        maxSelections: 1,
        questions: [],
      };

      const nextQuestions = updater(baseGroup.questions);
      return [
        {
          ...basePart,
          groups: [{ ...baseGroup, questions: nextQuestions }],
        },
      ];
    });
    markDirty();
  };

  const handleAddQuestion = () => {
    const empty = createEmptyQuestion("MULTIPLE_CHOICE_SINGLE");
    updateQuestions((prev) => [
      ...prev,
      {
        ...empty,
        optionsText: "A|\nB|\nC|\nD|",
        correctAnswerText: "A",
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            2. Danh sách câu hỏi Trắc nghiệm ({questions.length} câu)
          </h2>
          <p className="text-xs text-slate-600">
            Mỗi câu hỏi gồm 4 lựa chọn A, B, C, D. Chọn 1 đáp án đúng duy nhất và có thể nhập thêm lời giải thích.
          </p>
        </div>

        {!disabled && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="quiz-add-question-btn"
            onClick={handleAddQuestion}
          >
            <Plus className="h-4 w-4" />
            Thêm câu hỏi
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q, qIdx) => {
          const fourOptions = normalizeFourOptions(q.optionsText);
          const selectedKey = (q.correctAnswerText.trim().toUpperCase() || "A") as
            | "A"
            | "B"
            | "C"
            | "D";

          return (
            <Card
              key={q.id ?? `quiz-q-${qIdx}`}
              className="space-y-4 border-slate-200 bg-white shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-900 px-1.5 text-xs text-white tabular-nums">
                    {qIdx + 1}
                  </span>
                  Câu hỏi {qIdx + 1}
                </span>

                {!disabled && questions.length > 1 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Xóa câu hỏi ${qIdx + 1}`}
                    onClick={() =>
                      updateQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                    }
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa câu
                  </Button>
                )}
              </div>

              <div>
                <label
                  htmlFor={`quiz-prompt-${qIdx}`}
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Nội dung câu hỏi *
                </label>
                <textarea
                  id={`quiz-prompt-${qIdx}`}
                  rows={2}
                  disabled={disabled}
                  value={q.prompt}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    updateQuestions((prev) =>
                      prev.map((item, idx) =>
                        idx === qIdx ? { ...item, prompt: nextVal } : item,
                      ),
                    );
                  }}
                  placeholder={`Nhập nội dung câu hỏi số ${qIdx + 1}...`}
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
                />
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-semibold text-slate-700">
                  Các lựa chọn (Bấm nút tròn để chọn đáp án đúng) *
                </span>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {fourOptions.map((opt) => {
                    const isCorrect = selectedKey === opt.key;
                    return (
                      <div
                        key={opt.key}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                          isCorrect
                            ? "border-emerald-400 bg-emerald-50/40"
                            : "border-slate-200 bg-slate-50/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`quiz-correct-${qIdx}`}
                          checked={isCorrect}
                          disabled={disabled}
                          aria-label={`Đáp án đúng câu ${qIdx + 1} là ${opt.key}`}
                          onChange={() => {
                            updateQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, correctAnswerText: opt.key } : item,
                              ),
                            );
                          }}
                          className="h-4 w-4 shrink-0 accent-emerald-600"
                        />
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${
                            isCorrect
                              ? "bg-emerald-600 text-white"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {opt.key}
                        </span>
                        <input
                          type="text"
                          disabled={disabled}
                          value={opt.text}
                          aria-label={`Nội dung đáp án ${opt.key} câu ${qIdx + 1}`}
                          placeholder={`Nhập lựa chọn ${opt.key}...`}
                          onChange={(e) => {
                            const nextText = e.target.value;
                            const nextOptionsText = fourOptions
                              .map((o) => `${o.key}|${o.key === opt.key ? nextText : o.text}`)
                              .join("\n");
                            updateQuestions((prev) =>
                              prev.map((item, idx) =>
                                idx === qIdx ? { ...item, optionsText: nextOptionsText } : item,
                              ),
                            );
                          }}
                          className="lms-input min-w-0 flex-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor={`quiz-explanation-${qIdx}`}
                  className="mb-1 block text-xs font-semibold text-slate-700"
                >
                  Giải thích đáp án (Tuỳ chọn — hiển thị sau khi học sinh nộp bài)
                </label>
                <input
                  id={`quiz-explanation-${qIdx}`}
                  type="text"
                  disabled={disabled}
                  value={q.explanation}
                  onChange={(e) => {
                    const nextExp = e.target.value;
                    updateQuestions((prev) =>
                      prev.map((item, idx) =>
                        idx === qIdx ? { ...item, explanation: nextExp } : item,
                      ),
                    );
                  }}
                  placeholder="Ví dụ: Cấu trúc 'despite + N/V-ing', không dùng 'despite of'."
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
            </Card>
          );
        })}
      </div>

      {!disabled && (
        <div className="flex justify-center pt-1">
          <Button type="button" variant="secondary" onClick={handleAddQuestion}>
            <Plus className="h-4 w-4" />
            Thêm câu hỏi
          </Button>
        </div>
      )}
    </div>
  );
}
