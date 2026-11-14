import { getMonthKeyInTimezone, getVnDailyWindowSync, getZonedDateParts } from "@/lib/time/vn-time";
import { ApiError } from "../error";
import {
  MAX_EXTENSIONS_PER_MONTH,
  PASS_SCORE_THRESHOLD,
  type CreateAssignmentRequest,
  type CreateCourseRequest,
  type CreateExerciseRequest,
  type CreateExtensionRequest,
  type CreateLessonRequest,
  type CreateUserRequest,
  type ExtensionDecisionRequest,
  type LoginRequest,
  type PaginatedResponse,
  type ReversePenaltyRequest,
  type ReviewTranslationRequest,
  type SubmissionResult,
  type SubmitAnswersRequest,
  type SubmitTranslationRequest,
  type UpdateAssignmentRequest,
  type UpdateCourseRequest,
  type UpdateExerciseRequest,
  type UpdateLessonRequest,
  type UpdateUserRequest,
} from "../types";
import {
  buildStudentAssignmentDetail,
  createInitialMockState,
  type MockStoreState,
} from "./data";
import { dispatchExamV2MockRequest } from "./exam-v2";

export interface MockDispatchOptions {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  accessToken?: string | null;
}

let mockState: MockStoreState = createInitialMockState();

export function resetMockStore(): void {
  mockState = createInitialMockState();
}

function paginate<T>(items: T[], searchParams: URLSearchParams): PaginatedResponse<T> {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") ?? 10)));
  const start = (page - 1) * limit;
  const sliced = items.slice(start, start + limit);
  return {
    items: sliced,
    page,
    limit,
    total: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / limit)),
  };
}

