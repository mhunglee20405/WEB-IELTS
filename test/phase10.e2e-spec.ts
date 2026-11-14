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
  AssignmentStatus,
  CourseType,
  ExamMode,
  ExamPreset,
  ExamQuestionType,
  ExamSkill,
  PartType,
  StudentAssignmentStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { formatVnDateTime } from 'src/common/utils/timezone.util';

describe('Phase 10: Daily Assignment Scheduling & Teacher-Configurable IELTS Assignments (e2e)', () => {
  jest.setTimeout(60000);

  let app: INestApplication;
  let connection: Connection;

  let adminToken: string;
  let teacher1Token: string;
  let teacher2Token: string;
  let student1Token: string;
  let student2Token: string;

  let teacher1Id: string;
  let teacher2Id: string;
  let student1Id: string;
  let student2Id: string;

  let courseId: string;
  let readingTestId: string;
  let passage1Id: string;
  let group1Id: string;
  let group2Id: string;

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
    connection = moduleFixture.get<Connection>(getConnectionToken());

    // 1. Login as Admin
    const adminAuth = await loginAs('admin@ielts-lms.local', 'Admin@123456');
    adminToken = adminAuth.accessToken;

    // 2. Create Teachers & Students
    teacher1Id = await createUser(adminToken, {
      fullName: `Teacher Phase10 A ${runSuffix}`,
      email: `teacher1.p10.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });

    teacher2Id = await createUser(adminToken, {
      fullName: `Teacher Phase10 B ${runSuffix}`,
      email: `teacher2.p10.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });

    student1Id = await createUser(adminToken, {
      fullName: `Student Phase10 1 ${runSuffix}`,
      email: `student1.p10.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    student2Id = await createUser(adminToken, {
      fullName: `Student Phase10 2 ${runSuffix}`,
      email: `student2.p10.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    const t1Auth = await loginAs(`teacher1.p10.${runSuffix}@ielts-lms.local`, 'Password@123');
    teacher1Token = t1Auth.accessToken;

    const t2Auth = await loginAs(`teacher2.p10.${runSuffix}@ielts-lms.local`, 'Password@123');
    teacher2Token = t2Auth.accessToken;

    const s1Auth = await loginAs(`student1.p10.${runSuffix}@ielts-lms.local`, 'Password@123');
    student1Token = s1Auth.accessToken;

    const s2Auth = await loginAs(`student2.p10.${runSuffix}@ielts-lms.local`, 'Password@123');
    student2Token = s2Auth.accessToken;

    // 3. Create Course with teacher1 as instructor
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `P10-CRS-${runSuffix}`,
        title: `Phase 10 IELTS Preparation ${runSuffix}`,
        description: 'Comprehensive course for testing daily assignments and question configurations',
        type: CourseType.GROUP,
        teacherId: teacher1Id,
        startBand: 5.5,
        targetBand: 7.0,
      })
      .expect(201);
    courseId = courseRes.body.data._id || courseRes.body.data.id;

    // 4. Enroll student1 and student2 in course
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student1Id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId: student2Id })
      .expect(201);

    // 5. Create an IELTS Reading Test with 2 Question Groups in Passage 1 via Teacher API
    const testRes = await request(app.getHttpServer())
      .post('/api/v1/teacher/exam-tests')
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({
        title: `Phase 10 Climate & Renewable Energy Test ${runSuffix}`,
        skill: ExamSkill.READING,
        allowedModes: [ExamMode.PART, ExamMode.FULL],
        passScore: 70,
        fullDurationSeconds: 3600,
        translationEnabled: true,
        examPreset: ExamPreset.IELTS_ACADEMIC,
        description: 'Reading Practice Test with 2 Question Groups',
      })
      .expect(201);

    readingTestId = testRes.body.data._id || testRes.body.data.id;

    // Add Passage 1
    const p1Res = await request(app.getHttpServer())
      .post(`/api/v1/teacher/exam-tests/${readingTestId}/parts`)
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({
        type: PartType.PASSAGE,
        ordinal: 1,
        title: 'Passage 1: Renewable Power Sources',
        contentHtml: '<p>Renewable energy is energy derived from natural resources that replenish more rapidly than consumed...</p>',
        durationSeconds: 1800,
      })
      .expect(201);

    passage1Id = p1Res.body.data.parts[0].id || p1Res.body.data.parts[0]._id;

    // Add Question Group 1 (Questions 1–5: TRUE_FALSE_NOT_GIVEN)
    const qg1Res = await request(app.getHttpServer())
      .post(`/api/v1/teacher/exam-tests/${readingTestId}/parts/${passage1Id}/question-groups`)
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({
        title: 'Questions 1–5',
        instruction: 'Do the following statements agree with the information? Choose TRUE, FALSE or NOT GIVEN.',
        type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
        order: 1,
        questions: [
          { number: 1, prompt: 'Renewable energy replenishes rapidly.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'] } },
          { number: 2, prompt: 'Coal is renewable.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['FALSE'] } },
          { number: 3, prompt: 'Solar power is derived from the sun.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'] } },
          { number: 4, prompt: 'Fossil fuels never run out.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['FALSE'] } },
          { number: 5, prompt: 'Wind power was invented in the 18th century.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['NOT GIVEN'] } },
        ],
      })
      .expect(201);

    // Add Question Group 2 (Questions 6–10: MULTIPLE_CHOICE_SINGLE)
    const qg2Res = await request(app.getHttpServer())
      .post(`/api/v1/teacher/exam-tests/${readingTestId}/parts/${passage1Id}/question-groups`)
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({
        title: 'Questions 6–10',
        instruction: 'Choose the correct letter A, B, C or D.',
        type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE,
        order: 2,
        questions: [
          { number: 6, prompt: 'What is the primary source?', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['A'] } },
          { number: 7, prompt: 'Second question?', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['B'] } },
          { number: 8, prompt: 'Third question?', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['C'] } },
          { number: 9, prompt: 'Fourth question?', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['D'] } },
          { number: 10, prompt: 'Fifth question?', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['A'] } },
        ],
      })
      .expect(201);

    group1Id = qg1Res.body.data.parts[0].questionGroups[0].id || qg1Res.body.data.parts[0].questionGroups[0]._id;
    group2Id = qg2Res.body.data.parts[0].questionGroups[1].id || qg2Res.body.data.parts[0].questionGroups[1]._id;

    // Publish the test so it can be assigned
    await request(app.getHttpServer())
      .post(`/api/v1/teacher/exam-tests/${readingTestId}/publish`)
      .set('Authorization', `Bearer ${teacher1Token}`)
      .expect(200);
  });

  afterAll(async () => {
    if (connection) {
      await connection.collection('exam_tests').deleteMany({ title: new RegExp(`.*${runSuffix}.*`) });
      await connection.collection('assignments').deleteMany({ courseId: new Types.ObjectId(courseId) });
      await connection.collection('student_assignments').deleteMany({ studentId: { $in: [new Types.ObjectId(student1Id), new Types.ObjectId(student2Id)] } });
      await connection.collection('exam_attempts').deleteMany({ studentId: { $in: [new Types.ObjectId(student1Id), new Types.ObjectId(student2Id)] } });
      await connection.collection('users').deleteMany({ email: new RegExp(`.*\\.p10\\.${runSuffix}@.*`) });
      await connection.collection('courses').deleteMany({ code: `P10-CRS-${runSuffix}` });
    }
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // Section 1: Validation & Preview Endpoints
  // ==========================================
  describe('Assignment Validation & Preview Endpoints', () => {
    it('AC-05a: POST /assignments/validate validates assignment configuration successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/validate')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          assignedDate: '2026-11-25',
          requiredScope: 'FULL',
          durationSecondsOverride: 3600,
          targetScorePercent: 75,
        })
        .expect(200);

      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.errors).toHaveLength(0);
    });

    it('AC-05b: POST /assignments/validate returns descriptive errors for invalid configuration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/validate')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          assignedDate: 'invalid-date',
          requiredScope: 'PART', // Missing requiredPartId
          targetScorePercent: 120, // Exceeds 100
        })
        .expect(200);

      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.errors.length).toBeGreaterThan(0);
      expect(res.body.data.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('requiredPartId is required'),
          expect.stringContaining('assignedDate must be in YYYY-MM-DD format'),
        ]),
      );
    });

    it('AC-06a: POST /assignments/preview returns preview data without persisting to DB', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments/preview')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          assignedDate: '2026-11-25',
          requiredScope: 'PART',
          requiredPartId: passage1Id,
          selectedQuestionGroupIds: [group1Id],
          targetScorePercent: 80,
        })
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.assignedDate).toBe('2026-11-25');
      expect(res.body.data.openAtVn).toContain('2026-11-25T06:00:00+07:00');
      expect(res.body.data.deadlineAtVn).toContain('2026-11-26T06:00:00+07:00');
      expect(res.body.data.questionCount).toBe(5); // Only group 1 selected (5 questions)
      expect(res.body.data.passage).toBeDefined();
    });
  });

  // ==========================================
  // Section 2: Fixed Daily Window & Scheduling
  // ==========================================
  describe('Fixed Daily Window & Advance Scheduling', () => {
    let scheduledAssignmentId: string;

    it('AC-01: Teacher creates a daily assignment with assignedDate 06:00 VN bounds', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          title: `Daily Reading Practice 2026-11-28 ${runSuffix}`,
          assignedDate: '2026-11-28',
          action: 'publish',
          targetScorePercent: 70,
        })
        .expect(201);

      scheduledAssignmentId = res.body.data.id || res.body.data._id;
      expect(scheduledAssignmentId).toBeDefined();
      expect(res.body.data.assignedDate).toBe('2026-11-28');
      expect(res.body.data.openAtVn).toContain('2026-11-28T06:00:00+07:00');
      expect(res.body.data.deadlineAtVn).toContain('2026-11-29T06:00:00+07:00');
      expect(res.body.data.availableAtVn).toContain('2026-11-28T06:00:00+07:00');
      expect(res.body.data.dueAtVn).toContain('2026-11-29T06:00:00+07:00');
      // Because 2026-11-28 is in the future, scheduleStatus is SCHEDULED
      expect(res.body.data.scheduleStatus).toBe('SCHEDULED');
    });

    it('AC-02: Student checks /assignments/mine and sees assignment as SCHEDULED (isAvailable: false)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignments/mine')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      const items = res.body.data.items || res.body.data;
      const mine = items.find((a: any) => (a.id || a._id) === scheduledAssignmentId);
      expect(mine).toBeDefined();
      expect(mine.scheduleStatus).toBe('SCHEDULED');
      expect(mine.isAvailable).toBe(false);
      expect(mine.remainingSeconds).toBeGreaterThan(0);
    });

    it('AC-03: Zero-Leakage Content Protection: Student cannot view passage/questions before availableAt', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${scheduledAssignmentId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.scheduleStatus).toBe('SCHEDULED');
      expect(res.body.data.isAvailable).toBe(false);
      // Questions and passage MUST NOT be leaked!
      expect(res.body.data.exercise.passage).toBeUndefined();
      expect(res.body.data.exercise.questions).toBeUndefined();
      expect(res.body.data.exercise.questionCount).toBe(10);
    });

    it('AC-04: Start Attempt Protection: Student cannot start attempt before availableAt', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          assignmentId: scheduledAssignmentId,
          mode: ExamMode.FULL,
        })
        .expect(403);

      expect(res.body.code || res.body.message).toContain('ASSIGNMENT_NOT_YET_AVAILABLE');
    });

    it('AC-06b: GET /assignments/:id/preview allows teacher to preview full content', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${scheduledAssignmentId}/preview`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .expect(200);

      expect(res.body.data.exerciseSnapshot).toBeDefined();
      expect(res.body.data.exerciseSnapshot.passage).toContain('Renewable energy');
      expect(res.body.data.exerciseSnapshot.questions).toHaveLength(10);
    });
  });

  // ==========================================
  // Section 3: Question Group Filtering & Idempotency
  // ==========================================
  describe('Question Bank Filtering & Duplicate Prevention', () => {
    it('AC-07: Teacher configures assignment with only selectedQuestionGroupIds', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          title: `Group 1 Only Practice ${runSuffix}`,
          assignedDate: '2026-11-29',
          requiredScope: 'PART',
          requiredPartId: passage1Id,
          selectedQuestionGroupIds: [group1Id],
          targetScorePercent: 70,
        })
        .expect(201);

      const created = res.body.data;
      expect(created.selectedQuestionGroupIds).toEqual([group1Id]);
      expect(created.exerciseSnapshot.questions).toHaveLength(5); // Only group 1's 5 questions
    });

    it('AC-08: Client Idempotency prevents duplicate assignment creation', async () => {
      const idemKey = `idem-${runSuffix}-${Date.now()}`;
      const payload = {
        courseId,
        exerciseId: readingTestId,
        title: `Idempotent Daily Assignment ${runSuffix}`,
        assignedDate: '2026-11-30',
        idempotencyKey: idemKey,
      };

      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send(payload)
        .expect(201);

      const firstId = firstRes.body.data.id || firstRes.body.data._id;

      // Second identical request with same idempotencyKey returns existing
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send(payload)
        .expect(201);

      const secondId = secondRes.body.data.id || secondRes.body.data._id;
      expect(secondId).toBe(firstId);
    });
  });

  // ==========================================
  // Section 4: Active Daily Assignment Execution & Translation Unlock
  // ==========================================
  describe('Active Assignment Execution & Decoupled Target Score', () => {
    let activeAssignmentId: string;
    let attemptId: string;

    it('AC-09: Student can access questions and start attempt for active daily assignment', async () => {
      // Create an assignment open today: openAt 1 hour ago, deadline in 23 hours
      const openAt = new Date(Date.now() - 3600000);
      const deadlineAt = new Date(Date.now() + 23 * 3600000);

      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          title: `Active Daily Test ${runSuffix}`,
          openAt: openAt.toISOString(),
          deadlineAt: deadlineAt.toISOString(),
          targetScorePercent: 50, // Teacher sets low target of 50%
          durationSecondsOverride: 1800,
        })
        .expect(201);

      activeAssignmentId = res.body.data.id || res.body.data._id;

      // Student checks assignment details
      const studentView = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${activeAssignmentId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(studentView.body.data.scheduleStatus).toBe('AVAILABLE');
      expect(studentView.body.data.isAvailable).toBe(true);
      expect(studentView.body.data.exercise.passage).toBeDefined();
      expect(studentView.body.data.exercise.questions).toHaveLength(10);
      // Ensure answerSpecification is sanitized away from student!
      expect(studentView.body.data.exercise.questions[0].answerSpecification).toBeUndefined();

      // Student starts attempt
      const attemptRes = await request(app.getHttpServer())
        .post('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          assignmentId: activeAssignmentId,
          mode: ExamMode.FULL,
        })
        .expect(201);

      attemptId = attemptRes.body.data.id || attemptRes.body.data._id;
      expect(attemptId).toBeDefined();
    });

    it('AC-10: Attempt expiration is capped by assignment deadline', async () => {
      // Create an assignment that expires in 10 minutes
      const openAt = new Date(Date.now() - 3600000);
      const deadlineAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      const shortAssignmentRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          title: `Short Deadline Test ${runSuffix}`,
          openAt: openAt.toISOString(),
          deadlineAt: deadlineAt.toISOString(),
          durationSecondsOverride: 3600, // 60 minutes duration!
        })
        .expect(201);

      const shortId = shortAssignmentRes.body.data.id || shortAssignmentRes.body.data._id;

      const attemptRes = await request(app.getHttpServer())
        .post('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${student2Token}`)
        .send({
          assignmentId: shortId,
          mode: ExamMode.FULL,
        })
        .expect(201);

      const expiresAt = new Date(attemptRes.body.data.expiresAt).getTime();
      const deadlineMs = deadlineAt.getTime();
      // Attempt expiration must not exceed the assignment deadline!
      expect(expiresAt).toBeLessThanOrEqual(deadlineMs + 1000);
    });

    it('AC-11: 60% score achieves target (50%) but does NOT unlock reading translation (strictly 70%)', async () => {
      // Autosave answers to get 6 out of 10 questions right (60%)
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          baseRevision: 0,
          answers: [
            { questionId: '1', value: 'TRUE' }, // correct (1 pt)
            { questionId: '2', value: 'FALSE' }, // correct (1 pt)
            { questionId: '3', value: 'TRUE' }, // correct (1 pt)
            { questionId: '4', value: 'FALSE' }, // correct (1 pt)
            { questionId: '5', value: 'NOT GIVEN' }, // correct (1 pt)
            { questionId: '6', value: 'A' }, // correct (1 pt)
            { questionId: '7', value: 'WRONG' }, // incorrect
            { questionId: '8', value: 'WRONG' }, // incorrect
            { questionId: '9', value: 'WRONG' }, // incorrect
            { questionId: '10', value: 'WRONG' }, // incorrect
          ],
        })
        .expect(200);

      // Submit attempt
      const submitRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptId}/submit`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(submitRes.body.data.earnedPoints).toBe(6);
      expect(submitRes.body.data.scorePercent).toBe(60);

      // Student assignment status
      const assignRes = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${activeAssignmentId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      // Since target was 50%, 60% achieves course target:
      expect(assignRes.body.data.isTargetAchieved).toBe(true);

      // But Reading Translation eligibility requires >= 70% unrounded threshold:
      const eligRes = await request(app.getHttpServer())
        .get(`/api/v1/reading-translations/eligibility?testId=${readingTestId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(eligRes.body.data.passages[0].unlocked).toBe(false);
    });

    it('AC-11b: Achieving >= 70% strictly unlocks Reading Translation', async () => {
      // Start second attempt
      const attempt2Res = await request(app.getHttpServer())
        .post('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          assignmentId: activeAssignmentId,
          mode: ExamMode.FULL,
        })
        .expect(201);

      const attempt2Id = attempt2Res.body.data.id || attempt2Res.body.data._id;

      // Autosave 8 out of 10 correct (80%)
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attempt2Id}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          baseRevision: 0,
          answers: [
            { questionId: '1', value: 'TRUE' }, // correct
            { questionId: '2', value: 'FALSE' }, // correct
            { questionId: '3', value: 'TRUE' }, // correct
            { questionId: '4', value: 'FALSE' }, // correct
            { questionId: '5', value: 'NOT GIVEN' }, // correct
            { questionId: '6', value: 'A' }, // correct
            { questionId: '7', value: 'B' }, // correct
            { questionId: '8', value: 'C' }, // correct
            { questionId: '9', value: 'WRONG' }, // incorrect
            { questionId: '10', value: 'WRONG' }, // incorrect
          ],
        })
        .expect(200);

      const submit2Res = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attempt2Id}/submit`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(submit2Res.body.data.earnedPoints).toBe(8);
      expect(submit2Res.body.data.scorePercent).toBe(80);

      // Check translation eligibility now
      const eligRes = await request(app.getHttpServer())
        .get(`/api/v1/reading-translations/eligibility?testId=${readingTestId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(eligRes.body.data.passages[0].unlocked).toBe(true);
    });
  });
});
