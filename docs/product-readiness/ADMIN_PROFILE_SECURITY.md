# BÁO CÁO KỸ THUẬT & AN TOÀN HỒ SƠ QUẢN TRỊ VIÊN
# ADMIN PROFILE MANAGEMENT & SECURE CREDENTIALS REPORT

**Dự án:** WEB-IELTS Learning Management System  
**Môi trường:** Production Readiness / MongoDB Atlas (`ielts_lms_customer`)  
**Tài liệu tham chiếu:** `docs/product-readiness/ADMIN_PROFILE_SECURITY.md`  
**Ngày hoàn thành:** 17/11/2026  
**Trạng thái kiểm thử:** **VERIFIED PASS** / **FIXED AND RETESTED**

---

## 1. EXISTING FUNCTIONALITY AUDIT

Trước khi triển khai, hệ thống quản trị và xác thực đã được rà soát chi tiết trên toàn bộ codebase Backend (`NestJS`) và Frontend (`Next.js`):

| Thành phần | Trạng thái trước kiểm tra | Đánh giá & Khoảng trống (Gaps) |
| :--- | :--- | :--- |
| **User Schema** (`Backend/src/database/schemas/user.schema.ts`) | Đã có các trường cơ bản: `email`, `passwordHash`, `roles`, `status`, `phone`, `timezone`. | Thiếu `tokenVersion` để hỗ trợ cơ chế vô hiệu hóa phiên tức thì (immediate session revocation) khi đổi email hoặc mật khẩu. |
| **Auth Service** (`Backend/src/modules/auth/auth.service.ts`) | Đã hỗ trợ `login`, `refreshToken`, `logout`, `verifyToken`. | Hoàn toàn chưa có phương thức `changeEmail`, `changePassword`, và `revokeAllUserSessions`. |
| **JWT Strategy** (`Backend/src/modules/auth/strategies/jwt.strategy.ts`) | Chỉ kiểm tra hạn token và giải mã payload `{ sub, email, roles }`. | Không kiểm tra `tokenVersion` (`tv`). Access token đã cấp vẫn hợp lệ dù người dùng đã đổi mật khẩu trên thiết bị khác cho đến khi token hết hạn. |
| **Users Controller / Service** (`Backend/src/modules/users/`) | `PATCH /users/me` dùng chung `UpdateUserDto` với Admin quản lý người dùng khác. | Lỗ hổng tiềm ẩn: người dùng có thể tự gửi payload chứa `roles` hoặc `status` để nâng quyền (Mass-Assignment Vulnerability). |
| **Admin Navigation** (`frontend/src/lib/auth/roles.ts`) | Menu Admin (`PORTAL_NAV_ITEMS.admin`) chỉ có Quản lý bài nộp, Bài tập, Khóa học, Học viên, Cấu hình hệ thống. | Chưa có liên kết điều hướng đến `/admin/profile`. |
| **Admin Profile Page** (`frontend/src/app/admin/profile/`) | Chưa tồn tại route `/admin/profile`. | Admin không có giao diện xem hồ sơ cá nhân và quản trị thông tin đăng nhập. |
| **API Endpoints Frontend** (`frontend/src/lib/api/endpoints/`) | Chỉ có API login, logout, refreshToken, getMe. | Thiếu `changeEmail`, `changePassword`, `updateOwnProfile`. |

---

## 2. FEATURES IMPLEMENTED & CORRECTED

1. **Hồ sơ Quản trị viên (`/admin/profile`):**
   - Xây dựng giao diện hiển thị đầy đủ thông tin: Họ và tên, Email, Số điện thoại, Vai trò (Quản trị viên), Trạng thái tài khoản (Hoạt động), Ngày khởi tạo tài khoản, Ngày cập nhật gần nhất.
   - Ẩn toàn bộ thông tin nhạy cảm: không bao giờ để lộ mật khẩu, hash, token hoặc metadata xác thực nội bộ.
   - Thêm nút điều hướng tiện ích vào thanh menu Admin (`Hồ sơ cá nhân`).

