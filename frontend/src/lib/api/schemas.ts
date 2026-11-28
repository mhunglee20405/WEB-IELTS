import { z } from "zod";
import { isSafeExternalUrl } from "@/lib/sanitize/html";
import { MAX_EXTENSIONS_PER_MONTH, PASS_SCORE_THRESHOLD } from "./types";

export const UserRoleSchema = z.enum(["student", "teacher", "admin"]);
export const UserStatusSchema = z.enum(["active", "inactive", "suspended"]);

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  roles: z.array(UserRoleSchema).min(1),
  status: UserStatusSchema,
  timezone: z.string().default("Asia/Ho_Chi_Minh"),
  phone: z.string().optional(),
  avatarUrl: z.string().optional(),
  createdAt: z.union([z.string(), z.date()]).optional().transform((v) => (v instanceof Date ? v.toISOString() : v)),
  updatedAt: z.union([z.string(), z.date()]).optional().transform((v) => (v instanceof Date ? v.toISOString() : v)),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.union([z.number(), z.string()]).optional(),
});

export const LoginResponseSchema = z.object({
  user: AuthUserSchema.optional(),
  tokens: AuthTokensSchema,
});

export const CourseStatusSchema = z.enum(["active", "upcoming", "archived", "draft", "completed"]);
export const CourseFormatSchema = z.enum(["1:1", "group"]);

function toOptionalStringDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export const CourseSchema = z
  .preprocess((raw: unknown) => {
    if (!raw || typeof raw !== "object") return raw;
    const val = { ...(raw as Record<string, unknown>) };
    if (val._id && !val.id) {
      val.id = String(val._id);
    }
    if (val.teacherId && typeof val.teacherId === "object") {
      const teacherObj = val.teacherId as Record<string, unknown>;
      if (!val.teacherName && (teacherObj.fullName || teacherObj.name)) {
        val.teacherName = String(teacherObj.fullName || teacherObj.name);
      }
      const hexId =
        teacherObj._id ||
        teacherObj.id ||
        (typeof (teacherObj as { toHexString?: () => string }).toHexString === "function"
          ? (teacherObj as { toHexString: () => string }).toHexString()
          : "");
      val.teacherId = String(hexId);
    } else if (val.teacherId === undefined || val.teacherId === null) {
      val.teacherId = "";
    } else if (typeof val.teacherId !== "string") {
      val.teacherId = String(val.teacherId);
    }
    if (val.type && !val.courseType) {
      val.courseType = val.type === "one_to_one" || val.type === "1:1" ? "1:1" : "group";
    } else if (val.courseType === "one_to_one") {
      val.courseType = "1:1";
    }
    val.startDate = toOptionalStringDate(val.startDate) ?? toOptionalStringDate(val.startAt);
    val.endDate = toOptionalStringDate(val.endDate) ?? toOptionalStringDate(val.endAt);
    val.createdAt = toOptionalStringDate(val.createdAt);

    for (const optKey of [
      "description",
      "teacherName",
      "startBand",
      "targetBand",
      "studentCount",
      "enrollmentStatus",
      "timezone",
    ] as const) {
      if (val[optKey] === null) {
        delete val[optKey];
      }
    }
    return val;
  }, z.object({
    id: z.string(),
    code: z.string(),
    title: z.string(),
    description: z.string().optional(),
    courseType: CourseFormatSchema.optional(),
    startBand: z.number().optional(),
    targetBand: z.number().optional(),
    enrollmentStatus: z.enum(["active", "dropped", "withdrawn", "completed"]).optional(),
    teacherId: z.string(),
    teacherName: z.string().optional(),
    status: CourseStatusSchema,
    timezone: z.string().default("Asia/Ho_Chi_Minh"),
    studentCount: z.number().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    createdAt: z.string().optional(),
  }));

export const LessonTypeSchema = z.enum(["live_meet", "workshop", "review"]);
export const LessonStatusSchema = z.enum(["scheduled", "live", "completed", "cancelled"]);

