"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ExamHeader,
  ExamShell,
  QuestionNavigator,
} from "@/components/exam/exam-shell";
import { ListeningExamView } from "@/components/exam/listening-exam-view";
import { ReadingExamView } from "@/components/exam/reading-exam-view";
import { QueryState } from "@/components/ui";
import { teacherExamTestsApi } from "@/lib/api/endpoints";
import { examKeys } from "@/lib/api/query-keys";
import type { ExamAnswerValue } from "@/lib/api/types";

export default function TeacherPreviewExamTestPage() {
  const params = useParams<{ testId: string }>();
  const testId = decodeURIComponent(params.testId);

  const previewQuery = useQuery({
    queryKey: examKeys.teacherTestPreview(testId),
    queryFn: () => teacherExamTestsApi.preview(testId),
  });

  const test = previewQuery.data;
  const [selectedPartId, setActivePartId] = useState<string>("");
  const activePartId =
    test?.parts.some((p) => p.id === selectedPartId)
      ? selectedPartId
      : (test?.parts[0]?.id ?? "");
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [sampleAnswers, setSampleAnswers] = useState<Record<string, ExamAnswerValue>>({});
  const [flaggedIds] = useState<Set<string>>(new Set());

  return (
    <ExamShell backHref={`/teacher/question-bank/${encodeURIComponent(testId)}/edit`}>
      <QueryState
        isLoading={previewQuery.isLoading}
        isError={previewQuery.isError}
        error={previewQuery.error}
        isEmpty={!test}
        emptyTitle="Không thể tải bản xem trước"
        emptyDescription="Đề thi chưa có nội dung hợp lệ để xem trước."
        onRetry={() => void previewQuery.refetch()}
      >
        {test && (
          <div className="flex min-h-screen flex-col">
            <ExamHeader
              title={test.title}
              skill={test.skill}
              mode={test.allowedModes.includes("FULL") ? "FULL" : "PART"}
              backHref={`/teacher/question-bank/${encodeURIComponent(testId)}/edit`}
              isPreview
            />

            <div className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-center text-xs font-medium text-blue-950">
              Chế độ xem trước góc nhìn Học viên — Đáp án và Transcript của Giảng viên đã được ẩn hoàn toàn.
            </div>

            <main className="flex flex-1 flex-col">
              {test.skill === "READING" ? (
                <ReadingExamView
                  parts={test.parts}
                  activePartId={activePartId}
                  onSelectPart={setActivePartId}
                  answers={sampleAnswers}
                  flaggedIds={flaggedIds}
                  activeQuestionId={activeQuestionId}
                  onAnswerChange={(qid, val) =>
                    setSampleAnswers((prev) => ({ ...prev, [qid]: val }))
                  }
                />
              ) : (
                <ListeningExamView
                  parts={test.parts}
                  activePartId={activePartId}
                  onSelectPart={setActivePartId}
                  answers={sampleAnswers}
                  flaggedIds={flaggedIds}
                  activeQuestionId={activeQuestionId}
                  onAnswerChange={(qid, val) =>
                    setSampleAnswers((prev) => ({ ...prev, [qid]: val }))
                  }
                />
              )}
            </main>

            <QuestionNavigator
              parts={test.parts}
              activePartId={activePartId}
              answers={sampleAnswers}
              flaggedIds={flaggedIds}
              activeQuestionId={activeQuestionId}
              onSelectQuestion={(pid, qid) => {
                setActivePartId(pid);
                setActiveQuestionId(qid);
              }}
            />
          </div>
        )}
      </QueryState>
    </ExamShell>
  );
}
