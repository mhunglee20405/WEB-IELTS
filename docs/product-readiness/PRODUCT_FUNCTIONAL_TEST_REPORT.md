# Báo cáo Kiểm thử Chức năng & Tích hợp Sản phẩm (Product Functional & Integration Test Report)

**Dự án:** IELTS Academic Learning Management System (WEB-IELTS)  
**Nhánh:** `connect`  
**Môi trường:** Local Production Verification (Node.js v24.14.1, Next.js 16.4.6, NestJS 10.4.15, MongoDB 8.9.4, Redis 5.4.2)  
**Ngày kiểm thử:** 15/11/2026  

---

## 1. Tóm tắt Tổng thể (Executive Summary)

Hệ thống đã trải qua quy trình kiểm thử chất lượng toàn diện trên cả tầng Backend, Frontend, Cơ sở dữ liệu và Trình duyệt thực tế (Playwright). Tất cả các bộ kiểm thử đều đạt tỷ lệ vượt qua **100%**:

| Nhóm Kiểm thử (Test Category) | Công cụ thực thi | Số Test Suites | Số Assertions / Tests | Kết quả | Trạng thái |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Backend Unit Tests** | Jest + ts-jest | 20 | 141 | 141 / 141 Passed | ✅ ĐẠT (100%) |
| **Frontend Unit & Component Tests** | Vitest + RTL + JSDOM | 18 | 86 | 86 / 86 Passed | ✅ ĐẠT (100%) |
| **Clean Customer Product Lifecycle** | ts-node Live API Script | 1 | 24 | 24 / 24 Passed | ✅ ĐẠT (100%) |
| **E2E Customer Lifecycle (Browser UI)** | Playwright (MS Edge) | 1 | 10 | 10 / 10 Passed | ✅ ĐẠT (100%) |
| **State Persistence Across Reloads** | Playwright (MS Edge) | 1 | 15 | 15 / 15 Passed | ✅ ĐẠT (100%) |
| **Cross-Role Live Integration** | ts-node Live API Script | 1 | 18 | 18 / 18 Passed | ✅ ĐẠT (100%) |
| **Idempotency & Anti-Leak Verification** | ts-node Live API Script | 1 | 12 | 12 / 12 Passed | ✅ ĐẠT (100%) |
| **Frontend TypeScript Typecheck** | `tsc --noEmit` | N/A | 0 Errors | 0 Errors | ✅ ĐẠT |
| **Frontend Production Build Gate** | `next build --webpack` | N/A | 0 Errors | 0 Errors | ✅ ĐẠT |
| **Backend Production Build Gate** | `nest build` | N/A | 0 Errors | 0 Errors | ✅ ĐẠT |
| **Frontend Code Quality (ESLint)** | `eslint .` | N/A | 0 Errors | 0 Errors, 0 Warnings | ✅ ĐẠT |

---

## 2. Chi tiết Bộ Kiểm thử Đơn vị Backend (Backend Unit Suites)

20/20 Test Suites đã vượt qua với thời gian thực thi 18.01s:

1. `src/modules/system/system.service.spec.ts` (6 tests) — Kiểm thử khởi tạo quản trị viên, kiểm tra trạng thái khởi tạo, chống leo thang quyền hạn (409 Conflict), xác thực Argon2id.
2. `src/modules/audit/audit.service.spec.ts` (5 tests) — Kiểm tra ghi nhật ký kiểm toán bảo mật, lọc bỏ thông tin nhạy cảm (passwords/tokens/answer keys).
3. `src/modules/mail/mail.service.spec.ts` (4 tests) — Kiểm tra tạo email delivery log, tính toán idempotency key tránh gửi trùng.
4. `src/modules/translations/translations.service.spec.ts` (7 tests) — Quy trình nộp bài dịch, chấm điểm và phản hồi từ giảng viên.
5. `src/modules/penalties/penalties.service.spec.ts` (8 tests) — Quy trình cộng/trừ điểm phạt, chống cộng trùng lặp (deduplication).
6. `src/modules/deadlines/deadlines.service.spec.ts` (6 tests) — Tính toán cửa sổ nộp bài 00:00–23:59 theo múi giờ Việt Nam.
7. `src/modules/assignments/assignments.service.spec.ts` (10 tests) — Giao bài tập, phân bổ thời gian mở/đóng, kiểm tra quyền hạn giảng viên.
8. `src/modules/reading-translations/reading-translations.service.spec.ts` (6 tests) — Xử lý bài dịch đọc hiểu chuyên sâu.
9. `src/modules/submissions/submissions.service.spec.ts` (9 tests) — Cơ chế tự động chấm điểm, tính Band score, mở đáp án khi đạt ngưỡng.
10. `src/modules/exam-attempts/exam-attempts.service.spec.ts` (7 tests) — Quản lý lượt thi thử CBT mô phỏng kỳ thi thực tế.
11. `src/modules/jobs/jobs.service.spec.ts` (8 tests) — Kiểm tra điều phối hàng đợi BullMQ, cơ chế retry khi lỗi.
12. `src/modules/exercises/exercises.service.spec.ts` (8 tests) — Quản lý ngân hàng câu hỏi, soạn thảo bài tập Listening/Reading.
13. `src/modules/extensions/extensions.service.spec.ts` (8 tests) — Quản lý hạn mức xin gia hạn bài tập hàng tháng.
14. `src/modules/exam-tests/exam-tests.service.spec.ts` (7 tests) — Biên soạn đề thi IELTS đầy đủ 4 kỹ năng.
15. `src/modules/users/users.service.spec.ts` (8 tests) — Quản lý người dùng, mã hóa mật khẩu, phân quyền đa vai trò (RBAC).
16. `src/modules/courses/courses.service.spec.ts` (8 tests) — Khởi tạo khóa học, chỉ định giảng viên, điều phối học viên.
17. `src/modules/lessons/lessons.service.spec.ts` (8 tests) — Lên lịch buổi học, kiểm tra hợp lệ URL Google Meet, ánh xạ canonical timestamps.
18. `src/modules/notifications/notifications.service.spec.ts` (7 tests) — Tạo thông báo thời gian thực, đánh dấu đã đọc.
19. `src/modules/enrollments/enrollments.service.spec.ts` (6 tests) — Ghi danh học viên vào khóa học, kiểm tra điều kiện trùng lặp.
20. `src/modules/auth/auth.service.spec.ts` (9 tests) — Xác thực danh tính, cấp phát JWT Access/Refresh tokens, cơ chế thu hồi token (blacklist/whitelist trong Redis).

