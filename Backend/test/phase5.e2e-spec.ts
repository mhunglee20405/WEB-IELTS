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
  QuestionType,
  StudentAssignmentStatus,
  TranslationSubmissionStatus,
  UserRole,
} from 'src/database/schemas/enums';

describe('Phase 5: Submissions, Auto-Grading & Reading Translation (e2e)', () => {
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

  const runSuffix = Date.now().toString().slice(-6);
  const createdUserEmails: string[] = [];
  const createdCourseIds: string[] = [];
  const createdExerciseIds: string[] = [];
  const createdAssignmentIds: string[] = [];
  const createdSubmissionIds: string[] = [];
  const createdTranslationIds: string[] = [];

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
      fullName: 'Teacher Alpha P5',
      email: `teacher.a.p5.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    teacherBId = await createUser(adminToken, {
      fullName: 'Teacher Beta P5',
      email: `teacher.b.p5.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    student1Id = await createUser(adminToken, {
      fullName: 'Student One P5',
      email: `student.1.p5.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });
    student2Id = await createUser(adminToken, {
      fullName: 'Student Two P5',
      email: `student.2.p5.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });

    [teacherAToken, teacherBToken, student1Token, student2Token] = await Promise.all([
      loginAs(`teacher.a.p5.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`teacher.b.p5.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.1.p5.${runSuffix}@ielts-lms.local`, 'Password@123'),
      loginAs(`student.2.p5.${runSuffix}@ielts-lms.local`, 'Password@123'),
    ]);

    // 3. Create course and enroll student 1
    courseAId = await createCourse(adminToken, {
      code: `P5-CRS-A-${runSuffix}`,
      title: 'Phase 5 Advanced Reading & Translation',
      startBand: 6.0,
      targetBand: 7.5,
      type: CourseType.GROUP,
      teacherId: teacherAId,
    });

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
      const submissionObjIds = createdSubmissionIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));
      const translationObjIds = createdTranslationIds
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id));

      await Promise.all([
        connection.collection('users').deleteMany({ email: { $in: createdUserEmails } }),
        connection.collection('courses').deleteMany({ _id: { $in: courseObjIds } }),
        connection.collection('enrollments').deleteMany({ courseId: { $in: courseObjIds } }),
        connection.collection('exercises').deleteMany({ _id: { $in: exerciseObjIds } }),
        connection.collection('assignments').deleteMany({ _id: { $in: assignmentObjIds } }),
        connection.collection('student_assignments').deleteMany({ assignmentId: { $in: assignmentObjIds } }),
        connection.collection('submissions').deleteMany({ _id: { $in: submissionObjIds } }),
        connection.collection('translation_submissions').deleteMany({ _id: { $in: translationObjIds } }),
      ]);
    }

    if (app) {
      await app.close();
    }
  });

  describe('1. Auto-Grading Engine & Submission Lifecycle', () => {
    let readingExerciseId: string;
    let readingAssignmentId: string;
    let submission1Id: string;

    beforeAll(async () => {
      // Create exercise with 3 questions:
      // q1: MCQ (1 pt) -> 'A'
      // q2: TFNG (1 pt) -> 'TRUE'
      // q3: FIB (2 pts) -> '18th century' or 'the 18th century'
      // Total points: 4 pts. PASS threshold: 70% (requires at least 2.8 pts -> 3 pts = 75%)
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'The Industrial Revolution',
          description: 'Passage on mechanization and steam power',
          type: ExerciseType.READING,
          passage:
            'The Industrial Revolution was the transition to new manufacturing processes in Great Britain, continental Europe, and the United States, that occurred during the period from around 1760 to about 1820–1840...',
          passScore: 70,
          questions: [
            {
              questionId: 'q-mcq-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Where did the Industrial Revolution originate?',
              options: [
                { key: 'A', text: 'Great Britain' },
                { key: 'B', text: 'France' },
                { key: 'C', text: 'Germany' },
              ],
              answerSpecification: { correctKey: 'A' },
              points: 1,
              explanation: 'Text specifies Great Britain as the primary origin.',
            },
            {
              questionId: 'q-tfng-2',
              type: QuestionType.TRUE_FALSE_NOT_GIVEN,
              prompt: 'The transition was completed before 1800.',
              answerSpecification: { correctKey: 'FALSE' },
              points: 1,
              explanation: 'Text states it occurred until about 1820-1840.',
            },
            {
              questionId: 'q-fib-3',
              type: QuestionType.FILL_BLANK,
              prompt: 'The revolution occurred during the late ___',
              points: 2,
              answerSpecification: {
                acceptedAnswers: ['18th century', 'the 18th century'],
                caseSensitive: false,
              },
              explanation: 'Text references mid-1700s to 1800s.',
            },
          ],
        })
        .expect(201);

      readingExerciseId = exRes.body.data.id;
      createdExerciseIds.push(readingExerciseId);

      await request(app.getHttpServer())
        .post(`/api/v1/exercises/${readingExerciseId}/publish`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      const asRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseAId,
          exerciseId: readingExerciseId,
          title: 'Day 5: Industrial Revolution Assignment',
          targetDate: '2026-11-28',
          allowRetake: true,
          maxAttempts: 3,
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      readingAssignmentId = asRes.body.data.id;
      createdAssignmentIds.push(readingAssignmentId);
    });

    it('submits with failing score (< 70%): does NOT unlock answers, returns isPassed = false', async () => {
      // Answer only q1 correctly (1 / 4 pts = 25% < 70%)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${readingAssignmentId}/submissions`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          answers: [
            { questionId: 'q-mcq-1', value: 'A' }, // Correct (1 pt)
            { questionId: 'q-tfng-2', value: 'TRUE' }, // Wrong (0 pt, key is FALSE)
            { questionId: 'q-fib-3', value: '19th century' }, // Wrong (0 pt)
          ],
        })
        .expect(201);

      submission1Id = res.body.data.id;
      createdSubmissionIds.push(submission1Id);

      expect(res.body.data.attemptNo).toBe(1);
      expect(res.body.data.correctCount).toBe(1);
      expect(res.body.data.totalQuestions).toBe(3);
      expect(res.body.data.scorePercent).toBe(25);
      expect(res.body.data.isPassed).toBe(false);

      // Verify ZERO LEAKAGE: answer keys and explanations are strictly absent
      expect(res.body.data.feedback[0].answerSpecification).toBeUndefined();
      expect(res.body.data.feedback[0].explanation).toBeUndefined();
      expect(res.body.data.feedback[1].answerSpecification).toBeUndefined();
      expect(res.body.data.feedback[1].explanation).toBeUndefined();

      // Check student assignment status is SUBMITTED, not PASSED
      const myAsRes = await request(app.getHttpServer())
        .get('/api/v1/assignments/mine')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      const myAs = myAsRes.body.data.items.find(
        (i: any) => i.assignmentId === readingAssignmentId,
      );
      expect(myAs.status).toBe(StudentAssignmentStatus.SUBMITTED);
      expect(myAs.bestScore).toBe(25);
    });

    it('denies student from fetching answer keys before achieving PASS (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/assignments/${readingAssignmentId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(403);
    });

    it('retakes with PASS score (100%): handles normalization (lowercase option, TFNG token, text spaces)', async () => {
      // Attempt 2:
      // q1 -> 'a' (lowercase, should match 'A')
      // q2 -> 'f' (normalized to 'FALSE')
      // q3 -> '  the  18th century  ' (extra spaces, normalized)
      // Earns 4/4 pts = 100% >= 70% -> PASS!
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${readingAssignmentId}/submissions`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          answers: [
            { questionId: 'q-mcq-1', value: 'a' },
            { questionId: 'q-tfng-2', value: 'f' },
            { questionId: 'q-fib-3', value: '  the  18th century  ' },
          ],
        })
        .expect(201);

      createdSubmissionIds.push(res.body.data.id);

      expect(res.body.data.attemptNo).toBe(2);
      expect(res.body.data.correctCount).toBe(3);
      expect(res.body.data.scorePercent).toBe(100);
      expect(res.body.data.isPassed).toBe(true);

      // Verify student assignment status updated to PASSED and bestScore = 100
      const myAsRes = await request(app.getHttpServer())
        .get('/api/v1/assignments/mine')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      const myAs = myAsRes.body.data.items.find(
        (i: any) => i.assignmentId === readingAssignmentId,
      );
      expect(myAs.status).toBe(StudentAssignmentStatus.PASSED);
      expect(myAs.bestScore).toBe(100);
    });

    it('unlocks dedicated answer keys endpoint after student has PASSED (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${readingAssignmentId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.questions).toHaveLength(3);
      expect(res.body.data.questions[0].answerSpecification.correctKey).toBe('A');
      expect(res.body.data.questions[0].explanation).toContain('Great Britain');
      expect(res.body.data.questions[1].answerSpecification.correctKey).toBe('FALSE');
      expect(res.body.data.questions[2].answerSpecification.acceptedAnswers).toContain(
        '18th century',
      );
    });

    it('lists submission history for student via /assignments/:id/submissions/mine', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${readingAssignmentId}/submissions/mine`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].attemptNo).toBe(1);
      expect(res.body.data[0].scorePercent).toBe(25);
      expect(res.body.data[1].attemptNo).toBe(2);
      expect(res.body.data[1].scorePercent).toBe(100);
    });

    it('allows teacher to view all student submissions for their course', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${readingAssignmentId}/submissions`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .expect(200);

      expect(res.body.data.total).toBe(2);
      expect(res.body.data.items[0].feedback[0].answerSpecification).toBeDefined(); // Teacher sees keys
    });

    it('denies Teacher B from viewing Course A submissions (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/assignments/${readingAssignmentId}/submissions`)
        .set('Authorization', `Bearer ${teacherBToken}`)
        .expect(403);
    });
  });

  describe('2. Retake Restrictions & Attempt Limit', () => {
    let strictAssignmentId: string;
    let exerciseId: string;

    beforeAll(async () => {
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Strict No Retake Test',
          type: ExerciseType.READING,
          passage: 'Sample short passage...',
          passScore: 70,
          questions: [
            {
              questionId: 'q-st-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'Is retake allowed?',
              options: [
                { key: 'A', text: 'No' },
                { key: 'B', text: 'Yes' },
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

      const asRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          courseId: courseAId,
          exerciseId,
          title: 'Strict Assignment',
          targetDate: '2026-11-29',
          allowRetake: false, // Strict: NO RETAKES
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      strictAssignmentId = asRes.body.data.id;
      createdAssignmentIds.push(strictAssignmentId);
    });

    it('allows attempt 1 and rejects attempt 2 when allowRetake = false (400 Bad Request)', async () => {
      // Attempt 1 succeeds
      await request(app.getHttpServer())
        .post(`/api/v1/assignments/${strictAssignmentId}/submissions`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          answers: [{ questionId: 'q-st-1', value: 'A' }],
        })
        .expect(201);

      // Attempt 2 fails
      await request(app.getHttpServer())
        .post(`/api/v1/assignments/${strictAssignmentId}/submissions`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          answers: [{ questionId: 'q-st-1', value: 'A' }],
        })
        .expect(400);
    });
  });

  describe('3. Reading Translation Workflow & Teacher Review', () => {
    let readingAssignmentId: string;
    let translationId: string;

    beforeAll(async () => {
      const exRes = await request(app.getHttpServer())
        .post('/api/v1/exercises')
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          title: 'Translation Reading Test',
          description: 'Passage for translation to Vietnamese',
          type: ExerciseType.READING,
          passage:
            'Renewable energy sources such as solar and wind power are essential for mitigating global climate change and reducing reliance on fossil fuels.',
          passScore: 70,
          questions: [
            {
              questionId: 'q-tr-1',
              type: QuestionType.MULTIPLE_CHOICE,
              prompt: 'What are examples of renewable energy?',
              options: [
                { key: 'A', text: 'Solar and wind' },
                { key: 'B', text: 'Coal and oil' },
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
          title: 'Translation Assignment',
          targetDate: '2026-11-30',
          status: AssignmentStatus.PUBLISHED,
        })
        .expect(201);

      readingAssignmentId = asRes.body.data.id;
      createdAssignmentIds.push(readingAssignmentId);
    });

    it('submits Vietnamese translation for the Reading passage', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assignments/${readingAssignmentId}/translations`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          translatedText:
            'Các nguồn năng lượng tái tạo như năng lượng mặt trời và gió đóng vai trò thiết yếu trong việc giảm thiểu biến đổi khí hậu toàn cầu và hạn chế sự phụ thuộc vào nhiên liệu hóa thạch.',
        })
        .expect(201);

      translationId = res.body.data.id;
      createdTranslationIds.push(translationId);

      expect(res.body.data.status).toBe(TranslationSubmissionStatus.SUBMITTED);
      expect(res.body.data.translatedText).toContain('năng lượng tái tạo');
      expect(res.body.data.originalPassage).toContain('Renewable energy sources');
    });

    it('student views their translation submission and original passage via /translations/mine', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${readingAssignmentId}/translations/mine`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.id).toBe(translationId);
      expect(res.body.data.status).toBe(TranslationSubmissionStatus.SUBMITTED);
      expect(res.body.data.originalPassage).toBeDefined();
    });

    it('denies student from reviewing their own translation (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/translations/${translationId}/review`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ teacherComment: 'Tự khen bản thân' })
        .expect(403);
    });

    it('teacher reviews and leaves comments on student translation', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/translations/${translationId}/review`)
        .set('Authorization', `Bearer ${teacherAToken}`)
        .send({
          teacherComment: 'Bản dịch rất chính xác, câu từ tự nhiên và chuẩn thuật ngữ học thuật.',
        })
        .expect(200);

      expect(res.body.data.status).toBe(TranslationSubmissionStatus.REVIEWED);
      expect(res.body.data.teacherComment).toContain('chuẩn thuật ngữ');
      expect(res.body.data.reviewedBy).toBe(teacherAId);
      expect(res.body.data.reviewedAt).toBeDefined();
    });

    it('student views teacher feedback on their reviewed translation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assignments/${readingAssignmentId}/translations/mine`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.status).toBe(TranslationSubmissionStatus.REVIEWED);
      expect(res.body.data.teacherComment).toBe(
        'Bản dịch rất chính xác, câu từ tự nhiên và chuẩn thuật ngữ học thuật.',
      );
    });
  });
});

