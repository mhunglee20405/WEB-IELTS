"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Headphones,
  Lock,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Square,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveBackendMediaUrl } from "@/lib/api/client";
import { mediaApi } from "@/lib/api/endpoints/media";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import { isMockApiMode } from "@/lib/env";
import { isSafeAudioStreamUrl } from "@/lib/sanitize/html";
import type { ExamAudioAssetPublic } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";

export interface ExamListeningPlayerProps {
  sectionTitle: string;
  audioAsset?: ExamAudioAssetPublic;
  disabled?: boolean;
  compact?: boolean;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ExamListeningPlayer({
  sectionTitle,
  audioAsset,
  disabled = false,
  compact = false,
}: ExamListeningPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const soundCheckRef = useRef<HTMLAudioElement | null>(null);
  const lastAllowedTimeRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [noticeEntry, setNoticeEntry] = useState<{ assetId: string; text: string } | null>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isPlayingSoundCheck, setIsPlayingSoundCheck] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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

  const rawStreamUrl = resolveBackendMediaUrl(
    audioAsset?.playbackUrl || playbackQuery.data?.streamUrl || "",
  );
  const resolvedUrl =
    rawStreamUrl && isSafeAudioStreamUrl(rawStreamUrl, isMockApiMode()) ? rawStreamUrl : "";
  const hasUnsafeUrl = Boolean(rawStreamUrl && !resolvedUrl);
  const allowPause = audioAsset?.allowPause ?? true;
  const allowSeek = audioAsset?.allowSeek ?? true;
  const maxPlayCount = audioAsset?.maxPlayCount ?? null;
  const isPlayLimitReached =
    maxPlayCount !== null && maxPlayCount > 0 && playCount >= maxPlayCount;

  const totalDuration = duration || audioAsset?.durationSeconds || playbackQuery.data?.durationSeconds || 0;
  const progressPercent =
    totalDuration > 0 ? Math.min(100, Math.max(0, (currentTime / totalDuration) * 100)) : 0;

  useEffect(() => {
    lastAllowedTimeRef.current = 0;
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
  }, [assetId]);

  useEffect(() => {
    return () => {
      if (soundCheckRef.current) {
        soundCheckRef.current.pause();
        soundCheckRef.current = null;
      }
    };
  }, []);

  const handleTogglePlay = () => {
    const el = audioRef.current;
    if (!el || disabled || isPlayLimitReached) return;

    if (isPlaying) {
      if (!allowPause) {
        setPlaybackNotice("Bài thi quy định không tạm dừng giữa chừng.");
        return;
      }
      el.pause();
    } else {
      if (isPlayingSoundCheck) {
        soundCheckRef.current?.pause();
        setIsPlayingSoundCheck(false);
      }
      void el.play().catch(() => {
        setPlaybackNotice("Không thể tự động phát âm thanh trên trình duyệt này. Vui lòng thử lại.");
      });
    }
  };

  const handleScrub = (nextTime: number) => {
    const el = audioRef.current;
    if (!el || disabled || isPlayLimitReached) return;
    if (!allowSeek) {
      setPlaybackNotice("Phần thi này không cho phép tua audio.");
      return;
    }
    el.currentTime = nextTime;
    lastAllowedTimeRef.current = nextTime;
    setCurrentTime(nextTime);
  };

