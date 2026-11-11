export const ROLES = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const TIMEZONE_VN = 'Asia/Ho_Chi_Minh';

export const PASS_SCORE_PERCENT = 70;

export const MAX_EXTENSION_REQUESTS_PER_MONTH = 3;

export const PENALTY_DELTA_POINTS = 1;

export const JWT_COOKIE_NAME = 'refresh_token';

export const QUEUE_NAMES = {
  MAIL: 'mail',
  DEADLINE_CHECK: 'deadline-check',
  PENALTY: 'penalty',
  NOTIFICATION: 'notification',
} as const;

export const JOB_NAMES = {
  SEND_EMAIL: 'send-email',
  CHECK_OVERDUE: 'check-overdue',
  APPLY_PENALTY: 'apply-penalty',
  SEND_NOTIFICATION: 'send-notification',
} as const;

