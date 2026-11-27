"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Lock, Send, Star } from "lucide-react";
import { PageHeader, buttonVariants } from "@/components/ui";
import { feedbacksApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { CreateFeedbackFormSchema } from "@/lib/api/schemas";
import type { FeedbackCategory } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

const FEEDBACK_CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "CONTENT", label: "Nội dung bài học & đề thi" },
  { value: "SYSTEM_BUG", label: "Lỗi hệ thống / Giao diện" },
  { value: "TEACHING", label: "Chất lượng giảng dạy" },
  { value: "FEATURE_REQUEST", label: "Đề xuất tính năng mới" },
  { value: "OTHER", label: "Góp ý khác" },
];

export default function StudentFeedbackPage() {
  const [category, setCategory] = useState<FeedbackCategory>("CONTENT");
  const [rating, setRating] = useState<number | undefined>(undefined);
  const [content, setContent] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { category: FeedbackCategory; rating?: number; content: string }) =>
      feedbacksApi.create(payload),
    onSuccess: () => {
      setFieldError(null);
      setContent("");
      setRating(undefined);
      setSubmittedNotice(
        "Đã gửi góp ý ẩn danh thành công. Cảm ơn đóng góp của bạn để hệ thống ngày càng tốt hơn!",
      );
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittedNotice(null);

    const parsed = CreateFeedbackFormSchema.safeParse({
      category,
      rating,
      content,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Thông tin góp ý chưa hợp lệ.");
      return;
    }

    setFieldError(null);
    mutation.mutate(parsed.data);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Góp ý ẩn danh"
        subtitle="Chia sẻ thẳng thắn về nội dung bài tập, chất lượng giảng dạy hoặc lỗi kỹ thuật."
      />

      <section
        aria-label="Cam kết bảo mật danh tính"
        className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/75 p-4 text-sm text-blue-950"
      >
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden={true} />
        <div className="space-y-1">
          <p className="font-semibold">Góp ý của bạn hoàn toàn ẩn danh</p>
          <p className="text-xs leading-relaxed text-blue-900">
            Hệ thống không lưu mã học viên, họ tên, email hay địa chỉ IP trong cơ sở dữ liệu
            góp ý. Quản trị viên chỉ nhìn thấy phân loại, đánh giá sao và nội dung văn bản. Giới hạn
            tối đa 5 lượt góp ý mỗi ngày theo giờ Việt Nam.
          </p>
        </div>
      </section>

      <form
        noValidate
        onSubmit={handleSubmit}
        className="lms-card max-w-2xl space-y-5"
        aria-labelledby="anonymous-feedback-form-title"
      >
        <h2
          id="anonymous-feedback-form-title"
          className="text-lg font-semibold text-slate-950"
        >
          Biểu mẫu gửi góp ý
        </h2>

        {submittedNotice ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
            <span>{submittedNotice}</span>
          </div>
        ) : null}

        {fieldError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
            <span>{fieldError}</span>
          </div>
        ) : null}

        {mutation.isError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
            <span>{getFriendlyErrorMessage(mutation.error)}</span>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <label htmlFor="feedback-category" className="block text-sm font-medium text-slate-900">
            Phân loại góp ý <span className="text-red-700">*</span>
          </label>
          <select
            id="feedback-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            className="lms-input"
          >
            {FEEDBACK_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-900">
            Mức độ hài lòng (tùy chọn)
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((starValue) => {
              const selected = rating === starValue;
              const filled = rating !== undefined && starValue <= rating;
              return (
                <button
                  key={starValue}
                  type="button"
                  aria-label={`${starValue} sao`}
                  aria-pressed={selected}
                  onClick={() => setRating(selected ? undefined : starValue)}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                    selected
                      ? "border-amber-400 bg-amber-50 text-amber-950"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      filled ? "fill-amber-400 text-amber-500" : "text-slate-400",
                    )}
                    aria-hidden={true}
                  />
                  <span>{starValue}</span>
                </button>
              );
            })}
            {rating !== undefined ? (
              <button
                type="button"
                onClick={() => setRating(undefined)}
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                Bỏ chọn
              </button>
            ) : null}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="feedback-content" className="block text-sm font-medium text-slate-900">
              Nội dung góp ý <span className="text-red-700">*</span>
            </label>
            <span className="text-xs tabular-nums text-slate-600">
              {content.trim().length} / 2000 ký tự
            </span>
          </div>
          <textarea
            id="feedback-content"
            rows={5}
            maxLength={2000}
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            placeholder="Mô tả chi tiết góp ý của bạn (tối thiểu 10 ký tự, chỉ dùng văn bản thuần)..."
            className="lms-input min-h-[140px]"
          />
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button
            type="submit"
            disabled={mutation.isPending}
            className={buttonVariants({ variant: "primary" })}
          >
            <Send className="h-4 w-4" aria-hidden={true} />
            {mutation.isPending ? "Đang gửi..." : "Gửi góp ý ẩn danh"}
          </button>
        </div>
      </form>
    </div>
  );
}
