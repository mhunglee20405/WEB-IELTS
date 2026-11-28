import type { ExamAnswerValue, ExamQuestionType } from "@/lib/api/types";
import { COMPLETION_QUESTION_TYPES } from "./question-meta";

export function isRichBlankCompletionType(questionType: ExamQuestionType): boolean {
  return COMPLETION_QUESTION_TYPES.has(questionType) || questionType === "SHORT_ANSWER";
}

export function generateBlankUid(): string {
  return `b${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function buildBlankSpanHtml(uid: string, questionNumber: number): string {
  return `<span class="ielts-blank blank-uid-${uid}">(${questionNumber})_____</span>`;
}

export interface ParsedBlankToken {
  uid: string;
  questionNumber: number;
}

const BLANK_TOKEN_RE =
  /<span\b[^>]*\bclass=(["'])([^"']*\bielts-blank\b[^"']*)\1[^>]*>([\s\S]*?)<\/span>|\[\[blank(?::([a-zA-Z0-9_-]+))?\]\]|(?<![a-zA-Z0-9_>])\((\d+)\)_{3,}/gi;

/**
 * Parses rich HTML content in document order, preserves existing `blank-uid-*` identities,
 * assigns new UIDs to newly typed/duplicated blanks, removes empty/corrupted spans,
 * and rewrites each blank display to `(globalNumber)_____` starting from `startNumber`.
 */
export function normalizeGroupBlanks(
  rawHtml: string,
  startNumber: number,
): {
  html: string;
  tokens: ParsedBlankToken[];
  nextNumber: number;
} {
  if (!rawHtml) {
    return { html: "", tokens: [], nextNumber: startNumber };
  }

  let cursorNum = startNumber;
  const seenUids = new Set<string>();
  const tokens: ParsedBlankToken[] = [];

  const html = rawHtml.replace(
    BLANK_TOKEN_RE,
    (fullMatch, _quote, classAttr: string | undefined, innerHtml: string | undefined, explicitUid: string | undefined) => {
      // If an existing ielts-blank span was cleared by user (no underscores left), drop it cleanly
      if (classAttr !== undefined && innerHtml !== undefined) {
        const plainInner = innerHtml.replace(/<[^>]+>/g, "").trim();
        if (!plainInner.includes("_")) {
          return plainInner;
        }
        const uidMatch = /\bblank-uid-([a-zA-Z0-9_-]+)\b/.exec(classAttr);
        let uid = uidMatch?.[1] || generateBlankUid();
        if (seenUids.has(uid)) {
          uid = generateBlankUid();
        }
        seenUids.add(uid);
        const qNum = cursorNum++;
        tokens.push({ uid, questionNumber: qNum });
        return buildBlankSpanHtml(uid, qNum);
      }

      if (fullMatch.startsWith("[[")) {
        let uid = explicitUid || generateBlankUid();
        if (seenUids.has(uid)) {
          uid = generateBlankUid();
        }
        seenUids.add(uid);
        const qNum = cursorNum++;
        tokens.push({ uid, questionNumber: qNum });
        return buildBlankSpanHtml(uid, qNum);
      }

      // Plain text (1)_____ outside of ielts-blank span -> wrap cleanly
      const uid = generateBlankUid();
      seenUids.add(uid);
      const qNum = cursorNum++;
      tokens.push({ uid, questionNumber: qNum });
      return buildBlankSpanHtml(uid, qNum);
    },
  );

  return {
    html,
    tokens,
    nextNumber: cursorNum,
  };
}

export function extractBlankTokens(rawHtml: string): string[] {
  if (!rawHtml) return [];
  const uids: string[] = [];
  const re = new RegExp(BLANK_TOKEN_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(rawHtml)) !== null) {
    const classAttr = match[2];
    const innerHtml = match[3];
    if (classAttr !== undefined && innerHtml !== undefined) {
      const plainInner = innerHtml.replace(/<[^>]+>/g, "").trim();
      if (!plainInner.includes("_")) continue;
      const uidMatch = /\bblank-uid-([a-zA-Z0-9_-]+)\b/.exec(classAttr);
      uids.push(uidMatch?.[1] || `idx-${uids.length}`);
    } else {
      uids.push(match[4] || `idx-${uids.length}`);
    }
  }
  return uids;
}

export function parseSlashAnswers(
  raw: string,
  questionType: ExamQuestionType,
): {
  primary: ExamAnswerValue;
  accepted: string[];
} {
  if (questionType === "MULTIPLE_CHOICE_MULTIPLE") {
    const parts = raw
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      primary: parts,
      accepted: parts,
    };
  }

  const parts = raw
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    primary: parts[0] ?? raw.trim(),
    accepted: parts.length > 0 ? parts : raw.trim() ? [raw.trim()] : [],
  };
}

export function formatSlashAnswers(
  correctAnswer?: ExamAnswerValue,
  acceptedAnswers?: string[],
): string {
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.join(", ");
  }
  const unique = new Set<string>();
  if (typeof correctAnswer === "string" && correctAnswer.trim()) {
    unique.add(correctAnswer.trim());
  }
  for (const ans of acceptedAnswers ?? []) {
    if (ans && ans.trim()) unique.add(ans.trim());
  }
  return Array.from(unique).join(" / ");
}

export const LISTENING_WORD_LIMIT_PRESETS: Array<{
  value: string;
  maxWords: number;
  label: string;
  hint: string;
}> = [
  {
    value: "1_WORD",
    maxWords: 1,
    label: "1 từ (ONE WORD ONLY)",
    hint: "Write ONE WORD ONLY for each answer.",
  },
  {
    value: "1_WORD_OR_NUM",
    maxWords: 2,
    label: "1 từ và/hoặc 1 số (ONE WORD AND/OR A NUMBER)",
    hint: "Write ONE WORD AND/OR A NUMBER for each answer.",
  },
  {
    value: "2_WORDS",
    maxWords: 2,
    label: "Tối đa 2 từ (NO MORE THAN TWO WORDS)",
    hint: "Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.",
  },
  {
    value: "3_WORDS",
    maxWords: 3,
    label: "Tối đa 3 từ (NO MORE THAN THREE WORDS)",
    hint: "Write NO MORE THAN THREE WORDS AND/OR A NUMBER for each answer.",
  },
];
