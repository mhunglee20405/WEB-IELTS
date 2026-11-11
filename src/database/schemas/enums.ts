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

