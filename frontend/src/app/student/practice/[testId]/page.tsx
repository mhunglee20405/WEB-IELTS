"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Clock,
  Headphones,
  Layers,
  Play,
  RotateCcw,
} from "lucide-react";
import {
  AttemptResumeDialog,
} from "@/components/exam/exam-shell";
import { ReadingExamView } from "@/components/exam/reading-exam-view";
import { Badge, Button, Card, PageHeader, QueryState } from "@/components/ui";
import { examAttemptsApi, examTestsApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys } from "@/lib/api/query-keys";
import type { ExamAnswerValue, ExamMode } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

export default function StudentPracticeDetailPage() {
  const params = useParams<{ testId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const testId = decodeURIComponent(params.testId);

  const requestedMode = searchParams.get("mode") as ExamMode | null;
  const requestedPartId = searchParams.get("partId");
  const studentAssignmentId = searchParams.get("studentAssignmentId");

  const testQuery = useQuery({
    queryKey: examKeys.testDetail(testId),
    queryFn: () => examTestsApi.getById(testId),
  });

  const test = testQuery.data;
  const [modeChoice, setSelectedMode] = useState<ExamMode | null>(null);
  const [partChoice, setSelectedPartId] = useState<string>("");
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [studyReaderOpen, setStudyReaderOpen] = useState(false);
  const [studyAnswers, setStudyAnswers] = useState<Record<string, ExamAnswerValue | undefined>>({});
  const [studyPartIdOverride, setStudyPartIdOverride] = useState<string>("");

  const activeStudyPartId =
    studyPartIdOverride && test?.parts.some((p) => p.id === studyPartIdOverride)
      ? studyPartIdOverride
      : (requestedPartId && test?.parts.some((p) => p.id === requestedPartId)
          ? requestedPartId
          : (test?.parts[0]?.id ?? ""));

  const studyPartQuery = useQuery({
    queryKey: examKeys.testPartDetail(testId, activeStudyPartId),
    queryFn: () => examTestsApi.getPart(testId, activeStudyPartId),
    enabled: Boolean(studyReaderOpen && test?.skill === "READING" && activeStudyPartId),
  });

  const isQuizSkill = test?.skill === "VOCABULARY" || test?.skill === "GRAMMAR";

  const selectedMode: ExamMode = isQuizSkill
    ? "FULL"
    : modeChoice && test?.allowedModes.includes(modeChoice)
      ? modeChoice
      : requestedMode && test?.allowedModes.includes(requestedMode)
        ? requestedMode
        : test?.allowedModes.includes("PART")
          ? "PART"
          : "FULL";

  const selectedPartId =
    partChoice && test?.parts.some((p) => p.id === partChoice)
      ? partChoice
      : requestedPartId && test?.parts.some((p) => p.id === requestedPartId)
        ? requestedPartId
        : (test?.parts[0]?.id ?? "");

  const startMutation = useMutation({
    mutationFn: (payload: { mode: ExamMode; partId?: string | null }) =>
      examAttemptsApi.start({
        testId,
        mode: payload.mode,
        partId: payload.mode === "PART" ? payload.partId : null,
        studentAssignmentId,
      }),
    onSuccess: (attempt) => {
      router.push(`/student/exam/${encodeURIComponent(attempt.attemptId)}`);
    },
  });

  const handleLaunchClick = () => {
    if (!test) return;
    if (test.activeAttempt) {
      setResumeDialogOpen(true);
      return;
    }
    startMutation.mutate({
      mode: selectedMode,
      partId: selectedMode === "PART" ? selectedPartId : null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/student/practice"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Thư viện đề
        </Link>
      </div>

      <QueryState
        isLoading={testQuery.isLoading}
        isError={testQuery.isError}
        error={testQuery.error}
        isEmpty={!test}
        emptyTitle="Không tìm thấy đề thi"
        emptyDescription="Đề thi có thể đã bị ẩn hoặc không tồn tại."
        onRetry={() => void testQuery.refetch()}
      >
        {test && (
          <>
            <PageHeader
              title={test.title}
              subtitle={
                test.subtitle ??
                (isQuizSkill
                  ? "Bài luyện tập trắc nghiệm Vocabulary / Grammar gồm 4 lựa chọn A, B, C, D kèm chấm điểm & giải thích chi tiết."
                  : "Chọn chế độ luyện từng phần (Part Practice) hoặc thi trọn bộ (Full Test).")
              }
              actions={
                <div className="flex items-center gap-2">
                  <Badge variant="info">
                    {test.skill === "READING"
                      ? "IELTS Reading"
                      : test.skill === "LISTENING"
                        ? "IELTS Listening"
                        : test.skill === "VOCABULARY"
                          ? "Vocabulary"
                          : "Grammar"}
                  </Badge>
                  <Badge variant="neutral">Phiên bản v{test.version}</Badge>
                </div>
              }
            />

            {test.activeAttempt && (
              <Card className="border-blue-300 bg-blue-50/70">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-blue-950">
                      Bạn đang có một lượt thi chưa nộp ({test.activeAttempt.answeredCount}/
                      {test.activeAttempt.totalQuestions} câu)
                    </p>
                    <p className="mt-0.5 text-xs text-blue-900">
                      Chế độ: {test.activeAttempt.mode === "FULL" ? "Full Test" : "Part Practice"}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      router.push(
                        `/student/exam/${encodeURIComponent(test.activeAttempt!.attemptId)}`,
                      )
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Tiếp tục bài đang làm
                  </Button>
                </div>
              </Card>
            )}

            {test.instructions && (
              <Card className="border-slate-200 bg-slate-50/70">
                <h2 className="text-sm font-bold text-slate-900">Hướng dẫn làm bài</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  {test.instructions}
                </p>
              </Card>
            )}

            {isQuizSkill ? (
              <Card className="space-y-3 border-indigo-200 bg-indigo-50/25">
                <h2 className="text-base font-bold text-slate-900">
                  Thông tin bài luyện tập Trắc nghiệm
                </h2>
                <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium ring-1 ring-slate-200">
                    <Layers className="h-4 w-4 text-indigo-600" />
                    {test.totalQuestions} câu hỏi trắc nghiệm (A/B/C/D)
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium ring-1 ring-slate-200">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    {test.totalDurationSeconds > 0
                      ? `${Math.round(test.totalDurationSeconds / 60)} phút`
                      : "Không giới hạn thời gian"}
                  </span>
                </div>
              </Card>
            ) : (
            <>
            {/* Dynamic Mode Selection */}
            <div className="grid gap-4 md:grid-cols-2">
              {test.allowedModes.includes("PART") && (
                <Card
                  className={cn(
                    "cursor-pointer border-2 transition-colors",
                    selectedMode === "PART"
                      ? "border-blue-600 bg-blue-50/30"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="exam-mode"
                      value="PART"
                      checked={selectedMode === "PART"}
                      onChange={() => setSelectedMode("PART")}
                      className="mt-1 h-4 w-4 accent-blue-600"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-slate-900">
                          Luyện từng phần (Part Practice)
                        </span>
                        <Badge variant="info">Linh hoạt</Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-600">
                        Chọn chính xác 1 {test.skill === "READING" ? "Passage" : "Section"} để
                        tập trung luyện tốc độ và mở khóa phần dịch nếu đạt ≥ 70%.
                      </p>
                    </div>
                  </label>
                </Card>
              )}

              {test.allowedModes.includes("FULL") && (
                <Card
                  className={cn(
                    "cursor-pointer border-2 transition-colors",
                    selectedMode === "FULL"
                      ? "border-blue-600 bg-blue-50/30"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="radio"
                      name="exam-mode"
                      value="FULL"
                      checked={selectedMode === "FULL"}
                      onChange={() => setSelectedMode("FULL")}
                      className="mt-1 h-4 w-4 accent-blue-600"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-base font-bold text-slate-900">
                          Thi trọn bộ (Full Test)
                        </span>
                        <Badge variant="success">
                          {test.parts.length}{" "}
                          {test.skill === "READING" ? "Passages" : "Sections"}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-600">
                        Làm liền mạch {test.totalQuestions} câu hỏi trong{" "}
                        {Math.round(test.totalDurationSeconds / 60)} phút như phòng thi IELTS chuẩn.
                      </p>
                    </div>
                  </label>
                </Card>
              )}
            </div>

            {/* Dynamic Parts List */}
            <section aria-label="Cấu trúc các phần thi" className="space-y-3">
              <h2 className="text-base font-bold text-slate-900">
                Cấu trúc phần thi ({test.parts.length}{" "}
                {test.skill === "READING" ? "Passage" : "Section"})
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {test.parts.map((part) => {
                  const isChosen = selectedMode === "PART" && selectedPartId === part.id;
                  const partMinutes = Math.max(
                    1,
                    Math.round((part.durationSeconds ?? 1200) / 60),
                  );
                  return (
                    <button
                      key={part.id}
                      type="button"
                      disabled={selectedMode === "FULL"}
                      onClick={() => setSelectedPartId(part.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        selectedMode === "FULL"
                          ? "border-slate-200 bg-slate-50 opacity-85"
                          : isChosen
                            ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-400"
                            : "border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 uppercase">
                          {test.skill === "READING" ? (
                            <BookOpen className="h-3.5 w-3.5" />
                          ) : (
                            <Headphones className="h-3.5 w-3.5" />
                          )}
                          {part.partType === "PASSAGE" ? "Passage" : "Section"} {part.partNumber}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                          <Clock className="h-3.5 w-3.5" />
                          {partMinutes}p
                        </span>
                      </div>
                      <p className="mt-2 font-semibold text-slate-900">
                        {part.passageTitle ?? part.title}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-600">
                        <Layers className="h-3.5 w-3.5" />
                        Câu {part.questionNumberRange.start}–{part.questionNumberRange.end} (
                        {part.questionCount} câu)
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
            </>
            )}

            {startMutation.isError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {getFriendlyErrorMessage(startMutation.error)}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3">
              {test.skill === "READING" && test.parts.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  data-testid="toggle-reading-study-btn"
                  onClick={() => setStudyReaderOpen((v) => !v)}
                >
                  <BookMarked className="h-4 w-4 text-indigo-700" />
                  {studyReaderOpen
                    ? "Đóng chế độ Đọc & Học từ vựng"
                    : "Đọc & Học từ vựng (Không tính giờ)"}
                </Button>
              )}

              <Button
                variant="primary"
                size="lg"
                loading={startMutation.isPending}
                disabled={selectedMode === "PART" && !selectedPartId}
                onClick={handleLaunchClick}
                data-testid="start-exam-btn"
              >
                <Play className="h-4 w-4" />
                {isQuizSkill
                  ? "Bắt đầu làm bài"
                  : selectedMode === "FULL"
                    ? "Bắt đầu thi Full Test"
                    : "Bắt đầu luyện Part đã chọn"}
              </Button>
            </div>

            {studyReaderOpen && test.skill === "READING" && (
              <Card className="space-y-3 border-indigo-200 bg-indigo-50/20 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Chế độ Luyện tập Reading &amp; Sổ tay từ vựng (Không tính giờ)
                    </h2>
                    <p className="text-xs text-slate-600">
                      Bôi đen từ bất kỳ trên bài đọc để lưu vào sổ cá nhân hoặc mở ngăn kéo Sổ từ vựng.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {test.parts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setStudyPartIdOverride(p.id)}
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors",
                          p.id === activeStudyPartId
                            ? "bg-indigo-600 text-white"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        Passage {p.partNumber}
                      </button>
                    ))}
                  </div>
                </div>

                <QueryState
                  isLoading={studyPartQuery.isLoading}
                  isError={studyPartQuery.isError}
                  error={studyPartQuery.error}
                  isEmpty={!studyPartQuery.data}
                  onRetry={() => void studyPartQuery.refetch()}
                >
                  {studyPartQuery.data && (
                    <div className="h-[680px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      <ReadingExamView
                        parts={[studyPartQuery.data]}
                        activePartId={studyPartQuery.data.id}
                        onSelectPart={setStudyPartIdOverride}
                        answers={studyAnswers}
                        flaggedIds={new Set()}
                        activeQuestionId={null}
                        enableVocabNotebook
                        testId={test.id}
                        testTitle={test.title}
                        onAnswerChange={(qId, val) =>
                          setStudyAnswers((prev) => ({ ...prev, [qId]: val }))
                        }
                      />
                    </div>
                  )}
                </QueryState>
              </Card>
            )}

            <AttemptResumeDialog
              open={resumeDialogOpen}
              activeAttempt={test.activeAttempt ?? null}
              onClose={() => setResumeDialogOpen(false)}
              onResume={(attemptId) =>
                router.push(`/student/exam/${encodeURIComponent(attemptId)}`)
              }
              onStartFresh={() => {
                setResumeDialogOpen(false);
                startMutation.mutate({
                  mode: selectedMode,
                  partId: selectedMode === "PART" ? selectedPartId : null,
                });
              }}
            />
          </>
        )}
      </QueryState>
    </div>
  );
}
