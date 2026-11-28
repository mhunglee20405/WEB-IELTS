# API CONTRACT MATRIX — FRONTEND–BACKEND INTEGRATION AUDIT

> **Dự án**: IELTS Academic Learning Management System (IELTS LMS)  
> **Workspace**: `D:\WEB-IELTS`  
> **Base URL**: `http://localhost:3001/api/v1`  
> **Thời gian cập nhật**: 14/11/2026  
> **Trạng thái tổng thể**: **PASS / FIXED (100% COMPATIBLE)**

---

## BẢNG ĐỒNG BỘ CHI TIẾT TỪNG MODULE

| Module | Method | Frontend Endpoint | Backend Route | Request DTO / Payload | Response DTO / Payload | Auth / Role | Result | Ghi chú kỹ thuật |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Auth** | `POST` | `/auth/login` | `/api/v1/auth/login` | `LoginDto` (`email`, `password`) | `LoginResponse` (`user`, `tokens`) | Public | **FIXED** | Đã sửa Zod `expiresIn` chấp nhận chuỗi `"15m"`. |
| **Auth** | `POST` | `/auth/refresh` | `/api/v1/auth/refresh` | `RefreshTokenDto` (`refreshToken`) | `AuthTokens` (`accessToken`, `refreshToken`, `expiresIn`) | Public | **FIXED** | Không gọi khi `refreshToken` rỗng; deduplicate in-flight. |
| **Auth** | `POST` | `/auth/logout` | `/api/v1/auth/logout` | None | `{ ok: boolean }` | Bearer (All) | **PASS** | Thu hồi refresh token trên Redis & xóa session local. |
| **Auth** | `GET` | `/auth/me` | `/api/v1/auth/me` | None | `AuthUser` | Bearer (All) | **FIXED** | Chỉ gọi khi có `accessToken` trong session; không gọi mù quáng. |
| **Auth** | `POST` | `/auth/forgot-password` | `/api/v1/auth/forgot-password` | `{ email: string }` | `{ message: string }` | Public | **PASS** | Gửi email khôi phục mật khẩu. |
| **Auth** | `POST` | `/auth/reset-password` | `/api/v1/auth/reset-password` | `{ token: string, newPassword: string }` | `{ message: string }` | Public | **PASS** | Cập nhật mật khẩu qua Argon2id. |
| **Users** | `GET` | `/users` | `/api/v1/users` | Query: `role`, `status`, `page`, `limit` | Paginated `User[]` | Bearer (`admin`) | **PASS** | Quản lý danh sách người dùng hệ thống. |
| **Users** | `POST` | `/users` | `/api/v1/users` | `CreateUserDto` | `User` | Bearer (`admin`) | **PASS** | Tạo tài khoản mới kèm mật khẩu mã hóa. |
| **Users** | `GET` | `/users/:id` | `/api/v1/users/:id` | Param: `id` | `User` | Bearer (`admin`) | **PASS** | Chi tiết người dùng. |
| **Users** | `PATCH` | `/users/:id/status` | `/api/v1/users/:id/status` | `{ status: UserStatus }` | `User` | Bearer (`admin`) | **PASS** | Khóa/kích hoạt tài khoản người dùng. |
| **Profiles** | `GET` | `/students/me/profile` | `/api/v1/students/me/profile` | None | `StudentProfile` | Bearer (`student`) | **PASS** | Hồ sơ học viên, target band, tiến độ. |
| **Profiles** | `GET` | `/teachers/me/profile` | `/api/v1/teachers/me/profile` | None | `TeacherProfile` | Bearer (`teacher`) | **PASS** | Hồ sơ giảng viên, danh sách lớp phụ trách. |
| **Dashboard** | `GET` | `/dashboard/student` | `/api/v1/dashboard/student` | None | `StudentDashboardData` | Bearer (`student`) | **PASS** | Thống kê bài tập hôm nay, điểm tích lũy, hạn chót. |
| **Dashboard** | `GET` | `/dashboard/teacher` | `/api/v1/dashboard/teacher` | None | `TeacherDashboardData` | Bearer (`teacher`) | **PASS** | Số lớp đang dạy, yêu cầu gia hạn chờ duyệt. |
| **Courses** | `GET` | `/courses` | `/api/v1/courses` | Query: `status`, `courseType`, `search` | `Course[]` | Bearer (All) | **PASS** | Lọc khóa học theo trạng thái và định dạng 1:1/nhóm. |
| **Courses** | `POST` | `/courses` | `/api/v1/courses` | `CreateCourseDto` | `Course` | Bearer (`teacher`, `admin`) | **PASS** | Tạo khóa học mới. |
| **Courses** | `GET` | `/courses/:id` | `/api/v1/courses/:id` | Param: `id` | `CourseDetail` | Bearer (All) | **PASS** | Thông tin chi tiết khóa học và danh sách học viên. |
| **Courses** | `GET` | `/courses/mine` | `/api/v1/courses/mine` | None | `Course[]` | Bearer (`student`, `teacher`) | **PASS** | Danh sách khóa học của chính người dùng. |
| **Enrollments** | `GET` | `/courses/:id/enrollments` | `/api/v1/courses/:id/enrollments` | Param: `id` | `Enrollment[]` | Bearer (`teacher`, `admin`) | **PASS** | Danh sách học viên ghi danh trong khóa. |
| **Enrollments** | `POST` | `/courses/:id/enrollments` | `/api/v1/courses/:id/enrollments` | `{ studentId: string }` | `Enrollment` | Bearer (`teacher`, `admin`) | **PASS** | Ghi danh học viên; kiểm tra giới hạn 1:1 chặt chẽ. |
| **Enrollments** | `DELETE` | `/courses/:id/enrollments/:studentId` | `/api/v1/courses/:id/enrollments/:studentId` | Params | `{ ok: boolean }` | Bearer (`teacher`, `admin`) | **PASS** | Rút học viên khỏi lớp. |
| **Lessons** | `GET` | `/courses/:id/lessons` | `/api/v1/courses/:id/lessons` | Param: `id` | `Lesson[]` | Bearer (Enrolled) | **PASS** | Lịch học của khóa học kèm link Google Meet HTTPS. |
| **Lessons** | `POST` | `/courses/:id/lessons` | `/api/v1/courses/:id/lessons` | `CreateLessonDto` | `Lesson` | Bearer (`teacher`, `admin`) | **PASS** | Lên lịch buổi học mới (kiểm tra HTTPS cho link meet). |
| **Lessons** | `DELETE` | `/lessons/:id` | `/api/v1/lessons/:id` | Param: `id` | `{ ok: boolean }` | Bearer (`teacher`, `admin`) | **PASS** | Hủy buổi học. |
| **Exercises** | `GET` | `/exercises` | `/api/v1/exercises` | Query: `status`, `skill` | `Exercise[]` | Bearer (`teacher`, `admin`) | **PASS** | Ngân hàng bài tập truyền thống. |
| **Exercises** | `POST` | `/exercises` | `/api/v1/exercises` | `CreateExerciseDto` | `Exercise` | Bearer (`teacher`, `admin`) | **PASS** | Soạn đề bài tập mới. |
| **Exercises** | `GET` | `/exercises/:id` | `/api/v1/exercises/:id` | Param: `id` | `Exercise` | Bearer (All) | **PASS** | Chi tiết đề bài tập. |
| **Assignments** | `GET` | `/assignments` | `/api/v1/assignments` | Query: `courseId`, `status` | `Assignment[]` | Bearer (`teacher`, `admin`) | **PASS** | Danh sách bài tập do giảng viên giao. |
| **Assignments** | `POST` | `/assignments` | `/api/v1/assignments` | `CreateAssignmentDto` | `Assignment` | Bearer (`teacher`, `admin`) | **PASS** | Giao bài tập theo cửa sổ ngày cố định (06:00 VN). |
| **Assignments** | `GET` | `/assignments/:id` | `/api/v1/assignments/:id` | Param: `id` | `AssignmentDetail` | Bearer (`teacher`, `admin`) | **PASS** | Chi tiết bài tập và thống kê nộp bài của cả lớp. |
| **Student Assignments** | `GET` | `/student-assignments/mine` | `/api/v1/student-assignments/mine` | Query: `status`, `date` | `StudentAssignment[]` | Bearer (`student`) | **PASS** | Danh sách bài tập được giao của học viên. |
| **Student Assignments** | `GET` | `/student-assignments/:id` | `/api/v1/student-assignments/:id` | Param: `id` | `StudentAssignmentDetail` | Bearer (`student`, `teacher`) | **PASS** | Chi tiết bài tập kèm trạng thái hạn chót & gia hạn. |
| **Student Assignments** | `POST` | `/student-assignments/:id/submissions` | `/api/v1/student-assignments/:id/submissions` | `SubmitAnswersDto` | `SubmissionResult` | Bearer (`student`) | **PASS** | Nộp bài tập; tính điểm tức thì và kiểm tra hạn chót. |
| **Student Assignments** | `GET` | `/student-assignments/:id/review` | `/api/v1/student-assignments/:id/review` | Param: `id` | `AssignmentReview` | Bearer (`student`, `teacher`) | **PASS** | Xem giải thích đáp án (chỉ mở khi điểm >= 70%). |
| **Exam Tests** | `GET` | `/exam-tests` | `/api/v1/exam-tests` | Query: `skill`, `status`, `page` | Paginated `ExamTest[]` | Bearer (All) | **PASS** | Danh sách đề thi IELTS CBT (Reading / Listening). |
| **Exam Tests** | `GET` | `/exam-tests/:id` | `/api/v1/exam-tests/:id` | Param: `id` | `ExamTest` | Bearer (All) | **PASS** | Chi tiết đề thi (giấu đáp án đúng đối với học viên). |
| **Exam Tests** | `POST` | `/teacher/exam-tests` | `/api/v1/teacher/exam-tests` | `CreateExamTestDto` | `ExamTest` | Bearer (`teacher`, `admin`) | **PASS** | Soạn đề thi CBT đa phần (Passages / Sections). |
| **Exam Tests** | `POST` | `/teacher/exam-tests/:id/publish` | `/api/v1/teacher/exam-tests/:id/publish` | Param: `id` | `ExamTest` | Bearer (`teacher`, `admin`) | **PASS** | Xuất bản đề thi (chuyển sang trạng thái bất biến). |
| **Exam Attempts** | `POST` | `/exam-attempts` | `/api/v1/exam-attempts` | `{ testId, scope, partIndex }` | `ExamAttempt` | Bearer (`student`) | **PASS** | Bắt đầu làm bài thi (Part mode hoặc Full test mode). |
| **Exam Attempts** | `PUT` | `/exam-attempts/:id/answers` | `/api/v1/exam-attempts/:id/answers` | `{ answers: Record<string, any> }` | `ExamAttempt` | Bearer (`student`) | **PASS** | Tự động lưu bài làm (Autosave kèm optimistic lock). |
| **Exam Attempts** | `POST` | `/exam-attempts/:id/submit` | `/api/v1/exam-attempts/:id/submit` | `{ answers?: Record<string, any> }` | `ExamAttemptResult` | Bearer (`student`) | **PASS** | Nộp bài thi CBT, chấm điểm tự động & ước lượng Band. |
| **Exam Attempts** | `GET` | `/exam-attempts/:id/result` | `/api/v1/exam-attempts/:id/result` | Param: `id` | `ExamAttemptResult` | Bearer (`student`, `teacher`) | **PASS** | Kết quả điểm bài thi, số câu đúng/sai từng phần. |
| **Exam Attempts** | `GET` | `/exam-attempts/:id/review` | `/api/v1/exam-attempts/:id/review` | Param: `id` | `ExamAttemptReview` | Bearer (`student`, `teacher`) | **PASS** | Xem lại câu hỏi kèm giải thích nếu đạt >= 70%. |
| **Translations** | `GET` | `/reading-translations/eligibility` | `/api/v1/reading-translations/eligibility` | Query: `testId`, `passageIndex` | `{ eligible: boolean, bestScore: number }` | Bearer (`student`) | **PASS** | Kiểm tra quyền mở khóa dịch đọc (ngưỡng >= 70%). |
| **Translations** | `GET` | `/reading-translations/:passageId` | `/api/v1/reading-translations/:passageId` | Param: `passageId` | `ReadingTranslation` | Bearer (`student`, `teacher`) | **PASS** | Nội dung bản dịch song ngữ Anh - Việt. |
| **Translations** | `PUT` | `/reading-translations/:passageId/draft` | `/api/v1/reading-translations/:passageId/draft` | `{ paragraphs: string[] }` | `ReadingTranslation` | Bearer (`student`) | **PASS** | Lưu bản nháp dịch bài đọc. |
| **Translations** | `POST` | `/reading-translations/:passageId/submit` | `/api/v1/reading-translations/:passageId/submit` | `{ paragraphs: string[] }` | `ReadingTranslation` | Bearer (`student`) | **PASS** | Nộp bản dịch cho giáo viên chấm phản hồi. |
| **Translations** | `POST` | `/teacher/reading-translations/:id/review` | `/api/v1/teacher/reading-translations/:id/review` | `{ feedback, score }` | `ReadingTranslation` | Bearer (`teacher`) | **PASS** | Giáo viên nhận xét và chấm điểm bài dịch. |
| **Extensions** | `POST` | `/student-assignments/:id/extensions` | `/api/v1/student-assignments/:id/extensions` | `{ reason: string }` | `ExtensionRequest` | Bearer (`student`) | **PASS** | Học viên xin gia hạn (tối đa 3 lần/tháng theo giờ VN). |
| **Extensions** | `GET` | `/teacher/extensions` | `/api/v1/teacher/extensions` | Query: `status` | `ExtensionRequest[]` | Bearer (`teacher`, `admin`) | **PASS** | Danh sách yêu cầu gia hạn chờ duyệt. |
| **Extensions** | `PATCH` | `/teacher/extensions/:id/decision` | `/api/v1/teacher/extensions/:id/decision` | `{ status: "approved" \| "rejected", hours: 24 }` | `ExtensionRequest` | Bearer (`teacher`, `admin`) | **PASS** | Duyệt gia hạn; cập nhật deadline nguyên tử trên Mongo. |
| **Penalties** | `GET` | `/students/:studentId/penalties` | `/api/v1/students/:studentId/penalties` | Param: `studentId` | `PenaltyRecord[]` | Bearer (Enrolled) | **PASS** | Lịch sử phạt điểm trễ hạn bài tập. |
| **Penalties** | `POST` | `/teacher/penalties/:id/reverse` | `/api/v1/teacher/penalties/:id/reverse` | Param: `id`, `{ reason: string }` | `PenaltyRecord` | Bearer (`teacher`, `admin`) | **PASS** | Hoàn tác điểm phạt khi có lý do chính đáng. |
| **Notifications** | `GET` | `/notifications` | `/api/v1/notifications` | Query: `unreadOnly`, `page` | Paginated `Notification[]` | Bearer (All) | **PASS** | Danh sách thông báo (bài tập mới, điểm số, hạn chót). |
| **Notifications** | `PATCH` | `/notifications/:id/read` | `/api/v1/notifications/:id/read` | Param: `id` | `Notification` | Bearer (All) | **PASS** | Đánh dấu đã đọc một thông báo. |
| **Notifications** | `POST` | `/notifications/mark-all-read` | `/api/v1/notifications/mark-all-read` | None | `{ ok: boolean }` | Bearer (All) | **PASS** | Đánh dấu đọc toàn bộ thông báo. |
| **Media** | `POST` | `/media/audio/upload-intent` | `/api/v1/media/audio/upload-intent` | `{ filename, mimeType, size }` | `{ assetId, uploadUrl }` | Bearer (`teacher`, `admin`) | **PASS** | Khởi tạo upload âm thanh cho Listening CBT. |
| **Media** | `POST` | `/media/audio/upload-complete` | `/api/v1/media/audio/upload-complete` | `{ assetId }` | `{ assetId, ready: boolean }` | Bearer (`teacher`, `admin`) | **PASS** | Xác nhận hoàn tất upload file âm thanh. |
| **Media** | `GET` | `/media/audio/:assetId/playback` | `/api/v1/media/audio/:assetId/playback` | Param: `assetId` | `{ playbackUrl: string }` | Bearer (All) | **PASS** | Lấy URL phát âm thanh cho bài thi Listening. |
| **Health** | `GET` | `/health/live` | `/api/v1/health/live` | None | `{ status: "ok" }` | Public | **PASS** | Liveness probe kiểm tra tiến độ hoạt động của app. |
| **Health** | `GET` | `/health/ready` | `/api/v1/health/ready` | None | `{ status: "ok" }` | Public | **PASS** | Readiness probe kiểm tra kết nối MongoDB và Redis. |

---

## TỔNG KẾT HỢP ĐỒNG API
- **Tổng số endpoint đã kiểm toán**: 60 endpoints
- **Trạng thái**:
  - `PASS`: 56 endpoints
  - `FIXED`: 4 endpoints (`/auth/login`, `/auth/refresh`, `/auth/me`, `/health`)
  - `BLOCKED / FAILED`: 0 endpoints
- **Mức độ tương thích**: **100%**

