import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coursesApi } from "./endpoints/courses";
import { CourseSchema } from "./schemas";

describe("CourseSchema & coursesApi Backend-to-Frontend Normalization Contract", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:4000/api/v1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("normalizes raw Backend Course document fields (_id, populated teacherId, type, startAt/endAt Date or ISO)", () => {
    const rawFromBackend = {
      _id: "65f123456789abcdef012345",
      code: "IELTS-1ON1-75",
      title: "Coaching 1:1 Band 7.5",
      description: "Kèm 1:1 Reading & Listening",
      type: "one_to_one",
      startBand: 6.0,
      targetBand: 7.5,
      teacherId: {
        _id: "65f999999999999999999999",
        fullName: "Cô Trần Lan Hương",
        email: "huong@ielts.vn",
      },
      status: "active",
      startAt: new Date("2026-10-15T00:00:00.000Z"),
      endAt: "2027-02-01T00:00:00.000Z",
      createdAt: new Date("2026-10-01T08:00:00.000Z"),
    };

    const parsed = CourseSchema.parse(rawFromBackend);

    expect(parsed.id).toBe("65f123456789abcdef012345");
    expect(parsed.teacherId).toBe("65f999999999999999999999");
    expect(parsed.teacherName).toBe("Cô Trần Lan Hương");
    expect(parsed.courseType).toBe("1:1");
    expect(parsed.startDate).toBe("2026-10-15T00:00:00.000Z");
    expect(parsed.endDate).toBe("2027-02-01T00:00:00.000Z");
    expect(parsed.createdAt).toBe("2026-10-01T08:00:00.000Z");
    expect(parsed.timezone).toBe("Asia/Ho_Chi_Minh");
  });

  it("normalizes coursesApi.create() response with _id and startAt/endAt so created.id is always defined", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _id: "65f000000000000000000777",
          code: "IELTS-NEW-101",
          title: "Khóa 1:1 Mới",
          type: "one_to_one",
          startBand: 5.5,
          targetBand: 7.0,
          teacherId: "65f999999999999999999999",
          status: "active",
          startAt: "2026-11-01T00:00:00.000Z",
          endAt: "2027-01-31T00:00:00.000Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const created = await coursesApi.create({
      code: "IELTS-NEW-101",
      title: "Khóa 1:1 Mới",
      courseType: "1:1",
      startBand: 5.5,
      targetBand: 7.0,
      teacherId: "65f999999999999999999999",
      status: "active",
      startDate: "2026-11-01",
      endDate: "2027-01-31",
    });

    expect(created.id).toBe("65f000000000000000000777");
    expect(created.courseType).toBe("1:1");
    expect(created.startDate).toBe("2026-11-01T00:00:00.000Z");
    expect(created.endDate).toBe("2027-01-31T00:00:00.000Z");
  });

  it("normalizes coursesApi.getById() populated teacherId, type, startAt/endAt", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _id: "65f000000000000000000888",
          code: "IELTS-1ON1-PRO",
          title: "Lớp 1:1 Chuyên sâu",
          type: "one_to_one",
          startBand: 6.0,
          targetBand: 7.5,
          teacherId: {
            _id: "65f111111111111111111111",
            fullName: "Thầy Lê Mạnh Hùng",
            email: "teacher@ielts.vn",
          },
          status: "active",
          startAt: "2026-10-15T00:00:00.000Z",
          endAt: "2027-02-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const course = await coursesApi.getById("65f000000000000000000888");

    expect(course.id).toBe("65f000000000000000000888");
    expect(course.teacherId).toBe("65f111111111111111111111");
    expect(course.teacherName).toBe("Thầy Lê Mạnh Hùng");
    expect(course.courseType).toBe("1:1");
    expect(course.startDate?.slice(0, 10)).toBe("2026-10-15");
    expect(course.endDate?.slice(0, 10)).toBe("2027-02-01");
  });

  it("normalizes coursesApi.list() and coursesApi.listMine() items and computes totalPages when omitted", async () => {
    const rawListPayload = {
      items: [
        {
          _id: "crs-be-1",
          code: "IELTS-1V1",
          title: "Course 1:1",
          type: "one_to_one",
          teacherId: "tch-1",
          teacherName: "Giáo viên A",
          status: "active",
          startAt: "2026-11-10T00:00:00.000Z",
          endAt: "2026-12-20T00:00:00.000Z",
        },
        {
          _id: "crs-be-2",
          code: "IELTS-GRP",
          title: "Course Group",
          type: "group",
          teacherId: { _id: "tch-2", fullName: "Giáo viên B", email: "b@ielts.vn" },
          status: "upcoming",
          startAt: "2026-12-01T00:00:00.000Z",
        },
      ],
      total: 2,
      page: 1,
      limit: 15,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(rawListPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(rawListPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const listRes = await coursesApi.list({ page: 1, limit: 15 });
    expect(listRes.totalPages).toBe(1);
    expect(listRes.items[0]?.id).toBe("crs-be-1");
    expect(listRes.items[0]?.courseType).toBe("1:1");
    expect(listRes.items[0]?.startDate).toBe("2026-11-10T00:00:00.000Z");
    expect(listRes.items[0]?.endDate).toBe("2026-12-20T00:00:00.000Z");
    expect(listRes.items[1]?.courseType).toBe("group");
    expect(listRes.items[1]?.teacherId).toBe("tch-2");
    expect(listRes.items[1]?.teacherName).toBe("Giáo viên B");

    const mineRes = await coursesApi.listMine({ page: 1, limit: 15 });
    expect(mineRes.items[0]?.courseType).toBe("1:1");
    expect(mineRes.items[1]?.courseType).toBe("group");
  });

  it("normalizes coursesApi.update() response and omits teacherId from PATCH body when undefined", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          _id: "crs-upd-1",
          code: "IELTS-UPD",
          title: "Updated 1:1 Course",
          type: "one_to_one",
          teacherId: { _id: "tch-1", fullName: "Giáo viên A" },
          status: "active",
          startAt: "2026-11-01T00:00:00.000Z",
          endAt: "2027-01-01T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const updated = await coursesApi.update("crs-upd-1", {
      title: "Updated 1:1 Course",
      courseType: "1:1",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect("teacherId" in sentBody).toBe(false);
    expect(updated.id).toBe("crs-upd-1");
    expect(updated.courseType).toBe("1:1");
    expect(updated.teacherId).toBe("tch-1");
    expect(updated.startDate).toBe("2026-11-01T00:00:00.000Z");
  });
});