export const LessonSchema = z
  .preprocess((raw: unknown) => {
    if (!raw || typeof raw !== "object") return raw;
    const val = raw as Record<string, unknown>;

    let courseId = val.courseId;
    let courseTitle = val.courseTitle as string | undefined;
    let teacherName = val.teacherName as string | undefined;

    if (courseId && typeof courseId === "object") {
      const cObj = courseId as Record<string, unknown>;
      courseId = (cObj._id ?? cObj.id ?? String(cObj)) as string;
      if (!courseTitle) {
        courseTitle = (cObj.title ?? cObj.code) as string | undefined;
      }
      if (!teacherName && cObj.teacherId && typeof cObj.teacherId === "object") {
        teacherName = (cObj.teacherId as Record<string, unknown>).fullName as string | undefined;
      }
    } else if (typeof courseId !== "string") {
      courseId = courseId ? String(courseId) : "";
    }

    const startVal = val.startTime ?? val.startAt;
    const endVal = val.endTime ?? val.endAt;

    const startTime =
      startVal instanceof Date
        ? startVal.toISOString()
        : typeof startVal === "string"
          ? startVal.trim()
          : "";

    const endTime =
      endVal instanceof Date
        ? endVal.toISOString()
        : typeof endVal === "string"
          ? endVal.trim()
          : "";

    const description = (val.description ?? val.content) as string | undefined;
    const content = (val.content ?? val.description) as string | undefined;
    const meetUrl = (val.meetUrl ?? val.meetingUrl) as string | undefined;

    let type = val.type as string | undefined;
    if (!type || (type !== "live_meet" && type !== "workshop" && type !== "review")) {
      type = meetUrl ? "live_meet" : "workshop";
    }

    let status = val.status as string | undefined;
    if (!status || (status !== "scheduled" && status !== "live" && status !== "completed" && status !== "cancelled")) {
      status = "scheduled";
    }

    return {
      ...val,
      id: val.id ? String(val.id) : val._id ? String(val._id) : "",
      courseId,
      courseTitle,
      teacherName,
      description,
      content,
      meetUrl,
      type,
      status,
      startTime,
      endTime,
      startAt: startTime || undefined,
      endAt: endTime || undefined,
      timezone: (val.timezone as string) || "Asia/Ho_Chi_Minh",
    };
  }, z.object({
    id: z.string().min(1),
    courseId: z.string().min(1),
    courseTitle: z.string().optional(),
    teacherName: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    content: z.string().optional(),
    type: LessonTypeSchema,
    status: LessonStatusSchema.default("scheduled"),
    startTime: z.string().refine((val) => val.length > 0 && !Number.isNaN(Date.parse(val)), {
      message: "startTime must be a valid ISO date string",
    }),
    endTime: z.string().refine((val) => val.length > 0 && !Number.isNaN(Date.parse(val)), {
      message: "endTime must be a valid ISO date string",
    }),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    startAtVn: z.string().optional(),
    endAtVn: z.string().optional(),
    timezone: z.string().default("Asia/Ho_Chi_Minh"),
    meetUrl: z.string().optional(),
  }))
  .refine((data) => Date.parse(data.startTime) < Date.parse(data.endTime), {
    path: ["endTime"],
    message: "endTime must be strictly after startTime",
  });

export const ExerciseTypeSchema = z.enum(["reading", "listening"]);
export const ExerciseStatusSchema = z.enum(["draft", "published", "archived"]);
export const QuestionTypeSchema = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  const upper = val.toUpperCase().trim();
  const lower = val.toLowerCase().trim();
  if (upper === "TRUE_FALSE_NOT_GIVEN" || lower === "tfng" || lower === "true_false_not_given") {
    return "tfng";
  }
  if (upper === "YES_NO_NOT_GIVEN" || lower === "ynng" || lower === "yes_no_not_given") {
    return "ynng";
  }
  if (upper.startsWith("MATCHING") || lower === "matching") {
    return "matching";
  }
  if (
    upper.endsWith("_COMPLETION") ||
    upper === "FILL_BLANK" ||
    upper === "FILL_IN_THE_BLANK" ||
    lower === "fill_blank" ||
    lower === "fill_in_the_blank"
  ) {
    return "fill_blank";
  }
  if (upper === "SHORT_ANSWER" || lower === "short_answer") {
    return "short_answer";
  }
  if (
    upper.startsWith("MULTIPLE_CHOICE") ||
    lower === "mcq" ||
    lower === "multiple_choice"
  ) {
    return "mcq";
  }
  return lower;
}, z.enum([
  "mcq",
  "tfng",
  "ynng",
  "fill_blank",
  "matching",
  "short_answer",
]));

export const QuestionOptionSchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      return {
        id: val,
        label: val,
        text: val,
      };
    }
    if (val && typeof val === "object") {
      const raw = val as Record<string, unknown>;
      const id = String(raw.id ?? raw.key ?? raw._id ?? "");
      const label = String(raw.label ?? raw.key ?? raw.text ?? id);
      const text = String(raw.text ?? raw.label ?? id);
      return {
        id,
        label,
        text,
      };
    }
    return val;
  },
  z.object({
    id: z.string(),
    label: z.string(),
    text: z.string(),
  }),
);

export const BaseExerciseQuestionPublicSchema = z.object({
  id: z.string(),
  orderIndex: z.number(),
  prompt: z.string(),
  type: QuestionTypeSchema,
  options: z.array(QuestionOptionSchema).optional(),
  points: z.number().default(1),
});

