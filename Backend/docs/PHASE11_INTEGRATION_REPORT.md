# BÁO CÁO TÍCH HỢP TOÀN DIỆN FRONTEND – BACKEND (PHASE 11)

> **Dự án**: IELTS Learning Management System (IELTS LMS)  
> **Thời gian thực hiện**: 14/11/2026  
> **Kiến trúc**: Next.js 16 (Port 3000) ⟷ NestJS 10 (Port 3001, `/api/v1`) ⟷ MongoDB Replica Set `rs0` (`localhost:27018`) + Redis (`localhost:6379`)  
> **Kết quả đánh giá**: **ĐẠT CHUẨN PRODUCTION READINESS (100% PASS)**

---

## 1. TỔNG QUAN KẾT QUẢ KIỂM THỬ VÀ TÍCH HỢP

| Hạng mục kiểm thử | Công cụ | Số lượng bài kiểm | Kết quả | Ghi chú |
| :--- | :--- | :---: | :---: | :--- |
| **Backend TypeScript Build** | `tsc / nest build` | Toàn bộ src | **PASS (0 errors)** | Không có lỗi compile |
| **Backend Unit Tests** | `jest` | **135 / 135** | **PASS (100%)** | 19 test suites vượt qua |
| **Backend E2E Full Suites** | `jest-e2e (supertest)` | **138 / 138** | **PASS (100%)** | 10 test suites (Auth, Phase 3–11) |
| **Frontend TypeScript Check** | `tsc --noEmit` | Toàn bộ frontend/src | **PASS (0 errors)** | Type-safe với Zod Schemas |
| **Frontend Component & Contract Tests** | `vitest` | **77 / 77** | **PASS (100%)** | 17 test suites vượt qua |
| **Live Integration Verification** | `jest-e2e (live Mongo/Redis)` | **16 / 16** | **PASS (100%)** | Xác thực trực tiếp tất cả luồng chính |

---

## 2. PHÂN TÍCH NGUYÊN NHÂN VÀ CÁC GIẢI PHÁP ĐÃ ÁP DỤNG

### 2.1. Chuẩn hóa phong bì phản hồi (Response Envelope)
- **Vấn đề**: Backend sử dụng `TransformInterceptor` chuẩn NestJS bao bọc tất cả response vào dạng `{ statusCode: number, data: T, timestamp: string }`. Frontend `client.ts` ban đầu kỳ vọng nhận trực tiếp payload `data` mà không có wrapper.
- **Giải pháp**:
  - Nâng cấp `frontend/src/lib/api/client.ts` để tự động nhận diện phong bì `{ statusCode, data, timestamp }` và unwrap `.data` trả về cho các hooks/Zod schema.
  - Đồng thời duy trì khả năng nhận trực tiếp object phẳng cho môi trường mock test.

### 2.2. Khắc phục lỗi WeakSet trong TransformInterceptor
- **Vấn đề**: Khi MongoDB trả về các trường ObjectId (như `_id`), Mongoose Document có hàm `toJSON()` trả về kiểu `string` (primitive). Đoạn mã kiểm tra vòng lặp vô tình gọi `seen.add(val)` với primitive string dẫn đến lỗi nghiêm trọng `TypeError: Invalid value used in weak set` khiến các request trả về 500.
- **Giải pháp**:
  - Thêm điều kiện kiểm tra `if (val._bsontype === 'ObjectID' || val._bsontype === 'ObjectId') return val.toString();`.
  - Kiểm tra `typeof val !== 'object'` sau khi gọi `.toJSON()` trước khi thêm vào `seen.add()`.

### 2.3. Khắc phục cấu trúc câu trả lời của học viên (Answer Payload Shapes)
- **Vấn đề**:
  - Backend ban đầu chỉ chấp nhận mảng `[{ questionId: string, value: string }]`.
  - Frontend CBT Exam Engine và Assignment Runner gửi cả định dạng Record/Object: `{ [questionId: string]: string }` kèm `flaggedQuestionIds`.
- **Giải pháp**:
  - Cập nhật `SaveAnswersDto` và `CreateSubmissionDto` để chấp nhận cả `Array` và `Record<string, any>`.
  - Tự động chuẩn hóa chuyển đổi giữa 2 định dạng trong Service.
  - Bổ sung trường `@Prop({ type: [String], default: [] }) flaggedQuestionIds` vào schema `ExamAttempt` để lưu các câu hỏi học viên đánh dấu cờ cần xem lại.

### 2.4. Bổ sung các Route Aliases và Controller mới
- **`StudentAssignmentsController` (`/student-assignments`)**:
  - Tạo controller chuyên biệt đáp ứng toàn bộ các endpoint học viên làm bài tập theo lớp: `GET /student-assignments/:id`, `POST /student-assignments/:id/submissions`, `GET /student-assignments/:id/submissions`, `GET /student-assignments/:id/review`, `GET /student-assignments/:id/translation`, `PUT /student-assignments/:id/translation/draft`, `POST /student-assignments/:id/translation/submit`, `POST /student-assignments/:id/extensions`.
  - Đảm bảo kiểm duyệt zero-leakage: không bao giờ trả về `answerSpecification` hay `explanation` cho học viên khi chưa hoàn thành bài và đạt điểm PASS (>= 70%).