2. **Cập nhật thông tin cá nhân an toàn (`PATCH /api/v1/users/me`):**
   - Tạo DTO riêng biệt `UpdateOwnProfileDto` chỉ cho phép cập nhật `fullName` và `phone`.
   - Ngăn chặn hoàn toàn việc can thiệp vào `role`, `status`, `email` hoặc bất kỳ cờ đặc quyền nào qua route này.

3. **Thay đổi Email đăng nhập bảo mật (`PATCH /api/v1/auth/change-email`):**
   - Bắt buộc xác nhận mật khẩu hiện tại bằng giải thuật Argon2id.
   - Chuẩn hóa email (lowercase, trim), kiểm tra định dạng email và kiểm tra trùng lặp trên MongoDB Atlas.
   - Cập nhật email trực tiếp trong database MongoDB Atlas.
   - Tăng `tokenVersion` và hủy toàn bộ phiên refresh token trên Redis, cấp phát cặp token mới ngay lập tức.
   - Ghi nhật ký kiểm toán (Audit Log) an toàn không chứa mật khẩu.

4. **Đổi mật khẩu bảo vệ đa tầng (`PATCH /api/v1/auth/change-password`):**
   - Xác thực mật khẩu cũ bằng Argon2id.
   - Kiểm tra độ mạnh mật khẩu mới: tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt (`@$!%*?&#^_-`).
   - Ngăn chặn tái sử dụng mật khẩu cũ (Password Reuse Prevention).
   - Mã hóa mật khẩu mới bằng Argon2id tiêu chuẩn an toàn cao.
   - Tăng `tokenVersion`, xóa refresh tokens trên Redis, vô hiệu hóa toàn bộ phiên làm việc của user trên server.
   - Tự động đăng xuất và chuyển hướng người dùng về màn hình đăng nhập sau khi đổi thành công.

---

## 3. FRONTEND ROUTES & NAVIGATION

- **Route hồ sơ:** `/admin/profile` (Server-side & Client-side authenticated).
- **Phân quyền truy cập:** Yêu cầu quyền `admin` (được bảo vệ bởi `RoleGuard` và `PortalShell`).
- **Thanh điều hướng:** Thêm mục `Hồ sơ cá nhân` vào menu quản trị viên tại `frontend/src/lib/auth/roles.ts`.
- **Giao diện người dùng:**
  - Thiết kế đồng bộ với hệ thống WEB-IELTS (Tailwind CSS, Lucide icons, chuẩn WCAG).
  - Phân tách 3 khối chức năng rõ ràng:
    1. *Tổng quan tài khoản & Chỉnh sửa thông tin cá nhân* (Họ tên, SĐT).
    2. *Đổi Email đăng nhập* (Email mới + Mật khẩu hiện tại để xác nhận).
    3. *Đổi Mật khẩu tài khoản* (Mật khẩu cũ + Mật khẩu mới + Xác nhận mật khẩu mới, hỗ trợ nút ẩn/hiện mật khẩu).

---

## 4. BACKEND API CONTRACTS

Tất cả các endpoints đều yêu cầu header `Authorization: Bearer <access_token>`.

### 4.1. Lấy thông tin cá nhân
- **Endpoint:** `GET /api/v1/users/me` (hoặc `GET /api/v1/auth/me`)
- **Status:** `200 OK`
- **Response Data:**
```json
{
  "statusCode": 200,
  "data": {
    "id": "6afb53808dd7fafc86f17a12",
    "email": "admin@ielts-lms.com",
    "fullName": "Administrator",
    "roles": ["admin"],
    "status": "active",
    "phone": "0901234567",
    "timezone": "Asia/Ho_Chi_Minh",
    "createdAt": "2026-11-17T01:00:00.000Z",
    "updatedAt": "2026-11-17T01:00:00.000Z"
  }
}
```

