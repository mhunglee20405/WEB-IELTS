"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { examAttemptsApi } from "@/lib/api/endpoints/exam-attempts";
import { normalizeApiError } from "@/lib/api/error";
import type { ExamAnswerValue } from "@/lib/api/types";
import { serializeAttemptAnswers } from "./question-meta";

export type ExamAutosaveStatus = "idle" | "saving" | "saved" | "unsynced" | "conflict";

export interface UseExamAutosaveOptions {
  attemptId: string;
  initialAnswers: Record<string, ExamAnswerValue>;
  initialFlaggedIds?: string[];
  initialRevision: number;
  disabled?: boolean;
  onServerSync?: (info: { serverTime: string; remainingSeconds: number }) => void;
  onAttemptLocked?: (reason: "EXPIRED" | "SUBMITTED") => void;
}

const STORAGE_PREFIX = "ielts-exam-draft-v2:";

function readCachedDraft(attemptId: string): {
  answers?: Record<string, ExamAnswerValue>;
  flaggedQuestionIds?: string[];
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${attemptId}`);
    if (!raw) return null;
    return JSON.parse(raw) as {
      answers?: Record<string, ExamAnswerValue>;
      flaggedQuestionIds?: string[];
    };
  } catch {
    return null;
  }
}

function writeCachedDraft(
  attemptId: string,
  answers: Record<string, ExamAnswerValue>,
  flaggedQuestionIds: string[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${STORAGE_PREFIX}${attemptId}`,
      JSON.stringify({ answers, flaggedQuestionIds, updatedAt: Date.now() }),
    );
  } catch {
    // Ignore storage quota issues
  }
}

