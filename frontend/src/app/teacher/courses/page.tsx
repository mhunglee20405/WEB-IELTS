"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BookOpen, Plus, Users } from "lucide-react";
import {
  buttonVariants,
  Card,
  CardFooter,
  MetaTag,
  PageHeader,
  Pagination,
  QueryState,
  SearchInput,
  StatusBadge,
  Tabs,
  Toolbar,
  type TabItem,
} from "@/components/ui";
import { coursesApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";

type CourseFilter = "all" | "active" | "upcoming" | "archived";

const COURSE_TABS: readonly TabItem<CourseFilter>[] = [
  { id: "all", label: "Tất cả" },
  { id: "active", label: "Đang hoạt động" },
  { id: "upcoming", label: "Sắp mở" },
  { id: "archived", label: "Lưu trữ" },
];

export default function TeacherCoursesPage() {
  const tabsPrefix = useId();
  const [statusFilter, setStatusFilter] = useState<CourseFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: teacherKeys.courses(statusFilter, searchTerm, page),
    queryFn: () =>
      coursesApi.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchTerm || undefined,
        page,
        limit: 12,
      }),
    placeholderData: keepPreviousData,
  });

  const courses = query.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản lý khóa học"
        subtitle="Theo dõi các lớp 1:1 và lớp nhóm, band điểm mục tiêu và danh sách học viên."
        actions={
          <Link
            href="/teacher/courses/new"
            className={buttonVariants({ variant: "primary" })}
          >
            <Plus className="h-4 w-4" aria-hidden={true} />
            Tạo khóa học mới
          </Link>
        }
      />

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Lọc trạng thái khóa học"
            items={COURSE_TABS}
            value={statusFilter}
            hasPanels={false}
            onChange={(next) => {
              setStatusFilter(next);
              setPage(1);
            }}
          />
        }
      >
        <SearchInput
          id="course-search"
          label="Tìm kiếm khóa học"
          placeholder="Tìm theo mã hoặc tên khóa..."
          value={searchTerm}
          onChange={(next) => {
            setSearchTerm(next.trim());
            setPage(1);
          }}
        />
      </Toolbar>

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        isEmpty={!query.isLoading && !query.isError && courses.length === 0}
        onRetry={() => void query.refetch()}
        emptyTitle="Chưa có khóa học nào phù hợp"
        emptyDescription="Tạo khóa học mới hoặc thay đổi từ khóa/bộ lọc trạng thái."
      >
        <div className="lms-card-grid">
          {courses.map((course) => (
            <Card key={course.id} as="article" className="justify-between gap-4">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetaTag variant="code">{course.code}</MetaTag>
                    <MetaTag variant="format">
                      {course.courseType === "1:1" ? "Lớp 1:1" : "Lớp nhóm"}
                    </MetaTag>
                  </div>
                  <StatusBadge status={course.status} />
                </div>

                <h2 className="text-lg font-semibold text-slate-950">{course.title}</h2>
                {course.description ? (
                  <p className="text-sm text-slate-700">{course.description}</p>
                ) : null}

                <dl className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200/70 bg-slate-50 p-3 text-xs text-slate-700">
                  <div>
                    <dt className="font-medium text-slate-700">Mục tiêu band</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-950">
                      {course.startBand ?? "—"} → {course.targetBand ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-700">Học viên đang học</dt>
                    <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-950">
                      {course.studentCount ?? 0}
                      {course.courseType === "1:1" ? " / 1" : ""}
                    </dd>
                  </div>
                </dl>
              </div>

              <CardFooter>
                <Link
                  href={`/teacher/courses/${encodeURIComponent(course.id)}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  <BookOpen className="h-4 w-4" aria-hidden={true} />
                  Chỉnh sửa khóa học
                </Link>
                <Link
                  href={`/teacher/courses/${encodeURIComponent(course.id)}/students`}
                  className={buttonVariants({ variant: "soft", size: "sm" })}
                >
                  <Users className="h-4 w-4" aria-hidden={true} />
                  Quản lý học viên
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>

        {query.data ? (
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            totalItems={query.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </QueryState>
    </div>
  );
}