### 4.2. Cập nhật thông tin hồ sơ
- **Endpoint:** `PATCH /api/v1/users/me`
- **Body:**
```json
{
  "fullName": "Administrator Nguyen",
  "phone": "0912345678"
}
```
- **Status:** `200 OK`

### 4.3. Đổi Email đăng nhập
- **Endpoint:** `PATCH /api/v1/auth/change-email`
- **Body:**
```json
{
  "newEmail": "newadmin@ielts-lms.com",
  "currentPassword": "CurrentPassword123!"
}
```
- **Status Codes:**
  - `200 OK`: Đổi email thành công, trả về token pair mới và user đã cập nhật.
  - `400 Bad Request`: Email mới trùng email cũ hoặc định dạng không hợp lệ.
  - `401 Unauthorized`: Sai mật khẩu hiện tại hoặc token không hợp lệ.
  - `409 Conflict`: Email mới đã được sử dụng bởi tài khoản khác.

### 4.4. Đổi Mật khẩu đăng nhập
- **Endpoint:** `PATCH /api/v1/auth/change-password`
- **Body:**
```json
{
  "currentPassword": "CurrentPassword123!",
  "newPassword": "NewPassword2026!Secure"
}
```
- **Status Codes:**
  - `200 OK`: Đổi mật khẩu thành công.
  - `400 Bad Request`: Mật khẩu mới trùng mật khẩu cũ hoặc không đủ độ phức tạp.
  - `401 Unauthorized`: Sai mật khẩu hiện tại.

---

## 5. DTOS & VALIDATION RULES

| DTO | Trường | Kiểu dữ liệu | Quy tắc xác thực |
| :--- | :--- | :--- | :--- |
| `UpdateOwnProfileDto` | `fullName` | `string` (tùy chọn) | `@IsString()`, `@IsNotEmpty()`, `@MaxLength(100)` |
| | `phone` | `string` (tùy chọn) | `@IsString()`, `@Matches(/^[0-9+() -]{8,20}$/)` |
| `ChangeEmailDto` | `newEmail` | `string` (bắt buộc) | `@IsEmail()`, `@Transform(toLowerCase + trim)` |
| | `currentPassword` | `string` (bắt buộc) | `@IsString()`, `@IsNotEmpty()` |
| `ChangePasswordDto` | `currentPassword` | `string` (bắt buộc) | `@IsString()`, `@IsNotEmpty()` |
| | `newPassword` | `string` (bắt buộc) | `@IsString()`, `@Matches(PASSWORD_REGEX)`: >= 8 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt. |

