# ROOT CAUSE ANALYSIS — AUTHENTICATION & INTEGRATION FAILURES

> **Dự án**: IELTS Academic Learning Management System (IELTS LMS)  
> **Workspace**: `D:\WEB-IELTS`  
> **Ngày thực hiện**: 14/11/2026  
> **Trạng thái**: RESOLVED & VERIFIED

---

## 1. TRIỆU CHỨNG BAN ĐẦU (OBSERVED SYMPTOMS)

1. **Giao diện đăng nhập báo lỗi mạng**:
   - Khi người dùng nhập đúng thông tin tài khoản (kể cả tài khoản Admin mặc định) và nhấn "Đăng nhập", form hiển thị thông báo lỗi màu đỏ:
     > *"Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại."*
2. **Network Tab trong Chrome DevTools**:
   - `GET /api/v1/auth/me` trả về `401 Unauthorized` (lặp lại 2 lần khi vào trang).
   - `POST /api/v1/auth/refresh` trả về `400 Bad Request`.
   - Yêu cầu `POST /api/v1/auth/login` thực tế có thể không gửi được hoặc gửi thành công nhưng ngay lập tức bị UI coi là lỗi mạng.
3. **Docker Container `ielts-lms-api`**:
   - Container hiển thị trạng thái `Up ... (unhealthy)` và chiếm giữ cổng host `3001`.
   - Gửi request curl từ host tới `http://localhost:3001` bị từ chối kết nối (`Unable to connect to the remote server / Connection Refused`).

---

## 2. NGUYÊN NHÂN CỐT LÕI ĐÃ ĐƯỢC XÁC MINH (CONFIRMED ROOT CAUSES)

### Nguyên nhân 1: Xung đột cổng & lệch cấu hình ánh xạ Docker (`3001:3000`)
- **Tập tin liên quan**: `Backend/docker-compose.yml`, `Backend/.env`
- **Cơ chế lỗi**:
  - Trong `Backend/docker-compose.yml`, dịch vụ `api` định nghĩa:
    ```yaml
    ports:
      - "${PORT:-3000}:3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/v1/health/live"]
    ```
  - Trong tệp `Backend/.env`, biến môi trường được đặt là `PORT=3001`.
  - Khi container khởi động, NestJS đọc `PORT=3001` từ `.env` và lắng nghe trên cổng `3001` bên trong container.
  - Tuy nhiên Docker lại ánh xạ cổng host `3001` vào cổng container `3000` (nơi không có tiến trình nào lắng nghe).
  - Kết quả:
    - Docker Healthcheck thăm dò `http://localhost:3000/api/v1/health/live` thất bại liên tục khiến container mang nhãn `(unhealthy)`.
    - Mọi HTTP request từ Frontend hoặc Browser gửi tới `http://localhost:3001` đều bị Docker proxy đẩy vào cổng chết 3000, gây lỗi `Connection Refused`.
    - Khi developer chạy `npm run start:dev` trên host, tiến trình bị lỗi `EADDRINUSE: address already in use :::3001` do container đang chiếm giữ cổng.

### Nguyên nhân 2: Lệch kiểu dữ liệu Zod Schema ở Frontend (`expiresIn: number` vs `string`)
- **Tập tin liên quan**: `frontend/src/lib/api/schemas.ts`, `frontend/src/lib/api/types.ts`
- **Cơ chế lỗi**:
  - Endpoint `POST /api/v1/auth/login` của Backend trả về phản hồi:
    ```json
    {
      "statusCode": 200,
      "data": {
        "accessToken": "eyJhbGci...",
        "refreshToken": "7139693a-...",
        "expiresIn": "15m",
        "user": { ... },
        "tokens": {
          "accessToken": "eyJhbGci...",
          "refreshToken": "7139693a-...",
          "expiresIn": "15m"
        }
      }
    }
    ```
  - Giá trị trường `expiresIn` được trả về dưới dạng chuỗi `"15m"`.
  - Trong `frontend/src/lib/api/schemas.ts`, schema xác thực định nghĩa:
    ```typescript
    export const AuthTokensSchema = z.object({
      accessToken: z.string(),
      refreshToken: z.string().optional(),
      expiresIn: z.number().optional(), // Chỉ chấp nhận number!
    });
    ```
  - Khi hàm `authApi.login()` gọi `LoginResponseSchema.parse(data)`, Zod ném ra ngoại lệ:
    `ZodError: [{"expected":"number","code":"invalid_type","path":["tokens","expiresIn"],"message":"Invalid input: expected number, received string"}]`

