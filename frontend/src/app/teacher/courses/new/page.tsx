"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { CourseForm } from "@/components/teacher/course-form";
import { PageHeader } from "@/components/ui";
import { coursesApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";

export default function TeacherNewCoursePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createMutation = useMutation({
    mutationFn: coursesApi.create,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: teacherKeys.coursesRoot });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.dashboard });
      router.push(`/teacher/courses/${encodeURIComponent(created.id)}/students`);
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo khóa học mới"
        subtitle="Thiết lập lớp 1:1 hoặc lớp nhóm và lộ trình band điểm cam kết."
        actions={
          <Link
            href="/teacher/courses"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Danh sách khóa học
          </Link>
        }
      />

      <div className="lms-card">
        <CourseForm
          mode="create"
          defaultTeacherId={user?.id ?? "tch-01"}
          isPending={createMutation.isPending}
          serverError={createMutation.error}
          submitLabel="Tạo khóa học"
          onCancel={() => router.push("/teacher/courses")}
          onSubmit={async (values) => {
            await createMutation.mutateAsync({
              code: values.code,
              title: values.title,
              description: values.description,
              courseType: values.courseType,
              startBand: values.startBand,
              targetBand: values.targetBand,
              teacherId: values.teacherId,
              timezone: values.timezone,
              startDate: values.startDate,
              endDate: values.endDate,
            });
          }}
        />
      </div>
    </div>
  );
}

