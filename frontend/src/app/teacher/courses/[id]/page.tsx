"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Users } from "lucide-react";
import { CourseForm } from "@/components/teacher/course-form";
import { PageHeader, QueryState } from "@/components/ui";
import { coursesApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";

export default function TeacherEditCoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = decodeURIComponent(params.id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [savedNotice, setSavedNotice] = useState(false);

  const courseQuery = useQuery({
    queryKey: teacherKeys.courseDetail(courseId),
    queryFn: () => coursesApi.getById(courseId),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof coursesApi.update>[1]) =>
      coursesApi.update(courseId, payload),
    onSuccess: async () => {
      setSavedNotice(true);
      await queryClient.invalidateQueries({ queryKey: teacherKeys.courseDetail(courseId) });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.coursesRoot });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.dashboard });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chỉnh sửa khóa học"
        subtitle="Cập nhật tên, mô tả, hình thức lớp học, mục tiêu band hoặc trạng thái khóa học."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/teacher/courses"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden={true} />
              Quay lại
            </Link>
            <Link
              href={`/teacher/courses/${encodeURIComponent(courseId)}/students`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <Users className="h-4 w-4" aria-hidden={true} />
              Quản lý học viên
            </Link>
          </div>
        }
      />

      {savedNotice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
          <span>Đã cập nhật thông tin khóa học thành công.</span>
        </div>
      ) : null}

      <QueryState
        isLoading={courseQuery.isLoading}
        isError={courseQuery.isError}
        error={courseQuery.error}
        onRetry={() => void courseQuery.refetch()}
        loadingLabel="Đang tải thông tin khóa học..."
      >
        {courseQuery.data ? (
          <div className="lms-card">
            <CourseForm
              key={courseQuery.data.id}
              mode="edit"
              initialCourse={courseQuery.data}
              isPending={updateMutation.isPending}
              serverError={updateMutation.error}
              submitLabel="Lưu thay đổi"
              onCancel={() => router.push("/teacher/courses")}
              onSubmit={async (values) => {
                setSavedNotice(false);
                await updateMutation.mutateAsync({
                  title: values.title,
                  description: values.description,
                  courseType: values.courseType,
                  startBand: values.startBand,
                  targetBand: values.targetBand,
                  status: values.status,
                  teacherId: values.teacherId,
                  timezone: values.timezone,
                  startDate: values.startDate,
                  endDate: values.endDate,
                });
              }}
            />
          </div>
        ) : null}
      </QueryState>
    </div>
  );
}