/**
 * Strips any accidental `correctAnswer` or `explanation` from student-facing payloads.
 */
export const ExerciseQuestionPublicSchema = z.preprocess((val) => {
  if (val && typeof val === "object") {
    const raw = val as Record<string, unknown>;
    const id = String(raw.id ?? raw.questionId ?? (raw.number !== undefined ? raw.number : "") ?? "");
    return {
      ...raw,
      id: id || "q-1",
      orderIndex:
        typeof raw.orderIndex === "number"
          ? raw.orderIndex
          : typeof raw.number === "number"
            ? raw.number
            : 1,
    };
  }
  return val;
}, BaseExerciseQuestionPublicSchema);

export const ExerciseQuestionAuthoringSchema = BaseExerciseQuestionPublicSchema.extend({
  correctAnswer: z.string(),
  explanation: z.string().optional(),
});

export const ExercisePublicSchema = z.preprocess(
  (val) => {
    if (val && typeof val === "object") {
      const raw = val as Record<string, unknown>;
      return {
        ...raw,
        passageHtml: (raw.passageHtml ?? raw.passage ?? "") as string,
      };
    }
    return val;
  },
  z.object({
    id: z.string(),
    title: z.string(),
    type: ExerciseTypeSchema,
    status: ExerciseStatusSchema,
    version: z.number().int().min(1),
    instructions: z.string().optional(),
    passageId: z.string().optional(),
    passageHtml: z.string().optional(),
    audioAssetId: z.string().optional(),
    durationMinutes: z.number().optional(),
    passThreshold: z.number().default(PASS_SCORE_THRESHOLD),
    questions: z.array(ExerciseQuestionPublicSchema),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
);

export const AssignmentStatusSchema = z.enum([
  "draft",
  "scheduled",
  "published",
  "available",
  "active",
  "expired",
  "closed",
  "archived",
  "completed",
]);

export const AssignmentSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string().optional(),
  exerciseId: z.string(),
  exerciseTitle: z.string().optional(),
  exerciseType: ExerciseTypeSchema.optional(),
  title: z.string(),
  assignedDate: z.string(),
  openAt: z.string(),
  dueAt: z.string(),
  timezone: z.string().default("Asia/Ho_Chi_Minh"),
  status: AssignmentStatusSchema,
  passThreshold: z.number().default(PASS_SCORE_THRESHOLD),
});

export const StudentAssignmentStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "submitted",
  "passed",
  "completed",
  "overdue",
  "excused",
  "extended",
]);

export const TranslationStatusSchema = z.enum([
  "not_started",
  "draft",
  "submitted",
  "reviewed",
  "needs_revision",
  "approved",
]);

export const AssignmentPassageVocabSchema = z.object({
  id: z.string(),
  passageId: z.string(),
  testId: z.string().optional(),
  partNumber: z.number().optional(),
  word: z.string(),
  partOfSpeech: z.enum(["n", "v", "adj", "adv", "phrase"]),
  ipa: z.string().optional(),
  meaningVi: z.string(),
  paraphraseNote: z.string().optional(),
  contextSentence: z.string().optional(),
  order: z.number().optional(),
});

export const AssignmentReadingPassageContextSchema = z.object({
  passageId: z.string(),
  partNumber: z.number(),
  title: z.string(),
  passageTitle: z.string().optional(),
  passageHtml: z.string(),
  passageVocabs: z.array(AssignmentPassageVocabSchema).optional(),
});

export const StudentAssignmentSummarySchema = z.object({
  studentAssignmentId: z.string(),
  assignmentId: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  studentId: z.string().optional(),
  studentName: z.string().optional(),
  title: z.string(),
  exerciseType: ExerciseTypeSchema,
  assignedDate: z.string(),
  openAt: z.string(),
  dueAt: z.string(),
  effectiveDueAt: z.string(),
  originalDueAt: z.string().optional(),
  timezone: z.string().default("Asia/Ho_Chi_Minh"),
  status: StudentAssignmentStatusSchema,
  attemptsCount: z.number().int().min(0),
  bestScore: z.number().min(0).max(100).nullable(),
  passed: z.boolean(),
  answerReviewUnlocked: z.boolean(),
  translationAvailable: z.boolean(),
  translationStatus: TranslationStatusSchema,
  penaltyApplied: z.boolean(),
  examTestId: z.string().optional(),
  testId: z.string().optional(),
  requiredScope: z.enum(["PART", "FULL"]).optional(),
  requiredPartId: z.string().nullable().optional(),
  allowedModes: z.array(z.enum(["PART", "FULL"])).optional(),
  durationSecondsOverride: z.number().nullable().optional(),
  maxAttempts: z.number().nullable().optional(),
  allowRetake: z.boolean().optional(),
  strictExamMode: z.boolean().optional(),
  passageId: z.string().optional(),
  passages: z.array(AssignmentReadingPassageContextSchema).optional(),
  passageVocabs: z.array(AssignmentPassageVocabSchema).optional(),
});

