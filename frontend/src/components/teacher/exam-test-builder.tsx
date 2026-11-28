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
import { Badge, Button, Card, RichTextEditor, SafeHtml } from "@/components/ui";
import { resolveBackendMediaUrl } from "@/lib/api/client";
import { teacherExamTestsApi } from "@/lib/api/endpoints/teacher-exam-tests";
import { mediaApi } from "@/lib/api/endpoints/media";
import { vocabularyApi } from "@/lib/api/endpoints/vocabulary";
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
import { parseSlashAnswers } from "@/lib/exam/listening-template";
import {
  createEmptyDraftPart,
  createEmptyQuestion,
  parseOptionsFromText,
  toDraftPart,
  type DraftPart,
} from "./exam-builder-types";
import { ListeningTestBuilder } from "./listening-test-builder";
import { PassageVocabAuthoring } from "./passage-vocab-authoring";
import { QuizTestBuilder } from "./quiz-test-builder";

export function ExamTestBuilder({
  initialTest,
}: {
  initialTest?: ExamTestDetailAuthoring;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEditingExisting = Boolean(initialTest);
  const isPublishedLocked = false;

  const [title, setTitle] = useState(initialTest?.title ?? "");
  const [subtitle, setSubtitle] = useState(initialTest?.subtitle ?? "");
  const [skill, setSkill] = useState<ExamSkill>(initialTest?.skill ?? "READING");
  const [difficulty, setDifficulty] = useState<string>(
    initialTest?.difficulty ?? "TARGET_65",
  );
  const [tagsText, setTagsText] = useState((initialTest?.tags ?? []).join(", "));
  const [durationMinutes, setDurationMinutes] = useState(
    initialTest ? Math.max(0, Math.round(initialTest.totalDurationSeconds / 60)) : 20,
  );
  const isQuizSkill = skill === "VOCABULARY" || skill === "GRAMMAR";
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
  const [previewAudioUrl, setPreviewAudioUrl] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    (initialTest?.parts ?? []).forEach((p, idx) => {
      const rawUrl = p.audioAsset?.playbackUrl;
      if (rawUrl) {
        initial[idx] = resolveBackendMediaUrl(rawUrl);
      }
    });
    return initial;
  });
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

  useEffect(() => {
    if (!initialTest || initialTest.skill !== "READING") return;
    let cancelled = false;
    void Promise.all(
      initialTest.parts.map(async (p) => {
        try {
          const res = await vocabularyApi.getTeacherPassageVocabs(p.id);
          return { partId: p.id, items: res.items };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const byPartId = new Map<string, DraftPart["vocabs"]>();
      results.forEach((entry) => {
        if (!entry) return;
        byPartId.set(
          entry.partId,
          entry.items.map((v) => ({
            id: v.id,
            word: v.word,
            partOfSpeech: v.partOfSpeech,
            ipa: v.ipa ?? "",
            meaningVi: v.meaningVi,
            paraphraseNote: v.paraphraseNote ?? "",
            contextSentence: v.contextSentence ?? "",
          })),
        );
      });
      if (byPartId.size > 0) {
        setParts((prev) =>
          prev.map((part) =>
            part.id && byPartId.has(part.id) && part.vocabs === undefined
              ? { ...part, vocabs: byPartId.get(part.id) }
              : part,
          ),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialTest]);

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
      ...(part.id ? { id: part.id } : {}),
      partNumber: partIndex + 1,
      partType:
        skill === "READING" ? "PASSAGE" : skill === "LISTENING" ? "SECTION" : "QUIZ",
      title:
        part.title.trim() ||
        (skill === "READING"
          ? `Passage ${partIndex + 1}`
          : skill === "LISTENING"
            ? `Section ${partIndex + 1}`
            : `${skill === "VOCABULARY" ? "Vocabulary" : "Grammar"} Quiz`),
      instructions: part.instructions.trim() || undefined,
      passageTitle:
        skill === "READING" ? part.passageTitle.trim() || part.title.trim() : undefined,
      passageHtml: skill === "READING" ? part.passageHtml : undefined,
      audioAsset:
        skill === "LISTENING" && part.audioAssetId.trim()
          ? {
              assetId: part.audioAssetId.trim(),
              playbackUrl: part.audioPlaybackUrl || undefined,
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
        summaryTemplateHtml: g.summaryTemplateHtml?.trim() || undefined,
        questionType: g.questionType,
        sharedOptions: MATCHING_QUESTION_TYPES.has(g.questionType)
          ? parseOptionsFromText(g.sharedOptionsText)
          : undefined,
        maxWords: g.maxWords,
        maxSelections: g.maxSelections,
        questions: g.questions.map((q) => {
          const qNum = runningQ++;
          let correctAnswer: ExamAnswerValue = q.correctAnswerText.trim();
          let extraAccepted: string[] = [];

          if (q.questionType === "MULTIPLE_CHOICE_MULTIPLE") {
            correctAnswer = q.correctAnswerText
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          } else if (skill === "LISTENING" || q.correctAnswerText.includes("/")) {
            const parsed = parseSlashAnswers(q.correctAnswerText, q.questionType);
            correctAnswer = parsed.primary;
            extraAccepted = parsed.accepted;
          }

          const manualAccepted = q.acceptedAnswersText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const mergedAccepted = Array.from(new Set([...extraAccepted, ...manualAccepted]));

          return {
            id: q.id,
            questionNumber: qNum,
            prompt:
              q.prompt.trim() ||
              (g.summaryTemplateHtml?.trim() ? `Blank (${qNum})` : ""),
            questionType: q.questionType,
            options:
              q.optionsText.trim().length > 0
                ? parseOptionsFromText(q.optionsText)
                : undefined,
            maxWords: q.maxWords,
            maxSelections: q.maxSelections,
            correctAnswer,
            acceptedAnswers: mergedAccepted.length > 0 ? mergedAccepted : undefined,
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
      const allowedModes: ExamMode[] = isQuizSkill ? ["FULL"] : [];
      if (!isQuizSkill) {
        if (allowPartMode) allowedModes.push("PART");
        if (allowFullMode) allowedModes.push("FULL");
        if (allowedModes.length === 0) {
          allowedModes.push("PART");
        }
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

      const savedDetail = await teacherExamTestsApi.getById(testId);
      if (skill === "READING") {
        for (let i = 0; i < savedDetail.parts.length; i++) {
          const savedPart = savedDetail.parts[i];
          const draftVocabs = parts[i]?.vocabs;
          if (savedPart && draftVocabs !== undefined) {
            await vocabularyApi
              .syncTeacherPassageVocabs(savedPart.id, {
                testId: savedDetail.id,
                partNumber: savedPart.partNumber,
                items: draftVocabs.map((v) => ({
                  word: v.word.trim(),
                  partOfSpeech: v.partOfSpeech,
                  ipa: v.ipa.trim() || undefined,
                  meaningVi: v.meaningVi.trim(),
                  paraphraseNote: v.paraphraseNote.trim() || undefined,
                  contextSentence: v.contextSentence.trim() || undefined,
                })),
              })
              .catch(() => null);
          }
        }
      }

      return savedDetail;
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
        text: initialTest?.status === "PUBLISHED"
          ? "Đã cập nhật đề thi thành công!"
          : "Đã xuất bản đề thi thành công! Học viên có thể làm bài ngay.",
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
        setPreviewAudioUrl((prev) => ({
          ...prev,
          [partIdx]: resolveBackendMediaUrl(playback.streamUrl),
        }));
      }
      setStatusBanner({
        type: "success",
        text: `Đã tải lên tệp audio "${uploaded.filename}" thành công (Asset: ${uploaded.assetId}).`,
      });
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

      {initialTest?.status === "PUBLISHED" && (
        <Card className="border-blue-200 bg-blue-50/60 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-blue-900">
              Đề thi đang ở trạng thái Xuất bản (v{initialTest.version}). Mọi chỉnh sửa được lưu sẽ có hiệu lực trực tiếp cho các lượt làm bài mới của học viên.
            </p>
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
        <div className={isQuizSkill ? "space-y-4" : "grid gap-4 md:grid-cols-2"}>
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
              placeholder={
                isQuizSkill
                  ? "Ví dụ: Academic Vocabulary — Environment & Climate"
                  : "Ví dụ: IELTS Reading Practice — Marine Biology"
              }
              className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className={isQuizSkill ? "grid gap-4 sm:grid-cols-2" : "contents"}>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-skill-select">
                Kỹ năng / Dạng bài IELTS
              </label>
              <select
                id="exam-skill-select"
                disabled={isPublishedLocked || isEditingExisting}
                value={skill}
                onChange={(e) => {
                  const nextSkill = e.target.value as ExamSkill;
                  setSkill(nextSkill);
                  setParts([createEmptyDraftPart(nextSkill, 0)]);
                  if (nextSkill === "LISTENING") {
                    setAllowFullMode(true);
                  } else if (nextSkill === "VOCABULARY" || nextSkill === "GRAMMAR") {
                    setDurationMinutes(15);
                    setAllowFullMode(true);
                    setAllowPartMode(false);
                  }
                  markDirty();
                }}
                className="lms-input w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="READING">IELTS Reading (Passage)</option>
                <option value="LISTENING">IELTS Listening (Section + Audio)</option>
                <option value="VOCABULARY">Vocabulary (Trắc nghiệm Từ vựng)</option>
                <option value="GRAMMAR">Grammar (Trắc nghiệm Ngữ pháp)</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-dur-input">
                {isQuizSkill
                  ? "Thời gian làm bài (phút, nhập 0 nếu không giới hạn)"
                  : "Tổng thời gian (phút)"}
              </label>
              <input
                id="exam-dur-input"
                type="number"
                min={isQuizSkill ? 0 : 1}
                max={180}
                disabled={isPublishedLocked}
                value={durationMinutes}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  setDurationMinutes(
                    isQuizSkill ? Math.max(0, Number.isFinite(raw) ? raw : 0) : raw || 20,
                  );
                  markDirty();
                }}
                className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700" htmlFor="exam-subtitle-input">
              {isQuizSkill ? "Mô tả ngắn / Chủ đề" : "Mô tả ngắn"}
            </label>
            <input
              id="exam-subtitle-input"
              disabled={isPublishedLocked}
              value={subtitle}
              onChange={(e) => {
                setSubtitle(e.target.value);
                markDirty();
              }}
              placeholder={
                isQuizSkill
                  ? "Chủ điểm từ vựng hoặc ngữ pháp trọng tâm của bài luyện tập..."
                  : "Ghi chú phạm vi hoặc kỹ năng trọng tâm..."
              }
              className="lms-input w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {!isQuizSkill && (
            <>
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
            </>
          )}
        </div>

        {!isQuizSkill && (
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
        )}
      </Card>

      {/* Parts (Reading Passages / Listening Recordings / Vocabulary & Grammar Quiz) */}
      {skill === "LISTENING" ? (
        <ListeningTestBuilder
          testTitle={title}
          parts={parts}
          setParts={setParts}
          isPublishedLocked={isPublishedLocked}
          uploadPercent={uploadPercent}
          previewAudioUrl={previewAudioUrl}
          onAudioFileChange={(pIdx, f) => void handleAudioFileChange(pIdx, f)}
          onSetPreviewAudioUrl={(pIdx, url) =>
            setPreviewAudioUrl((prev) => ({ ...prev, [pIdx]: url }))
          }
          onError={(msg) => setStatusBanner({ type: "error", text: msg })}
          markDirty={markDirty}
          savedPreviewHref={
            initialTest
              ? `/teacher/question-bank/${encodeURIComponent(initialTest.id)}/preview`
              : undefined
          }
        />
      ) : isQuizSkill ? (
        <QuizTestBuilder
          skill={skill}
          parts={parts}
          setParts={setParts}
          disabled={isPublishedLocked}
          markDirty={markDirty}
        />
      ) : (
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
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-700">
                  Nội dung bài đọc Reading (Hỗ trợ định dạng TinyMCE & Paragraph)
                </label>
                <RichTextEditor
                  id={`passage-editor-${partIdx}`}
                  disabled={isPublishedLocked}
                  value={part.passageHtml}
                  onChange={(v) => {
                    setParts((prev) =>
                      prev.map((item, i) =>
                        i === partIdx ? { ...item, passageHtml: v } : item,
                      ),
                    );
                    markDirty();
                  }}
                  placeholder="Nhập nội dung bài đọc Reading, định dạng in đậm Paragraph A, B, C, tiêu đề, bảng số liệu..."
                  height={380}
                />

                <PassageVocabAuthoring
                  passageId={part.id}
                  testId={initialTest?.id}
                  partNumber={partIdx + 1}
                  vocabs={part.vocabs ?? []}
                  disabled={isPublishedLocked}
                  onChange={(nextVocabs) => {
                    setParts((prev) =>
                      prev.map((item, i) =>
                        i === partIdx ? { ...item, vocabs: nextVocabs } : item,
                      ),
                    );
                    markDirty();
                  }}
                />
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

                {previewAudioUrl[partIdx] ? (
                  <audio controls src={previewAudioUrl[partIdx]} className="w-full" />
                ) : part.audioAssetId.trim() ? (
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void mediaApi
                          .getAudioPlayback(part.audioAssetId.trim())
                          .then((res) => {
                            if (res?.streamUrl) {
                              setPreviewAudioUrl((prev) => ({
                                ...prev,
                                [partIdx]: resolveBackendMediaUrl(res.streamUrl),
                              }));
                            }
                          })
                          .catch((err) => {
                            setStatusBanner({
                              type: "error",
                              text: getFriendlyErrorMessage(err),
                            });
                          });
                      }}
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      Nghe thử audio đã lưu
                    </Button>
                  </div>
                ) : null}

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
                                    summaryTemplateHtml: "",
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
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="w-full sm:w-72">
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

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Tiêu đề nhóm / Hướng dẫn
                      </label>
                      <textarea
                        rows={3}
                        disabled={isPublishedLocked}
                        value={group.title}
                        placeholder="Nhập tiêu đề nhóm hoặc hướng dẫn làm bài (hỗ trợ xuống dòng nhiều dòng)..."
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
                        className="lms-input w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-relaxed focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      />
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

                        <textarea
                          rows={3}
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
                          className="lms-input w-full rounded-lg border border-slate-300 p-2.5 text-sm leading-relaxed"
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
      )}

      {/* Bottom Save & Publish Action Bar */}
      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-xs">
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
          {initialTest?.status === "PUBLISHED" ? "Lưu cập nhật đề thi" : "Xuất bản đề thi"}
        </Button>
      </div>
    </div>
  );
}
