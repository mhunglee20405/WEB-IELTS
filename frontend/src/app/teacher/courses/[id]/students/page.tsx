"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, UserMinus, UserPlus } from "lucide-react";
import {
  ConfirmDialog,
  DataTable,
  PageHeader,
  QueryState,
  StatusBadge,
  type DataTableColumn,
} from "@/components/ui";
import { coursesApi, usersApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { teacherKeys } from "@/lib/api/query-keys";
import type { CourseStudent } from "@/lib/api/types";
import { formatVnDate } from "@/lib/time/vn-time";

export default function TeacherCourseStudentsPage() {
  const params = useParams<{ id: string }>();
  const courseId = decodeURIComponent(params.id);
  const queryClient = useQueryClient();

  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [removingStudent, setRemovingStudent] = useState<CourseStudent | null>(null);

  const courseQuery = useQuery({
    queryKey: teacherKeys.courseDetail(courseId),
    queryFn: () => coursesApi.getById(courseId),
  });

  const rosterQuery = useQuery({
    queryKey: teacherKeys.courseStudents(courseId, 1),
    queryFn: () => coursesApi.listStudents(courseId, { limit: 100 }),
  });

  const availableStudentsQuery = useQuery({
    queryKey: ["teacher", "student-picker-users"],
    queryFn: async () => {
      try {
        const res = await usersApi.list({ role: "student", limit: 100 });
        return res.items;
      } catch {
        return null;
      }
    },
  });

  const addMutation = useMutation({
    mutationFn: (studentId: string) => coursesApi.addStudent(courseId, { studentId }),
    onSuccess: async (added) => {
      setFeedback(`Đã ghi danh học viên "${added.fullName}" vào khóa học.`);
      setSelectedStudentId("");
      await queryClient.invalidateQueries({ queryKey: teacherKeys.courseStudents(courseId, 1) });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.courseDetail(courseId) });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.coursesRoot });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.studentsDirectory });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (studentId: string) => coursesApi.removeStudent(courseId, studentId),
    onSuccess: async () => {
      setFeedback("Đã rút học viên khỏi khóa học.");
      setRemovingStudent(null);
      await queryClient.invalidateQueries({ queryKey: teacherKeys.courseStudents(courseId, 1) });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.courseDetail(courseId) });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.coursesRoot });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.studentsDirectory });
    },
  });

  const course = courseQuery.data;
  const roster = rosterQuery.data?.items ?? [];
  const activeRosterCount = roster.filter((s) => s.status === "active").length;
  const isOneOnOneAtLimit = course?.courseType === "1:1" && activeRosterCount >= 1;

  const pickerUsers = availableStudentsQuery.data;
  const enrolledSet = new Set(roster.map((r) => r.studentId));
  const candidateStudents = pickerUsers?.filter((u) => !enrolledSet.has(u.id)) ?? [];

  const handleEnrollSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);
    if (!selectedStudentId.trim()) {
      return;
    }
    addMutation.mutate(selectedStudentId.trim());
  };

  const columns: DataTableColumn<CourseStudent>[] = [
    {
      key: "fullName",
      header: "Học viên",
      renderCell: (row) => (
        <Link
          href={`/teacher/students/${encodeURIComponent(row.studentId)}`}
          className="font-semibold text-blue-800 hover:underline"
        >
          {row.fullName}
        </Link>
      ),
    },
    {
      key: "email",
      header: "Email",
      renderCell: (row) => row.email,
    },
    {
      key: "enrolledAt",
      header: "Ngày ghi danh",
      renderCell: (row) => formatVnDate(row.enrolledAt),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Thao tác",
      align: "end",
      renderCell: (row) => (
        <button
          type="button"
          onClick={() => setRemovingStudent(row)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-800 hover:bg-red-50"
        >
          <UserMinus className="h-3.5 w-3.5" aria-hidden={true} />
          Rút khỏi lớp
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={course ? `Học viên lớp: ${course.title}` : "Quản lý học viên khóa học"}
        subtitle={
          course
            ? `${course.code} · ${course.courseType === "1:1" ? "Lớp 1:1" : "Lớp nhóm"}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/teacher/courses/${encodeURIComponent(courseId)}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden={true} />
              Thông tin khóa học
            </Link>
          </div>
        }
      />

      {isOneOnOneAtLimit ? (
        <div
          role="note"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden={true} />
          <div>
            <p className="font-semibold">Khóa học 1:1 đã đủ 1 học viên đang theo học</p>
            <p className="mt-1 text-xs text-amber-900">
              Hệ thống chỉ cho phép 1 học viên hoạt động tại một thời điểm đối với lớp 1:1. Vui
              lòng rút học viên hiện tại trước nếu muốn thay đổi người học.
            </p>
          </div>
        </div>
      ) : null}

      <section className="lms-card space-y-4">
        <h2 className="text-lg font-semibold text-slate-950">Ghi danh học viên vào lớp</h2>

        {feedback ? (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
            <span>{feedback}</span>
          </div>
        ) : null}

        {addMutation.isError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
            <span>{getFriendlyErrorMessage(addMutation.error)}</span>
          </div>
        ) : null}

        <form onSubmit={handleEnrollSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="enroll-student" className="block text-sm font-medium text-slate-900">
              {pickerUsers ? "Chọn học viên cần ghi danh" : "Nhập mã học viên (Student ID)"}
            </label>
            {pickerUsers ? (
              <select
                id="enroll-student"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                <option value="">-- Chọn học viên --</option>
                {candidateStudents.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.fullName} ({st.email})
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="enroll-student"
                type="text"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                placeholder="VD: stu-02"
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              />
            )}
          </div>

          <button
            type="submit"
            disabled={addMutation.isPending || !selectedStudentId.trim()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" aria-hidden={true} />
            {addMutation.isPending ? "Đang ghi danh..." : "Thêm vào lớp"}
          </button>
        </form>
      </section>

      <QueryState
        isLoading={courseQuery.isLoading || rosterQuery.isLoading}
        isError={rosterQuery.isError}
        error={rosterQuery.error}
        onRetry={() => void rosterQuery.refetch()}
        loadingLabel="Đang tải danh sách học viên..."
      >
        <DataTable
          caption={`Danh sách học viên đang ghi danh (${roster.length})`}
          columns={columns}
          rows={roster}
          getRowKey={(row) => row.studentId}
          emptyTitle="Lớp học chưa có học viên nào"
          emptyDescription="Hãy thêm học viên đầu tiên bằng biểu mẫu phía trên."
        />
      </QueryState>

      <ConfirmDialog
        open={Boolean(removingStudent)}
        variant="danger"
        title="Rút học viên khỏi khóa học?"
        description={
          removingStudent
            ? `Học viên "${removingStudent.fullName}" sẽ được rút khỏi lớp hiện tại. Dữ liệu bài đã nộp vẫn được bảo lưu.`
            : ""
        }
        confirmLabel="Rút học viên"
        cancelLabel="Giữ lại"
        isSubmitting={removeMutation.isPending}
        onClose={() => setRemovingStudent(null)}
        onConfirm={() => {
          if (removingStudent) {
            removeMutation.mutate(removingStudent.studentId);
          }
        }}
      />
    </div>
  );
}
