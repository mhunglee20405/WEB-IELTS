"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Lock,
  Plus,
  Send,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { SignedAudioPlayer } from "@/components/student/signed-audio-player";
import { RichTextEditor, SafeHtml, StatusBadge } from "@/components/ui";
import { exercisesApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { teacherKeys } from "@/lib/api/query-keys";
import { ExerciseFormSchema } from "@/lib/api/schemas";
import type {
  CreateExerciseRequest,
  ExerciseAuthoringDetail,
  ExerciseType,
  QuestionOption,
  QuestionType,
} from "@/lib/api/types";
import {
  uploadPrivateListeningAudio,
  validateAudioFile,
} from "@/lib/teacher/data-helpers";

export function normalizeUiQuestionTypeToBackend(type: string): string {
  switch (type) {
    case "mcq":
      return "multiple_choice";
    case "tfng":
      return "true_false_not_given";
    case "ynng":
      return "yes_no_not_given";
    case "matching":
      return "matching";
    case "fill_blank":
    case "fill_in_the_blank":
      return "fill_blank";
    case "short_answer":
      return "short_answer";
    case "matching_headings":
      return "matching_headings";
    case "matching_information":
      return "matching_information";
    case "sentence_completion":
      return "sentence_completion";
    case "summary_completion":
      return "summary_completion";
    default:
      return type;
  }
}

export function normalizeBackendQuestionTypeToUi(type: string): QuestionType {
  switch (type) {
    case "multiple_choice":
      return "mcq";
    case "true_false_not_given":
      return "tfng";
    case "yes_no_not_given":
      return "ynng";
    case "matching":
    case "matching_headings":
    case "matching_information":
      return "matching";
    case "fill_blank":
    case "sentence_completion":
    case "summary_completion":
      return "fill_blank";
    case "short_answer":
      return "short_answer";
    default:
      return (type as QuestionType) || "mcq";
  }
}

interface DraftQuestion {
  localId: string;
  prompt: string;
  type: QuestionType;
  options: QuestionOption[];
  points: number;
  correctAnswer: string;
  explanation: string;
}

const DEFAULT_MCQ_OPTIONS: QuestionOption[] = [
  { id: "A", label: "A", text: "" },
  { id: "B", label: "B", text: "" },
  { id: "C", label: "C", text: "" },
  { id: "D", label: "D", text: "" },
];

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Trắc nghiệm (A/B/C/D)",
  tfng: "True / False / Not Given",
  ynng: "Yes / No / Not Given",
  fill_blank: "Điền từ vào chỗ trống",
  matching: "Ghép nối (Matching)",
  short_answer: "Trả lời ngắn",
};

function createEmptyQuestion(orderIndex: number, exerciseType: ExerciseType): DraftQuestion {
  return {
    localId: `draft-q-${Date.now()}-${orderIndex}`,
    prompt: "",
    type: exerciseType === "reading" ? "tfng" : "mcq",
    options:
      exerciseType === "reading"
        ? []
        : DEFAULT_MCQ_OPTIONS.map((opt) => ({ ...opt })),
    points: 1,
    correctAnswer: exerciseType === "reading" ? "TRUE" : "A",
    explanation: "",
  };
}

export interface ExerciseAuthoringFormProps {
  mode: "create" | "edit";
  initialExercise?: ExerciseAuthoringDetail;
}