### Nguyên nhân 3: Chuẩn hóa lỗi làm biến tướng `ZodError` thành `NETWORK_ERROR`
- **Tập tin liên quan**: `frontend/src/lib/api/error.ts`
- **Cơ chế lỗi**:
  - Trong `normalizeApiError(error)` ban đầu:
    ```typescript
    if (error instanceof Error) {
      return new ApiError({
        statusCode: 0,
        code: "NETWORK_ERROR",
        message: error.message || CODE_MESSAGES_VI.NETWORK_ERROR!,
        timestamp: new Date().toISOString(),
      });
    }
    ```
  - Ngoại lệ `ZodError` kế thừa từ `Error`, nên bị nhánh này tóm lấy và chuyển đổi thành `code: "NETWORK_ERROR"` với `statusCode: 0`.
  - `LoginForm` khi nhận được lỗi có mã `NETWORK_ERROR` đã hiển thị thông báo gây hoang mang: *"Không thể kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại."*, mặc dù request HTTP đã gửi đến server và nhận về HTTP 200 thành công.

### Nguyên nhân 4: Bootstrap phiên đăng nhập gọi `/auth/me` vô điều kiện khi chưa có Token
- **Tập tin liên quan**: `frontend/src/components/auth/auth-provider.tsx`
- **Cơ chế lỗi**:
  - Trong hàm `bootstrapSession()` trước khi sửa:
    ```typescript
    const existingToken = tokenStore.getAccessToken();
    if (isMockApiMode() && !existingToken) {
      // Chỉ kiểm tra mock mode!
      setUser(null);
      setStatus("unauthenticated");
      return;
    }
    // Ở Live mode, dù existingToken là null vẫn cố gọi:
    const verifiedUser = await authApi.me();
    ```
  - Khi người dùng mới mở trình duyệt vào trang `/login` (chưa có session):
    - `bootstrapSession()` vẫn gửi request `GET /api/v1/auth/me` mà không có Bearer token.
    - Backend từ chối với `401 Unauthorized`.
    - Do `reactStrictMode: true`, component được mount 2 lần trong dev mode, tạo ra 2 request `401` liên tiếp trên console.

### Nguyên nhân 5: Tự động refresh token mù quáng khi không có `refreshToken`
- **Tập tin liên quan**: `frontend/src/lib/api/client.ts`
- **Cơ chế lỗi**:
  - Khi request `/auth/me` nhận về `401`, hàm `apiRequest` tự động kích hoạt `attemptTokenRefresh()`:
    ```typescript
    const refreshToken = tokenStore.getRefreshToken(); // Giá trị là null
    const response = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}), // Gửi body rỗng {}!
    });
    ```
  - DTO phía Backend (`RefreshTokenDto`) yêu cầu `@IsNotEmpty() refreshToken: string`.
  - Khi nhận body `{}` không có trường `refreshToken`, NestJS ValidationPipe chặn lại và trả về `400 Bad Request`.

### Nguyên nhân 6: Turbopack Panic trên Windows khi build PostCSS loader
- **Tập tin liên quan**: `frontend/package.json`
- **Cơ chế lỗi**:
  - Next.js 16.4.6 mặc định sử dụng Turbopack cho `next build`.
  - Trên môi trường Windows, Turbopack gặp lỗi khi spawn child process node để xử lý `@tailwindcss/postcss` loader (`node process exited before we could connect to it with exit code: 0`).
  - Giải pháp chuẩn và ổn định 100%: Sử dụng Webpack engine thông qua `next build --webpack`.