export const StudentAssignmentDetailSchema = z.preprocess(
  (val) => {
    if (val && typeof val === "object") {
      const raw = val as Record<string, any>;
      const saId = String(raw.studentAssignmentId ?? raw.id ?? raw._id ?? "");
      const asgId = String(raw.assignmentId ?? raw.id ?? raw._id ?? "");
      const courseId =
        typeof raw.courseId === "object" && raw.courseId !== null
          ? String(raw.courseId.id ?? raw.courseId._id ?? "")
          : String(raw.courseId ?? "");
      return {
        ...raw,
        studentAssignmentId: saId,
        assignmentId: asgId,
        courseId,
      };
    }
    return val;
  },
  StudentAssignmentSummarySchema.extend({
    exercise: ExercisePublicSchema,
  }),
);

export const SubmissionResultSchema = z.object({
  submissionId: z.string(),
  attemptNo: z.number().int().min(1),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  bestScore: z.number().min(0).max(100),
  answerReviewUnlocked: z.boolean(),
  translationAvailable: z.boolean(),
  submittedAt: z.string(),
});

export const AnswerReviewItemSchema = z.object({
  questionId: z.string(),
  orderIndex: z.number(),
  prompt: z.string(),
  studentAnswer: z.string(),
  correctAnswer: z.string(),
  isCorrect: z.boolean(),
  explanation: z.string().optional(),
});

export const AnswerReviewResponseSchema = z.object({
  studentAssignmentId: z.string(),
  passed: z.boolean(),
  score: z.number(),
  title: z.string().optional(),
  exerciseType: ExerciseTypeSchema.optional(),
  examTestId: z.string().optional(),
  testId: z.string().optional(),
  passageId: z.string().optional(),
  passageTitle: z.string().optional(),
  passageHtml: z.string().optional(),
  passages: z.array(AssignmentReadingPassageContextSchema).optional(),
  passageVocabs: z.array(AssignmentPassageVocabSchema).optional(),
  strictExamMode: z.boolean().optional(),
  items: z.array(AnswerReviewItemSchema),
});

export const ExtensionStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);

export const ExtensionRequestItemSchema = z.object({
  id: z.string(),
  studentAssignmentId: z.string(),
  assignmentTitle: z.string(),
  courseTitle: z.string().optional(),
  studentId: z.string(),
  studentName: z.string().optional(),
  reason: z.string(),
  currentDueAt: z.string(),
  originalDueAt: z.string().optional(),
  requestedDueAt: z.string(),
  grantedDueAt: z.string().optional(),
  status: ExtensionStatusSchema,
  decisionNote: z.string().optional(),
  decidedAt: z.string().optional(),
  createdAt: z.string(),
});

export const PenaltyRecordSchema = z.object({
  id: z.string(),
  studentId: z.string(),
  studentName: z.string().optional(),
  studentAssignmentId: z.string(),
  assignmentTitle: z.string(),
  courseTitle: z.string().optional(),
  points: z.number().int().min(1),
  reason: z.string(),
  occurredAt: z.string(),
  reversed: z.boolean(),
  reversedAt: z.string().optional(),
  reversedBy: z.string().optional(),
  reversalReason: z.string().optional(),
});

export const PenaltySummarySchema = z.object({
  totalActivePoints: z.number().int().min(0),
  records: z.array(PenaltyRecordSchema),
});

export const NotificationTypeSchema = z.enum([
  "new_assignment",
  "overdue",
  "course_enrolled",
  "extension_reviewed",
  "other",
  "assignment_new",
  "course_added",
  "extension_decided",
]);

export const NotificationItemSchema = z.object({
  id: z.string(),
  type: NotificationTypeSchema,
  title: z.string(),
  message: z.string(),
  read: z.boolean(),
  targetUrl: z.string().optional(),
  createdAt: z.string(),
});

export const StudentRecentScoreSchema = z.object({
  studentAssignmentId: z.string(),
  title: z.string(),
  exerciseType: ExerciseTypeSchema,
  score: z.number(),
  passed: z.boolean(),
  submittedAt: z.string().optional(),
});

