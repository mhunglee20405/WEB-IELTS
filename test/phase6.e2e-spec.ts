import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';
import { GlobalExceptionFilter } from 'src/common/filters/global-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import {
  AssignmentStatus,
  CourseType,
  ExerciseType,
  ExtensionRequestStatus,
  QuestionType,
  StudentAssignmentStatus,
  UserRole,
} from 'src/database/schemas/enums';

describe('Phase 6: Deadline, Extension Requests & Penalty Management (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let connection: Connection;

  let adminToken: string;
  let teacherAToken: string;
  let teacherBToken: string;
  let student1Token: string;

  let teacherAId: string;
  let teacherBId: string;
  let student1Id: string;
  let student2Id: string;
  let student2Token: string;
  let overdueStudentAssignmentId: string;

  let courseAId: string;
  let courseBId: string;

  const runSuffix = Date.now().toString().slice(-6);
  const createdUserEmails: string[] = [];
  const createdCourseIds: string[] = [];
  const createdExerciseIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const createdExtensionIds: string[] = [];
  const createdPenaltyIds: string[] = [];

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

  async function createCourse(
    token: string,
    payload: {
      code: string;
      title: string;
      startBand: number;
      targetBand: number;
      type: CourseType;
      teacherId: string;
    },
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    const id = res.body.data._id || res.body.data.id;
    createdCourseIds.push(id);
    return id;
  }

  async function enrollStudent(
    token: string,
    courseId: string,
    studentId: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId })
      .expect(201);
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

    // 1. Log in as seeded Admin
    adminToken = await loginAs(
      process.env.SEED_ADMIN_EMAIL || 'admin@ielts-lms.local',
      process.env.SEED_ADMIN_PASSWORD || 'Admin@123456',
    );

    // 2. Create dedicated teachers and student
    teacherAId = await createUser(adminToken, {
      fullName: 'Teacher Alpha P6',
      email: `teacher.a.p6.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    teacherBId = await createUser(adminToken, {
      fullName: 'Teacher Beta P6',
      email: `teacher.b.p6.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    student1Id = await createUser(adminToken, {
      fullName: 'Student One P6',
      email: `student.1.p6.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });
    student2Id = await createUser(adminToken, {
      fullName: 'Student Two P6',
      email: `student.2.p6.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    [teacherAToken, teacherBToken, student1Token, student2Token] = await Promise.all([
      loginAs(`teacher.a.p6.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`teacher.b.p6.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.1.p6.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.2.p6.${runSuffix}@ielts-lms.local`, 'Password@123'),
    ]);

    // 3. Create courses and enroll student 1 and student 2
    courseAId = await createCourse(adminToken, {
      code: `P6-CRS-A-${runSuffix}`,
      title: 'Phase 6 Deadline & Extension Course A',
      startBand: 6.0,
      targetBand: 7.5,
      type: CourseType.GROUP,
      teacherId: teacherAId,
    });
    courseBId = await createCourse(adminToken, {
      code: `P6-CRS-B-${runSuffix}`,
      title: 'Phase 6 Course B',
      startBand: 6.0,
      targetBand: 7.0,
      type: CourseType.GROUP,
      teacherId: teacherBId,
    });

    await enrollStudent(teacherAToken, courseAId, student1Id);
    await enrollStudent(teacherAToken, courseAId, student2Id);
  });

  afterAll(async () => {
    if (connection && connection.readyState === 1) {
      const courseObjIds = createdCourseIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const exerciseObjIds = createdExerciseIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const assignmentObjIds = createdAssignmentIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const extensionObjIds = createdExtensionIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const penaltyObjIds = createdPenaltyIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      await Promise.all([
        connection.collection('users').deleteMany({ email: { $in: createdUserEmails } }),
        connection.collection('courses').deleteMany({ _id: { $in: courseObjIds } }),
        connection.collection('enrollments').deleteMany({ courseId: { $in: courseObjIds } }),
        connection.collection('exercises').deleteMany({ _id: { $in: exerciseObjIds } }),
        connection.collection('assignments').deleteMany({ _id: { $in: assignmentObjIds } }),
        connection.collection('student_assignments').deleteMany({ assignmentId: { $in: assignmentObjIds } }),
        connection.collection('extension_requests').deleteMany({ _id: { $in: extensionObjIds } }),
        connection.collection('penalty_transactions').deleteMany({ _id: { $in: penaltyObjIds } }),
      ]);
    }

    if (app) {
      await app.close();
    }
  });

  describe('1. Extension Request Quota, Validation & Lifecycle', () => {
    let studentAssignment1Id: string;
    let studentAssignment2Id: string;
    let studentAssignment3Id: string;
    let studentAssignment4Id: string;

    let request1Id: string;
    let request2Id: string;
    let request3Id: string;

    beforeAll(async () => {
      // Create 4 published exercises & assignments for Course A to test 4 requests
      for (let i = 1; i <= 4; i++) {
        const exRes = await request(app.getHttpServer())
          .post('/api/v1/exercises')
          .set('Authorization', `Bearer ${teacherAToken}`)
          .send({
            title: `P6 Exercise ${i}`,
            type: ExerciseType.READING,
            passage: 'Sample passage text...',
            passScore: 70,
            questions: [
              {
                questionId: `q-${i}`,
                type: QuestionType.MULTIPLE_CHOICE,
                prompt: `Question ${i}`,
                options: [
                  { key: 'A', text: 'Option A' },
                  { key: 'B', text: 'Option B' },
                ],
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
          .set('Authorization', `Bearer ${teacherAToken}`)
          .expect(200);

        const asRes = await request(app.getHttpServer())
          .post('/api/v1/assignments')
          .set('Authorization', `Bearer ${teacherAToken}`)
          .send({
            courseId: courseAId,
            exerciseId: exId,
            title: `Assignment ${i}`,
            targetDate: `2026-11-${20 + i}`,
            status: AssignmentStatus.PUBLISHED,
          })
          .expect(201);

        createdAssignmentIds.push(asRes.body.data.id);
      }

      // Fetch student assignments for student1
      const saList = await connection
        .collection('student_assignments')
        .find({ studentId: new Types.ObjectId(student1Id) })
        .sort({ createdAt: 1 })
        .toArray();

      studentAssignment1Id = saList[0]._id.toHexString();
      studentAssignment2Id = saList[1]._id.toHexString();
      studentAssignment3Id = saList[2]._id.toHexString();
      studentAssignment4Id = saList[3]._id.toHexString();
    });

    it('rejects extension request if requested deadline is earlier than effective deadline', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          studentAssignmentId: studentAssignment1Id,
          requestedDeadlineAt: '2026-11-01T00:00:00.000Z', // Past date
          reason: 'Lý do xin gia hạn hợp lệ dài hơn 10 ký tự',
        })
        .expect(400);
    });

    it('submits request 1, 2, and 3 successfully within monthly quota (3/month)', async () => {
      // Request 1
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          studentAssignmentId: studentAssignment1Id,
          requestedDeadlineAt: '2026-12-01T23:59:59.999Z',
          reason: 'Xin gia hạn bài tập 1 vì lý do cá nhân',
        })
        .expect(201);

      request1Id = res1.body.data.id;
      createdExtensionIds.push(request1Id);
      expect(res1.body.data.status).toBe(ExtensionRequestStatus.PENDING);

      // Request 2
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          studentAssignmentId: studentAssignment2Id,
          requestedDeadlineAt: '2026-12-02T23:59:59.999Z',
          reason: 'Xin gia hạn bài tập 2 vì bận lịch thi học kỳ',
        })
        .expect(201);

      request2Id = res2.body.data.id;
      createdExtensionIds.push(request2Id);

      // Request 3
      const res3 = await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          studentAssignmentId: studentAssignment3Id,
          requestedDeadlineAt: '2026-12-03T23:59:59.999Z',
          reason: 'Xin gia hạn bài tập 3 vì lý do sức khỏe',
        })
        .expect(201);

      request3Id = res3.body.data.id;
      createdExtensionIds.push(request3Id);
    });

    it('verifies monthly quota endpoint shows 3/3 used and 0 remaining', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/extension-requests/quota')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.used).toBe(3);
      expect(res.body.data.limit).toBe(3);
      expect(res.body.data.remaining).toBe(0);
    });

    it('rejects 4th extension request when quota is exhausted (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          studentAssignmentId: studentAssignment4Id,
          requestedDeadlineAt: '2026-12-04T23:59:59.999Z',
          reason: 'Cố xin gia hạn lần thứ 4 trong tháng',
        })
        .expect(400);
    });

    it('prevents duplicate pending requests for the same student assignment (409 Conflict)', async () => {
      // studentAssignment1 already has request1 in PENDING status
      await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          studentAssignmentId: studentAssignment1Id,
          requestedDeadlineAt: '2026-12-10T23:59:59.999Z',
          reason: 'Cố xin thêm một request nữa cho cùng bài tập',
        })
        .expect(409);
    });

    it('denies Teacher B from approving requests in Teacher A course (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/extension-requests/${request1Id}/review`)
        .set('Authorization', `Bearer ${teacherBToken}`)
        .send({
          status: ExtensionRequestStatus.APPROVED,
          reviewNote: 'Teacher B không có quyền duyệt bài lớp Teacher A',
        })
        .expect(403);
    });

    it('teacher approves request 1: atomically updates effectiveDeadlineAt on student assignment', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/extension-requests/${request1Id}/review`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          status: ExtensionRequestStatus.APPROVED,
          reviewNote: 'Đồng ý gia hạn thêm.',
        })
        .expect(200);

      expect(res.body.data.status).toBe(ExtensionRequestStatus.APPROVED);

      // Verify StudentAssignment document has updated effectiveDeadlineAt
      const sa = await connection
        .collection('student_assignments')
        .findOne({ _id: new Types.ObjectId(studentAssignment1Id) });

      expect(new Date(sa!.effectiveDeadlineAt).toISOString()).toBe('2026-12-01T23:59:59.999Z');
    });

    it('teacher rejects request 2: preserves previous effectiveDeadlineAt', async () => {
      const saBefore = await connection
        .collection('student_assignments')
        .findOne({ _id: new Types.ObjectId(studentAssignment2Id) });

      const prevDeadlineIso = new Date(saBefore!.effectiveDeadlineAt).toISOString();

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/extension-requests/${request2Id}/review`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          status: ExtensionRequestStatus.REJECTED,
          reviewNote: 'Không chấp thuận.',
        })
        .expect(200);

      expect(res.body.data.status).toBe(ExtensionRequestStatus.REJECTED);

      const saAfter = await connection
        .collection('student_assignments')
        .findOne({ _id: new Types.ObjectId(studentAssignment2Id) });

      // Deadline is preserved exactly as before
      expect(new Date(saAfter!.effectiveDeadlineAt).toISOString()).toBe(prevDeadlineIso);
    });

    it('student cancels their own pending request 3', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/extension-requests/${request3Id}/cancel`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.status).toBe(ExtensionRequestStatus.CANCELLED);
    });
  });

  describe('2. Overdue Deadline Processor & Idempotent Penalty Ledger', () => {
    let overdueAssignmentId: string;
    let penaltyTransactionId: string;

    beforeAll(async () => {
      // Create exercise
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Overdue Test Exercise',
          type: ExerciseType.READING,
          passage: 'Passage for overdue test...',
          passScore: 70,
          questions: [
            {
              questionId: 'q-od-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Is it overdue?',
              options: [
                { key: 'A', text: 'Yes' },
                { key: 'B', text: 'No' },
              ],
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
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      // Create assignment with deadline in the past
      const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const asRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseAId,
          exerciseId: exId,
          title: 'Past Due Assignment',
          openAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
          deadlineAt: pastDeadline.toISOString(),
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      overdueAssignmentId = asRes.body.data.id;
      createdAssignmentIds.push(overdueAssignmentId);

      const sa = await connection
        .collection('student_assignments')
        .findOne({
          assignmentId: new Types.ObjectId(overdueAssignmentId),
          studentId: new Types.ObjectId(student1Id),
        });

      overdueStudentAssignmentId = sa!._id.toHexString();
    });

    it('processes overdue assignments: marks status OVERDUE and generates exactly +1 penalty', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/deadlines/process-overdue')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ courseId: courseAId })
        .expect(200);

      expect(res.body.data.processedCount).toBeGreaterThanOrEqual(1);
      expect(res.body.data.newPenaltiesCount).toBeGreaterThanOrEqual(1);

      // Check student assignment is marked OVERDUE
      const sa = await connection
        .collection('student_assignments')
        .findOne({ _id: new Types.ObjectId(overdueStudentAssignmentId) });

      expect(sa!.status).toBe(StudentAssignmentStatus.OVERDUE);

      // Check penalty transaction was created
      const penalty = await connection
        .collection('penalty_transactions')
        .findOne({ studentAssignmentId: new Types.ObjectId(overdueStudentAssignmentId) });

      expect(penalty).toBeDefined();
      expect(penalty!.deltaPoints).toBe(1);
      penaltyTransactionId = penalty!._id.toHexString();
      createdPenaltyIds.push(penaltyTransactionId);
    });

    it('running overdue processor a second time is strictly idempotent (does not duplicate penalty)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/deadlines/process-overdue')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ courseId: courseAId })
        .expect(200);

      // 0 new penalties charged!
      expect(res.body.data.newPenaltiesCount).toBe(0);

      // Count penalty transactions for this student assignment: exactly 1
      const count = await connection
        .collection('penalty_transactions')
        .countDocuments({ studentAssignmentId: new Types.ObjectId(overdueStudentAssignmentId) });

      expect(count).toBe(1);
    });

    it('student views own penalty points and ledger (totalPoints: 1)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/penalties/mine')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.totalPoints).toBe(1);
      expect(res.body.data.totalVnd).toBeUndefined();
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].deltaPoints).toBe(1);
    });

    it('teacher reverses penalty with audit reason, creating compensating transaction (-1 pt)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/penalties/${penaltyTransactionId}/reverse`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          reason: 'Học viên đã nộp giấy xác nhận cấp cứu của bệnh viện.',
        })
        .expect(200);

      expect(res.body.data.deltaPoints).toBe(-1);
      expect(res.body.data.reversedTransactionId).toBe(penaltyTransactionId);
      createdPenaltyIds.push(res.body.data.id);

      // Student views ledger: net totalPoints is now 0, but both transactions are preserved!
      const studentLedgerRes = await request(app.getHttpServer())
        .get('/api/v1/penalties/mine')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(studentLedgerRes.body.data.totalPoints).toBe(0);
      expect(studentLedgerRes.body.data.totalVnd).toBeUndefined();
      // Both original +1 and compensating -1 transactions exist:
      expect(studentLedgerRes.body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects reversing the same penalty a second time (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/penalties/${penaltyTransactionId}/reverse`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          reason: 'Cố reverse lần 2...',
        })
        .expect(400);
    });

    it('teacher views overdue assignments list via /deadlines/overdue', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/deadlines/overdue')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .query({ courseId: courseAId })
        .expect(200);

      expect(res.body.data.items.some((i: any) => i.id === overdueStudentAssignmentId)).toBe(true);
    });
  });

  describe('3. Audit Regressions: Changed Deadlines & Extension Approval Penalty Reversal', () => {
    it('audit item 3: changing effective deadline does not create a second penalty for the same student assignment', async () => {
      // Modify effectiveDeadlineAt for overdueStudentAssignmentId to another past date
      const alteredPastDate = new Date(Date.now() - 72 * 60 * 60 * 1000); // 3 days ago
      await connection.collection('student_assignments').updateOne(
        { _id: new Types.ObjectId(overdueStudentAssignmentId) },
        { $set: { effectiveDeadlineAt: alteredPastDate, status: StudentAssignmentStatus.SUBMITTED } },
      );

      // Run overdue processor again
      const res = await request(app.getHttpServer())
        .post('/api/v1/deadlines/process-overdue')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ courseId: courseAId })
        .expect(200);

      expect(res.body.data.newPenaltiesCount).toBe(0);

      // Even though effectiveDeadline changed, an active penalty already exists for this assignment, so no second penalty is created!
      const positivePenalties = await connection
        .collection('penalty_transactions')
        .find({
          studentAssignmentId: new Types.ObjectId(overdueStudentAssignmentId),
          deltaPoints: 1,
        })
        .toArray();

      expect(positivePenalties).toHaveLength(1);
    });

    it('audit item 4: approved extension automatically reverses active overdue penalty', async () => {
      // Create a fresh student3 with clean ledger
      const student3Email = `student.3.p6.${runSuffix}@ielts-lms.local`;
      const student3Id = await createUser(adminToken, {
        fullName: 'Student Three P6',
        email: student3Email,
        password: 'Password@123',
        role: UserRole.STUDENT,
      });
      const student3Token = await loginAs(student3Email, 'Password@123');

      // Create a dedicated course C
      const courseCId = await createCourse(adminToken, {
        code: `P6-CRS-C-${runSuffix}`,
        title: 'Phase 6 Course C Clean Ledger',
        startBand: 6.0,
        targetBand: 7.5,
        type: CourseType.GROUP,
        teacherId: teacherAId,
      });
      await enrollStudent(teacherAToken, courseCId, student3Id);

      // Create a past-due exercise & assignment in course C
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Student3 Overdue Exercise',
          type: ExerciseType.READING,
          passage: 'Passage for student 3 overdue check',
          questions: [
            {
              questionId: 'q-s3',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Question S3',
              options: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }],
              answerSpecification: { correctKey: 'A' },
              points: 1,
            },
          ],
        })
        .expect(201);

      const s3ExId = exRes.body.data.id;
      createdExerciseIds.push(s3ExId);

      await request(app.getHttpServer())
        .post(`/api/v1/exercises/${s3ExId}/publish`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      const s3AsRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseCId,
          exerciseId: s3ExId,
          title: 'Student 3 Past Due Assignment',
          deadlineAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      const s3AssignmentId = s3AsRes.body.data.id;
      createdAssignmentIds.push(s3AssignmentId);

      const s3Sa = await connection.collection('student_assignments').findOne({
        assignmentId: new Types.ObjectId(s3AssignmentId),
        studentId: new Types.ObjectId(student3Id),
      });
      const s3SaId = s3Sa!._id.toHexString();

      // Run overdue processor for courseC to mark OVERDUE and create penalty
      await request(app.getHttpServer())
        .post('/api/v1/deadlines/process-overdue')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({ courseId: courseCId })
        .expect(200);

      // Verify student 3 has exactly 1 penalty point
      const s3LedgerBefore = await request(app.getHttpServer())
        .get('/api/v1/penalties/mine')
        .set('Authorization', `Bearer ${student3Token}`)
        .expect(200);
      expect(s3LedgerBefore.body.data.totalPoints).toBe(1);

      // Student 3 requests extension into the future
      const extRes = await request(app.getHttpServer())
        .post('/api/v1/extension-requests')
        .set('Authorization', `Bearer ${student3Token}`)
        .send({
          studentAssignmentId: s3SaId,
          requestedDeadlineAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          reason: 'Bị sự cố đường truyền mạng, xin gia hạn thêm 2 ngày',
        })
        .expect(201);

      const s3RequestId = extRes.body.data.id;
      createdExtensionIds.push(s3RequestId);

      // Teacher approves the extension request
      await request(app.getHttpServer())
        .patch(`/api/v1/extension-requests/${s3RequestId}/review`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          status: ExtensionRequestStatus.APPROVED,
          reviewNote: 'Đồng ý gia hạn, hủy phạt tự động',
        })
        .expect(200);

      // Verify: studentAssignment status reverted from OVERDUE to NOT_STARTED
      const updatedSa = await connection.collection('student_assignments').findOne({
        _id: new Types.ObjectId(s3SaId),
      });
      expect(updatedSa!.status).toBe(StudentAssignmentStatus.NOT_STARTED);

      // Verify: student3 ledger net points is now 0 (compensating reversal transaction created)
      const s3LedgerAfter = await request(app.getHttpServer())
        .get('/api/v1/penalties/mine')
        .set('Authorization', `Bearer ${student3Token}`)
        .expect(200);
      expect(s3LedgerAfter.body.data.totalPoints).toBe(0);

      const s3Penalties = await connection
        .collection('penalty_transactions')
        .find({ studentAssignmentId: new Types.ObjectId(s3SaId) })
        .toArray();
      expect(s3Penalties.some((p) => p.deltaPoints === -1)).toBe(true);
    });
  });
});

