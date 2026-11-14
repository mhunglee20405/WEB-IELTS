# REMAINING ISSUES AND PRODUCTION RECOMMENDATIONS

This document catalogs residual non-critical build warnings, operational considerations, and architecture recommendations identified during the comprehensive system audit.

---

## 1. RESIDUAL BUILD & TOOLING WARNINGS

### 1.1 Vite Native Config Loader Warning (Non-blocking)
- **Description:** When running `npm --prefix frontend run test`, Vitest outputs:
  ```
  (!) Your Vite config uses features that are unsupported by `configLoader: 'native'`:
    - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1).
  ```
- **Impact:** Informational warning only; does not affect test execution or test results (all 85 tests execute and pass in 6.1s).
- **Recommendation:** Rename `vitest.config.ts` to `vitest.config.mts` or add `"type": "module"` to `frontend/package.json` when migrating to Next.js 15 / Vite 6.

### 1.2 Deprecation Notice in Node.js Event Loop
- **Description:** Occasional `punycode` deprecation notices triggered by underlying dependencies when parsing older URL strings.
- **Impact:** Zero impact on runtime execution; Node.js maintains backwards compatibility throughout v20/v22 LTS.

---

## 2. PRODUCTION ARCHITECTURE & SCALING RECOMMENDATIONS

### 2.1 Audio & Media Asset Hosting (Phase 9 Listening Engine)
- **Current Development State:** Listening audio files are served from `/public/audio/` in the frontend or public test URLs.
- **Production Recommendation:** For production IELTS listening tests with high concurrent student loads, migrate audio storage to an object storage service (AWS S3, Google Cloud Storage, or Cloudflare R2) backed by a CDN with byte-range HTTP streaming support (`Range: bytes=...`) to allow low-latency seeking without loading full audio files into memory.

### 2.2 BullMQ Job Concurrency in Multi-Instance Deployments
- **Current State:** `DeadlineScheduler` registers a repeatable overdue job every 60 seconds on the primary backend worker.
- **Production Recommendation:** When scaling NestJS horizontally across multiple Kubernetes pods or Docker replicas, ensure BullMQ job workers run with concurrency locks or isolate the BullMQ worker processor into a dedicated worker container to avoid duplicate redundant execution.

### 2.3 JWT Secret & Seed Credential Rotation
- **Current State:** Seed accounts use default `Password123!` and JWT secrets default to development strings (`default-jwt-secret-for-dev`).
- **Production Recommendation:** Ensure environment variables `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MONGO_URI`, and `REDIS_URL` are injected via secure secret managers (e.g. AWS Secrets Manager, HashiCorp Vault) in production, and enforce mandatory password reset upon first login for seeded users.

### 2.4 Rate Limiting & DDOS Protection
- **Current State:** `ThrottlerModule` is configured with default limits on sensitive endpoints (`/auth/login`).
- **Production Recommendation:** Add Cloudflare or Nginx reverse proxy rate limiting in front of `/api/v1/exam-attempts/:id/submit` and `/reading-translations/:id/submit` to protect against automated submission spam.