function notFound(message = "Không tìm thấy tài nguyên."): never {
  throw new ApiError({
    statusCode: 404,
    code: "NOT_FOUND",
    message,
    requestId: `mock-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });
}

function getCurrentUser() {
  return (
    mockState.users.find((u) => u.id === mockState.currentUserId) ?? mockState.users[0]!
  );
}

export async function dispatchMockRequest<T>(options: MockDispatchOptions): Promise<T> {
  const method = options.method.toUpperCase();
  const url = new URL(options.path, "http://mock.local");
  const pathname = url.pathname;
  const sp = url.searchParams;

  // Auth routes
  if (method === "POST" && pathname === "/auth/login") {
    const body = options.body as LoginRequest;
    const matched = mockState.users.find(
      (u) => u.email.toLowerCase() === body.email.trim().toLowerCase(),
    );
    if (!matched || body.password.length < 6) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
        message: "Email hoặc mật khẩu không đúng.",
        requestId: "mock-login-401",
        timestamp: new Date().toISOString(),
      });
    }
    mockState.currentUserId = matched.id;
    return {
      user: matched,
      tokens: {
        accessToken: `mock-access-${matched.id}`,
        refreshToken: `mock-refresh-${matched.id}`,
        expiresIn: 3600,
      },
    } as T;
  }

  if (method === "POST" && pathname === "/auth/refresh") {
    const user = getCurrentUser();
    return {
      accessToken: `mock-access-${user.id}-${Date.now()}`,
      refreshToken: `mock-refresh-${user.id}`,
      expiresIn: 3600,
    } as T;
  }

  if (method === "POST" && pathname === "/auth/logout") {
    return { ok: true } as T;
  }

  if (method === "POST" && (pathname === "/auth/forgot-password" || pathname === "/auth/reset-password")) {
    return { ok: true } as T;
  }

  if (method === "GET" && pathname === "/auth/me") {
    const token = options.accessToken;
    if (!token) {
      throw new ApiError({
        statusCode: 401,
        code: "UNAUTHORIZED",
        message: "Phiên đăng nhập chưa được khởi tạo hoặc đã hết hạn.",
        requestId: "mock-me-401",
        timestamp: new Date().toISOString(),
      });
    }
    const prefixMatch = /^mock-access-([a-z0-9-]+)/i.exec(token);
    if (prefixMatch?.[1]) {
      const matched = mockState.users.find((u) => token.startsWith(`mock-access-${u.id}`));
      if (matched) {
        mockState.currentUserId = matched.id;
        return matched as T;
      }
    }
    return getCurrentUser() as T;
  }

  // Profiles
  if (method === "GET" && pathname === "/students/me/profile") {
    const user = getCurrentUser();
    const activePenaltiesCount = mockState.penalties.filter(
      (p) => p.studentId === user.id && !p.reversed,
    ).length;
    const currentMonth = getMonthKeyInTimezone(new Date());
    const extensionsUsedThisMonth = mockState.extensions.filter(
      (e) => e.studentId === user.id && getMonthKeyInTimezone(e.createdAt) === currentMonth,
    ).length;
    return {
      user,
      targetBand: 7.0,
      enrolledCoursesCount: mockState.courses.length,
      activePenaltiesCount,
      extensionsUsedThisMonth,
      maxExtensionsPerMonth: MAX_EXTENSIONS_PER_MONTH,
    } as T;
  }

  if (method === "GET" && pathname === "/teachers/me/profile") {
    const user = getCurrentUser();
    return {
      user,
      specialization: "IELTS Academic Reading & Listening",
      activeCoursesCount: mockState.courses.filter((c) => c.status === "active").length,
      pendingExtensionsCount: mockState.extensions.filter((e) => e.status === "pending").length,
      pendingTranslationsCount: Object.values(mockState.translations).filter(
        (tr) => tr.status === "submitted",
      ).length,
    } as T;
  }

  // Dashboards
  if (method === "GET" && pathname === "/dashboard/student") {
    const user = getCurrentUser();
    const todayKey = getZonedDateParts(new Date()).dateKey;
    const nowMs = Date.now();
    const currentMonth = getMonthKeyInTimezone(new Date());
    const extensionsUsedThisMonth = mockState.extensions.filter(
      (e) => e.studentId === user.id && getMonthKeyInTimezone(e.createdAt) === currentMonth,
    ).length;

    const mineAssignments = mockState.studentAssignments.filter(
      (sa) => !sa.studentId || sa.studentId === user.id,
    );
    const todayExercises = mineAssignments.filter(
      (sa) => sa.assignedDate === todayKey,
    );
    const upcomingDeadlines = mineAssignments.filter(
      (sa) => !sa.passed && Date.parse(sa.openAt) <= nowMs,
    );
    const upcomingLessons = [...mockState.lessons]
      .filter((l) => l.status !== "cancelled" && Date.parse(l.endTime) >= nowMs)
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
    const recentScores = mineAssignments
      .filter((sa) => sa.bestScore !== null)
      .map((sa) => ({
        studentAssignmentId: sa.studentAssignmentId,
        title: sa.title,
        exerciseType: sa.exerciseType,
        score: sa.bestScore ?? 0,
        passed: sa.passed,
      }));

    return {
      todayExercises,
      upcomingDeadlines,
      upcomingLessons,
      recentScores,
      activePenaltiesCount: mockState.penalties.filter((p) => !p.reversed).length,
      extensionsUsedThisMonth,
      maxExtensionsPerMonth: MAX_EXTENSIONS_PER_MONTH,
      unreadNotificationsCount: mockState.notifications.filter((n) => !n.read).length,
    } as T;
  }

  if (method === "GET" && pathname === "/dashboard/teacher") {
    return {
      activeCoursesCount: mockState.courses.filter((c) => c.status === "active").length,
      pendingExtensionsCount: mockState.extensions.filter((e) => e.status === "pending").length,
      pendingTranslationsCount: Object.values(mockState.translations).filter(
        (tr) => tr.status === "submitted",
      ).length,
      overdueStudentsCount: mockState.studentAssignments.filter((sa) => sa.status === "overdue")
        .length,
      recentAssignments: mockState.assignments,
      upcomingLessons: mockState.lessons,
    } as T;
  }

  // Users
  if (method === "GET" && pathname === "/users") {
    const role = sp.get("role");
    const status = sp.get("status");
    const search = sp.get("search")?.trim().toLowerCase();
    let list = mockState.users;
    if (role) {
      list = list.filter((u) => u.roles.includes(role as "student" | "teacher" | "admin"));
    }
    if (status) {
      list = list.filter((u) => u.status === status);
    }
    if (search) {
      list = list.filter(
        (u) =>
          u.fullName.toLowerCase().includes(search) ||
          u.email.toLowerCase().includes(search) ||
          u.id.toLowerCase().includes(search),
      );
    }
    return paginate(list, sp) as T;
  }
  if (method === "POST" && pathname === "/users") {
    const body = options.body as CreateUserRequest;
    const duplicate = mockState.users.some(
      (u) => u.email.toLowerCase() === body.email.trim().toLowerCase(),
    );
    if (duplicate) {
      throw new ApiError({
        statusCode: 409,
        code: "EMAIL_ALREADY_EXISTS",
        message: "Email này đã được đăng ký trong hệ thống.",
        requestId: `mock-${Date.now()}`,
      });
    }
    const created = {
      id: `usr-${Date.now()}`,
      email: body.email.trim(),
      fullName: body.fullName.trim(),
      roles: body.roles,
      status: "active" as const,
      timezone: body.timezone ?? "Asia/Ho_Chi_Minh",
      createdAt: new Date().toISOString(),
    };
    mockState.users.unshift(created);
    return created as T;
  }
  if (pathname.startsWith("/users/")) {
    const id = pathname.split("/")[2]!;
    const user = mockState.users.find((u) => u.id === id);
    if (!user) notFound("Không tìm thấy người dùng.");
    if (method === "GET") return user as T;
    if (method === "PATCH") {
      Object.assign(user, options.body as UpdateUserRequest);
      return user as T;
    }
  }

  // Courses & Course Students
  if (method === "GET" && pathname === "/courses") {
    const status = sp.get("status");
    const search = sp.get("search")?.trim().toLowerCase();
    let list = mockState.courses;
    if (status) {
      list = list.filter((c) => c.status === status);
    }
    if (search) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(search) ||
          c.code.toLowerCase().includes(search) ||
          (c.teacherName?.toLowerCase().includes(search) ?? false),
      );
    }
    return paginate(list, sp) as T;
  }
  if (method === "POST" && pathname === "/courses") {
    const body = options.body as CreateCourseRequest;
    if (
      body.startBand !== undefined &&
      body.targetBand !== undefined &&
      body.startBand > body.targetBand
    ) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_COURSE_BANDS",
        message: "Band điểm xuất phát không được lớn hơn band mục tiêu.",
        requestId: `mock-${Date.now()}`,
      });
    }
    const created = {
      id: `crs-${Date.now()}`,
      code: body.code,
      title: body.title,
      description: body.description,
      courseType: body.courseType ?? "group",
      startBand: body.startBand,
      targetBand: body.targetBand,
      teacherId: body.teacherId,
      teacherName: mockState.users.find((u) => u.id === body.teacherId)?.fullName,
      status: "active" as const,
      timezone: body.timezone ?? "Asia/Ho_Chi_Minh",
      studentCount: 0,
      startDate: body.startDate,
      endDate: body.endDate,
      createdAt: new Date().toISOString(),
    };
    mockState.courses.unshift(created);
    mockState.courseStudents[created.id] = [];
    return created as T;
  }
  const courseStudentsMatch = /^\/courses\/([^/]+)\/students(?:\/([^/]+))?$/.exec(pathname);
  if (courseStudentsMatch) {
    const courseId = courseStudentsMatch[1]!;
    const studentId = courseStudentsMatch[2];
    const course = mockState.courses.find((c) => c.id === courseId);
    if (!course) notFound("Không tìm thấy khóa học.");
    const list = (mockState.courseStudents[courseId] ??= []);
    if (method === "GET") return paginate(list, sp) as T;
    if (method === "POST") {
      const body = options.body as { studentId: string };
      const student = mockState.users.find(
        (u) => u.id === body.studentId && u.roles.includes("student"),
      );
      if (!student) notFound("Không tìm thấy học viên hợp lệ.");
      if (list.some((s) => s.studentId === student.id && s.status === "active")) {
        throw new ApiError({
          statusCode: 409,
          code: "ALREADY_ENROLLED",
          message: "Học viên này đã được ghi danh vào khóa học.",
          requestId: `mock-${Date.now()}`,
        });
      }
      if (course.courseType === "1:1" && list.some((s) => s.status === "active")) {
        throw new ApiError({
          statusCode: 409,
          code: "COURSE_ONE_ON_ONE_LIMIT",
          message: "Khóa học 1:1 chỉ cho phép tối đa 1 học viên đang theo học cùng lúc.",
          requestId: `mock-${Date.now()}`,
        });
      }
      const entry = {
        studentId: student.id,
        fullName: student.fullName,
        email: student.email,
        enrolledAt: new Date().toISOString(),
        status: student.status,
      };
      list.push(entry);
      course.studentCount = list.filter((s) => s.status === "active").length;
      return entry as T;
    }
    if (method === "DELETE" && studentId) {
      mockState.courseStudents[courseId] = list.filter((s) => s.studentId !== studentId);
      course.studentCount = mockState.courseStudents[courseId].length;
      return { ok: true } as T;
    }
  }
  const courseMatch = /^\/courses\/([^/]+)$/.exec(pathname);
  if (courseMatch) {
    const course = mockState.courses.find((c) => c.id === courseMatch[1]);
    if (!course) notFound("Không tìm thấy khóa học.");
    if (method === "GET") return course as T;
    if (method === "PATCH") {
      const patch = options.body as UpdateCourseRequest;
      const nextStart = patch.startBand ?? course.startBand;
      const nextTarget = patch.targetBand ?? course.targetBand;
      if (nextStart !== undefined && nextTarget !== undefined && nextStart > nextTarget) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_COURSE_BANDS",
          message: "Band điểm xuất phát không được lớn hơn band mục tiêu.",
          requestId: `mock-${Date.now()}`,
        });
      }
      Object.assign(course, patch);
      if (patch.teacherId) {
        course.teacherName =
          mockState.users.find((u) => u.id === patch.teacherId)?.fullName ?? course.teacherName;
      }
      return course as T;
    }
  }

  // Lessons
  if (method === "GET" && pathname === "/lessons") {
    const courseId = sp.get("courseId");
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const fromMs = fromParam ? Date.parse(fromParam) : null;
    const toMs = toParam ? Date.parse(toParam) : null;

    const items = mockState.lessons
      .filter((l) => (!courseId ? true : l.courseId === courseId))
      .filter((l) => (fromMs !== null && !Number.isNaN(fromMs) ? Date.parse(l.endTime) >= fromMs : true))
      .filter((l) => (toMs !== null && !Number.isNaN(toMs) ? Date.parse(l.startTime) < toMs : true))
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
    return paginate(items, sp) as T;
  }
  if (method === "POST" && pathname === "/lessons") {
    const body = options.body as CreateLessonRequest;
    if (Date.parse(body.startTime) >= Date.parse(body.endTime)) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_LESSON_TIME",
        message: "Thời gian kết thúc buổi học phải sau thời gian bắt đầu.",
        requestId: `mock-${Date.now()}`,
      });
    }
    const course = mockState.courses.find((c) => c.id === body.courseId);
    const created = {
      id: `les-${Date.now()}`,
      ...body,
      status: "scheduled" as const,
      timezone: body.timezone ?? "Asia/Ho_Chi_Minh",
      courseTitle: course?.title,
      teacherName: course?.teacherName ?? getCurrentUser().fullName,
    };
    mockState.lessons.unshift(created);
    return created as T;
  }
  const lessonMatch = /^\/lessons\/([^/]+)$/.exec(pathname);
  if (lessonMatch && method === "PATCH") {
    const lesson = mockState.lessons.find((l) => l.id === lessonMatch[1]);
    if (!lesson) notFound("Không tìm thấy buổi học.");
    const patch = options.body as UpdateLessonRequest;
    const nextStart = patch.startTime ?? lesson.startTime;
    const nextEnd = patch.endTime ?? lesson.endTime;
    if (Date.parse(nextStart) >= Date.parse(nextEnd)) {
      throw new ApiError({
        statusCode: 400,
        code: "INVALID_LESSON_TIME",
        message: "Thời gian kết thúc buổi học phải sau thời gian bắt đầu.",
        requestId: `mock-${Date.now()}`,
      });
    }
    Object.assign(lesson, patch);
    return lesson as T;
  }

  // Exercises
  if (method === "GET" && pathname === "/exercises") {
    const type = sp.get("type");
    const status = sp.get("status");
    const search = sp.get("search")?.trim().toLowerCase();
    let list = mockState.exercises;
    if (type) {
      list = list.filter((e) => e.type === type);
    }
    if (status) {
      list = list.filter((e) => e.status === status);
    }
    if (search) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(search) ||
          e.id.toLowerCase().includes(search),
      );
    }
    return paginate(list, sp) as T;
  }
  if (method === "POST" && pathname === "/exercises") {
    const body = options.body as CreateExerciseRequest;
    const created = {
      id: `ex-${Date.now()}`,
      title: body.title,
      type: body.type,
      status: "draft" as const,
      version: 1,
      instructions: body.instructions,
      passageHtml: body.passageHtml,
      audioAssetId: body.audioAssetId,
      durationMinutes: body.durationMinutes,
      passThreshold: PASS_SCORE_THRESHOLD,
      questions: body.questions.map((q, idx) => ({ ...q, id: `q-${Date.now()}-${idx}` })),
      createdAt: new Date().toISOString(),
    };
    mockState.exercises.unshift(created);
    return created as T;
  }
  const exerciseMatch = /^\/exercises\/([^/]+)(?:\/(publish|versions))?$/.exec(pathname);
  if (exerciseMatch) {
    const exercise = mockState.exercises.find((e) => e.id === exerciseMatch[1]);
    if (!exercise) notFound("Không tìm thấy bài tập.");
    const action = exerciseMatch[2];
    if (!action && method === "GET") return exercise as T;
    if (!action && method === "PATCH") {
      const body = options.body as UpdateExerciseRequest;
      if (
        exercise.status === "published" &&
        (body.questions !== undefined ||
          body.passageHtml !== undefined ||
          body.audioAssetId !== undefined ||
          body.type !== undefined ||
          body.durationMinutes !== undefined)
      ) {
        throw new ApiError({
          statusCode: 409,
          code: "EXERCISE_PUBLISHED_IMMUTABLE",
          message:
            "Đề đã xuất bản không thể sửa trực tiếp câu hỏi, bài đọc hoặc âm thanh. Hãy tạo phiên bản mới.",
          requestId: `mock-${Date.now()}`,
        });
      }
      if (body.questions) {
        exercise.questions = body.questions.map((q, idx) => ({
          ...q,
          id: `q-${exercise.id}-${idx + 1}`,
        }));
      }
      const { questions: _ignoredQuestions, ...rest } = body;
      void _ignoredQuestions;
      Object.assign(exercise, rest, { updatedAt: new Date().toISOString() });
      return exercise as T;
    }
    if (action === "publish" && method === "POST") {
      if (exercise.questions.length === 0) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Bài tập cần ít nhất 1 câu hỏi trước khi xuất bản.",
          requestId: `mock-${Date.now()}`,
        });
      }
      if (exercise.type === "reading" && !exercise.passageHtml?.trim()) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Bài Reading cần có nội dung bài đọc trước khi xuất bản.",
          requestId: `mock-${Date.now()}`,
        });
      }
      if (exercise.type === "listening" && !exercise.audioAssetId?.trim()) {
        throw new ApiError({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          message: "Bài Listening cần có tệp âm thanh trước khi xuất bản.",
          requestId: `mock-${Date.now()}`,
        });
      }
      exercise.status = "published";
      exercise.updatedAt = new Date().toISOString();
      return exercise as T;
    }
    if (action === "versions" && method === "POST") {
      const baseId = exercise.id.replace(/-v\d+$/, "");
      const maxVer = mockState.exercises
        .filter((e) => e.id === baseId || e.id.startsWith(`${baseId}-v`))
        .reduce((max, item) => Math.max(max, item.version), exercise.version);
      const nextVer = maxVer + 1;
      const cloned = {
        ...exercise,
        id: `${baseId}-v${nextVer}`,
        version: nextVer,
        status: "draft" as const,
        questions: exercise.questions.map((q, idx) => ({
          ...q,
          id: `${baseId}-v${nextVer}-q-${idx + 1}`,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockState.exercises.unshift(cloned);
      return cloned as T;
    }
  }

  // Assignments
  if (method === "GET" && pathname === "/assignments/mine") {
    const user = getCurrentUser();
    const statusFilter = sp.get("status");
    const mine = mockState.studentAssignments.filter(
      (sa) => !sa.studentId || sa.studentId === user.id,
    );
    const items = statusFilter ? mine.filter((sa) => sa.status === statusFilter) : mine;
    return paginate(items, sp) as T;
  }
  const courseAssignmentsMatch = /^\/assignments\/course\/([^/]+)$/.exec(pathname);
  if (method === "GET" && courseAssignmentsMatch) {
    const filtered = mockState.assignments.filter(
      (a) => a.courseId === courseAssignmentsMatch[1],
    );
    return paginate(filtered, sp) as T;
  }
  if (method === "POST" && pathname === "/assignments") {
    const body = options.body as CreateAssignmentRequest;
    const examTest = body.examTestId
      ? mockState.examV2.tests.find((t) => t.id === body.examTestId)
      : undefined;
    const exercise = mockState.exercises.find((e) => e.id === body.exerciseId);

    if (!examTest && !exercise) {
      notFound("Không tìm thấy bài tập hoặc đề thi nguồn.");
    }
    if (examTest && examTest.status !== "PUBLISHED") {
      throw new ApiError({
        statusCode: 400,
        code: "EXERCISE_NOT_PUBLISHED",
        message: "Chỉ có thể giao bài tập từ đề thi ở trạng thái Đã xuất bản.",
        requestId: `mock-${Date.now()}`,
      });
    }
    if (!examTest && exercise && exercise.status !== "published") {
      throw new ApiError({
        statusCode: 400,
        code: "EXERCISE_NOT_PUBLISHED",
        message: "Chỉ có thể giao bài tập từ đề ở trạng thái Đã xuất bản.",
        requestId: `mock-${Date.now()}`,
      });
    }
    const course = mockState.courses.find((c) => c.id === body.courseId);
    if (!course) notFound("Không tìm thấy khóa học.");
    const windowBounds = getVnDailyWindowSync(body.assignedDate);
    const derivedSkillType = examTest
      ? examTest.skill === "LISTENING"
        ? ("listening" as const)
        : ("reading" as const)
      : exercise!.type;
    const derivedSourceTitle = examTest?.title ?? exercise!.title;
    const created = {
      id: `asg-${Date.now()}`,
      courseId: body.courseId,
      courseTitle: course.title,
      exerciseId: body.exerciseId || examTest!.id,
      exerciseTitle: derivedSourceTitle,
      exerciseType: derivedSkillType,
      title: body.title,
      assignedDate: body.assignedDate,
      openAt: body.openAt ?? windowBounds.startUtcIso,
      dueAt: body.dueAt ?? windowBounds.endExclusiveUtcIso,
      timezone: body.timezone ?? "Asia/Ho_Chi_Minh",
      status:
        Date.parse(body.openAt ?? windowBounds.startUtcIso) > Date.now()
          ? ("scheduled" as const)
          : ("active" as const),
      passThreshold: exercise?.passThreshold ?? PASS_SCORE_THRESHOLD,
      examTestId: body.examTestId,
      requiredScope: body.requiredScope,
      requiredPartId: body.requiredPartId ?? null,
      allowedModes: body.allowedModes,
      durationSecondsOverride: body.durationSecondsOverride ?? null,
      maxAttempts: body.maxAttempts ?? null,
    };
    mockState.assignments.unshift(created);
    const enrolled = (mockState.courseStudents[course.id] ?? []).filter(
      (s) => s.status === "active",
    );
    for (const student of enrolled) {
      mockState.studentAssignments.unshift({
        studentAssignmentId: `sa-${Date.now()}-${student.studentId}`,
        assignmentId: created.id,
        courseId: created.courseId,
        courseTitle: course.title,
        studentId: student.studentId,
        studentName: student.fullName,
        title: created.title,
        exerciseType: derivedSkillType,
        assignedDate: created.assignedDate,
        openAt: created.openAt,
        dueAt: created.dueAt,
        effectiveDueAt: created.dueAt,
        timezone: created.timezone,
        status: "not_started",
        attemptsCount: 0,
        bestScore: null,
        passed: false,
        answerReviewUnlocked: false,
        translationAvailable: false,
        translationStatus: "not_started",
        penaltyApplied: false,
        examTestId: body.examTestId,
        requiredScope: body.requiredScope,
        requiredPartId: body.requiredPartId ?? null,
        allowedModes: body.allowedModes,
        durationSecondsOverride: body.durationSecondsOverride ?? null,
        maxAttempts: body.maxAttempts ?? null,
      });
    }
    return created as T;
  }
  const assignmentMatch = /^\/assignments\/([^/]+)(?:\/(students))?$/.exec(pathname);
  if (assignmentMatch) {
    const assignment = mockState.assignments.find((a) => a.id === assignmentMatch[1]);
    if (!assignment) notFound("Không tìm thấy bài giao.");
    if (assignmentMatch[2] === "students" && method === "GET") {
      const rows = mockState.studentAssignments.filter(
        (sa) => sa.assignmentId === assignment.id,
      );
      return paginate(rows, sp) as T;
    }
    if (method === "GET") return assignment as T;
    if (method === "PATCH") {
      Object.assign(assignment, options.body as UpdateAssignmentRequest);
      return assignment as T;
    }
  }

  // Student Assignments + Submissions + Review + Translation + Extensions
  const saSubMatch =
    /^\/student-assignments\/([^/]+)(?:\/(submissions|review|translation(?:\/(draft|submit))?|extensions))?$/.exec(
      pathname,
    );
  if (saSubMatch) {
    const saId = saSubMatch[1]!;
    const subRoute = saSubMatch[2];
    const sa = mockState.studentAssignments.find((item) => item.studentAssignmentId === saId);
    if (!sa) notFound("Không tìm thấy bài làm của học viên.");

    if (!subRoute && method === "GET") {
      if (Date.parse(sa.openAt) > Date.now()) {
        throw new ApiError({
          statusCode: 403,
          code: "ASSIGNMENT_NOT_OPEN_YET",
          message: "Bài tập chưa đến giờ mở.",
          requestId: `mock-not-open-${saId}`,
          timestamp: new Date().toISOString(),
        });
      }
      const detail = buildStudentAssignmentDetail(mockState, sa);
      if (!detail) notFound("Không tìm thấy đề bài.");
      return detail as T;
    }

    if (subRoute === "submissions") {
      if (method === "GET") {
        return (mockState.submissions[saId] ?? []) as T;
      }
      if (method === "POST") {
        const idempotencyKey = options.headers?.["Idempotency-Key"];
        if (idempotencyKey && mockState.idempotencyCache[`${saId}:${idempotencyKey}`]) {
          return mockState.idempotencyCache[`${saId}:${idempotencyKey}`] as T;
        }
        const assignment = mockState.assignments.find((a) => a.id === sa.assignmentId);
        const exercise = mockState.exercises.find((e) => e.id === assignment?.exerciseId);
        if (!exercise) notFound("Không tìm thấy bài tập nguồn.");

        const body = options.body as SubmitAnswersRequest;
        const answerMap = Object.fromEntries(
          body.answers.map((a) => [a.questionId, a.value]),
        );
        mockState.lastSubmittedAnswers[saId] = answerMap;

        const totalQuestions = Math.max(1, exercise.questions.length);
        const correctCount = exercise.questions.filter(
          (q) =>
            (answerMap[q.id] ?? "").trim().toLowerCase() ===
            q.correctAnswer.trim().toLowerCase(),
        ).length;
        const score = Math.round((correctCount / totalQuestions) * 100);
        const passed = score >= PASS_SCORE_THRESHOLD;

        const list = (mockState.submissions[saId] ??= []);
        const attemptNo = list.length + 1;
        const submittedAt = new Date().toISOString();
        const submissionId = `sub-${saId}-${attemptNo}`;

        list.unshift({ submissionId, attemptNo, score, passed, submittedAt });
        sa.attemptsCount = attemptNo;
        sa.bestScore = Math.max(sa.bestScore ?? 0, score);
        sa.passed = sa.passed || passed;
        sa.answerReviewUnlocked = sa.passed;
        sa.translationAvailable = sa.passed && sa.exerciseType === "reading";
        sa.status = sa.passed ? "passed" : "submitted";

        const result: SubmissionResult = {
          submissionId,
          attemptNo,
          score,
          passed,
          bestScore: sa.bestScore,
          answerReviewUnlocked: sa.answerReviewUnlocked,
          translationAvailable: sa.translationAvailable,
          submittedAt,
        };
        if (idempotencyKey) {
          mockState.idempotencyCache[`${saId}:${idempotencyKey}`] = result;
        }
        return result as T;
      }
    }

    if (subRoute === "review" && method === "GET") {
      if (!sa.answerReviewUnlocked) {
        throw new ApiError({
          statusCode: 403,
          code: "ANSWER_LOCKED",
          message: "Correct answers are available only after PASS",
          requestId: `mock-review-lock-${saId}`,
          timestamp: new Date().toISOString(),
        });
      }
      const assignment = mockState.assignments.find((a) => a.id === sa.assignmentId);
      const exercise = mockState.exercises.find((e) => e.id === assignment?.exerciseId);
      if (!exercise) notFound();
      const submittedMap = mockState.lastSubmittedAnswers[saId] ?? {};
      return {
        studentAssignmentId: saId,
        passed: sa.passed,
        score: sa.bestScore ?? 0,
        items: exercise.questions.map((q) => ({
          questionId: q.id,
          orderIndex: q.orderIndex,
          prompt: q.prompt,
          studentAnswer: submittedMap[q.id] ?? "",
          correctAnswer: q.correctAnswer,
          isCorrect:
            (submittedMap[q.id] ?? "").trim().toLowerCase() ===
            q.correctAnswer.trim().toLowerCase(),
          explanation: q.explanation,
        })),
      } as T;
    }

    if (subRoute?.startsWith("translation")) {
      const assignment = mockState.assignments.find((a) => a.id === sa.assignmentId);
      const exercise = mockState.exercises.find((e) => e.id === assignment?.exerciseId);
      const workspace = (mockState.translations[saId] ??= {
        translationId: `tr-${saId}`,
        studentAssignmentId: saId,
        passageTitle: exercise?.title ?? sa.title,
        passageHtml: exercise?.passageHtml ?? "<p>Nội dung bài đọc.</p>",
        draftText: "",
        status: "not_started",
      });
      if (subRoute === "translation" && method === "GET") {
        return workspace as T;
      }
      if (subRoute === "translation/draft" && method === "PUT") {
        const body = options.body as { translatedText: string };
        workspace.draftText = body.translatedText;
        workspace.status = "draft";
        sa.translationStatus = "draft";
        return workspace as T;
      }
      if (subRoute === "translation/submit" && method === "POST") {
        const body = options.body as SubmitTranslationRequest;
        workspace.draftText = body.translatedText;
        workspace.status = "submitted";
        workspace.submittedAt = new Date().toISOString();
        sa.translationStatus = "submitted";
        return workspace as T;
      }
    }

    if (subRoute === "extensions" && method === "POST") {
      if (sa.passed) {
        throw new ApiError({
          statusCode: 400,
          code: "ASSIGNMENT_ALREADY_PASSED",
          message: "Bài tập đã đạt nên không cần xin gia hạn.",
          requestId: `mock-ext-passed-${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
      }
      const existingPending = mockState.extensions.some(
        (ext) => ext.studentAssignmentId === saId && ext.status === "pending",
      );
      if (existingPending) {
        throw new ApiError({
          statusCode: 409,
          code: "EXTENSION_ALREADY_PENDING",
          message: "Bài tập này đang có một yêu cầu gia hạn chờ giáo viên duyệt.",
          requestId: `mock-ext-pending-${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
      }
      const userId = getCurrentUser().id;
      const monthKey = getMonthKeyInTimezone(new Date());
      const usedThisMonth = mockState.extensions.filter(
        (ext) =>
          ext.studentId === userId &&
          getMonthKeyInTimezone(ext.createdAt) === monthKey,
      ).length;

      if (usedThisMonth >= MAX_EXTENSIONS_PER_MONTH) {
        throw new ApiError({
          statusCode: 400,
          code: "EXTENSION_MONTHLY_LIMIT_REACHED",
          message: "Bạn đã đạt giới hạn 3 lần xin gia hạn trong tháng.",
          requestId: `mock-ext-limit-${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
      }

      const body = options.body as CreateExtensionRequest;
      const created = {
        id: `ext-${Date.now()}`,
        studentAssignmentId: saId,
        assignmentTitle: sa.title,
        courseTitle: sa.courseTitle,
        studentId: userId,
        studentName: getCurrentUser().fullName,
        reason: body.reason,
        currentDueAt: sa.effectiveDueAt,
        requestedDueAt: body.requestedDueAt,
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };
      mockState.extensions.unshift(created);
      return created as T;
    }
  }

  // Translation teacher review
  const trReviewMatch = /^\/translations\/([^/]+)\/review$/.exec(pathname);
  if (trReviewMatch && method === "POST") {
    const trId = trReviewMatch[1]!;
    const workspace = Object.values(mockState.translations).find(
      (item) => item.translationId === trId,
    );
    if (!workspace) notFound("Không tìm thấy bài dịch.");
    const body = options.body as ReviewTranslationRequest;
    workspace.status = body.decision;
    workspace.teacherFeedback = body.feedback;
    workspace.reviewedAt = new Date().toISOString();
    const linkedSa = mockState.studentAssignments.find(
      (sa) => sa.studentAssignmentId === workspace.studentAssignmentId,
    );
    if (linkedSa) {
      linkedSa.translationStatus = body.decision;
    }
    return workspace as T;
  }

  // Extensions
  if (method === "GET" && pathname === "/extensions/mine") {
    const userId = getCurrentUser().id;
    return paginate(
      mockState.extensions.filter((e) => e.studentId === userId),
      sp,
    ) as T;
  }
  if (method === "GET" && pathname === "/extensions/pending") {
    return paginate(
      mockState.extensions.filter((e) => e.status === "pending"),
      sp,
    ) as T;
  }
  const extDecisionMatch = /^\/extensions\/([^/]+)\/decision$/.exec(pathname);
  if (extDecisionMatch && method === "POST") {
    const ext = mockState.extensions.find((e) => e.id === extDecisionMatch[1]);
    if (!ext) notFound("Không tìm thấy yêu cầu gia hạn.");
    if (ext.status !== "pending") {
      throw new ApiError({
        statusCode: 409,
        code: "EXTENSION_ALREADY_DECIDED",
        message: "Yêu cầu gia hạn này đã được xử lý trước đó.",
        requestId: `mock-${Date.now()}`,
      });
    }
    const body = options.body as ExtensionDecisionRequest;
    ext.status = body.decision;
    ext.decisionNote = body.decisionNote;
    ext.decidedAt = new Date().toISOString();
    if (body.decision === "approved") {
      const sa = mockState.studentAssignments.find(
        (s) => s.studentAssignmentId === ext.studentAssignmentId,
      );
      if (sa) {
        sa.effectiveDueAt = ext.requestedDueAt;
        sa.status = "extended";
      }
    }
    return ext as T;
  }

  // Penalties
  if (method === "GET" && pathname === "/penalties/mine") {
    const userId = getCurrentUser().id;
    const records = mockState.penalties.filter((p) => p.studentId === userId);
    return {
      totalActivePoints: records
        .filter((r) => !r.reversed)
        .reduce((sum, r) => sum + r.points, 0),
      records,
    } as T;
  }
  const studentPenaltiesMatch = /^\/students\/([^/]+)\/penalties$/.exec(pathname);
  if (studentPenaltiesMatch && method === "GET") {
    const records = mockState.penalties.filter(
      (p) => p.studentId === studentPenaltiesMatch[1],
    );
    return {
      totalActivePoints: records
        .filter((r) => !r.reversed)
        .reduce((sum, r) => sum + r.points, 0),
      records,
    } as T;
  }
  const penaltyReverseMatch = /^\/penalties\/([^/]+)\/reverse$/.exec(pathname);
  if (penaltyReverseMatch && method === "POST") {
    const penalty = mockState.penalties.find((p) => p.id === penaltyReverseMatch[1]);
    if (!penalty) notFound("Không tìm thấy bản ghi phạt.");
    if (penalty.reversed) {
      throw new ApiError({
        statusCode: 409,
        code: "PENALTY_ALREADY_REVERSED",
        message: "Điểm phạt này đã được hoàn tác trước đó.",
        requestId: `mock-${Date.now()}`,
      });
    }
    const body = options.body as ReversePenaltyRequest;
    penalty.reversed = true;
    penalty.reversalReason = body.reason;
    penalty.reversedAt = new Date().toISOString();
    penalty.reversedBy = getCurrentUser().fullName;
    return penalty as T;
  }

  // Notifications
  if (method === "GET" && pathname === "/notifications") {
    const readFilter = sp.get("read");
    const items =
      readFilter === "true"
        ? mockState.notifications.filter((n) => n.read)
        : readFilter === "false"
          ? mockState.notifications.filter((n) => !n.read)
          : mockState.notifications;
    return paginate(items, sp) as T;
  }
  const notifReadMatch = /^\/notifications\/([^/]+)\/read$/.exec(pathname);
  if (notifReadMatch && method === "PATCH") {
    const notif = mockState.notifications.find((n) => n.id === notifReadMatch[1]);
    if (!notif) notFound("Không tìm thấy thông báo.");
    notif.read = true;
    return notif as T;
  }

  // Media Audio
  if (method === "POST" && pathname === "/media/audio/upload-init") {
    const assetId = `audio-${Date.now()}`;
    return {
      assetId,
      uploadUrl: `https://mock-upload.local/${assetId}`,
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    } as T;
  }
  if (method === "POST" && pathname === "/media/audio/upload-complete") {
    return { ok: true } as T;
  }
  const audioPlayMatch = /^\/media\/audio\/([^/]+)\/playback$/.exec(pathname);
  if (audioPlayMatch && method === "GET") {
    return {
      assetId: audioPlayMatch[1],
      streamUrl:
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      mimeType: "audio/wav",
      durationSeconds: 180,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    } as T;
  }

  // Phase 9 Exam Modes V2 routes
  const v2Result = dispatchExamV2MockRequest<T>(mockState.examV2, {
    method,
    pathname,
    sp,
    body: options.body,
    headers: options.headers,
    currentUser: getCurrentUser(),
  });
  if (v2Result.handled) {
    return v2Result.data as T;
  }

  // Health
  if (method === "GET" && (pathname === "/health/live" || pathname === "/health/ready")) {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "mock-v1",
    } as T;
  }

  notFound(`Mock route không được hỗ trợ: ${method} ${pathname}`);
}
