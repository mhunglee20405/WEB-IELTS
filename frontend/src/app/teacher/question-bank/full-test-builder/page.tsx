"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge, Button, Card, PageHeader, QueryState, Tabs } from "@/components/ui";
import { teacherExamTestsApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys } from "@/lib/api/query-keys";
import type {
  ExamPartAuthoring,
  ExamSkill,
  UpsertExamPartInput,
} from "@/lib/api/types";

interface SelectedAssemblyPart {
  sourceTestId: string;
  sourceTestTitle: string;
  part: ExamPartAuthoring;
}

export default function TeacherFullTestBuilderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [skill, setSkill] = useState<ExamSkill>("READING");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [selectedParts, setSelectedParts] = useState<SelectedAssemblyPart[]>([]);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: examKeys.teacherBankList(skill, undefined, undefined),
    queryFn: () => teacherExamTestsApi.list({ skill, limit: 50 }),
  });

  const summaryTests = listQuery.data?.items ?? [];

  const detailQueries = useQueries({
    queries: summaryTests.map((t) => ({
      queryKey: examKeys.teacherTestDetail(t.id),
      queryFn: () => teacherExamTestsApi.getById(t.id),
      staleTime: 60_000,
    })),
  });

  const availablePool: SelectedAssemblyPart[] = [];
  detailQueries.forEach((dq) => {
    if (!dq.data) return;
    dq.data.parts.forEach((part) => {
      availablePool.push({
        sourceTestId: dq.data.id,
        sourceTestTitle: dq.data.title,
        part,
      });
    });
  });

  const totalQuestions = selectedParts.reduce(
    (sum, item) => sum + item.part.questionCount,
    0,
  );

  const assembleMutation = useMutation({
    mutationFn: async (alsoPublish: boolean) => {
      if (title.trim().length < 3) {
        throw new Error("Vui lòng nhập tiêu đề Full Test tối thiểu 3 ký tự.");
      }
      if (selectedParts.length === 0) {
        throw new Error("Hãy chọn ít nhất 1 Passage hoặc Section để ghép Full Test.");
      }
      if (skill === "LISTENING") {
        const missingAudio = selectedParts.find((p) => !p.part.audioAsset?.assetId);
        if (missingAudio) {
          throw new Error(
            `Section "${missingAudio.part.title}" chưa có tệp âm thanh hoàn chỉnh.`,
          );
        }
      }

      const created = await teacherExamTestsApi.create({
        title: title.trim(),
        subtitle: `Full Test gồm ${selectedParts.length} ${skill === "READING" ? "Passages" : "Sections"} · ${totalQuestions} câu hỏi`,
        skill,
        totalDurationSeconds: durationMinutes * 60,
        allowedModes: ["PART", "FULL"],
      });

      let runningNumber = 1;
      for (let idx = 0; idx < selectedParts.length; idx++) {
        const entry = selectedParts[idx]!;
        const payload: UpsertExamPartInput = {
          partNumber: idx + 1,
          partType: skill === "READING" ? "PASSAGE" : "SECTION",
          title: `${skill === "READING" ? "Passage" : "Section"} ${idx + 1}: ${entry.part.passageTitle ?? entry.part.title}`,
          instructions: entry.part.instructions,
          passageTitle: entry.part.passageTitle,
          passageHtml: entry.part.passageHtml,
          paragraphs: entry.part.paragraphs,
          audioAsset: entry.part.audioAsset,
          durationSeconds: entry.part.durationSeconds,
          transcript: entry.part.transcript,
          sourcePartId: entry.part.id,
          questionGroups: entry.part.questionGroups.map((g, gIdx) => ({
            groupNumber: gIdx + 1,
            title: g.title,
            instructionHtml: g.instructionHtml,
            questionType: g.questionType,
            sharedOptions: g.sharedOptions,
            summaryTemplateHtml: g.summaryTemplateHtml,
            diagramImageUrl: g.diagramImageUrl,
            maxWords: g.maxWords,
            maxSelections: g.maxSelections,
            questions: g.questions.map((q) => ({
              questionNumber: runningNumber++,
              prompt: q.prompt,
              questionType: q.questionType,
              options: q.options,
              maxSelections: q.maxSelections,
              maxWords: q.maxWords,
              blankLabel: q.blankLabel,
              correctAnswer: q.correctAnswer ?? "A",
              acceptedAnswers: q.acceptedAnswers,
              explanation: q.explanation,
              referenceParagraph: q.referenceParagraph,
            })),
          })),
        };
        await teacherExamTestsApi.createPart(created.id, payload);
      }

      const validation = await teacherExamTestsApi.validate(created.id);
      if (alsoPublish && validation.valid) {
        await teacherExamTestsApi.publish(created.id);
      }
      return { id: created.id, validation };
    },
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: examKeys.teacherBankRoot });
      router.push(`/teacher/question-bank/${encodeURIComponent(id)}/edit`);
    },
    onError: (err) => {
      setErrorBanner(err instanceof Error ? err.message : getFriendlyErrorMessage(err));
    },
  });

  const movePart = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= selectedParts.length) return;
    setSelectedParts((prev) => {
      const copy = [...prev];
      const temp = copy[index]!;
      copy[index] = copy[nextIdx]!;
      copy[nextIdx] = temp;
      return copy;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/teacher/question-bank"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại Kho đề thi
        </Link>
      </div>

      <PageHeader
        title="Ghép Full Test IELTS"
        subtitle="Chọn nhiều Passage Reading hoặc Section Listening từ ngân hàng hiện có, sắp xếp thứ tự và đánh số câu hỏi liên tục."
      />

      <Tabs
        ariaLabel="Chọn kỹ năng ghép Full Test"
        items={[
          { id: "READING", label: "Ghép Full Test Reading" },
          { id: "LISTENING", label: "Ghép Full Test Listening" },
        ]}
        value={skill}
        hasPanels={false}
        onChange={(id) => {
          const next = id as ExamSkill;
          setSkill(next);
          setDurationMinutes(next === "READING" ? 60 : 30);
          setSelectedParts([]);
        }}
      />

      {errorBanner && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorBanner}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Available Pool */}
        <Card className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            1. Nguồn {skill === "READING" ? "Passages" : "Sections"} hiện có ({availablePool.length})
          </h2>

          <QueryState
            isLoading={listQuery.isLoading}
            isError={listQuery.isError}
            error={listQuery.error}
            isEmpty={availablePool.length === 0}
            emptyTitle="Chưa có phần thi nào khả dụng"
            emptyDescription="Hãy tạo ít nhất một Passage hoặc Section trước."
            onRetry={() => void listQuery.refetch()}
          >
            <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
              {availablePool.map((entry, idx) => (
                <div
                  key={`${entry.sourceTestId}-${entry.part.id}-${idx}`}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-slate-900">
                      {entry.part.passageTitle ?? entry.part.title}
                    </p>
                    <p className="text-xs text-slate-600">
                      Từ đề: {entry.sourceTestTitle} · {entry.part.questionCount} câu
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setErrorBanner(null);
                      setSelectedParts((prev) => [...prev, entry]);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm
                  </Button>
                </div>
              ))}
            </div>
          </QueryState>
        </Card>

        {/* Right: Assembled Full Test Order & Metadata */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              2. Cấu trúc Full Test sẽ tạo
            </h2>
            <Badge variant="info">
              {selectedParts.length} phần · {totalQuestions} câu
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="full-test-title" className="mb-1 block text-xs font-semibold text-slate-700">
                Tiêu đề Full Test *
              </label>
              <input
                id="full-test-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`IELTS ${skill === "READING" ? "Reading" : "Listening"} Full Test Mới`}
                className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="full-test-dur" className="mb-1 block text-xs font-semibold text-slate-700">
                Thời gian (phút)
              </label>
              <input
                id="full-test-dur"
                type="number"
                min={5}
                max={180}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value) || 60)}
                className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {selectedParts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-10 text-center text-xs text-slate-500">
              <Layers className="mb-2 h-7 w-7 text-slate-400" />
              Nhấn &quot;Thêm&quot; ở cột bên trái để đưa các Passage/Section vào Full Test.
            </div>
          ) : (
            <ol className="space-y-2.5">
              {selectedParts.map((entry, idx) => {
                const startNum =
                  selectedParts
                    .slice(0, idx)
                    .reduce((s, item) => s + item.part.questionCount, 0) + 1;
                const endNum = startNum + entry.part.questionCount - 1;
                return (
                  <li
                    key={`${entry.part.id}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/40 p-3"
                  >
                    <div>
                      <p className="text-xs font-bold text-blue-700 uppercase">
                        {skill === "READING" ? `Passage ${idx + 1}` : `Section ${idx + 1}`} ·
                        Câu {startNum}–{Math.max(startNum, endNum)}
                      </p>
                      <p className="text-sm font-semibold text-slate-900">
                        {entry.part.passageTitle ?? entry.part.title}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Di chuyển lên"
                        disabled={idx === 0}
                        onClick={() => movePart(idx, -1)}
                        className="rounded border border-slate-200 bg-white p-1.5 text-slate-700 disabled:opacity-40"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Di chuyển xuống"
                        disabled={idx === selectedParts.length - 1}
                        onClick={() => movePart(idx, 1)}
                        className="rounded border border-slate-200 bg-white p-1.5 text-slate-700 disabled:opacity-40"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Bỏ khỏi danh sách"
                        onClick={() =>
                          setSelectedParts((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded border border-rose-200 bg-white p-1.5 text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              loading={assembleMutation.isPending}
              disabled={selectedParts.length === 0}
              onClick={() => assembleMutation.mutate(false)}
            >
              Tạo bản nháp &amp; Sửa tiếp
            </Button>
            <Button
              variant="primary"
              loading={assembleMutation.isPending}
              disabled={selectedParts.length === 0}
              onClick={() => assembleMutation.mutate(true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              Ghép, Kiểm tra &amp; Xuất bản
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
