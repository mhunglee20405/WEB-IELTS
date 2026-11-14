import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AssignmentsService } from './assignments.service';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { Exercise } from 'src/database/schemas/exercise.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  AssignmentStatus,
  CourseStatus,
  EnrollmentStatus,
  ExerciseStatus,
  ExerciseType,
  QuestionType,
  StudentAssignmentStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

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
      expect(res.openAtVn).toContain('2026-11-20T00:00:00+07:00');
      expect(res.deadlineAtVn).toContain('2026-11-20T23:59:59+07:00');

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

      const res = await service.create(
        {
          courseId: courseId.toHexString(),
          exerciseId: exerciseId.toHexString(),
          assignedDate: '2026-11-20',
        },
        teacherAActor,
      );

      expect(res).toBeDefined();
      expect(res.assignedDate).toBe('2026-11-20');
      expect(res.openAtVn).toContain('2026-11-20T06:00:00+07:00');
      expect(res.deadlineAtVn).toContain('2026-11-21T06:00:00+07:00');
      expect(res.scheduleStatus).toBe('SCHEDULED');
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
});

