"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  MessageSquareText,
  Save,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReadingSplitWorkspace } from "@/components/student/reading-split-workspace";
import {
  ConfirmDialog,
  PageHeader,
  QueryState,
  SafeHtml,
  StatusBadge,
} from "@/components/ui";
import { studentAssignmentsApi } from "@/lib/api/endpoints";
import { ApiError, getFriendlyErrorMessage } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import type { TranslationWorkspace } from "@/lib/api/types";
import { formatVnDateTime } from "@/lib/time/vn-time";

interface TranslationEditorProps {
  workspace: TranslationWorkspace;
  studentAssignmentId: string;
}

function TranslationEditor({ workspace, studentAssignmentId }: TranslationEditorProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState<string>(() => workspace.draftText ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const isFrozen = workspace.status === "submitted" || workspace.status === "approved";

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      studentAssignmentsApi.saveTranslationDraft(studentAssignmentId, {
        translatedText: text,
      }),
    onSuccess: async () => {
      setFeedbackBanner({
        kind: "success",
        message: "Đã lưu bản nháp dịch thuật thành công.",
      });
      await queryClient.invalidateQueries({
        queryKey: studentKeys.assignmentTranslation(studentAssignmentId),
      });
    },
    onError: (err) => {
      setFeedbackBanner({
        kind: "error",
        message: getFriendlyErrorMessage(err),
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      studentAssignmentsApi.submitTranslation(studentAssignmentId, {
        translatedText: text.trim(),
      }),
    onSuccess: async () => {
      setConfirmOpen(false);
      setFeedbackBanner({
        kind: "success",
        message: "Đã nộp bài dịch và khóa chỉnh sửa chờ giáo viên nhận xét.",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: studentKeys.assignmentTranslation(studentAssignmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: studentKeys.assignments("all", "all", 1),
        }),
      ]);
    },
    onError: (err) => {
      setConfirmOpen(false);
      setFeedbackBanner({
        kind: "error",
        message: getFriendlyErrorMessage(err),
      });
    },
  });

  const canSubmit = text.trim().length >= 10 && !isFrozen;

  const editorPanel = (
    <div className="space-y-4">
      <div className="lms-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Trạng thái bài dịch:</span>
            <StatusBadge status={workspace.status} />
          </div>
          {workspace.submittedAt ? (
            <span className="text-xs text-slate-600">
              Đã nộp lúc: {formatVnDateTime(workspace.submittedAt)}
            </span>
          ) : null}
        </div>

        {isFrozen ? (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden={true} />
            <p>
              {workspace.status === "approved"
                ? "Bản dịch đã được giảng viên duyệt hoàn tất."
                : "Bản dịch đã được nộp và khóa chỉnh sửa để giảng viên chấm. Nếu giảng viên yêu cầu sửa lại, khung nhập sẽ được mở khóa."}
            </p>
          </div>
        ) : null}

        {workspace.teacherFeedback ? (
          <div className="space-y-1 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
            <p className="flex items-center gap-1.5 font-semibold">
              <MessageSquareText className="h-4 w-4" aria-hidden={true} />
              Nhận xét của giảng viên
              {workspace.reviewedAt ? (
                <span className="text-xs font-normal text-indigo-800">
                  ({formatVnDateTime(workspace.reviewedAt)})
                </span>
              ) : null}
            </p>
            <p>{workspace.teacherFeedback}</p>
          </div>
        ) : null}
      </div>

      {feedbackBanner ? (
        <div
          role={feedbackBanner.kind === "error" ? "alert" : "status"}
          className={
            feedbackBanner.kind === "success"
              ? "flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"
              : "rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950"
          }
        >
          {feedbackBanner.kind === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden={true} />
          ) : null}
          <span>{feedbackBanner.message}</span>
        </div>
      ) : null}

      <div className="lms-card space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="translation-draft-textarea"
            className="text-sm font-semibold text-slate-900"
          >
            Bản dịch tiếng Việt của bạn
          </label>
          <span className="text-xs font-medium tabular-nums text-slate-700">
            {text.length} ký tự
          </span>
        </div>
        <p id="translation-draft-hint" className="text-xs text-slate-600">
          Dịch sát nghĩa học thuật toàn bộ đoạn văn bên trái. Tối thiểu 10 ký tự để nộp.
        </p>
        <textarea
          id="translation-draft-textarea"
          rows={12}
          readOnly={isFrozen}
          aria-describedby="translation-draft-hint"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhập bản dịch tiếng Việt tương ứng với từng đoạn văn..."
          className="lms-input min-h-[260px] resize-y"
        />

        {!isFrozen ? (
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={saveDraftMutation.isPending || submitMutation.isPending}
              onClick={() => saveDraftMutation.mutate()}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              <Save className="h-4 w-4" aria-hidden={true} />
              {saveDraftMutation.isPending ? "Đang lưu nháp..." : "Lưu bản nháp"}
            </button>
            <button
              type="button"
              disabled={!canSubmit || submitMutation.isPending}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden={true} />
              Nộp bản dịch
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận nộp bản dịch chính thức?"
        description="Sau khi nộp, bản dịch sẽ bị khóa chỉnh sửa để gửi cho giảng viên nhận xét. Bạn có chắc chắn muốn nộp ngay?"
        confirmLabel="Nộp & Khóa chỉnh sửa"
        cancelLabel="Tiếp tục chỉnh sửa"
        lightDismiss={false}
        isSubmitting={submitMutation.isPending}
        onConfirm={() => submitMutation.mutate()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );

  return (
    <ReadingSplitWorkspace
      leftLabel="Bài đọc gốc"
      rightLabel="Bản dịch tiếng Việt"
      leftTitle={workspace.passageTitle}
      leftContent={<SafeHtml html={workspace.passageHtml} lang="en" preset="richText" />}
      rightContent={editorPanel}
    />
  );
}

export default function StudentAssignmentTranslationPage() {
  const params = useParams<{ studentAssignmentId: string }>();
  const studentAssignmentId = params.studentAssignmentId;

  const translationQuery = useQuery({
    queryKey: studentKeys.assignmentTranslation(studentAssignmentId),
    queryFn: () => studentAssignmentsApi.getTranslation(studentAssignmentId),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 404)) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const isLocked =
    translationQuery.isError &&
    translationQuery.error instanceof ApiError &&
    translationQuery.error.statusCode === 403;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bài dịch Reading đối chiếu"
        subtitle="Đọc song song đoạn văn gốc bên trái và hoàn thiện bản dịch tiếng Việt bên phải."
        actions={
          <Link
            href={`/student/assignments/${studentAssignmentId}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Quay lại bài tập
          </Link>
        }
      />

      {isLocked ? (
        <section className="lms-card space-y-3 border-amber-300 bg-amber-50 text-amber-950">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden={true} />
            <div>
              <h2 className="text-base font-bold">Chưa mở khóa phần dịch đối chiếu</h2>
              <p className="text-sm">
                Bạn cần đạt tối thiểu 70% ở phần câu hỏi Reading trước khi mở khóa khu vực dịch
                bài.
              </p>
            </div>
          </div>
          <div>
            <Link
              href={`/student/assignments/${studentAssignmentId}`}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Quay lại làm bài Reading
            </Link>
          </div>
        </section>
      ) : (
        <QueryState
          isLoading={translationQuery.isLoading}
          isError={translationQuery.isError}
          error={translationQuery.error}
          onRetry={() => void translationQuery.refetch()}
          loadingLabel="Đang tải không gian dịch thuật..."
        >
          {translationQuery.data ? (
            <TranslationEditor
              key={`${translationQuery.data.translationId}-${translationQuery.data.status}`}
              workspace={translationQuery.data}
              studentAssignmentId={studentAssignmentId}
            />
          ) : null}
        </QueryState>
      )}
    </div>
  );
}