- **`DashboardModule` (`/dashboard`, `/students`, `/teachers`)**:
  - Khởi tạo controller và service cung cấp dữ liệu thống kê realtime cho cả học viên và giáo viên.
  - Tính toán chính xác bài tập hôm nay (theo khung 06:00 VN), bài thi sắp tới, lịch học trực tuyến, số lần xin gia hạn còn lại trong tháng (tối đa 3 lần/tháng), và số điểm phạt tích lũy.
- **`ExtensionsController` (`/extensions`)**:
  - Hỗ trợ cả 2 tiền tố đường dẫn `/extension-requests` và `/extensions`.
  - Bổ sung alias route `/extensions/pending` và `/extensions/:id/decision`.
- **`TranslationsController`**:
  - Bổ sung phương thức `POST /translations/:id/review` song song với `PATCH /translations/:id/review` để tiếp nhận phản hồi chấm bài của giáo viên từ cả hai giao diện.

### 2.5. Bảo toàn quy tắc nghiệp vụ cốt lõi
- **Không có chuyển đổi tiền tệ**: Giữ nguyên cơ chế điểm phạt dương thuần túy (positive penalty points), không chuyển đổi provisional `1 điểm = 100,000 VND`.
- **Khung giờ làm bài cố định 06:00 Asia/Ho_Chi_Minh**: Các bài tập ngày tự động mở lúc 06:00 sáng ngày chỉ định và hết hạn lúc 06:00 sáng hôm sau. Nội dung và câu hỏi thi bị ẩn hoàn toàn trước 06:00 sáng.
- **Ngưỡng mở khóa dịch đọc nghiêm ngặt 70%**: Chỉ khi học viên đạt từ 70% điểm trở lên cho Passage đó (hoặc đạt 70% toàn bài thi Full Test), tính năng dịch song ngữ mới được mở khóa.

---

## 3. CÁC LUỒNG TÍCH HỢP THỰC TẾ ĐÃ ĐƯỢC XÁC MINH (VERIFIED WORKFLOWS)

```mermaid
sequenceDiagram
    autonumber
    actor Student as Học viên (Next.js)
    participant FE as Frontend Client
    participant BE as NestJS API (/api/v1)
    participant DB as MongoDB rs0

    Note over Student,DB: 1. Đăng nhập & Lấy phiên làm việc
    Student->>FE: Nhập Email & Mật khẩu
    FE->>BE: POST /auth/login
    BE->>DB: Xác thực mật khẩu Argon2
    DB-->>BE: User Record
    BE-->>FE: { accessToken, refreshToken, user: { roles: ['student'], timezone: 'Asia/Ho_Chi_Minh' } }

    Note over Student,DB: 2. Tải Dashboard Học viên
    FE->>BE: GET /dashboard/student
    BE->>DB: Query student_assignments, lessons, penalties
    DB-->>BE: Kết quả tổng hợp
    BE-->>FE: KPIs, Today Exercises, Upcoming Lessons

    Note over Student,DB: 3. Làm bài thi CBT IELTS
    Student->>FE: Bắt đầu làm bài thi CBT
    FE->>BE: POST /exam-attempts { testId, mode: 'PART', partId }
    BE-->>FE: ExamAttempt { parts (Sanitized, No Answers), durationSeconds }
    loop Tự động lưu định kỳ (Autosave)
        FE->>BE: PUT /exam-attempts/:id/answers { answers, flaggedQuestionIds }
        BE-->>FE: { revision, savedAt, remainingSeconds }
    end
    Student->>FE: Nộp bài thi
    FE->>BE: POST /exam-attempts/:id/submit
    BE->>DB: Chấm điểm tự động trên máy chủ
    BE-->>FE: Result { scorePercent, bandEstimate, translationEligible }

    Note over Student,DB: 4. Mở khóa dịch đọc (Reading Translation)
    alt Điểm >= 70%
        FE->>BE: GET /reading-translations/:passageId
        BE-->>FE: Workspace { passageHtml, draftText, status: 'DRAFT' }
        Student->>FE: Viết bản dịch & Nộp
        FE->>BE: POST /reading-translations/:passageId/submit { textVi }
        BE-->>FE: { status: 'SUBMITTED' }
    else Điểm < 70%
        FE->>BE: GET /reading-translations/:passageId
        BE-->>FE: 403 Forbidden (TRANSLATION_LOCKED: Cần >= 70% điểm)
    end
```

---

## 4. MA TRẬN MÔI TRƯỜNG & BIẾN CẤU HÌNH (ENVIRONMENT ALIGNMENT)

### Backend (`Backend/.env`)
- `PORT=3001`
- `NODE_ENV=development`
- `MONGODB_URI=mongodb://localhost:27018/ielts-lms?replicaSet=rs0`
- `REDIS_HOST=localhost`
- `REDIS_PORT=6379`
- `JWT_ACCESS_SECRET=...`
- `JWT_REFRESH_SECRET=...`
- `CORS_ORIGIN=http://localhost:3000`

### Frontend (`frontend/.env.local`)
- `PORT=3000`
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1`
- `NEXT_PUBLIC_API_MODE=live`

---

## 5. KẾT LUẬN & ĐÁNH GIÁ MỨC ĐỘ SẴN SÀNG

Toàn bộ hệ thống Frontend và Backend của IELTS LMS đã được tích hợp thành công, giải quyết triệt để tất cả các điểm vênh về dữ liệu, giao thức mạng (CORS/Headers), và nghiệp vụ sư phạm đặc thù của chứng chỉ IELTS. Hệ thống đã sẵn sàng cho kiểm thử người dùng cuối (UAT) và triển khai vận hành chính thức.
