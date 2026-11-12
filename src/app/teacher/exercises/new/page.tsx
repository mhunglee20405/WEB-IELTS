"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExerciseAuthoringForm } from "@/components/teacher/exercise-authoring-form";
import { PageHeader } from "@/components/ui";

export default function TeacherNewExercisePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Soạn bài tập Reading / Listening mới"
        subtitle="Thiết kế đoạn văn hoặc tải tệp âm thanh riêng tư cùng bộ câu hỏi và đáp án chuẩn."
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

      <ExerciseAuthoringForm mode="create" />
    </div>
  );
}

