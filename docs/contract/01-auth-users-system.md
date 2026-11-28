# 01 — Auth, Users, System Setup & Health Contract

**Lifecycle Status:** `Canonical`  
**Backend Controllers:** `auth.controller.ts`, `users.controller.ts`, `system.controller.ts`, `health.controller.ts`  
**Frontend Consumers:** `frontend/src/lib/api/endpoints/{auth.ts,users.ts,system.ts,health.ts}`

---

## 1. Domain Scope & Security Invariants

1. **Authentication (`/auth`):** Xác thực Email + Password (Argon2 hash), phát hành cặp JWT Access (`15m`) + Refresh (`7d`, xoay vòng lưu trong Redis). Đổi email/mật khẩu bắt buộc xác thực `currentPassword` và tăng `tokenVersion` / thu hồi phiên cũ.
2. **Users (`/users`):**
   - `admin`: toàn quyền tạo/xem/sửa/đổi trạng thái mọi user.
   - `teacher`: `GET /users` bị ép `role = student` ở controller; `GET /users/:id` chỉ xem được bản thân hoặc tài khoản có `role === 'student'` (nếu xem teacher/admin khác → `403 Forbidden`).
   - `student`: chỉ được gọi `GET /users/me` và `PATCH /users/me` (chỉ whitelist `fullName`, `phone`).
3. **System Bootstrap (`/system`):** Chỉ hoạt động **1 lần duy nhất** trên hệ thống sạch chưa có Admin (`adminCount === 0`). Nếu hệ thống đã có Admin → `409 Conflict`. Hỗ trợ `x-setup-token` header hoặc `setupToken` body; giới hạn tốc độ riêng `5 req / 60s`.
4. **Health (`/health`):** Public probes phục vụ Docker/K8s/monitoring (`live`, `ready`, `memory`).

---

## 2. Endpoint Summary Table

| Method | Full Path (`/api/v1/...`) | Auth / Roles | FE Consumer | Status |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Public | `authApi.login` | Canonical |
| `POST` | `/auth/refresh` | Public | `authApi.refresh` / `client.ts` | Canonical |
| `POST` | `/auth/logout` | Public | `authApi.logout` | Canonical |
| `GET` | `/auth/me` | Authenticated | `authApi.me` | Canonical |
| `PATCH` | `/auth/change-email` | Authenticated | `authApi.changeEmail` | Canonical |
| `PATCH` | `/auth/change-password` | Authenticated | `authApi.changePassword` | Canonical |
| `POST` | `/users` | `ADMIN` | `usersApi.create` | Canonical |
| `GET` | `/users` | `ADMIN`, `TEACHER` | `usersApi.list` | Canonical |
| `GET` | `/users/me` | Authenticated | *(Chưa dùng trực tiếp, FE dùng `/auth/me`)* | Canonical |
| `PATCH` | `/users/me` | Authenticated | `usersApi.updateOwnProfile` | Canonical |
| `GET` | `/users/:id` | `ADMIN`, `TEACHER` | `usersApi.getById` | Canonical |
| `PATCH` | `/users/:id` | `ADMIN` | `usersApi.update` | Canonical |
| `PATCH` | `/users/:id/status` | `ADMIN` | *(BE-only, FE dùng `PATCH /users/:id`)* | Canonical |
| `GET` | `/system/setup-status` | Public | `systemApi.getSetupStatus` | Canonical |
| `POST` | `/system/bootstrap-admin` | Public *(5 req/60s)* | `systemApi.bootstrapAdmin` | Canonical |
| `GET` | `/health/live` | Public | `healthApi.live` | Canonical |
| `GET` | `/health/ready` | Public | `healthApi.ready` | Canonical |
| `GET` | `/health/memory` | Public | *(Ops-only)* | Internal/Ops |

> **Drift lưu ý:** Frontend `authApi` có khai báo `POST /auth/forgot-password` và `POST /auth/reset-password`, nhưng Backend `AuthController` **chưa implement** 2 route này (xem `07-drift-audit-be-fe.md`).

---

## 3. Detailed Endpoint Specifications

### 3.1 Authentication (`/auth`)

#### `POST /api/v1/auth/login` (HTTP 200)
- **Request Body (`LoginDto`):**
  ```ts
  {
    email: string;    // @IsEmail()
    password: string; // @IsString(), @MinLength(6)
  }
  ```
- **Success Response (`data`):**
  ```ts
  {
    accessToken: string;
    refreshToken: string;
    expiresIn: string | number; // e.g. "15m"
    user?: AuthUser;            // Live BE có thể chỉ trả tokens; FE fallback gọi GET /auth/me
  }
  ```
- **Errors:** `401 Unauthorized` (sai email/password hoặc tài khoản `inactive`/`suspended`), `400 Bad Request` (validation).

#### `POST /api/v1/auth/refresh` (HTTP 200)
- **Request Body (`RefreshTokenDto`):** `{ refreshToken: string }` (`@IsNotEmpty()`).
- **Success Response (`data`):** `{ accessToken: string, refreshToken: string, expiresIn: string }`.
- **Side Effects:** Atomic revoke `oldRefreshToken` trong Redis và cấp token mới cùng family; nếu phát hiện reuse attack → thu hồi cả family và trả `401 Unauthorized`.

#### `POST /api/v1/auth/logout` (HTTP 200)
- **Request Body (`RefreshTokenDto`):** `{ refreshToken: string }`.
- **Success Response (`data`):** `{ message: "Logged out successfully" }`.
- **Side Effects:** Xóa refresh token khỏi Redis.

