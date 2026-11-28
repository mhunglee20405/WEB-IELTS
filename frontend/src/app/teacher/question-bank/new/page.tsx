"use client";

import { ExamTestBuilder } from "@/components/teacher/exam-test-builder";
import { PageHeader } from "@/components/ui";

export default function TeacherCreateExamTestPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tạo Passage Reading / Section Listening mới"
        subtitle="Khởi tạo đề thi ở trạng thái Bản nháp (DRAFT), upload âm thanh riêng tư cho Listening hoặc soạn đoạn đọc và 15 dạng câu hỏi IELTS."
      />
      <ExamTestBuilder />
    </div>
  );
}
