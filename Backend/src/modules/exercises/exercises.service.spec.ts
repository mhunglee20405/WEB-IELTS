import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ExercisesService } from './exercises.service';
import { Exercise } from 'src/database/schemas/exercise.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExerciseStatus,
  ExerciseType,
  QuestionType,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';
import { ExerciseMapper } from './mappers/exercise.mapper';

describe('ExercisesService', () => {
  let service: ExercisesService;
  let exerciseModel: any;
  let assignmentModel: any;
  let studentAssignmentModel: any;

  const adminId = new Types.ObjectId();
  const teacherAId = new Types.ObjectId();
  const teacherBId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const exerciseId = new Types.ObjectId();

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

  const studentActor = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const validMcqQuestions = [
    {
      questionId: 'q-1',
      type: QuestionType.MULTIPLE_CHOICE,
      prompt: 'What was the main discovery?',
      options: [
        { key: 'A', text: 'Steam engine' },
        { key: 'B', text: 'Electricity' },
      ],
      answerSpecification: { correctKey: 'A' },
      points: 1,
      explanation: 'Refer to paragraph 2',
    },
  ];

  beforeEach(async () => {
    function MockExerciseInstance(dto: any) {
      Object.assign(this, dto);
      this._id = exerciseId;
      this.version = dto.version || 1;
      this.status = dto.status || ExerciseStatus.DRAFT;
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    exerciseModel = MockExerciseInstance;
    exerciseModel.find = jest.fn();
    exerciseModel.findById = jest.fn();
    exerciseModel.findByIdAndUpdate = jest.fn();
    exerciseModel.countDocuments = jest.fn();

    assignmentModel = {
      find: jest.fn(),
    };

    studentAssignmentModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExercisesService,
        { provide: getModelToken(Exercise.name), useValue: exerciseModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
      ],
    }).compile();

    service = module.get<ExercisesService>(ExercisesService);
  });

  describe('create', () => {
    it('throws ForbiddenException if actor is a student', async () => {
      await expect(
        service.create(
          {
            title: 'Sample Reading',
            type: ExerciseType.READING,
            questions: validMcqQuestions,
          },
          studentActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if questions array is empty', async () => {
      await expect(
        service.create(
          {
            title: 'Sample Reading',
            type: ExerciseType.READING,
            questions: [],
          },
          teacherAActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if Multiple Choice has less than 2 options', async () => {
      await expect(
        service.create(
          {
            title: 'Sample Reading',
            type: ExerciseType.READING,
            questions: [
              {
                questionId: 'q-1',
                type: QuestionType.MULTIPLE_CHOICE,
                prompt: 'What was discovered?',
                options: [{ key: 'A', text: 'Steam engine' }],
                answerSpecification: { correctKey: 'A' },
                points: 1,
              },
            ],
          },
          teacherAActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if Multiple Choice correctKey does not match options', async () => {
      await expect(
        service.create(
          {
            title: 'Sample Reading',
            type: ExerciseType.READING,
            questions: [
              {
                questionId: 'q-1',
                type: QuestionType.MULTIPLE_CHOICE,
                prompt: 'What was discovered?',
                options: [
                  { key: 'A', text: 'Steam engine' },
                  { key: 'B', text: 'Electricity' },
                ],
                answerSpecification: { correctKey: 'C' },
                points: 1,
              },
            ],
          },
          teacherAActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if Fill In The Blank lacks acceptedAnswers', async () => {
      await expect(
        service.create(
          {
            title: 'Sample Reading',
            type: ExerciseType.READING,
            questions: [
              {
                questionId: 'q-1',
                type: QuestionType.FILL_BLANK,
                prompt: 'Complete the sentence: ___',
                answerSpecification: { acceptedAnswers: [] },
                points: 1,
              },
            ],
          },
          teacherAActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully creates an exercise with valid questions for teacher', async () => {
      const result = await service.create(
        {
          title: 'Reading Test 1',
          description: 'A detailed passage',
          type: ExerciseType.READING,
          passage: 'Once upon a time...',
          questions: validMcqQuestions,
        },
        teacherAActor,
      );

      expect(result).toBeDefined();
      expect(result.title).toBe('Reading Test 1');
      expect(result.status).toBe(ExerciseStatus.DRAFT);
      expect(result.version).toBe(1);
      expect(result.questions[0].answerSpecification?.correctKey).toBe('A');
    });
  });

  describe('findById & Answer Key Leakage Prevention', () => {
    const mockExerciseDoc: any = {
      _id: exerciseId,
      title: 'Reading Test 1',
      description: 'A detailed passage',
      type: ExerciseType.READING,
      passage: 'Once upon a time...',
      questions: validMcqQuestions,
      passScore: 70,
      version: 1,
      status: ExerciseStatus.PUBLISHED,
      createdBy: teacherAId,
      toObject: () => ({
        _id: exerciseId,
        title: 'Reading Test 1',
        description: 'A detailed passage',
        type: ExerciseType.READING,
        passage: 'Once upon a time...',
        questions: validMcqQuestions,
        passScore: 70,
        version: 1,
        status: ExerciseStatus.PUBLISHED,
        createdBy: teacherAId,
      }),
    };

    it('returns full exercise with answerSpecification and explanation for Admin', async () => {
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockExerciseDoc),
        }),
      });

      const res: any = await service.findById(exerciseId.toHexString(), adminActor);
      expect(res.questions[0].answerSpecification).toBeDefined();
      expect(res.questions[0].answerSpecification.correctKey).toBe('A');
      expect(res.questions[0].explanation).toBe('Refer to paragraph 2');
    });

    it('returns full exercise with answerSpecification for teacher who created it', async () => {
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockExerciseDoc),
        }),
      });

      const res: any = await service.findById(exerciseId.toHexString(), teacherAActor);
      expect(res.questions[0].answerSpecification).toBeDefined();
      expect(res.questions[0].explanation).toBe('Refer to paragraph 2');
    });

    it('throws ForbiddenException if student is not assigned to this exercise', async () => {
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockExerciseDoc),
        }),
      });
      assignmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      await expect(service.findById(exerciseId.toHexString(), studentActor)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('strictly sanitizes exercise when student is assigned: strips answerSpecification and explanation', async () => {
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockExerciseDoc),
        }),
      });
      const dummyAssignmentId = new Types.ObjectId();
      assignmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: dummyAssignmentId }]),
        }),
      });
      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), studentId }),
      });

      const res: any = await service.findById(exerciseId.toHexString(), studentActor);

      // Student gets sanitized DTO
      expect(res.title).toBe('Reading Test 1');
      expect(res.questions[0].prompt).toBe('What was the main discovery?');
      expect(res.questions[0].options).toHaveLength(2);
      // Critical check: answerSpecification and explanation are strictly stripped!
      expect(res.questions[0].answerSpecification).toBeUndefined();
      expect(res.questions[0].explanation).toBeUndefined();
    });
  });

  describe('publish', () => {
    it('throws BadRequestException if publishing a Reading exercise without passage', async () => {
      const draftNoPassage: any = {
        _id: exerciseId,
        title: 'Empty passage',
        type: ExerciseType.READING,
        passage: '',
        questions: validMcqQuestions,
        createdBy: teacherAId,
        status: ExerciseStatus.DRAFT,
      };
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(draftNoPassage),
        }),
      });

      await expect(service.publish(exerciseId.toHexString(), teacherAActor)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('transitions DRAFT to PUBLISHED successfully', async () => {
      const draftDoc: any = {
        _id: exerciseId,
        title: 'Reading 1',
        type: ExerciseType.READING,
        passage: 'Passage text here',
        questions: validMcqQuestions,
        createdBy: teacherAId,
        status: ExerciseStatus.DRAFT,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
        toObject: function () {
          return { ...this };
        },
      };
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(draftDoc),
        }),
      });

      const result = await service.publish(exerciseId.toHexString(), teacherAActor);
      expect(draftDoc.status).toBe(ExerciseStatus.PUBLISHED);
      expect(result.status).toBe(ExerciseStatus.PUBLISHED);
    });
  });

  describe('update & version bumping', () => {
    it('increments version when a PUBLISHED exercise is modified', async () => {
      const publishedDoc: any = {
        _id: exerciseId,
        title: 'Published Reading',
        type: ExerciseType.READING,
        passage: 'Original passage',
        questions: validMcqQuestions,
        createdBy: teacherAId,
        status: ExerciseStatus.PUBLISHED,
        version: 1,
        toObject: function () {
          return { ...this };
        },
      };
      exerciseModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(publishedDoc),
        }),
      });

      const updatedDoc: any = {
        ...publishedDoc,
        title: 'Updated Published Reading',
        version: 2,
        toObject: function () {
          return { ...this };
        },
      };

      exerciseModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(updatedDoc),
        }),
      });

      const res = await service.update(
        exerciseId.toHexString(),
        {
          title: 'Updated Published Reading',
        },
        teacherAActor,
      );

      expect(res.version).toBe(2);
      expect(res.title).toBe('Updated Published Reading');
    });
  });
});
