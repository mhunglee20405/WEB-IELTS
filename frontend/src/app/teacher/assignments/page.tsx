"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Send } from "lucide-react";
import {
  buttonVariants,
  DataTable,
  MetaTag,
  PageHeader,
  QueryState,
  StatusBadge,
  Toolbar,
  type DataTableColumn,
} from "@/components/ui";
import { coursesApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";
import type { Assignment } from "@/lib/api/types";
import { fetchAllTeacherAssignments } from "@/lib/teacher/data-helpers";
import { formatDateKeyVi, formatVnDateTime } from "@/lib/time/vn-time";

export default function TeacherAssignmentsPage() {
  const [courseFilter, setCourseFilter] = useState<string>("all");

  const coursesQuery = useQuery({
    queryKey: teacherKeys.courses("all", "", 1),
    queryFn: () => coursesApi.list({ limit: 100 }),
  });

  const assignmentsQuery = useQuery({
    queryKey: teacherKeys.assignmentsRoot,
    queryFn: () => fetchAllTeacherAssignments(coursesQuery.data?.items),
    enabled: coursesQuery.isSuccess,
  });

  const filtered = useMemo(() => {
    const items = assignmentsQuery.data ?? [];
    if (courseFilter === "all") return items;
    return items.filter((a) => a.courseId === courseFilter);
  }, [assignmentsQuery.data, courseFilter]);

  const columns: DataTableColumn<Assignment>[] = [
    {
      key: "title",
      header: "Tên bài giao",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.title}</p>
          <p className="text-xs text-slate-600">{row.courseTitle}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Loại đề",
      renderCell: (row) => (
        <MetaTag variant={row.exerciseType === "listening" ? "info" : "accent"}>
          {row.exerciseType === "listening" ? "Listening" : "Reading"}
        </MetaTag>
      ),
    },
    {
      key: "window",
      header: "Khung ngày VN (GMT+7)",
      renderCell: (row) => (
        <div className="text-xs">
          <p className="font-semibold text-slate-900">{formatDateKeyVi(row.assignedDate)}</p>
          <p className="text-slate-600">
            Mở {formatVnDateTime(row.openAt)} · Hạn {formatVnDateTime(row.dueAt)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => (
        <StatusBadge
          status={row.status === "closed" ? "completed" : row.status}
          labelOverride={
            row.status === "closed"
              ? "Đã đóng"
              : row.status === "scheduled"
                ? "Sắp mở"
                : "Đang mở"
          }
        />
      ),
    },
    {
      key: "actions",
      header: "Kết quả học viên",
      align: "end",
      renderCell: (row) => (
        <Link
          href={`/teacher/assignments/${encodeURIComponent(row.id)}/results`}
          className={buttonVariants({ variant: "soft", size: "sm" })}
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden={true} />
          Xem kết quả
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý bài tập đã giao"
        subtitle="Theo dõi các bài tập hằng ngày theo khung giờ 00:00–23:59 GMT+7 và kết quả làm bài."
        actions={
          <Link
            href="/teacher/assignments/new"
            className={buttonVariants({ variant: "primary" })}
          >
            <Send className="h-4 w-4" aria-hidden={true} />
            Giao bài tập mới
          </Link>
        }
      />

      <Toolbar>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="asg-course-filter" className="text-sm font-medium text-slate-900">
            Khóa học:
          </label>
          <select
            id="asg-course-filter"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
          >
            <option value="all">Tất cả khóa học</option>
            {(coursesQuery.data?.items ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} — {course.title}
              </option>
            ))}
          </select>
        </div>
      </Toolbar>

      <QueryState
        isLoading={coursesQuery.isLoading || assignmentsQuery.isLoading}
        isError={coursesQuery.isError || assignmentsQuery.isError}
        error={coursesQuery.error ?? assignmentsQuery.error}
        onRetry={() => {
          void coursesQuery.refetch();
          void assignmentsQuery.refetch();
        }}
        loadingLabel="Đang tải danh sách bài giao..."
      >
        <DataTable
          caption={`Bài tập đã giao (${filtered.length})`}
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.id}
          emptyTitle="Chưa có bài tập nào được giao"
          emptyDescription="Nhấn 'Giao bài tập mới' để phân phối đề đã xuất bản cho lớp học."
        />
      </QueryState>
    </div>
  );
}
