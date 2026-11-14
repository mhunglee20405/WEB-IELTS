# AUTHENTICATION & TOKEN LIFECYCLE SPECIFICATION

> **Dự án**: IELTS Academic Learning Management System (IELTS LMS)  
> **Workspace**: `D:\WEB-IELTS`  
> **Thời gian cập nhật**: 14/11/2026

---

## 1. TỔNG QUAN KIẾN TRÚC PHIÊN ĐĂNG NHẬP (AUTHENTICATION ARCHITECTURE)

Hệ thống xác thực kết hợp giữa **JWT Không trạng thái (Stateless Access Token)** và **Redis-backed Refresh Token xoay vòng (Token Rotation)**:

- **Access Token**: JWT ký bằng HMAC SHA-256 (`JWT_ACCESS_SECRET`), có thời hạn ngắn (`15m`), mang các claim: `sub` (User ID), `email`, `role`, `roles`, `iat`, `exp`.
- **Refresh Token**: Chuỗi định danh duy nhất (UUID), có thời hạn dài (`7d`), được lưu trữ trên Redis key `refresh_token:<userId>:<tokenId>` có TTL tự động.
- **Frontend Token Storage**: Lưu trữ an toàn trong `window.sessionStorage` với khóa `web_ielts_dev_session`. Hết phiên khi đóng tab trình duyệt, tránh nguy cơ rò rỉ XSS vĩnh viễn của `localStorage` và tránh lỗi xung đột cross-tab.
- **State Machine ở AuthProvider**:
  - `loading`: Đang khởi động ứng dụng và kiểm tra tính hợp lệ của token có sẵn.
  - `authenticated`: Người dùng đã được xác thực, có đối tượng `user` và cặp token hợp lệ.
  - `unauthenticated`: Không có phiên hoặc phiên đã bị thu hồi/hết hạn.

---

## 2. QUY TRÌNH KHỞI ĐỘNG PHIÊN (SESSION BOOTSTRAP)

Khi người dùng mở ứng dụng hoặc tải lại trang:

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant App as AuthProvider (Frontend)
    participant Storage as sessionStorage
    participant API as apiRequest (client.ts)
    participant Server as NestJS Backend (3001)

    User->>App: Mở trang Web
    App->>Storage: Lấy existingToken & existingRefreshToken
    alt Cả 2 Token đều rỗng (Lần đầu vào web / Sau logout)
        App-->>App: status = "unauthenticated", user = null
        Note over App: DỪNG NGAY! Không gửi bất kỳ request mạng nào
        App->>User: Hiển thị trang /login
    else Có existingToken
        App->>API: authApi.me()
        API->>Server: GET /api/v1/auth/me (Authorization: Bearer <accessToken>)
        alt Server trả về 200 OK
            Server-->>API: { statusCode: 200, data: AuthUser }
            API-->>App: AuthUser hợp lệ
            App-->>App: status = "authenticated", user = AuthUser
            App->>User: Duy trì trạng thái đăng nhập
        else Server trả về 401 Unauthorized (Access token hết hạn)
            Note over API: Kích hoạt attemptTokenRefresh()
            API->>Server: POST /api/v1/auth/refresh { refreshToken }
            alt Refresh thành công (200 OK)
                Server-->>API: { accessToken, refreshToken, expiresIn }
                API->>Storage: Cập nhật cặp Token mới
                API->>Server: Thử lại GET /api/v1/auth/me với accessToken mới
                Server-->>API: { statusCode: 200, data: AuthUser }
                App-->>App: status = "authenticated", user = AuthUser
            else Refresh thất bại (401 / 400)
                API->>Storage: Xóa session (tokenStore.clear())
                API->>App: onUnauthorizedHandler()
                App-->>App: status = "unauthenticated", user = null
                App->>User: Chuyển hướng về /login
            end
        end
    end
