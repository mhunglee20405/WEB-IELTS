import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { GlobalExceptionFilter } from 'src/common/filters/global-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { CourseStatus, CourseType, EnrollmentStatus, LessonStatus, UserRole } from 'src/database/schemas/enums';

/**
 * Real MongoDB Integration / E2E tests for Phase 3.
 * Requires live MongoDB Replica Set (from .env MONGODB_URI) and seeded Admin account.
 */
describe('Phase 3 Real MongoDB Integration (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  let adminToken: string;
  let teacherAToken: string;
  let teacherBToken: string;
  let student1Token: string;
  let student2Token: string;

  let teacherAId: string;
  let teacherBId: string;
  let student1Id: string;
  let student2Id: string;

  const runSuffix = Date.now().toString().slice(-6);
  const createdUserEmails: string[] = [];
  const createdCourseIds: string[] = [];

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
    createdUserEmails.push(payload.email.toLowerCase());
    const res = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    return res.body.data._id;
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

    // Log in as seeded Admin
    adminToken = await loginAs(
      process.env.SEED_ADMIN_EMAIL || 'admin@ielts-lms.local',
      process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
    );

    // Create dedicated test teachers and students
    teacherAId = await createUser(adminToken, {
      fullName: 'Teacher Alpha',
      email: `teacher.a.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    teacherBId = await createUser(adminToken, {
      fullName: 'Teacher Beta',
      email: `teacher.b.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    student1Id = await createUser(adminToken, {
      fullName: 'Student One',
      email: `student.1.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });
    student2Id = await createUser(adminToken, {
      fullName: 'Student Two',
      email: `student.2.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    [teacherAToken, teacherBToken, student1Token, student2Token] = await Promise.all([
      loginAs(`teacher.a.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`teacher.b.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.1.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.2.${runSuffix}@ielts-lms.local`, 'Password@123'),
    ]);
  });

  afterAll(async () => {
    if (connection && connection.readyState === 1) {
      const courseObjIds = createdCourseIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      if (courseObjIds.length > 0) {
        await Promise.all([
          connection.collection('lessons').deleteMany({ courseId: { $in: courseObjIds } }),
          connection.collection('enrollments').deleteMany({ courseId: { $in: courseObjIds } }),
          connection.collection('courses').deleteMany({ _id: { $in: courseObjIds } }),
        ]);
      }

      if (createdUserEmails.length > 0) {
        const users = await connection
          .collection('users')
          .find({ email: { $in: createdUserEmails } })
          .toArray();
        const userIds = users.map((u) => u._id);
        await Promise.all([
          connection.collection('student_profiles').deleteMany({ userId: { $in: userIds } }),
          connection.collection('teacher_profiles').deleteMany({ userId: { $in: userIds } }),
          connection.collection('users').deleteMany({ _id: { $in: userIds } }),
        ]);
      }
    }

    if (app) {
      await app.close();
    }
  });

  it('verifies readiness endpoint and partial unique index on enrollments', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    const indexes = await connection.collection('enrollments').indexes();
    const oneToOneIdx = indexes.find((idx) => idx.name === 'unique_active_one_to_one_course');
    expect(oneToOneIdx).toBeDefined();
    expect(oneToOneIdx?.unique).toBe(true);
    expect(oneToOneIdx?.partialFilterExpression).toEqual({ isOneToOneActive: true });
  });

  describe('Course CRUD, band/date validation, ownership, and archive protection', () => {
    let groupCourseId: string;
    let draftCourseId: string;

    it('creates a GROUP course and rejects duplicate code / bad band / bad dates', async () => {
      // Invalid band (5.3)
      await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `BAD-${runSuffix}`,
          title: 'Bad Band',
          startBand: 5.3,
          targetBand: 7.0,
          type: CourseType.GROUP,
          teacherId: teacherAId,
        })
        .expect(400);

      // Invalid startAt >= endAt
      await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `BADDATE-${runSuffix}`,
          title: 'Bad Date',
          startBand: 5.0,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId,
          startAt: '2026-12-10T00:00:00.000Z',
          endAt: '2026-12-01T00:00:00.000Z',
        })
        .expect(400);

      // Student forbidden
      await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          code: `STU-${runSuffix}`,
          title: 'Forbidden',
          startBand: 5.0,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId,
        })
        .expect(403);

      // Valid creation
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `grp-${runSuffix}`,
          title: 'IELTS Group Foundation',
          startBand: 5.0,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId,
          startAt: '2026-11-01T00:00:00.000Z',
          endAt: '2026-12-31T23:59:59.000Z',
        })
        .expect(201);

      groupCourseId = res.body.data._id;
      createdCourseIds.push(groupCourseId);
      expect(res.body.data.code).toBe(`GRP-${runSuffix}`);

      // Duplicate code
      await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `GRP-${runSuffix}`,
          title: 'Dup',
          startBand: 5.0,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId,
        })
        .expect(409);
    });

    it('enforces Teacher ownership & Student enrollment scoping', async () => {
      // Teacher A can update their course
      const updateRes = await request(app.getHttpServer())
        .patch(`/api/v1/courses/${groupCourseId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ status: CourseStatus.ACTIVE, title: 'IELTS Group Active' })
        .expect(200);
      expect(updateRes.body.data.status).toBe(CourseStatus.ACTIVE);

      // Teacher A cannot reassign teacherId
      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${groupCourseId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ teacherId: teacherBId })
        .expect(403);

      // Teacher B cannot view or update Teacher A's course
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${groupCourseId}`)
        .set('Authorization', `Bearer ${teacherBToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/courses/${groupCourseId}`)
        .set('Authorization', `Bearer ${teacherBToken}`)
        .send({ title: 'Hijack' })
        .expect(403);

      // Student 1 not enrolled -> 403 on course detail
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${groupCourseId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(403);
    });

    it('deletes unused draft course but archives course with enrollment history', async () => {
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `DRAFT-${runSuffix}`,
          title: 'Unused Draft',
          startBand: 4.5,
          targetBand: 5.5,
          type: CourseType.GROUP,
          teacherId: teacherAId,
        })
        .expect(201);
      draftCourseId = draftRes.body.data._id;
      createdCourseIds.push(draftCourseId);

      // Delete unused draft
      const delDraft = await request(app.getHttpServer())
        .delete(`/api/v1/courses/${draftCourseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(delDraft.body.data.deleted).toBe(true);

      // Enroll student1 in groupCourseId -> DELETE must return 409
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${groupCourseId}/students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ studentId: student1Id })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${groupCourseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      // Drop student1 -> history exists -> DELETE must archive (not hard-delete)
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${groupCourseId}/students/${student1Id}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      const archiveRes = await request(app.getHttpServer())
        .delete(`/api/v1/courses/${groupCourseId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(archiveRes.body.data.archived).toBe(true);
      expect(archiveRes.body.data.course.status).toBe(CourseStatus.ARCHIVED);

      // Verify course still exists in MongoDB and enrolling/lesson creation is rejected (422)
      const doc = await connection
        .collection('courses')
        .findOne({ _id: new Types.ObjectId(groupCourseId) });
      expect(doc).not.toBeNull();
      expect(doc?.status).toBe(CourseStatus.ARCHIVED);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${groupCourseId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: student1Id })
        .expect(422);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${groupCourseId}/lessons`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Archived Lesson',
          startAt: '2026-11-15T12:00:00.000Z',
          endAt: '2026-11-15T13:00:00.000Z',
        })
        .expect(422);
    });
  });

  describe('Enrollment concurrency (ONE_TO_ONE), duplicate check, and rejoin history', () => {
    let oneToOneCourseId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `1TO1-${runSuffix}`,
          title: 'IELTS 1-on-1 Coaching',
          startBand: 6.0,
          targetBand: 7.5,
          type: CourseType.ONE_TO_ONE,
          teacherId: teacherAId,
        })
        .expect(201);
      oneToOneCourseId = res.body.data._id;
      createdCourseIds.push(oneToOneCourseId);
    });

    it('handles concurrent ONE_TO_ONE enrollment safely (only 1 succeeds, 1 gets 409)', async () => {
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/courses/${oneToOneCourseId}/students`)
          .set('Authorization', `Bearer ${teacherAToken}`)
          .send({ studentId: student1Id }),
        request(app.getHttpServer())
          .post(`/api/v1/courses/${oneToOneCourseId}/students`)
          .set('Authorization', `Bearer ${teacherAToken}`)
          .send({ studentId: student2Id }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const activeDocs = await connection
        .collection('enrollments')
        .countDocuments({
          courseId: new Types.ObjectId(oneToOneCourseId),
          status: EnrollmentStatus.ACTIVE,
        });
      expect(activeDocs).toBe(1);
    });

    it('rejects duplicate enrollment and preserves history across drop & rejoin', async () => {
      // Find who won the concurrent race
      const activeEnrollment = await connection.collection('enrollments').findOne({
        courseId: new Types.ObjectId(oneToOneCourseId),
        status: EnrollmentStatus.ACTIVE,
      });
      const winnerId = activeEnrollment!.studentId.toHexString();
      const loserId = winnerId === student1Id ? student2Id : student1Id;

      // Duplicate enroll of winner -> 409
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${oneToOneCourseId}/students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ studentId: winnerId })
        .expect(409);

      // Drop winner
      const dropRes = await request(app.getHttpServer())
        .delete(`/api/v1/courses/${oneToOneCourseId}/students/${winnerId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);
      expect(dropRes.body.data.enrollment.status).toBe(EnrollmentStatus.DROPPED);
      expect(dropRes.body.data.enrollment.history).toHaveLength(2);

      // Rejoin winner -> reactivates existing document with 3 history entries
      const rejoinRes = await request(app.getHttpServer())
        .post(`/api/v1/courses/${oneToOneCourseId}/students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ studentId: winnerId })
        .expect(201);
      expect(rejoinRes.body.data.status).toBe(EnrollmentStatus.ACTIVE);
      expect(rejoinRes.body.data.history).toHaveLength(3);

      // Drop winner again and verify loser can now enroll into ONE_TO_ONE
      await request(app.getHttpServer())
        .delete(`/api/v1/courses/${oneToOneCourseId}/students/${winnerId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/courses/${oneToOneCourseId}/students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ studentId: loserId })
        .expect(201);
    });
  });

  describe('Lessons / Calendar CRUD, Meet URLs, date filtering, and RBAC', () => {
    let lessonCourseId: string;
    let lessonId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: `LES-${runSuffix}`,
          title: 'IELTS Lessons Course',
          startBand: 5.5,
          targetBand: 7.0,
          type: CourseType.GROUP,
          teacherId: teacherAId,
        })
        .expect(201);
      lessonCourseId = res.body.data._id;
      createdCourseIds.push(lessonCourseId);

      // Enroll only student1 (student2 is NOT enrolled)
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${lessonCourseId}/students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ studentId: student1Id })
        .expect(201);
    });

    it('creates lesson with UTC storage & Asia/Ho_Chi_Minh display, validates Meet URL & times', async () => {
      // Invalid startAt >= endAt
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${lessonCourseId}/lessons`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Bad Time',
          startAt: '2026-11-20T15:00:00.000Z',
          endAt: '2026-11-20T14:00:00.000Z',
        })
        .expect(400);

      // Invalid HTTP meetUrl
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${lessonCourseId}/lessons`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Bad Meet URL',
          startAt: '2026-11-20T12:00:00.000Z',
          endAt: '2026-11-20T13:30:00.000Z',
          meetUrl: 'http://meet.google.com/abc-defg-hij',
        })
        .expect(400);

      // Teacher B forbidden
      await request(app.getHttpServer())
        .post(`/api/v1/courses/${lessonCourseId}/lessons`)
        .set('Authorization', `Bearer ${teacherBToken}`)
        .send({
          title: 'Unauthorized',
          startAt: '2026-11-20T12:00:00.000Z',
          endAt: '2026-11-20T13:30:00.000Z',
        })
        .expect(403);

      // Valid creation
      const res = await request(app.getHttpServer())
        .post(`/api/v1/courses/${lessonCourseId}/lessons`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Reading & Skimming Session',
          startAt: '2026-11-20T12:00:00.000Z',
          endAt: '2026-11-20T13:30:00.000Z',
          meetUrl: 'https://meet.google.com/abc-defg-hij',
          content: 'Cambridge IELTS 18 Test 1',
        })
        .expect(201);

      lessonId = res.body.data.id;
      expect(res.body.data.startAtVn).toBe('2026-11-20T19:00:00+07:00');
      expect(res.body.data.endAtVn).toBe('2026-11-20T20:30:00+07:00');
      expect(res.body.data.timezone).toBe('Asia/Ho_Chi_Minh');
    });

    it('restricts lesson viewing to enrolled students and filters by date range', async () => {
      // Enrolled student1 sees lesson
      const s1Res = await request(app.getHttpServer())
        .get(`/api/v1/courses/${lessonCourseId}/lessons`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);
      expect(s1Res.body.data.total).toBe(1);

      // Unenrolled student2 gets 403
      await request(app.getHttpServer())
        .get(`/api/v1/courses/${lessonCourseId}/lessons`)
        .set('Authorization', `Bearer ${student2Token}`)
        .expect(403);

      // Date range filter in /lessons/mine
      const inRange = await request(app.getHttpServer())
        .get('/api/v1/lessons/mine')
        .query({
          courseId: lessonCourseId,
          from: '2026-11-20T00:00:00.000Z',
          to: '2026-11-21T00:00:00.000Z',
        })
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);
      expect(inRange.body.data.total).toBe(1);

      const outOfRange = await request(app.getHttpServer())
        .get('/api/v1/lessons/mine')
        .query({
          courseId: lessonCourseId,
          from: '2026-12-01T00:00:00.000Z',
          to: '2026-12-31T00:00:00.000Z',
        })
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);
      expect(outOfRange.body.data.total).toBe(0);
    });

    it('updates and soft-cancels lesson without hard deletion', async () => {
      const updated = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ title: 'Updated Reading Session' })
        .expect(200);
      expect(updated.body.data.title).toBe('Updated Reading Session');

      const cancelled = await request(app.getHttpServer())
        .delete(`/api/v1/lessons/${lessonId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);
      expect(cancelled.body.data.status).toBe(LessonStatus.CANCELLED);

      // Verify still persisted in MongoDB
      const doc = await connection
        .collection('lessons')
        .findOne({ _id: new Types.ObjectId(lessonId) });
      expect(doc).not.toBeNull();
      expect(doc?.status).toBe(LessonStatus.CANCELLED);
    });
  });
});