export const StudentDashboardResponseSchema = z.object({
  todayExercises: z.array(StudentAssignmentSummarySchema),
  upcomingDeadlines: z.array(StudentAssignmentSummarySchema),
  upcomingLessons: z.array(LessonSchema),
  recentScores: z.array(StudentRecentScoreSchema).optional(),
  activePenaltiesCount: z.number().int().min(0),
  extensionsUsedThisMonth: z.number().int().min(0),
  maxExtensionsPerMonth: z.number().int().default(MAX_EXTENSIONS_PER_MONTH),
  unreadNotificationsCount: z.number().int().min(0),
});

export const TeacherDashboardResponseSchema = z.object({
  activeCoursesCount: z.number().int().min(0),
  pendingExtensionsCount: z.number().int().min(0),
  pendingTranslationsCount: z.number().int().min(0),
  overdueStudentsCount: z.number().int().min(0),
  recentAssignments: z.array(AssignmentSchema),
  upcomingLessons: z.array(LessonSchema),
});

export function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(1),
  });
}

// Form input schemas shared across UI & API layers
export const LoginFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập email đăng nhập.")
    .email("Email chưa đúng định dạng."),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự."),
});

export const ForgotPasswordFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập email tài khoản.")
    .email("Email chưa đúng định dạng."),
});

export const ResetPasswordFormSchema = z.object({
  token: z.string().trim().min(6, "Vui lòng nhập mã đặt lại mật khẩu hợp lệ."),
  newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự."),
});

export const ProfileUpdateFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Họ và tên phải có ít nhất 2 ký tự.")
    .max(100, "Họ và tên không vượt quá 100 ký tự."),
  timezone: z.string().trim().optional(),
});

export type ProfileUpdateFormValues = z.infer<typeof ProfileUpdateFormSchema>;

export const ExtensionRequestFormSchema = z.object({
  reason: z.string().trim().min(10, "Vui lòng nêu rõ lý do xin gia hạn (tối thiểu 10 ký tự)").max(500),
  requestedDueAt: z.string().min(1, "Vui lòng chọn hạn mới"),
});

export const CourseFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "Mã khóa học phải có tối thiểu 2 ký tự.")
      .max(32, "Mã khóa học không vượt quá 32 ký tự."),
    title: z
      .string()
      .trim()
      .min(3, "Tên khóa học phải có tối thiểu 3 ký tự.")
      .max(160, "Tên khóa học không vượt quá 160 ký tự."),
    description: z.string().trim().max(1000).optional(),
    courseType: CourseFormatSchema,
    startBand: z.coerce
      .number()
      .min(0, "Band xuất phát từ 0.0 đến 9.0.")
      .max(9, "Band xuất phát từ 0.0 đến 9.0."),
    targetBand: z.coerce
      .number()
      .min(0, "Band mục tiêu từ 0.0 đến 9.0.")
      .max(9, "Band mục tiêu từ 0.0 đến 9.0."),
    status: CourseStatusSchema,
    teacherId: z.string().trim().min(1, "Vui lòng chỉ định giảng viên phụ trách."),
    timezone: z.string().trim().min(1).default("Asia/Ho_Chi_Minh"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
  .refine((data) => data.startBand <= data.targetBand, {
    path: ["targetBand"],
    message: "Band mục tiêu phải lớn hơn hoặc bằng band xuất phát.",
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    path: ["endDate"],
    message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.",
  });

export const LessonFormSchema = z
  .object({
    courseId: z.string().trim().min(1, "Vui lòng chọn khóa học."),
    title: z
      .string()
      .trim()
      .min(3, "Tên buổi học phải có tối thiểu 3 ký tự.")
      .max(160, "Tên buổi học không vượt quá 160 ký tự."),
    description: z.string().trim().max(1000).optional(),
    type: LessonTypeSchema,
    status: LessonStatusSchema.optional(),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Vui lòng chọn ngày học hợp lệ."),
    startTimeHm: z.string().regex(/^\d{2}:\d{2}$/, "Vui lòng nhập giờ bắt đầu hợp lệ."),
    endTimeHm: z.string().regex(/^\d{2}:\d{2}$/, "Vui lòng nhập giờ kết thúc hợp lệ."),
    meetUrl: z
      .string()
      .trim()
      .optional()
      .refine(
        (val) => !val || (isSafeExternalUrl(val) && val.toLowerCase().startsWith("https://")),
        "Liên kết Google Meet phải sử dụng giao thức HTTPS hợp lệ.",
      ),
  })
  .refine((data) => data.startTimeHm < data.endTimeHm, {
    path: ["endTimeHm"],
    message: "Giờ kết thúc phải sau giờ bắt đầu.",
  });

export const ExerciseQuestionFormSchema = z.object({
  prompt: z.string().trim().min(3, "Nội dung câu hỏi không được để trống."),
  type: QuestionTypeSchema,
  options: z.array(QuestionOptionSchema).optional(),
  points: z.coerce.number().min(1).max(20).default(1),
  correctAnswer: z.string().trim().min(1, "Vui lòng nhập đáp án đúng để chấm điểm."),
  explanation: z.string().trim().optional(),
});

export const ExerciseFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Tiêu đề bài tập phải có tối thiểu 3 ký tự.")
      .max(160, "Tiêu đề bài tập không vượt quá 160 ký tự."),
    type: ExerciseTypeSchema,
    instructions: z.string().trim().max(1000).optional(),
    passageHtml: z.string().trim().optional(),
    audioAssetId: z.string().trim().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(180).default(20),
    questions: z
      .array(ExerciseQuestionFormSchema)
      .min(1, "Bài tập phải có ít nhất 1 câu hỏi."),
  })
  .refine(
    (data) => (data.type === "reading" ? Boolean(data.passageHtml?.trim()) : true),
    {
      path: ["passageHtml"],
      message: "Bài Reading bắt buộc có nội dung bài đọc.",
    },
  )
  .refine(
    (data) => (data.type === "listening" ? Boolean(data.audioAssetId?.trim()) : true),
    {
      path: ["audioAssetId"],
      message: "Bài Listening cần tải tệp âm thanh hoàn tất trước khi lưu/xuất bản.",
    },
  );

