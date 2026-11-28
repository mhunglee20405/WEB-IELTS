"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Headphones,
  Languages,
  Lock,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { ExamListeningPlayer } from "@/components/exam/exam-listening-player";
import {
  ReadingVocabToolbarButton,
  ReadingVocabWorkspace,
  usePassageSelectionCapture,
} from "@/components/exam/reading-vocab-workspace";
import { Badge, Card, PageHeader, QueryState, SafeHtml } from "@/components/ui";
import { examAttemptsApi, readingTranslationsApi } from "@/lib/api/endpoints";
import { examKeys } from "@/lib/api/query-keys";
import { formatExamDurationSeconds } from "@/lib/exam/question-meta";
import { cn } from "@/lib/utils/cn";

export default function StudentExamResultPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = decodeURIComponent(params.attemptId);
  const [reviewFilter, setReviewFilter] = useState<"ALL" | "WRONG_ONLY">("ALL");
  const [selectedTranscriptPartId, setSelectedTranscriptPartId] = useState<string>("");
  const [selectedReadingPartId, setSelectedReadingPartId] = useState<string>("");
  const [vocabDrawerOpen, setVocabDrawerOpen] = useState(false);
  const readingReviewPassageRef = useRef<HTMLDivElement>(null);
  const {
    candidate: readingSelectionCandidate,
    captureSelection: captureReadingSelection,
    clearCandidate: clearReadingSelection,
  } = usePassageSelectionCapture(readingReviewPassageRef, true);

  const resultQuery = useQuery({
    queryKey: examKeys.attemptResult(attemptId),
    queryFn: () => examAttemptsApi.getResult(attemptId),
  });

  const result = resultQuery.data;

  const reviewQuery = useQuery({
    queryKey: examKeys.attemptReview(attemptId),
    queryFn: () => examAttemptsApi.getReview(attemptId),
    enabled: Boolean(result?.answerReviewAvailable ?? true),
  });

  const eligibilityQuery = useQuery({
    queryKey: examKeys.translationEligibility(result?.testId ?? ""),
    queryFn: () => readingTranslationsApi.getEligibility(result!.testId),
    enabled: Boolean(result && result.skill === "READING"),
  });

  const reviewItems = reviewQuery.data?.items ?? [];
  const reviewParts = reviewQuery.data?.parts ?? [];
  const activeTranscriptPart =
    reviewParts.find((p) => p.id === selectedTranscriptPartId) ?? reviewParts[0];
  const activeReadingPart =
    reviewParts.find((p) => p.id === selectedReadingPartId) ?? reviewParts[0];
  const filteredReviewItems =
    reviewFilter === "WRONG_ONLY"
      ? reviewItems.filter((item) => !item.isCorrect)
      : reviewItems;

  const eligiblePassages =
    eligibilityQuery.data?.passages.filter((p) => p.eligible) ?? [];

  const primaryTranslatePassageId =
    result?.partId && eligiblePassages.some((p) => p.passageId === result.partId)
      ? result.partId
      : eligiblePassages[0]?.passageId;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={
            result
              ? `/student/practice/${encodeURIComponent(result.testId)}`
              : "/student/practice"
          }
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại chi tiết đề thi
        </Link>

        {result?.studentAssignmentId && (
          <Link
            href={`/student/assignments/${encodeURIComponent(result.studentAssignmentId)}`}
            className="inline-flex min-h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
          >
            Quay lại bài tập được giao
          </Link>
        )}
      </div>

      <QueryState
        isLoading={resultQuery.isLoading}
        isError={resultQuery.isError}
        error={resultQuery.error}
        isEmpty={!result}
        emptyTitle="Chưa tìm thấy kết quả bài thi"
        emptyDescription="Lượt làm bài chưa hoàn tất hoặc đã hết hạn lưu trữ."
        onRetry={() => void resultQuery.refetch()}
      >
        {result && (
          <>
            <PageHeader
              title={`Kết quả: ${result.testTitle}`}
              subtitle={`Chế độ ${result.mode === "FULL" ? "Full Test" : "Part Practice"} · Ngưỡng đạt: ≥ ${result.passThresholdPercent}%`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/student/practice/${encodeURIComponent(result.testId)}`}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Làm lại đề này
                  </Link>
                  {result.skill === "READING" &&
                    result.translationEligible &&
                    primaryTranslatePassageId && (
                      <Link
                        href={`/student/reading/${encodeURIComponent(result.testId)}/translate/${encodeURIComponent(primaryTranslatePassageId)}`}
                        data-testid="result-translate-cta"
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        <Languages className="h-4 w-4" />
                        Dịch Passage ngay
                      </Link>
                    )}
                </div>
              }
            />

            {/* Score Summary Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                className={cn(
                  "border-2",
                  result.passed
                    ? "border-emerald-300 bg-emerald-50/40"
                    : "border-rose-300 bg-rose-50/40",
                )}
              >
                <p className="text-xs font-semibold text-slate-600 uppercase">
                  Kết luận đạt ngưỡng
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {result.passed ? (
                    <Badge variant="success">ĐẠT (PASS ≥ {result.passThresholdPercent}%)</Badge>
                  ) : (
                    <Badge variant="danger">CHƯA ĐẠT (&lt; {result.passThresholdPercent}%)</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  {result.status === "EXPIRED" ? "Tự động nộp khi hết giờ" : "Đã hoàn thành"}
                </p>
              </Card>

              <Card>
                <p className="text-xs font-semibold text-slate-600 uppercase">
                  Điểm số &amp; Số câu đúng
                </p>
                <p
                  data-testid="result-score-percent"
                  className="mt-2 text-3xl font-bold text-slate-900 tabular-nums"
                >
                  {result.scorePercent}%
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Đúng <strong>{result.correctCount}</strong> / {result.totalQuestions} câu
                </p>
              </Card>

              <Card>
                <p className="text-xs font-semibold text-slate-600 uppercase">
                  Band quy đổi tham khảo
                </p>
                <p className="mt-2 text-3xl font-bold text-blue-700 tabular-nums">
                  {result.ieltsBandEstimate !== null &&
                  result.ieltsBandEstimate !== undefined
                    ? result.ieltsBandEstimate.toFixed(1)
                    : "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Ước lượng nội bộ theo tỉ lệ câu đúng
                </p>
              </Card>

              <Card>
                <p className="text-xs font-semibold text-slate-600 uppercase">
                  Thời gian làm bài
                </p>
                <p className="mt-2 text-3xl font-bold text-slate-900 tabular-nums">
                  {formatExamDurationSeconds(result.timeSpentSeconds)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Nộp lúc{" "}
                  {new Date(result.submittedAt).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </Card>
            </div>

            {/* Per-Part Breakdown Table (Reading & Listening multi-part exams) */}
            {(result.skill === "READING" || result.skill === "LISTENING") && (
            <Card>
              <h2 className="mb-3 text-base font-bold text-slate-900">
                Phân tích theo từng phần ({result.skill === "READING" ? "Passage" : "Section"})
              </h2>
              <div className="overflow-x-auto">
                <table className="lms-table w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5">Phần thi</th>
                      <th className="px-4 py-2.5">Số câu đúng</th>
                      <th className="px-4 py-2.5">Tỉ lệ</th>
                      <th className="px-4 py-2.5 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.partBreakdown.map((part) => {
                      const partPassed = part.percentage >= result.passThresholdPercent;
                      return (
                        <tr key={part.partId}>
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {part.title}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums">
                            {part.correctCount}/{part.totalCount}
                          </td>
                          <td className="px-4 py-2.5 font-semibold tabular-nums">
                            {part.percentage}%
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Badge variant={partPassed ? "success" : "warning"}>
                              {partPassed ? "Đạt ≥ 70%" : "Dưới 70%"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
            )}

            {/* Reading Translation Gate (Shown ONLY for READING tests) */}
            {result.skill === "READING" && (
              <Card
                className={cn(
                  "border",
                  result.translationEligible
                    ? "border-blue-200 bg-blue-50/40"
                    : "border-slate-200 bg-slate-50",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Languages className="h-5 w-5 text-blue-700" />
                      <h2 className="text-base font-bold text-slate-900">
                        Luyện dịch Reading nâng cao
                      </h2>
                    </div>
                    <p className="text-sm text-slate-700">
                      {result.translationEligibilityHint ??
                        (result.passed
                          ? "Các Passage đủ điều kiện đã được mở khóa dịch."
                          : "Hãy đạt tối thiểu 70% ở Passage hoặc Full Test để mở khóa dịch tiếng Việt.")}
                    </p>
                  </div>

                  {!result.passed && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                      Chưa mở khóa dịch
                    </span>
                  )}
                </div>

                {eligiblePassages.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {eligiblePassages.map((p) => (
                      <Link
                        key={p.passageId}
                        href={`/student/reading/${encodeURIComponent(result.testId)}/translate/${encodeURIComponent(p.passageId)}`}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                      >
                        <Languages className="h-3.5 w-3.5" />
                        Dịch Passage {p.partNumber}: {p.passageTitle}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Reading Passage Review & Contextual Vocabulary Notebook */}
            {result.skill === "READING" && reviewParts.length > 0 && activeReadingPart && (
              <Card className="space-y-4 border-indigo-200 bg-indigo-50/20">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-indigo-700" />
                      <h2 className="text-base font-bold text-slate-900">
                        Đọc lại bài &amp; Sổ tay từ vựng theo ngữ cảnh
                      </h2>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Bôi đen từ bất kỳ trên bài đọc để lưu vào sổ cá nhân hoặc mở Sổ từ vựng gợi ý từ Giảng viên.
                    </p>
                  </div>
                  <ReadingVocabToolbarButton
                    passageId={activeReadingPart.id}
                    enabled
                    onClick={() => setVocabDrawerOpen(true)}
                  />
                </div>

                {reviewParts.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {reviewParts.map((part) => (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => setSelectedReadingPartId(part.id)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                          part.id === activeReadingPart.id
                            ? "bg-indigo-600 text-white"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        Passage {part.partNumber}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  ref={readingReviewPassageRef}
                  onMouseUp={captureReadingSelection}
                  className="max-h-[420px] select-text overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 text-[15px] leading-7 text-slate-800 shadow-2xs"
                >
                  <p className="mb-3 text-sm font-bold text-slate-900">
                    {activeReadingPart.passageTitle ?? activeReadingPart.title}
                  </p>
                  {activeReadingPart.passageHtml ? (
                    <SafeHtml html={activeReadingPart.passageHtml} preset="richText" />
                  ) : (
                    <p className="text-xs italic text-slate-500">
                      Nội dung bài đọc không có sẵn ở chế độ xem tóm tắt này.
                    </p>
                  )}
                </div>

                <ReadingVocabWorkspace
                  passageId={activeReadingPart.id}
                  testId={result.testId}
                  testTitle={result.testTitle}
                  passageTitle={activeReadingPart.passageTitle ?? activeReadingPart.title}
                  enabled
                  drawerOpen={vocabDrawerOpen}
                  onOpenDrawerChange={setVocabDrawerOpen}
                  selectionCandidate={readingSelectionCandidate}
                  onClearSelection={clearReadingSelection}
                />
              </Card>
            )}

            {/* Listening Audio Script & Transcript Section (Shown ONLY for LISTENING tests) */}
            {result.skill === "LISTENING" && (
              <Card
                className={cn(
                  "border",
                  result.answerReviewAvailable
                    ? "border-blue-200 bg-blue-50/20"
                    : "border-slate-200 bg-slate-50",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Headphones className="h-5 w-5 text-blue-700" />
                      <h2 className="text-base font-bold text-slate-900">
                        Audio Script & Lời thoại bài nghe
                      </h2>
                    </div>
                    <p className="text-sm text-slate-700">
                      {result.answerReviewAvailable
                        ? "Nghe lại từng Section và đối chiếu với bản ghi âm lời thoại (Transcript) đầy đủ."
                        : `Bạn cần đạt tối thiểu ${result.passThresholdPercent}% để mở khóa toàn bộ Audio Script và lời thoại chi tiết.`}
                    </p>
                  </div>

                  {!result.answerReviewAvailable && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                      Chưa mở khóa Script
                    </span>
                  )}
                </div>

                {result.answerReviewAvailable && reviewParts.length > 0 && (
                  <div className="space-y-4">
                    {/* Section Selector Tabs */}
                    <div
                      role="tablist"
                      aria-label="Danh sách section transcript"
                      className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                    >
                      {reviewParts.map((part) => {
                        const isSelected = (activeTranscriptPart?.id ?? "") === part.id;
                        return (
                          <button
                            key={part.id}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            onClick={() => setSelectedTranscriptPartId(part.id)}
                            className={cn(
                              "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                              isSelected
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                            )}
                          >
                            <Headphones className="h-3.5 w-3.5" />
                            <span>Section {part.partNumber}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Section Player & Transcript Display */}
                    {activeTranscriptPart && (
                      <div className="space-y-3">
                        {activeTranscriptPart.audioAsset && (
                          <ExamListeningPlayer
                            sectionTitle={activeTranscriptPart.title}
                            audioAsset={activeTranscriptPart.audioAsset}
                          />
                        )}

                        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                            Bản ghi lời thoại (Full Audio Transcript) — {activeTranscriptPart.title}
                          </h3>
                          {activeTranscriptPart.transcript ? (
                            <div className="max-h-96 overflow-y-auto rounded-lg bg-slate-50 p-4 font-mono text-xs sm:text-sm leading-relaxed text-slate-800 whitespace-pre-line border border-slate-200">
                              {activeTranscriptPart.transcript}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 italic">
                              Chưa có bản ghi âm lời thoại cho phần này.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* Conditional Answer Review Gate */}
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Đáp án &amp; Giải thích chi tiết
                  </h2>
                  <p className="text-xs text-slate-600">
                    Đối chiếu câu trả lời của bạn với đáp án chuẩn và lời giải chi tiết.
                  </p>
                </div>

                {result.answerReviewAvailable && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setReviewFilter("ALL")}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-semibold",
                        reviewFilter === "ALL"
                          ? "bg-white text-blue-700 shadow-xs"
                          : "text-slate-600",
                      )}
                    >
                      Tất cả ({reviewItems.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewFilter("WRONG_ONLY")}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-semibold",
                        reviewFilter === "WRONG_ONLY"
                          ? "bg-white text-rose-700 shadow-xs"
                          : "text-slate-600",
                      )}
                    >
                      Câu sai ({reviewItems.filter((i) => !i.isCorrect).length})
                    </button>
                  </div>
                )}
              </div>

              {!result.answerReviewAvailable ? (
                <div
                  data-testid="answer-review-locked-box"
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center"
                >
                  <Lock className="h-8 w-8 text-amber-600" />
                  <p className="mt-3 text-sm font-bold text-slate-900">
                    Đáp án chi tiết đang được khóa
                  </p>
                  <p className="mt-1 max-w-md text-xs text-slate-600">
                    {result.answerReviewLockedReason ??
                      `Bạn cần đạt tối thiểu ${result.passThresholdPercent}% để mở khóa đáp án đúng và giải thích từng câu. Hãy luyện tập lại để nâng điểm!`}
                  </p>
                </div>
              ) : (
                <QueryState
                  isLoading={reviewQuery.isLoading}
                  isError={reviewQuery.isError}
                  error={reviewQuery.error}
                  isEmpty={filteredReviewItems.length === 0}
                  emptyTitle="Không có câu hỏi nào trong bộ lọc này"
                  emptyDescription="Tuyệt vời — không có câu sai nào ở bộ lọc hiện tại."
                  onRetry={() => void reviewQuery.refetch()}
                >
                  <div className="space-y-3" data-testid="answer-review-list">
                    {filteredReviewItems.map((item) => {
                      const stuText = Array.isArray(item.studentAnswer)
                        ? item.studentAnswer.join(", ")
                        : (item.studentAnswer ?? "— (Bỏ trống)");
                      const corrText = Array.isArray(item.correctAnswer)
                        ? item.correctAnswer.join(", ")
                        : (item.correctAnswer ?? "—");
                      return (
                        <div
                          key={item.questionId}
                          className={cn(
                            "rounded-xl border p-4",
                            item.isCorrect
                              ? "border-emerald-200 bg-emerald-50/30"
                              : "border-rose-200 bg-rose-50/30",
                          )}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="whitespace-pre-line text-sm font-semibold text-slate-900 leading-snug">
                              <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded bg-slate-900 px-1.5 text-xs text-white">
                                {item.questionNumber}
                              </span>
                              {item.prompt}
                            </p>
                            {item.isCorrect ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" />
                                Đúng
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                                <XCircle className="h-4 w-4" />
                                Sai
                              </span>
                            )}
                          </div>

                          <div className="mt-2.5 grid gap-2 text-xs sm:grid-cols-2">
                            <div
                              className={cn(
                                "rounded-lg px-3 py-2 ring-1",
                                item.isCorrect
                                  ? "bg-emerald-50/70 ring-emerald-200"
                                  : "bg-rose-50/70 ring-rose-200",
                              )}
                            >
                              <span className="text-slate-600">Câu trả lời của bạn: </span>
                              <strong
                                className={item.isCorrect ? "text-emerald-900" : "text-rose-800"}
                              >
                                {stuText}
                              </strong>
                            </div>
                            <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-emerald-200">
                              <span className="text-slate-500">Đáp án chuẩn: </span>
                              <strong className="text-emerald-800">{corrText}</strong>
                              {item.acceptedAnswers && item.acceptedAnswers.length > 1 && (
                                <span className="ml-1.5 text-slate-500">
                                  (Chấp nhận: {item.acceptedAnswers.join(" / ")})
                                </span>
                              )}
                            </div>
                          </div>

                          {item.options && item.options.length > 0 && (
                            <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                              {item.options.map((opt) => {
                                const corrSet = new Set(
                                  (Array.isArray(item.correctAnswer)
                                    ? item.correctAnswer
                                    : item.correctAnswer
                                      ? [String(item.correctAnswer)]
                                      : []
                                  ).map((k) => k.trim().toUpperCase()),
                                );
                                const stuSet = new Set(
                                  (Array.isArray(item.studentAnswer)
                                    ? item.studentAnswer
                                    : item.studentAnswer
                                      ? [String(item.studentAnswer)]
                                      : []
                                  ).map((k) => k.trim().toUpperCase()),
                                );
                                const keyNorm = opt.key.trim().toUpperCase();
                                const isOptCorrect = corrSet.has(keyNorm);
                                const isOptChosen = stuSet.has(keyNorm);
                                return (
                                  <div
                                    key={opt.key}
                                    className={cn(
                                      "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                                      isOptCorrect
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-950 font-semibold"
                                        : isOptChosen
                                          ? "border-rose-300 bg-rose-50 text-rose-900 font-semibold"
                                          : "border-slate-200 bg-white text-slate-700",
                                    )}
                                  >
                                    <span>
                                      <strong className="mr-1.5">{opt.key}.</strong>
                                      {opt.text}
                                    </span>
                                    {isOptCorrect && (
                                      <span className="shrink-0 text-[10px] font-bold text-emerald-700">
                                        Đáp án đúng
                                      </span>
                                    )}
                                    {!isOptCorrect && isOptChosen && (
                                      <span className="shrink-0 text-[10px] font-bold text-rose-700">
                                        Bạn chọn
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {(item.explanation || item.referenceParagraph) && (
                            <div className="mt-2.5 rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                              {item.referenceParagraph && (
                                <span className="mr-1.5 rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800">
                                  Đoạn {item.referenceParagraph}
                                </span>
                              )}
                              {item.explanation && (
                                <>
                                  <strong className="text-blue-950">Giải thích: </strong>
                                  <span>{item.explanation}</span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </QueryState>
              )}
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
