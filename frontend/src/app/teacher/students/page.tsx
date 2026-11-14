"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buttonVariants,
  DataTable,
  MetaTag,
  PageHeader,
  QueryState,
  SearchInput,
  StatusBadge,
  Toolbar,
  type DataTableColumn,
} from "@/components/ui";
import { teacherKeys } from "@/lib/api/query-keys";
import {
  fetchTeacherStudentDirectory,
  type TeacherStudentEntry,
} from "@/lib/teacher/data-helpers";

export default function TeacherStudentsPage() {
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: teacherKeys.studentsDirectory,
    queryFn: () => fetchTeacherStudentDirectory(),
  });

  const filtered = useMemo(() => {
    const list = query.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (st) =>
        st.fullName.toLowerCase().includes(term) ||
        st.email.toLowerCase().includes(term) ||
        st.studentId.toLowerCase().includes(term),
    );
  }, [query.data, search]);

  const columns: DataTableColumn<TeacherStudentEntry>[] = [
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
      key: "courses",
      header: "Khóa học đang tham gia",
      renderCell: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.courses.map((course) => (
            <Link
              key={course.id}
              href={`/teacher/courses/${encodeURIComponent(course.id)}/students`}
              className="hover:opacity-85"
            >
              <MetaTag variant="code">{course.code}</MetaTag>
            </Link>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "detail",
      header: "Chi tiết",
      align: "end",
      renderCell: (row) => (
        <Link
          href={`/teacher/students/${encodeURIComponent(row.studentId)}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Hồ sơ &amp; Điểm phạt →
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Danh sách học viên phụ trách"
        subtitle="Tổng hợp học viên từ các khóa học của bạn để theo dõi tiến độ và điểm phạt."
      />

      <Toolbar>
        <SearchInput
          id="teacher-student-search"
          label="Tìm học viên theo tên hoặc email"
          placeholder="Tìm học viên theo tên hoặc email..."
          value={search}
          onChange={setSearch}
          debounceMs={0}
          className="sm:w-80"
        />
      </Toolbar>

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Đang tổng hợp danh sách học viên..."
      >
        <DataTable
          caption={`Tổng số ${filtered.length} học viên`}
          columns={columns}
          rows={filtered}
          getRowKey={(row) => row.studentId}
          emptyTitle="Chưa có học viên nào"
          emptyDescription="Ghi danh học viên vào khóa học để theo dõi quá trình học tập tại đây."
        />
      </QueryState>
    </div>
  );
}
