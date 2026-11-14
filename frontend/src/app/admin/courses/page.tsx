"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil } from "lucide-react";
import { CourseForm } from "@/components/teacher/course-form";
import {
  buttonVariants,
  DataTable,
  ModalDialog,
  PageHeader,
  Pagination,
  QueryState,
  SearchInput,
  StatusBadge,
  Toolbar,
  type DataTableColumn,
} from "@/components/ui";
import { coursesApi } from "@/lib/api/endpoints";
import { adminKeys, teacherKeys } from "@/lib/api/query-keys";
import type { Course } from "@/lib/api/types";

export default function AdminCoursesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const query = useQuery({
    queryKey: adminKeys.courses(statusFilter, searchTerm, page),
    queryFn: () =>
      coursesApi.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchTerm || undefined,
        page,
        limit: 15,
      }),
    placeholderData: keepPreviousData,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof coursesApi.update>[1] }) =>
      coursesApi.update(id, payload),
    onSuccess: async (updated) => {
      setFeedback(`Đã cập nhật khóa học "${updated.title}".`);
      setEditingCourse(null);
      await queryClient.invalidateQueries({ queryKey: adminKeys.coursesRoot });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.coursesRoot });
    },
  });

  const courses = query.data?.items ?? [];

  const columns: DataTableColumn<Course>[] = [
    {
      key: "title",
      header: "Khóa học",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.title}</p>
          <p className="font-mono text-xs text-slate-600">{row.code}</p>
        </div>
      ),
    },
    {
      key: "teacher",
      header: "Giảng viên phụ trách",
      renderCell: (row) => (
        <div>
          <p className="text-sm font-medium text-slate-900">
            {row.teacherName ?? row.teacherId}
          </p>
          <p className="font-mono text-xs text-slate-700">{row.teacherId}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Hình thức / Band",
      renderCell: (row) => (
        <div className="text-xs">
          <p className="font-semibold text-slate-900">
            {row.courseType === "1:1" ? "Lớp 1:1" : "Lớp nhóm"}
          </p>
          <p className="text-slate-600">
            Band {row.startBand ?? "—"} → {row.targetBand ?? "—"}
          </p>
        </div>
      ),
    },
    {
      key: "students",
      header: "Sĩ số",
      renderCell: (row) => (
        <span className="font-semibold tabular-nums">
          {row.studentCount ?? 0}
          {row.courseType === "1:1" ? " / 1" : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Điều phối",
      align: "end",
      renderCell: (row) => (
        <button
          type="button"
          onClick={() => setEditingCourse(row)}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden={true} />
          Chỉnh sửa / Đổi GV
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Giám sát khóa học toàn hệ thống"
        subtitle="Theo dõi phân công giảng viên, sĩ số lớp 1:1 / nhóm và trạng thái vận hành."
      />

      {feedback ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{feedback}</span>
        </div>
      ) : null}

      <Toolbar>
        <select
          aria-label="Lọc trạng thái khóa học"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="upcoming">Sắp mở</option>
          <option value="archived">Lưu trữ</option>
        </select>

        <SearchInput
          id="admin-course-search"
          label="Tìm khóa học hoặc giảng viên"
          placeholder="Tìm mã, tên lớp hoặc giảng viên..."
          value={searchTerm}
          onChange={(next) => {
            setSearchTerm(next.trim());
            setPage(1);
          }}
          className="sm:w-72"
        />
      </Toolbar>

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Đang tải danh sách khóa học..."
      >
        <DataTable
          caption={`Tổng hợp khóa học (${query.data?.total ?? courses.length})`}
          columns={columns}
          rows={courses}
          getRowKey={(row) => row.id}
          emptyTitle="Không có khóa học nào"
          emptyDescription="Thử điều chỉnh bộ lọc trạng thái hoặc từ khóa."
        />

        {query.data ? (
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            totalItems={query.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </QueryState>

      <ModalDialog
        open={Boolean(editingCourse)}
        onClose={() => setEditingCourse(null)}
        size="lg"
        title="Điều phối khóa học"
      >
        {editingCourse ? (
          <CourseForm
            key={editingCourse.id}
            mode="edit"
            initialCourse={editingCourse}
            isPending={updateMutation.isPending}
            serverError={updateMutation.error}
            submitLabel="Lưu điều phối"
            onCancel={() => setEditingCourse(null)}
            onSubmit={async (values) => {
              await updateMutation.mutateAsync({
                id: editingCourse.id,
                payload: {
                  title: values.title,
                  description: values.description,
                  courseType: values.courseType,
                  startBand: values.startBand,
                  targetBand: values.targetBand,
                  status: values.status,
                  teacherId: values.teacherId,
                  timezone: values.timezone,
                  startDate: values.startDate,
                  endDate: values.endDate,
                },
              });
            }}
          />
        ) : null}
      </ModalDialog>
    </div>
  );
}
