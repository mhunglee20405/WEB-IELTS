# Root .env Recovery & Environment Separation Report

**Workspace:** `D:\WEB-IELTS`  
**Target:** `D:\WEB-IELTS\.env`  
**Date:** 2026-11-17  
**Branch:** `connect`  

---

## 1. Executive Summary

The root `.env` has been streamlined to contain **strictly only the variables actually consumed by Docker Compose and root-level orchestration**. All duplicate, redundant variables and temporary backup files have been removed:
1. **Single File in Root:** The temporary `.env.backup.20261117_010500` file has been completely removed. Root now contains only one single `D:\WEB-IELTS\.env` file.
2. **Minimal & Clean Root `.env`:** Contains only the 5 essential variables needed by Docker Compose.
3. **No Duplication:** Backend application secrets (JWT, SMTP, Storage) and the active MongoDB Atlas connection remain exclusively inside `Backend/.env`.

---

## 2. Definitive Root `.env` Content

File location: `D:\WEB-IELTS\.env`

```env
# Docker Compose project orchestration
COMPOSE_PROJECT_NAME=ielts-lms
COMPOSE_FILE=Backend/docker-compose.yml

# Local infrastructure host ports & credentials
PORT=3001
MONGO_HOST_PORT=27018
REDIS_PASSWORD=
```

### Explanation of Variables:
- `COMPOSE_PROJECT_NAME`: Defines the Docker container network prefix (`ielts-lms`).
- `COMPOSE_FILE`: Points directly to `Backend/docker-compose.yml`, enabling running `docker compose` directly from `D:\WEB-IELTS`.
- `PORT`: Binds Backend API host port `3001`.
- `MONGO_HOST_PORT`: Binds local Docker MongoDB container to host port `27018` (avoiding port collision with any native MongoDB running on port 27017).
- `REDIS_PASSWORD`: Passes optional Redis auth password (default empty for local dev).

---

## 3. Preserved Service Architecture

- **Backend (`Backend/.env`):** Unmodified and active. Holds:
  - `MONGODB_URI`: Active connection string to MongoDB Atlas (`ielts_lms_customer`).
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
  - `SMTP_*`, `MAIL_*`, `STORAGE_*`
- **Frontend (`frontend/.env.local`):** Unmodified. Holds Next.js environment settings (`NEXT_PUBLIC_API_URL`, etc.).

---

## 4. Verification

- `docker compose config --quiet`: **Exit code 0 (Pass)**.
- Published ports:
  - API: `3001`
  - MongoDB: `27018`
  - Redis: `6379`
- Backend API live health: `GET /api/v1/health/live` -> **200 OK** (`{"status":"ok"}`).
- Frontend web app: `GET /login` -> **200 OK**.
