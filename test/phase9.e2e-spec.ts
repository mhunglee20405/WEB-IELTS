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
  ExamMode,
  ExamPreset,
  ExamQuestionType,
  ExamSkill,
  PartType,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('Phase 9: IELTS Exam Modes, Question Bank & Reading Translation (e2e)', () => {
  jest.setTimeout(45000);

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

  let readingTestId: string;
  let listeningTestId: string;
  let passage1Id: string;
  let passage2Id: string;
  let section1Id: string;

  let courseId: string;
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
    connection = moduleFixture.get<Connection>(getConnectionToken());

    // Login as Admin
    const adminAuth = await loginAs('admin@ielts-lms.local', 'Admin@123456');
    adminToken = adminAuth.accessToken;

    // Create Teacher 1
    teacher1Id = await createUser(adminToken, {
      fullName: `Teacher 1 P9 ${runSuffix}`,
      email: `teacher1.p9.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    const t1Auth = await loginAs(`teacher1.p9.${runSuffix}@ielts-lms.local`, 'Password@123');
    teacher1Token = t1Auth.accessToken;

    // Create Teacher 2
    teacher2Id = await createUser(adminToken, {
      fullName: `Teacher 2 P9 ${runSuffix}`,
      email: `teacher2.p9.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.TEACHER,
    });
    const t2Auth = await loginAs(`teacher2.p9.${runSuffix}@ielts-lms.local`, 'Password@123');
    teacher2Token = t2Auth.accessToken;

    // Create Student 1
    student1Id = await createUser(adminToken, {
      fullName: `Student 1 P9 ${runSuffix}`,
      email: `student1.p9.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });
    const s1Auth = await loginAs(`student1.p9.${runSuffix}@ielts-lms.local`, 'Password@123');
    student1Token = s1Auth.accessToken;

    // Create Student 2
    student2Id = await createUser(adminToken, {
      fullName: `Student 2 P9 ${runSuffix}`,
      email: `student2.p9.${runSuffix}@ielts-lms.local`,
      password: 'Password@123',
      role: UserRole.STUDENT,
    });
    const s2Auth = await loginAs(`student2.p9.${runSuffix}@ielts-lms.local`, 'Password@123');
    student2Token = s2Auth.accessToken;

    // Create Course with Teacher 1
    const courseRes = await request(app.getHttpServer())
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `P9-CRS-${runSuffix}`,
        title: 'IELTS Intensive Practice Course',
        type: CourseType.GROUP,
        teacherId: teacher1Id,
        startBand: 5.5,
        targetBand: 7.0,
      })
      .expect(201);
    courseId = courseRes.body.data._id || courseRes.body.data.id;

    // Enroll Student 1
    await request(app.getHttpServer())
      .post(`/api/v1/courses/${courseId}/students`)
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({ studentId: student1Id })
      .expect(201);
  });

  afterAll(async () => {
    if (connection) {
      await connection.collection('exam_tests').deleteMany({ title: new RegExp(`.*${runSuffix}.*`) });
      await connection.collection('exam_attempts').deleteMany({ studentId: new Types.ObjectId(student1Id) });
      await connection.collection('translation_submissions').deleteMany({ studentId: new Types.ObjectId(student1Id) });
      await connection.collection('users').deleteMany({ email: new RegExp(`.*\\.p9\\.${runSuffix}@.*`) });
      await connection.collection('courses').deleteMany({ code: `P9-CRS-${runSuffix}` });
    }
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // Section 1: Teacher Question Bank Operations
  // ==========================================
  describe('Teacher Question Bank & Test Authoring', () => {
    it('AC-01: Teacher creates a draft Reading test with 2 passages and question groups', async () => {
      // 1. Create Test
      const testRes = await request(app.getHttpServer())
        .post('/api/v1/teacher/exam-tests')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          title: `IELTS Reading Test ${runSuffix}`,
          skill: ExamSkill.READING,
          allowedModes: [ExamMode.PART, ExamMode.FULL],
          passScore: 70,
          fullDurationSeconds: 3600,
          translationEnabled: true,
          examPreset: ExamPreset.IELTS_ACADEMIC,
          description: 'Reading Practice Test with 2 Passages',
        })
        .expect(201);

      readingTestId = testRes.body.data._id || testRes.body.data.id;
      expect(readingTestId).toBeDefined();

      // 2. Add Passage 1
      const p1Res = await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${readingTestId}/parts`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          type: PartType.PASSAGE,
          ordinal: 1,
          title: 'Passage 1: The Secret Life of Bees',
          contentHtml: '<p>Bees are winged insects closely related to wasps and ants...</p>',
          durationSeconds: 1200,
        })
        .expect(201);

      passage1Id = p1Res.body.data.parts[0].id;
      expect(passage1Id).toBeDefined();

      // 3. Add Question Group to Passage 1 (Questions 1–10 for clear 70% threshold boundary testing)
      const qGroup1 = {
        title: 'Questions 1–10',
        instruction: 'Do the following statements agree with the information in Reading Passage 1? Write TRUE, FALSE or NOT GIVEN.',
        type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
        order: 1,
        questions: [
          { number: 1, prompt: 'Bees can fly long distances.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'] } },
          { number: 2, prompt: 'Ants are nocturnal insects.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['FALSE'] } },
          { number: 3, prompt: 'Wasps have four wings.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['NOT GIVEN'] } },
          { number: 4, prompt: 'Worker bees are female.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'] } },
          { number: 5, prompt: 'Honey never spoils.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'] } },
          { number: 6, prompt: 'Queen bees leave the hive daily.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['FALSE'] } },
          { number: 7, prompt: 'Bees communicate via dance.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'] } },
          { number: 8, prompt: 'Bees survive winter by freezing.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['FALSE'] } },
          { number: 9, prompt: 'Drones produce honey.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['FALSE'] } },
          { number: 10, prompt: 'Pollen provides protein.', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'] } },
        ],
      };

      await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${readingTestId}/parts/${passage1Id}/question-groups`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send(qGroup1)
        .expect(201);

      // 4. Add Passage 2
      const p2Res = await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${readingTestId}/parts`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          type: PartType.PASSAGE,
          ordinal: 2,
          title: 'Passage 2: The History of Glassmaking',
          contentHtml: '<p>The history of glassmaking can be traced back to 3500 BCE in Mesopotamia...</p>',
          durationSeconds: 1200,
        })
        .expect(201);

      passage2Id = p2Res.body.data.parts[1].id;
      expect(passage2Id).toBeDefined();

      // 5. Add Question Group to Passage 2 (Questions 11–20)
      const qGroup2 = {
        title: 'Questions 11–20',
        instruction: 'Choose the correct letter A, B, C or D.',
        type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE,
        order: 1,
        questions: [
          { number: 11, prompt: 'Glassmaking began in:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['A'] } },
          { number: 12, prompt: 'The primary ingredient in glass is:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['B'] } },
          { number: 13, prompt: 'Roman glass was famous for:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['C'] } },
          { number: 14, prompt: 'Stained glass was popularized during:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['D'] } },
          { number: 15, prompt: 'The float glass process was invented by:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['A'] } },
          { number: 16, prompt: 'Lead crystal glass was developed in:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['B'] } },
          { number: 17, prompt: 'Glass bottles were initially made by:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['C'] } },
          { number: 18, prompt: 'Venetian glassmakers were located on:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['A'] } },
          { number: 19, prompt: 'Optical glass is used for:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['D'] } },
          { number: 20, prompt: 'Recycling glass requires:', type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE, points: 1, grading: { acceptedKeys: ['B'] } },
        ],
      };

      await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${readingTestId}/parts/${passage2Id}/question-groups`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send(qGroup2)
        .expect(201);
    });

    it('AC-15: Prevents Teacher 2 from modifying Teacher 1 exam test (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/teacher/exam-tests/${readingTestId}`)
        .set('Authorization', `Bearer ${teacher2Token}`)
        .send({ title: 'Hacked by Teacher 2' })
        .expect(403);
    });

    it('Validates test completeness and publishes immutable version (AC-01)', async () => {
      // Validate endpoint
      const valRes = await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${readingTestId}/validate`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .expect(200);

      expect(valRes.body.data.isValid).toBe(true);
      expect(valRes.body.data.totalQuestions).toBe(20);

      // Publish test
      const pubRes = await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${readingTestId}/publish`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .expect(200);

      expect(pubRes.body.data.status).toBe('PUBLISHED');
      expect(pubRes.body.data.version).toBe(1);
    });

    it('AC-12: Teacher can create new DRAFT version from published test', async () => {
      const v2Res = await request(app.getHttpServer())
        .post(`/api/v1/teacher/exam-tests/${readingTestId}/new-version`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .expect(201);

      expect(v2Res.body.data.version).toBe(2);
      expect(v2Res.body.data.status).toBe('DRAFT');
    });

    it('AC-02: Media audio upload-intent and playback endpoints', async () => {
      // 1. Teacher creates audio upload intent
      const upRes = await request(app.getHttpServer())
        .post('/api/v1/media/audio/upload-intent')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          filename: 'listening_section_1.mp3',
          mimeType: 'audio/mpeg',
          fileSize: 5000000,
        })
        .expect(201);

      expect(upRes.body.data).toHaveProperty('uploadUrl');
      const assetId = upRes.body.data.assetId;

      // 2. Student retrieves signed playback URL
      const playRes = await request(app.getHttpServer())
        .get(`/api/v1/media/audio/${assetId}/playback`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(playRes.body.data).toHaveProperty('streamUrl');
      expect(playRes.body.data.mimeType).toBe('audio/mpeg');
    });
  });

  // ==========================================
  // Section 2: Student Catalog & Zero Leakage
  // ==========================================
  describe('Student Catalog & Zero Leakage Guarantee', () => {
    it('Student can list published tests without seeing draft tests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/exam-tests?skill=READING')
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThan(0);
      const test = res.body.data.items.find((item: any) => item.id === readingTestId);
      expect(test).toBeDefined();
      expect(test.totalQuestions).toBe(20);
      expect(test.parts).toHaveLength(2);
    });

    it('AC-13: Student part endpoint NEVER leaks answer keys or grading specifications', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exam-tests/${readingTestId}/parts/${passage1Id}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      const part = res.body.data;
      expect(part.title).toBe('Passage 1: The Secret Life of Bees');
      expect(part.questionGroups).toHaveLength(1);

      const group = part.questionGroups[0];
      expect(group.questions).toHaveLength(10);

      for (const q of group.questions) {
        expect(q.grading).toBeUndefined();
        expect(q.acceptedKeys).toBeUndefined();
        expect(q.correctAnswer).toBeUndefined();
        expect(q.explanation).toBeUndefined();
      }
    });
  });

  // ==========================================
  // Section 3: Reading PART Exam Mode
  // ==========================================
  describe('Reading PART Exam Mode & 70% Scoring Boundary', () => {
    let attemptPart1Id: string;

    it('AC-03: Student starts PART attempt for Passage 1', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          testId: readingTestId,
          mode: ExamMode.PART,
          partId: passage1Id,
          idempotencyKey: `part1-${runSuffix}-1`,
        })
        .expect(201);

      attemptPart1Id = res.body.data.id;
      expect(attemptPart1Id).toBeDefined();
      expect(res.body.data.mode).toBe('PART');
      expect(res.body.data.partId).toBe(passage1Id);
      expect(res.body.data.scopeQuestionIds).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
      expect(res.body.data.remainingSeconds).toBeGreaterThan(0);
    });

    it('AC-14: Autosave answers with revision handling and idempotency', async () => {
      // 1. Autosave at revision 0
      const saveRes1 = await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptPart1Id}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          baseRevision: 0,
          answers: [
            { questionId: '1', value: 'TRUE' },
            { questionId: '2', value: 'FALSE' },
          ],
        })
        .expect(200);

      expect(saveRes1.body.data.answersRevision).toBe(1);

      // 2. Reject stale baseRevision (Revision Conflict 409)
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptPart1Id}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          baseRevision: 0, // stale revision
          answers: [{ questionId: '3', value: 'NOT GIVEN' }],
        })
        .expect(409);

      // 3. Save with updated revision 1
      const saveRes2 = await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attemptPart1Id}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          baseRevision: 1,
          answers: [
            { questionId: '3', value: 'NOT GIVEN' },
            { questionId: '4', value: 'TRUE' },
            { questionId: '5', value: 'TRUE' },
            { questionId: '6', value: 'WRONG_ANSWER' }, // wrong (correct: FALSE)
            { questionId: '7', value: 'WRONG_ANSWER' }, // wrong (correct: TRUE)
            { questionId: '8', value: 'WRONG_ANSWER' }, // wrong (correct: FALSE)
            { questionId: '9', value: 'WRONG_ANSWER' }, // wrong (correct: FALSE)
            { questionId: '10', value: 'WRONG_ANSWER' }, // wrong (correct: TRUE)
          ],
        })
        .expect(200);

      expect(saveRes2.body.data.answersRevision).toBe(2);
    });

    it('AC-08: Submits 5 correct out of 10 (50% < 70%): FAILED, translation stays locked', async () => {
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attemptPart1Id}/submit`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ idempotencyKey: `submit-part1-${runSuffix}` })
        .expect(200);

      const result = subRes.body.data;
      expect(result.correctCount).toBe(5);
      expect(result.totalPoints).toBe(10);
      expect(result.scorePercent).toBe(50);
      expect(result.passed).toBe(false);
      expect(result.answerReviewAvailable).toBe(false);
      expect(result.translation.available).toBe(false);
      expect(result.translation.unlockedPassageIds).toHaveLength(0);

      // AC-13: Answer review must be blocked with 403 ANSWER_REVIEW_LOCKED
      await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${attemptPart1Id}/review`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(403);
    });

    it('Student starts second PART attempt for Passage 1 and achieves exactly 70% (7/10): PASSED', async () => {
      // 1. Create second attempt
      const attRes = await request(app.getHttpServer())
        .post('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          testId: readingTestId,
          mode: ExamMode.PART,
          partId: passage1Id,
          idempotencyKey: `part1-${runSuffix}-2`,
        })
        .expect(201);

      const attempt2Id = attRes.body.data.id;

      // 2. Save 7 correct answers and 3 wrong answers (70% boundary)
      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${attempt2Id}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          baseRevision: 0,
          answers: [
            { questionId: '1', value: 'TRUE' },      // 1 correct
            { questionId: '2', value: 'FALSE' },     // 2 correct
            { questionId: '3', value: 'NOT GIVEN' }, // 3 correct
            { questionId: '4', value: 'TRUE' },      // 4 correct
            { questionId: '5', value: 'TRUE' },      // 5 correct
            { questionId: '6', value: 'FALSE' },     // 6 correct
            { questionId: '7', value: 'TRUE' },      // 7 correct (70%)
            { questionId: '8', value: 'WRONG' },     // wrong
            { questionId: '9', value: 'WRONG' },     // wrong
            { questionId: '10', value: 'WRONG' },    // wrong
          ],
        })
        .expect(200);

      // 3. Submit
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${attempt2Id}/submit`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      const result = subRes.body.data;
      expect(result.correctCount).toBe(7);
      expect(result.scorePercent).toBe(70);
      expect(result.passed).toBe(true);
      expect(result.answerReviewAvailable).toBe(true);

      // AC-07: Passage 1 is unlocked for translation!
      expect(result.translation.available).toBe(true);
      expect(result.translation.unlockedPassageIds).toEqual([passage1Id]);

      // Answer review is now unlocked
      const revRes = await request(app.getHttpServer())
        .get(`/api/v1/exam-attempts/${attempt2Id}/review`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(revRes.body.data.questions).toHaveLength(10);
      expect(revRes.body.data.questions[0]).toHaveProperty('correctAnswer');
    });
  });

  // ==========================================
  // Section 4: Reading Translation Unlock Workflow
  // ==========================================
  describe('Reading Translation Unlock & Review Workflow', () => {
    it('AC-07: Translation eligibility shows Passage 1 UNLOCKED, Passage 2 LOCKED', async () => {
      const eligRes = await request(app.getHttpServer())
        .get(`/api/v1/reading-translations/eligibility?testId=${readingTestId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      const data = eligRes.body.data;
      expect(data.translationEnabled).toBe(true);
      expect(data.passages).toHaveLength(2);

      const p1 = data.passages.find((p: any) => p.passageId === passage1Id);
      const p2 = data.passages.find((p: any) => p.passageId === passage2Id);

      expect(p1.unlocked).toBe(true);
      expect(p1.status).toBe('DRAFT');

      expect(p2.unlocked).toBe(false);
      expect(p2.status).toBe('LOCKED');
    });

    it('Student CANNOT save draft for locked Passage 2 (403 TRANSLATION_LOCKED)', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/reading-translations/${passage2Id}/draft`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          testId: readingTestId,
          textVi: 'Cố ý hack dịch Passage 2 khi chưa thi pass',
        })
        .expect(403);
    });

    it('Student 2 CANNOT access Student 1 unlocked passage without their own passed attempt', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/reading-translations/${passage1Id}/draft`)
        .set('Authorization', `Bearer ${student2Token}`)
        .send({
          testId: readingTestId,
          textVi: 'Student 2 trying to translate Student 1 unlocked passage',
        })
        .expect(403);
    });

    it('Student 1 saves translation draft and submits for Passage 1', async () => {
      // 1. Save draft
      const draftRes = await request(app.getHttpServer())
        .put(`/api/v1/reading-translations/${passage1Id}/draft`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          testId: readingTestId,
          textVi: 'Ong là loài côn trùng có cánh có quan hệ họ hàng gần gũi với ong bắp cày và kiến...',
        })
        .expect(200);

      expect(draftRes.body.data.status).toBe('DRAFT');

      // 2. Submit translation
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/reading-translations/${passage1Id}/submit`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          testId: readingTestId,
        })
        .expect(200);

      expect(subRes.body.data.status).toBe('SUBMITTED');
    });

    it('Teacher 1 reviews translation and leaves feedback (REVIEWED)', async () => {
      // 1. Teacher lists submitted translations
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/teacher/reading-translations?status=SUBMITTED')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .expect(200);

      expect(listRes.body.data.items.length).toBeGreaterThan(0);
      const targetTrans = listRes.body.data.items.find(
        (item: any) => item.studentId === student1Id && item.passageId === passage1Id,
      );
      expect(targetTrans).toBeDefined();

      // 2. Teacher reviews
      const revRes = await request(app.getHttpServer())
        .post(`/api/v1/teacher/reading-translations/${targetTrans.id}/review`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          teacherComment: 'Bản dịch chính xác thuật ngữ chuyên ngành sinh học, hành văn mượt mà.',
        })
        .expect(201);

      expect(revRes.body.data.status).toBe('REVIEWED');
      expect(revRes.body.data.teacherComment).toContain('Bản dịch chính xác thuật ngữ');
    });
  });

  // ==========================================
  // Section 5: Reading FULL Mode & Assignment
  // ==========================================
  describe('Reading FULL Mode & Course Assignment Integration', () => {
    it('AC-04 & AC-09: Student takes FULL exam and passes with 80% (16/20): unlocks ALL passages', async () => {
      // 1. Start FULL attempt (partId must be null)
      const startRes = await request(app.getHttpServer())
        .post('/api/v1/exam-attempts')
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          testId: readingTestId,
          mode: ExamMode.FULL,
          idempotencyKey: `full-${runSuffix}-1`,
        })
        .expect(201);

      const fullAttemptId = startRes.body.data.id;
      expect(startRes.body.data.mode).toBe('FULL');
      expect(startRes.body.data.partId).toBeNull();
      expect(startRes.body.data.scopeQuestionIds).toHaveLength(20);

      // 2. Save 16 correct answers and 4 wrong answers (80% score)
      const fullAnswers: any[] = [
        { questionId: '1', value: 'TRUE' },
        { questionId: '2', value: 'FALSE' },
        { questionId: '3', value: 'NOT GIVEN' },
        { questionId: '4', value: 'TRUE' },
        { questionId: '5', value: 'TRUE' },
        { questionId: '6', value: 'FALSE' },
        { questionId: '7', value: 'TRUE' },
        { questionId: '8', value: 'FALSE' },
        { questionId: '9', value: 'WRONG' },
        { questionId: '10', value: 'WRONG' },
      ];

      // Q11-Q20 (Passage 2)
      fullAnswers.push({ questionId: '11', value: 'A' });
      fullAnswers.push({ questionId: '12', value: 'B' });
      fullAnswers.push({ questionId: '13', value: 'C' });
      fullAnswers.push({ questionId: '14', value: 'D' });
      fullAnswers.push({ questionId: '15', value: 'A' });
      fullAnswers.push({ questionId: '16', value: 'B' });
      fullAnswers.push({ questionId: '17', value: 'C' });
      fullAnswers.push({ questionId: '18', value: 'A' });
      fullAnswers.push({ questionId: '19', value: 'WRONG' });
      fullAnswers.push({ questionId: '20', value: 'WRONG' });

      await request(app.getHttpServer())
        .put(`/api/v1/exam-attempts/${fullAttemptId}/answers`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({
          baseRevision: 0,
          answers: fullAnswers,
        })
        .expect(200);

      // 3. Submit FULL attempt
      const subRes = await request(app.getHttpServer())
        .post(`/api/v1/exam-attempts/${fullAttemptId}/submit`)
        .set('Authorization', `Bearer ${student1Token}`)
        .send({ idempotencyKey: `submit-full-${runSuffix}` })
        .expect(200);

      const result = subRes.body.data;
      expect(result.correctCount).toBe(16);
      expect(result.totalPoints).toBe(20);
      expect(result.scorePercent).toBe(80);
      expect(result.passed).toBe(true);

      // AC-09: Unlocks ALL passages!
      expect(result.translation.unlockedPassageIds).toContain(passage1Id);
      expect(result.translation.unlockedPassageIds).toContain(passage2Id);

      // Check eligibility endpoint now shows BOTH passages unlocked
      const eligRes = await request(app.getHttpServer())
        .get(`/api/v1/reading-translations/eligibility?testId=${readingTestId}`)
        .set('Authorization', `Bearer ${student1Token}`)
        .expect(200);

      expect(eligRes.body.data.passages[0].unlocked).toBe(true);
      expect(eligRes.body.data.passages[1].unlocked).toBe(true);
    });

    it('Teacher assigns test with requiredScope PART to course', async () => {
      const assignRes = await request(app.getHttpServer())
        .post('/api/v1/assignments')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          courseId,
          exerciseId: readingTestId,
          title: `Homework: Passage 1 Review ${runSuffix}`,
          requiredScope: 'PART',
          requiredPartId: passage1Id,
          allowedModes: ['PART'],
          durationSecondsOverride: 1800,
          openAt: new Date(Date.now() - 3600000).toISOString(),
          deadlineAt: new Date(Date.now() + 86400000).toISOString(),
          allowRetake: true,
          maxAttempts: 3,
        })
        .expect(201);

      assignmentId = assignRes.body.data._id || assignRes.body.data.id;
      expect(assignmentId).toBeDefined();
      expect(assignRes.body.data.requiredScope).toBe('PART');
      expect(assignRes.body.data.requiredPartId).toBe(passage1Id);
    });
  });
});
