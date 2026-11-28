export interface ExerciseDraftPayload {
  answers: Record<string, string>;
  updatedAt: string;
}

function getDraftStorageKey(userId: string, studentAssignmentId: string): string {
  return `ielts_lms_draft:${userId}:${studentAssignmentId}`;
}

/**
 * Loads locally persisted answers-in-progress only (never grading keys or submissions)
 * scoped to `(userId, studentAssignmentId)`.
 */
export function loadExerciseDraft(
  userId: string,
  studentAssignmentId: string,
): ExerciseDraftPayload | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(userId, studentAssignmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "answers" in parsed &&
      typeof (parsed as { answers: unknown }).answers === "object" &&
      (parsed as { answers: unknown }).answers !== null
    ) {
      const record = parsed as { answers: Record<string, unknown>; updatedAt?: unknown };
      const sanitizedAnswers: Record<string, string> = {};
      for (const [key, value] of Object.entries(record.answers)) {
        if (typeof value === "string") {
          sanitizedAnswers[key] = value;
        }
      }
      return {
        answers: sanitizedAnswers,
        updatedAt:
          typeof record.updatedAt === "string"
            ? record.updatedAt
            : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveExerciseDraft(
  userId: string,
  studentAssignmentId: string,
  answers: Record<string, string>,
): string {
  const updatedAt = new Date().toISOString();
  if (typeof window === "undefined") {
    return updatedAt;
  }
  try {
    const payload: ExerciseDraftPayload = { answers, updatedAt };
    window.localStorage.setItem(
      getDraftStorageKey(userId, studentAssignmentId),
      JSON.stringify(payload),
    );
  } catch {
    // Ignore storage quota / private mode failures cleanly
  }
  return updatedAt;
}

export function clearExerciseDraft(userId: string, studentAssignmentId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(getDraftStorageKey(userId, studentAssignmentId));
  } catch {
    // Ignore storage unavailability
  }
}

