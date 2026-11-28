import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { GlobalExceptionFilter } from 'src/common/filters/global-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { CorrelationIdMiddleware } from 'src/common/middleware/correlation-id.middleware';
import {
  CourseType,
  ExerciseType,
  ExtensionRequestStatus,
  QuestionType,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('Phase 8: Security Audit, System Integration Testing & Production Readiness (e2e)', () => {
  jest.setTimeout(45000);

  let app: INestApplication;
  let connection: Connection;

  let adminToken: string;
  let teacher1Token: string;
  let teacher2Token: string;
  let studentToken: string;

  let teacher1Id: string;
  let teacher2Id: string;
  let studentId: string;
  let course1Id: string;
  let course2Id: string;
  let exerciseId: string;
  let assignmentId: string;
  let studentAssignmentId: string;

  const runSuffix = Date.now().toString().slice(-6);

  async function loginAs(email: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      accessToken: res.body.data.accessToken,
      refreshToken: res.body.data.refreshToken,
    };
  }

  async function createUser(
    token: string,
    payload: { fullName: string; email: string; password: string; role: UserRole },
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    return res.body.data._id || res.body.data.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(new CorrelationIdMiddleware().use);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();

    connection = app.get<Connection>(getConnectionToken());

    // 1. Admin login
    const adminAuth = await loginAs(
      process.env.SEED_ADMIN_EMAIL || 'admin@ielts-lms.local',
      process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
    );
    adminToken = adminAuth.accessToken;

    // 2. Create users
    teacher1Id = await createUser(adminToken, {
      fullName: 'Teacher One Phase 8',
      email: `t1.p8.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    teacher2Id = await createUser(adminToken, {
      fullName: 'Teacher Two Phase 8',
      email: `t2.p8.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    studentId = await createUser(adminToken, {
      fullName: 'Student Phase 8',
      email: `student.p8.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    // 3. Login users
    teacher1Token = (await loginAs(`t1.p8.${runSuffix}@ielts-lms.local`, 'Password@123')).accessToken;
    teacher2Token = (await loginAs(`t2.p8.${runSuffix}@ielts-lms.local`, 'Password@123')).accessToken;
    studentToken = (await loginAs(`student.p8.${runSuffix}@ielts-lms.local`, 'Password@123')).accessToken;

    // 4. Create Course 1 assigned to Teacher 1
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `P8-C1-${runSuffix}`,
        title: 'Phase 8 Course One',
        startBand: 5.5,
        targetBand: 7.0,
        type: CourseType.GROUP,
        teacherId: teacher1Id,
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 864000000).toISOString(),
      })
      .expect(201);
    course1Id = courseRes.body.data._id || courseRes.body.data.id;

    // 5. Create Course 2 assigned to Teacher 2
    const course2Res = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `P8-C2-${runSuffix}`,
        title: 'Phase 8 Course Two',
        startBand: 6.0,
        targetBand: 7.5,
        type: CourseType.GROUP,
        teacherId: teacher2Id,
        startAt: new Date(Date.now() - 3600000).toISOString(),
        endAt: new Date(Date.now() + 864000000).toISOString(),
      })
      .expect(201);
    course2Id = course2Res.body.data._id || course2Res.body.data.id;

    // 6. Enroll Student into Course 1
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${course1Id}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId })
      .expect(201);

    // 7. Create and Publish Exercise with 10 questions (pass threshold 70%)
    const questions = Array.from({ length: 10 }, (_, i) => ({
      questionId: `q-${i + 1}`,
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: `Question prompt ${i + 1}`,
      options: [
        { key: 'A', text: 'Option A' },
        { key: 'B', text: 'Option B' },
      ],
      answerSpecification: {
        correctKey: 'A',
      },
      points: 1,
      explanation: `Explanation for question ${i + 1}`,
    }));

    const exRes = await request(app.getHttpServer())
      .post('/api/v1/exercises')
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({
        title: `Phase 8 Exercise ${runSuffix}`,
        type: ExerciseType.READING,
        passage: 'This is the reading passage for Phase 8 security verification.',
        passScore: 70, // 70% threshold
        questions,
      })
      .expect(201);
    exerciseId = exRes.body.data._id || exRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/exercises/${exerciseId}/publish`)
      .set('Authorization', `Bearer ${teacher1Token}`)
      .expect(200);

    // 8. Create Assignment for Course 1 (defaults to PUBLISHED)
    const assignRes = await request(app.getHttpServer())
      .post('/api/v1/assignments')
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({
        courseId: course1Id,
        exerciseId,
        title: 'Phase 8 Security Assignment',
        openAt: new Date(Date.now() - 3600000).toISOString(),
        deadlineAt: new Date(Date.now() + 86400000).toISOString(),
        allowRetake: true,
        maxAttempts: 3,
      })
      .expect(201);
    assignmentId = assignRes.body.data._id || assignRes.body.data.id;

    // Retrieve StudentAssignment ID
    const saRes = await request(app.getHttpServer())
      .get(`/api/v1/assignments/mine`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    const mySa = saRes.body.data.items.find(
      (item: any) => item.assignmentId === assignmentId || item.id === assignmentId,
    );
    studentAssignmentId = mySa?.studentAssignmentId || mySa?.id;
  });

  afterAll(async () => {
    if (connection) {
      await connection.collection('courses').deleteMany({ code: new RegExp(`P8-.*-${runSuffix}`) });
      await connection.collection('users').deleteMany({ email: new RegExp(`.*\\.p8\\.${runSuffix}@.*`) });
      await connection.collection('exercises').deleteMany({ title: new RegExp(`Phase 8 Exercise ${runSuffix}`) });
      await connection.collection('assignments').deleteMany({ _id: new Types.ObjectId(assignmentId) });
      await connection.collection('student_assignments').deleteMany({ assignmentId: new Types.ObjectId(assignmentId) });
      await connection.collection('submissions').deleteMany({ studentId: new Types.ObjectId(studentId) });
      await connection.collection('penalty_transactions').deleteMany({ studentId: new Types.ObjectId(studentId) });
      await connection.collection('notifications').deleteMany({ userId: new Types.ObjectId(studentId) });
    }
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // Section 1: Observability & Health Checks
  // ==========================================
  describe('Observability & Health Checks', () => {
    it('GET /api/v1/health/live returns 200 with process liveness status (independent of heap)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);

      const payload = res.body.data || res.body;
      expect(payload.status).toBe('ok');
      expect(payload.info).toHaveProperty('process');
      expect(payload.info.process.status).toBe('up');
    });

    it('GET /api/v1/health/ready returns 200 with mongodb and redis indicators', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      const payload = res.body.data || res.body;
      expect(payload.status).toBe('ok');
      expect(payload.info).toHaveProperty('mongodb');
      expect(payload.info.mongodb.status).toBe('up');
      expect(payload.info).toHaveProperty('redis');
      expect(payload.info.redis.status).toBe('up');
    });

    it('GET /api/v1/health/memory returns isolated memory heap monitoring', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/memory');
      expect([200, 503]).toContain(res.status);
      const payload = res.body.data || res.body;
      expect(payload.details || payload.info).toHaveProperty('memory_heap');
    });

    it('regression: GET /api/v1/health/live stays healthy (200 OK) regardless of accumulated memory', async () => {
      // Allocate temporary buffer to simulate memory pressure
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024, 'A');
      expect(largeBuffer.length).toBeGreaterThan(0);

      const res = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);

      const payload = res.body.data || res.body;
      expect(payload.status).toBe('ok');
      expect(payload.info.process.status).toBe('up');
    });

    it('returns custom or auto-generated X-Correlation-Id header', async () => {
      // 1. Explicit client correlation ID
      const customRes = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .set('X-Correlation-Id', 'test-cid-998877')
        .expect(200);
      expect(customRes.headers['x-correlation-id']).toBe('test-cid-998877');

      // 2. Auto-generated correlation ID
      const autoRes = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);
      expect(autoRes.headers['x-correlation-id']).toBeDefined();
      expect(typeof autoRes.headers['x-correlation-id']).toBe('string');
    });

    it('GET /api/v1/jobs/health allows Admin and returns BullMQ queue metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('emailQueue');
      expect(res.body.data).toHaveProperty('deadlineQueue');
    });

    it('GET /api/v1/jobs/health rejects Student with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/jobs/health')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  // ==========================================
  // Section 2: Authentication Security & Redis Tokens
  // ==========================================
  describe('Authentication Security & Redis Refresh Tokens', () => {
    it('supports refresh token rotation: old token is invalidated upon use', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `student.p8.${runSuffix}@ielts-lms.local`, password: 'Password@123' })
        .expect(200);

      const firstRefreshToken = loginRes.body.data.refreshToken;
      expect(firstRefreshToken).toBeDefined();

      // Refresh once -> succeeds and returns new pair
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(200);

      const secondRefreshToken = refreshRes.body.data.refreshToken;
      expect(secondRefreshToken).toBeDefined();
      expect(secondRefreshToken).not.toBe(firstRefreshToken);

      // Replay attempt: submitting the first refresh token again must be rejected with 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: firstRefreshToken })
        .expect(401);

      // Using the second valid refresh token succeeds
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: secondRefreshToken })
        .expect(200);
    });

    it('supports logout and immediate refresh token revocation', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: `student.p8.${runSuffix}@ielts-lms.local`, password: 'Password@123' })
        .expect(200);

      const rt = loginRes.body.data.refreshToken;

      // Logout
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: rt })
        .expect(200);

      // Refreshing after logout must fail with 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rt })
        .expect(401);
    });

    it('enforces immediate rejection for suspended users on protected endpoints', async () => {
      // Create a student to suspend
      const victimId = await createUser(adminToken, {
        fullName: 'Victim Student',
        email: `victim.${runSuffix}@ielts-lms.local`,
        password: 'Password@123',
        role: UserRole.STUDENT,
      });

      const victimAuth = await loginAs(`victim.${runSuffix}@ielts-lms.local`, 'Password@123');

      // Verify token works initially
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${victimAuth.accessToken}`)
        .expect(200);

      // Suspend user via status endpoint
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${victimId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: UserStatus.SUSPENDED })
        .expect(200);

      // Token must now be rejected immediately with 401
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${victimAuth.accessToken}`)
        .expect(401);
    });
  });

  // ==========================================
  // Section 3: Authorization & RBAC Boundaries
  // ==========================================
  describe('Authorization & RBAC Boundaries', () => {
    it('prevents Student from viewing user list or administrative settings', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('prevents Teacher 2 from modifying Course 1 (assigned to Teacher 1)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${course1Id}`)
        .set('Authorization', `Bearer ${teacher2Token}`)
        .send({ title: 'Hacked Title by Teacher 2' })
        .expect(403);
    });

    it('prevents Teacher 2 from approving extension requests for Course 1', async () => {
      // Student requests extension
      const extRes = await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          studentAssignmentId,
          requestedDeadlineAt: new Date(Date.now() + 172800000).toISOString(),
          reason: 'Medical appointment at the local hospital for 2 days.',
        })
        .expect(201);

      const extId = extRes.body.data._id || extRes.body.data.id;

      // Teacher 2 attempts review -> 403 Forbidden
      await request(app.getHttpServer())
        .patch(`/api/v1/extension-requests/${extId}/review`)
        .set('Authorization', `Bearer ${teacher2Token}`)
        .send({
          status: ExtensionRequestStatus.APPROVED,
          reviewNote: 'Unauthorized approval attempt by Teacher 2',
        })
        .expect(403);
    });

    it('never leaks answerSpecification or explanation to student before PASS', async () => {
      // 1. Get exercise details
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exercises/${exerciseId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const exercise = res.body.data;
      expect(exercise).toBeDefined();

      // Check all questions for absence of answers
      for (const q of exercise.questions) {
        expect(q.answerSpecification).toBeUndefined();
        expect(q.explanation).toBeUndefined();
      }
    });
  });

  // ==========================================
  // Section 4: Auto-Grading & Pass Threshold
  // ==========================================
  describe('Auto-Grading & PASS Threshold (70% Boundary)', () => {
    it('submits 6 correct out of 10 (60%): status is FAILED, answers stay locked', async () => {
      // Student submits 6 correct ('A') and 4 wrong ('B')
      const answers = [
        { questionId: 'q-1', value: 'A' },
        { questionId: 'q-2', value: 'A' },
        { questionId: 'q-3', value: 'A' },
        { questionId: 'q-4', value: 'A' },
        { questionId: 'q-5', value: 'A' },
        { questionId: 'q-6', value: 'A' },
        { questionId: 'q-7', value: 'B' }, // wrong
        { questionId: 'q-8', value: 'B' }, // wrong
        { questionId: 'q-9', value: 'B' }, // wrong
        { questionId: 'q-10', value: 'B' }, // wrong
      ];

      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignmentId}/submissions`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ answers })
        .expect(201);

      const sub = subRes.body.data;
      expect(sub.correctCount).toBe(6);
      expect(sub.scorePercent).toBe(60);
      expect(sub.isPassed).toBe(false);

      // Attempting to access answer keys must be rejected because student has not passed
      await request(app.getHttpServer())
        .get(`/api/v1/assignments/${assignmentId}/answers`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('submits exactly 7 correct out of 10 (70%): status is PASSED, answers are revealed', async () => {
      // Student submits 7 correct ('A') and 3 wrong ('B')
      const answers = [
        { questionId: 'q-1', value: 'A' },
        { questionId: 'q-2', value: 'A' },
        { questionId: 'q-3', value: 'A' },
        { questionId: 'q-4', value: 'A' },
        { questionId: 'q-5', value: 'A' },
        { questionId: 'q-6', value: 'A' },
        { questionId: 'q-7', value: 'A' }, // 7th correct -> 70%
        { questionId: 'q-8', value: 'B' },
        { questionId: 'q-9', value: 'B' },
        { questionId: 'q-10', value: 'B' },
      ];

      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${assignmentId}/submissions`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ answers })
        .expect(201);

      const sub = subRes.body.data;
      expect(sub.correctCount).toBe(7);
      expect(sub.scorePercent).toBe(70);
      expect(sub.isPassed).toBe(true);

      // Now answers and explanations are safely unlocked
      const ansRes = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${assignmentId}/answers`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(ansRes.body.data).toBeDefined();
      expect(ansRes.body.data.questions.length).toBe(10);
      expect(ansRes.body.data.questions[0]).toHaveProperty('answerSpecification');
      expect(ansRes.body.data.questions[0]).toHaveProperty('explanation');
    });
  });

  // ==========================================
  // Section 5: Notifications API
  // ==========================================
  describe('Notifications API Verification', () => {
    it('supports both GET /notifications and GET /notifications/mine', async () => {
      // 1. GET /notifications
      const res1 = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res1.body.data).toHaveProperty('items');
      expect(res1.body.data).toHaveProperty('unreadCount');

      // 2. GET /notifications/mine
      const res2 = await request(app.getHttpServer())
        .get('/api/v1/notifications/mine')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res2.body.data).toHaveProperty('items');
      expect(res2.body.data.total).toBe(res1.body.data.total);
    });

    it('GET /api/v1/notifications/unread-count returns numeric count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('unreadCount');
      expect(typeof res.body.data.unreadCount).toBe('number');
    });

    it('PATCH /api/v1/notifications/read-all marks all notifications as read', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.unreadCount).toBe(0);
    });
  });
});