Toàn bộ DTOs đều chạy qua NestJS `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.

---

## 6. PASSWORD HASHING METHOD

- **Thuật toán sử dụng:** **Argon2id** (thông qua thư viện `argon2`).
- **Cấu hình:** Sử dụng mặc định bảo mật cao của Argon2id (bộ nhớ, số luồng và số vòng tính toán chống tấn công ASIC/GPU/Rainbow Table).
- **Kiểm tra mật khẩu:** `argon2.verify(user.passwordHash, plainPassword)`.
- **Băm mật khẩu mới:** `argon2.hash(newPassword)`.
- **Tuyệt đối không lưu trữ hay in mật khẩu dạng rõ (plaintext) trong database, log, console hay audit traces.**

---

## 7. EMAIL-CHANGE AUTHENTICATION POLICY

1. **Xác thực danh tính chủ sở hữu:** Chỉ người dùng đã đăng nhập (hợp lệ qua JWT guard) mới có thể gọi endpoint. Người dùng chỉ đổi được email của chính mình thông qua `user.sub` lấy từ token, không chấp nhận target ID từ body hoặc query.
2. **Xác nhận mật khẩu bắt buộc:** Yêu cầu người dùng nhập mật khẩu hiện tại để chứng minh quyền sở hữu phiên làm việc, chống trường hợp phiên bị treo (unattended browser session).
3. **Cập nhật danh tính gốc:** Cập nhật trường `email` trong document của MongoDB Atlas.
4. **Email Verification:** Hiện tại dự án hoạt động trong môi trường LMS nội bộ, chưa kích hoạt hệ thống gửi mail xác thực OTP bên ngoài; do đó hệ thống không gắn cờ giả mạo "email đã xác thực qua mail server" mà yêu cầu xác thực bằng mật khẩu mạnh và thông báo minh bạch cho người dùng.

---

## 8. JWT & SESSION INVALIDATION POLICY

### Vấn đề thường gặp với Stateless JWT:
Khi đổi mật khẩu hoặc đổi email, Access Token đã phát hành trước đó thường vẫn còn hiệu lực cho đến khi hết hạn (ví dụ: 15-60 phút), dẫn đến nguy cơ thiết bị cũ bị lộ lọt vẫn tiếp tục truy cập dữ liệu.

### Giải pháp đa tầng đã triển khai:
1. **Trường `tokenVersion` trong User Schema:**
   - Mỗi người dùng có một trường số nguyên `tokenVersion` (mặc định 0).
   - Khi phát hành token, `tv: user.tokenVersion || 0` được gắn vào JWT Payload.
2. **Kiểm tra tức thì trong `JwtStrategy`:**
   - Khi request đến, `JwtStrategy.validate()` đối chiếu:
     ```ts
     if (payload.tv !== undefined && payload.tv !== (user.tokenVersion || 0)) {
       throw new UnauthorizedException('Session invalidated. Please log in again.');
     }
     ```
   - Nếu `payload.tv` không khớp với giá trị trong MongoDB, request bị từ chối ngay lập tức với mã `401 Unauthorized`.
3. **Khi Đổi Mật khẩu / Đổi Email:**
   - Backend thực hiện `user.tokenVersion = (user.tokenVersion || 0) + 1` và lưu vào MongoDB Atlas.
   - Gọi `revokeAllUserSessions(userId)`: Xóa sạch toàn bộ key refresh token trong Redis (`auth:refresh:<userId>:*`).
   - Mọi Access Token cũ và Refresh Token cũ lập tức bị vô hiệu hóa trên toàn server.

---

## 9. MONGODB PERSISTENCE BEHAVIOR

- **Cơ sở dữ liệu đích:** MongoDB Atlas cluster, database `ielts_lms_customer`.
- **Tính toàn vẹn dữ liệu:**
  - Cập nhật profile sử dụng Mongoose Model với schema validation.
  - Email có index `{ unique: true }`. Xử lý bắt lỗi mã lỗi MongoDB `11000` (E11000 duplicate key error) và chuyển thành `ConflictException` (409) thân thiện.
  - Lưu trữ `updatedAt` tự động bằng Mongoose timestamps.
  - Tài khoản Admin khởi tạo ban đầu (`admin@ielts-lms.com`) được bảo toàn 100%, không bị reset hay tác động tiêu cực trong suốt quá trình phát triển và kiểm thử.

---

## 10. RBAC TEST RESULTS

| Phân quyền & Kịch bản kiểm thử | Hành vi kỳ vọng | Kết quả thực tế | Trạng thái |
| :--- | :--- | :--- | :--- |
| **Anonymous Request** (không kèm token) | Bị từ chối tại Guard | `401 Unauthorized` | **VERIFIED PASS** |
| **Invalid JWT** (chữ ký sai, token rác) | Bị từ chối tại JwtStrategy | `401 Unauthorized` | **VERIFIED PASS** |
| **Invalid tokenVersion** (token trước khi đổi pass) | Bị từ chối tại JwtStrategy | `401 Unauthorized` | **VERIFIED PASS** |
| **Admin Request** đến `/admin/profile` | Cho phép truy cập và xem hồ sơ | `200 OK` (Render đầy đủ) | **VERIFIED PASS** |
| **Tự nâng quyền qua `PATCH /users/me`** (gửi `role: "superadmin"`) | Backend loại bỏ trường cấm qua Whitelist/DTO | Bị loại bỏ, chỉ update name/phone | **VERIFIED PASS** |
| **Sửa email/pass của người khác** | Không thể thực hiện vì backend dùng `req.user.sub` | Luôn tác động đúng user đang đăng nhập | **VERIFIED PASS** |

---

## 11. AUTOMATED TEST RESULTS

### 11.1. Backend Unit Tests (`jest`)
- **Tập lệnh:** `cd Backend; npm test`
- **Kết quả:** **20 passed, 20 total test suites | 150 passed, 150 total tests**
- **Thời gian chạy:** 9.37s
- **Các bộ test trọng điểm:**
  - `src/modules/auth/auth.service.spec.ts`: **PASSED** (Kiểm tra changeEmail, changePassword, verifyPassword, tokenVersion, revokeAllUserSessions, audit logging).
  - `src/modules/users/users.service.spec.ts`: **PASSED** (Kiểm tra updateOwnProfile, sanitize, bảo vệ privileged fields).
  - `src/modules/audit/audit.service.spec.ts`: **PASSED**.

### 11.2. Frontend Unit Tests (`vitest`)
- **Tập lệnh:** `cd frontend; npx vitest run src/app/admin/profile/admin-profile.test.tsx`
- **Kết quả:** **1 passed (1) test suite | 5 passed (5) tests**
  1. `renders personal account information and metadata correctly`: **PASSED**
  2. `submits basic profile updates via usersApi.updateOwnProfile`: **PASSED**
  3. `submits email change request with password confirmation`: **PASSED**
  4. `rejects password change when new password and confirm password do not match`: **PASSED**
  5. `submits valid password change via authApi.changePassword and triggers logout`: **PASSED**

---

## 12. MANUAL ACCEPTANCE TEST INSTRUCTIONS

Dành cho Quản trị viên và Đội ngũ Kiểm thử sản phẩm:

### Bước 1: Xem hồ sơ cá nhân
1. Đăng nhập vào hệ thống với tài khoản Admin.
2. Trên thanh menu bên trái, nhấp vào **Hồ sơ cá nhân** (hoặc truy cập trực tiếp `http://localhost:3000/admin/profile`).
3. Kiểm tra thông tin hiển thị:
   - Thẻ thông tin tài khoản hiển thị họ tên, email, vai trò "Quản trị viên" và trạng thái "Hoạt động".
   - Ngày tạo tài khoản và ngày cập nhật hiển thị chính xác theo giờ Việt Nam.

