"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Headphones, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaApi } from "@/lib/api/endpoints/media";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import { isMockApiMode } from "@/lib/env";
import { isSafeAudioStreamUrl } from "@/lib/sanitize/html";
import type { ExamAudioAssetPublic } from "@/lib/api/types";

export interface ExamListeningPlayerProps {
  sectionTitle: string;
  audioAsset?: ExamAudioAssetPublic;
  disabled?: boolean;
}

export function ExamListeningPlayer({
  sectionTitle,
  audioAsset,
  disabled = false,
}: ExamListeningPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastAllowedTimeRef = useRef(0);
  const [playCount, setPlayCount] = useState(0);
  const [noticeEntry, setNoticeEntry] = useState<{ assetId: string; text: string } | null>(null);

  const assetId = audioAsset?.assetId ?? "";
  const playbackNotice = noticeEntry?.assetId === assetId ? noticeEntry.text : null;
  const setPlaybackNotice = (text: string) => setNoticeEntry({ assetId, text });
  const needsSignedFetch = Boolean(assetId) && !audioAsset?.playbackUrl;

  const playbackQuery = useQuery({
    queryKey: studentKeys.audioPlayback(assetId),
    queryFn: () => mediaApi.getAudioPlayback(assetId),
    enabled: needsSignedFetch,
    staleTime: 60_000,
  });

  const rawStreamUrl = audioAsset?.playbackUrl || playbackQuery.data?.streamUrl || "";
  const resolvedUrl =
    rawStreamUrl && isSafeAudioStreamUrl(rawStreamUrl, isMockApiMode()) ? rawStreamUrl : "";
  const hasUnsafeUrl = Boolean(rawStreamUrl && !resolvedUrl);
  const allowPause = audioAsset?.allowPause ?? true;
  const allowSeek = audioAsset?.allowSeek ?? true;
  const maxPlayCount = audioAsset?.maxPlayCount ?? null;
  const isPlayLimitReached =
    maxPlayCount !== null && maxPlayCount > 0 && playCount >= maxPlayCount;

  useEffect(() => {
    lastAllowedTimeRef.current = 0;
  }, [assetId]);

  if (!assetId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Phần nghe này chưa được gắn tệp âm thanh.
      </div>
    );
  }

  return (
    <div
      data-testid="exam-listening-player"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Headphones className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900">{sectionTitle}</p>
            <p className="text-xs text-slate-600">
              {allowSeek ? "Cho phép tua" : "Không cho phép tua"} ·{" "}
              {allowPause ? "Cho phép tạm dừng" : "Chạy liên tục không tạm dừng"}
              {maxPlayCount !== null && ` · Lượt nghe: ${playCount}/${maxPlayCount}`}
            </p>
          </div>
        </div>

        {playbackQuery.isError && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void playbackQuery.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Thử tải lại audio
          </Button>
        )}
      </div>

      {playbackQuery.isLoading && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Đang cấp đường dẫn phát âm thanh an toàn...
        </div>
      )}

      {playbackQuery.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{getFriendlyErrorMessage(playbackQuery.error)}</span>
        </div>
      )}

      {hasUnsafeUrl && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Liên kết âm thanh không hợp lệ hoặc không an toàn để phát.</span>
        </div>
      )}

      {resolvedUrl && !playbackQuery.isError && (
        <div className="space-y-2">
          {isPlayLimitReached ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900">
              <Lock className="h-4 w-4 shrink-0" />
              Đã sử dụng hết tối đa {maxPlayCount} lượt phát cho phần thi này.
            </div>
          ) : (
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              controlsList={!allowSeek ? "nodownload noplaybackrate" : "nodownload"}
              src={resolvedUrl}
              className="w-full"
              onPlay={() => {
                if (disabled || isPlayLimitReached) {
                  audioRef.current?.pause();
                  return;
                }
                if (lastAllowedTimeRef.current === 0) {
                  setPlayCount((c) => c + 1);
                }
              }}
              onPause={(e) => {
                const el = e.currentTarget;
                if (!allowPause && !el.ended && !disabled) {
                  setPlaybackNotice("Bài thi quy định không tạm dừng giữa chừng.");
                  void el.play().catch(() => {
                    // Browser autoplay block fallback
                  });
                }
              }}
              onTimeUpdate={(e) => {
                lastAllowedTimeRef.current = e.currentTarget.currentTime;
              }}
              onSeeking={(e) => {
                const el = e.currentTarget;
                if (!allowSeek && Math.abs(el.currentTime - lastAllowedTimeRef.current) > 1.2) {
                  el.currentTime = lastAllowedTimeRef.current;
                  setPlaybackNotice("Phần thi này không cho phép tua audio.");
                }
              }}
              onEnded={() => {
                lastAllowedTimeRef.current = 0;
              }}
            >
              Trình duyệt của bạn không hỗ trợ phát audio HTML5.
            </audio>
          )}
          {playbackNotice && (
            <p role="status" aria-live="polite" className="text-xs font-medium text-amber-700">
              {playbackNotice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
