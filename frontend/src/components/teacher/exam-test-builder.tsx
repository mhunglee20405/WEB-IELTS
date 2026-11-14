"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CopyPlus,
  Eye,
  Headphones,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge, Button, Card, SafeHtml } from "@/components/ui";
import { teacherExamTestsApi } from "@/lib/api/endpoints/teacher-exam-tests";
import { mediaApi } from "@/lib/api/endpoints/media";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys } from "@/lib/api/query-keys";
import type {
  ExamAnswerValue,
  ExamDifficulty,
  ExamMode,
  ExamPartAuthoring,
  ExamQuestionAuthoring,
  ExamQuestionGroupAuthoring,
  ExamQuestionType,
  ExamSkill,
  ExamTestDetailAuthoring,
  UpsertExamPartInput,
  ValidateExamTestResponse,
} from "@/lib/api/types";
import {
  EXAM_QUESTION_TYPE_LABELS,
  MATCHING_QUESTION_TYPES,
} from "@/lib/exam/question-meta";

interface DraftQuestion {
  id?: string;
  prompt: string;
  questionType: ExamQuestionType;
  optionsText: string; // one per line: A|Option text
  maxWords: number;
  maxSelections: number;
  correctAnswerText: string; // comma separated if multiple
  acceptedAnswersText: string;
  referenceParagraph: string;
  explanation: string;
}

interface DraftGroup {
  id?: string;
  title: string;
  instructionHtml: string;
  questionType: ExamQuestionType;
  sharedOptionsText: string; // key|text per line
  maxWords: number;
  maxSelections: number;
  questions: DraftQuestion[];
}

interface DraftPart {
  id?: string;
  title: string;
  passageTitle: string;
  passageHtml: string;
  instructions: string;
  durationMinutes: number;
  audioAssetId: string;
  audioAllowPause: boolean;
  audioAllowSeek: boolean;
  audioMaxPlayCount: string;
  transcript: string;
  groups: DraftGroup[];
}

function formatOptionsToText(options?: Array<{ key: string; text: string }>): string {
  if (!options || options.length === 0) return "";
  return options.map((o) => `${o.key}|${o.text}`).join("\n");
}

function parseOptionsFromText(raw: string): Array<{ key: string; text: string }> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const sepIdx = line.indexOf("|");
      if (sepIdx === -1) {
        const defaultKey = String.fromCharCode(65 + idx);
        return { key: defaultKey, text: line };
      }
      return {
        key: line.slice(0, sepIdx).trim() || String.fromCharCode(65 + idx),
        text: line.slice(sepIdx + 1).trim(),
      };
    });
}

function toDraftPart(part: ExamPartAuthoring): DraftPart {
  return {
    id: part.id,
    title: part.title,
    passageTitle: part.passageTitle ?? part.title,
    passageHtml:
      part.passageHtml ??
      (part.paragraphs
        ? part.paragraphs.map((p) => `<p><strong>Paragraph ${p.label}.</strong> ${p.text}</p>`).join("")
        : ""),
    instructions: part.instructions ?? "",
    durationMinutes: Math.max(1, Math.round((part.durationSeconds ?? 1200) / 60)),
    audioAssetId: part.audioAsset?.assetId ?? "",
    audioAllowPause: part.audioAsset?.allowPause ?? true,
    audioAllowSeek: part.audioAsset?.allowSeek ?? true,
    audioMaxPlayCount:
      part.audioAsset?.maxPlayCount !== null && part.audioAsset?.maxPlayCount !== undefined
        ? String(part.audioAsset.maxPlayCount)
        : "",
    transcript: part.transcript ?? "",
    groups: part.questionGroups.map((g: ExamQuestionGroupAuthoring) => ({
      id: g.id,
      title: g.title ?? "",
      instructionHtml: g.instructionHtml,
      questionType: g.questionType,
      sharedOptionsText: formatOptionsToText(g.sharedOptions),
      maxWords: g.maxWords ?? 2,
      maxSelections: g.maxSelections ?? 2,
      questions: g.questions.map((q: ExamQuestionAuthoring) => ({
        id: q.id,
        prompt: q.prompt,
        questionType: q.questionType,
        optionsText: formatOptionsToText(q.options),
        maxWords: q.maxWords ?? g.maxWords ?? 2,
        maxSelections: q.maxSelections ?? g.maxSelections ?? 2,
        correctAnswerText: Array.isArray(q.correctAnswer)
          ? q.correctAnswer.join(", ")
          : (q.correctAnswer ?? ""),
        acceptedAnswersText: (q.acceptedAnswers ?? []).join(", "),
        referenceParagraph: q.referenceParagraph ?? "",
        explanation: q.explanation ?? "",
      })),
    })),
  };
}