export function ExerciseAuthoringForm({
  mode,
  initialExercise,
}: ExerciseAuthoringFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const uploadProgressId = useId();

  const isPublishedLocked = initialExercise?.status === "published";

  const [title, setTitle] = useState(() => initialExercise?.title ?? "");
  const [type, setType] = useState<ExerciseType>(() => initialExercise?.type ?? "reading");
  const [instructions, setInstructions] = useState(
    () => initialExercise?.instructions ?? (initialExercise as any)?.description ?? "",
  );
  const [durationMinutes, setDurationMinutes] = useState(() =>
    String(
      initialExercise?.durationMinutes ??
        ((initialExercise as any)?.audioAssets?.[0]?.durationSeconds
          ? Math.round((initialExercise as any).audioAssets[0].durationSeconds / 60)
          : 20),
    ),
  );
  const [passageHtml, setPassageHtml] = useState(
    () => (initialExercise as any)?.passage ?? initialExercise?.passageHtml ?? "",
  );
  const [audioAssetId, setAudioAssetId] = useState(
    () =>
      (initialExercise as any)?.audioAssets?.[0]?.objectKey ??
      initialExercise?.audioAssetId ??
      "",
  );
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    initialExercise?.questions.length
      ? initialExercise.questions.map((q: any, idx) => ({
          localId: q.id || q.questionId || `q-${idx + 1}`,
          prompt: q.prompt,
          type: normalizeBackendQuestionTypeToUi(q.type),
          options:
            q.options?.map((o: any) => ({
              id: o.key ?? o.id ?? o.label ?? "A",
              label: o.key ?? o.label ?? o.id ?? "A",
              text: o.text ?? "",
            })) ?? [],
          points: q.points ?? 1,
          correctAnswer:
            q.correctAnswer ??
            q.answerSpecification?.correctKey ??
            q.answerSpecification?.acceptedAnswers?.[0] ??
            "",
          explanation: q.explanation ?? "",
        }))
      : [createEmptyQuestion(1, "reading")],
  );

  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">(
    () => (initialExercise?.audioAssetId ? "done" : "idle"),
  );
  const [uploadProgress, setUploadProgress] = useState<number>(() =>
    initialExercise?.audioAssetId ? 100 : 0,
  );
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [fieldErrorSummary, setFieldErrorSummary] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const handleAudioSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isPublishedLocked) {
      return;
    }

    const validationError = validateAudioFile(file);
    if (validationError) {
      setUploadStatus("error");
      setUploadProgress(0);
      setUploadMessage(validationError);
      return;
    }

    setUploadStatus("uploading");
    setUploadProgress(5);
    setUploadMessage(`Đang tải tệp "${file.name}" lên kho lưu trữ riêng tư...`);

    try {
      const result = await uploadPrivateListeningAudio(file, (pct) => {
        setUploadProgress(pct);
      });
      setAudioAssetId(result.assetId);
      setUploadStatus("done");
      setUploadMessage(`Đã tải lên thành công (Mã audio: ${result.assetId}).`);
    } catch (err) {
      setUploadStatus("error");
      setUploadMessage(getFriendlyErrorMessage(err));
    }
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createEmptyQuestion(prev.length + 1, type)]);
  };

  const handleRemoveQuestion = (localId: string) => {
    setQuestions((prev) => prev.filter((q) => q.localId !== localId));
  };

  const updateQuestion = (localId: string, updater: (prev: DraftQuestion) => DraftQuestion) => {
    setQuestions((prev) => prev.map((q) => (q.localId === localId ? updater(q) : q)));
  };

  const buildValidatedPayload = (): CreateExerciseRequest | null => {
    const candidate = {
      title,
      type,
      instructions: instructions || undefined,
      passageHtml: type === "reading" ? passageHtml : undefined,
      audioAssetId: type === "listening" ? audioAssetId : undefined,
      durationMinutes: Number(durationMinutes),
      questions: questions.map((q) => ({
        prompt: q.prompt,
        type: q.type,
        options:
          q.type === "mcq" || q.type === "matching"
            ? q.options.filter((o) => o.text.trim() || o.label.trim())
            : undefined,
        points: Number(q.points) || 1,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation || undefined,
      })),
    };

    const parsed = ExerciseFormSchema.safeParse(candidate);
    if (!parsed.success) {
      setFieldErrorSummary(parsed.error.issues[0]?.message ?? "Dữ liệu bài tập chưa hợp lệ.");
      return null;
    }

    setFieldErrorSummary(null);

    const mappedQuestions = parsed.data.questions.map((q, idx) => {
      const backendType = normalizeUiQuestionTypeToBackend(q.type);

      let answerSpecification: {
        correctKey?: string;
        acceptedAnswers?: string[];
        caseSensitive?: boolean;
      };

      if (
        backendType === "multiple_choice" ||
        backendType === "true_false_not_given" ||
        backendType === "yes_no_not_given" ||
        backendType === "matching" ||
        backendType === "matching_headings" ||
        backendType === "matching_information"
      ) {
        answerSpecification = {
          correctKey: (q.correctAnswer || "A").trim(),
        };
      } else {
        const parts = q.correctAnswer
          ? q.correctAnswer
              .split(/[,;\n]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        answerSpecification = {
          acceptedAnswers: parts.length > 0 ? parts : [q.correctAnswer.trim()],
          caseSensitive: false,
        };
      }

      const hasOptions =
        backendType === "multiple_choice" ||
        backendType === "matching" ||
        backendType === "matching_headings" ||
        backendType === "matching_information";

      const options =
        hasOptions && q.options && q.options.length > 0
          ? q.options
              .filter((opt) => opt.text.trim() || opt.label.trim())
              .map((opt) => ({
                key: (opt.label || opt.id || "A").trim(),
                text: (opt.text || opt.label || "").trim(),
              }))
          : undefined;

      const qDto: any = {
        type: backendType,
        prompt: q.prompt.trim(),
        answerSpecification,
        points: q.points ?? 1,
      };

      const origLocalId = questions[idx]?.localId;
      if (origLocalId && !origLocalId.startsWith("draft-")) {
        qDto.questionId = origLocalId;
      }

      if (options && options.length > 0) {
        qDto.options = options;
      }
      if (q.explanation?.trim()) {
        qDto.explanation = q.explanation.trim();
      }

      return qDto;
    });

    const backendPayload: CreateExerciseRequest = {
      title: parsed.data.title.trim(),
      type: parsed.data.type,
      questions: mappedQuestions,
      passScore: 70,
      status: "draft",
    };

    if (parsed.data.instructions?.trim()) {
      backendPayload.description = parsed.data.instructions.trim();
    }
    if (parsed.data.type === "reading" && parsed.data.passageHtml?.trim()) {
      backendPayload.passage = parsed.data.passageHtml.trim();
    }
    if (parsed.data.type === "listening" && parsed.data.audioAssetId?.trim()) {
      backendPayload.audioAssets = [
        {
          objectKey: parsed.data.audioAssetId.trim(),
          durationSeconds: (parsed.data.durationMinutes || 20) * 60,
        },
      ];
    }

    return backendPayload;
  };

  const saveMutation = useMutation({
    mutationFn: async ({ publishAfterSave }: { publishAfterSave: boolean }) => {
      const payload = buildValidatedPayload();
      if (!payload) {
        throw new Error("VALIDATION_FAILED");
      }

      const saved =
        mode === "create" || !initialExercise
          ? await exercisesApi.create(payload)
          : await exercisesApi.update(initialExercise.id, payload);

      if (publishAfterSave) {
        return exercisesApi.publish(saved.id);
      }
      return saved;
    },
    onSuccess: async (saved, vars) => {
      await queryClient.invalidateQueries({ queryKey: teacherKeys.exercisesRoot });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.exerciseDetail(saved.id) });

      if (mode === "create") {
        router.push(`/teacher/exercises/${encodeURIComponent(saved.id)}/edit`);
        return;
      }

      setActionFeedback(
        vars.publishAfterSave
          ? "Đã xuất bản bài tập thành công."
          : "Đã lưu bản nháp bài tập.",
      );
      router.refresh();
    },
  });

  const versionMutation = useMutation({
    mutationFn: async () => {
      if (!initialExercise) {
        throw new Error("Missing exercise");
      }
      return exercisesApi.createVersion(initialExercise.id);
    },
    onSuccess: async (newDraft) => {
      await queryClient.invalidateQueries({ queryKey: teacherKeys.exercisesRoot });
      router.push(`/teacher/exercises/${encodeURIComponent(newDraft.id)}/edit`);
    },
  });

  const handleSaveDraftSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setActionFeedback(null);
    saveMutation.mutate({ publishAfterSave: false });
  };

  return (
    <form onSubmit={handleSaveDraftSubmit} noValidate className="space-y-6">
      {initialExercise ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={initialExercise.status} />
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
              Phiên bản v{initialExercise.version}
            </span>
            <span className="text-xs text-slate-600">
              Ngưỡng đạt mặc định: {initialExercise.passThreshold}%
            </span>
          </div>

          {isPublishedLocked ? (
            <button
              type="button"
              disabled={versionMutation.isPending}
              onClick={() => versionMutation.mutate()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
            >
              <GitBranch className="h-4 w-4" aria-hidden={true} />
              {versionMutation.isPending
                ? "Đang tạo phiên bản..."
                : `Tạo phiên bản nháp mới (v${initialExercise.version + 1})`}
            </button>
          ) : null}
        </div>
      ) : null}

      {isPublishedLocked ? (
        <div
          role="note"
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden={true} />
          <div>
            <p className="font-semibold">Đề đã xuất bản được khóa bảo toàn lịch sử chấm điểm</p>
            <p className="mt-1 text-xs text-amber-900">
              Để đảm bảo tính nhất quán cho các bài nộp của học viên, đề đã xuất bản không thể
              sửa trực tiếp nội dung câu hỏi hoặc đáp án. Nhấn &ldquo;Tạo phiên bản nháp
              mới&rdquo; để tạo bản sao v{initialExercise!.version + 1} ở trạng thái Nháp.
            </p>
          </div>
        </div>
      ) : null}

      {fieldErrorSummary ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{fieldErrorSummary}</span>
        </div>
      ) : null}

      {saveMutation.isError &&
      saveMutation.error instanceof Error &&
      saveMutation.error.message !== "VALIDATION_FAILED" ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{getFriendlyErrorMessage(saveMutation.error)}</span>
        </div>
      ) : null}

      {versionMutation.isError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{getFriendlyErrorMessage(versionMutation.error)}</span>
        </div>
      ) : null}

      {actionFeedback ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{actionFeedback}</span>
        </div>
      ) : null}

      <section className="lms-card space-y-4">
        <h2 className="text-lg font-semibold text-slate-950">1. Thông tin chung</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="ex-title" className="block text-sm font-medium text-slate-900">
              Tiêu đề bài tập <span className="text-red-700">*</span>
            </label>
            <input
              id="ex-title"
              type="text"
              readOnly={isPublishedLocked}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Reading Passage — Urban Microclimates"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 read-only:bg-slate-100"
            />
          </div>

          <div>
            <label htmlFor="ex-type" className="block text-sm font-medium text-slate-900">
              Kỹ năng <span className="text-red-700">*</span>
            </label>
            <select
              id="ex-type"
              disabled={isPublishedLocked || mode === "edit"}
              value={type}
              onChange={(e) => setType(e.target.value as ExerciseType)}
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 disabled:bg-slate-100"
            >
              <option value="reading">Reading</option>
              <option value="listening">Listening</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="ex-instructions" className="block text-sm font-medium text-slate-900">
              Hướng dẫn làm bài
            </label>
            <input
              id="ex-instructions"
              type="text"
              readOnly={isPublishedLocked}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Đọc kỹ đoạn văn và trả lời các câu hỏi..."
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 read-only:bg-slate-100"
            />
          </div>

          <div>
            <label htmlFor="ex-duration" className="block text-sm font-medium text-slate-900">
              Thời lượng gợi ý (phút)
            </label>
            <input
              id="ex-duration"
              type="number"
              min="1"
              max="180"
              readOnly={isPublishedLocked}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 tabular-nums read-only:bg-slate-100"
            />
          </div>
        </div>
      </section>

      {type === "reading" ? (
        <section className="lms-card space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">2. Nội dung bài đọc Reading</h2>
          <div>
            <label htmlFor="ex-passage" className="mb-2 block text-sm font-medium text-slate-900">
              Văn bản học thuật (Định dạng trực quan với TinyMCE) <span className="text-red-700">*</span>
            </label>
            <RichTextEditor
              id="ex-passage"
              disabled={isPublishedLocked}
              value={passageHtml}
              onChange={(val) => setPassageHtml(val)}
              placeholder="Nhập nội dung bài đọc Reading, định dạng in đậm Paragraph A, B, C, tiêu đề, bảng..."
              height={360}
            />
          </div>
        </section>
      ) : (
        <section className="lms-card space-y-4">
          <h2 className="text-lg font-semibold text-slate-950">
            2. Tệp âm thanh Listening riêng tư
          </h2>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label htmlFor="audio-upload" className="block text-sm font-medium text-slate-900">
              Chọn tệp âm thanh (MP3, WAV, M4A, OGG — tối đa 100 MB)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="audio-upload"
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-50"
              >
                <UploadCloud className="h-4 w-4" aria-hidden={true} />
                Chọn tệp âm thanh
              </label>
              <input
                id="audio-upload"
                type="file"
                disabled={isPublishedLocked || uploadStatus === "uploading"}
                accept="audio/mpeg,audio/mp3,audio/wav,audio/mp4,audio/ogg,.mp3,.wav,.m4a,.ogg"
                onChange={(e) => void handleAudioSelected(e)}
                className="sr-only"
              />
              {audioAssetId ? (
                <span className="text-xs font-medium text-slate-700">
                  Asset ID: <code className="rounded bg-slate-200 px-1.5 py-0.5">{audioAssetId}</code>
                </span>
              ) : null}
            </div>

            {uploadStatus !== "idle" ? (
              <div className="space-y-1.5">
                <label htmlFor={uploadProgressId} className="sr-only">
                  Tiến trình tải tệp âm thanh
                </label>
                <progress
                  id={uploadProgressId}
                  max={100}
                  value={uploadStatus === "uploading" ? uploadProgress : uploadProgress || 0}
                  className="lms-progress"
                />
                <p
                  role={uploadStatus === "error" ? "alert" : "status"}
                  aria-live="polite"
                  className={
                    uploadStatus === "error"
                      ? "text-xs font-medium text-red-700"
                      : "text-xs font-medium text-slate-700"
                  }
                >
                  {uploadMessage}
                </p>
              </div>
            ) : null}

            {audioAssetId ? (
              <div className="pt-2">
                <SignedAudioPlayer assetId={audioAssetId} title={title || "Audio nghe thử"} />
              </div>
            ) : null}
          </div>
        </section>
      )}

      <section className="lms-card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              3. Danh sách câu hỏi ({questions.length})
            </h2>
            <p className="text-xs text-slate-600">
              Đáp án đúng và giải thích chỉ hiển thị trong khu vực soạn thảo của giảng viên.
            </p>
          </div>
          {!isPublishedLocked ? (
            <button
              type="button"
              onClick={handleAddQuestion}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
            >
              <Plus className="h-4 w-4" aria-hidden={true} />
              Thêm câu hỏi
            </button>
          ) : null}
        </div>

        <div className="space-y-4">
          {questions.map((question, idx) => (
            <fieldset
              key={question.localId}
              disabled={isPublishedLocked}
              className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 disabled:opacity-90"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <legend className="text-sm font-bold text-slate-900">
                  Câu hỏi {idx + 1}
                </legend>
                {!isPublishedLocked && questions.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(question.localId)}
                    aria-label={`Xóa câu hỏi ${idx + 1}`}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
                    Xóa
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor={`q-type-${question.localId}`}
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Dạng câu hỏi
                  </label>
                  <select
                    id={`q-type-${question.localId}`}
                    value={question.type}
                    onChange={(e) => {
                      const nextType = e.target.value as QuestionType;
                      updateQuestion(question.localId, (prev) => ({
                        ...prev,
                        type: nextType,
                        options:
                          nextType === "mcq" || nextType === "matching"
                            ? prev.options.length > 0
                              ? prev.options
                              : DEFAULT_MCQ_OPTIONS.map((o) => ({ ...o }))
                            : [],
                        correctAnswer:
                          nextType === "tfng"
                            ? "TRUE"
                            : nextType === "ynng"
                              ? "YES"
                              : nextType === "mcq"
                                ? "A"
                                : prev.correctAnswer,
                      }));
                    }}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950"
                  >
                    {Object.entries(QUESTION_TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`q-answer-${question.localId}`}
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Đáp án đúng <span className="text-red-700">*</span>
                  </label>
                  {question.type === "tfng" ? (
                    <select
                      id={`q-answer-${question.localId}`}
                      value={question.correctAnswer}
                      onChange={(e) =>
                        updateQuestion(question.localId, (prev) => ({
                          ...prev,
                          correctAnswer: e.target.value,
                        }))
                      }
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950"
                    >
                      <option value="TRUE">TRUE</option>
                      <option value="FALSE">FALSE</option>
                      <option value="NOT GIVEN">NOT GIVEN</option>
                    </select>
                  ) : question.type === "ynng" ? (
                    <select
                      id={`q-answer-${question.localId}`}
                      value={question.correctAnswer}
                      onChange={(e) =>
                        updateQuestion(question.localId, (prev) => ({
                          ...prev,
                          correctAnswer: e.target.value,
                        }))
                      }
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950"
                    >
                      <option value="YES">YES</option>
                      <option value="NO">NO</option>
                      <option value="NOT GIVEN">NOT GIVEN</option>
                    </select>
                  ) : (
                    <input
                      id={`q-answer-${question.localId}`}
                      type="text"
                      value={question.correctAnswer}
                      onChange={(e) =>
                        updateQuestion(question.localId, (prev) => ({
                          ...prev,
                          correctAnswer: e.target.value,
                        }))
                      }
                      placeholder="VD: A hoặc carbon emissions"
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950"
                    />
                  )}
                </div>

                <div>
                  <label
                    htmlFor={`q-points-${question.localId}`}
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Điểm
                  </label>
                  <input
                    id={`q-points-${question.localId}`}
                    type="number"
                    min="1"
                    max="20"
                    value={question.points}
                    onChange={(e) =>
                      updateQuestion(question.localId, (prev) => ({
                        ...prev,
                        points: Number(e.target.value) || 1,
                      }))
                    }
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor={`q-prompt-${question.localId}`}
                  className="block text-xs font-semibold text-slate-700"
                >
                  Nội dung câu hỏi <span className="text-red-700">*</span>
                </label>
                <textarea
                  id={`q-prompt-${question.localId}`}
                  rows={2}
                  value={question.prompt}
                  onChange={(e) =>
                    updateQuestion(question.localId, (prev) => ({
                      ...prev,
                      prompt: e.target.value,
                    }))
                  }
                  placeholder="Nhập câu hỏi cho học viên..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-950"
                />
              </div>

              {question.type === "mcq" || question.type === "matching" ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700">Các lựa chọn</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {question.options.map((opt, optIdx) => (
                      <div key={opt.id} className="flex items-center gap-2">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-800">
                          {opt.label}
                        </span>
                        <input
                          type="text"
                          aria-label={`Lựa chọn ${opt.label} cho câu ${idx + 1}`}
                          value={opt.text}
                          onChange={(e) =>
                            updateQuestion(question.localId, (prev) => ({
                              ...prev,
                              options: prev.options.map((item, i) =>
                                i === optIdx ? { ...item, text: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder={`Nội dung đáp án ${opt.label}`}
                          className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label
                  htmlFor={`q-exp-${question.localId}`}
                  className="block text-xs font-semibold text-slate-700"
                >
                  Giải thích đáp án (mở khóa cho học viên khi đạt &gt;= 70%)
                </label>
                <input
                  id={`q-exp-${question.localId}`}
                  type="text"
                  value={question.explanation}
                  onChange={(e) =>
                    updateQuestion(question.localId, (prev) => ({
                      ...prev,
                      explanation: e.target.value,
                    }))
                  }
                  placeholder="Dẫn chứng từ bài đọc / băng nghe..."
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-950"
                />
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      {!isPublishedLocked ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            {saveMutation.isPending ? "Đang lưu..." : "Lưu bản nháp"}
          </button>

          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => {
              setActionFeedback(null);
              saveMutation.mutate({ publishAfterSave: true });
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden={true} />
            Xuất bản đề ngay
          </button>
        </div>
      ) : null}
    </form>
  );
}

