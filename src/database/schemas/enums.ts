// Shared enums used across schemas
export enum UserRole {
  STUDENT = 'student',
  TEACHER = 'teacher',
  ADMIN = 'admin',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

export enum CourseType {
  ONE_TO_ONE = 'one_to_one',
  GROUP = 'group',
}

export enum CourseStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

export enum LessonStatus {
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum ExerciseType {
  READING = 'reading',
  LISTENING = 'listening',
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  TRUE_FALSE_NOT_GIVEN = 'true_false_not_given',
  YES_NO_NOT_GIVEN = 'yes_no_not_given',
  MATCHING = 'matching',
  MATCHING_HEADINGS = 'matching_headings',
  MATCHING_INFORMATION = 'matching_information',
  SENTENCE_COMPLETION = 'sentence_completion',
  SUMMARY_COMPLETION = 'summary_completion',
  FILL_BLANK = 'fill_blank',
  SHORT_ANSWER = 'short_answer',
}

export enum ExerciseStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum AssignmentStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum StudentAssignmentStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  SUBMITTED = 'submitted',
  PASSED = 'passed',
  OVERDUE = 'overdue',
  EXCUSED = 'excused',
}

export enum EnrollmentStatus {
  ACTIVE = 'active',
  DROPPED = 'dropped',
  COMPLETED = 'completed',
}

export enum TranslationSubmissionStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  REVIEWED = 'reviewed',
}

export enum ExtensionRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

export enum NotificationType {
  NEW_ASSIGNMENT = 'new_assignment',
  OVERDUE = 'overdue',
  COURSE_ENROLLED = 'course_enrolled',
  EXTENSION_REVIEWED = 'extension_reviewed',
  OTHER = 'other',
}

export enum EmailDeliveryStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  FAILED = 'failed',
}

// ─── Phase 9: Exam Enums ──────────────────────────────────────────────────────

export enum ExamSkill {
  READING = 'READING',
  LISTENING = 'LISTENING',
}

export enum ExamMode {
  PART = 'PART',
  FULL = 'FULL',
}

export enum PartType {
  PASSAGE = 'PASSAGE',
  SECTION = 'SECTION',
}

export enum AttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  AUTO_SUBMITTED = 'AUTO_SUBMITTED',
  EXPIRED = 'EXPIRED',
}

export enum ExamTestStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum ExamPreset {
  IELTS_ACADEMIC = 'IELTS_ACADEMIC',
  CUSTOM = 'CUSTOM',
}

export enum ExamQuestionType {
  MULTIPLE_CHOICE_SINGLE = 'MULTIPLE_CHOICE_SINGLE',
  MULTIPLE_CHOICE_MULTIPLE = 'MULTIPLE_CHOICE_MULTIPLE',
  TRUE_FALSE_NOT_GIVEN = 'TRUE_FALSE_NOT_GIVEN',
  YES_NO_NOT_GIVEN = 'YES_NO_NOT_GIVEN',
  MATCHING_HEADINGS = 'MATCHING_HEADINGS',
  MATCHING_INFORMATION = 'MATCHING_INFORMATION',
  MATCHING_FEATURES = 'MATCHING_FEATURES',
  MATCHING_SENTENCE_ENDINGS = 'MATCHING_SENTENCE_ENDINGS',
  SENTENCE_COMPLETION = 'SENTENCE_COMPLETION',
  SUMMARY_COMPLETION = 'SUMMARY_COMPLETION',
  NOTE_COMPLETION = 'NOTE_COMPLETION',
  TABLE_COMPLETION = 'TABLE_COMPLETION',
  FLOW_CHART_COMPLETION = 'FLOW_CHART_COMPLETION',
  DIAGRAM_LABEL_COMPLETION = 'DIAGRAM_LABEL_COMPLETION',
  SHORT_ANSWER = 'SHORT_ANSWER',
}

