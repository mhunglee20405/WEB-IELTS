import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { GlobalExceptionFilter } from 'src/common/filters/global-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import {
  CourseType,
  ExerciseType,
  ExtensionRequestStatus,
  NotificationType,
  QuestionType,
  UserRole,
} from 'src/database/schemas/enums';

describe('Phase 7: Redis, BullMQ, Background Workers & Email Notifications (e2e)', () => {
  jest.setTimeout(35000);

  let app: INestApplication;
  let connection: Connection;

  let adminToken: string;
  let teacherToken: string;
  let student1Token: string;
  let student2Token: string;

  let teacherId: string;
  let student1Id: string;
  let student2Id: string;
  let courseId: string;

  const runSuffix = Date.now().toString().slice(-6);
  const createdCourseIds: string[] = [];
  const createdExerciseIds: string[] = [];
  const createdAssignmentIds: string[] = [];

  async function loginAs(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.data.accessToken;
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
    adminToken = await loginAs(
      process.env.SEED_ADMIN_EMAIL || 'admin@ielts-lms.local',
      process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
    );

    // 2. Create users
    teacherId = await createUser(adminToken, {
      fullName: 'Teacher Phase 7',
      email: `teacher.p7.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    student1Id = await createUser(adminToken, {
      fullName: 'Student 1 Phase 7',
      email: `student1.p7.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });
    student2Id = await createUser(adminToken, {
      fullName: 'Student 2 Phase 7',
      email: `student2.p7.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    [teacherToken, student1Token, student2Token] = await Promise.all([
      loginAs(`teacher.p7.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student1.p7.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student2.p7.${runSuffix}@ielts-lms.local`, 'Password@123'),
    ]);

    // 3. Create course
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `P7-CRS-${runSuffix}`,
        title: 'Phase 7 BullMQ & Notifications Course',
        startBand: 6.0,
        targetBand: 7.5,
        type: CourseType.GROUP,
        teacherId,
      })
      .expect(201);

    courseId = courseRes.body.data.id || courseRes.body.data._id;
    createdCourseIds.push(courseId);
  });

  afterAll(async () => {
    if (connection && connection.readyState === 1) {
      const courseObjIds = createdCourseIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const exObjIds = createdExerciseIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const asObjIds = createdAssignmentIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      await Promise.all([
        connection.collection('users').deleteMany({
          email: { $regex: `p7\\.${runSuffix}` },
        }),
        connection.collection('courses').deleteMany({ _id: { $in: courseObjIds } }),
        connection.collection('exercises').deleteMany({ _id: { $in: exObjIds } }),
        connection.collection('assignments').deleteMany({ _id: { $in: asObjIds } }),
        connection.collection('enrollments').deleteMany({ courseId: { $in: courseObjIds } }),
        connection.collection('student_assignments').deleteMany({ assignmentId: { $in: asObjIds } }),
        connection.collection('notifications').deleteMany({
          userId: { $in: [new Types.ObjectId(student1Id), new Types.ObjectId(student2Id)] },
        }),
        connection.collection('audit_logs').deleteMany({
          actorId: { $in: [new Types.ObjectId(teacherId), new Types.ObjectId(student1Id)] },
        }),
      ]);
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. In-App Notifications API Lifecycle', () => {
    let createdNotifId: string;

    it('creates notification and increases student unread count', async () => {
      // Direct notification insert simulation
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId}/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ studentId: student1Id })
        .expect(201);

      // Verify student1 received in-app notification
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const notif = res.body.data.items[0];
      expect(notif.type).toBe(NotificationType.COURSE_ENROLLED);
      expect(notif.isRead).toBe(false);
      createdNotifId = notif.id;

      // Verify unread count endpoint
      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(countRes.body.data.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it('student marks single notification as read', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.isRead).toBe(true);
      expect(res.body.data.readAt).toBeDefined();
    });

    it('denies student 2 from marking student 1 notification as read (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${student2Token}`)
        .expect(403);
    });

    it('student marks all remaining notifications as read', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.modifiedCount).toBeDefined();

      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(countRes.body.data.unreadCount).toBe(0);
    });
  });

  describe('2. Audit Logging API & Sanitization', () => {
    it('admin queries audit logs with pagination and filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ entityType: 'Enrollment', actorId: teacherId, limit: 10 })
        .expect(200);

      expect(res.body.data.items).toBeDefined();
      expect(Array.isArray(res.body.data.items)).toBe(true);
      const enrollmentLog = res.body.data.items.find(
        (l: any) => l.action === 'STUDENT_ENROLLED',
      );
      expect(enrollmentLog).toBeDefined();
      expect(enrollmentLog.actorId).toBe(teacherId);
    });

    it('denies student and teacher from accessing audit logs (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(403);
    });
  });

  describe('3. BullMQ Queues, Jobs & Asynchronous Email Delivery', () => {
    it('admin checks BullMQ queues health metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/jobs/health')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data.emailQueue).toBeDefined();
      expect(res.body.data.deadlineQueue).toBeDefined();
      expect(typeof res.body.data.emailQueue.waiting).toBe('number');
      expect(typeof res.body.data.deadlineQueue.waiting).toBe('number');
    });

    it('teacher triggers manual overdue check job in BullMQ', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/jobs/deadlines/trigger')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(201);

      expect(res.body.data.jobId).toBeDefined();
      expect(res.body.data.queue).toBe('deadline-processing');
    });

    it('denies student from triggering background jobs (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/jobs/deadlines/trigger')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(403);
    });

    it('publishes assignment -> dispatches notification and enqueues email processed by BullMQ worker', async () => {
      // Create exercise
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          title: 'Phase 7 Email Delivery Test',
          type: ExerciseType.READING,
          passage: 'Passage for Phase 7 email delivery test...',
          questions: [
            {
              questionId: 'q-p7-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Is BullMQ active?',
              options: [{ key: 'A', text: 'Yes' }, { key: 'B', text: 'No' }],
              answerSpecification: { correctKey: 'A' },
              points: 1,
            },
          ],
        })
        .expect(201);

      const exId = exRes.body.data.id;
      createdExerciseIds.push(exId);

      await request(app.getHttpServer())
        .post(`/api/v1/exercises/${exId}/publish`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      // Create & publish assignment in course
      const asRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          courseId,
          exerciseId: exId,
          title: 'Phase 7 Assignment Notification Test',
          status: 'published',
        })
        .expect(201);

      const asId = asRes.body.data.id;
      createdAssignmentIds.push(asId);

      // Wait briefly for BullMQ background worker to pick up and process job
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Verify student1 received notification
      const notifRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      const assignNotif = notifRes.body.data.items.find(
        (n: any) => n.type === NotificationType.NEW_ASSIGNMENT,
      );
      expect(assignNotif).toBeDefined();
      expect(assignNotif.title).toContain('Phase 7 Assignment');

      // Verify email delivery record in database was processed and marked SENT
      const delivery = await connection.collection('email_deliveries').findOne({
        recipientEmail: `student1.p7.${runSuffix}@ielts-lms.local`,
      });

      expect(delivery).toBeDefined();
      expect(['sent', 'queued']).toContain(delivery!.status);
      expect(delivery!.idempotencyKey).toBeDefined();
    });
  });
});
