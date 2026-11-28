# ==========================================
# STAGE 1: Build Stage (Đóng gói & compile)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Cài đặt toàn bộ dependencies (bao gồm devDependencies cho TypeScript & Nest CLI)
COPY package*.json ./
RUN npm ci

# Copy mã nguồn và tiến hành biên dịch TypeScript sang dist/
COPY . .
RUN npm run build

# ==========================================
# STAGE 2: Production Stage (Tối ưu cho Render 512MB RAM)
# ==========================================
FROM node:22-alpine AS runner

# Cài đặt tini để quản lý tiến trình PID 1 và chuyển tiếp tín hiệu SIGTERM/SIGINT
RUN apk add --no-cache tini

WORKDIR /app

# Thiết lập môi trường production & giới hạn V8 heap 384MB tránh Render Free 512MB OOM Kill
ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=384"

# Chỉ cài đặt production dependencies và dọn dẹp sạch npm cache để tối ưu dung lượng image
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy dist đã build từ builder stage
COPY --from=builder /app/dist ./dist

# Tạo group/user non-root và thư mục uploads với phân quyền bảo mật
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
  && mkdir -p /app/uploads \
  && chown -R appuser:appgroup /app/uploads /app

# Chuyển sang user non-root
USER appuser

EXPOSE 3000

# Healthcheck định kỳ kiểm tra trạng thái live của ứng dụng
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health/live || exit 1

# Khởi chạy thông qua tini để xử lý graceful shutdown
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main"]
