"use client";

import { BookOpen, Calendar, GraduationCap, Users, UserCheck } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buttonVariants,
  Card,
  CardFooter,
  MetaTag,
  PageHeader,
  QueryState,
  StatusBadge,
  TabPanel,
  Tabs,
  Toolbar,
  type TabItem,
} from "@/components/ui";
import { coursesApi } from "@/lib/api/endpoints";
import { studentKeys } from "@/lib/api/query-keys";
import type { CourseStatus } from "@/lib/api/types";
import { formatDateKeyVi } from "@/lib/time/vn-time";

type CourseFilter = "all" | CourseStatus;

const COURSE_TABS: readonly TabItem<CourseFilter>[] = [
  { id: "all", label: "Tất cả" },
  { id: "active", label: "Đang học" },
  { id: "upcoming", label: "Sắp khai giảng" },
  { id: "archived", label: "Đã hoàn thành" },
];

export default function StudentCoursesPage() {
  const tabsPrefix = useId();
  const [filter, setFilter] = useState<CourseFilter>("all");

  const coursesQuery = useQuery({
    queryKey: studentKeys.courses(filter, 1),
    queryFn: () =>
      coursesApi.list({
        status: filter === "all" ? undefined : filter,
        page: 1,
        limit: 50,
      }),
  });

  const courses = coursesQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Khóa học của tôi"
        subtitle="Danh sách các lớp IELTS 1:1 và lớp nhóm bạn đang theo học."
      />

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Lọc khóa học theo trạng thái"
            items={COURSE_TABS}
            value={filter}
            onChange={setFilter}
          />
        }
      />

      <TabPanel idPrefix={tabsPrefix} value={filter} activeValue={filter}>
        <QueryState
          isLoading={coursesQuery.isLoading}
          isError={coursesQuery.isError}
          error={coursesQuery.error}
          isEmpty={courses.length === 0}
          onRetry={() => void coursesQuery.refetch()}
          loadingLabel="Đang tải danh sách khóa học..."
          emptyTitle="Chưa có khóa học phù hợp"
          emptyDescription="Hiện chưa có khóa học nào thuộc trạng thái bạn đang chọn."
        >
          <div className="lms-card-grid">
            {courses.map((course) => {
              const isOneOnOne = course.courseType === "1:1";
              return (
                <Card key={course.id} as="article" className="justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <MetaTag variant="code">{course.code}</MetaTag>
                        <MetaTag variant="format">
                          {isOneOnOne ? (
                            <UserCheck className="h-3.5 w-3.5" aria-hidden={true} />
                          ) : (
                            <Users className="h-3.5 w-3.5" aria-hidden={true} />
                          )}
                          {isOneOnOne ? "Lớp 1:1 Cá nhân" : "Lớp nhóm"}
                        </MetaTag>
                      </div>
                      <StatusBadge status={course.status} />
                    </div>

                    <div className="space-y-1">
                      <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
                      {course.description ? (
                        <p className="text-sm text-slate-700">{course.description}</p>
                      ) : null}
                    </div>

                    <dl className="grid gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-2">
                      {typeof course.startBand === "number" ||
                      typeof course.targetBand === "number" ? (
                        <div className="flex items-center gap-1.5">
                          <GraduationCap
                            className="h-4 w-4 shrink-0 text-blue-700"
                            aria-hidden={true}
                          />
                          <div>
                            <dt className="inline font-medium">Lộ trình Band: </dt>
                            <dd className="inline font-semibold text-slate-900">
                              {course.startBand ?? "—"} &rarr; {course.targetBand ?? "—"}
                            </dd>
                          </div>
                        </div>
                      ) : null}

                      {course.teacherName ? (
                        <div>
                          <dt className="inline font-medium">Giáo viên: </dt>
                          <dd className="inline font-semibold text-slate-900">
                            {course.teacherName}
                          </dd>
                        </div>
                      ) : null}

                      {course.startDate || course.endDate ? (
                        <div>
                          <dt className="inline font-medium">Thời gian: </dt>
                          <dd className="inline">
                            {course.startDate ? formatDateKeyVi(course.startDate) : "—"} –{" "}
                            {course.endDate ? formatDateKeyVi(course.endDate) : "—"}
                          </dd>
                        </div>
                      ) : null}

                      <div>
                        <dt className="inline font-medium">Múi giờ lớp: </dt>
                        <dd className="inline">{course.timezone}</dd>
                      </div>
                    </dl>
                  </div>

                  <CardFooter>
                    <Link
                      href="/student/assignments"
                      className={buttonVariants({ variant: "soft", size: "sm" })}
                    >
                      <BookOpen className="h-4 w-4" aria-hidden={true} />
                      Bài tập khóa học
                      <span className="sr-only">: {course.title}</span>
                    </Link>
                    <Link
                      href="/student/calendar"
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      <Calendar className="h-4 w-4" aria-hidden={true} />
                      Xem lịch học
                      <span className="sr-only">: {course.title}</span>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </QueryState>
      </TabPanel>
    </div>
  );
}

