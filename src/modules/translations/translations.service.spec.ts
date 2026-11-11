import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TranslationsService } from './translations.service';
import { TranslationSubmission } from 'src/database/schemas/translation-submission.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  AssignmentStatus,
  ExerciseType,
  TranslationSubmissionStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('TranslationsService', () => {
  let service: TranslationsService;
  let translationModel: any;
  let assignmentModel: any;
  let courseModel: any;
  let studentAssignmentModel: any;

  const studentId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const studentAssignmentId = new Types.ObjectId();
  const translationId = new Types.ObjectId();
  const courseId = new Types.ObjectId();

  const studentActor = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacherActor = {
    _id: teacherId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const sampleReadingAssignment = {
    _id: assignmentId,
    courseId,
    status: AssignmentStatus.PUBLISHED,
    exerciseSnapshot: {
      title: 'Glass History Reading',
      type: ExerciseType.READING,
      passage: 'Glass was first manufactured in Mesopotamia...',
    },
  };

  const sampleStudentAssignment = {
    _id: studentAssignmentId,
    assignmentId,
    studentId,
  };

  beforeEach(async () => {
    function MockTranslationInstance(dto: any) {
      Object.assign(this, dto);
      this._id = translationId;
      this.status = dto.status || TranslationSubmissionStatus.SUBMITTED;
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    translationModel = MockTranslationInstance;
    translationModel.find = jest.fn();
    translationModel.findOne = jest.fn();
    translationModel.findById = jest.fn();
    translationModel.countDocuments = jest.fn();

    assignmentModel = {
      findById: jest.fn(),
    };

    courseModel = {
      findById: jest.fn(),
    };

    studentAssignmentModel = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationsService,
        { provide: getModelToken(TranslationSubmission.name), useValue: translationModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
      ],
    }).compile();

    service = module.get<TranslationsService>(TranslationsService);
  });

  describe('submit', () => {
    it('throws ForbiddenException if actor is a teacher', async () => {
      await expect(
        service.submit(
          assignmentId.toHexString(),
          { translatedText: 'Bản dịch thử nghiệm...' },
          teacherActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if assignment is not READING', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...sampleReadingAssignment,
            exerciseSnapshot: {
              ...sampleReadingAssignment.exerciseSnapshot,
              type: ExerciseType.LISTENING,
            },
          }),
        }),
      });

      await expect(
        service.submit(
          assignmentId.toHexString(),
          { translatedText: 'Bản dịch thử nghiệm...' },
          studentActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('submits translation successfully for student', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(sampleReadingAssignment),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleStudentAssignment),
      });

      translationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await service.submit(
        assignmentId.toHexString(),
        { translatedText: 'Kính được sản xuất lần đầu tiên tại Lưỡng Hà...' },
        studentActor,
      );

      expect(res).toBeDefined();
      expect(res.translatedText).toContain('Lưỡng Hà');
      expect(res.status).toBe(TranslationSubmissionStatus.SUBMITTED);
      expect(res.originalPassage).toContain('Mesopotamia');
    });
  });

  describe('review', () => {
    it('allows course teacher to review and comment on student translation', async () => {
      const mockDoc: any = {
        _id: translationId,
        assignmentId,
        studentId,
        translatedText: 'Bản dịch tiếng Việt...',
        status: TranslationSubmissionStatus.SUBMITTED,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
        toObject: function () {
          return { ...this };
        },
      };

      translationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleReadingAssignment),
      });

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: courseId,
          teacherId,
        }),
      });

      const res = await service.review(
        translationId.toHexString(),
        { teacherComment: 'Bản dịch rất tốt, văn phong mạch lạc.' },
        teacherActor,
      );

      expect(res.status).toBe(TranslationSubmissionStatus.REVIEWED);
      expect(res.teacherComment).toBe('Bản dịch rất tốt, văn phong mạch lạc.');
      expect(res.reviewedBy).toBe(teacherId.toHexString());
    });
  });
});

