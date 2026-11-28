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
  CourseStatus,
  CourseType,
  EnrollmentStatus,
  ExerciseStatus,
  ExerciseType,
  QuestionType,
  StudentAssignmentStatus,
  UserRole,
} from 'src/database/schemas/enums';

describe('Phase 4: Exercise Bank & Assignment Management (e2e)', () => {
  jest.setTimeout(30000);
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

  let courseAId: string;
  let courseBId: string;

  const runSuffix = Date.now().toString().slice(-6);
  const createdUserEmails: string[] = [];
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

    // 2. Create dedicated teachers and students
    teacherAId = await createUser(adminToken, {
      fullName: 'Teacher Alpha P4',
      email: `teacher.a.p4.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    teacherBId = await createUser(adminToken, {
      fullName: 'Teacher Beta P4',
      email: `teacher.b.p4.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    student1Id = await createUser(adminToken, {
      fullName: 'Student 1 P4',
      email: `student.1.p4.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });
    student2Id = await createUser(adminToken, {
      fullName: 'Student 2 P4',
      email: `student.2.p4.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    [teacherAToken, teacherBToken, student1Token, student2Token] = await Promise.all([
      loginAs(`teacher.a.p4.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`teacher.b.p4.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.1.p4.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.2.p4.${runSuffix}@ielts-lms.local`, 'Password@123'),
    ]);

    // 3. Create courses
    courseAId = await createCourse(adminToken, {
      code: `P4-CRS-A-${runSuffix}`,
      title: 'Phase 4 Reading Course A',
      startBand: 5.5,
      targetBand: 7.0,
      type: CourseType.GROUP,
      teacherId: teacherAId,
    });
    courseBId = await createCourse(adminToken, {
      code: `P4-CRS-B-${runSuffix}`,
      title: 'Phase 4 Writing Course B',
      startBand: 6.0,
      targetBand: 7.5,
      type: CourseType.GROUP,
      teacherId: teacherBId,
    });

    // 4. Enroll student1 in course A
    await enrollStudent(teacherAToken, courseAId, student1Id);
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

      await Promise.all([
        connection.collection('users').deleteMany({ email: { $in: createdUserEmails } }),
        connection.collection('courses').deleteMany({ _id: { $in: courseObjIds } }),
        connection.collection('enrollments').deleteMany({ courseId: { $in: courseObjIds } }),
        connection.collection('exercises').deleteMany({ _id: { $in: exerciseObjIds } }),
        connection.collection('assignments').deleteMany({ _id: { $in: assignmentObjIds } }),
        connection.collection('student_assignments').deleteMany({ assignmentId: { $in: assignmentObjIds } }),
      ]);
    }

    if (app) {
      await app.close();
    }
  });

  describe('1. Exercise Bank Management', () => {
    let readingExerciseId: string;
    let listeningExerciseId: string;

    it('denies student from creating exercises (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          title: 'Student Attempt Exercise',
          type: ExerciseType.READING,
          questions: [
            {
              questionId: 'q-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Sample?',
              options: [{ key: 'A', text: 'Option A' }, { key: 'B', text: 'Option B' }],
              answerSpecification: { correctKey: 'A' },
              points: 1,
            },
          ],
        })
        .expect(403);
    });

    it('rejects Multiple Choice question with invalid correctKey (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Invalid MCQ Exercise',
          type: ExerciseType.READING,
          passage: 'Sample passage text...',
          questions: [
            {
              questionId: 'q-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Which is correct?',
              options: [
                { key: 'A', text: 'First' },
                { key: 'B', text: 'Second' },
              ],
              answerSpecification: { correctKey: 'Z' }, // Does not exist in options
              points: 1,
            },
          ],
        })
        .expect(400);
    });

    it('creates a READING exercise in DRAFT status with IELTS MCQ and T/F/NG questions', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'The History of Glass',
          description: 'Academic Reading Passage 1',
          type: ExerciseType.READING,
          passage:
            'Glass was first manufactured in the ancient world around 3500 BC in Mesopotamia. Craftsmen discovered that heating sand, soda and lime produced a transparent substance...',
          passScore: 70,
          questions: [
            {
              questionId: 'q-mcq-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Where was glass first produced?',
              options: [
                { key: 'A', text: 'Ancient Egypt' },
                { key: 'B', text: 'Mesopotamia' },
                { key: 'C', text: 'Ancient Greece' },
                { key: 'D', text: 'Roman Empire' },
              ],
              answerSpecification: { correctKey: 'B' },
              points: 1,
              explanation: 'Paragraph 1 mentions 3500 BC in Mesopotamia.',
            },
            {
              questionId: 'q-tfng-2',
              type: QuestionType.TRUE_FALSE_NOT_GIVEN,
              prompt: 'Glass was originally opaque before new techniques were developed.',
              answerSpecification: { correctKey: 'TRUE' },
              points: 1,
              explanation: 'Text states early glass was not fully transparent.',
            },
          ],
        })
        .expect(201);

      readingExerciseId = res.body.data.id;
      createdExerciseIds.push(readingExerciseId);

      expect(res.body.data.title).toBe('The History of Glass');
      expect(res.body.data.status).toBe(ExerciseStatus.DRAFT);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.questions).toHaveLength(2);
    });

    it('creates a LISTENING exercise with audio reference and Fill in Blank question', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Campus Tour Listening Section 1',
          description: 'Orientation dialogue',
          type: ExerciseType.LISTENING,
          audioAssets: [
            {
              objectKey: 'audio/campus-tour-sec1.mp3',
              url: 'https://cdn.ielts-lms.local/audio/campus-tour-sec1.mp3',
              durationSeconds: 360,
            },
          ],
          passScore: 75,
          questions: [
            {
              questionId: 'q-fib-1',
              type: QuestionType.FILL_BLANK,
              prompt: 'The library opens at ___ on Saturdays.',
              answerSpecification: {
                acceptedAnswers: ['9 am', '9:00 am', '9.00 am'],
                caseSensitive: false,
              },
              points: 1,
              explanation: 'Audio states library operates from 9 am on weekends.',
            },
          ],
        })
        .expect(201);

      listeningExerciseId = res.body.data.id;
      createdExerciseIds.push(listeningExerciseId);

      expect(res.body.data.title).toBe('Campus Tour Listening Section 1');
      expect(res.body.data.type).toBe(ExerciseType.LISTENING);
      expect(res.body.data.audioAssets).toHaveLength(1);
      expect(res.body.data.status).toBe(ExerciseStatus.DRAFT);
    });

    it('publishes the READING exercise so it can be assigned', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exercises/${readingExerciseId}/publish`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(res.body.data.status).toBe(ExerciseStatus.PUBLISHED);
      expect(res.body.data.version).toBe(1);
    });

    it('increments version to 2 when a PUBLISHED exercise is modified', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/exercises/${readingExerciseId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'The History of Glass (Revised Edition)',
        })
        .expect(200);

      expect(res.body.data.title).toBe('The History of Glass (Revised Edition)');
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.status).toBe(ExerciseStatus.PUBLISHED);
    });

    it('forbids students from listing all exercises in the bank (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/exercises')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(403);
    });
  });

  describe('2. Assignment Management & Ownership', () => {
    let publishedExerciseId: string;
    let draftExerciseId: string;
    let assignmentAId: string;

    beforeAll(async () => {
      // Create a published exercise
      const pubRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Renewable Energy Reading',
          type: ExerciseType.READING,
          passage: 'Wind and solar energies are leading the transition to net-zero...',
          questions: [
            {
              questionId: 'q-ren-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'What powers wind turbines?',
              options: [
                { key: 'A', text: 'Air currents' },
                { key: 'B', text: 'Water tides' },
              ],
              answerSpecification: { correctKey: 'A' },
              points: 1,
              explanation: 'Kinetic energy from air currents.',
            },
          ],
        })
        .expect(201);

      publishedExerciseId = pubRes.body.data.id;
      createdExerciseIds.push(publishedExerciseId);

      await request(app.getHttpServer())
        .post(`/api/v1/exercises/${publishedExerciseId}/publish`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      // Create a draft exercise (never published)
      const draftRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Draft Unfinished Reading',
          type: ExerciseType.READING,
          passage: 'Draft passage...',
          questions: [
            {
              questionId: 'q-dr-1',
              type: QuestionType.SHORT_ANSWER,
              prompt: 'Draft question?',
              answerSpecification: { acceptedAnswers: ['sample'] },
              points: 1,
            },
          ],
        })
        .expect(201);

      draftExerciseId = draftRes.body.data.id;
      createdExerciseIds.push(draftExerciseId);
    });

    it('rejects assigning an unpublished DRAFT exercise (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseAId,
          exerciseId: draftExerciseId,
          targetDate: '2026-11-20',
        })
        .expect(400);
    });

    it('forbids Teacher B from assigning exercises to Course A taught by Teacher A (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherBToken}`)
        .send({
          courseId: courseAId,
          exerciseId: publishedExerciseId,
          targetDate: '2026-11-20',
        })
        .expect(403);
    });

    it('creates assignment with Vietnam daily bounds (00:00 to 23:59:59.999 local) and snapshots exercise', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseAId,
          exerciseId: publishedExerciseId,
          title: 'Day 1: Renewable Energy Assignment',
          targetDate: '2026-11-20',
          allowRetake: true,
          maxAttempts: 3,
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      assignmentAId = res.body.data.id;
      createdAssignmentIds.push(assignmentAId);

      expect(res.body.data.title).toBe('Day 1: Renewable Energy Assignment');
      expect(res.body.data.openAtVn).toBe('2026-11-20T00:00:00+07:00');
      expect(res.body.data.deadlineAtVn).toBe('2026-11-20T23:59:59+07:00');
      expect(res.body.data.allowRetake).toBe(true);
      expect(res.body.data.maxAttempts).toBe(3);
    });

    it('lists assignments scoped to teacher (Teacher A sees Course A assignments, Teacher B sees none)', async () => {
      const resA = await request(app.getHttpServer())
        .get('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(resA.body.data.items.some((a: any) => a.id === assignmentAId)).toBe(true);

      const resB = await request(app.getHttpServer())
        .get('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherBToken}`)
        .expect(200);

      expect(resB.body.data.items.some((a: any) => a.id === assignmentAId)).toBe(false);
    });
  });

  describe('3. Student Assignment Tracking & Backfill', () => {
    let testAssignmentId: string;
    let exerciseId: string;

    beforeAll(async () => {
      // Create exercise
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Tracking Test Exercise',
          type: ExerciseType.READING,
          passage: 'Tracking passage...',
          questions: [
            {
              questionId: 'q-tr-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Is tracking active?',
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

      exerciseId = exRes.body.data.id;
      createdExerciseIds.push(exerciseId);

      await request(app.getHttpServer())
        .post(`/api/v1/exercises/${exerciseId}/publish`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      // Create published assignment for Course A (Student 1 is already actively enrolled)
      const asRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseAId,
          exerciseId,
          title: 'Assignment with Roster Tracking',
          targetDate: '2026-11-25',
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      testAssignmentId = asRes.body.data.id;
      createdAssignmentIds.push(testAssignmentId);
    });

    it('automatically generates student_assignments record for Student 1 on assignment creation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${testAssignmentId}/students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(res.body.data.total).toBe(1);
      expect(res.body.data.items[0].student.id).toBe(student1Id);
      expect(res.body.data.items[0].status).toBe(StudentAssignmentStatus.NOT_STARTED);
      expect(res.body.data.items[0].effectiveDeadlineAtVn).toBe('2026-11-25T23:59:59+07:00');
    });

    it('backfills student_assignments when Student 2 enrolls into Course A after assignment was published', async () => {
      // 1. Enroll Student 2 into Course A
      await enrollStudent(teacherAToken, courseAId, student2Id);

      // 2. Trigger backfill
      const backfillRes = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${testAssignmentId}/backfill-students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(backfillRes.body.data.backfilledCount).toBe(1);
      expect(backfillRes.body.data.totalStudents).toBe(2);

      // 3. Check roster now has both Student 1 and Student 2
      const rosterRes = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${testAssignmentId}/students`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(rosterRes.body.data.total).toBe(2);
      const studentIds = rosterRes.body.data.items.map((i: any) => i.student.id);
      expect(studentIds).toContain(student1Id);
      expect(studentIds).toContain(student2Id);
    });

    it('returns assigned tasks for authenticated student via /assignments/mine', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assignments/mine')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.items.find((i: any) => i.assignmentId === testAssignmentId);
      expect(found).toBeDefined();
      expect(found.title).toBe('Assignment with Roster Tracking');
      expect(found.status).toBe(StudentAssignmentStatus.NOT_STARTED);
      expect(found.effectiveDeadlineAtVn).toBe('2026-11-25T23:59:59+07:00');
    });
  });

  describe('4. Answer Confidentiality & Anti-Leakage (Zero Leakage)', () => {
    let secretExerciseId: string;
    let secretAssignmentId: string;

    beforeAll(async () => {
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Top Secret IELTS Test',
          description: 'High-stakes test',
          type: ExerciseType.READING,
          passage: 'The discovery of penicilin by Alexander Fleming in 1928 revolutionized modern medicine...',
          questions: [
            {
              questionId: 'q-sec-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Who discovered penicillin?',
              options: [
                { key: 'A', text: 'Alexander Fleming' },
                { key: 'B', text: 'Louis Pasteur' },
              ],
              answerSpecification: { correctKey: 'A' },
              points: 2,
              explanation: 'TOP SECRET: Mentioned directly in first sentence.',
            },
          ],
        })
        .expect(201);

      secretExerciseId = exRes.body.data.id;
      createdExerciseIds.push(secretExerciseId);

      await request(app.getHttpServer())
        .post(`/api/v1/exercises/${secretExerciseId}/publish`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      const asRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseAId,
          exerciseId: secretExerciseId,
          title: 'Top Secret Assignment',
          targetDate: '2026-11-30',
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      secretAssignmentId = asRes.body.data.id;
      createdAssignmentIds.push(secretAssignmentId);
    });

    it('Teacher GET /exercises/:id returns full answer keys and explanations', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exercises/${secretExerciseId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(res.body.data.questions[0].answerSpecification).toBeDefined();
      expect(res.body.data.questions[0].answerSpecification.correctKey).toBe('A');
      expect(res.body.data.questions[0].explanation).toContain('TOP SECRET');
    });

    it('Teacher GET /assignments/:id returns full exercise snapshot with answer keys', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${secretAssignmentId}`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(res.body.data.exerciseSnapshot).toBeDefined();
      expect(res.body.data.exerciseSnapshot.questions[0].answerSpecification.correctKey).toBe('A');
    });

    it('Enrolled Student GET /exercises/:id NEVER receives answerSpecification or explanation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exercises/${secretExerciseId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      // Verify question prompts and options are visible
      expect(res.body.data.questions[0].prompt).toBe('Who discovered penicillin?');
      expect(res.body.data.questions[0].options).toHaveLength(2);

      // CRITICAL ZERO-LEAKAGE VERIFICATION:
      expect(res.body.data.questions[0].answerSpecification).toBeUndefined();
      expect(res.body.data.questions[0].explanation).toBeUndefined();

      // Check raw JSON text to ensure no leakage anywhere in the response string
      const rawBody = JSON.stringify(res.body);
      expect(rawBody).not.toContain('answerSpecification');
      expect(rawBody).not.toContain('TOP SECRET');
    });

    it('Enrolled Student GET /assignments/:id NEVER receives answerSpecification or explanation in snapshot', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${secretAssignmentId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.title).toBe('Top Secret Assignment');
      expect(res.body.data.myStatus).toBe(StudentAssignmentStatus.NOT_STARTED);
      expect(res.body.data.exercise).toBeDefined();
      expect(res.body.data.exercise.passage).toContain('Alexander Fleming');
      expect(res.body.data.exercise.questions[0].prompt).toBe('Who discovered penicillin?');

      // CRITICAL ZERO-LEAKAGE VERIFICATION:
      expect(res.body.data.exercise.questions[0].answerSpecification).toBeUndefined();
      expect(res.body.data.exercise.questions[0].explanation).toBeUndefined();

      // Check raw JSON string:
      const rawBody = JSON.stringify(res.body);
      expect(rawBody).not.toContain('answerSpecification');
      expect(rawBody).not.toContain('TOP SECRET');
    });
  });
});