### Nguyên nhân 7: Cấu hình cổng mẫu không nhất quán trong `.env.example`
- **Tập tin liên quan**: `frontend/.env.example`, `frontend/playwright.config.ts`
- **Cơ chế lỗi**:
  - `frontend/.env.example` đặt `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`, trong khi Backend thực tế chạy trên cổng `3001`. Nếu lập trình viên sao chép `.env.example` sang `.env.local` mà không sửa lại, toàn bộ request sẽ bị chuyển hướng sang cổng 4000.

---

## 3. BẢNG TỔNG HỢP CÁC FILE ĐÃ CHỈNH SỬA & GIẢI PHÁP TRIỂN KHAI

| Tập tin | Nội dung thay đổi | Mục đích & Hiệu quả |
| :--- | :--- | :--- |
| [Backend/docker-compose.yml](file:///d:/WEB-IELTS/Backend/docker-compose.yml) | Sửa port mapping thành `${PORT:-3001}:${PORT:-3001}` và cập nhật URL healthcheck | Tránh xung đột cổng giữa container và host, đảm bảo container healthy |
| [frontend/src/lib/api/schemas.ts](file:///d:/WEB-IELTS/frontend/src/lib/api/schemas.ts) | Đổi `expiresIn: z.union([z.number(), z.string()]).optional()` | Chấp nhận cả định dạng string `"15m"` và number từ Backend |
| [frontend/src/lib/api/types.ts](file:///d:/WEB-IELTS/frontend/src/lib/api/types.ts) | Cập nhật interface `AuthTokens` cho phép `expiresIn?: number \| string` | Đồng bộ kiểu dữ liệu TypeScript với Zod schema |
| [frontend/src/lib/api/error.ts](file:///d:/WEB-IELTS/frontend/src/lib/api/error.ts) | Thêm kiểm tra `error.name === "ZodError"`, gán mã `VALIDATION_ERROR` (HTTP 422) | Ngăn chặn việc ngụy trang lỗi dữ liệu thành lỗi mất kết nối mạng |
| [frontend/src/components/auth/auth-provider.tsx](file:///d:/WEB-IELTS/frontend/src/components/auth/auth-provider.tsx) | Kiểm tra `!existingToken && !existingRefreshToken` để thoát ngay | Loại bỏ hoàn toàn các request `401` và `400` vô nghĩa khi mở trang Login |
| [frontend/src/lib/api/client.ts](file:///d:/WEB-IELTS/frontend/src/lib/api/client.ts) | Kiểm tra `if (!currentRefreshToken) return null;` và so khớp token trước khi xóa session | Ngăn request `/auth/refresh` với body rỗng và tránh race-condition |
| [frontend/src/lib/api/endpoints/auth.ts](file:///d:/WEB-IELTS/frontend/src/lib/api/endpoints/auth.ts) | Tự động lấy refresh token từ `tokenStore` nếu không truyền payload | Bảo đảm tính nhất quán của hàm `authApi.refresh()` |
| [frontend/package.json](file:///d:/WEB-IELTS/frontend/package.json) | Sửa script build thành `"build": "next build --webpack"` | Khắc phục lỗi panic của Turbopack trên Windows, build 45 routes thành công |
| [frontend/.env.example](file:///d:/WEB-IELTS/frontend/.env.example) | Sửa default URL thành `http://localhost:3001/api/v1` | Đồng nhất tài liệu hướng dẫn và biến môi trường mặc định |
| [frontend/src/lib/api/client.test.ts](file:///d:/WEB-IELTS/frontend/src/lib/api/client.test.ts) | Bổ sung regression test cho trường hợp 401 không có refresh token | Đảm bảo không bị tái phát lỗi refresh token rỗng |

---

## 4. KẾT LUẬN

Tất cả các nguyên nhân gốc rễ đã được bóc tách và sửa chữa tại đúng tầng kiến trúc (không dùng workaround, không che giấu lỗi, không hạ thấp tiêu chuẩn bảo mật). Sau khi sửa:
- Đăng nhập trực tiếp qua trình duyệt thật hoạt động mượt mà cho cả 3 vai trò (Student, Teacher, Admin).
- Console trình duyệt sạch sẽ, không có bất kỳ request 401/400 rác nào khi tải trang đăng nhập.