function createEmptyQuestion(questionType: ExamQuestionType): DraftQuestion {
  return {
    prompt: "",
    questionType,
    optionsText:
      questionType === "MULTIPLE_CHOICE_SINGLE" ||
      questionType === "MULTIPLE_CHOICE_MULTIPLE"
        ? "A|Option A\nB|Option B\nC|Option C\nD|Option D"
        : "",
    maxWords: 2,
    maxSelections: 2,
    correctAnswerText:
      questionType === "TRUE_FALSE_NOT_GIVEN"
        ? "TRUE"
        : questionType === "YES_NO_NOT_GIVEN"
          ? "YES"
          : questionType === "MULTIPLE_CHOICE_MULTIPLE"
            ? "A, B"
            : "A",
    acceptedAnswersText: "",
    referenceParagraph: "",
    explanation: "",
  };
}

function createEmptyDraftPart(skill: ExamSkill, partIndex: number): DraftPart {
  return {
    title: `${skill === "READING" ? "Passage" : "Section"} ${partIndex + 1}`,
    passageTitle: "",
    passageHtml:
      skill === "READING"
        ? "<p><strong>Paragraph A.</strong> Nhập nội dung đoạn văn tiếng Anh học thuật tại đây...</p>"
        : "",
    instructions: "",
    durationMinutes: skill === "READING" ? 20 : 10,
    audioAssetId: "",
    audioAllowPause: true,
    audioAllowSeek: true,
    audioMaxPlayCount: "",
    transcript: "",
    groups: [
      {
        title: `Questions 1–2`,
        instructionHtml: "<p>Answer the questions below.</p>",
        questionType:
          skill === "READING" ? "TRUE_FALSE_NOT_GIVEN" : "NOTE_COMPLETION",
        sharedOptionsText: "",
        maxWords: 2,
        maxSelections: 2,
        questions: [
          createEmptyQuestion(
            skill === "READING" ? "TRUE_FALSE_NOT_GIVEN" : "NOTE_COMPLETION",
          ),
        ],
      },
    ],
  };
}

