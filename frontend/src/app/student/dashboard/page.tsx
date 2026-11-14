"use client";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AssignmentCard } from "@/components/student/assignment-card";
import { LessonCard } from "@/components/student/lesson-card";
import { PageHeader, QueryState } from "@/components/ui";
import { dashboardApi } from "@/lib/api/endpoints";
import { studentKeys } from "@/lib/api/query-keys";
import { PASS_SCORE_THRESHOLD } from "@/lib/api/types";
import { useNowMs } from "@/lib/time/use-now";
import { formatDateKeyVi, getZonedDateParts } from "@/lib/time/vn-time";

export default function StudentDashboardPage() {
  const nowMs = useNowMs(60_000);
  const todayKey = getZonedDateParts(nowMs).dateKey;

  const dashboardQuery = useQuery({
    queryKey: studentKeys.dashboard,
    queryFn: () => dashboardApi.getStudentDashboard(),
  });

  const data = dashboardQuery.data;
  const overdueTodayCount =
    data?.todayExercises.filter((item) => item.status === "overdue").length ?? 0;
  const remainingExtensions = data
    ? Math.max(0, data.maxExtensionsPerMonth - data.extensionsUsedThisMonth)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tổng quan học tập"
        subtitle={`Hôm nay ${formatDateKeyVi(todayKey)} · Cửa sổ bài tập hàng ngày 00:00 – 23:59 (Asia/Ho_Chi_Minh).`}
        actions={
          <Link
            href="/student/assignments"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Xem tất cả bài tập
            <ArrowRight className="h-4 w-4" aria-hidden={true} />
          </Link>
        }
      />

      <QueryState
        isLoading={dashboardQuery.isLoading}
        isError={dashboardQuery.isError}
        error={dashboardQuery.error}
        onRetry={() => void dashboardQuery.refetch()}
        loadingLabel="Đang tải bảng tổng quan học viên..."
      >
        {data ? (
          <div className="space-y-6">
            {overdueTodayCount > 0 || data.activePenaltiesCount > 0 ? (
              <div
                role="alert"
                className="flex flex-col gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-red-700"
                    aria-hidden={true}
                  />
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold">
                      Cảnh báo hạn nộp &amp; kỷ luật học tập
                    </p>
                    <p className="text-red-900">
                      {overdueTodayCount > 0
                        ? `Có ${overdueTodayCount} bài tập hôm nay đã quá hạn. `
                        : ""}
                      {data.activePenaltiesCount > 0
                        ? `Bạn hiện có ${data.activePenaltiesCount} bản ghi điểm phạt đang hiệu lực.`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/student/assignments"
                    className="inline-flex min-h-[40px] items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100"
                  >
                    Xử lý bài quá hạn
                  </Link>
                  <Link
                    href="/student/penalties"
                    className="inline-flex min-h-[40px] items-center rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                  >
                    Xem điểm phạt
                  </Link>
                </div>
              </div>
            ) : null}

            <section aria-label="Chỉ số học tập chính" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <article className="lms-card">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Bài tập hôm nay</span>
                  <CheckCircle2 className="h-4 w-4 text-blue-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {data.todayExercises.length} bài
                </p>
                <Link
                  href="/student/assignments"
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Mở danh sách bài tập
                </Link>
              </article>

              <article className="lms-card">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Hạn mức gia hạn tháng</span>
                  <Clock className="h-4 w-4 text-amber-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  Còn {remainingExtensions} / {data.maxExtensionsPerMonth} lượt
                </p>
                <Link
                  href="/student/extensions"
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Đã dùng {data.extensionsUsedThisMonth} lượt trong tháng
                </Link>
              </article>

              <article className="lms-card">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Điểm phạt đang hiệu lực</span>
                  <ShieldAlert className="h-4 w-4 text-red-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {data.activePenaltiesCount}
                </p>
                <Link
                  href="/student/penalties"
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Xem lịch sử điểm phạt
                </Link>
              </article>

              <article className="lms-card">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <span>Thông báo chưa đọc</span>
                  <Bell className="h-4 w-4 text-indigo-700" aria-hidden={true} />
                </div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {data.unreadNotificationsCount}
                </p>
                <Link
                  href="/student/notifications"
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  Đi tới hộp thông báo
                </Link>
              </article>
            </section>

            <section aria-labelledby="today-exercises-heading" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 id="today-exercises-heading" className="text-lg font-semibold text-slate-900">
                  Bài tập hôm nay
                </h2>
                <Link
                  href="/student/assignments"
                  className="text-sm font-medium text-blue-700 hover:underline"
                >
                  Lọc theo trạng thái
                </Link>
              </div>
              {data.todayExercises.length === 0 ? (
                <div className="lms-card text-sm text-slate-600">
                  Không có bài tập nào được giao trong ngày hôm nay.
                </div>
              ) : (
                <div className="lms-card-grid">
                  {data.todayExercises.map((item) => (
                    <AssignmentCard
                      key={item.studentAssignmentId}
                      item={item}
                      nowMs={nowMs}
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
              <section
                aria-labelledby="upcoming-lessons-heading"
                className="space-y-3 lg:col-span-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2
                    id="upcoming-lessons-heading"
                    className="flex items-center gap-2 text-lg font-semibold text-slate-900"
                  >
                    <CalendarDays className="h-5 w-5 text-blue-700" aria-hidden={true} />
                    Buổi học trực tuyến sắp tới
                  </h2>
                  <Link
                    href="/student/calendar"
                    className="text-sm font-medium text-blue-700 hover:underline"
                  >
                    Mở lịch tuần &amp; tháng
                  </Link>
                </div>
                {data.upcomingLessons.length === 0 ? (
                  <div className="lms-card text-sm text-slate-600">
                    Chưa có buổi học nào sắp diễn ra.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.upcomingLessons.slice(0, 3).map((lesson) => (
                      <LessonCard key={lesson.id} lesson={lesson} />
                    ))}
                  </div>
                )}
              </section>

              <section aria-labelledby="recent-scores-heading" className="space-y-3">
                <h2
                  id="recent-scores-heading"
                  className="flex items-center gap-2 text-lg font-semibold text-slate-900"
                >
                  <Award className="h-5 w-5 text-emerald-700" aria-hidden={true} />
                  Điểm gần đây
                </h2>
                {!data.recentScores || data.recentScores.length === 0 ? (
                  <div className="lms-card text-sm text-slate-600">
                    Chưa có bài nộp nào được chấm điểm.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {data.recentScores.map((scoreItem) => (
                      <li key={scoreItem.studentAssignmentId} className="lms-card gap-2 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                              {scoreItem.exerciseType === "reading" ? "Reading" : "Listening"}
                            </span>
                            <p className="text-sm font-semibold text-slate-900">
                              {scoreItem.title}
                            </p>
                          </div>
                          <span
                            className={
                              scoreItem.passed
                                ? "rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-sm font-bold tabular-nums text-emerald-900"
                                : "rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-sm font-bold tabular-nums text-amber-900"
                            }
                          >
                            {scoreItem.score}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-600">
                          {scoreItem.passed
                            ? `Đạt ngưỡng >= ${PASS_SCORE_THRESHOLD}% · Đã mở đáp án`
                            : `Chưa đạt ngưỡng ${PASS_SCORE_THRESHOLD}% · Cần làm lại`}
                        </p>
                        <Link
                          href={`/student/assignments/${scoreItem.studentAssignmentId}`}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          {scoreItem.passed ? "Xem đáp án chi tiết" : "Làm lại bài tập"}
                          <span className="sr-only">: {scoreItem.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}
