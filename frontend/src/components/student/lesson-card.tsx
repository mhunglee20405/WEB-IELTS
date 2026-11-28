import { ExternalLink, ShieldAlert, User, Video } from "lucide-react";
import { MetaTag, StatusBadge } from "@/components/ui";
import type { Lesson } from "@/lib/api/types";
import { isHttpsUrl } from "@/lib/sanitize/html";
import { formatVnDate, formatVnTime } from "@/lib/time/vn-time";

export interface LessonCardProps {
  lesson: Lesson;
  timeZone?: string;
}

const LESSON_TYPE_LABEL: Record<string, string> = {
  live_meet: "Live Google Meet",
  workshop: "Workshop kỹ năng",
  review: "Buổi chữa bài",
};

export function LessonCard({ lesson, timeZone = "Asia/Ho_Chi_Minh" }: LessonCardProps) {
  const safeMeetUrl =
    lesson.meetUrl && isHttpsUrl(lesson.meetUrl) ? lesson.meetUrl : null;
  const lessonStatus = lesson.status ?? "scheduled";
  const canJoinMeet = Boolean(safeMeetUrl && lessonStatus !== "cancelled");

  const startTimeIso = lesson.startTime || lesson.startAt;
  const endTimeIso = lesson.endTime || lesson.endAt;
  const descriptionText = lesson.description || lesson.content;

  const hasValidStart = Boolean(startTimeIso && !Number.isNaN(Date.parse(startTimeIso)));
  const hasValidEnd = Boolean(endTimeIso && !Number.isNaN(Date.parse(endTimeIso)));

  const typeLabel = (lesson.type && LESSON_TYPE_LABEL[lesson.type]) || "Buổi học trực tuyến";

  return (
    <article className="lms-card lms-card-split">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MetaTag variant="format">
            <Video className="h-3.5 w-3.5" aria-hidden={true} />
            {typeLabel}
          </MetaTag>
          {lesson.courseTitle ? (
            <span className="text-xs font-medium text-slate-700">{lesson.courseTitle}</span>
          ) : null}
          <StatusBadge status={lessonStatus} />
        </div>

        <h3 className="text-base font-semibold text-slate-900">{lesson.title}</h3>

        {descriptionText ? (
          <p className="text-sm text-slate-600">{descriptionText}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>
            Thời gian:{" "}
            {hasValidStart && hasValidEnd ? (
              <strong className="font-semibold text-slate-800">
                {formatVnDate(startTimeIso!, timeZone)} ·{" "}
                {formatVnTime(startTimeIso!, timeZone)} –{" "}
                {formatVnTime(endTimeIso!, timeZone)}
              </strong>
            ) : hasValidStart ? (
              <strong className="font-semibold text-slate-800">
                {formatVnDate(startTimeIso!, timeZone)} · {formatVnTime(startTimeIso!, timeZone)}
              </strong>
            ) : (
              <strong className="font-semibold text-amber-700">Chưa xác định thời gian</strong>
            )}{" "}
            (GMT+7)
          </span>
          {lesson.teacherName ? (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-slate-600" aria-hidden={true} />
              Giáo viên: {lesson.teacherName}
            </span>
          ) : null}
        </div>

        {lesson.meetUrl && !safeMeetUrl ? (
          <p className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden={true} />
            Liên kết Google Meet bị chặn do không đúng định dạng HTTPS an toàn.
          </p>
        ) : null}
      </div>

      {canJoinMeet && safeMeetUrl ? (
        <div className="shrink-0">
          <a
            href={safeMeetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            Vào lớp Google Meet
            <ExternalLink className="h-4 w-4" aria-hidden={true} />
            <span className="sr-only">: {lesson.title} (mở trong tab mới)</span>
          </a>
        </div>
      ) : null}
    </article>
  );
}
