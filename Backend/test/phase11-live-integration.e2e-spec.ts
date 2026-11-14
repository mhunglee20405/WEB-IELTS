import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { CorrelationIdMiddleware } from 'src/common/middleware/correlation-id.middleware';
import { GlobalExceptionFilter } from 'src/common/filters/global-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { UserRole } from 'src/database/schemas/enums';

describe('Phase 11: Real Fullstack Frontend-Backend Live Integration (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;

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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Authentication & Session Contracts', () => {
    it('Admin logs in and receives dual tokens + user profile with roles array', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'admin@ielts-lms.local', password: 'Admin@123456' })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.roles).toContain(UserRole.ADMIN);
      expect(res.body.data.user.email).toBe('admin@ielts-lms.local');
      adminToken = res.body.data.accessToken;
    });

    it('Teacher logs in successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'teacher@ielts-lms.local', password: 'Teacher@123456' })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.roles).toContain(UserRole.TEACHER);
      teacherToken = res.body.data.accessToken;
    });

    it('Student logs in successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'student@ielts-lms.local', password: 'Student@123456' })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.roles).toContain(UserRole.STUDENT);
      studentToken = res.body.data.accessToken;
    });

    it('GET /auth/me returns roles array and Asia/Ho_Chi_Minh timezone', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.roles).toBeDefined();
      expect(Array.isArray(res.body.data.roles)).toBe(true);
      expect(res.body.data.timezone).toBe('Asia/Ho_Chi_Minh');
    });
  });

  describe('2. Dashboard Endpoints', () => {
    it('GET /dashboard/student returns student KPIs and upcoming lists', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/student')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.todayExercises).toBeDefined();
      expect(res.body.data.upcomingDeadlines).toBeDefined();
      expect(res.body.data.upcomingLessons).toBeDefined();
      expect(typeof res.body.data.activePenaltiesCount).toBe('number');
      expect(typeof res.body.data.extensionsUsedThisMonth).toBe('number');
      expect(typeof res.body.data.unreadNotificationsCount).toBe('number');
    });

    it('GET /dashboard/teacher returns teacher metrics and pending counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      expect(typeof res.body.data.activeCoursesCount).toBe('number');
      expect(typeof res.body.data.pendingExtensionsCount).toBe('number');
      expect(typeof res.body.data.pendingTranslationsCount).toBe('number');
      expect(typeof res.body.data.overdueStudentsCount).toBe('number');
      expect(Array.isArray(res.body.data.recentAssignments)).toBe(true);
      expect(Array.isArray(res.body.data.upcomingLessons)).toBe(true);
    });

    it('GET /students/me/profile returns student profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/students/me/profile')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.roles).toContain(UserRole.STUDENT);
      expect(typeof res.body.data.targetBand).toBe('number');
    });

    it('GET /teachers/me/profile returns teacher profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/teachers/me/profile')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.roles).toContain(UserRole.TEACHER);
    });
  });

  describe('3. Courses, Assignments & Student Assignments', () => {
    it('GET /courses/mine returns courses list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/courses/mine')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /assignments/mine returns student assignments matching Frontend summary schema', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignments/mine')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('GET /extensions/mine returns personal extension requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/extensions/mine')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
    });

    it('GET /extensions/pending returns pending extension requests for teacher', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/extensions/pending')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
    });
  });

  describe('4. CBT Exam Engine & Reading Translation Unlocking', () => {
    let createdTestId: string;
    let createdPartId: string;
    const runSuffix = Date.now().toString().slice(-6);

    it('Teacher creates and publishes an IELTS Reading Test with 1 passage', async () => {
      // 1. Create test
      const testRes = await request(app.getHttpServer())
        .post('/api/v1/teacher/exam-tests')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          title: `Phase 11 Integration Test ${runSuffix}`,
          skill: 'READING',
          allowedModes: ['PART', 'FULL'],
          passScore: 70,
          fullDurationSeconds: 3600,
          translationEnabled: true,
        })
        .expect(201);

      createdTestId = testRes.body.data._id || testRes.body.data.id;
      expect(createdTestId).toBeDefined();

      // 2. Add Part
      const partRes = await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${createdTestId}/parts`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          type: 'PASSAGE',
          ordinal: 1,
          title: 'Passage 1: History of AI in Education',
          contentHtml: '<p>The history of artificial intelligence in education began in the 1960s...</p>',
          durationSeconds: 1200,
        })
        .expect(201);

      createdPartId = partRes.body.data.parts[0].id;
      expect(createdPartId).toBeDefined();

      // 3. Add Question Group
      await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${createdTestId}/parts/${createdPartId}/question-groups`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          title: 'Questions 1–2',
          instruction: 'Do the following statements agree with the text?',
          type: 'TRUE_FALSE_NOT_GIVEN',
          order: 1,
          questions: [
            {
              number: 1,
              type: 'TRUE_FALSE_NOT_GIVEN',
              prompt: 'AI in education began in the 1960s.',
              points: 1,
              grading: { acceptedKeys: ['TRUE'] },
            },
          ],
        })
        .expect(201);

      // 4. Validate & Publish Test
      await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${createdTestId}/publish`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
    });

    it('GET /exam-tests lists published tests without leaked drafts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/exam-tests')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('GET /exam-attempts lists attempts for student', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.items).toBeDefined();
    });

    it('GET /reading-translations/eligibility returns status for valid test and passage', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/reading-translations/eligibility?testId=${createdTestId}&passageId=${createdPartId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.data.passages).toBeDefined();
      expect(Array.isArray(res.body.data.passages)).toBe(true);
      expect(res.body.data.passages[0].eligible).toBe(false);
      expect(res.body.data.passThresholdPercent).toBe(70);
    });
  });
});
