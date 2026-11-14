"use client";

import { Headphones, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryState } from "@/components/ui";
import { mediaApi } from "@/lib/api/endpoints";
import { studentKeys } from "@/lib/api/query-keys";
import { isMockApiMode } from "@/lib/env";
import { isSafeAudioStreamUrl } from "@/lib/sanitize/html";
import { useNowMs } from "@/lib/time/use-now";
import { formatVnDateTime } from "@/lib/time/vn-time";

export interface SignedAudioPlayerProps {
  assetId: string;
  title: string;
}

function isAllowedStreamUrl(url: string): boolean {
  return isSafeAudioStreamUrl(url, isMockApiMode());
}

/**
 * Authorized IELTS Listening audio player requesting short-lived signed URLs via
 * `GET /media/audio/:assetId/playback` and automatically refreshing near expiry while preserving playback position.
 * Primary above-the-fold player omits `loading="lazy"` and always provides native `controls`
 * per `modern-web-guidance` `lazy-load-video-and-audio`.
 */
export function SignedAudioPlayer({ assetId, title }: SignedAudioPlayerProps) {
  const captionId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeTimeRef = useRef<number | null>(null);
  const nowMs = useNowMs(15_000);

  const playbackQuery = useQuery({
    queryKey: studentKeys.audioPlayback(assetId),
    queryFn: () => mediaApi.getAudioPlayback(assetId),
    staleTime: 60_000,
  });

  const data = playbackQuery.data;
  const expiresAtMs = data ? Date.parse(data.expiresAt) : Number.NaN;
  const isNearExpiry =
    Number.isFinite(expiresAtMs) && expiresAtMs - nowMs <= 30_000;

  useEffect(() => {
    if (!isNearExpiry || playbackQuery.isFetching) {
      return;
    }
    if (audioRef.current && audioRef.current.currentTime > 0) {
      resumeTimeRef.current = audioRef.current.currentTime;
    }
    void playbackQuery.refetch();
  }, [isNearExpiry, playbackQuery]);

  const handleRefreshLink = () => {
    if (audioRef.current && audioRef.current.currentTime > 0) {
      resumeTimeRef.current = audioRef.current.currentTime;
    }
    void playbackQuery.refetch();
  };

  const handleLoadedMetadata = () => {
    if (
      audioRef.current &&
      resumeTimeRef.current !== null &&
      Number.isFinite(resumeTimeRef.current)
    ) {
      audioRef.current.currentTime = resumeTimeRef.current;
      resumeTimeRef.current = null;
    }
  };

  const streamUrl = data?.streamUrl ?? "";
  const safeStreamUrl = streamUrl && isAllowedStreamUrl(streamUrl) ? streamUrl : null;
  const hasUnsafeUrl = Boolean(streamUrl && !safeStreamUrl);

  return (
    <section
      aria-labelledby={captionId}
      className="lms-card space-y-3 border-cyan-200 bg-cyan-50/40"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Headphones className="h-5 w-5 text-cyan-800" aria-hidden={true} />
          <span className="text-xs font-semibold uppercase tracking-wide text-cyan-900">
            Audio Listening bảo mật
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefreshLink}
          disabled={playbackQuery.isFetching}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-xs font-semibold text-cyan-950 hover:bg-cyan-50 disabled:opacity-60"
        >
          <RefreshCw
            className={playbackQuery.isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
            aria-hidden={true}
          />
          Làm mới liên kết phát
        </button>
      </div>

      <QueryState
        isLoading={playbackQuery.isLoading}
        isError={playbackQuery.isError}
        error={playbackQuery.error}
        onRetry={() => void playbackQuery.refetch()}
        loadingLabel="Đang lấy liên kết phát âm thanh..."
      >
        <figure className="space-y-2">
          <figcaption id={captionId} className="text-sm font-semibold text-slate-900">
            {title}
          </figcaption>

          {hasUnsafeUrl ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-950"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-700" aria-hidden={true} />
              <span>Liên kết âm thanh không hợp lệ hoặc không an toàn để phát.</span>
            </div>
          ) : safeStreamUrl ? (
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={safeStreamUrl}
              aria-labelledby={captionId}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleRefreshLink}
              className="w-full"
            />
          ) : (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <audio
                ref={audioRef}
                controls
                preload="none"
                aria-labelledby={captionId}
                className="w-full"
              />
              <p className="text-xs text-slate-600">
                Trình phát đã xác thực asset <code className="font-mono">{assetId}</code>.
                Chế độ dữ liệu giả lập không đính kèm tệp âm thanh trực tuyến; khi kết nối backend
                sẽ tự động phát trực tiếp qua signed stream URL.
              </p>
            </div>
          )}

          {data ? (
            <p className="text-xs text-slate-600">
              Định dạng: <span className="font-medium">{data.mimeType}</span>
              {typeof data.durationSeconds === "number"
                ? ` · Thời lượng: ${Math.floor(data.durationSeconds / 60)}:${String(
                    data.durationSeconds % 60,
                  ).padStart(2, "0")}`
                : ""}{" "}
              · Liên kết hết hạn lúc: {formatVnDateTime(data.expiresAt)}
            </p>
          ) : null}
        </figure>
      </QueryState>
    </section>
  );
}

