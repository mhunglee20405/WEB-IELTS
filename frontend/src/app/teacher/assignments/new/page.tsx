"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CalendarClock, Send } from "lucide-react";
import { PageHeader, QueryState } from "@/components/ui";
import {
  assignmentsApi,
  coursesApi,
  exercisesApi,
  teacherExamTestsApi,
} from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys, teacherKeys } from "@/lib/api/query-keys";
import { CreateAssignmentFormSchema } from "@/lib/api/schemas";
import type { ExamMode } from "@/lib/api/types";
import {
  DEFAULT_TIMEZONE,
  formatDateKeyVi,
  formatVnDateTime,
  getVnDailyWindowSync,
  getZonedDateParts,
} from "@/lib/time/vn-time";

export default function TeacherNewAssignmentPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [courseId, setCourseId] = useState("");
  const [exerciseId, setExerciseId] = useState("");
  const [title, setTitle] = useState("");
  const [assignedDate, setAssignedDate] = useState(
    () => getZonedDateParts(new Date(), DEFAULT_TIMEZONE).dateKey,
  );
  const [requiredScope, setRequiredScope] = useState<ExamMode>("FULL");
  const [requiredPartId, setRequiredPartId] = useState("");
  const [durationMinutesOverride, setDurationMinutesOverride] = useState("");
  const [maxAttempts, setMaxAttempts] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const coursesQuery = useQuery({
    queryKey: teacherKeys.courses("active", "", 1),
    queryFn: () => coursesApi.list({ status: "active", limit: 100 }),
  });

  const exercisesQuery = useQuery({
    queryKey: teacherKeys.exercises("all", "published", "", 1),
    queryFn: () => exercisesApi.list({ status: "published", limit: 100 }),
  });

  const examTestsQuery = useQuery({
    queryKey: examKeys.teacherBankList(undefined, "PUBLISHED", undefined),
    queryFn: () => teacherExamTestsApi.list({ status: "PUBLISHED", limit: 100 }),
  });

  const vnWindowPreview = useMemo(() => {
    try {
      return getVnDailyWindowSync(assignedDate);
    } catch {
      return null;
    }
  }, [assignedDate]);

  const createMutation = useMutation({
    mutationFn: assignmentsApi.create,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: teacherKeys.assignmentsRoot });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.dashboard });
      router.push(`/teacher/assignments/${encodeURIComponent(created.id)}/results`);
    },
  });

  const courses = coursesQuery.data?.items ?? [];
  const publishedExercises = exercisesQuery.data?.items ?? [];
  const publishedExamTests = useMemo(
    () => examTestsQuery.data?.items ?? [],
    [examTestsQuery.data?.items],
  );
  const selectedV2Test = useMemo(
    () => publishedExamTests.find((t) => t.id === exerciseId) ?? null,
    [publishedExamTests, exerciseId],
  );

  const handleExerciseChange = (nextId: string) => {
    setExerciseId(nextId);
    const chosenLegacy = publishedExercises.find((e) => e.id === nextId);
    const chosenV2 = publishedExamTests.find((t) => t.id === nextId);
    if (chosenV2) {
      const defaultScope: ExamMode = chosenV2.allowedModes.includes("FULL")
        ? "FULL"
        : "PART";
      setRequiredScope(defaultScope);
      setRequiredPartId(chosenV2.parts[0]?.id ?? "");
      if (!title.trim()) {
        setTitle(`${chosenV2.title} (${formatDateKeyVi(assignedDate)})`);
      }
      return;
    }
    setRequiredPartId("");
    if (chosenLegacy && !title.trim()) {
      setTitle(`${chosenLegacy.title} (${formatDateKeyVi(assignedDate)})`);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const durationSecs = durationMinutesOverride.trim()
      ? Number(durationMinutesOverride) * 60
      : undefined;
    const maxAttemptsNum = maxAttempts.trim() ? Number(maxAttempts) : undefined;

    if (selectedV2Test && requiredScope === "PART" && !requiredPartId) {
      setFieldErrors({ requiredPartId: "Vui lòng chọn Passage hoặc Section cụ thể." });
      return;
    }

    const parsed = CreateAssignmentFormSchema.safeParse({
      courseId,
      exerciseId,
      title,
      assignedDate,
      examTestId: selectedV2Test ? selectedV2Test.id : undefined,
      requiredScope: selectedV2Test ? requiredScope : undefined,
      requiredPartId:
        selectedV2Test && requiredScope === "PART" ? requiredPartId : null,
      allowedModes: selectedV2Test ? [requiredScope] : undefined,
      durationSecondsOverride: durationSecs ?? null,
      maxAttempts: maxAttemptsNum ?? null,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    const bounds = getVnDailyWindowSync(parsed.data.assignedDate);
    createMutation.mutate({
      courseId: parsed.data.courseId,
      exerciseId: parsed.data.exerciseId,
      title: parsed.data.title,
      assignedDate: parsed.data.assignedDate,
      openAt: bounds.startUtcIso,
      dueAt: bounds.endExclusiveUtcIso,
      timezone: DEFAULT_TIMEZONE,
      examTestId: parsed.data.examTestId,
      requiredScope: parsed.data.requiredScope,
      requiredPartId: parsed.data.requiredPartId,
      allowedModes: parsed.data.allowedModes,
      durationSecondsOverride: parsed.data.durationSecondsOverride,
      maxAttempts: parsed.data.maxAttempts,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Giao bài tập hằng ngày"
        subtitle="Chọn khóa học, đề đã xuất bản và ngày giao. Hệ thống tự khóa ngoài khung giờ 00:00–23:59 GMT+7."
        actions={
          <Link
            href="/teacher/assignments"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Danh sách bài giao
          </Link>
        }
      />

      <QueryState
        isLoading={coursesQuery.isLoading || exercisesQuery.isLoading}
        isError={coursesQuery.isError || exercisesQuery.isError}
        error={coursesQuery.error ?? exercisesQuery.error}
        onRetry={() => {
          void coursesQuery.refetch();
          void exercisesQuery.refetch();
        }}
        loadingLabel="Đang tải khóa học và ngân hàng đề..."
      >
        <form onSubmit={handleSubmit} noValidate className="lms-card space-y-5">
          {createMutation.isError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
              <span>{getFriendlyErrorMessage(createMutation.error)}</span>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="asg-course" className="block text-sm font-medium text-slate-900">
                Chọn khóa học <span className="text-red-700">*</span>
              </label>
              <select
                id="asg-course"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                aria-invalid={Boolean(fieldErrors.courseId)}
                aria-describedby={fieldErrors.courseId ? "asg-course-err" : undefined}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
              >
                <option value="">-- Chọn khóa học đang hoạt động --</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} — {course.title}
                  </option>
                ))}
              </select>
              {fieldErrors.courseId ? (
                <p id="asg-course-err" className="mt-1 text-xs font-medium text-red-700">
                  {fieldErrors.courseId}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="asg-exercise" className="block text-sm font-medium text-slate-900">
                Chọn đề đã xuất bản <span className="text-red-700">*</span>
              </label>
              <select
                id="asg-exercise"
                value={exerciseId}
                onChange={(e) => handleExerciseChange(e.target.value)}
                aria-invalid={Boolean(fieldErrors.exerciseId)}
                aria-describedby={fieldErrors.exerciseId ? "asg-ex-err" : undefined}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
              >
                <option value="">-- Chọn bài tập đã xuất bản --</option>
                {publishedExamTests.length > 0 && (
                  <optgroup label="Kho đề thi IELTS v2 (Hỗ trợ PART / FULL)">
                    {publishedExamTests.map((test) => (
                      <option key={test.id} value={test.id}>
                        [{test.skill} v{test.version}] {test.title} ({test.totalQuestions} câu)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Bài tập cơ bản (v1)">
                  {publishedExercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      [{ex.type.toUpperCase()} v{ex.version}] {ex.title}
                    </option>
                  ))}
                </optgroup>
              </select>
              {fieldErrors.exerciseId ? (
                <p id="asg-ex-err" className="mt-1 text-xs font-medium text-red-700">
                  {fieldErrors.exerciseId}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="asg-title" className="block text-sm font-medium text-slate-900">
                Tiêu đề bài giao cho học viên <span className="text-red-700">*</span>
              </label>
              <input
                id="asg-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? "asg-title-err" : undefined}
                placeholder="VD: Reading Ngày 12/11 — Urban Microclimates"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
              />
              {fieldErrors.title ? (
                <p id="asg-title-err" className="mt-1 text-xs font-medium text-red-700">
                  {fieldErrors.title}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="asg-date" className="block text-sm font-medium text-slate-900">
                Ngày giao bài (GMT+7) <span className="text-red-700">*</span>
              </label>
              <input
                id="asg-date"
                type="date"
                value={assignedDate}
                onChange={(e) => setAssignedDate(e.target.value)}
                aria-invalid={Boolean(fieldErrors.assignedDate)}
                aria-describedby={fieldErrors.assignedDate ? "asg-date-err" : undefined}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950"
              />
              {fieldErrors.assignedDate ? (
                <p id="asg-date-err" className="mt-1 text-xs font-medium text-red-700">
                  {fieldErrors.assignedDate}
                </p>
              ) : null}
            </div>
          </div>

          {selectedV2Test ? (
            <section
              aria-label="Cấu hình phạm vi giao bài IELTS v2"
              className="space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-indigo-950">
                  Cấu hình phạm vi đề thi IELTS v2 ({selectedV2Test.skill})
                </h2>
                <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200">
                  {selectedV2Test.partCount} phần · {selectedV2Test.totalQuestions} câu
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-semibold text-slate-800">
                    Phạm vi yêu cầu (Scope)
                  </legend>
                  <div className="flex gap-3 pt-1 text-sm">
                    {selectedV2Test.allowedModes.includes("FULL") && (
                      <label className="inline-flex min-h-9 items-center gap-1.5">
                        <input
                          type="radio"
                          name="requiredScope"
                          value="FULL"
                          checked={requiredScope === "FULL"}
                          onChange={() => setRequiredScope("FULL")}
                        />
                        Full Test
                      </label>
                    )}
                    {selectedV2Test.allowedModes.includes("PART") && (
                      <label className="inline-flex min-h-9 items-center gap-1.5">
                        <input
                          type="radio"
                          name="requiredScope"
                          value="PART"
                          checked={requiredScope === "PART"}
                          onChange={() => {
                            setRequiredScope("PART");
                            if (!requiredPartId && selectedV2Test.parts[0]) {
                              setRequiredPartId(selectedV2Test.parts[0].id);
                            }
                          }}
                        />
                        1 Part cụ thể
                      </label>
                    )}
                  </div>
                </fieldset>

                {requiredScope === "PART" && (
                  <div>
                    <label
                      htmlFor="asg-required-part"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Chọn {selectedV2Test.skill === "READING" ? "Passage" : "Section"} bắt buộc
                    </label>
                    <select
                      id="asg-required-part"
                      value={requiredPartId}
                      onChange={(e) => setRequiredPartId(e.target.value)}
                      className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    >
                      {selectedV2Test.parts.map((part) => (
                        <option key={part.id} value={part.id}>
                          {part.partType === "PASSAGE" ? "Passage" : "Section"} {part.partNumber}:{" "}
                          {part.title} ({part.questionCount} câu)
                        </option>
                      ))}
                    </select>
                    {fieldErrors.requiredPartId && (
                      <p className="mt-1 text-xs font-medium text-red-700">
                        {fieldErrors.requiredPartId}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="asg-duration-override"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Giới hạn (phút)
                    </label>
                    <input
                      id="asg-duration-override"
                      type="number"
                      min={1}
                      max={180}
                      placeholder="Mặc định"
                      value={durationMinutesOverride}
                      onChange={(e) => setDurationMinutesOverride(e.target.value)}
                      className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="asg-max-attempts"
                      className="block text-xs font-semibold text-slate-800"
                    >
                      Số lượt tối đa
                    </label>
                    <input
                      id="asg-max-attempts"
                      type="number"
                      min={1}
                      max={20}
                      placeholder="Không giới hạn"
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(e.target.value)}
                      className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-indigo-900">
                Tóm tắt giao bài: Học viên sẽ làm{" "}
                <strong>
                  {requiredScope === "FULL"
                    ? `toàn bộ ${selectedV2Test.partCount} phần (${selectedV2Test.totalQuestions} câu)`
                    : selectedV2Test.parts.find((p) => p.id === requiredPartId)?.title ??
                      "1 phần chỉ định"}
                </strong>
                {durationMinutesOverride ? ` trong ${durationMinutesOverride} phút` : ""}
                {maxAttempts ? `, tối đa ${maxAttempts} lượt thi` : ""}.
              </p>
            </section>
          ) : null}

          {vnWindowPreview ? (
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-950">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden={true} />
              <div className="space-y-1 text-xs">
                <p className="font-semibold">
                  Khung mở/đóng bài tự động theo giờ Việt Nam ({DEFAULT_TIMEZONE})
                </p>
                <p>
                  Mở bài: <strong>{formatVnDateTime(vnWindowPreview.startUtcIso)}</strong> (00:00)
                  · Hạn nộp: <strong>{formatVnDateTime(vnWindowPreview.endExclusiveUtcIso)}</strong>
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <Link
              href="/teacher/assignments"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
            >
              <Send className="h-4 w-4" aria-hidden={true} />
              {createMutation.isPending ? "Đang giao bài..." : "Xác nhận giao bài"}
            </button>
          </div>
        </form>
      </QueryState>
    </div>
  );
}

