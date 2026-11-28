import type { VocabPartOfSpeech, VocabReviewStatus } from "@/lib/api/types";

export const VOCAB_POS_OPTIONS: ReadonlyArray<{ value: VocabPartOfSpeech; label: string }> = [
  { value: "n", label: "n (Danh từ)" },
  { value: "v", label: "v (Động từ)" },
  { value: "adj", label: "adj (Tính từ)" },
  { value: "adv", label: "adv (Trạng từ)" },
  { value: "phrase", label: "phrase (Cụm từ)" },
];

export const VOCAB_STATUS_LABELS: Record<VocabReviewStatus, string> = {
  learning: "Đang học",
  mastered: "Đã thuộc",
};

const NON_TERMINAL_DOT_RE =
  /\b(?:e\.g|i\.e|vs|etc|Dr|Mr|Mrs|Ms|Prof|Sr|Jr|St|Fig|No|Vol|approx|al)\.\s*$/i;

function isSentenceBoundary(text: string, dotIndex: number): boolean {
  const ch = text[dotIndex];
  if (ch === "\n") return true;
  if (ch !== "." && ch !== "!" && ch !== "?") return false;

  // Avoid splitting decimal numbers such as 3.5 or 19.2%
  if (ch === "." && /\d/.test(text[dotIndex - 1] ?? "") && /\d/.test(text[dotIndex + 1] ?? "")) {
    return false;
  }

  // Avoid splitting known abbreviations (e.g., i.e., Dr., etc.)
  if (ch === ".") {
    const prefix = text.slice(Math.max(0, dotIndex - 12), dotIndex + 1);
    if (NON_TERMINAL_DOT_RE.test(prefix)) {
      return false;
    }
  }

  const next = text[dotIndex + 1];
  return next === undefined || /[\s"'”’)\]]/.test(next);
}

/**
 * Extracts the single complete sentence containing the student's selected word/phrase
 * from a paragraph or block of Reading passage text.
 */
export function extractContextSentence(
  blockText: string,
  selectedText: string,
  selectionStartOffset?: number,
): string {
  const text = (blockText || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return selectedText.trim();

  const cleanSel = selectedText.trim();
  let anchorStart =
    typeof selectionStartOffset === "number" &&
    selectionStartOffset >= 0 &&
    selectionStartOffset < text.length
      ? selectionStartOffset
      : -1;

  if (anchorStart === -1 && cleanSel) {
    anchorStart = text.toLowerCase().indexOf(cleanSel.toLowerCase());
  }
  if (anchorStart === -1) {
    anchorStart = 0;
  }

  const anchorEnd = Math.min(text.length, anchorStart + Math.max(1, cleanSel.length));

  let start = 0;
  for (let i = anchorStart - 1; i >= 0; i--) {
    if (isSentenceBoundary(text, i)) {
      start = i + 1;
      break;
    }
  }

  let end = text.length;
  for (let i = anchorEnd; i < text.length; i++) {
    if (isSentenceBoundary(text, i)) {
      end = text[i] === "\n" ? i : i + 1;
      break;
    }
  }

  const sentence = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (!sentence) return cleanSel;
  return sentence.length > 600 ? `${sentence.slice(0, 597).trim()}...` : sentence;
}

export interface SentenceSegment {
  text: string;
  highlight: boolean;
}

/**
 * Splits a context sentence into plain and highlighted segments so the saved word
 * can be bolded cleanly without `dangerouslySetInnerHTML`.
 */
export function splitSentenceByWord(sentence: string, word: string): SentenceSegment[] {
  const cleanSentence = sentence || "";
  const cleanWord = (word || "").trim();
  if (!cleanSentence || !cleanWord) {
    return [{ text: cleanSentence, highlight: false }];
  }

  const escaped = cleanWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = cleanSentence.split(regex);
  if (parts.length <= 1) {
    return [{ text: cleanSentence, highlight: false }];
  }

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      highlight: part.toLowerCase() === cleanWord.toLowerCase(),
    }));
}