export const CreateAssignmentFormSchema = z.object({
  courseId: z.string().trim().min(1, "Vui lòng chọn khóa học."),
  exerciseId: z.string().trim().min(1, "Vui lòng chọn bài tập đã xuất bản."),
  title: z.string().trim().min(3, "Tên đầu bài giao phải có tối thiểu 3 ký tự.").max(160),
  assignedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Vui lòng chọn ngày giao theo múi giờ Việt Nam."),
  examTestId: z.string().trim().optional(),
  requiredScope: z.enum(["PART", "FULL"]).optional(),
  requiredPartId: z.string().trim().optional().nullable(),
  allowedModes: z.array(z.enum(["PART", "FULL"])).optional(),
  durationSecondsOverride: z.coerce.number().int().min(60).max(10800).optional().nullable(),
  maxAttempts: z.coerce.number().int().min(1).max(20).optional().nullable(),
  allowRetake: z.boolean().optional(),
  strictExamMode: z.boolean().optional(),
});

export const CreateUserFormSchema = z.object({
  email: z.string().trim().email("Email chưa đúng định dạng."),
  fullName: z.string().trim().min(2, "Họ và tên tối thiểu 2 ký tự.").max(100),
  password: z.string().min(8, "Mật khẩu khởi tạo phải có tối thiểu 8 ký tự."),
  roles: z.array(UserRoleSchema).min(1, "Chọn ít nhất 1 vai trò."),
  timezone: z.string().trim().min(1).default("Asia/Ho_Chi_Minh"),
});

export const UpdateUserFormSchema = z.object({
  fullName: z.string().trim().min(2, "Họ và tên tối thiểu 2 ký tự.").max(100),
  roles: z.array(UserRoleSchema).min(1, "Chọn ít nhất 1 vai trò."),
  status: UserStatusSchema,
  timezone: z.string().trim().min(1).default("Asia/Ho_Chi_Minh"),
});

export const ReversePenaltyFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Lý do hoàn tác điểm phạt phải rõ ràng (tối thiểu 10 ký tự).")
    .max(500),
});

export const ExtensionDecisionFormSchema = z.object({
  decisionNote: z
    .string()
    .trim()
    .min(5, "Vui lòng nhập ghi chú phản hồi cho học viên (tối thiểu 5 ký tự).")
    .max(500),
});

export const TranslationReviewFormSchema = z.object({
  decision: z.enum(["approved", "needs_revision"]),
  feedback: z
    .string()
    .trim()
    .min(5, "Vui lòng nhập nhận xét chi tiết cho bản dịch (tối thiểu 5 ký tự).")
    .max(1000),
});

// ---------------------------------------------------------------------------
// Phase 9 Exam Modes V2 Schemas (with strict Student DTO stripping)
// ---------------------------------------------------------------------------

export const ExamSkillSchema = z.enum(["READING", "LISTENING", "VOCABULARY", "GRAMMAR"]);
export const ExamModeSchema = z.enum(["PART", "FULL"]);
export const ExamTestStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const ExamPartTypeSchema = z.enum(["PASSAGE", "SECTION", "QUIZ"]);
export const ExamAttemptStatusSchema = z.enum([
  "IN_PROGRESS",
  "SUBMITTED",
  "AUTO_SUBMITTED",
  "EXPIRED",
  "ABANDONED",
]);

