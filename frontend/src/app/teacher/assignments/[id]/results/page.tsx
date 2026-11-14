"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Languages, XCircle } from "lucide-react";
import {
  DataTable,
  PageHeader,
  Pagination,
  QueryState,
  StatusBadge,
  type DataTableColumn,
} from "@/components/ui";
import { assignmentsApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";
import type { StudentAssignmentSummary } from "@/lib/api/types";
import { formatDateKeyVi, formatVnDateTime } from "@/lib/time/vn-time";

export default function TeacherAssignmentResultsPage() {
  const params = useParams<{ id: string }>();
  const assignmentId = decodeURIComponent(params.id);
  const [page, setPage] = useState(1);

  const assignmentQuery = useQuery({
    queryKey: ["teacher", "assignment", assignmentId],
    queryFn: () => assignmentsApi.getById(assignmentId),
  });

  const resultsQuery = useQuery({
    queryKey: teacherKeys.assignmentResults(assignmentId, page),
    queryFn: () => assignmentsApi.listStudents(assignmentId, { page, limit: 25 }),
    placeholderData: keepPreviousData,
  });

  const assignment = assignmentQuery.data;
  const rows = resultsQuery.data?.items ?? [];

  const columns: DataTableColumn<StudentAssignmentSummary>[] = [
    {
      key: "student",
      header: "Học viên",
      renderCell: (row) =>
        row.studentId ? (
          <Link
            href={`/teacher/students/${encodeURIComponent(row.studentId)}`}
            className="font-semibold text-blue-800 hover:underline"
          >
            {row.studentName ?? row.studentId}
          </Link>
        ) : (
          <span className="font-semibold text-slate-950">
            {row.studentName ?? row.studentAssignmentId}
          </span>
        ),
    },
    {
      key: "status",
      header: "Tiến độ",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "attempts",
      header: "Số lần nộp",
      renderCell: (row) => <span className="tabular-nums">{row.attemptsCount}</span>,
    },
    {
      key: "score",
      header: "Điểm cao nhất",
      renderCell: (row) => (
        <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
          {row.bestScore !== null ? `${row.bestScore}%` : "—"}
          {row.passed ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-label="Đạt" />
          ) : row.attemptsCount > 0 ? (
            <XCircle className="h-4 w-4 text-amber-700" aria-label="Chưa đạt" />
          ) : null}
        </span>
      ),
    },
    {
      key: "effectiveDue",
      header: "Hạn hiệu lực",
      renderCell: (row) => formatVnDateTime(row.effectiveDueAt),
    },
    {
      key: "translation",
      header: "Bài dịch",
      renderCell: (row) =>
        row.exerciseType === "reading" ? (
          <StatusBadge status={row.translationStatus} />
        ) : (
          <span className="text-xs font-medium text-slate-700">Không áp dụng</span>
        ),
    },
    {
      key: "penalty",
      header: "Phạt quá hạn",
      renderCell: (row) =>
        row.penaltyApplied ? (
          <StatusBadge status="overdue" labelOverride="Đã tính +1 phạt" />
        ) : (
          <span className="text-xs font-medium text-slate-700">Không</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={assignment ? `Kết quả: ${assignment.title}` : "Kết quả làm bài của học viên"}
        subtitle={
          assignment
            ? `${assignment.courseTitle ?? ""} · Ngày giao ${formatDateKeyVi(
                assignment.assignedDate,
              )} · Ngưỡng đạt ${assignment.passThreshold}%`
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/teacher/assignments"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden={true} />
              Danh sách bài giao
            </Link>
            <Link
              href="/teacher/translations"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              <Languages className="h-4 w-4" aria-hidden={true} />
              Hàng chờ chấm dịch
            </Link>
          </div>
        }
      />

      <QueryState
        isLoading={assignmentQuery.isLoading || resultsQuery.isLoading}
        isError={assignmentQuery.isError || resultsQuery.isError}
        error={assignmentQuery.error ?? resultsQuery.error}
        onRetry={() => {
          void assignmentQuery.refetch();
          void resultsQuery.refetch();
        }}
        loadingLabel="Đang tải kết quả làm bài..."
      >
        <DataTable
          caption={`Kết quả theo từng học viên (${resultsQuery.data?.total ?? rows.length})`}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.studentAssignmentId}
          emptyTitle="Chưa có học viên nào được gán bài này"
          emptyDescription="Kiểm tra danh sách ghi danh của khóa học tương ứng."
        />

        {resultsQuery.data ? (
          <Pagination
            page={resultsQuery.data.page}
            totalPages={resultsQuery.data.totalPages}
            totalItems={resultsQuery.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </QueryState>
    </div>
  );
}
