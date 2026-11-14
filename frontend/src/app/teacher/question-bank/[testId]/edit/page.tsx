"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ExamTestBuilder } from "@/components/teacher/exam-test-builder";
import { PageHeader, QueryState } from "@/components/ui";
import { teacherExamTestsApi } from "@/lib/api/endpoints";
import { examKeys } from "@/lib/api/query-keys";

export default function TeacherEditExamTestPage() {
  const params = useParams<{ testId: string }>();
  const testId = decodeURIComponent(params.testId);

  const detailQuery = useQuery({
    queryKey: examKeys.teacherTestDetail(testId),
    queryFn: () => teacherExamTestsApi.getById(testId),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Biên soạn & Cập nhật đề thi IELTS"
        subtitle="Chỉnh sửa Passage/Section, kiểm tra hợp lệ, xem trước góc nhìn học viên hoặc xuất bản phiên bản mới."
      />

      <QueryState
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
        error={detailQuery.error}
        isEmpty={!detailQuery.data}
        emptyTitle="Không tìm thấy đề thi"
        emptyDescription="Đề thi không tồn tại trong kho dữ liệu của giảng viên."
        onRetry={() => void detailQuery.refetch()}
      >
        {detailQuery.data && (
          <ExamTestBuilder key={detailQuery.data.id} initialTest={detailQuery.data} />
        )}
      </QueryState>
    </div>
  );
}