export const ExamQuestionTypeSchema = z.enum([
  "MULTIPLE_CHOICE_SINGLE",
  "MULTIPLE_CHOICE_MULTIPLE",
  "TRUE_FALSE_NOT_GIVEN",
  "YES_NO_NOT_GIVEN",
  "MATCHING_HEADINGS",
  "MATCHING_INFORMATION",
  "MATCHING_FEATURES",
  "MATCHING_SENTENCE_ENDINGS",
  "SENTENCE_COMPLETION",
  "SUMMARY_COMPLETION",
  "NOTE_COMPLETION",
  "TABLE_COMPLETION",
  "FLOW_CHART_COMPLETION",
  "DIAGRAM_LABEL_COMPLETION",
  "SHORT_ANSWER",
]);

export const ExamQuestionOptionSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  text: z.string(),
});

export const ExamPassageParagraphSchema = z.object({
  label: z.string(),
  text: z.string(),
});

export const ExamAudioAssetPublicSchema = z.object({
  assetId: z.string(),
  playbackUrl: z.string().optional(),
  durationSeconds: z.number().optional(),
  mimeType: z.string().optional(),
  allowPause: z.boolean().optional(),
  allowSeek: z.boolean().optional(),
  maxPlayCount: z.number().nullable().optional(),
});

/**
 * Schema công khai cho từng câu hỏi ở phía học viên:
 * Tự động loại bỏ (strip) mọi trường đáp án/chấm điểm/giải thích nếu backend vô tình trả kèm.
 */
export const ExamQuestionPublicSchema = z
  .object({
    id: z.string(),
    groupId: z.string(),
    questionNumber: z.number(),
    prompt: z.string(),
    questionType: ExamQuestionTypeSchema,
    options: z.array(ExamQuestionOptionSchema).optional(),
    maxSelections: z.number().optional(),
    maxWords: z.number().optional(),
    blankLabel: z.string().optional(),
    assetUrl: z.string().optional(),
    note: z.string().optional(),
  })
  .strip();

export const ExamQuestionGroupPublicSchema = z
  .object({
    id: z.string(),
    partId: z.string(),
    groupNumber: z.number(),
    title: z.string().optional(),
    instructionHtml: z.string(),
    questionType: ExamQuestionTypeSchema,
    questionNumberStart: z.number(),
    questionNumberEnd: z.number(),
    sharedOptions: z.array(ExamQuestionOptionSchema).optional(),
    summaryTemplateHtml: z.string().optional(),
    diagramImageUrl: z.string().optional(),
    maxWords: z.number().optional(),
    maxSelections: z.number().optional(),
    questions: z.array(ExamQuestionPublicSchema),
  })
  .strip();

/**
 * Schema công khai cho ExamPart ở phía học viên:
 * Strip toàn bộ transcript / sourcePartId / thông tin đáp án.
 */
export const ExamPartPublicSchema = z
  .object({
    id: z.string(),
    partNumber: z.number(),
    partType: ExamPartTypeSchema,
    title: z.string(),
    instructions: z.string().optional(),
    passageTitle: z.string().optional(),
    passageHtml: z.string().optional(),
    paragraphs: z.array(ExamPassageParagraphSchema).optional(),
    audioAsset: ExamAudioAssetPublicSchema.optional(),
    durationSeconds: z.number().optional(),
    questionCount: z.number(),
    questionNumberRange: z.object({
      start: z.number(),
      end: z.number(),
    }),
    questionGroups: z.array(ExamQuestionGroupPublicSchema),
  })
  .strip();

export const ExamPartSummarySchema = z.object({
  id: z.string(),
  partNumber: z.number(),
  partType: ExamPartTypeSchema,
  title: z.string(),
  questionCount: z.number(),
  questionNumberRange: z.object({
    start: z.number(),
    end: z.number(),
  }),
  durationSeconds: z.number().optional(),
  available: z.boolean(),
});

export const ExamTestSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  skill: ExamSkillSchema,
  status: ExamTestStatusSchema,
  version: z.number(),
  partCount: z.number(),
  totalQuestions: z.number(),
  totalDurationSeconds: z.number(),
  difficulty: z.string().optional(),
  tags: z.array(z.string()).default([]),
  allowedModes: z.array(ExamModeSchema).default([]),
  createdBy: z
    .object({
      id: z.string(),
      fullName: z.string(),
    })
    .optional(),
  parts: z.array(ExamPartSummarySchema),
  updatedAt: z.string(),
  publishedAt: z.string().optional(),
});

export const ExamActiveAttemptBannerSchema = z.object({
  attemptId: z.string(),
  mode: ExamModeSchema,
  partId: z.string().nullable().optional(),
  startedAt: z.string(),
  expiresAt: z.string(),
  answeredCount: z.number(),
  totalQuestions: z.number(),
});

