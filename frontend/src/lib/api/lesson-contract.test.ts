import { describe, expect, it } from "vitest";
import { LessonSchema } from "./schemas";
import type { Lesson } from "./types";
import { DEFAULT_TIMEZONE, getZonedDateParts } from "@/lib/time/vn-time";

describe("LessonSchema & Calendar Normalization Contract", () => {
  it("normalizes canonical Backend payload with startAt, endAt, content and populated courseId", () => {
    const rawBackend = {
      id: "les-01",
      courseId: {
        _id: "crs-01",
        code: "IELTS-MASTER-01",
        title: "IELTS Masterclass 7.0",
        teacherId: {
          _id: "usr-teacher-1",
          fullName: "Thầy Lê Mạnh Hùng",
        },
      },
      title: "Reading Skimming & Scanning Masterclass",
      startAt: "2026-11-15T12:30:00.000Z",
      endAt: "2026-11-15T14:30:00.000Z",
      content: "Detailed analysis of TFNG strategies.",
      meetUrl: "https://meet.google.com/abc-defg-hij",
      status: "scheduled",
    };

    const parsed = LessonSchema.parse(rawBackend);

    expect(parsed.id).toBe("les-01");
    expect(parsed.courseId).toBe("crs-01");
    expect(parsed.courseTitle).toBe("IELTS Masterclass 7.0");
    expect(parsed.teacherName).toBe("Thầy Lê Mạnh Hùng");
    expect(parsed.startTime).toBe("2026-11-15T12:30:00.000Z");
    expect(parsed.endTime).toBe("2026-11-15T14:30:00.000Z");
    expect(parsed.description).toBe("Detailed analysis of TFNG strategies.");
    expect(parsed.type).toBe("live_meet");
    expect(parsed.status).toBe("scheduled");
  });

  it("handles string courseId without populated object", () => {
    const raw = {
      id: "les-02",
      courseId: "crs-999",
      title: "Workshop Writing Task 2",
      startAt: "2026-11-16T13:00:00.000Z",
      endAt: "2026-11-16T14:30:00.000Z",
    };

    const parsed = LessonSchema.parse(raw);
    expect(parsed.courseId).toBe("crs-999");
    expect(parsed.type).toBe("workshop");
    expect(parsed.startTime).toBe("2026-11-16T13:00:00.000Z");
  });

  it("normalizes Date objects for startAt and endAt", () => {
    const raw = {
      id: "les-03",
      courseId: "crs-01",
      title: "Speaking Coaching 1:1",
      startAt: new Date("2026-11-17T10:00:00.000Z"),
      endAt: new Date("2026-11-17T11:00:00.000Z"),
      meetUrl: "https://meet.google.com/xyz-1234-uvw",
    };

    const parsed = LessonSchema.parse(raw);
    expect(parsed.startTime).toBe("2026-11-17T10:00:00.000Z");
    expect(parsed.endTime).toBe("2026-11-17T11:00:00.000Z");
    expect(parsed.type).toBe("live_meet");
  });

  it("fails validation when startAt / startTime is missing (never generates fake timestamps)", () => {
    const rawMissingStart = {
      id: "les-04",
      courseId: "crs-01",
      title: "Corrupt Lesson with no start time",
      endAt: "2026-11-17T11:00:00.000Z",
    };

    const res = LessonSchema.safeParse(rawMissingStart);
    expect(res.success).toBe(false);
  });

  it("fails validation when date string is invalid", () => {
    const rawInvalidDate = {
      id: "les-05",
      courseId: "crs-01",
      title: "Corrupt Lesson with invalid date string",
      startAt: "not-a-valid-date",
      endAt: "2026-11-17T11:00:00.000Z",
    };

    const res = LessonSchema.safeParse(rawInvalidDate);
    expect(res.success).toBe(false);
  });

  it("fails validation when endTime <= startTime", () => {
    const rawReversedTimes = {
      id: "les-06",
      courseId: "crs-01",
      title: "Reversed time lesson",
      startAt: "2026-11-17T15:00:00.000Z",
      endAt: "2026-11-17T14:00:00.000Z",
    };

    const res = LessonSchema.safeParse(rawReversedTimes);
    expect(res.success).toBe(false);
  });

  it("correctly groups and localizes lessons into Asia/Ho_Chi_Minh timezone", () => {
    // 2026-11-15T19:30:00+07:00 is 2026-11-15T12:30:00.000Z
    const raw = {
      id: "les-vn-01",
      courseId: "crs-01",
      title: "Buổi tối theo giờ Việt Nam",
      startAt: "2026-11-15T12:30:00.000Z",
      endAt: "2026-11-15T14:30:00.000Z",
    };

    const lesson: Lesson = LessonSchema.parse(raw);
    const dateParts = getZonedDateParts(lesson.startTime, DEFAULT_TIMEZONE);

    expect(dateParts.dateKey).toBe("2026-11-15");
    expect(dateParts.hour).toBe(19);
    expect(dateParts.minute).toBe(30);
  });
});

