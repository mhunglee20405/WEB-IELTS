import type { ExamAnswerValue, ExamQuestionType } from "@/lib/api/types";

export const EXAM_QUESTION_TYPE_LABELS: Record<ExamQuestionType, string> = {
  MULTIPLE_CHOICE_SINGLE: "Trắc nghiệm (1 đáp án)",
  MULTIPLE_CHOICE_MULTIPLE: "Trắc nghiệm (nhiều đáp án)",
  TRUE_FALSE_NOT_GIVEN: "True / False / Not Given",
  YES_NO_NOT_GIVEN: "Yes / No / Not Given",
  MATCHING_HEADINGS: "Nối tiêu đề (Matching Headings)",
  MATCHING_INFORMATION: "Nối thông tin đoạn văn",
  MATCHING_FEATURES: "Nối đặc điểm / Nhân vật",
  MATCHING_SENTENCE_ENDINGS: "Hoàn thành vế câu (Sentence Endings)",
  SENTENCE_COMPLETION: "Điền từ hoàn thành câu",
  SUMMARY_COMPLETION: "Điền từ tóm tắt (Summary)",
  NOTE_COMPLETION: "Hoàn thành ghi chú (Note)",
  TABLE_COMPLETION: "Hoàn thành bảng (Table)",
  FLOW_CHART_COMPLETION: "Hoàn thành lưu đồ (Flow-chart)",
  DIAGRAM_LABEL_COMPLETION: "Điền nhãn sơ đồ (Diagram)",
  SHORT_ANSWER: "Trả lời ngắn (Short Answer)",
};

export const COMPLETION_QUESTION_TYPES: ReadonlySet<ExamQuestionType> = new Set([
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
  "NOTE_COMPLETION",
  "TABLE_COMPLETION",
  "FLOW_CHART_COMPLETION",
  "DIAGRAM_LABEL_COMPLETION",
  "SHORT_ANSWER",
]);

export const MATCHING_QUESTION_TYPES: ReadonlySet<ExamQuestionType> = new Set([
  "MATCHING_HEADINGS",
  "MATCHING_INFORMATION",
  "MATCHING_FEATURES",
  "MATCHING_SENTENCE_ENDINGS",
]);

export function isAnsweredValue(val: ExamAnswerValue | undefined | null): boolean {
  if (val === undefined || val === null) return false;
  if (Array.isArray(val)) {
    return val.some((item) => item.trim().length > 0);
  }
  return val.trim().length > 0;
}

export function serializeAttemptAnswers(
  raw: Record<string, ExamAnswerValue | undefined>,
): Record<string, ExamAnswerValue> {
  const out: Record<string, ExamAnswerValue> = {};
  for (const [questionId, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const cleaned = [...new Set(value.map((v) => v.trim()).filter(Boolean))];
      if (cleaned.length > 0) {
        out[questionId] = cleaned;
      }
    } else {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        out[questionId] = trimmed;
      }
    }
  }
  return out;
}

export function countAnsweredQuestions(
  raw: Record<string, ExamAnswerValue | undefined>,
): number {
  return Object.values(raw).filter((val) => isAnsweredValue(val)).length;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function formatExamDurationSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