export const ExamTestDetailStudentSchema = ExamTestSummarySchema.omit({ parts: true })
  .extend({
    instructions: z.string().optional(),
    parts: z.array(ExamPartPublicSchema),
    activeAttempt: ExamActiveAttemptBannerSchema.nullable().optional(),
  })
  .strip();

export const ExamAnswerValueSchema = z.union([z.string(), z.array(z.string())]);

export const ExamAttemptDetailSchema = z
  .object({
    attemptId: z.string(),
    testId: z.string(),
    testTitle: z.string(),
    skill: ExamSkillSchema,
    mode: ExamModeSchema,
    status: ExamAttemptStatusSchema,
    partId: z.string().nullable().optional(),
    studentAssignmentId: z.string().nullable().optional(),
    strictExamMode: z.boolean().optional(),
    revision: z.number(),
    startedAt: z.string(),
    expiresAt: z.string(),
    serverTime: z.string(),
    remainingSeconds: z.number(),
    durationSeconds: z.number(),
    parts: z.array(ExamPartPublicSchema),
    answers: z.record(z.string(), ExamAnswerValueSchema),
    flaggedQuestionIds: z.array(z.string()).optional(),
    totalQuestions: z.number(),
    answeredCount: z.number(),
    submittedAt: z.string().nullable().optional(),
  })
  .strip();

export const ExamResultResponseSchema = z.object({
  attemptId: z.string(),
  testId: z.string(),
  testTitle: z.string().optional().default("IELTS Practice Test"),
  skill: ExamSkillSchema,
  mode: ExamModeSchema,
  partId: z.string().nullable().optional(),
  studentAssignmentId: z.string().nullable().optional(),
  strictExamMode: z.boolean().optional(),
  status: z
    .enum(["SUBMITTED", "EXPIRED", "AUTO_SUBMITTED", "IN_PROGRESS"])
    .transform((s) => (s === "AUTO_SUBMITTED" || s === "IN_PROGRESS" ? "SUBMITTED" : s)),
  totalQuestions: z.number(),
  correctCount: z.number(),
  scorePercent: z.number(),
  passed: z.boolean(),
  passThresholdPercent: z.number().optional().default(70),
  ieltsBandEstimate: z.number().nullable().optional(),
  answerReviewAvailable: z.boolean().optional().default(false),
  answerReviewLockedReason: z.string().nullable().optional(),
  translationEligible: z.boolean().optional().default(false),
  translationEligibilityHint: z.string().nullable().optional(),
  partBreakdown: z
    .array(
      z.object({
        partId: z.string(),
        partNumber: z.number(),
        title: z.string(),
        correctCount: z.number(),
        totalCount: z.number(),
        percentage: z.number(),
      }),
    )
    .optional()
    .default([]),
  questionTypeBreakdown: z
    .array(
      z.object({
        questionType: z.preprocess((val) => {
          if (typeof val === "string") {
            if (val === "MULTIPLE_CHOICE") return "MULTIPLE_CHOICE_SINGLE";
            if ((ExamQuestionTypeSchema.options as readonly string[]).includes(val)) return val;
          }
          return "MULTIPLE_CHOICE_SINGLE";
        }, ExamQuestionTypeSchema),
        label: z.string().optional(),
        correctCount: z.number(),
        totalCount: z.number(),
      }),
    )
    .optional()
    .default([]),
  timeSpentSeconds: z.number().optional().default(0),
  submittedAt: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? new Date().toISOString()),
});

export const ReadingTranslationDraftSchema = z.object({
  textVi: z
    .string()
    .trim()
    .min(10, "Bản dịch tiếng Việt cần có tối thiểu 10 ký tự.")
    .max(20000, "Bản dịch không vượt quá 20.000 ký tự."),
});

export const ReadingTranslationReviewSchema = z.object({
  decision: z.enum(["REVIEWED", "NEEDS_REVISION"]),
  feedback: z
    .string()
    .trim()
    .min(5, "Vui lòng nhập nhận xét chi tiết cho bản dịch (tối thiểu 5 ký tự).")
    .max(2000),
});

export const TeacherExamTestFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Tiêu đề đề thi phải có tối thiểu 3 ký tự.")
    .max(160, "Tiêu đề đề thi không vượt quá 160 ký tự."),
  subtitle: z.string().trim().max(240).optional(),
  skill: ExamSkillSchema,
  difficulty: z.string().trim().optional(),
  tags: z.array(z.string().trim()).default([]),
  totalDurationSeconds: z.coerce.number().int().min(60).max(10800),
  allowedModes: z
    .array(ExamModeSchema)
    .min(1, "Chọn ít nhất 1 chế độ thi (PART hoặc FULL)."),
  instructions: z.string().trim().max(2000).optional(),
});