  const handleVolumeChange = (newVal: number) => {
    setVolume(newVal);
    const muted = newVal === 0;
    setIsMuted(muted);
    if (audioRef.current) {
      audioRef.current.volume = newVal;
      audioRef.current.muted = muted;
    }
    if (soundCheckRef.current) {
      soundCheckRef.current.volume = newVal;
      soundCheckRef.current.muted = muted;
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      const restored = volume === 0 ? 0.8 : volume;
      setIsMuted(false);
      setVolume(restored);
      if (audioRef.current) {
        audioRef.current.muted = false;
        audioRef.current.volume = restored;
      }
      if (soundCheckRef.current) {
        soundCheckRef.current.muted = false;
        soundCheckRef.current.volume = restored;
      }
    } else {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.muted = true;
      if (soundCheckRef.current) soundCheckRef.current.muted = true;
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setSettingsOpen(false);
  };

  const handleSoundCheck = () => {
    if (isPlayingSoundCheck) {
      soundCheckRef.current?.pause();
      if (soundCheckRef.current) soundCheckRef.current.currentTime = 0;
      setIsPlayingSoundCheck(false);
    } else {
      audioRef.current?.pause();
      if (!soundCheckRef.current) {
        soundCheckRef.current = new Audio("/audio/sound-check.wav");
        soundCheckRef.current.onended = () => setIsPlayingSoundCheck(false);
        soundCheckRef.current.onerror = () => setIsPlayingSoundCheck(false);
      }
      soundCheckRef.current.volume = isMuted ? 0 : volume;
      soundCheckRef.current.currentTime = 0;
      void soundCheckRef.current
        .play()
        .then(() => setIsPlayingSoundCheck(true))
        .catch(() => setIsPlayingSoundCheck(false));
    }
  };

  if (!assetId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
        Phần nghe này chưa được gắn tệp âm thanh.
      </div>
    );
  }