### Bước 2: Cập nhật thông tin cá nhân
1. Tại khối **Cập nhật Thông tin Cá nhân**, chỉnh sửa Họ và tên hoặc Số điện thoại.
2. Nhấn **Lưu thay đổi**.
3. Quan sát thông báo thành công màu xanh lá cây và thông tin trên màn hình được cập nhật tức thì.
4. Tải lại trang (F5) để kiểm tra tính bền vững của dữ liệu từ MongoDB Atlas.

### Bước 3: Đổi Email đăng nhập
1. Tại khối **Đổi Email Đăng nhập**:
   - Nhập email mới hợp lệ.
   - Nhập mật khẩu hiện tại của bạn.
2. Nhấn **Cập nhật Email**.
3. Thông báo thành công hiển thị. Thẻ thông tin cá nhân và email hiện tại sẽ cập nhật sang địa chỉ mới.
4. Đăng xuất và đăng nhập lại bằng địa chỉ email mới. Đăng nhập thành công.
5. Thử đăng nhập lại bằng địa chỉ email cũ: Hệ thống báo lỗi từ chối chính xác.

### Bước 4: Đổi Mật khẩu
1. Tại khối **Đổi Mật khẩu Tài khoản**:
   - Nhập mật khẩu hiện tại.
   - Nhập mật khẩu mới (tối thiểu 8 ký tự, gồm chữ hoa, thường, số, ký tự đặc biệt).
   - Nhập lại xác nhận mật khẩu mới.
