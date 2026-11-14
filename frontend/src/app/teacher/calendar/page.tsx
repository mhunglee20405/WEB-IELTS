"use client";

import { useId, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Calendar, ChevronLeft, ChevronRight, Pencil, Plus } from "lucide-react";
import { LessonCard } from "@/components/student/lesson-card";
import { LessonModal } from "@/components/teacher/lesson-modal";
import { buttonVariants, PageHeader, QueryState, TabPanel, Tabs, Toolbar, type TabItem } from "@/components/ui";
import { coursesApi, lessonsApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";
import type { Lesson } from "@/lib/api/types";
import {
  DEFAULT_TIMEZONE,
  addDaysToDateKey,
  formatDateKeyVi,
  formatVnTime,
  getMonthGridForDateKey,
  getWeekRangeForDateKey,
  getZonedDateParts,
} from "@/lib/time/vn-time";
import { cn } from "@/lib/utils/cn";

type CalendarMode = "week" | "month";

const WEEKDAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

const MODE_TABS: readonly TabItem<CalendarMode>[] = [
  { id: "week", label: "Lịch tuần" },
  { id: "month", label: "Lịch tháng" },
];

function groupLessonsByDateKey(lessons: Lesson[]): Map<string, Lesson[]> {
  const grouped = new Map<string, Lesson[]>();
  const sorted = [...lessons].sort(
    (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime),
  );
  for (const lesson of sorted) {
    const key = getZonedDateParts(lesson.startTime, DEFAULT_TIMEZONE).dateKey;
    const list = grouped.get(key) ?? [];
    list.push(lesson);
    grouped.set(key, list);
  }
  return grouped;
}

export default function TeacherCalendarPage() {
  const tabsPrefix = useId();
  const [todayKey] = useState<string>(
    () => getZonedDateParts(new Date(), DEFAULT_TIMEZONE).dateKey,
  );
  const [mode, setMode] = useState<CalendarMode>("week");
  const [anchorDateKey, setAnchorDateKey] = useState<string>(() => todayKey);
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => todayKey);
  const [courseFilter, setCourseFilter] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [modalNonce, setModalNonce] = useState(0);

  const coursesQuery = useQuery({
    queryKey: teacherKeys.courses("all", "", 1),
    queryFn: () => coursesApi.list({ limit: 100 }),
  });

  const weekRange = useMemo(() => getWeekRangeForDateKey(anchorDateKey), [anchorDateKey]);
  const monthGrid = useMemo(() => getMonthGridForDateKey(anchorDateKey), [anchorDateKey]);

  const activeRange =
    mode === "week"
      ? { from: weekRange.fromUtcIso, to: weekRange.toUtcIso }
      : { from: monthGrid.fromUtcIso, to: monthGrid.toUtcIso };

  const lessonsQuery = useQuery({
    queryKey: teacherKeys.lessons(
      activeRange.from,
      activeRange.to,
      courseFilter || undefined,
    ),
    queryFn: () =>
      lessonsApi.list({
        from: activeRange.from,
        to: activeRange.to,
        courseId: courseFilter || undefined,
        limit: 100,
      }),
    placeholderData: keepPreviousData,
  });

  const courses = useMemo(() => coursesQuery.data?.items ?? [], [coursesQuery.data]);
  const lessons = useMemo(() => lessonsQuery.data?.items ?? [], [lessonsQuery.data]);
  const lessonsByDate = useMemo(() => groupLessonsByDateKey(lessons), [lessons]);

  const openCreateModal = () => {
    setEditingLesson(null);
    setModalNonce((n) => n + 1);
    setModalOpen(true);
  };

  const openEditModal = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setModalNonce((n) => n + 1);
    setModalOpen(true);
  };

  const handleNavigate = (direction: -1 | 1) => {
    if (mode === "week") {
      setAnchorDateKey((prev) => addDaysToDateKey(prev, direction * 7));
    } else {
      const nextMonth = monthGrid.month + direction;
      const date = new Date(Date.UTC(monthGrid.year, nextMonth - 1, 1));
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const firstOfMonth = `${y}-${m}-01`;
      setAnchorDateKey(firstOfMonth);
      setSelectedDayKey(firstOfMonth);
    }
  };

  const rangeHeading =
    mode === "week"
      ? `Tuần ${formatDateKeyVi(weekRange.dateKeys[0]!)} – ${formatDateKeyVi(
          weekRange.dateKeys[6]!,
        )}`
      : `Tháng ${String(monthGrid.month).padStart(2, "0")}/${monthGrid.year}`;

  const selectedDayLessons = lessonsByDate.get(selectedDayKey) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lịch giảng dạy & Google Meet"
        subtitle="Lên lịch và cập nhật các buổi học trực tuyến theo múi giờ Việt Nam (GMT+7)."
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className={buttonVariants({ variant: "primary" })}
          >
            <Plus className="h-4 w-4" aria-hidden={true} />
            Lên lịch buổi học
          </button>
        }
      />

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Chế độ xem lịch dạy"
            items={MODE_TABS}
            value={mode}
            onChange={setMode}
          />
        }
      >
        <select
          aria-label="Lọc theo khóa học"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
        >
          <option value="">Tất cả khóa học</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} — {course.title}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleNavigate(-1)}
            aria-label={mode === "week" ? "Tuần trước" : "Tháng trước"}
            className={buttonVariants({ variant: "secondary", size: "sm", className: "min-w-[44px]" })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden={true} />
          </button>
          <span className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900">
            <Calendar className="h-4 w-4 text-blue-700" aria-hidden={true} />
            {rangeHeading}
          </span>
          <button
            type="button"
            onClick={() => handleNavigate(1)}
            aria-label={mode === "week" ? "Tuần sau" : "Tháng sau"}
            className={buttonVariants({ variant: "secondary", size: "sm", className: "min-w-[44px]" })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden={true} />
          </button>
          <button
            type="button"
            onClick={() => {
              setAnchorDateKey(todayKey);
              setSelectedDayKey(todayKey);
            }}
            className={buttonVariants({ variant: "soft", size: "sm" })}
          >
            Hôm nay
          </button>
        </div>
      </Toolbar>

      <QueryState
        isLoading={lessonsQuery.isLoading}
        isError={lessonsQuery.isError}
        error={lessonsQuery.error}
        onRetry={() => void lessonsQuery.refetch()}
        loadingLabel="Đang tải lịch dạy..."
      >
        <TabPanel idPrefix={tabsPrefix} value="week" activeValue={mode} className="space-y-6">
          <div className="grid gap-3 md:grid-cols-7">
            {weekRange.dateKeys.map((dateKey, idx) => {
              const dayLessons = lessonsByDate.get(dateKey) ?? [];
              const isToday = dateKey === todayKey;
              return (
                <section
                  key={dateKey}
                  aria-label={`${WEEKDAY_SHORT[idx]} ${formatDateKeyVi(dateKey)}`}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border p-3",
                    isToday ? "border-blue-400 bg-blue-50/40" : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-semibold text-slate-700">
                      {WEEKDAY_SHORT[idx]} · {formatDateKeyVi(dateKey).slice(0, 5)}
                    </span>
                    {isToday ? (
                      <span className="rounded bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        Hôm nay
                      </span>
                    ) : null}
                  </div>
                  {dayLessons.length === 0 ? (
                    <p className="text-xs text-slate-600">Trống lịch</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {dayLessons.map((lesson) => (
                        <li key={lesson.id}>
                          <button
                            type="button"
                            onClick={() => openEditModal(lesson)}
                            className="w-full rounded-lg border border-blue-200 bg-blue-50 p-2 text-left text-xs transition-colors hover:bg-blue-100"
                          >
                            <p className="font-semibold text-blue-950">
                              {formatVnTime(lesson.startTime)} – {formatVnTime(lesson.endTime)}
                            </p>
                            <p className="font-medium text-slate-900">{lesson.title}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          <section aria-label="Danh sách buổi học trong tuần" className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Danh sách buổi học trong tuần ({lessons.length})
            </h2>
            {lessons.length === 0 ? (
              <div className="lms-card text-sm text-slate-600">
                Tuần này chưa có buổi học nào được lên lịch.
              </div>
            ) : (
              <div className="space-y-3">
                {lessons.map((lesson) => (
                  <div key={lesson.id} className="space-y-2">
                    <LessonCard lesson={lesson} />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openEditModal(lesson)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden={true} />
                        Chỉnh sửa: {lesson.title}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabPanel>

        <TabPanel idPrefix={tabsPrefix} value="month" activeValue={mode} className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-700">
                {WEEKDAY_SHORT.map((dayLabel) => (
                  <div key={dayLabel} className="py-2.5">
                    {dayLabel}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthGrid.cells.map((cell) => {
                  const dayLessons = lessonsByDate.get(cell.dateKey) ?? [];
                  const isToday = cell.dateKey === todayKey;
                  const isSelected = cell.dateKey === selectedDayKey;
                  return (
                    <button
                      key={cell.dateKey}
                      type="button"
                      onClick={() => setSelectedDayKey(cell.dateKey)}
                      aria-pressed={isSelected}
                      aria-label={`${formatDateKeyVi(cell.dateKey)}, ${dayLessons.length} buổi học`}
                      className={cn(
                        "flex min-h-[88px] flex-col items-start gap-1 border-b border-r border-slate-200 p-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-700",
                        !cell.inCurrentMonth && "bg-slate-50 text-slate-600",
                        isSelected && "bg-blue-50/70 ring-2 ring-inset ring-blue-700",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                          isToday
                            ? "bg-blue-700 text-white"
                            : cell.inCurrentMonth
                              ? "text-slate-900"
                              : "text-slate-600",
                        )}
                      >
                        {Number(cell.dateKey.slice(8, 10))}
                      </span>
                      {dayLessons.slice(0, 2).map((lesson) => (
                        <span
                          key={lesson.id}
                          className="w-full truncate rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-950"
                        >
                          {formatVnTime(lesson.startTime)} {lesson.title}
                        </span>
                      ))}
                      {dayLessons.length > 2 ? (
                        <span className="text-[11px] font-semibold text-blue-800">
                          +{dayLessons.length - 2} buổi khác
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <section aria-label="Buổi học trong ngày" className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              Buổi học ngày {formatDateKeyVi(selectedDayKey)} ({selectedDayLessons.length})
            </h2>
            {selectedDayLessons.length === 0 ? (
              <div className="lms-card text-sm text-slate-600">
                Không có buổi học nào trong ngày {formatDateKeyVi(selectedDayKey)}.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayLessons.map((lesson) => (
                  <div key={lesson.id} className="space-y-2">
                    <LessonCard lesson={lesson} />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openEditModal(lesson)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden={true} />
                        Chỉnh sửa: {lesson.title}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </TabPanel>
      </QueryState>

      <LessonModal
        key={editingLesson?.id ?? `new-${modalNonce}`}
        open={modalOpen}
        courses={courses}
        initialLesson={editingLesson}
        defaultDateKey={selectedDayKey}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
