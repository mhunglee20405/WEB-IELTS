import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import * as request from 'supertest';
import { Types } from 'mongoose';
import { CoursesController } from 'src/modules/courses/courses.controller';
import { CoursesService } from 'src/modules/courses/courses.service';
import { EnrollmentsService } from 'src/modules/enrollments/enrollments.service';
import { LessonsController } from 'src/modules/lessons/lessons.controller';
import { LessonsService } from 'src/modules/lessons/lessons.service';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { GlobalExceptionFilter } from 'src/common/filters/global-exception.filter';
import { TransformInterceptor } from 'src/common/interceptors/transform.interceptor';
import { CourseType, LessonStatus, UserRole, UserStatus } from 'src/database/schemas/enums';

describe('Phase 3 HTTP Integration (Courses, Enrollments, Lessons)', () => {
  let app: INestApplication;

  const adminId = new Types.ObjectId();
  const teacherAId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const lessonId = new Types.ObjectId();

  const usersByRole: Record<string, any> = {
    admin: { _id: adminId, role: UserRole.ADMIN, status: UserStatus.ACTIVE },
    teacherA: { _id: teacherAId, role: UserRole.TEACHER, status: UserStatus.ACTIVE },
    student: { _id: studentId, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
  };

  const mockCoursesService = {
    create: jest.fn().mockResolvedValue({ _id: courseId, code: 'IELTS-101', title: 'IELTS 101' }),
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    findMine: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    findById: jest.fn().mockResolvedValue({ _id: courseId, code: 'IELTS-101' }),
    update: jest.fn().mockResolvedValue({ _id: courseId, title: 'Updated' }),
    remove: jest.fn().mockResolvedValue({ archived: true, message: 'Course archived' }),
    getStudents: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
  };

  const mockEnrollmentsService = {
    enroll: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: 'active' }),
    drop: jest.fn().mockResolvedValue({ message: 'Student removed from course' }),
  };

  const mockLessonsService = {
    create: jest.fn().mockResolvedValue({
      id: lessonId.toHexString(),
      courseId: courseId.toHexString(),
      title: 'Lesson 1',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
      status: LessonStatus.SCHEDULED,
    }),
    findByCourse: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    findMine: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    findById: jest.fn().mockResolvedValue({ id: lessonId.toHexString(), title: 'Lesson 1' }),
    update: jest.fn().mockResolvedValue({ id: lessonId.toHexString(), title: 'Updated Lesson' }),
    cancel: jest.fn().mockResolvedValue({ id: lessonId.toHexString(), status: LessonStatus.CANCELLED }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CoursesController, LessonsController],
      providers: [
        RolesGuard,
        { provide: CoursesService, useValue: mockCoursesService },
        { provide: EnrollmentsService, useValue: mockEnrollmentsService },
        { provide: LessonsService, useValue: mockLessonsService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          const roleHeader = req.headers['x-test-user'] as string | undefined;
          if (!roleHeader || !usersByRole[roleHeader]) {
            throw new UnauthorizedException();
          }
          req.user = usersByRole[roleHeader];
          return true;
        },
      })
      .compile();

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Courses RBAC & DTO validation', () => {
    it('returns 401 when unauthenticated', () => {
      return request(app.getHttpServer())
        .get('/api/v1/courses/mine')
        .expect(401);
    });

    it('returns 403 when Student tries to create a course', () => {
      return request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('x-test-user', 'student')
        .send({
          code: 'IELTS-101',
          title: 'Test Course',
          startBand: 5.0,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId.toHexString(),
        })
        .expect(403);
    });

    it('returns 400 for invalid IELTS band increment (5.3)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('x-test-user', 'admin')
        .send({
          code: 'IELTS-101',
          title: 'Test Course',
          startBand: 5.3,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId.toHexString(),
        })
        .expect(400);
    });

    it('returns 400 when unexpected fields are sent (forbidNonWhitelisted)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('x-test-user', 'admin')
        .send({
          code: 'IELTS-101',
          title: 'Test Course',
          startBand: 5.0,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId.toHexString(),
          hackedField: true,
        })
        .expect(400);
    });

    it('returns 201 when Admin creates valid course', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/courses')
        .set('x-test-user', 'admin')
        .send({
          code: 'IELTS-101',
          title: 'Test Course',
          startBand: 5.0,
          targetBand: 6.5,
          type: CourseType.GROUP,
          teacherId: teacherAId.toHexString(),
        })
        .expect(201);
      expect(res.body.data.code).toBe('IELTS-101');
    });

    it('routes GET /courses/mine to findMine for Student', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/courses/mine')
        .set('x-test-user', 'student')
        .expect(200);
      expect(mockCoursesService.findMine).toHaveBeenCalled();
    });
  });

  describe('Enrollments endpoints', () => {
    it('returns 403 when Student tries to enroll someone', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId.toHexString()}/students`)
        .set('x-test-user', 'student')
        .send({ studentId: studentId.toHexString() })
        .expect(403);
    });

    it('returns 201 when Teacher enrolls student', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId.toHexString()}/students`)
        .set('x-test-user', 'teacherA')
        .send({ studentId: studentId.toHexString() })
        .expect(201);
    });

    it('returns 200 when Teacher drops student via DELETE', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/courses/${courseId.toHexString()}/students/${studentId.toHexString()}`)
        .set('x-test-user', 'teacherA')
        .expect(200);
    });
  });

  describe('Lessons & Google Meet URL validation', () => {
    it('returns 400 for non-HTTPS meetUrl', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId.toHexString()}/lessons`)
        .set('x-test-user', 'teacherA')
        .send({
          title: 'Lesson 1',
          startAt: '2026-11-15T12:00:00.000Z',
          endAt: '2026-11-15T13:30:00.000Z',
          meetUrl: 'http://insecure.example.com/meet',
        })
        .expect(400);
    });

    it('returns 201 for valid HTTPS Google Meet URL', () => {
      return request(app.getHttpServer())
        .post(`/api/v1/courses/${courseId.toHexString()}/lessons`)
        .set('x-test-user', 'teacherA')
        .send({
          title: 'Lesson 1',
          startAt: '2026-11-15T12:00:00.000Z',
          endAt: '2026-11-15T13:30:00.000Z',
          meetUrl: 'https://meet.google.com/abc-defg-hij',
          content: 'Reading practice',
        })
        .expect(201);
    });

    it('returns 403 when Student accesses lessons of an unenrolled course', () => {
      mockLessonsService.findByCourse.mockRejectedValueOnce(
        new ForbiddenException('You are not enrolled in this course'),
      );
      return request(app.getHttpServer())
        .get(`/api/v1/courses/${courseId.toHexString()}/lessons`)
        .set('x-test-user', 'student')
        .expect(403);
    });

    it('returns 200 for GET /lessons/mine with date filters', () => {
      return request(app.getHttpServer())
        .get('/api/v1/lessons/mine?from=2026-11-01T00:00:00.000Z&to=2026-11-30T23:59:59.999Z')
        .set('x-test-user', 'student')
        .expect(200);
    });

    it('returns 200 when Teacher cancels lesson via DELETE /lessons/:id', () => {
      return request(app.getHttpServer())
        .delete(`/api/v1/lessons/${lessonId.toHexString()}`)
        .set('x-test-user', 'teacherA')
        .expect(200);
    });
  });
});

