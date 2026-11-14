"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { CourseFormSchema } from "@/lib/api/schemas";
import type { Course, CourseFormat, CourseStatus } from "@/lib/api/types";
import { DEFAULT_TIMEZONE } from "@/lib/time/vn-time";

export interface CourseFormValues {
  code: string;
  title: string;
  description: string;
  courseType: CourseFormat;
  startBand: string;
  targetBand: string;
  status: CourseStatus;
  teacherId: string;
  timezone: string;
  startDate: string;
  endDate: string;
}

export interface CourseFormProps {
  mode: "create" | "edit";
  initialCourse?: Course;
  defaultTeacherId?: string;
  isPending: boolean;
  serverError: unknown;
  submitLabel: string;
  onSubmit: (values: {
    code: string;
    title: string;
    description?: string;
    courseType: CourseFormat;
    startBand: number;
    targetBand: number;
    status: CourseStatus;
    teacherId: string;
    timezone: string;
    startDate?: string;
    endDate?: string;
  }) => void | Promise<void>;
  onCancel?: () => void;
}

export function CourseForm({
  mode,
  initialCourse,
  defaultTeacherId = "",
  isPending,
  serverError,
  submitLabel,
  onSubmit,
  onCancel,
}: CourseFormProps) {
  const [values, setValues] = useState<CourseFormValues>(() => ({
    code: initialCourse?.code ?? "",
    title: initialCourse?.title ?? "",
    description: initialCourse?.description ?? "",
    courseType: initialCourse?.courseType ?? "group",
    startBand: String(initialCourse?.startBand ?? 5.0),
    targetBand: String(initialCourse?.targetBand ?? 6.5),
    status: initialCourse?.status ?? "active",
    teacherId: initialCourse?.teacherId ?? defaultTeacherId,
    timezone: initialCourse?.timezone ?? DEFAULT_TIMEZONE,
    startDate: initialCourse?.startDate?.slice(0, 10) ?? "",
    endDate: initialCourse?.endDate?.slice(0, 10) ?? "",
  }));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const updateField = <K extends keyof CourseFormValues>(key: K, next: CourseFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = CourseFormSchema.safeParse({
      code: values.code,
      title: values.title,
      description: values.description || undefined,
      courseType: values.courseType,
      startBand: values.startBand,
      targetBand: values.targetBand,
      status: values.status,
      teacherId: values.teacherId,
      timezone: values.timezone || DEFAULT_TIMEZONE,
      startDate: values.startDate || undefined,
      endDate: values.endDate || undefined,
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
    await onSubmit(parsed.data);
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-5">
      {serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{getFriendlyErrorMessage(serverError)}</span>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="course-code" className="block text-sm font-medium text-slate-900">
            Mã khóa học <span className="text-red-700">*</span>
          </label>
          <input
            id="course-code"
            name="code"
            type="text"
            required
            readOnly={mode === "edit"}
            value={values.code}
            onChange={(e) => updateField("code", e.target.value)}
            aria-invalid={Boolean(fieldErrors.code)}
            aria-describedby={fieldErrors.code ? "course-code-err" : undefined}
            placeholder="VD: IELTS-ACAD-K14"
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 read-only:bg-slate-100 read-only:text-slate-600"
          />
          {fieldErrors.code ? (
            <p id="course-code-err" className="mt-1 text-xs font-medium text-red-700">
              {fieldErrors.code}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="course-type" className="block text-sm font-medium text-slate-900">
            Hình thức lớp học <span className="text-red-700">*</span>
          </label>
          <select
            id="course-type"
            name="courseType"
            value={values.courseType}
            onChange={(e) => updateField("courseType", e.target.value as CourseFormat)}
            className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
          >
            <option value="group">Lớp nhóm (Group)</option>
            <option value="1:1">Lớp 1:1 (Tối đa 1 học viên)</option>
          </select>
          <p className="mt-1 text-xs text-slate-600">
            Lớp 1:1 tự động giới hạn tối đa 1 học viên đang theo học.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="course-title" className="block text-sm font-medium text-slate-900">
          Tên khóa học <span className="text-red-700">*</span>
        </label>
        <input
          id="course-title"
          name="title"
          type="text"
          required
          value={values.title}
          onChange={(e) => updateField("title", e.target.value)}
          aria-invalid={Boolean(fieldErrors.title)}
          aria-describedby={fieldErrors.title ? "course-title-err" : undefined}
          placeholder="VD: IELTS Academic Reading & Listening Band 7.0"
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
        />
        {fieldErrors.title ? (
          <p id="course-title-err" className="mt-1 text-xs font-medium text-red-700">
            {fieldErrors.title}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="start-band" className="block text-sm font-medium text-slate-900">
            Band xuất phát <span className="text-red-700">*</span>
          </label>
          <input
            id="start-band"
            name="startBand"
            type="number"
            min="0"
            max="9"
            step="0.5"
            required
            value={values.startBand}
            onChange={(e) => updateField("startBand", e.target.value)}
            aria-invalid={Boolean(fieldErrors.startBand)}
            aria-describedby={fieldErrors.startBand ? "start-band-err" : undefined}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 tabular-nums"
          />
          {fieldErrors.startBand ? (
            <p id="start-band-err" className="mt-1 text-xs font-medium text-red-700">
              {fieldErrors.startBand}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="target-band" className="block text-sm font-medium text-slate-900">
            Band mục tiêu <span className="text-red-700">*</span>
          </label>
          <input
            id="target-band"
            name="targetBand"
            type="number"
            min="0"
            max="9"
            step="0.5"
            required
            value={values.targetBand}
            onChange={(e) => updateField("targetBand", e.target.value)}
            aria-invalid={Boolean(fieldErrors.targetBand)}
            aria-describedby={fieldErrors.targetBand ? "target-band-err" : undefined}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 tabular-nums"
          />
          {fieldErrors.targetBand ? (
            <p id="target-band-err" className="mt-1 text-xs font-medium text-red-700">
              {fieldErrors.targetBand}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="course-status" className="block text-sm font-medium text-slate-900">
            Trạng thái
          </label>
          <select
            id="course-status"
            name="status"
            disabled={mode === "create"}
            value={values.status}
            onChange={(e) => updateField("status", e.target.value as CourseStatus)}
            className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
          >
            <option value="active">Đang hoạt động</option>
            <option value="upcoming">Sắp mở</option>
            <option value="archived">Lưu trữ</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="teacher-id" className="block text-sm font-medium text-slate-900">
            Mã giảng viên phụ trách <span className="text-red-700">*</span>
          </label>
          <input
            id="teacher-id"
            name="teacherId"
            type="text"
            required
            value={values.teacherId}
            onChange={(e) => updateField("teacherId", e.target.value)}
            aria-invalid={Boolean(fieldErrors.teacherId)}
            aria-describedby={fieldErrors.teacherId ? "teacher-id-err" : undefined}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
          />
          {fieldErrors.teacherId ? (
            <p id="teacher-id-err" className="mt-1 text-xs font-medium text-red-700">
              {fieldErrors.teacherId}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="start-date" className="block text-sm font-medium text-slate-900">
            Ngày khai giảng
          </label>
          <input
            id="start-date"
            name="startDate"
            type="date"
            value={values.startDate}
            onChange={(e) => updateField("startDate", e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
          />
        </div>

        <div>
          <label htmlFor="end-date" className="block text-sm font-medium text-slate-900">
            Ngày kết thúc dự kiến
          </label>
          <input
            id="end-date"
            name="endDate"
            type="date"
            value={values.endDate}
            onChange={(e) => updateField("endDate", e.target.value)}
            aria-invalid={Boolean(fieldErrors.endDate)}
            aria-describedby={fieldErrors.endDate ? "end-date-err" : undefined}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
          />
          {fieldErrors.endDate ? (
            <p id="end-date-err" className="mt-1 text-xs font-medium text-red-700">
              {fieldErrors.endDate}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="course-description" className="block text-sm font-medium text-slate-900">
          Mô tả lộ trình học tập
        </label>
        <textarea
          id="course-description"
          name="description"
          rows={3}
          value={values.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="Mục tiêu luyện đề Reading & Listening và dịch thuật hằng ngày..."
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Hủy
          </button>
        ) : null}
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {isPending ? "Đang lưu..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