#### `GET /api/v1/auth/me` (HTTP 200, Bearer JWT)
- **Success Response (`data`):**
  ```ts
  {
    id: string;
    fullName: string;
    email: string;
    role: "student" | "teacher" | "admin";
    roles: ("student" | "teacher" | "admin")[];
    status: "active" | "inactive" | "suspended";
    phone?: string;
    timezone: "Asia/Ho_Chi_Minh";
    createdAt: string;
    updatedAt: string;
  }
  ```

#### `PATCH /api/v1/auth/change-email` (HTTP 200, Bearer JWT)
- **Request Body (`ChangeEmailDto`):**
  ```ts
  {
    newEmail: string;        // @IsEmail()
    currentPassword: string; // @MinLength(1)
  }
  ```
- **Success Response (`data`):** `{ success: boolean, message: string, user: AuthUser, tokens?: AuthTokens }`.
- **Errors:** `401` (sai `currentPassword`), `409 Conflict` (`newEmail` đã tồn tại).

#### `PATCH /api/v1/auth/change-password` (HTTP 200, Bearer JWT)
- **Request Body (`ChangePasswordDto`):**
  ```ts
  {
    currentPassword: string; // @MinLength(1)
    newPassword: string;     // 8..64 chars, >=1 lower, >=1 upper, >=1 digit, >=1 special (@$!%*?&#^_-)
  }
  ```
- **Success Response (`data`):** `{ success: boolean, message: string, tokens?: AuthTokens }`.
- **Side Effects:** Hash Argon2, tăng `tokenVersion`, ghi AuditLog.

---

### 3.2 Users (`/users`) — Bảo vệ bởi `AuthGuard('jwt')` + `RolesGuard`

#### `POST /api/v1/users` (`ADMIN`, HTTP 201)
- **Request Body (`CreateUserDto`):**
  ```ts
  {
    fullName: string;      // 2..100 chars
    email: string;         // @IsEmail()
    password: string;      // @MinLength(8)
    role?: UserRole;       // optional nếu truyền roles[]
    roles?: UserRole[];    // FE gửi cả role và roles: [role]
    phone?: string;
    timezone?: string;     // default "Asia/Ho_Chi_Minh"
  }
  ```
- **Success Response (`data`):** Sanitized `User` (đã loại `passwordHash`, có `id`, `role`, `roles`).
- **Side Effects:** Tự động tạo `StudentProfile` nếu `role === 'student'` hoặc `TeacherProfile` nếu `role === 'teacher'`.
- **Errors:** `409 Conflict` (email trùng), `400 Bad Request`.

#### `GET /api/v1/users` (`ADMIN`, `TEACHER`, HTTP 200)
- **Query Params:** `page` (default `1`), `limit` (default `20`), `role?: UserRole`, `status?: UserStatus`, `search?: string`.
- **Scoping Rule:** Nếu `actor.role === 'teacher'`, Backend ép `effectiveRole = UserRole.STUDENT` bất kể query truyền gì.
- **Success Response (`data`):** Paginated envelope `{ items: AuthUser[], total, page, limit, totalPages }`.

#### `GET /api/v1/users/me` (Authenticated, HTTP 200)
- Trả về sanitized `User` của chính người đang đăng nhập.

#### `PATCH /api/v1/users/me` (Authenticated, HTTP 200)
- **Request Body (`UpdateOwnProfileDto`):** `{ fullName?: string (2..100), phone?: string (max 20) }`.
- **Lưu ý:** Không cho phép tự sửa `email`, `role`, `status`.

#### `GET /api/v1/users/:id` (`ADMIN`, `TEACHER`, HTTP 200)
- **Scoping Rule:** Teacher chỉ được xem chính mình hoặc tài khoản `student`; xem `teacher`/`admin` khác → `403 Forbidden`.
- **Errors:** `404 Not Found` nếu ID không hợp lệ/không tồn tại.

#### `PATCH /api/v1/users/:id` (`ADMIN`, HTTP 200)
- **Request Body (`UpdateUserDto`):** `{ fullName?: string (2..100), phone?: string, status?: UserStatus, role?: UserRole, roles?: UserRole[], timezone?: string }`.

#### `PATCH /api/v1/users/:id/status` (`ADMIN`, HTTP 200)
- **Request Body (`UpdateUserStatusDto`):** `{ status: UserStatus }`.

---

### 3.3 System Bootstrap (`/system`)

#### `GET /api/v1/system/setup-status` (Public, HTTP 200)
- **Success Response (`data`):** `{ isInitialized: boolean, adminCount: number, totalUsers: number, requiresSetupToken?: boolean }`.

#### `POST /api/v1/system/bootstrap-admin` (Public, `@Throttle(5 req / 60s)`, HTTP 201)
- **Header (optional):** `x-setup-token: <token>`
- **Request Body (`BootstrapAdminDto`):**
  ```ts
  {
    fullName: string;   // 2..100 chars
    email: string;      // @IsEmail()
    password: string;   // 8..64 chars, >=1 lower, >=1 upper, >=1 digit, >=1 special (@$!%*?&#^_-)
    phone?: string;
    setupToken?: string;
  }
  ```
- **Success Response (`data`):** `{ success: true, message: string, user: { id, email, fullName, role: "admin", status: "active" } }`.
- **Errors:** `409 Conflict` (hệ thống đã khởi tạo), `401 Unauthorized` (sai `setupToken`), `429 Too Many Requests`.

---

### 3.4 Health Probes (`/health`)

| Endpoint | Mục đích | Checks |
| :--- | :--- | :--- |
| `GET /api/v1/health/live` | Liveness probe | Process event-loop (`{ process: { status: 'up' } }`) |
| `GET /api/v1/health/ready` | Readiness probe | MongoDB ping (`mongodb`) + Redis health (`redis`) |
| `GET /api/v1/health/memory` | Heap monitor | `memory_heap` so với `HEALTH_HEAP_THRESHOLD_MB` (mặc định `768 MB`) |
