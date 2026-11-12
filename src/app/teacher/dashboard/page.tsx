"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  CalendarPlus,
  Clock,
  FilePlus2,
  Languages,
  Send,
} from "lucide-react";
import { LessonCard } from "@/components/student/lesson-card";
import { buttonVariants, MetaTag, PageHeader, QueryState, StatusBadge } from "@/components/ui";
import { dashboardApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";
import { DEFAULT_TIMEZONE, formatDateKeyVi, formatVnDateTime } from "@/lib/time/vn-time";

export default function TeacherDashboardPage() {
  const query = useQuery({
    queryKey: teacherKeys.dashboard,
    queryFn: () => dashboardApi.getTeacherDashboard(),
  });

  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan Giảng viên"
        subtitle="Theo dõi lớp học, hàng chờ duyệt gia hạn, bài dịch cần chấm và bài giao hằng ngày."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/teacher/exercises/new"
              className={buttonVariants({ variant: "secondary" })}
            >
              <FilePlus2 className="h-4 w-4" aria-hidden={true} />
              Soạn đề mới
            </Link>
            <Link
              href="/teacher/assignments/new"
              className={buttonVariants({ variant: "primary" })}
            >
              <Send className="h-4 w-4" aria-hidden={true} />
              Giao bài tập
            </Link>
          </div>
        }
      />

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Đang tải dữ liệu giảng dạy..."
      >
        {data ? (
          <div className="space-y-8">
            <section
              aria-label="Chỉ số giảng dạy trọng tâm"
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Link
                href="/teacher/courses"
                className="lms-card transition-colors hover:border-blue-400"
              >
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Khóa học hoạt động
                  </span>
                  <BookOpen className="h-4 w-4 text-blue-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold text-slate-950 tabular-nums">
                  {data.activeCoursesCount}
                </p>
                <p className="text-xs text-blue-800">Quản lý lớp &amp; học viên →</p>
              </Link>

              <Link
                href="/teacher/extensions"
                className="lms-card transition-colors hover:border-amber-400"
              >
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Gia hạn chờ duyệt
                  </span>
                  <Clock className="h-4 w-4 text-amber-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold text-slate-950 tabular-nums">
                  {data.pendingExtensionsCount}
                </p>
                <p className="text-xs text-amber-900">Mở hàng chờ phê duyệt →</p>
              </Link>

              <Link
                href="/teacher/translations"
                className="lms-card transition-colors hover:border-indigo-400"
              >
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Bài dịch chờ chấm
                  </span>
                  <Languages className="h-4 w-4 text-indigo-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold text-slate-950 tabular-nums">
                  {data.pendingTranslationsCount}
                </p>
                <p className="text-xs text-indigo-900">Vào chấm bài dịch →</p>
              </Link>

              <Link
                href="/teacher/assignments"
                className="lms-card transition-colors hover:border-red-400"
              >
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Lượt nộp quá hạn
                  </span>
                  <AlertTriangle className="h-4 w-4 text-red-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold text-slate-950 tabular-nums">
                  {data.overdueStudentsCount}
                </p>
                <p className="text-xs text-red-800">Kiểm tra kết quả bài giao →</p>
              </Link>
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-950">
                  Buổi học sắp diễn ra ({data.upcomingLessons.length})
                </h2>
                <Link
                  href="/teacher/calendar"
                  className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-blue-800 hover:underline"
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden={true} />
                  Quản lý lịch dạy &amp; Google Meet
                </Link>
              </div>

              {data.upcomingLessons.length === 0 ? (
                <div className="lms-card text-sm text-slate-600">
                  Chưa có buổi học nào được lên lịch sắp tới.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.upcomingLessons.slice(0, 4).map((lesson) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      timeZone={DEFAULT_TIMEZONE}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-950">
                  Bài tập đã giao gần đây ({data.recentAssignments.length})
                </h2>
                <Link
                  href="/teacher/assignments"
                  className="text-sm font-semibold text-blue-800 hover:underline"
                >
                  Xem toàn bộ bài giao →
                </Link>
              </div>

              {data.recentAssignments.length === 0 ? (
                <div className="lms-card text-sm text-slate-600">
                  Chưa có bài giao nào trong các khóa học của bạn.
                </div>
              ) : (
                <div className="lms-card-grid">
                  {data.recentAssignments.slice(0, 4).map((assignment) => (
                    <article key={assignment.id} className="lms-card space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <MetaTag
                          variant={assignment.exerciseType === "listening" ? "info" : "accent"}
                        >
                          {assignment.exerciseType === "listening" ? "Listening" : "Reading"}
                        </MetaTag>
                        <StatusBadge
                          status={
                            assignment.status === "closed" ? "completed" : assignment.status
                          }
                          labelOverride={
                            assignment.status === "closed"
                              ? "Đã đóng"
                              : assignment.status === "scheduled"
                                ? "Sắp mở"
                                : "Đang mở"
                          }
                        />
                      </div>
                      <h3 className="text-base font-semibold text-slate-950">
                        {assignment.title}
                      </h3>
                      <p className="text-xs text-slate-600">
                        {assignment.courseTitle} · Ngày giao{" "}
                        {formatDateKeyVi(assignment.assignedDate)} · Hạn{" "}
                        {formatVnDateTime(assignment.dueAt, DEFAULT_TIMEZONE)}
                      </p>
                      <div className="pt-1">
                        <Link
                          href={`/teacher/assignments/${encodeURIComponent(assignment.id)}/results`}
                          className="text-sm font-semibold text-blue-800 hover:underline"
                        >
                          Xem kết quả học viên →
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}