export function clearCachedExamDraft(attemptId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${attemptId}`);
  } catch {
    // Ignore storage cleanup error
  }
}

export function useExamAutosave({
  attemptId,
  initialAnswers,
  initialFlaggedIds = [],
  initialRevision,
  disabled = false,
  onServerSync,
  onAttemptLocked,
}: UseExamAutosaveOptions) {
  const [answers, setAnswers] = useState<Record<string, ExamAnswerValue>>(() => {
    const cached = readCachedDraft(attemptId);
    if (cached?.answers && Object.keys(initialAnswers).length === 0) {
      return { ...cached.answers };
    }
    return { ...initialAnswers };
  });
  const [flaggedIds, setFlaggedIds] = useState<string[]>(() => initialFlaggedIds);
  const [revision, setRevision] = useState<number>(initialRevision);
  const [syncStatus, setSyncStatus] = useState<ExamAutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const answersRef = useRef(answers);
  const flaggedRef = useRef(flaggedIds);
  const revisionRef = useRef(revision);
  const dirtyQuestionIdsRef = useRef<Set<string>>(new Set());
  const dirtyFlaggedRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<number> | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);

  const onServerSyncRef = useRef(onServerSync);
  const onAttemptLockedRef = useRef(onAttemptLocked);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    flaggedRef.current = flaggedIds;
  }, [flaggedIds]);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    onServerSyncRef.current = onServerSync;
  }, [onServerSync]);

  useEffect(() => {
    onAttemptLockedRef.current = onAttemptLocked;
  }, [onAttemptLocked]);

  const persistDraftToServer = useCallback(async (): Promise<number> => {
    if (disabled) return revisionRef.current;

    if (inFlightPromiseRef.current) {
      await inFlightPromiseRef.current.catch(() => revisionRef.current);
    }

    const hasDirty =
      dirtyQuestionIdsRef.current.size > 0 || dirtyFlaggedRef.current;
    if (!hasDirty) {
      return revisionRef.current;
    }

    const seq = ++saveSeqRef.current;
    setSyncStatus("saving");
    setErrorMessage(null);

    const runSave = async (attemptRetry = true): Promise<number> => {
      const serialized = serializeAttemptAnswers(answersRef.current);
      const snapshotFlags = [...flaggedRef.current];
      const baseRevision = revisionRef.current;
      // Clear dirty markers prior to network call; any edits during the request re-add themselves
      const savingDirtyKeys = new Set(dirtyQuestionIdsRef.current);
      dirtyQuestionIdsRef.current.clear();
      dirtyFlaggedRef.current = false;

      try {
        const res = await examAttemptsApi.saveAnswers(attemptId, {
          baseRevision,
          answers: serialized,
          flaggedQuestionIds: snapshotFlags,
        });

        revisionRef.current = res.revision;
        setRevision(res.revision);
        onServerSyncRef.current?.({
          serverTime: res.serverTime,
          remainingSeconds: res.remainingSeconds,
        });

        if (seq === saveSeqRef.current) {
          setLastSavedAt(res.savedAt);
          setSyncStatus("saved");
          setErrorMessage(null);
        }
        return res.revision;
      } catch (err) {
        const normalized = normalizeApiError(err);

        if (normalized.code === "ATTEMPT_EXPIRED") {
          setSyncStatus("unsynced");
          setErrorMessage(normalized.message);
          onAttemptLockedRef.current?.("EXPIRED");
          throw normalized;
        }
        if (normalized.code === "ATTEMPT_ALREADY_SUBMITTED") {
          setSyncStatus("unsynced");
          onAttemptLockedRef.current?.("SUBMITTED");
          throw normalized;
        }

        // Re-restore dirty keys since save failed
        for (const key of savingDirtyKeys) {
          dirtyQuestionIdsRef.current.add(key);
        }
        dirtyFlaggedRef.current = true;

        if (normalized.code === "ANSWERS_REVISION_CONFLICT" && attemptRetry) {
          setSyncStatus("conflict");
          setErrorMessage("Phiên thi vừa có cập nhật mới, đang tự đồng bộ lại...");
          const latest = await examAttemptsApi.getById(attemptId);
          revisionRef.current = latest.revision;
          setRevision(latest.revision);

          // Preserve local dirty question answers on top of latest server answers
          const mergedAnswers: Record<string, ExamAnswerValue> = { ...latest.answers };
          for (const key of dirtyQuestionIdsRef.current) {
            const localVal = answersRef.current[key];
            if (localVal !== undefined) {
              mergedAnswers[key] = localVal;
            }
          }
          answersRef.current = mergedAnswers;
          setAnswers(mergedAnswers);
          writeCachedDraft(attemptId, mergedAnswers, flaggedRef.current);
          return runSave(false);
        }

        if (seq === saveSeqRef.current) {
          setSyncStatus("unsynced");
          setErrorMessage(normalized.message || "Không thể lưu nháp lên máy chủ.");
        }
        throw normalized;
      }
    };

    const promise = runSave(true);
    inFlightPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      if (inFlightPromiseRef.current === promise) {
        inFlightPromiseRef.current = null;
      }
    }
  }, [attemptId, disabled]);

  const scheduleAutosave = useCallback(() => {
    if (disabled) return;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void persistDraftToServer().catch(() => {
        // Error state already exposed via syncStatus/errorMessage
      });
    }, 1100);
  }, [disabled, persistDraftToServer]);

  const setAnswer = useCallback(
    (questionId: string, value: ExamAnswerValue) => {
      if (disabled) return;
      dirtyQuestionIdsRef.current.add(questionId);
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        answersRef.current = next;
        writeCachedDraft(attemptId, next, flaggedRef.current);
        return next;
      });
      scheduleAutosave();
    },
    [attemptId, disabled, scheduleAutosave],
  );

  const toggleFlag = useCallback(
    (questionId: string) => {
      if (disabled) return;
      dirtyFlaggedRef.current = true;
      setFlaggedIds((prev) => {
        const exists = prev.includes(questionId);
        const next = exists
          ? prev.filter((id) => id !== questionId)
          : [...prev, questionId];
        flaggedRef.current = next;
        writeCachedDraft(attemptId, answersRef.current, next);
        return next;
      });
      scheduleAutosave();
    },
    [attemptId, disabled, scheduleAutosave],
  );

  const flushBeforeSubmit = useCallback(async (): Promise<{
    revision: number;
    answers: Record<string, ExamAnswerValue>;
    flaggedQuestionIds: string[];
  }> => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const finalRev = await persistDraftToServer().catch(() => revisionRef.current);
    return {
      revision: finalRev,
      answers: serializeAttemptAnswers(answersRef.current),
      flaggedQuestionIds: [...flaggedRef.current],
    };
  }, [persistDraftToServer]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    answers,
    flaggedIds,
    revision,
    syncStatus,
    lastSavedAt,
    errorMessage,
    setAnswer,
    toggleFlag,
    retrySave: persistDraftToServer,
    flushBeforeSubmit,
  };
}
