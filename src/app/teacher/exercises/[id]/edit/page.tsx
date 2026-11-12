"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { ExerciseAuthoringForm } from "@/components/teacher/exercise-authoring-form";
import { PageHeader, QueryState } from "@/components/ui";
import { exercisesApi } from "@/lib/api/endpoints";
import { teacherKeys } from "@/lib/api/query-keys";

export default function TeacherEditExercisePage() {
  const params = useParams<{ id: string }>();
  const exerciseId = decodeURIComponent(params.id);

  const query = useQuery({
    queryKey: teacherKeys.exerciseDetail(exerciseId),
    queryFn: () => exercisesApi.getById(exerciseId),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={query.data ? `Chỉnh sửa đề: ${query.data.title}` : "Chi tiết bài tập"}
        subtitle="Đề ở trạng thái Nháp có thể sửa trực tiếp; đề Đã xuất bản cần tạo phiên bản mới để thay đổi câu hỏi."
        actions={
          <Link
            href="/teacher/exercises"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Ngân hàng đề
          </Link>
        }
      />

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Đang tải chi tiết bài tập..."
      >
        {query.data ? (
          <ExerciseAuthoringForm
            key={`${query.data.id}-${query.data.status}-${query.data.version}`}
            mode="edit"
            initialExercise={query.data}
          />
        ) : null}
      </QueryState>
    </div>
  );
}

