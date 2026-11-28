import type {
  ExamPartAuthoring,
  ExamQuestionType,
  ExamSkill,
  VocabPartOfSpeech,
} from "@/lib/api/types";
import {
  extractBlankTokens,
  formatSlashAnswers,
  generateBlankUid,
  isRichBlankCompletionType,
  normalizeGroupBlanks,
} from "@/lib/exam/listening-template";

export interface DraftPassageVocab {
  id?: string;
  word: string;
  partOfSpeech: VocabPartOfSpeech;
  ipa: string;
  meaningVi: string;
  paraphraseNote: string;
  contextSentence: string;
}

export interface DraftQuestion {
  id?: string;
  blankUid?: string;
  prompt: string;
  questionType: ExamQuestionType;
  optionsText: string; // one per line: A|Option text
  maxWords: number;
  maxSelections: number;
  correctAnswerText: string; // slash separated variants for completion, comma separated for MCQ multi
  acceptedAnswersText: string;
  referenceParagraph: string;
  explanation: string;
}

export interface DraftGroup {
  id?: string;
  title: string;
  instructionHtml: string;
  summaryTemplateHtml: string;
  questionType: ExamQuestionType;
  sharedOptionsText: string; // key|text per line
  maxWords: number;
  maxSelections: number;
  questions: DraftQuestion[];
}

export interface DraftPart {
  id?: string;
  title: string;
  passageTitle: string;
  passageHtml: string;
  instructions: string;
  durationMinutes: number;
  audioAssetId: string;
  audioPlaybackUrl?: string;
  audioAllowPause: boolean;
  audioAllowSeek: boolean;
  audioMaxPlayCount: string;
  transcript: string;
  groups: DraftGroup[];
  vocabs?: DraftPassageVocab[];
}

export function formatOptionsToText(
  options?: Array<{ key: string; text: string }>,
): string {
  if (!options || options.length === 0) return "";
  return options.map((o) => `${o.key}|${o.text}`).join("\n");
}