  return (
    <div
      data-testid="exam-listening-player"
      className={cn(
        "w-full",
        compact
          ? "space-y-2"
          : "rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 space-y-2",
      )}
    >
      {/* Hidden native audio element driving playback cleanly */}
      {resolvedUrl && !playbackQuery.isError && (
        <audio
          ref={audioRef}
          preload="metadata"
          controlsList={!allowSeek ? "nodownload noplaybackrate" : "nodownload"}
          src={resolvedUrl}
          className="sr-only"
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            if (audioRef.current) {
              audioRef.current.volume = isMuted ? 0 : volume;
              audioRef.current.playbackRate = playbackRate;
            }
          }}
          onPlay={() => {
            if (disabled || isPlayLimitReached) {
              audioRef.current?.pause();
              return;
            }
            setIsPlaying(true);
            if (lastAllowedTimeRef.current === 0) {
              setPlayCount((c) => c + 1);
            }
          }}
          onPause={(e) => {
            const el = e.currentTarget;
            if (!allowPause && !el.ended && !disabled) {
              setPlaybackNotice("Bài thi quy định không tạm dừng giữa chừng.");
              void el.play().catch(() => {
                setIsPlaying(false);
              });
              return;
            }
            setIsPlaying(false);
          }}
          onTimeUpdate={(e) => {
            lastAllowedTimeRef.current = e.currentTarget.currentTime;
            setCurrentTime(e.currentTarget.currentTime);
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
            setCurrentTime(0);
            setIsPlaying(false);
          }}
        >
          Trình duyệt của bạn không hỗ trợ phát audio HTML5.
        </audio>
      )}

      {/* Status & Error Alerts */}
      {playbackQuery.isLoading && (
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
          Đang cấp đường dẫn phát âm thanh an toàn...
        </div>
      )}

      {playbackQuery.isError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{getFriendlyErrorMessage(playbackQuery.error)}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void playbackQuery.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Thử tải lại audio
          </Button>
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

      {isPlayingSoundCheck && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
            </span>
            <span>Đang phát âm thanh kiểm tra tai nghe (Sound Check)...</span>
          </div>
          <button
            type="button"
            onClick={handleSoundCheck}
            className="font-semibold text-rose-700 hover:underline"
          >
            Dừng
          </button>
        </div>
      )}

      {/* Main 100% Width CBT Audio Bar */}
      {isPlayLimitReached ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          Đã sử dụng hết tối đa {maxPlayCount} lượt phát cho phần thi này.
        </div>
      ) : (
        <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-2xs">
          {/* Play / Pause Button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={disabled || !resolvedUrl || playbackQuery.isError}
            aria-label={isPlaying ? "Tạm dừng audio" : "Phát audio"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            )}
          </button>

          {/* Progress Slider occupying majority of horizontal width */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative flex flex-1 items-center">
              <input
                type="range"
                min={0}
                max={totalDuration > 0 ? totalDuration : 100}
                step={0.5}
                value={totalDuration > 0 ? currentTime : 0}
                disabled={disabled || !resolvedUrl || totalDuration <= 0}
                onChange={(e) => handleScrub(parseFloat(e.target.value))}
                aria-label={`Tiến độ phát ${sectionTitle}`}
                style={{
                  background: `linear-gradient(to right, #2563eb ${progressPercent}%, #e2e8f0 ${progressPercent}%)`,
                }}
                className={cn(
                  "h-1.5 w-full appearance-none rounded-full accent-blue-600 focus:outline-hidden",
                  allowSeek ? "cursor-pointer" : "cursor-not-allowed opacity-85",
                )}
              />
            </div>

            {/* Time Display */}
            <span className="shrink-0 text-xs font-semibold text-slate-600 tabular-nums">
              {formatAudioTime(currentTime)} / {formatAudioTime(totalDuration)}
            </span>
          </div>

          {/* Volume Control Cluster */}
          <div className="hidden items-center gap-1.5 border-l border-slate-200 pl-3 sm:flex">
            <button
              type="button"
              onClick={toggleMute}
              className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden"
              aria-label={isMuted ? "Bật âm thanh" : "Tắt tiếng"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-rose-500" />
              ) : volume < 0.5 ? (
                <Volume1 className="h-4 w-4 text-slate-700" />
              ) : (
                <Volume2 className="h-4 w-4 text-slate-700" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Điều chỉnh âm lượng"
              className="h-1.5 w-16 cursor-pointer accent-blue-600"
            />
          </div>

          {/* Speed & Audio Settings Popover */}
          <div className="relative shrink-0 border-l border-slate-200 pl-2">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="Cài đặt tốc độ phát và kiểm tra tai nghe"
              aria-expanded={settingsOpen}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Settings className="h-4 w-4" />
              {playbackRate !== 1 && <span className="tabular-nums">{playbackRate}x</span>}
            </button>

            {settingsOpen && (
              <div
                role="dialog"
                aria-label="Cài đặt phát âm thanh"
                className="absolute right-0 top-10 z-40 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg space-y-3"
              >
                <div>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Tốc độ phát
                  </p>
                  <div className="grid grid-cols-4 gap-1">
                    {SPEED_OPTIONS.map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        disabled={!allowSeek && spd !== 1}
                        onClick={() => handleSpeedChange(spd)}
                        className={cn(
                          "rounded-md py-1 text-xs font-semibold transition-colors",
                          playbackRate === spd
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40",
                        )}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSoundCheck();
                      setSettingsOpen(false);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    {isPlayingSoundCheck ? (
                      <>
                        <Square className="h-3.5 w-3.5 fill-current text-rose-600" />
                        <span>Dừng kiểm tra tai nghe</span>
                      </>
                    ) : (
                      <>
                        <Headphones className="h-3.5 w-3.5 text-blue-600" />
                        <span>Kiểm tra tai nghe</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtle CBT Rules Metadata Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-500">
        <span>
          <strong className="font-semibold text-slate-700">{sectionTitle}</strong> ·{" "}
          {allowSeek ? "Cho phép tua" : "Không cho phép tua"} ·{" "}
          {allowPause ? "Cho phép tạm dừng" : "Chạy liên tục không tạm dừng"}
          {maxPlayCount !== null && ` · Lượt nghe: ${playCount}/${maxPlayCount}`}
        </span>
        {playbackNotice && (
          <span role="status" aria-live="polite" className="font-semibold text-amber-700">
            {playbackNotice}
          </span>
        )}
      </div>
    </div>
  );
}
