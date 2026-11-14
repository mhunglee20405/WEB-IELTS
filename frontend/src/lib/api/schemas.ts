import { z } from "zod";
import { isSafeExternalUrl } from "@/lib/sanitize/html";
import { MAX_EXTENSIONS_PER_MONTH, PASS_SCORE_THRESHOLD } from "./types";

export const UserRoleSchema = z.enum(["student", "teacher", "admin"]);
export const UserStatusSchema = z.enum(["active", "inactive", "suspended"]);

export const AuthUserSchema = z.preprocess(
  (val) => {
    if (val && typeof val === "object") {
      const obj = { ...(val as Record<string, unknown>) };
      if (!obj.id && obj._id) {
        obj.id = String(obj._id);
      }
      if (!obj.roles && obj.role) {
        obj.roles = [obj.role];
      }
      if (!obj.status) {
        obj.status = "active";
      }
      if (!obj.timezone) {
        obj.timezone = "Asia/Ho_Chi_Minh";
      }
      return obj;
    }
    return val;
  },
  z.object({
    id: z.string(),
    email: z.string().email(),
    fullName: z.string(),
    roles: z.array(UserRoleSchema).min(1),
    status: UserStatusSchema,
    timezone: z.string().default("Asia/Ho_Chi_Minh"),
    avatarUrl: z.string().optional(),
    createdAt: z.string().optional(),
  }),
);

export const AuthTokensSchema = z.preprocess(
  (val) => {
    if (val && typeof val === "object") {
      const obj = { ...(val as Record<string, unknown>) };
      if (typeof obj.expiresIn === "string") {
        const parsed = parseInt(obj.expiresIn, 10);
        obj.expiresIn = Number.isNaN(parsed) ? obj.expiresIn : parsed;
      }
      return obj;
    }
    return val;
  },
  z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresIn: z.union([z.number(), z.string()]).optional(),
  }),
);

export const LoginResponseSchema = z.object({
  user: AuthUserSchema.optional(),
  tokens: AuthTokensSchema,
});

export const CourseStatusSchema = z.enum(["active", "upcoming", "archived"]);
export const CourseFormatSchema = z.enum(["1:1", "group"]);

export const CourseSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string().optional(),
  courseType: CourseFormatSchema.optional(),
  startBand: z.number().optional(),
  targetBand: z.number().optional(),
  enrollmentStatus: z.enum(["active", "withdrawn", "completed"]).optional(),
  teacherId: z.string(),
  teacherName: z.string().optional(),
  status: CourseStatusSchema,
  timezone: z.string().default("Asia/Ho_Chi_Minh"),
  studentCount: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  createdAt: z.string().optional(),
});

export const LessonTypeSchema = z.enum(["live_meet", "workshop", "review"]);
export const LessonStatusSchema = z.enum(["scheduled", "live", "completed", "cancelled"]);

export const LessonSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string().optional(),
  teacherName: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  type: LessonTypeSchema,
  status: LessonStatusSchema.optional(),
  startTime: z.string(),
  endTime: z.string(),
  timezone: z.string().default("Asia/Ho_Chi_Minh"),
  meetUrl: z.string().optional(),
});

export const ExerciseTypeSchema = z.enum(["reading", "listening"]);
export const ExerciseStatusSchema = z.enum(["draft", "published", "archived"]);
export const QuestionTypeSchema = z.enum([
  "mcq",
  "tfng",
  "ynng",
  "fill_blank",
  "matching",
  "short_answer",
]);

export const QuestionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string(),
});

/**
 * Strips any accidental `correctAnswer` or `explanation` from student-facing payloads.
 */
export const ExerciseQuestionPublicSchema = z.object({
  id: z.string(),
  orderIndex: z.number(),
  prompt: z.string(),
  type: QuestionTypeSchema,
  options: z.array(QuestionOptionSchema).optional(),
  points: z.number().default(1),
});

export const ExerciseQuestionAuthoringSchema = ExerciseQuestionPublicSchema.extend({
  correctAnswer: z.string(),
  explanation: z.string().optional(),
});

export const ExercisePublicSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: ExerciseTypeSchema,
  status: ExerciseStatusSchema,
  version: z.number().int().min(1),
  instructions: z.string().optional(),
  passageHtml: z.string().optional(),
  audioAssetId: z.string().optional(),
  durationMinutes: z.number().optional(),
  passThreshold: z.number().default(PASS_SCORE_THRESHOLD),
  questions: z.array(ExerciseQuestionPublicSchema),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const AssignmentStatusSchema = z.enum(["scheduled", "active", "closed"]);

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
  "overdue",
  "extended",
]);

export const TranslationStatusSchema = z.enum([
  "not_started",
  "draft",
  "submitted",
  "needs_revision",
  "approved",
]);

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
  timezone: z.string().default("Asia/Ho_Chi_Minh"),
  status: StudentAssignmentStatusSchema,
  attemptsCount: z.number().int().min(0),
  bestScore: z.number().min(0).max(100).nullable(),
  passed: z.boolean(),
  answerReviewUnlocked: z.boolean(),
  translationAvailable: z.boolean(),
  translationStatus: TranslationStatusSchema,
  penaltyApplied: z.boolean(),
});

export const StudentAssignmentDetailSchema = StudentAssignmentSummarySchema.extend({
  exercise: ExercisePublicSchema,
});

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
  items: z.array(AnswerReviewItemSchema),
});

export const ExtensionStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const ExtensionRequestItemSchema = z.object({
  id: z.string(),
  studentAssignmentId: z.string(),
  assignmentTitle: z.string(),
  courseTitle: z.string().optional(),
  studentId: z.string(),
  studentName: z.string().optional(),
  reason: z.string(),
  currentDueAt: z.string(),
  requestedDueAt: z.string(),
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
  "assignment_new",
  "overdue",
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
  timezone: z.string().trim().min(1, "Vui lòng chọn múi giờ."),
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

export const ExamSkillSchema = z.enum(["READING", "LISTENING"]);
export const ExamModeSchema = z.enum(["PART", "FULL"]);
export const ExamTestStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const ExamPartTypeSchema = z.enum(["PASSAGE", "SECTION"]);
export const ExamAttemptStatusSchema = z.enum([
  "IN_PROGRESS",
  "SUBMITTED",
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
  tags: z.array(z.string()),
  allowedModes: z.array(ExamModeSchema),
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
  testTitle: z.string(),
  skill: ExamSkillSchema,
  mode: ExamModeSchema,
  partId: z.string().nullable().optional(),
  studentAssignmentId: z.string().nullable().optional(),
  status: z.enum(["SUBMITTED", "EXPIRED"]),
  totalQuestions: z.number(),
  correctCount: z.number(),
  scorePercent: z.number(),
  passed: z.boolean(),
  passThresholdPercent: z.number(),
  ieltsBandEstimate: z.number().nullable().optional(),
  answerReviewAvailable: z.boolean(),
  answerReviewLockedReason: z.string().nullable().optional(),
  translationEligible: z.boolean(),
  translationEligibilityHint: z.string().nullable().optional(),
  partBreakdown: z.array(
    z.object({
      partId: z.string(),
      partNumber: z.number(),
      title: z.string(),
      correctCount: z.number(),
      totalCount: z.number(),
      percentage: z.number(),
    }),
  ),
  questionTypeBreakdown: z
    .array(
      z.object({
        questionType: ExamQuestionTypeSchema,
        label: z.string().optional(),
        correctCount: z.number(),
        totalCount: z.number(),
      }),
    )
    .optional(),
  timeSpentSeconds: z.number(),
  submittedAt: z.string(),
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