2. Nhấn **Xác nhận đổi mật khẩu**.
3. Thông báo thành công hiển thị. Sau 2 giây, hệ thống tự động xóa phiên làm việc và đưa người dùng về trang đăng nhập `/login`.
4. Đăng nhập lại với mật khẩu mới. Đăng nhập thành công.
5. Thử đăng nhập lại bằng mật khẩu cũ: Bị từ chối truy cập.

---

## 13. KNOWN LIMITATIONS

1. **Email OTP Verification Flow:** Hiện tại hệ thống chưa tích hợp nhà cung cấp gửi email giao dịch (SendGrid / AWS SES / Mailgun) ngoài production thực tế. Do đó, quy trình đổi email áp dụng chính sách bảo mật xác thực bằng mật khẩu mạnh tại chỗ thay vì gửi đường link xác nhận qua hòm thư.
2. **Thời gian timeout phiên đăng nhập:** Khi đổi mật khẩu, cơ chế `tokenVersion` vô hiệu hóa token trên server ngay lập tức. Client cần xóa sạch cookie/local storage tương ứng để tránh gửi lặp lại token đã hết hiệu lực.

---

## 14. DANH SÁCH TỆP TIN ĐÃ THAY ĐỔI

1. `Backend/src/database/schemas/user.schema.ts`: Bổ sung trường `tokenVersion?: number` vào User Schema để quản lý phiên.
2. `Backend/src/modules/auth/strategies/jwt.strategy.ts`: Thêm kiểm tra `tv` đối chiếu với `user.tokenVersion` để hủy token tức thì khi đổi mật khẩu/email.
3. `Backend/src/modules/auth/dto/change-email.dto.ts`: Tạo DTO đổi email kèm xác nhận mật khẩu.
4. `Backend/src/modules/auth/dto/change-password.dto.ts`: Tạo DTO đổi mật khẩu kiểm tra độ phức tạp và xác nhận.
5. `Backend/src/modules/auth/auth.service.ts`: Triển khai `changeEmail`, `changePassword`, `revokeAllUserSessions`, cập nhật phát hành token kèm `tv`.
6. `Backend/src/modules/auth/auth.controller.ts`: Mở endpoints `PATCH /auth/change-email`, `PATCH /auth/change-password`, bổ sung metadata vào `GET /auth/me`.
7. `Backend/src/modules/auth/auth.module.ts`: Tích hợp `AuditModule` để ghi audit log khi đổi mật khẩu/email.
8. `Backend/src/modules/users/dto/update-user.dto.ts`: Tạo `UpdateOwnProfileDto` chỉ cho phép sửa họ tên và số điện thoại.
9. `Backend/src/modules/users/users.service.ts`: Thêm `updateOwnProfile` và cập nhật phương thức `sanitize`.
10. `Backend/src/modules/users/users.controller.ts`: Cập nhật route `PATCH /users/me` sử dụng `UpdateOwnProfileDto`.
11. `frontend/src/lib/api/types.ts`: Cập nhật interface `AuthUser`, thêm các type request `UpdateProfileRequest`, `ChangeEmailRequest`, `ChangePasswordRequest`.
12. `frontend/src/lib/api/schemas.ts`: Cập nhật schema Zod `AuthUserSchema` bổ sung `phone`, `createdAt`, `updatedAt`.
13. `frontend/src/lib/api/endpoints/auth.ts`: Thêm các hàm gọi API `changeEmail`, `changePassword`.
14. `frontend/src/lib/api/endpoints/users.ts`: Thêm hàm gọi API `updateOwnProfile`.
15. `frontend/src/lib/auth/roles.ts`: Bổ sung đường dẫn `/admin/profile` vào thanh điều hướng Admin Portal.
16. `frontend/src/app/admin/profile/page.tsx`: Xây dựng toàn bộ giao diện Hồ sơ Quản trị viên, Đổi Email và Đổi Mật khẩu.
17. `frontend/src/app/admin/profile/admin-profile.test.tsx`: Bộ test tự động kiểm thử toàn diện giao diện và xử lý form hồ sơ admin.
