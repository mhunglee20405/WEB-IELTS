"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { ModalDialog } from "@/components/ui";
import { lessonsApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { teacherKeys } from "@/lib/api/query-keys";
import { LessonFormSchema } from "@/lib/api/schemas";
import type { Course, Lesson, LessonStatus, LessonType } from "@/lib/api/types";
import {
  DEFAULT_TIMEZONE,
  getZonedDateParts,
  resolveZonedEventTime,
} from "@/lib/time/vn-time";

export interface LessonModalProps {
  open: boolean;
  courses: Course[];
  initialLesson?: Lesson | null;
  defaultDateKey?: string;
  onClose: () => void;
}

function toHm(iso: string): string {
  const parts = getZonedDateParts(iso, DEFAULT_TIMEZONE);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function LessonModal({
  open,
  courses,
  initialLesson,
  defaultDateKey,
  onClose,
}: LessonModalProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(initialLesson);

  const [courseId, setCourseId] = useState(
    () => initialLesson?.courseId ?? courses[0]?.id ?? "",
  );
  const [title, setTitle] = useState(() => initialLesson?.title ?? "");
  const [description, setDescription] = useState(() => initialLesson?.description ?? "");
  const [type, setType] = useState<LessonType>(() => initialLesson?.type ?? "live_meet");
  const [status, setStatus] = useState<LessonStatus>(
    () => initialLesson?.status ?? "scheduled",
  );
  const [dateKey, setDateKey] = useState(() =>
    initialLesson
      ? getZonedDateParts(initialLesson.startTime, DEFAULT_TIMEZONE).dateKey
      : defaultDateKey ?? getZonedDateParts(new Date(), DEFAULT_TIMEZONE).dateKey,
  );
  const [startTimeHm, setStartTimeHm] = useState(() =>
    initialLesson ? toHm(initialLesson.startTime) : "19:30",
  );
  const [endTimeHm, setEndTimeHm] = useState(() =>
    initialLesson ? toHm(initialLesson.endTime) : "21:00",
  );
  const [meetUrl, setMeetUrl] = useState(() => initialLesson?.meetUrl ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (valid: {
      courseId: string;
      title: string;
      description?: string;
      type: LessonType;
      status?: LessonStatus;
      dateKey: string;
      startTimeHm: string;
      endTimeHm: string;
      meetUrl?: string;
    }) => {
      const [startResolved, endResolved] = await Promise.all([
        resolveZonedEventTime(valid.dateKey, valid.startTimeHm, DEFAULT_TIMEZONE),
        resolveZonedEventTime(valid.dateKey, valid.endTimeHm, DEFAULT_TIMEZONE),
      ]);

      if (initialLesson) {
        return lessonsApi.update(initialLesson.id, {
          title: valid.title,
          description: valid.description,
          type: valid.type,
          status: valid.status,
          startTime: startResolved.isoUtc,
          endTime: endResolved.isoUtc,
          timezone: DEFAULT_TIMEZONE,
          meetUrl: valid.meetUrl,
        });
      }

      return lessonsApi.create({
        courseId: valid.courseId,
        title: valid.title,
        description: valid.description,
        type: valid.type,
        startTime: startResolved.isoUtc,
        endTime: endResolved.isoUtc,
        timezone: DEFAULT_TIMEZONE,
        meetUrl: valid.meetUrl,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teacher", "lessons"] });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.dashboard });
      onClose();
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = LessonFormSchema.safeParse({
      courseId,
      title,
      description: description || undefined,
      type,
      status: isEditing ? status : undefined,
      dateKey,
      startTimeHm,
      endTimeHm,
      meetUrl: meetUrl || undefined,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    mutation.mutate(parsed.data);
  };

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      size="lg"
      title={isEditing ? "Cập nhật buổi học trực tuyến" : "Lên lịch buổi học trực tuyến"}
      description="Thời gian được quy đổi chính xác theo múi giờ Việt Nam (GMT+7)."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {mutation.isError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
            <span>{getFriendlyErrorMessage(mutation.error)}</span>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lesson-course" className="block text-sm font-medium text-slate-900">
              Khóa học <span className="text-red-700">*</span>
            </label>
            <select
              id="lesson-course"
              disabled={isEditing}
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              aria-invalid={Boolean(fieldErrors.courseId)}
              aria-describedby={fieldErrors.courseId ? "lesson-course-err" : undefined}
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
            >
              <option value="">-- Chọn khóa học --</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} — {course.title}
                </option>
              ))}
            </select>
            {fieldErrors.courseId ? (
              <p id="lesson-course-err" className="mt-1 text-xs font-medium text-red-700">
                {fieldErrors.courseId}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="lesson-type" className="block text-sm font-medium text-slate-900">
              Hình thức buổi học
            </label>
            <select
              id="lesson-type"
              value={type}
              onChange={(e) => setType(e.target.value as LessonType)}
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
            >
              <option value="live_meet">Live Google Meet</option>
              <option value="workshop">Workshop kỹ năng</option>
              <option value="review">Buổi chữa bài</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="lesson-title" className="block text-sm font-medium text-slate-900">
            Tiêu đề buổi học <span className="text-red-700">*</span>
          </label>
          <input
            id="lesson-title"
            type="text"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={fieldErrors.title ? "lesson-title-err" : undefined}
            placeholder="VD: Chữa đề Reading Passage 2 & Phân tích Paraphrase"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
          />
          {fieldErrors.title ? (
            <p id="lesson-title-err" className="mt-1 text-xs font-medium text-red-700">
              {fieldErrors.title}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="lesson-date" className="block text-sm font-medium text-slate-900">
              Ngày dạy (VN) <span className="text-red-700">*</span>
            </label>
            <input
              id="lesson-date"
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              aria-invalid={Boolean(fieldErrors.dateKey)}
              aria-describedby={fieldErrors.dateKey ? "lesson-date-err" : undefined}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
            />
            {fieldErrors.dateKey ? (
              <p id="lesson-date-err" className="mt-1 text-xs font-medium text-red-700">
                {fieldErrors.dateKey}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="lesson-start" className="block text-sm font-medium text-slate-900">
              Giờ bắt đầu <span className="text-red-700">*</span>
            </label>
            <input
              id="lesson-start"
              type="time"
              value={startTimeHm}
              onChange={(e) => setStartTimeHm(e.target.value)}
              aria-invalid={Boolean(fieldErrors.startTimeHm)}
              aria-describedby={fieldErrors.startTimeHm ? "lesson-start-err" : undefined}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
            />
            {fieldErrors.startTimeHm ? (
              <p id="lesson-start-err" className="mt-1 text-xs font-medium text-red-700">
                {fieldErrors.startTimeHm}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="lesson-end" className="block text-sm font-medium text-slate-900">
              Giờ kết thúc <span className="text-red-700">*</span>
            </label>
            <input
              id="lesson-end"
              type="time"
              value={endTimeHm}
              onChange={(e) => setEndTimeHm(e.target.value)}
              aria-invalid={Boolean(fieldErrors.endTimeHm)}
              aria-describedby={fieldErrors.endTimeHm ? "lesson-end-err" : undefined}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
            />
            {fieldErrors.endTimeHm ? (
              <p id="lesson-end-err" className="mt-1 text-xs font-medium text-red-700">
                {fieldErrors.endTimeHm}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lesson-meet" className="block text-sm font-medium text-slate-900">
              Liên kết Google Meet (HTTPS)
            </label>
            <input
              id="lesson-meet"
              type="url"
              value={meetUrl}
              onChange={(e) => setMeetUrl(e.target.value)}
              aria-invalid={Boolean(fieldErrors.meetUrl)}
              aria-describedby={fieldErrors.meetUrl ? "lesson-meet-err" : undefined}
              placeholder="https://meet.google.com/abc-defg-hij"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
            />
            {fieldErrors.meetUrl ? (
              <p id="lesson-meet-err" className="mt-1 text-xs font-medium text-red-700">
                {fieldErrors.meetUrl}
              </p>
            ) : null}
          </div>

          {isEditing ? (
            <div>
              <label htmlFor="lesson-status" className="block text-sm font-medium text-slate-900">
                Trạng thái buổi học
              </label>
              <select
                id="lesson-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as LessonStatus)}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                <option value="scheduled">Sắp diễn ra</option>
                <option value="live">Đang diễn ra</option>
                <option value="completed">Đã kết thúc</option>
                <option value="cancelled">Đã hủy</option>
              </select>
            </div>
          ) : null}
        </div>

        <div>
          <label htmlFor="lesson-desc" className="block text-sm font-medium text-slate-900">
            Ghi chú nội dung buổi học
          </label>
          <textarea
            id="lesson-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nội dung trọng tâm hoặc tài liệu cần chuẩn bị..."
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {mutation.isPending
              ? "Đang lưu..."
              : isEditing
                ? "Lưu cập nhật"
                : "Tạo buổi học"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