```

---

## 3. QUY TRÌNH ĐĂNG NHẬP & PHÂN QUYỀN ĐIỀU HƯỚNG (LOGIN & RBAC REDIRECT)

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant Form as LoginForm
    participant App as AuthProvider
    participant API as authApi.login()
    participant Server as AuthController (/auth/login)
    participant DB as MongoDB rs0

    User->>Form: Nhập Email & Mật khẩu -> Nhấn "Đăng nhập"
    Form->>Form: Kiểm tra định dạng (Zod LoginFormSchema)
    Form->>App: login({ email, password })
    App->>API: authApi.login()
    API->>Server: POST /api/v1/auth/login
    Server->>DB: Tìm User theo email & kiểm tra Argon2id password hash
    DB-->>Server: User hợp lệ (active)
    Server->>Server: Tạo Access Token (JWT) & Refresh Token (Redis)
    Server-->>API: HTTP 200 { data: { user, tokens: { accessToken, refreshToken, expiresIn: "15m" } } }
    API->>API: Xác thực payload qua LoginResponseSchema (Zod)
    API-->>App: LoginResponse
    App->>App: tokenStore.setSession({ user, tokens })
    App->>App: status = "authenticated", user = response.user
    App-->>Form: Trả về signedInUser
    Form->>Form: Xác định URL điều hướng theo vai trò (sanitizeNextPath)
    alt Role là student
        Form->>User: Chuyển hướng -> /student/dashboard
    else Role là teacher
        Form->>User: Chuyển hướng -> /teacher/dashboard
    else Role là admin
        Form->>User: Chuyển hướng -> /admin/users
    end
```

---

## 4. CƠ CHẾ TỰ ĐỘNG LÀM MỚI TOKEN (TOKEN REFRESH WITH IN-FLIGHT DEDUPLICATION)

Khi có nhiều request API đồng thời nhận mã `401 Unauthorized`:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Giao diện người dùng
    participant Client as apiRequest (client.ts)
    participant Server as NestJS Backend (3001)
    participant Redis as Redis (Token Store)

    UI->>Client: Request 1: GET /courses
    UI->>Client: Request 2: GET /notifications
    Client->>Server: Gửi Request 1 & Request 2 (Token cũ đã hết hạn)
    Server-->>Client: Request 1 trả về 401 Unauthorized
    Server-->>Client: Request 2 trả về 401 Unauthorized

    Note over Client: Request 1 khởi tạo attemptTokenRefresh()<br/>Gán vào biến refreshInFlight
    Client->>Server: POST /api/v1/auth/refresh { refreshToken }
    Note over Client: Request 2 phát hiện refreshInFlight đang chạy,<br/>tự động xếp hàng chờ (await refreshInFlight)

    Server->>Redis: Kiểm tra & thu hồi Refresh Token cũ, lưu Token mới
    Server-->>Client: HTTP 200 { accessToken: "fresh-jwt", refreshToken: "new-uuid" }
    Note over Client: Cập nhật tokenStore với cặp Token mới

    Client->>Server: Thử lại Request 1 với Bearer "fresh-jwt"
    Client->>Server: Thử lại Request 2 với Bearer "fresh-jwt"
    Server-->>Client: Request 1: 200 OK
    Server-->>Client: Request 2: 200 OK
    Client-->>UI: Cả 2 request hoàn thành trong suốt, không làm gián đoạn người dùng
```

---

## 5. QUY TRÌNH ĐĂNG XUẤT AN TOÀN (LOGOUT & SESSION TERMINATION)

1. **Người dùng nhấn "Đăng xuất"**.
2. **Thu hồi trên Backend**:
   - Gửi `POST /api/v1/auth/logout` kèm Bearer Access Token.
   - Backend xóa Refresh Token tương ứng trên Redis để ngăn chặn hoàn toàn việc tái sử dụng.
3. **Xóa sạch phiên trên Client**:
   - `tokenStore.clear()` xóa dữ liệu trong `sessionStorage`.
   - `queryClient.clear()` xóa toàn bộ TanStack Query cache (ngăn rò rỉ dữ liệu của học viên/giáo viên trước đó vào màn hình).
   - `setUser(null)` và đặt `status = "unauthenticated"`.
4. **Điều hướng an toàn**:
   - Chuyển hướng trình duyệt về `/login`.
   - Ngăn chặn việc bấm "Back" trên trình duyệt quay lại trang nhạy cảm thông qua Role Guard.