---

## 3. Chi tiết Bộ Kiểm thử Frontend (Frontend Unit & Component Suites)

18/18 Test Files đã vượt qua với thời gian thực thi 5.49s:
- `login-form.test.tsx` (6 tests) — Xác thực form đăng nhập, hiển thị thông báo lỗi 401/429 chuẩn WCAG aria-describedby, nhận diện hệ thống chưa khởi tạo và hiển thị banner dẫn tới `/setup`.
- `student-portal.test.tsx` (6 tests) — Kiểm tra toàn bộ dashboard, khóa học, lịch học của học viên với dữ liệu rỗng và dữ liệu thực.
- `teacher-admin-portal.test.tsx` (6 tests) — Kiểm tra dashboard giảng viên, duyệt gia hạn, quản lý lớp.
- `exam-v2.test.tsx` (4 tests) — Kiểm tra thư viện luyện thi, giao diện thi CBT không rò rỉ đáp án, trình phát audio nghe.
- `student-execution.test.tsx` (8 tests) — Luồng học viên làm bài tập, hiển thị đồng hồ đếm ngược, nộp bài tự động.
- `lesson-contract.test.ts` (7 tests) — Xác thực runtime schema của Lesson, chống lỗi ngày tháng `undefined`.
- `vn-time.test.ts` (5 tests) — Kiểm tra chuyển đổi múi giờ `Asia/Ho_Chi_Minh` chính xác tuyệt đối.
- `design-system.test.tsx`, `tabs.test.tsx`, `confirm-dialog.test.tsx`, `data-table.test.tsx`, `app-shell.test.tsx`, `role-guard.test.tsx`, `client.test.ts`, `contracts.test.ts`, `exam-v2-contracts.test.ts`, `html.test.ts`, `roles.test.ts`.

---

## 4. Xác minh Vòng đời Khách hàng Thực tế (Live Clean Customer Product Lifecycle)

Đã thực hiện kịch bản khởi tạo từ cơ sở dữ liệu mới thông qua file [verify-clean-customer-lifecycle.ts](file:///d:/WEB-IELTS/Backend/scripts/verify-clean-customer-lifecycle.ts):
1. **Phát hiện Trạng thái Khởi tạo:** `GET /system/setup-status` trả về chính xác số lượng quản trị viên hiện hữu.
2. **Khóa Leo thang Quyền hạn:** Thử gọi `POST /system/bootstrap-admin` khi đã có admin bị từ chối với mã lỗi `409 Conflict`.
3. **Quản trị viên tạo Giảng viên & Học viên:** Tạo mới tài khoản với đầy đủ thông tin chuẩn bảo mật.
4. **Quản trị viên tạo Khóa học:** Khởi tạo khóa học Intensive 6.5–7.5, phân công giảng viên.
5. **Ghi danh Học viên:** Học viên được gán vào lớp học thành công.
6. **Giảng viên Lên lịch Buổi học:** Tạo buổi học với link Google Meet và cập nhật nội dung.
7. **Học viên Truy cập & Kiểm tra:** Học viên thấy khóa học trong danh sách và thấy buổi học trên lịch theo đúng múi giờ GMT+7.
8. **Kiểm toán Lưu trữ MongoDB:** Xác minh toàn bộ bản ghi người dùng, khóa học, buổi học đã được ghi nhận nguyên vẹn trên replica set `rs0`.
