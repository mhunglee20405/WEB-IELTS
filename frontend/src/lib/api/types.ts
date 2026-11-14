export const PASS_SCORE_THRESHOLD = 70;
export const MAX_EXTENSIONS_PER_MONTH = 3;

export type UserRole = "student" | "teacher" | "admin";
export type UserStatus = "active" | "inactive" | "suspended";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  status: UserStatus;
  timezone: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number | string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface RefreshTokenRequest {
  refreshToken?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface CreateUserRequest {
  email: string;
  fullName: string;
  password?: string;
  roles: UserRole[];
  timezone?: string;
}

export interface UpdateUserRequest {
  fullName?: string;
  roles?: UserRole[];
  status?: UserStatus;
  timezone?: string;
}

export interface StudentProfile {
  user: AuthUser;
  targetBand?: number;
  enrolledCoursesCount: number;
  activePenaltiesCount: number;
  extensionsUsedThisMonth: number;
  maxExtensionsPerMonth: number;
}

export interface TeacherProfile {
  user: AuthUser;
  specialization?: string;
  activeCoursesCount: number;
  pendingExtensionsCount: number;
  pendingTranslationsCount: number;
}

export type CourseStatus = "active" | "upcoming" | "archived";
export type CourseFormat = "1:1" | "group";

export interface Course {
  id: string;
  code: string;
  title: string;
  description?: string;
  courseType?: CourseFormat;
  startBand?: number;
  targetBand?: number;
  enrollmentStatus?: "active" | "withdrawn" | "completed";
  teacherId: string;
  teacherName?: string;
  status: CourseStatus;
  timezone: string;
  studentCount?: number;
  startDate?: string;
  endDate?: string;
  createdAt?: string;
}

export interface CreateCourseRequest {
  code: string;
  title: string;
  description?: string;
  courseType?: CourseFormat;
  startBand?: number;
  targetBand?: number;
  teacherId: string;
  timezone?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCourseRequest {
  title?: string;
  description?: string;
  courseType?: CourseFormat;
  startBand?: number;
  targetBand?: number;
  teacherId?: string;
  status?: CourseStatus;
  timezone?: string;
  startDate?: string;
  endDate?: string;
}

export interface CourseStudent {
  studentId: string;
  fullName: string;
  email: string;
  enrolledAt: string;
  status: UserStatus;
}

export interface AddCourseStudentRequest {
  studentId: string;
}

export type LessonType = "live_meet" | "workshop" | "review";
export type LessonStatus = "scheduled" | "live" | "completed" | "cancelled";

export interface Lesson {
  id: string;
  courseId: string;
  courseTitle?: string;
  teacherName?: string;
  title: string;
  description?: string;
  type: LessonType;
  status?: LessonStatus;
  startTime: string;
  endTime: string;
  timezone: string;
  meetUrl?: string;
}

export interface CreateLessonRequest {
  courseId: string;
  title: string;
  description?: string;
  type: LessonType;
  startTime: string;
  endTime: string;
  timezone?: string;
  meetUrl?: string;
}

export interface UpdateLessonRequest {
  title?: string;
  description?: string;
  type?: LessonType;
  status?: LessonStatus;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  meetUrl?: string;
}

export type ExerciseType = "reading" | "listening";
export type ExerciseStatus = "draft" | "published" | "archived";
export type QuestionType = "mcq" | "tfng" | "ynng" | "fill_blank" | "matching" | "short_answer";

export interface QuestionOption {
  id: string;
  label: string;
  text: string;
}

/**
 * Public student-safe question payload: NEVER contains correctAnswer or explanation.
 */
export interface ExerciseQuestionPublic {
  id: string;
  orderIndex: number;
  prompt: string;
  type: QuestionType;
  options?: QuestionOption[];
  points: number;
}

/**
 * Teacher authoring question payload (authoring/editing endpoints only).
 */
export interface ExerciseQuestionAuthoring extends ExerciseQuestionPublic {
  correctAnswer: string;
  explanation?: string;
}

export interface ExercisePublic {
  id: string;
  title: string;
  type: ExerciseType;
  status: ExerciseStatus;
  version: number;
  instructions?: string;
  passageHtml?: string;
  audioAssetId?: string;
  durationMinutes?: number;
  passThreshold: number;
  questions: ExerciseQuestionPublic[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ExerciseAuthoringDetail extends Omit<ExercisePublic, "questions"> {
  questions: ExerciseQuestionAuthoring[];
}

export interface CreateExerciseRequest {
  title: string;
  type: ExerciseType;
  instructions?: string;
  passageHtml?: string;
  audioAssetId?: string;
  durationMinutes?: number;
  questions: Omit<ExerciseQuestionAuthoring, "id">[];
}

export type UpdateExerciseRequest = Partial<CreateExerciseRequest>;

export type AssignmentStatus = "scheduled" | "active" | "closed";

export interface Assignment {
  id: string;
  courseId: string;
  courseTitle?: string;
  exerciseId: string;
  exerciseTitle?: string;
  exerciseType?: ExerciseType;
  title: string;
  assignedDate: string;
  openAt: string;
  dueAt: string;
  timezone: string;
  status: AssignmentStatus;
  passThreshold: number;
  examTestId?: string;
  requiredScope?: "PART" | "FULL";
  requiredPartId?: string | null;
  allowedModes?: ("PART" | "FULL")[];
  durationSecondsOverride?: number | null;
  maxAttempts?: number | null;
}

export interface CreateAssignmentRequest {
  courseId: string;
  exerciseId: string;
  title: string;
  assignedDate: string;
  openAt?: string;
  dueAt?: string;
  timezone?: string;
  examTestId?: string;
  requiredScope?: "PART" | "FULL";
  requiredPartId?: string | null;
  allowedModes?: ("PART" | "FULL")[];
  durationSecondsOverride?: number | null;
  maxAttempts?: number | null;
}

export interface UpdateAssignmentRequest {
  title?: string;
  dueAt?: string;
  status?: AssignmentStatus;
}

export type StudentAssignmentStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "passed"
  | "overdue"
  | "extended";

export interface StudentAssignmentSummary {
  studentAssignmentId: string;
  assignmentId: string;
  courseId: string;
  courseTitle: string;
  studentId?: string;
  studentName?: string;
  title: string;
  exerciseType: ExerciseType;
  assignedDate: string;
  openAt: string;
  dueAt: string;
  effectiveDueAt: string;
  timezone: string;
  status: StudentAssignmentStatus;
  attemptsCount: number;
  bestScore: number | null;
  passed: boolean;
  answerReviewUnlocked: boolean;
  translationAvailable: boolean;
  translationStatus: TranslationStatus;
  penaltyApplied: boolean;
  examTestId?: string;
  requiredScope?: "PART" | "FULL";
  requiredPartId?: string | null;
  allowedModes?: ("PART" | "FULL")[];
  durationSecondsOverride?: number | null;
  maxAttempts?: number | null;
  activeExamAttemptId?: string | null;
  latestExamAttemptId?: string | null;
}

export interface StudentAssignmentDetail extends StudentAssignmentSummary {
  exercise: ExercisePublic;
}

export interface SubmissionAnswer {
  questionId: string;
  value: string;
}

export interface SubmitAnswersRequest {
  answers: SubmissionAnswer[];
}

export interface SubmissionResult {
  submissionId: string;
  attemptNo: number;
  score: number;
  passed: boolean;
  bestScore: number;
  answerReviewUnlocked: boolean;
  translationAvailable: boolean;
  submittedAt: string;
}

export interface SubmissionHistoryItem {
  submissionId: string;
  attemptNo: number;
  score: number;
  passed: boolean;
  submittedAt: string;
}

export interface AnswerReviewItem {
  questionId: string;
  orderIndex: number;
  prompt: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface AnswerReviewResponse {
  studentAssignmentId: string;
  passed: boolean;
  score: number;
  items: AnswerReviewItem[];
}

export type TranslationStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "needs_revision"
  | "approved";

export interface TranslationWorkspace {
  translationId: string;
  studentAssignmentId: string;
  passageTitle: string;
  passageHtml: string;
  draftText: string;
  status: TranslationStatus;
  teacherFeedback?: string;
  submittedAt?: string;
  reviewedAt?: string;
}

export interface SaveTranslationDraftRequest {
  translatedText: string;
}

export interface SubmitTranslationRequest {
  translatedText: string;
}

export interface ReviewTranslationRequest {
  decision: "approved" | "needs_revision";
  feedback?: string;
}

export type ExtensionStatus = "pending" | "approved" | "rejected";

export interface ExtensionRequestItem {
  id: string;
  studentAssignmentId: string;
  assignmentTitle: string;
  courseTitle?: string;
  studentId: string;
  studentName?: string;
  reason: string;
  currentDueAt: string;
  requestedDueAt: string;
  status: ExtensionStatus;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface CreateExtensionRequest {
  reason: string;
  requestedDueAt: string;
}

export interface ExtensionDecisionRequest {
  decision: "approved" | "rejected";
  decisionNote: string;
}

export interface PenaltyRecord {
  id: string;
  studentId: string;
  studentName?: string;
  studentAssignmentId: string;
  assignmentTitle: string;
  courseTitle?: string;
  points: number;
  reason: string;
  occurredAt: string;
  reversed: boolean;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
}

export interface PenaltySummary {
  totalActivePoints: number;
  records: PenaltyRecord[];
}

export interface ReversePenaltyRequest {
  reason: string;
}

export type NotificationType =
  | "assignment_new"
  | "overdue"
  | "course_added"
  | "extension_decided";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  targetUrl?: string;
  createdAt: string;
}

export interface StudentRecentScore {
  studentAssignmentId: string;
  title: string;
  exerciseType: ExerciseType;
  score: number;
  passed: boolean;
  submittedAt?: string;
}

export interface StudentDashboardResponse {
  todayExercises: StudentAssignmentSummary[];
  upcomingDeadlines: StudentAssignmentSummary[];
  upcomingLessons: Lesson[];
  recentScores?: StudentRecentScore[];
  activePenaltiesCount: number;
  extensionsUsedThisMonth: number;
  maxExtensionsPerMonth: number;
  unreadNotificationsCount: number;
}

export interface TeacherDashboardResponse {
  activeCoursesCount: number;
  pendingExtensionsCount: number;
  pendingTranslationsCount: number;
  overdueStudentsCount: number;
  recentAssignments: Assignment[];
  upcomingLessons: Lesson[];
}

export interface AudioUploadInitRequest {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AudioUploadInitResponse {
  assetId: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface AudioUploadCompleteRequest {
  assetId: string;
  durationSeconds?: number;
}

export interface AudioPlaybackResponse {
  assetId: string;
  streamUrl: string;
  mimeType: string;
  durationSeconds?: number;
  expiresAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  version?: string;
}

// ---------------------------------------------------------------------------
// Phase 9 Exam Modes V2 Types (Reading & Listening Exam Engine + Translation)
// ---------------------------------------------------------------------------

export type ExamSkill = "READING" | "LISTENING";
export type ExamMode = "PART" | "FULL";
export type ExamTestStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ExamPartType = "PASSAGE" | "SECTION";
export type ExamAttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "EXPIRED" | "ABANDONED";
export type ExamDifficulty = "FOUNDATION" | "INTERMEDIATE" | "TARGET_65" | "TARGET_75_PLUS";

export type ExamQuestionType =
  | "MULTIPLE_CHOICE_SINGLE"
  | "MULTIPLE_CHOICE_MULTIPLE"
  | "TRUE_FALSE_NOT_GIVEN"
  | "YES_NO_NOT_GIVEN"
  | "MATCHING_HEADINGS"
  | "MATCHING_INFORMATION"
  | "MATCHING_FEATURES"
  | "MATCHING_SENTENCE_ENDINGS"
  | "SENTENCE_COMPLETION"
  | "SUMMARY_COMPLETION"
  | "NOTE_COMPLETION"
  | "TABLE_COMPLETION"
  | "FLOW_CHART_COMPLETION"
  | "DIAGRAM_LABEL_COMPLETION"
  | "SHORT_ANSWER";

export type ExamAnswerValue = string | string[];

export interface ExamQuestionOption {
  key: string;
  label?: string;
  text: string;
}

export interface ExamPassageParagraph {
  label: string;
  text: string;
}

export interface ExamAudioAssetPublic {
  assetId: string;
  playbackUrl?: string;
  durationSeconds?: number;
  mimeType?: string;
  allowPause?: boolean;
  allowSeek?: boolean;
  maxPlayCount?: number | null;
}

export interface ExamQuestionPublic {
  id: string;
  groupId: string;
  questionNumber: number;
  prompt: string;
  questionType: ExamQuestionType;
  options?: ExamQuestionOption[];
  maxSelections?: number;
  maxWords?: number;
  blankLabel?: string;
  assetUrl?: string;
  note?: string;
}

export interface ExamQuestionAuthoring extends ExamQuestionPublic {
  correctAnswer?: ExamAnswerValue;
  acceptedAnswers?: string[];
  explanation?: string;
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
  referenceParagraph?: string;
  diagramCoordinates?: { x: number; y: number };
}

export interface ExamQuestionGroupPublic {
  id: string;
  partId: string;
  groupNumber: number;
  title?: string;
  instructionHtml: string;
  questionType: ExamQuestionType;
  questionNumberStart: number;
  questionNumberEnd: number;
  sharedOptions?: ExamQuestionOption[];
  summaryTemplateHtml?: string;
  diagramImageUrl?: string;
  maxWords?: number;
  maxSelections?: number;
  questions: ExamQuestionPublic[];
}

export interface ExamQuestionGroupAuthoring
  extends Omit<ExamQuestionGroupPublic, "questions"> {
  questions: ExamQuestionAuthoring[];
}

export interface ExamPartSummary {
  id: string;
  partNumber: number;
  partType: ExamPartType;
  title: string;
  questionCount: number;
  questionNumberRange: { start: number; end: number };
  durationSeconds?: number;
  available: boolean;
}

export interface ExamPartPublic {
  id: string;
  partNumber: number;
  partType: ExamPartType;
  title: string;
  instructions?: string;
  passageTitle?: string;
  passageHtml?: string;
  paragraphs?: ExamPassageParagraph[];
  audioAsset?: ExamAudioAssetPublic;
  durationSeconds?: number;
  questionCount: number;
  questionNumberRange: { start: number; end: number };
  questionGroups: ExamQuestionGroupPublic[];
}

export interface ExamPartAuthoring extends Omit<ExamPartPublic, "questionGroups"> {
  questionGroups: ExamQuestionGroupAuthoring[];
  transcript?: string;
  sourcePartId?: string;
}

export interface ExamActiveAttemptBanner {
  attemptId: string;
  mode: ExamMode;
  partId?: string | null;
  startedAt: string;
  expiresAt: string;
  answeredCount: number;
  totalQuestions: number;
}

export interface ExamTestSummary {
  id: string;
  title: string;
  subtitle?: string;
  skill: ExamSkill;
  status: ExamTestStatus;
  version: number;
  partCount: number;
  totalQuestions: number;
  totalDurationSeconds: number;
  difficulty?: ExamDifficulty | string;
  tags: string[];
  allowedModes: ExamMode[];
  createdBy?: { id: string; fullName: string };
  parts: ExamPartSummary[];
  updatedAt: string;
  publishedAt?: string;
}

export interface ExamTestDetailStudent extends Omit<ExamTestSummary, "parts"> {
  instructions?: string;
  parts: ExamPartPublic[];
  activeAttempt?: ExamActiveAttemptBanner | null;
}

export interface ExamTestDetailAuthoring extends Omit<ExamTestSummary, "parts"> {
  instructions?: string;
  parts: ExamPartAuthoring[];
}

export interface StartExamAttemptRequest {
  testId: string;
  mode: ExamMode;
  partId?: string | null;
  studentAssignmentId?: string | null;
}

export interface ExamAttemptDetail {
  attemptId: string;
  testId: string;
  testTitle: string;
  skill: ExamSkill;
  mode: ExamMode;
  status: ExamAttemptStatus;
  partId?: string | null;
  studentAssignmentId?: string | null;
  revision: number;
  startedAt: string;
  expiresAt: string;
  serverTime: string;
  remainingSeconds: number;
  durationSeconds: number;
  parts: ExamPartPublic[];
  answers: Record<string, ExamAnswerValue>;
  flaggedQuestionIds?: string[];
  totalQuestions: number;
  answeredCount: number;
  submittedAt?: string | null;
}

export interface SaveExamAnswersRequest {
  baseRevision: number;
  answers: Record<string, ExamAnswerValue>;
  flaggedQuestionIds?: string[];
}

export interface SaveExamAnswersResponse {
  attemptId: string;
  revision: number;
  answeredCount: number;
  savedAt: string;
  serverTime: string;
  remainingSeconds: number;
}

export interface SubmitExamAttemptRequest {
  expectedRevision: number;
  answers?: Record<string, ExamAnswerValue>;
  flaggedQuestionIds?: string[];
}

export interface ExamPartBreakdown {
  partId: string;
  partNumber: number;
  title: string;
  correctCount: number;
  totalCount: number;
  percentage: number;
}

export interface ExamQuestionTypeBreakdown {
  questionType: ExamQuestionType;
  label?: string;
  correctCount: number;
  totalCount: number;
}

export interface ExamResultResponse {
  attemptId: string;
  testId: string;
  testTitle: string;
  skill: ExamSkill;
  mode: ExamMode;
  partId?: string | null;
  studentAssignmentId?: string | null;
  status: "SUBMITTED" | "EXPIRED";
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  passed: boolean;
  passThresholdPercent: number;
  ieltsBandEstimate?: number | null;
  answerReviewAvailable: boolean;
  answerReviewLockedReason?: string | null;
  translationEligible: boolean;
  translationEligibilityHint?: string | null;
  partBreakdown: ExamPartBreakdown[];
  questionTypeBreakdown?: ExamQuestionTypeBreakdown[];
  timeSpentSeconds: number;
  submittedAt: string;
}

export interface ExamQuestionReviewItem {
  questionId: string;
  partId: string;
  partNumber: number;
  questionNumber: number;
  questionType: ExamQuestionType;
  prompt: string;
  studentAnswer: ExamAnswerValue | null;
  correctAnswer?: ExamAnswerValue;
  acceptedAnswers?: string[];
  isCorrect: boolean;
  explanation?: string;
  referenceParagraph?: string;
}

export interface ExamReviewResponse {
  attemptId: string;
  testId: string;
  testTitle: string;
  skill: ExamSkill;
  answerReviewAvailable: boolean;
  items: ExamQuestionReviewItem[];
}

export interface ExamAttemptSummaryItem {
  attemptId: string;
  testId: string;
  testTitle: string;
  skill: ExamSkill;
  mode: ExamMode;
  partId?: string | null;
  partTitle?: string | null;
  status: ExamAttemptStatus;
  scorePercent?: number | null;
  passed?: boolean | null;
  startedAt: string;
  expiresAt: string;
  submittedAt?: string | null;
}

export type ReadingTranslationEligibilityStatus =
  | "LOCKED"
  | "UNLOCKED"
  | "DRAFT"
  | "SUBMITTED"
  | "REVIEWED";

export interface ReadingTranslationPassageEligibility {
  passageId: string;
  partNumber: number;
  passageTitle: string;
  eligible: boolean;
  unlockedByAttemptId?: string | null;
  unlockedAt?: string | null;
  status: ReadingTranslationEligibilityStatus;
  lockReason?: string | null;
  updatedAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

export interface ReadingTranslationEligibilityResponse {
  testId: string;
  testTitle: string;
  passThresholdPercent: number;
  fullTestPassed: boolean;
  passages: ReadingTranslationPassageEligibility[];
}

export interface ReadingTranslationDetail {
  id?: string;
  testId: string;
  testTitle: string;
  passageId: string;
  partNumber: number;
  passageTitle: string;
  passageHtml: string;
  paragraphs?: ExamPassageParagraph[];
  status: ReadingTranslationEligibilityStatus;
  revision: number;
  textVi: string;
  teacherFeedback?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
  submittedAt?: string | null;
  studentAssignmentId?: string | null;
}

export interface SaveReadingTranslationDraftRequest {
  textVi: string;
  revision: number;
}

export interface SubmitReadingTranslationRequest {
  textVi: string;
  revision?: number;
}

export interface TeacherReadingTranslationItem {
  translationId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  testId: string;
  testTitle: string;
  passageId: string;
  partNumber: number;
  passageTitle: string;
  passageHtml: string;
  paragraphs?: ExamPassageParagraph[];
  status: "SUBMITTED" | "REVIEWED" | "DRAFT";
  textVi: string;
  teacherFeedback?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  submittedAt?: string | null;
  unlockedByAttemptId?: string | null;
  assignmentTitle?: string | null;
  courseTitle?: string | null;
}

export interface ReviewReadingTranslationRequest {
  decision: "REVIEWED" | "NEEDS_REVISION";
  feedback: string;
}

export interface ValidateExamTestIssue {
  partId?: string;
  groupId?: string;
  questionNumber?: number;
  field?: string;
  message: string;
}

export interface ValidateExamTestResponse {
  valid: boolean;
  errors: ValidateExamTestIssue[];
  warnings: ValidateExamTestIssue[];
}

export interface CreateTeacherExamTestRequest {
  title: string;
  subtitle?: string;
  skill: ExamSkill;
  difficulty?: ExamDifficulty | string;
  tags?: string[];
  totalDurationSeconds?: number;
  allowedModes?: ExamMode[];
  instructions?: string;
}

export interface UpdateTeacherExamTestRequest {
  title?: string;
  subtitle?: string;
  difficulty?: ExamDifficulty | string;
  tags?: string[];
  totalDurationSeconds?: number;
  allowedModes?: ExamMode[];
  instructions?: string;
}

export interface UpsertExamQuestionInput {
  id?: string;
  questionNumber: number;
  prompt: string;
  questionType: ExamQuestionType;
  options?: ExamQuestionOption[];
  maxSelections?: number;
  maxWords?: number;
  blankLabel?: string;
  assetUrl?: string;
  note?: string;
  correctAnswer: ExamAnswerValue;
  acceptedAnswers?: string[];
  explanation?: string;
  caseSensitive?: boolean;
  ignorePunctuation?: boolean;
  referenceParagraph?: string;
}

export interface UpsertExamQuestionGroupInput {
  id?: string;
  groupNumber: number;
  title?: string;
  instructionHtml: string;
  questionType: ExamQuestionType;
  sharedOptions?: ExamQuestionOption[];
  summaryTemplateHtml?: string;
  diagramImageUrl?: string;
  maxWords?: number;
  maxSelections?: number;
  questions: UpsertExamQuestionInput[];
}

export interface UpsertExamPartInput {
  partNumber: number;
  partType: ExamPartType;
  title: string;
  instructions?: string;
  passageTitle?: string;
  passageHtml?: string;
  paragraphs?: ExamPassageParagraph[];
  audioAsset?: ExamAudioAssetPublic;
  durationSeconds?: number;
  transcript?: string;
  sourcePartId?: string;
  questionGroups?: UpsertExamQuestionGroupInput[];
}


