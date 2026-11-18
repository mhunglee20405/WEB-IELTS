"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  CopyPlus,
  Edit3,
  Eye,
  Headphones,
  Layers,
  Plus,
  ShieldCheck,
  Trash2,
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
  Tabs,
} from "@/components/ui";
import { teacherExamTestsApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys } from "@/lib/api/query-keys";
import type {
  ExamSkill,
  ExamTestStatus,
  ExamTestSummary,
  ValidateExamTestResponse,
} from "@/lib/api/types";

type BankSkillTab = "ALL" | ExamSkill;

const STATUS_BADGE_MAP: Record<
  ExamTestStatus,
  { label: string; variant: "warning" | "success" | "neutral" }
> = {
  DRAFT: { label: "Bản nháp (DRAFT)", variant: "warning" },
  PUBLISHED: { label: "Đã xuất bản", variant: "success" },
  ARCHIVED: { label: "Đã lưu trữ", variant: "neutral" },
};

export default function TeacherQuestionBankPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [skillTab, setSkillTab] = useState<BankSkillTab>("ALL");
  const [statusFilter, setStatusFilter] = useState<"" | ExamTestStatus>("");
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
    validation?: ValidateExamTestResponse;
  } | null>(null);

  const skillParam = skillTab === "ALL" ? undefined : skillTab;
  const statusParam = statusFilter || undefined;
  const searchParam = search.trim() || undefined;

  const listQuery = useQuery({
    queryKey: examKeys.teacherBankList(skillParam, statusParam, searchParam),
    queryFn: () =>
      teacherExamTestsApi.list({
        skill: skillParam,
        status: statusParam,
        search: searchParam,
        limit: 50,
      }),
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: examKeys.teacherBankRoot });
  };

  const validateMutation = useMutation({
    mutationFn: (testId: string) => teacherExamTestsApi.validate(testId),
    onSuccess: (res) => {
      setFeedback({
        type: res.valid ? "success" : "error",
        text: res.valid
          ? "Đề thi đạt mọi điều kiện kiểm tra cấu trúc và đáp án."
          : `Đề thi có ${res.errors.length} lỗi cần khắc phục trước khi xuất bản.`,
        validation: res,
      });
    },
    onError: (err) => {
      setFeedback({ type: "error", text: getFriendlyErrorMessage(err) });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (testId: string) => teacherExamTestsApi.publish(testId),
    onSuccess: (updated) => {
      refreshAll();
      setFeedback({
        type: "success",
        text: `Đã xuất bản đề "${updated.title}". Phiên bản v${updated.version} hiện được khóa bất biến.`,
      });
    },
    onError: (err) => {
      setFeedback({ type: "error", text: getFriendlyErrorMessage(err) });
    },
  });

  const newVersionMutation = useMutation({
    mutationFn: (testId: string) => teacherExamTestsApi.newVersion(testId),
    onSuccess: (cloned) => {
      refreshAll();
      router.push(`/teacher/question-bank/${encodeURIComponent(cloned.id)}/edit`);
    },
    onError: (err) => {
      setFeedback({ type: "error", text: getFriendlyErrorMessage(err) });
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<ExamTestSummary | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (testId: string) => teacherExamTestsApi.delete(testId),
    onSuccess: (_, testId) => {
      refreshAll();
      setFeedback({
        type: "success",
        text: `Đã xóa đề thi "${deleteTarget?.title ?? testId}" thành công.`,
      });
      setDeleteTarget(null);
    },
    onError: (err) => {
      setFeedback({ type: "error", text: getFriendlyErrorMessage(err) });
      setDeleteTarget(null);
    },
  });

  const items = listQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kho đề thi IELTS (Question Bank v2)"
        subtitle="Quản lý đề Reading & Listening nhiều phần, 15 dạng câu hỏi IELTS, xem trước góc nhìn học viên và ghép Full Test."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/teacher/question-bank/full-test-builder"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Layers className="h-4 w-4" />
              Ghép Full Test
            </Link>
            <Link
              href="/teacher/question-bank/new"
              data-testid="create-exam-test-link"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Tạo Passage / Section mới
            </Link>
          </div>
        }
      />

      <FilterToolbar
        tabs={
          <Tabs
            ariaLabel="Lọc kho đề theo kỹ năng IELTS"
            items={[
              { id: "ALL", label: "Tất cả kỹ năng" },
              { id: "READING", label: "Reading Bank" },
              { id: "LISTENING", label: "Listening Bank" },
            ]}
            value={skillTab}
            hasPanels={false}
            onChange={(id) => setSkillTab(id as BankSkillTab)}
          />
        }
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tìm theo tên đề, chủ đề, tag..."
        />
        <select
          aria-label="Lọc trạng thái xuất bản"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "" | ExamTestStatus)}
          className="lms-input h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"
        >
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Bản nháp (DRAFT)</option>
          <option value="PUBLISHED">Đã xuất bản</option>
          <option value="ARCHIVED">Đã lưu trữ</option>
        </select>
      </FilterToolbar>

      {feedback && (
        <div
          role="status"
          aria-live="polite"
          className={
            feedback.type === "success"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              : "rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          }
        >
          <p className="font-semibold">{feedback.text}</p>
          {feedback.validation && feedback.validation.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              {feedback.validation.errors.map((err, idx) => (
                <li key={idx}>{err.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <QueryState
        isLoading={listQuery.isLoading}
        isError={listQuery.isError}
        error={listQuery.error}
        isEmpty={items.length === 0}
        emptyTitle="Chưa có đề thi phù hợp"
        emptyDescription="Nhấn 'Tạo Passage / Section mới' hoặc 'Ghép Full Test' để khởi tạo nội dung IELTS."
        onRetry={() => void listQuery.refetch()}
      >
        <div className="lms-card-grid">
          {items.map((test) => {
            const badge = STATUS_BADGE_MAP[test.status];
            return (
              <Card
                key={test.id}
                className="flex flex-col justify-between gap-4 border-slate-200"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      {test.skill === "READING" ? (
                        <BookOpen className="h-3.5 w-3.5" />
                      ) : (
                        <Headphones className="h-3.5 w-3.5" />
                      )}
                      {test.skill} · v{test.version}
                    </span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>

                  <h2 className="text-base font-bold text-slate-900">{test.title}</h2>
                  {test.subtitle && (
                    <p className="text-xs text-slate-600">{test.subtitle}</p>
                  )}

                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span>
                      {test.partCount} {test.skill === "READING" ? "Passage" : "Section"}
                    </span>
                    <span>·</span>
                    <span>{test.totalQuestions} câu hỏi</span>
                    <span>·</span>
                    <span>{Math.max(1, Math.round(test.totalDurationSeconds / 60))} phút</span>
                  </div>

                  <p className="text-xs text-slate-500">
                    Tác giả: {test.createdBy?.fullName ?? "Hệ thống"} · Modes:{" "}
                    {test.allowedModes.join(", ")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  {/* Single Primary Action per Card */}
                  {test.status === "DRAFT" ? (
                    <Link
                      href={`/teacher/question-bank/${encodeURIComponent(test.id)}/edit`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Biên soạn đề
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={newVersionMutation.isPending}
                      onClick={() => newVersionMutation.mutate(test.id)}
                    >
                      <CopyPlus className="h-3.5 w-3.5" />
                      Tạo bản v{test.version + 1}
                    </Button>
                  )}

                  {/* Subtle Secondary Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/teacher/question-bank/${encodeURIComponent(test.id)}/preview`}
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Xem trước
                    </Link>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => validateMutation.mutate(test.id)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Kiểm tra
                    </Button>

                    {test.status === "DRAFT" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => publishMutation.mutate(test.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Xuất bản
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setDeleteTarget(test)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa đề
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </QueryState>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Xác nhận xóa đề thi"
        description={
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              Bạn có chắc chắn muốn xóa vĩnh viễn đề thi{" "}
              <strong className="text-slate-900">
                &ldquo;{deleteTarget?.title}&rdquo;
              </strong>{" "}
              (phiên bản v{deleteTarget?.version}) không?
            </p>
            <p className="text-rose-600 text-xs font-medium">
              Cảnh báo: Hành động này không thể hoàn tác. Toàn bộ nội dung bài đọc/nghe và câu hỏi thuộc đề này sẽ bị xóa hoàn toàn.
            </p>
          </div>
        }
        confirmLabel="Xóa đề"
        cancelLabel="Hủy"
        variant="danger"
        isSubmitting={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
