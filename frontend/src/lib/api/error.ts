export interface ApiErrorPayload {
  statusCode: number;
  code: string;
  message: string;
  requestId?: string;
  timestamp?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly requestId?: string;
  readonly timestamp?: string;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.requestId = payload.requestId;
    this.timestamp = payload.timestamp;
    this.details = payload.details;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isRetryable(): boolean {
    return this.statusCode === 408 || this.statusCode === 429 || this.statusCode >= 500;
  }
}

const CODE_MESSAGES_VI: Record<string, string> = {
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.",
  TOO_MANY_REQUESTS:
    "Bạn đã thực hiện quá nhiều yêu cầu liên tiếp. Vui lòng chờ ít phút trước khi thử lại.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác hoặc xem tài nguyên này.",
  ANSWER_LOCKED: "Đáp án và giải thích chỉ mở khóa sau khi bạn đạt từ 70% trở lên.",
  ANSWER_REVIEW_LOCKED: "Đáp án và giải thích chỉ mở khóa sau khi bạn đạt từ 70% trở lên.",
  ASSIGNMENT_NOT_OPEN_YET: "Bài tập này chưa đến thời gian mở. Vui lòng quay lại sau.",
  EXTENSION_MONTHLY_LIMIT_REACHED: "Bạn đã sử dụng hết tối đa 3 lần xin gia hạn trong tháng này.",
  EXTENSION_ALREADY_PENDING: "Bài tập này đang có một yêu cầu gia hạn chờ duyệt.",
  ASSIGNMENT_ALREADY_PASSED: "Bài tập này đã đạt ngưỡng qua bài nên không cần xin gia hạn.",
  COURSE_ONE_ON_ONE_LIMIT:
    "Khóa học 1:1 chỉ cho phép tối đa 1 học viên đang theo học cùng lúc.",
  ALREADY_ENROLLED: "Học viên này đã được ghi danh vào khóa học.",
  EXERCISE_PUBLISHED_IMMUTABLE:
    "Đề đã xuất bản không thể sửa trực tiếp nội dung câu hỏi và đáp án. Hãy tạo phiên bản mới.",
  EXERCISE_NOT_PUBLISHED: "Chỉ có thể giao bài tập từ đề ở trạng thái Đã xuất bản.",
  AUDIO_UPLOAD_FAILED: "Tải tệp âm thanh lên không thành công. Vui lòng kiểm tra định dạng và thử lại.",
  PENALTY_ALREADY_REVERSED: "Điểm phạt này đã được hoàn tác trước đó.",
  NOT_FOUND: "Không tìm thấy dữ liệu được yêu cầu.",
  NETWORK_ERROR: "Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.",
  VALIDATION_ERROR: "Dữ liệu gửi lên hoặc phản hồi từ máy chủ không đúng định dạng.",
  INVALID_EXAM_SCOPE:
    "Phạm vi đề thi không hợp lệ. Vui lòng kiểm tra chế độ PART hoặc FULL đã chọn.",
  INVALID_QUESTION_ANSWER:
    "Định dạng câu trả lời cho một hoặc nhiều câu hỏi không hợp lệ.",
  EXAM_ACCESS_DENIED:
    "Bạn không có quyền truy cập đề thi hoặc lượt làm bài này.",
  TRANSLATION_LOCKED:
    "Phần dịch Reading này đang bị khóa. Hãy đạt tối thiểu 70% ở Passage hoặc Full Test tương ứng để mở khóa.",
  ASSIGNMENT_SCOPE_LOCKED:
    "Bài tập này yêu cầu phạm vi làm bài cố định theo quy định của giảng viên.",
  EXAM_NOT_FOUND: "Không tìm thấy đề thi hoặc phần thi được yêu cầu.",
  ATTEMPT_ALREADY_IN_PROGRESS:
    "Bạn đang có một lượt làm bài chưa hoàn tất cho đề thi này.",
  ANSWERS_REVISION_CONFLICT:
    "Phiên làm bài vừa được cập nhật từ thiết bị hoặc tab khác. Hệ thống đang đồng bộ lại dữ liệu mới nhất.",
  ATTEMPT_ALREADY_SUBMITTED: "Lượt làm bài này đã được nộp trước đó.",
  EXAM_VERSION_CONFLICT:
    "Đề đã xuất bản không thể chỉnh sửa trực tiếp. Vui lòng tạo phiên bản mới.",
  EXAM_PUBLISH_VALIDATION_FAILED:
    "Đề thi chưa đạt yêu cầu kiểm tra trước khi xuất bản. Vui lòng xem danh sách lỗi.",
  RATE_LIMITED:
    "Bạn đang thao tác quá nhanh. Vui lòng chờ giây lát rồi thử lại.",
  ATTEMPT_EXPIRED:
    "Thời gian làm bài đã hết. Hệ thống đã khóa chỉnh sửa cho lượt thi này.",
};

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError({
      statusCode: 0,
      code: "NETWORK_ERROR",
      message: error.message || CODE_MESSAGES_VI.NETWORK_ERROR!,
      timestamp: new Date().toISOString(),
    });
  }

  return new ApiError({
    statusCode: 500,
    code: "UNKNOWN_ERROR",
    message: "Đã xảy ra lỗi không xác định.",
    timestamp: new Date().toISOString(),
  });
}

export function getFriendlyErrorMessage(error: unknown): string {
  const normalized = normalizeApiError(error);
  if (normalized.code in CODE_MESSAGES_VI) {
    return CODE_MESSAGES_VI[normalized.code]!;
  }
  if (normalized.statusCode === 401) {
    return CODE_MESSAGES_VI.UNAUTHORIZED!;
  }
  if (normalized.statusCode === 429) {
    return CODE_MESSAGES_VI.TOO_MANY_REQUESTS!;
  }
  if (normalized.statusCode === 403) {
    return CODE_MESSAGES_VI.FORBIDDEN!;
  }
  if (normalized.statusCode === 404) {
    return CODE_MESSAGES_VI.NOT_FOUND!;
  }
  return normalized.message || "Không thể tải dữ liệu. Vui lòng thử lại.";
}