export function parseOptionsFromText(
  raw: string,
): Array<{ key: string; text: string }> {
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

export function createEmptyQuestion(questionType: ExamQuestionType): DraftQuestion {
  return {
    blankUid: isRichBlankCompletionType(questionType) ? generateBlankUid() : undefined,
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
            : isRichBlankCompletionType(questionType)
              ? ""
              : "A",
    acceptedAnswersText: "",
    referenceParagraph: "",
    explanation: "",
  };
}

export function createEmptyDraftPart(skill: ExamSkill, partIndex: number): DraftPart {
  if (skill === "VOCABULARY" || skill === "GRAMMAR") {
    const label = skill === "VOCABULARY" ? "Vocabulary" : "Grammar";
    return {
      title: `${label} Quiz`,
      passageTitle: "",
      passageHtml: "",
      instructions: "",
      durationMinutes: 15,
      audioAssetId: "",
      audioAllowPause: true,
      audioAllowSeek: true,
      audioMaxPlayCount: "",
      transcript: "",
      groups: [
        {
          title: `Câu hỏi trắc nghiệm ${label}`,
          instructionHtml: `<p>Chọn một đáp án đúng nhất (A, B, C hoặc D) cho mỗi câu hỏi.</p>`,
          summaryTemplateHtml: "",
          questionType: "MULTIPLE_CHOICE_SINGLE",
          sharedOptionsText: "",
          maxWords: 1,
          maxSelections: 1,
          questions: [createEmptyQuestion("MULTIPLE_CHOICE_SINGLE")],
        },
      ],
    };
  }

  if (skill === "LISTENING") {
    const uid1 = generateBlankUid();
    const uid2 = generateBlankUid();
    const starterHtml =
      `<p><strong>Section ${partIndex + 1} Notes</strong></p>` +
      `<ul>` +
      `<li>Key location or topic: <span class="ielts-blank blank-uid-${uid1}">(1)_____</span></li>` +
      `<li>Important detail or time: <span class="ielts-blank blank-uid-${uid2}">(2)_____</span></li>` +
      `</ul>`;

    return {
      title: `Recording ${partIndex + 1}`,
      passageTitle: "",
      passageHtml: "",
      instructions: "",
      durationMinutes: 10,
      audioAssetId: "",
      audioAllowPause: true,
      audioAllowSeek: true,
      audioMaxPlayCount: "",
      transcript: "",
      groups: [
        {
          title: `Questions`,
          instructionHtml: "<p>Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer.</p>",
          summaryTemplateHtml: starterHtml,
          questionType: "NOTE_COMPLETION",
          sharedOptionsText: "",
          maxWords: 2,
          maxSelections: 2,
          questions: [
            { ...createEmptyQuestion("NOTE_COMPLETION"), blankUid: uid1, maxWords: 2 },
            { ...createEmptyQuestion("NOTE_COMPLETION"), blankUid: uid2, maxWords: 2 },
          ],
        },
      ],
    };
  }

  return {
    title: `Passage ${partIndex + 1}`,
    passageTitle: "",
    passageHtml:
      "<p><strong>Paragraph A.</strong> Nhập nội dung đoạn văn tiếng Anh học thuật tại đây...</p>",
    instructions: "",
    durationMinutes: 20,
    audioAssetId: "",
    audioAllowPause: true,
    audioAllowSeek: true,
    audioMaxPlayCount: "",
    transcript: "",
    groups: [
      {
        title: `Questions 1–2`,
        instructionHtml: "<p>Answer the questions below.</p>",
        summaryTemplateHtml: "",
        questionType: "TRUE_FALSE_NOT_GIVEN",
        sharedOptionsText: "",
        maxWords: 2,
        maxSelections: 2,
        questions: [createEmptyQuestion("TRUE_FALSE_NOT_GIVEN")],
      },
    ],
  };
}

export function toDraftPart(part: ExamPartAuthoring): DraftPart {
  return {
    id: part.id,
    title: part.title,
    passageTitle: part.passageTitle ?? part.title,
    passageHtml:
      part.passageHtml ??
      (part as any).contentHtml ??
      (part.paragraphs
        ? part.paragraphs
            .map((p) => `<p><strong>Paragraph ${p.label}.</strong> ${p.text}</p>`)
            .join("")
        : ""),
    instructions: part.instructions ?? "",
    durationMinutes: Math.max(
      1,
      Math.round(
        ((part.durationSeconds ?? (part as any).fullDurationSeconds) ?? 1200) / 60,
      ),
    ),
    audioAssetId: part.audioAsset?.assetId ?? (part as any).audioAssetId ?? "",
    audioPlaybackUrl: part.audioAsset?.playbackUrl ?? (part as any).audioPlaybackUrl,
    audioAllowPause: part.audioAsset?.allowPause ?? true,
    audioAllowSeek: part.audioAsset?.allowSeek ?? true,
    audioMaxPlayCount:
      part.audioAsset?.maxPlayCount !== null &&
      part.audioAsset?.maxPlayCount !== undefined
        ? String(part.audioAsset.maxPlayCount)
        : "",
    transcript: part.transcript ?? "",
    groups: (part.questionGroups || []).map((g: any) => {
      const templateHtml: string = g.summaryTemplateHtml ?? "";
      const uids = extractBlankTokens(templateHtml);
      return {
        id: g.id,
        title: g.title ?? "",
        instructionHtml: g.instructionHtml ?? g.instruction ?? "",
        summaryTemplateHtml: templateHtml,
        questionType: g.questionType ?? g.type,
        sharedOptionsText: formatOptionsToText(g.sharedOptions),
        maxWords: g.maxWords ?? 2,
        maxSelections: g.maxSelections ?? 2,
        questions: (g.questions || []).map((q: any, qIdx: number) => {
          const qType: ExamQuestionType = q.questionType ?? q.type ?? g.questionType ?? g.type;
          const correctKeys = Array.isArray(q.correctAnswer)
            ? q.correctAnswer
            : q.correctAnswer
              ? [q.correctAnswer]
              : q.grading?.acceptedKeys || [];
          const accepted =
            q.acceptedAnswers ??
            (Array.isArray(q.grading?.acceptedKeys) ? q.grading.acceptedKeys : []);
          return {
            id: q.id,
            blankUid: uids[qIdx] || (isRichBlankCompletionType(qType) ? generateBlankUid() : undefined),
            prompt: q.prompt || "",
            questionType: qType,
            optionsText: formatOptionsToText(q.options),
            maxWords: q.maxWords ?? g.maxWords ?? 2,
            maxSelections: q.maxSelections ?? g.maxSelections ?? 2,
            correctAnswerText:
              qType === "MULTIPLE_CHOICE_MULTIPLE"
                ? correctKeys.join(", ")
                : formatSlashAnswers(correctKeys[0], accepted),
            acceptedAnswersText: accepted.join(", "),
            referenceParagraph: q.referenceParagraph ?? "",
            explanation: q.explanation ?? "",
          };
        }),
      };
    }),
  };
}

/**
 * Synchronizes all numbered blanks across Recording 1..4 so global question numbers (1..40)
 * remain strictly sequential, preserving each blank's answer data by `blankUid`.
 */
export function syncListeningPartsBlanks(parts: DraftPart[]): DraftPart[] {
  let globalNumber = 1;

  return parts.map((part) => {
    const nextGroups = part.groups.map((group) => {
      const usesBlanks =
        isRichBlankCompletionType(group.questionType) &&
        group.summaryTemplateHtml.trim().length > 0;

      if (!usesBlanks) {
        globalNumber += group.questions.length;
        return group;
      }

      const normalized = normalizeGroupBlanks(group.summaryTemplateHtml, globalNumber);
      globalNumber = normalized.nextNumber;

      // Map existing questions by blankUid (fallback by index if legacy without uid)
      const byUid = new Map<string, DraftQuestion>();
      group.questions.forEach((q) => {
        if (q.blankUid) byUid.set(q.blankUid, q);
      });

      const syncedQuestions: DraftQuestion[] = normalized.tokens.map((tok, idx) => {
        const matched = byUid.get(tok.uid) ?? (!group.questions[idx]?.blankUid ? group.questions[idx] : undefined);
        if (matched) {
          return {
            ...matched,
            blankUid: tok.uid,
            questionType: group.questionType,
          };
        }
        return {
          ...createEmptyQuestion(group.questionType),
          blankUid: tok.uid,
          maxWords: group.maxWords,
        };
      });

      return {
        ...group,
        summaryTemplateHtml: normalized.html,
        questions: syncedQuestions,
      };
    });

    return {
      ...part,
      groups: nextGroups,
    };
  });
}

/**
 * Computes global start question number for every part & group for live numbering badges.
 */
export function computeGroupStartNumbers(parts: DraftPart[]): number[][] {
  let cursor = 1;
  return parts.map((part) =>
    part.groups.map((group) => {
      const start = cursor;
      cursor += group.questions.length;
      return start;
    }),
  );
}
