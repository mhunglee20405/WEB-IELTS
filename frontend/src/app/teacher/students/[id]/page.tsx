"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import {
  DataTable,
  PageHeader,
  QueryState,
  StatusBadge,
  type DataTableColumn,
} from "@/components/ui";
import { assignmentsApi, penaltiesApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";
import type { PenaltyRecord, StudentAssignmentSummary } from "@/lib/api/types";
import {
  fetchAllTeacherAssignments,
  fetchTeacherStudentDirectory,
} from "@/lib/teacher/data-helpers";
import { formatVnDateTime } from "@/lib/time/vn-time";

export default function TeacherStudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = decodeURIComponent(params.id);

  const profileQuery = useQuery({
    queryKey: teacherKeys.studentDetail(studentId),
    queryFn: async () => {
      const directory = await fetchTeacherStudentDirectory();
      const matched = directory.find((s) => s.studentId === studentId) ?? null;

      const assignments = await fetchAllTeacherAssignments();
      const progressLists = await Promise.all(
        assignments.map(async (asg) => {
          try {
            const res = await assignmentsApi.listStudents(asg.id, { limit: 100 });
            return res.items.filter(
              (item) => !item.studentId || item.studentId === studentId,
            );
          } catch {
            return [] as StudentAssignmentSummary[];
          }
        }),
      );

      return {
        student: matched,
        assignments: progressLists.flat(),
      };
    },
  });

  const penaltiesQuery = useQuery({
    queryKey: ["teacher", "student", studentId, "penalties"],
    queryFn: () => penaltiesApi.getByStudent(studentId),
  });

  const penaltyColumns: DataTableColumn<PenaltyRecord>[] = [
    {
      key: "assignment",
      header: "Bài tập liên quan",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.assignmentTitle}</p>
          {row.courseTitle ? (
            <p className="text-xs text-slate-600">{row.courseTitle}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "points",
      header: "Điểm phạt",
      renderCell: (row) => <span className="font-bold text-red-800 tabular-nums">+{row.points}</span>,
    },
    {
      key: "reason",
      header: "Lý do",
      renderCell: (row) => row.reason,
    },
    {
      key: "occurredAt",
      header: "Thời điểm",
      renderCell: (row) => formatVnDateTime(row.occurredAt),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) =>
        row.reversed ? (
          <div className="space-y-1">
            <StatusBadge status="reversed" />
            {row.reversalReason ? (
              <p className="text-xs text-slate-600">Lý do: {row.reversalReason}</p>
            ) : null}
          </div>
        ) : (
          <StatusBadge status="overdue" labelOverride="Đang hiệu lực" />
        ),
    },
  ];

  const assignmentColumns: DataTableColumn<StudentAssignmentSummary>[] = [
    {
      key: "title",
      header: "Bài tập",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.title}</p>
          <p className="text-xs text-slate-600">{row.courseTitle}</p>
        </div>
      ),
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
        <span className="font-semibold tabular-nums">
          {row.bestScore !== null ? `${row.bestScore}%` : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "due",
      header: "Hạn hiệu lực",
      renderCell: (row) => formatVnDateTime(row.effectiveDueAt),
    },
  ];

  const student = profileQuery.data?.student;
  const studentAssignments = profileQuery.data?.assignments ?? [];
  const penaltySummary = penaltiesQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={student ? `Học viên: ${student.fullName}` : `Chi tiết học viên (${studentId})`}
        subtitle={student ? student.email : "Theo dõi tiến độ bài tập và sổ điểm phạt."}
        actions={
          <Link
            href="/teacher/students"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Danh sách học viên
          </Link>
        }
      />

      <QueryState
        isLoading={profileQuery.isLoading || penaltiesQuery.isLoading}
        isError={profileQuery.isError || penaltiesQuery.isError}
        error={profileQuery.error ?? penaltiesQuery.error}
        onRetry={() => {
          void profileQuery.refetch();
          void penaltiesQuery.refetch();
        }}
        loadingLabel="Đang tải hồ sơ học viên..."
      >
        <div className="space-y-6">
          {penaltySummary ? (
            <section className="lms-card flex flex-wrap items-center justify-between gap-4 border-amber-200 bg-amber-50/40">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-6 w-6 text-amber-800" aria-hidden={true} />
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-600">
                    Tổng điểm phạt đang hiệu lực
                  </p>
                  <p className="text-2xl font-bold text-slate-950 tabular-nums">
                    {penaltySummary.totalActivePoints} điểm
                  </p>
                </div>
              </div>
              {student ? (
                <div className="flex flex-wrap gap-2">
                  {student.courses.map((course) => (
                    <Link
                      key={course.id}
                      href={`/teacher/courses/${encodeURIComponent(course.id)}/students`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {course.code} — {course.title}
                    </Link>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <DataTable
            caption={`Lịch sử điểm phạt (${penaltySummary?.records.length ?? 0})`}
            columns={penaltyColumns}
            rows={penaltySummary?.records ?? []}
            getRowKey={(row) => row.id}
            emptyTitle="Chưa có bản ghi điểm phạt"
            emptyDescription="Học viên hiện chưa phát sinh điểm phạt quá hạn."
          />

          <DataTable
            caption={`Tiến độ bài tập đã giao (${studentAssignments.length})`}
            columns={assignmentColumns}
            rows={studentAssignments}
            getRowKey={(row) => row.studentAssignmentId}
            emptyTitle="Chưa có bài tập nào được giao"
            emptyDescription="Bài tập giao trong khóa học của học viên sẽ xuất hiện tại đây."
          />
        </div>
      </QueryState>
    </div>
  );
}
