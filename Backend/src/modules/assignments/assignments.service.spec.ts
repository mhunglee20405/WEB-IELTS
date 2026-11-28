import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  AssignmentsService,
  computeStudentAssignmentLifecycleStatus,
} from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { Exercise } from 'src/database/schemas/exercise.schema';
import { ExamTest } from 'src/database/schemas/exam-test.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { Submission } from 'src/database/schemas/submission.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  AssignmentStatus,
  CourseStatus,
  EnrollmentStatus,
  ExamSkill,
  ExamTestStatus,
  ExerciseStatus,
  ExerciseType,
  QuestionType,
  StudentAssignmentStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';
import {
  createVnDailyAssignmentBounds,
  formatVnDateTime,
} from 'src/common/utils/timezone.util';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let assignmentModel: any;
  let courseModel: any;
  let exerciseModel: any;
  let enrollmentModel: any;
  let studentAssignmentModel: any;

  const adminId = new Types.ObjectId();
  const teacherAId = new Types.ObjectId();
  const teacherBId = new Types.ObjectId();
  const student1Id = new Types.ObjectId();
  const student2Id = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const exerciseId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();

  const adminActor = {
    _id: adminId,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacherAActor = {
    _id: teacherAId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacherBActor = {
    _id: teacherBId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const student1Actor = {
    _id: student1Id,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const sampleCourse = {
    _id: courseId,
    code: 'IELTS-RD',
    title: 'Reading Masterclass',
    teacherId: teacherAId,
    status: CourseStatus.ACTIVE,
  };

  const sampleExercise = {
    _id: exerciseId,
    title: 'Climate Change Passage',
    type: ExerciseType.READING,
    passage: 'Passage content here...',
    questions: [
      {
        questionId: 'q-1',
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: 'Main cause?',
        options: [
          { key: 'A', text: 'Emissions' },
          { key: 'B', text: 'Solar' },
        ],
        answerSpecification: { correctKey: 'A' },
        points: 1,
        explanation: 'Paragraph 1 line 3',
      },
    ],
    passScore: 70,
    version: 1,
    status: ExerciseStatus.PUBLISHED,
  };

  beforeEach(async () => {
    function MockAssignmentInstance(dto: any) {
      Object.assign(this, dto);
      this._id = assignmentId;
      this.status = dto.status || AssignmentStatus.PUBLISHED;
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    assignmentModel = MockAssignmentInstance;
    assignmentModel.find = jest.fn();
    assignmentModel.findById = jest.fn();
    assignmentModel.findOne = jest.fn().mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    });
    assignmentModel.countDocuments = jest.fn();

    courseModel = {
      findById: jest.fn(),
      find: jest.fn(),
    };

    exerciseModel = {
      findById: jest.fn(),
    };

    enrollmentModel = {
      find: jest.fn(),
    };

    studentAssignmentModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      insertMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      countDocuments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(Exercise.name), useValue: exerciseModel },
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
      ],
    }).compile();

    service = module.get<AssignmentsService>(AssignmentsService);
  });

  describe('create', () => {
    it('throws ForbiddenException if actor is a student', async () => {
      await expect(
        service.create(
          {
            courseId: courseId.toHexString(),
            exerciseId: exerciseId.toHexString(),
          },
          student1Actor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if course does not exist', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.create(
          {
            courseId: courseId.toHexString(),
            exerciseId: exerciseId.toHexString(),
          },
          teacherAActor,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if course is ARCHIVED', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...sampleCourse,
          status: CourseStatus.ARCHIVED,
        }),
      });

      await expect(
        service.create(
          {
            courseId: courseId.toHexString(),
            exerciseId: exerciseId.toHexString(),
          },
          teacherAActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if teacher does not teach the course', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleCourse),
      });

      await expect(
        service.create(
          {
            courseId: courseId.toHexString(),
            exerciseId: exerciseId.toHexString(),
          },
          teacherBActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if exercise is still DRAFT (not published)', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleCourse),
      });
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...sampleExercise,
            status: ExerciseStatus.DRAFT,
          }),
        }),
      });

      await expect(
        service.create(
          {
            courseId: courseId.toHexString(),
            exerciseId: exerciseId.toHexString(),
          },
          teacherAActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates published assignment and dispatches student_assignments for enrolled students', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleCourse),
      });
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(sampleExercise),
        }),
      });
      enrollmentModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { studentId: student1Id, status: EnrollmentStatus.ACTIVE },
          { studentId: student2Id, status: EnrollmentStatus.ACTIVE },
        ]),
      });

      const res = await service.create(
        {
          courseId: courseId.toHexString(),
          exerciseId: exerciseId.toHexString(),
          targetDate: '2026-11-20',
          status: AssignmentStatus.PUBLISHED,
        },
        teacherAActor,
      );

      expect(res).toBeDefined();
      expect(res.id).toBe(assignmentId.toHexString());
      expect(res.title).toBe('Climate Change Passage');
      expect(res.openAtVn).toContain('2026-11-20T06:00:00+07:00');
      expect(res.deadlineAtVn).toContain('2026-11-21T06:00:00+07:00');

      // Verify student_assignments were dispatched
      expect(studentAssignmentModel.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ studentId: student1Id }),
          expect.objectContaining({ studentId: student2Id }),
        ]),
        { ordered: false },
      );
    });

    it('creates daily assignment with assignedDate computing 06:00 VN bounds', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleCourse),
      });
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(sampleExercise),
      });
      enrollmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          { studentId: student1Id, status: EnrollmentStatus.ACTIVE },
        ]),
      });

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const futureAssignedDate = formatVnDateTime(futureDate).slice(0, 10);
      const expectedBounds = createVnDailyAssignmentBounds(futureAssignedDate);
      const expectedOpenVn = formatVnDateTime(expectedBounds.availableAt);
      const expectedDueVn = formatVnDateTime(expectedBounds.dueAt);

      const res = await service.create(
        {
          courseId: courseId.toHexString(),
          exerciseId: exerciseId.toHexString(),
          assignedDate: futureAssignedDate,
        },
        teacherAActor,
      );

      expect(res).toBeDefined();
      expect(res.assignedDate).toBe(futureAssignedDate);
      expect(res.openAtVn).toBe(expectedOpenVn);
      expect(res.deadlineAtVn).toBe(expectedDueVn);
      expect(res.scheduleStatus).toBe('SCHEDULED');
    });

    it('creates assignment using examTestId alias, accepting dueAt and timezone', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleCourse),
      });
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(sampleExercise),
      });
      enrollmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });

      const res = await service.create(
        {
          courseId: courseId.toHexString(),
          examTestId: exerciseId.toHexString(),
          assignedDate: '2026-11-20',
          dueAt: '2026-11-21T06:00:00.000Z',
          timezone: 'Asia/Ho_Chi_Minh',
        },
        teacherAActor,
      );

      expect(res).toBeDefined();
      expect(res.assignedDate).toBe('2026-11-20');
    });
  });

  describe('findById & Answer Protection', () => {
    const mockAssignmentDoc: any = {
      _id: assignmentId,
      courseId: sampleCourse,
      exerciseId: {
        _id: exerciseId,
        title: sampleExercise.title,
        type: sampleExercise.type,
      },
      exerciseVersion: 1,
      exerciseSnapshot: {
        title: sampleExercise.title,
        type: sampleExercise.type,
        passage: sampleExercise.passage,
        questions: sampleExercise.questions,
        passScore: 70,
        version: 1,
      },
      title: 'Climate Change Assignment',
      openAt: new Date(Date.now() - 3600000),
      deadlineAt: new Date(Date.now() + 86400000),
      status: AssignmentStatus.PUBLISHED,
      toObject: function () {
        return { ...this };
      },
    };

    it('returns assignment with full snapshot (including answers) for course teacher', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockAssignmentDoc),
            }),
          }),
        }),
      });

      const res: any = await service.findById(assignmentId.toHexString(), teacherAActor);
      expect(res.exerciseSnapshot).toBeDefined();
      expect(res.exerciseSnapshot.questions[0].answerSpecification.correctKey).toBe('A');
    });

    it('throws ForbiddenException if teacher is not the course owner', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockAssignmentDoc),
            }),
          }),
        }),
      });

      await expect(service.findById(assignmentId.toHexString(), teacherBActor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('strictly sanitizes exercise questions for enrolled student (NO answerSpecification or explanation)', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(mockAssignmentDoc),
            }),
          }),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          assignmentId,
          studentId: student1Id,
          status: StudentAssignmentStatus.NOT_STARTED,
          effectiveDeadlineAt: mockAssignmentDoc.deadlineAt,
          toObject: function () {
            return { ...this };
          },
        }),
      });

      const res: any = await service.findById(assignmentId.toHexString(), student1Actor);

      expect(res.title).toBe('Climate Change Assignment');
      expect(res.myStatus).toBe(StudentAssignmentStatus.NOT_STARTED);
      expect(res.exercise).toBeDefined();
      expect(res.exercise.passage).toBe('Passage content here...');
      // CRITICAL: verify that the student response has question prompt and options, but NO answer key or explanation
      expect(res.exercise.questions[0].prompt).toBe('Main cause?');
      expect(res.exercise.questions[0].answerSpecification).toBeUndefined();
      expect(res.exercise.questions[0].explanation).toBeUndefined();
    });

    it('withholds exercise passage and questions if assignment is scheduled (now < openAt)', async () => {
      const futureAssignmentDoc = {
        ...mockAssignmentDoc,
        openAt: new Date(Date.now() + 86400000), // Opens tomorrow
        deadlineAt: new Date(Date.now() + 86400000 * 2),
        status: AssignmentStatus.SCHEDULED,
      };

      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(futureAssignmentDoc),
            }),
          }),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          assignmentId,
          studentId: student1Id,
          status: StudentAssignmentStatus.NOT_STARTED,
          effectiveDeadlineAt: futureAssignmentDoc.deadlineAt,
          toObject: function () {
            return { ...this };
          },
        }),
      });

      const res: any = await service.findById(assignmentId.toHexString(), student1Actor);
      expect(res.scheduleStatus).toBe('SCHEDULED');
      expect(res.isAvailable).toBe(false);
      // Content protection: questions & passage are NOT leaked
      expect(res.exercise.passage).toBeUndefined();
      expect(res.exercise.questions).toBeUndefined();
      expect(res.exercise.questionCount).toBe(1);
    });
  });

  describe('backfillStudents', () => {
    it('backfills active students who joined course after assignment was published', async () => {
      const mockAssignmentDoc: any = {
        _id: assignmentId,
        courseId,
        deadlineAt: new Date('2026-11-20T23:59:59.999Z'),
      };
      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAssignmentDoc),
      });
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleCourse),
      });

      // Course has 2 active students: student1 and student2
      enrollmentModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { studentId: student1Id, status: EnrollmentStatus.ACTIVE },
          { studentId: student2Id, status: EnrollmentStatus.ACTIVE },
        ]),
      });

      // Existing records only have student1
      studentAssignmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ studentId: student1Id }]),
        }),
      });

      const res = await service.backfillStudents(assignmentId.toHexString(), teacherAActor);

      expect(res.backfilledCount).toBe(1);
      expect(res.totalStudents).toBe(2);
      expect(studentAssignmentModel.insertMany).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            assignmentId,
            studentId: student2Id,
            status: StudentAssignmentStatus.NOT_STARTED,
          }),
        ],
        { ordered: false },
      );
    });
  });

  describe('AssignmentsController.findByCourse', () => {
    it('routes STUDENT actor to findMine with courseId instead of findAll (avoids 403)', async () => {
      const controller = new AssignmentsController(service);
      const findMineSpy = jest
        .spyOn(service, 'findMine')
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 } as any);
      const findAllSpy = jest.spyOn(service, 'findAll');

      const query = { page: 1, limit: 10 } as any;
      const result = await controller.findByCourse(courseId.toHexString(), student1Actor, query);

      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
      expect(findMineSpy).toHaveBeenCalledWith(
        student1Actor,
        expect.objectContaining({ courseId: courseId.toHexString(), page: 1, limit: 10 }),
      );
      expect(findAllSpy).not.toHaveBeenCalled();
    });

    it('routes TEACHER/ADMIN actor to findAll with courseId', async () => {
      const controller = new AssignmentsController(service);
      const findAllSpy = jest
        .spyOn(service, 'findAll')
        .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 } as any);

      await controller.findByCourse(courseId.toHexString(), teacherAActor, { page: 1 } as any);

      expect(findAllSpy).toHaveBeenCalledWith(
        teacherAActor,
        expect.objectContaining({ courseId: courseId.toHexString(), page: 1 }),
      );
    });
  });

  describe('ExamTest hydration, assignedDate filter, AVAILABLE backfill, retakable SUBMITTED, onModuleInit & transactions', () => {
    const examTestId = new Types.ObjectId();
    const listeningExamTest = {
      _id: examTestId,
      title: 'IELTS Listening Test 1',
      skill: ExamSkill.LISTENING,
      status: ExamTestStatus.PUBLISHED,
      passScore: 70,
      version: 2,
      parts: [
        {
          _id: new Types.ObjectId(),
          title: 'Section 1',
          questionGroups: [
            {
              _id: new Types.ObjectId(),
              questions: [
                {
                  number: 1,
                  prompt: 'Speaker name?',
                  grading: { acceptedKeys: ['Alice'] },
                  points: 1,
                },
              ],
            },
          ],
        },
      ],
    };

    let examTestModel: any;
    let submissionModel: any;
    let connection: any;
    let mockSession: any;
    let fullService: AssignmentsService;
    let fullAssignmentModel: any;
    let fullCourseModel: any;
    let fullExerciseModel: any;
    let fullEnrollmentModel: any;
    let fullStudentAssignmentModel: any;

    beforeEach(async () => {
      function FullMockAssignment(dto: any) {
        Object.assign(this, dto);
        this._id = assignmentId;
        this.status = dto.status || AssignmentStatus.PUBLISHED;
        this.save = jest.fn().mockResolvedValue(this);
        this.toObject = jest.fn().mockReturnValue({ ...this });
      }

      fullAssignmentModel = FullMockAssignment;
      fullAssignmentModel.find = jest.fn();
      fullAssignmentModel.findById = jest.fn();
      fullAssignmentModel.findOne = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      });
      fullAssignmentModel.countDocuments = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      fullAssignmentModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });

      fullCourseModel = {
        findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(sampleCourse) }),
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([sampleCourse]) }),
        }),
      };

      fullExerciseModel = {
        findById: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
        }),
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
        }),
      };

      examTestModel = {
        findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(listeningExamTest) }),
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([listeningExamTest]) }),
        }),
      };

      fullEnrollmentModel = {
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([
            { studentId: student1Id, status: EnrollmentStatus.ACTIVE },
          ]),
        }),
      };

      fullStudentAssignmentModel = {
        find: jest.fn(),
        findOne: jest.fn(),
        insertMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
        countDocuments: jest.fn(),
      };

      submissionModel = {
        aggregate: jest.fn().mockResolvedValue([]),
      };

      mockSession = {
        withTransaction: jest.fn().mockImplementation(async (cb: any) => await cb()),
        endSession: jest.fn().mockResolvedValue(true),
      };
      connection = {
        startSession: jest.fn().mockResolvedValue(mockSession),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AssignmentsService,
          { provide: getModelToken(Assignment.name), useValue: fullAssignmentModel },
          { provide: getModelToken(Course.name), useValue: fullCourseModel },
          { provide: getModelToken(Exercise.name), useValue: fullExerciseModel },
          { provide: getModelToken(ExamTest.name), useValue: examTestModel },
          { provide: getModelToken(Enrollment.name), useValue: fullEnrollmentModel },
          { provide: getModelToken(StudentAssignment.name), useValue: fullStudentAssignmentModel },
          { provide: getModelToken(Submission.name), useValue: submissionModel },
          { provide: getConnectionToken(), useValue: connection },
        ],
      }).compile();

      fullService = module.get<AssignmentsService>(AssignmentsService);
    });

    it('create() persists examTestId alongside exerciseId for ExamTest and runs save+dispatch inside transaction', async () => {
      const res: any = await fullService.create(
        {
          courseId: courseId.toHexString(),
          examTestId: examTestId.toHexString(),
          status: AssignmentStatus.PUBLISHED,
        },
        teacherAActor,
      );

      expect(connection.startSession).toHaveBeenCalledTimes(1);
      expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);

      expect(res.examTestId).toBe(examTestId.toHexString());
      expect(res.exerciseId).toBe(examTestId.toHexString());
      expect(res.exerciseId).not.toBe('null');
      expect(res.exerciseType).toBe('listening');

      expect(fullStudentAssignmentModel.insertMany).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ ordered: false, session: mockSession }),
      );
    });

    it('create() catches E11000 on idempotencyKey and returns existing assignment cleanly', async () => {
      const dupErr = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
      const existingDoc: any = {
        _id: assignmentId,
        courseId: sampleCourse,
        exerciseId: examTestId,
        examTestId,
        assignedBy: teacherAId,
        title: 'Existing Listening Task',
        openAt: new Date(Date.now() - 1000),
        deadlineAt: new Date(Date.now() + 86400000),
        status: AssignmentStatus.PUBLISHED,
        toObject() {
          return { ...this };
        },
      };

      // Force assignment.save to reject with E11000
      const OrigModel = fullAssignmentModel;
      const saveSpy = jest.fn().mockRejectedValue(dupErr);
      fullAssignmentModel.findOne = jest
        .fn()
        // First pre-check returns null (concurrent race)
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
            }),
          }),
        })
        // Second duplicate daily check returns null
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(null),
            }),
          }),
        })
        // Third recovery lookup inside catch(E11000) returns existingDoc
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(existingDoc),
            }),
          }),
        });

      // Override constructor save via prototype spy isn't needed if we wrap model constructor on service
      (fullService as any).assignmentModel = Object.assign(
        jest.fn().mockImplementation((dto: any) => ({ ...dto, _id: assignmentId, save: saveSpy })),
        OrigModel,
      );

      const res: any = await fullService.create(
        {
          courseId: courseId.toHexString(),
          examTestId: examTestId.toHexString(),
          idempotencyKey: 'idem-race-123',
        },
        teacherAActor,
      );

      expect(res.id).toBe(assignmentId.toHexString());
      expect(res.title).toBe('Existing Listening Task');
      expect(res.examTestId).toBe(examTestId.toHexString());
      expect(res.exerciseType).toBe('listening');
    });

    it('findAll() never populates exerciseId, hydrates new & legacy ExamTest docs, and filters query.assignedDate', async () => {
      const populateSpy = jest.fn().mockReturnThis();
      const skipSpy = jest.fn().mockReturnThis();
      const limitSpy = jest.fn().mockReturnThis();
      const sortSpy = jest.fn().mockReturnThis();

      const newExamAsg: any = {
        _id: new Types.ObjectId(),
        courseId: sampleCourse,
        exerciseId: examTestId,
        examTestId,
        assignedBy: teacherAId,
        title: 'New ExamTest Asg',
        openAt: new Date(Date.now() - 1000),
        deadlineAt: new Date(Date.now() + 86400000),
        assignedDate: '2026-11-20',
        status: AssignmentStatus.PUBLISHED,
        toObject() {
          return { ...this };
        },
      };
      const legacyExamAsg: any = {
        _id: new Types.ObjectId(),
        courseId: sampleCourse,
        exerciseId: examTestId, // Legacy doc has NO examTestId field, only exerciseId
        assignedBy: teacherAId,
        title: 'Legacy ExamTest Asg',
        openAt: new Date(Date.now() - 1000),
        deadlineAt: new Date(Date.now() + 86400000),
        assignedDate: '2026-11-20',
        status: AssignmentStatus.PUBLISHED,
        toObject() {
          return { ...this };
        },
      };

      fullAssignmentModel.find.mockReturnValue({
        populate: populateSpy,
        skip: skipSpy,
        limit: limitSpy,
        sort: sortSpy,
        exec: jest.fn().mockResolvedValue([newExamAsg, legacyExamAsg]),
      });
      fullAssignmentModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      });

      const res = await fullService.findAll(teacherAActor, { assignedDate: '2026-11-20' });

      // Ensure .populate('exerciseId', ...) was NEVER called
      const populatePaths = populateSpy.mock.calls.map((c: any[]) => c[0]);
      expect(populatePaths).not.toContain('exerciseId');

      // Ensure assignedDate filter was applied to assignmentModel.find
      const findFilter = fullAssignmentModel.find.mock.calls[0][0];
      expect(JSON.stringify(findFilter)).toContain('2026-11-20');

      expect(res.items).toHaveLength(2);
      for (const item of res.items) {
        expect(item.examTestId).toBe(examTestId.toHexString());
        expect(item.exerciseId).toBe(examTestId.toHexString());
        expect(item.exerciseId).not.toBe('null');
        expect(item.exerciseType).toBe('listening');
      }
    });

    it('findMine() includes AVAILABLE in backfill, hydrates Listening ExamTest, and reads penaltyApplied from penaltyAppliedAt', async () => {
      fullEnrollmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ courseId }]),
        }),
      });
      fullAssignmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      const saDoc: any = {
        _id: new Types.ObjectId(),
        studentId: student1Id,
        effectiveDeadlineAt: new Date(Date.now() + 86400000),
        status: StudentAssignmentStatus.NOT_STARTED,
        penaltyAppliedAt: new Date('2026-11-20T00:00:00Z'),
        assignmentId: {
          _id: assignmentId,
          courseId: sampleCourse,
          exerciseId: examTestId, // Legacy ExamTest without examTestId field
          title: 'Listening Homework',
          openAt: new Date(Date.now() - 3600000),
          deadlineAt: new Date(Date.now() + 86400000),
          status: AssignmentStatus.AVAILABLE,
          allowRetake: true,
        },
      };

      const populateSpy = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([saDoc]),
        }),
      });
      fullStudentAssignmentModel.find.mockReturnValue({
        populate: populateSpy,
      });

      const res = await fullService.findMine(student1Actor, {});

      // Check backfill included AssignmentStatus.AVAILABLE
      const backfillFilter = fullAssignmentModel.find.mock.calls[0][0];
      expect(backfillFilter.status.$in).toEqual(
        expect.arrayContaining([
          AssignmentStatus.PUBLISHED,
          AssignmentStatus.SCHEDULED,
          AssignmentStatus.AVAILABLE,
        ]),
      );

      // Ensure findMine did NOT populate exerciseId
      const populateArg = populateSpy.mock.calls[0][0];
      const nestedPaths = (populateArg.populate || []).map((p: any) => p.path);
      expect(nestedPaths).not.toContain('exerciseId');

      expect(res.items).toHaveLength(1);
      expect(res.items[0].examTestId).toBe(examTestId.toHexString());
      expect(res.items[0].exerciseType).toBe('listening');
      expect(res.items[0].translationAvailable).toBe(false);
      expect(res.items[0].penaltyApplied).toBe(true);
    });

    it('findById() and previewById() preserve ExamTest exerciseId/examTestId/listening type without populating exerciseId', async () => {
      const legacyExamAsg: any = {
        _id: assignmentId,
        courseId: sampleCourse,
        exerciseId: examTestId,
        assignedBy: teacherAId,
        exerciseSnapshot: {
          title: 'IELTS Listening Test 1',
          type: 'listening',
          questions: [{ number: 1, prompt: 'Q1', points: 1 }],
          passScore: 70,
          version: 2,
        },
        title: 'Listening Assignment',
        openAt: new Date(Date.now() - 3600000),
        deadlineAt: new Date(Date.now() + 86400000),
        status: AssignmentStatus.PUBLISHED,
        toObject() {
          return { ...this };
        },
      };

      const populateSpy = jest.fn().mockReturnThis();
      fullAssignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: populateSpy,
          exec: jest.fn().mockResolvedValue(legacyExamAsg),
        }),
      });
      fullEnrollmentModel.countDocuments = jest.fn().mockResolvedValue(1);

      const detail: any = await fullService.findById(assignmentId.toHexString(), teacherAActor);
      expect(populateSpy).not.toHaveBeenCalledWith('exerciseId', expect.anything());
      expect(detail.examTestId).toBe(examTestId.toHexString());
      expect(detail.exerciseId).toBe(examTestId.toHexString());
      expect(detail.exerciseType).toBe('listening');

      const preview: any = await fullService.previewById(assignmentId.toHexString(), teacherAActor);
      expect(populateSpy).not.toHaveBeenCalledWith('exerciseId', expect.anything());
      expect(preview.examTestId).toBe(examTestId.toHexString());
      expect(preview.exerciseId).toBe(examTestId.toHexString());
      expect(preview.exerciseType).toBe('listening');
    });

    it('computeStudentAssignmentLifecycleStatus keeps retakable SUBMITTED assignment AVAILABLE before deadline', () => {
      const now = new Date('2026-11-25T10:00:00Z');
      const openAt = new Date('2026-11-25T00:00:00Z');
      const effectiveDeadlineAt = new Date('2026-11-26T00:00:00Z');

      const retakable = computeStudentAssignmentLifecycleStatus(
        { openAt, allowRetake: true, maxAttempts: 3 },
        {
          status: StudentAssignmentStatus.SUBMITTED,
          effectiveDeadlineAt,
          attemptsCount: 1,
        },
        now,
      );
      expect(retakable.isAvailable).toBe(true);
      expect(retakable.scheduleStatus).toBe('AVAILABLE');
      expect(retakable.remainingSeconds).toBeGreaterThan(0);

      const noRetake = computeStudentAssignmentLifecycleStatus(
        { openAt, allowRetake: false },
        {
          status: StudentAssignmentStatus.SUBMITTED,
          effectiveDeadlineAt,
          attemptsCount: 1,
        },
        now,
      );
      expect(noRetake.isAvailable).toBe(false);
      expect(noRetake.scheduleStatus).toBe('COMPLETED');

      const maxReached = computeStudentAssignmentLifecycleStatus(
        { openAt, allowRetake: true, maxAttempts: 2 },
        {
          status: StudentAssignmentStatus.SUBMITTED,
          effectiveDeadlineAt,
          attemptsCount: 2,
        },
        now,
      );
      expect(maxReached.isAvailable).toBe(false);
      expect(maxReached.scheduleStatus).toBe('COMPLETED');

      const passed = computeStudentAssignmentLifecycleStatus(
        { openAt, allowRetake: true, maxAttempts: 3 },
        {
          status: StudentAssignmentStatus.PASSED,
          effectiveDeadlineAt,
          attemptsCount: 1,
        },
        now,
      );
      expect(passed.isAvailable).toBe(false);
      expect(passed.scheduleStatus).toBe('COMPLETED');
    });

    it('onModuleInit respects assignment.targetScorePercent instead of hardcoding >= 70', async () => {
      const highTargetAsgId = new Types.ObjectId();
      const defaultTargetAsgId = new Types.ObjectId();
      const lowTargetAsgId = new Types.ObjectId();

      const saHighTargetId = new Types.ObjectId();
      const saDefaultTargetId = new Types.ObjectId();
      const saLowTargetId = new Types.ObjectId();

      // Candidate unpassed SAs with bestScore
      fullStudentAssignmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: saHighTargetId, assignmentId: highTargetAsgId, bestScore: 75 },
            { _id: saDefaultTargetId, assignmentId: defaultTargetAsgId, bestScore: 75 },
            { _id: saLowTargetId, assignmentId: lowTargetAsgId, bestScore: 55 },
          ]),
        }),
      });

      fullAssignmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            { _id: highTargetAsgId, targetScorePercent: 85 },
            { _id: defaultTargetAsgId }, // defaults to 70
            { _id: lowTargetAsgId, targetScorePercent: 50 },
          ]),
        }),
      });

      submissionModel.aggregate.mockResolvedValue([
        { _id: saHighTargetId, assignmentId: highTargetAsgId, count: 1, maxScore: 75 },
        { _id: saDefaultTargetId, assignmentId: defaultTargetAsgId, count: 2, maxScore: 75 },
      ]);

      await fullService.onModuleInit();

      // NEVER blindly updateMany with { bestScore: { $gte: 70 } }
      for (const call of fullStudentAssignmentModel.updateMany.mock.calls) {
        expect(JSON.stringify(call[0])).not.toContain('"$gte":70');
      }

      // saHighTargetId (bestScore/maxScore 75 < target 85) MUST NOT be promoted to PASSED
      const highTargetUpdates = fullStudentAssignmentModel.updateOne.mock.calls.filter(
        (c: any[]) => String(c[0]._id) === saHighTargetId.toHexString(),
      );
      for (const u of highTargetUpdates) {
        expect(u[1].$set.status).not.toBe(StudentAssignmentStatus.PASSED);
        expect(u[1].$set.isTargetAchieved).not.toBe(true);
      }

      // saDefaultTargetId (75 >= 70) and saLowTargetId (55 >= 50) SHOULD be promoted
      expect(fullStudentAssignmentModel.updateOne).toHaveBeenCalledWith(
        { _id: saDefaultTargetId },
        expect.objectContaining({
          $set: expect.objectContaining({
            isTargetAchieved: true,
            status: StudentAssignmentStatus.PASSED,
          }),
        }),
      );
      expect(fullStudentAssignmentModel.updateOne).toHaveBeenCalledWith(
        { _id: saLowTargetId },
        expect.objectContaining({
          $set: expect.objectContaining({
            isTargetAchieved: true,
            status: StudentAssignmentStatus.PASSED,
          }),
        }),
      );
    });
  });
});