export function ExamTestBuilder({
  initialTest,
}: {
  initialTest?: ExamTestDetailAuthoring;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEditingExisting = Boolean(initialTest);
  const isPublishedLocked = initialTest?.status === "PUBLISHED";

  const [title, setTitle] = useState(initialTest?.title ?? "");
  const [subtitle, setSubtitle] = useState(initialTest?.subtitle ?? "");
  const [skill, setSkill] = useState<ExamSkill>(initialTest?.skill ?? "READING");
  const [difficulty, setDifficulty] = useState<string>(
    initialTest?.difficulty ?? "TARGET_65",
  );
  const [tagsText, setTagsText] = useState((initialTest?.tags ?? []).join(", "));
  const [durationMinutes, setDurationMinutes] = useState(
    Math.max(1, Math.round((initialTest?.totalDurationSeconds ?? 1200) / 60)),
  );
  const [allowPartMode, setAllowPartMode] = useState(
    initialTest?.allowedModes.includes("PART") ?? true,
  );
  const [allowFullMode, setAllowFullMode] = useState(
    initialTest?.allowedModes.includes("FULL") ?? false,
  );
  const [instructions, setInstructions] = useState(initialTest?.instructions ?? "");
  const [parts, setParts] = useState<DraftPart[]>(() =>
    initialTest && initialTest.parts.length > 0
      ? initialTest.parts.map(toDraftPart)
      : [createEmptyDraftPart(initialTest?.skill ?? "READING", 0)],
  );

  const [dirty, setDirty] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<Record<number, number>>({});
  const [previewAudioUrl, setPreviewAudioUrl] = useState<Record<number, string>>({});
  const [showPassagePreview, setShowPassagePreview] = useState<Record<number, boolean>>({});
  const [validationResult, setValidationResult] = useState<ValidateExamTestResponse | null>(
    null,
  );
  const [statusBanner, setStatusBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty && !isPublishedLocked) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, isPublishedLocked]);

  const markDirty = () => {
    setDirty(true);
    setStatusBanner(null);
  };

  const buildPartInput = (part: DraftPart, partIndex: number): UpsertExamPartInput => {
    let runningQ = 1;
    for (let i = 0; i < partIndex; i++) {
      runningQ += parts[i]!.groups.reduce((s, g) => s + g.questions.length, 0);
    }

    return {
      partNumber: partIndex + 1,
      partType: skill === "READING" ? "PASSAGE" : "SECTION",
      title: part.title.trim() || `${skill === "READING" ? "Passage" : "Section"} ${partIndex + 1}`,
      instructions: part.instructions.trim() || undefined,
      passageTitle:
        skill === "READING" ? part.passageTitle.trim() || part.title.trim() : undefined,
      passageHtml: skill === "READING" ? part.passageHtml : undefined,
      audioAsset:
        skill === "LISTENING" && part.audioAssetId.trim()
          ? {
              assetId: part.audioAssetId.trim(),
              durationSeconds: part.durationMinutes * 60,
              allowPause: part.audioAllowPause,
              allowSeek: part.audioAllowSeek,
              maxPlayCount: part.audioMaxPlayCount.trim()
                ? Number(part.audioMaxPlayCount)
                : null,
            }
          : undefined,
      durationSeconds: part.durationMinutes * 60,
      transcript: skill === "LISTENING" ? part.transcript.trim() || undefined : undefined,
      questionGroups: part.groups.map((g, gIdx) => ({
        id: g.id,
        groupNumber: gIdx + 1,
        title: g.title.trim() || undefined,
        instructionHtml: g.instructionHtml || "<p>Answer the questions below.</p>",
        questionType: g.questionType,
        sharedOptions: MATCHING_QUESTION_TYPES.has(g.questionType)
          ? parseOptionsFromText(g.sharedOptionsText)
          : undefined,
        maxWords: g.maxWords,
        maxSelections: g.maxSelections,
        questions: g.questions.map((q) => {
          const qNum = runningQ++;
          let correctAnswer: ExamAnswerValue = q.correctAnswerText.trim();
          if (q.questionType === "MULTIPLE_CHOICE_MULTIPLE") {
            correctAnswer = q.correctAnswerText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
          const acceptedAnswers = q.acceptedAnswersText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          return {
            id: q.id,
            questionNumber: qNum,
            prompt: q.prompt.trim(),
            questionType: q.questionType,
            options:
              q.optionsText.trim().length > 0
                ? parseOptionsFromText(q.optionsText)
                : undefined,
            maxWords: q.maxWords,
            maxSelections: q.maxSelections,
            correctAnswer,
            acceptedAnswers: acceptedAnswers.length > 0 ? acceptedAnswers : undefined,
            referenceParagraph: q.referenceParagraph.trim() || undefined,
            explanation: q.explanation.trim() || undefined,
          };
        }),
      })),
    };
  };

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 3) {
        throw new Error("Tiêu đề đề thi phải có tối thiểu 3 ký tự.");
      }
      const allowedModes: ExamMode[] = [];
      if (allowPartMode) allowedModes.push("PART");
      if (allowFullMode) allowedModes.push("FULL");
      if (allowedModes.length === 0) {
        allowedModes.push("PART");
      }
      const parsedTags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let testId = initialTest?.id;
      if (!testId) {
        const created = await teacherExamTestsApi.create({
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          skill,
          difficulty: difficulty as ExamDifficulty,
          tags: parsedTags,
          totalDurationSeconds: durationMinutes * 60,
          allowedModes,
          instructions: instructions.trim() || undefined,
        });
        testId = created.id;
      } else {
        await teacherExamTestsApi.update(testId, {
          title: title.trim(),
          subtitle: subtitle.trim() || undefined,
          difficulty,
          tags: parsedTags,
          totalDurationSeconds: durationMinutes * 60,
          allowedModes,
          instructions: instructions.trim() || undefined,
        });
        // Replace parts cleanly in mock/BE by deleting removed parts & re-syncing parts
        for (const existingPart of initialTest?.parts ?? []) {
          await teacherExamTestsApi.deletePart(testId, existingPart.id).catch(() => null);
        }
      }

      for (let i = 0; i < parts.length; i++) {
        await teacherExamTestsApi.createPart(testId, buildPartInput(parts[i]!, i));
      }

      return teacherExamTestsApi.getById(testId);
    },
    onSuccess: (saved) => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: examKeys.teacherBankRoot });
      queryClient.setQueryData(examKeys.teacherTestDetail(saved.id), saved);
      setStatusBanner({
        type: "success",
        text: "Đã lưu bản nháp đề thi thành công.",
      });
      if (!isEditingExisting) {
        router.replace(`/teacher/question-bank/${encodeURIComponent(saved.id)}/edit`);
      }
    },
    onError: (err) => {
      setStatusBanner({
        type: "error",
        text: err instanceof Error ? err.message : getFriendlyErrorMessage(err),
      });
    },
  });

  const validateAndPublishMutation = useMutation({
    mutationFn: async (alsoPublish: boolean) => {
      const saved = await saveDraftMutation.mutateAsync();
      const validation = await teacherExamTestsApi.validate(saved.id);
      setValidationResult(validation);
      if (!validation.valid) {
        return { saved, validation, published: false };
      }
      if (alsoPublish) {
        const pub = await teacherExamTestsApi.publish(saved.id);
        return { saved: pub, validation, published: true };
      }
      return { saved, validation, published: false };
    },
    onSuccess: ({ saved, validation, published }) => {
      void queryClient.invalidateQueries({ queryKey: examKeys.teacherBankRoot });
      queryClient.setQueryData(examKeys.teacherTestDetail(saved.id), saved);
      if (!validation.valid) {
        setStatusBanner({
          type: "error",
          text: `Phát hiện ${validation.errors.length} lỗi cần hoàn thiện.`,
        });
        return;
      }
      setStatusBanner({
        type: "success",
        text: published
          ? "Đã xuất bản đề thi thành công! Học viên có thể làm bài ngay."
          : "Kiểm tra hợp lệ thành công — sẵn sàng xuất bản.",
      });
      if (published) {
        router.refresh();
      }
    },
  });

  const newVersionMutation = useMutation({
    mutationFn: () => teacherExamTestsApi.newVersion(initialTest!.id),
    onSuccess: (cloned) => {
      void queryClient.invalidateQueries({ queryKey: examKeys.teacherBankRoot });
      router.push(`/teacher/question-bank/${encodeURIComponent(cloned.id)}/edit`);
    },
  });

  const handleAudioFileChange = async (partIdx: number, file: File | undefined) => {
    if (!file || isPublishedLocked) return;
    try {
      setStatusBanner(null);
      const uploaded = await teacherExamTestsApi.uploadListeningAudio(file, {
        onProgress: (pct) => setUploadPercent((prev) => ({ ...prev, [partIdx]: pct })),
      });
      setParts((prev) =>
        prev.map((p, i) => (i === partIdx ? { ...p, audioAssetId: uploaded.assetId } : p)),
      );
      markDirty();
      const playback = await mediaApi.getAudioPlayback(uploaded.assetId).catch(() => null);
      if (playback?.streamUrl) {
        setPreviewAudioUrl((prev) => ({ ...prev, [partIdx]: playback.streamUrl }));
      }
    } catch (err) {
      setStatusBanner({ type: "error", text: getFriendlyErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/teacher/question-bank"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại Kho đề thi
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {dirty && !isPublishedLocked && (
            <Badge variant="warning">Chưa lưu thay đổi</Badge>
          )}
          {initialTest && (
            <>
              <Badge variant={initialTest.status === "PUBLISHED" ? "success" : "warning"}>
                {initialTest.status} · v{initialTest.version}
              </Badge>
              <Link
                href={`/teacher/question-bank/${encodeURIComponent(initialTest.id)}/preview`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                <Eye className="h-3.5 w-3.5" />
                Xem trước
              </Link>
            </>
          )}
        </div>
      </div>

      {isPublishedLocked && (
        <Card className="border-amber-300 bg-amber-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-amber-950">
                Đề thi này đã được xuất bản (Trạng thái bất biến)
              </p>
              <p className="mt-0.5 text-xs text-amber-900">
                Để không làm sai lệch bài làm của học viên cũ, không thể sửa trực tiếp phiên bản đã xuất bản. Hãy tạo phiên bản v{(initialTest?.version ?? 1) + 1}.
              </p>
            </div>
            <Button
              variant="primary"
              loading={newVersionMutation.isPending}
              onClick={() => newVersionMutation.mutate()}
            >
              <CopyPlus className="h-4 w-4" />
              Tạo phiên bản nháp v{(initialTest?.version ?? 1) + 1}
            </Button>
          </div>
        </Card>
      )}

      {statusBanner && (
        <div
          role="status"
          aria-live="polite"
          className={
            statusBanner.type === "success"
              ? "flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
              : "flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900"
          }
        >
          {statusBanner.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{statusBanner.text}</span>
        </div>
      )}

      {validationResult && validationResult.errors.length > 0 && (
        <Card className="border-rose-200 bg-rose-50/40">
          <h2 className="text-sm font-bold text-rose-900">
            Chi tiết lỗi kiểm tra đề thi ({validationResult.errors.length})
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-800">
            {validationResult.errors.map((err, idx) => (
              <li key={idx}>{err.message}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Test Metadata */}
      <Card className="space-y-4">
        <h2 className="text-base font-bold text-slate-900">1. Thông tin chung đề thi</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-title-input">
              Tiêu đề đề thi *
            </label>
            <input
              id="exam-title-input"
              disabled={isPublishedLocked}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              placeholder="Ví dụ: IELTS Reading Practice — Marine Biology"
              className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-subtitle-input">
              Mô tả ngắn
            </label>
            <input
              id="exam-subtitle-input"
              disabled={isPublishedLocked}
              value={subtitle}
              onChange={(e) => {
                setSubtitle(e.target.value);
                markDirty();
              }}
              placeholder="Ghi chú phạm vi hoặc kỹ năng trọng tâm..."
              className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-skill-select">
              Kỹ năng IELTS
            </label>
            <select
              id="exam-skill-select"
              disabled={isPublishedLocked || isEditingExisting}
              value={skill}
              onChange={(e) => {
                const nextSkill = e.target.value as ExamSkill;
                setSkill(nextSkill);
                setParts([createEmptyDraftPart(nextSkill, 0)]);
                markDirty();
              }}
              className="lms-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="READING">IELTS Reading (Passage)</option>
              <option value="LISTENING">IELTS Listening (Section + Audio)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-diff-select">
                Độ khó
              </label>
              <select
                id="exam-diff-select"
                disabled={isPublishedLocked}
                value={difficulty}
                onChange={(e) => {
                  setDifficulty(e.target.value);
                  markDirty();
                }}
                className="lms-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="FOUNDATION">Nền tảng</option>
                <option value="INTERMEDIATE">Trung cấp</option>
                <option value="TARGET_65">Target 6.5</option>
                <option value="TARGET_75_PLUS">Target 7.5+</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-dur-input">
                Tổng thời gian (phút)
              </label>
              <input
                id="exam-dur-input"
                type="number"
                min={1}
                max={180}
                disabled={isPublishedLocked}
                value={durationMinutes}
                onChange={(e) => {
                  setDurationMinutes(Number(e.target.value) || 20);
                  markDirty();
                }}
                className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-tags-input">
              Tags (cách nhau dấu phẩy)
            </label>
            <input
              id="exam-tags-input"
              disabled={isPublishedLocked}
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                markDirty();
              }}
              placeholder="Academic, Environment, True/False"
              className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-700">
              Chế độ thi cho phép
            </span>
            <div className="flex flex-wrap gap-4 pt-1.5 text-sm">
              <label className="inline-flex min-h-10 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={isPublishedLocked}
                  checked={allowPartMode}
                  onChange={(e) => {
                    setAllowPartMode(e.target.checked);
                    markDirty();
                  }}
                />
                Cho phép Part Practice
              </label>
              <label className="inline-flex min-h-10 items-center gap-2">
                <input
                  type="checkbox"
                  disabled={isPublishedLocked}
                  checked={allowFullMode}
                  onChange={(e) => {
                    setAllowFullMode(e.target.checked);
                    markDirty();
                  }}
                />
                Cho phép Full Test
              </label>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-inst-input">
            Hướng dẫn làm bài cho học viên
          </label>
          <textarea
            id="exam-inst-input"
            rows={2}
            disabled={isPublishedLocked}
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value);
              markDirty();
            }}
            className="lms-input w-full rounded-lg border border-slate-300 p-2.5 text-sm"
          />
        </div>
      </Card>

      {/* Parts (Reading Passages / Listening Sections) */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            2. Danh sách {skill === "READING" ? "Passage" : "Section"} ({parts.length})
          </h2>
          {!isPublishedLocked && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setParts((prev) => [...prev, createEmptyDraftPart(skill, prev.length)]);
                markDirty();
              }}
            >
              <Plus className="h-4 w-4" />
              Thêm {skill === "READING" ? "Passage" : "Section"}
            </Button>
          )}
        </div>

        {parts.map((part, partIdx) => (
          <Card key={partIdx} className="space-y-4 border-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-blue-800 uppercase">
                {skill === "READING" ? `Passage ${partIdx + 1}` : `Section ${partIdx + 1}`}
              </h3>
              {!isPublishedLocked && parts.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setParts((prev) => prev.filter((_, i) => i !== partIdx));
                    markDirty();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                  Xóa phần này
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Tên phần thi
                </label>
                <input
                  disabled={isPublishedLocked}
                  value={part.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setParts((prev) =>
                      prev.map((item, i) => (i === partIdx ? { ...item, title: v } : item)),
                    );
                    markDirty();
                  }}
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Thời lượng riêng (phút)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  disabled={isPublishedLocked}
                  value={part.durationMinutes}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 20;
                    setParts((prev) =>
                      prev.map((item, i) =>
                        i === partIdx ? { ...item, durationMinutes: v } : item,
                      ),
                    );
                    markDirty();
                  }}
                  className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {skill === "READING" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Nội dung bài đọc (HTML chuẩn / Paragraph)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassagePreview((prev) => ({
                        ...prev,
                        [partIdx]: !prev[partIdx],
                      }))
                    }
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    {showPassagePreview[partIdx] ? "Quay lại chỉnh sửa" : "Xem trước an toàn"}
                  </button>
                </div>
                {showPassagePreview[partIdx] ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                    <SafeHtml html={part.passageHtml} preset="richText" />
                  </div>
                ) : (
                  <textarea
                    rows={6}
                    disabled={isPublishedLocked}
                    value={part.passageHtml}
                    onChange={(e) => {
                      const v = e.target.value;
                      setParts((prev) =>
                        prev.map((item, i) =>
                          i === partIdx ? { ...item, passageHtml: v } : item,
                        ),
                      );
                      markDirty();
                    }}
                    className="lms-input w-full rounded-lg border border-slate-300 p-3 font-mono text-xs"
                  />
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Headphones className="h-4 w-4 text-blue-700" />
                    Tệp âm thanh Section {partIdx + 1} (Bắt buộc)
                  </div>
                  {part.audioAssetId && (
                    <Badge variant="success">Asset: {part.audioAssetId}</Badge>
                  )}
                </div>

                {!isPublishedLocked && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                      <Upload className="h-3.5 w-3.5" />
                      Tải tệp audio (MP3/WAV/M4A)
                      <input
                        type="file"
                        accept="audio/*"
                        className="sr-only"
                        onChange={(e) =>
                          void handleAudioFileChange(partIdx, e.target.files?.[0])
                        }
                      />
                    </label>
                    <input
                      value={part.audioAssetId}
                      placeholder="Hoặc nhập audioAssetId có sẵn"
                      onChange={(e) => {
                        const v = e.target.value;
                        setParts((prev) =>
                          prev.map((item, i) =>
                            i === partIdx ? { ...item, audioAssetId: v } : item,
                          ),
                        );
                        markDirty();
                      }}
                      className="lms-input flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                )}

                {uploadPercent[partIdx] !== undefined && uploadPercent[partIdx]! < 100 && (
                  <progress
                    className="lms-progress h-2 w-full"
                    value={uploadPercent[partIdx]}
                    max={100}
                  />
                )}

                {previewAudioUrl[partIdx] && (
                  <audio controls src={previewAudioUrl[partIdx]} className="w-full" />
                )}

                <div className="grid gap-3 sm:grid-cols-3 text-xs">
                  <label className="inline-flex min-h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={isPublishedLocked}
                      checked={part.audioAllowPause}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setParts((prev) =>
                          prev.map((item, i) =>
                            i === partIdx ? { ...item, audioAllowPause: checked } : item,
                          ),
                        );
                        markDirty();
                      }}
                    />
                    Cho phép tạm dừng
                  </label>
                  <label className="inline-flex min-h-9 items-center gap-2">
                    <input
                      type="checkbox"
                      disabled={isPublishedLocked}
                      checked={part.audioAllowSeek}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setParts((prev) =>
                          prev.map((item, i) =>
                            i === partIdx ? { ...item, audioAllowSeek: checked } : item,
                          ),
                        );
                        markDirty();
                      }}
                    />
                    Cho phép tua thanh tiến độ
                  </label>
                  <input
                    type="number"
                    min={1}
                    disabled={isPublishedLocked}
                    placeholder="Giới hạn lượt nghe (để trống = không giới hạn)"
                    value={part.audioMaxPlayCount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setParts((prev) =>
                        prev.map((item, i) =>
                          i === partIdx ? { ...item, audioMaxPlayCount: v } : item,
                        ),
                      );
                      markDirty();
                    }}
                    className="lms-input rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Transcript (Chỉ giảng viên xem — ẩn hoàn toàn với học viên khi thi)
                  </label>
                  <textarea
                    rows={3}
                    disabled={isPublishedLocked}
                    value={part.transcript}
                    onChange={(e) => {
                      const v = e.target.value;
                      setParts((prev) =>
                        prev.map((item, i) =>
                          i === partIdx ? { ...item, transcript: v } : item,
                        ),
                      );
                      markDirty();
                    }}
                    className="lms-input w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs"
                  />
                </div>
              </div>
            )}

            {/* Question Groups Editor */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                  Nhóm câu hỏi ({part.groups.length})
                </h4>
                {!isPublishedLocked && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const qType: ExamQuestionType =
                        skill === "READING" ? "SENTENCE_COMPLETION" : "NOTE_COMPLETION";
                      setParts((prev) =>
                        prev.map((p, i) =>
                          i === partIdx
                            ? {
                                ...p,
                                groups: [
                                  ...p.groups,
                                  {
                                    title: `Nhóm câu ${p.groups.length + 1}`,
                                    instructionHtml: "<p>Complete the items below.</p>",
                                    questionType: qType,
                                    sharedOptionsText: "",
                                    maxWords: 2,
                                    maxSelections: 2,
                                    questions: [createEmptyQuestion(qType)],
                                  },
                                ],
                              }
                            : p,
                        ),
                      );
                      markDirty();
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm nhóm câu hỏi
                  </Button>
                )}
              </div>

              {part.groups.map((group, groupIdx) => (
                <div
                  key={groupIdx}
                  className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Tiêu đề nhóm
                      </label>
                      <input
                        disabled={isPublishedLocked}
                        value={group.title}
                        onChange={(e) => {
                          const v = e.target.value;
                          setParts((prev) =>
                            prev.map((p, pi) =>
                              pi === partIdx
                                ? {
                                    ...p,
                                    groups: p.groups.map((g, gi) =>
                                      gi === groupIdx ? { ...g, title: v } : g,
                                    ),
                                  }
                                : p,
                            ),
                          );
                          markDirty();
                        }}
                        className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Dạng câu hỏi mặc định
                      </label>
                      <select
                        disabled={isPublishedLocked}
                        value={group.questionType}
                        onChange={(e) => {
                          const nextType = e.target.value as ExamQuestionType;
                          setParts((prev) =>
                            prev.map((p, pi) =>
                              pi === partIdx
                                ? {
                                    ...p,
                                    groups: p.groups.map((g, gi) =>
                                      gi === groupIdx
                                        ? {
                                            ...g,
                                            questionType: nextType,
                                            questions: g.questions.map((q) => ({
                                              ...q,
                                              questionType: nextType,
                                            })),
                                          }
                                        : g,
                                    ),
                                  }
                                : p,
                            ),
                          );
                          markDirty();
                        }}
                        className="lms-input w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                      >
                        {(
                          Object.entries(EXAM_QUESTION_TYPE_LABELS) as Array<
                            [ExamQuestionType, string]
                          >
                        ).map(([val, label]) => (
                          <option key={val} value={val}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end justify-end">
                      {!isPublishedLocked && part.groups.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setParts((prev) =>
                              prev.map((p, pi) =>
                                pi === partIdx
                                  ? {
                                      ...p,
                                      groups: p.groups.filter((_, gi) => gi !== groupIdx),
                                    }
                                  : p,
                              ),
                            );
                            markDirty();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          Xóa nhóm
                        </Button>
                      )}
                    </div>
                  </div>

                  {MATCHING_QUESTION_TYPES.has(group.questionType) && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Bảng lựa chọn chung (mỗi dòng `key|nội dung`, ví dụ `i|Heading 1`)
                      </label>
                      <textarea
                        rows={3}
                        disabled={isPublishedLocked}
                        value={group.sharedOptionsText}
                        onChange={(e) => {
                          const v = e.target.value;
                          setParts((prev) =>
                            prev.map((p, pi) =>
                              pi === partIdx
                                ? {
                                    ...p,
                                    groups: p.groups.map((g, gi) =>
                                      gi === groupIdx ? { ...g, sharedOptionsText: v } : g,
                                    ),
                                  }
                                : p,
                            ),
                          );
                          markDirty();
                        }}
                        className="lms-input w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs"
                      />
                    </div>
                  )}

                  {/* Individual Questions inside Group */}
                  <div className="space-y-3">
                    {group.questions.map((q, qIdx) => (
                      <div
                        key={qIdx}
                        className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700">
                            Câu #{qIdx + 1} · {EXAM_QUESTION_TYPE_LABELS[q.questionType]}
                          </span>
                          {!isPublishedLocked && group.questions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setParts((prev) =>
                                  prev.map((p, pi) =>
                                    pi === partIdx
                                      ? {
                                          ...p,
                                          groups: p.groups.map((g, gi) =>
                                            gi === groupIdx
                                              ? {
                                                  ...g,
                                                  questions: g.questions.filter(
                                                    (_, qi) => qi !== qIdx,
                                                  ),
                                                }
                                              : g,
                                          ),
                                        }
                                      : p,
                                  ),
                                );
                                markDirty();
                              }}
                              className="text-xs font-medium text-rose-600 hover:underline"
                            >
                              Xóa câu
                            </button>
                          )}
                        </div>

                        <input
                          disabled={isPublishedLocked}
                          placeholder="Nội dung câu hỏi..."
                          value={q.prompt}
                          onChange={(e) => {
                            const v = e.target.value;
                            setParts((prev) =>
                              prev.map((p, pi) =>
                                pi === partIdx
                                  ? {
                                      ...p,
                                      groups: p.groups.map((g, gi) =>
                                        gi === groupIdx
                                          ? {
                                              ...g,
                                              questions: g.questions.map((qq, qi) =>
                                                qi === qIdx ? { ...qq, prompt: v } : qq,
                                              ),
                                            }
                                          : g,
                                      ),
                                    }
                                  : p,
                              ),
                            );
                            markDirty();
                          }}
                          className="lms-input w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                        />

                        {(q.questionType === "MULTIPLE_CHOICE_SINGLE" ||
                          q.questionType === "MULTIPLE_CHOICE_MULTIPLE" ||
                          q.questionType === "MATCHING_FEATURES" ||
                          q.questionType === "MATCHING_SENTENCE_ENDINGS") && (
                          <textarea
                            rows={2}
                            disabled={isPublishedLocked}
                            placeholder="Các lựa chọn (mỗi dòng A|Nội dung)"
                            value={q.optionsText}
                            onChange={(e) => {
                              const v = e.target.value;
                              setParts((prev) =>
                                prev.map((p, pi) =>
                                  pi === partIdx
                                    ? {
                                        ...p,
                                        groups: p.groups.map((g, gi) =>
                                          gi === groupIdx
                                            ? {
                                                ...g,
                                                questions: g.questions.map((qq, qi) =>
                                                  qi === qIdx ? { ...qq, optionsText: v } : qq,
                                                ),
                                              }
                                            : g,
                                        ),
                                      }
                                    : p,
                                ),
                              );
                              markDirty();
                            }}
                            className="lms-input w-full rounded-lg border border-slate-300 p-2 font-mono text-xs"
                          />
                        )}

                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            disabled={isPublishedLocked}
                            placeholder="Đáp án đúng (vd: TRUE hoặc A, D)"
                            value={q.correctAnswerText}
                            onChange={(e) => {
                              const v = e.target.value;
                              setParts((prev) =>
                                prev.map((p, pi) =>
                                  pi === partIdx
                                    ? {
                                        ...p,
                                        groups: p.groups.map((g, gi) =>
                                          gi === groupIdx
                                            ? {
                                                ...g,
                                                questions: g.questions.map((qq, qi) =>
                                                  qi === qIdx
                                                    ? { ...qq, correctAnswerText: v }
                                                    : qq,
                                                ),
                                              }
                                            : g,
                                        ),
                                      }
                                    : p,
                                ),
                              );
                              markDirty();
                            }}
                            className="lms-input rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                          <input
                            disabled={isPublishedLocked}
                            placeholder="Biến thể chấp nhận (cách dấu phẩy)"
                            value={q.acceptedAnswersText}
                            onChange={(e) => {
                              const v = e.target.value;
                              setParts((prev) =>
                                prev.map((p, pi) =>
                                  pi === partIdx
                                    ? {
                                        ...p,
                                        groups: p.groups.map((g, gi) =>
                                          gi === groupIdx
                                            ? {
                                                ...g,
                                                questions: g.questions.map((qq, qi) =>
                                                  qi === qIdx
                                                    ? { ...qq, acceptedAnswersText: v }
                                                    : qq,
                                                ),
                                              }
                                            : g,
                                        ),
                                      }
                                    : p,
                                ),
                              );
                              markDirty();
                            }}
                            className="lms-input rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                          <input
                            disabled={isPublishedLocked}
                            placeholder="Giải thích / Tham chiếu đoạn"
                            value={q.explanation}
                            onChange={(e) => {
                              const v = e.target.value;
                              setParts((prev) =>
                                prev.map((p, pi) =>
                                  pi === partIdx
                                    ? {
                                        ...p,
                                        groups: p.groups.map((g, gi) =>
                                          gi === groupIdx
                                            ? {
                                                ...g,
                                                questions: g.questions.map((qq, qi) =>
                                                  qi === qIdx ? { ...qq, explanation: v } : qq,
                                                ),
                                              }
                                            : g,
                                        ),
                                      }
                                    : p,
                                ),
                              );
                              markDirty();
                            }}
                            className="lms-input rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                    ))}

                    {!isPublishedLocked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setParts((prev) =>
                            prev.map((p, pi) =>
                              pi === partIdx
                                ? {
                                    ...p,
                                    groups: p.groups.map((g, gi) =>
                                      gi === groupIdx
                                        ? {
                                            ...g,
                                            questions: [
                                              ...g.questions,
                                              createEmptyQuestion(g.questionType),
                                            ],
                                          }
                                        : g,
                                    ),
                                  }
                                : p,
                            ),
                          );
                          markDirty();
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm câu hỏi vào nhóm
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Bottom Save & Publish Action Bar */}
      {!isPublishedLocked && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-xs">
          <Button
            variant="secondary"
            loading={validateAndPublishMutation.isPending}
            onClick={() => validateAndPublishMutation.mutate(false)}
          >
            <ShieldCheck className="h-4 w-4" />
            Lưu &amp; Kiểm tra (Validate)
          </Button>
          <Button
            variant="secondary"
            loading={saveDraftMutation.isPending}
            onClick={() => saveDraftMutation.mutate()}
            data-testid="teacher-save-draft-btn"
          >
            <Save className="h-4 w-4" />
            Lưu bản nháp
          </Button>
          <Button
            variant="primary"
            loading={validateAndPublishMutation.isPending}
            onClick={() => validateAndPublishMutation.mutate(true)}
            data-testid="teacher-publish-exam-btn"
          >
            <CheckCircle2 className="h-4 w-4" />
            Xuất bản đề thi
          </Button>
        </div>
      )}
    </div>
  );
}
