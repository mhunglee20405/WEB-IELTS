import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PenaltiesService } from './penalties.service';
import { PenaltyTransaction } from 'src/database/schemas/penalty-transaction.schema';
import { StudentProfile } from 'src/database/schemas/student-profile.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';

describe('PenaltiesService', () => {
  let service: PenaltiesService;
  let penaltyModel: any;
  let studentProfileModel: any;
  let studentAssignmentModel: any;
  let courseModel: any;
  let enrollmentModel: any;
  let connection: any;

  const studentId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const transactionId = new Types.ObjectId();
  const studentAssignmentId = new Types.ObjectId();

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

  beforeEach(async () => {
    function MockPenaltyInstance(dto: any) {
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    penaltyModel = MockPenaltyInstance;
    penaltyModel.find = jest.fn();
    penaltyModel.findOne = jest.fn();
    penaltyModel.findById = jest.fn();
    penaltyModel.countDocuments = jest.fn();
    penaltyModel.aggregate = jest.fn();

    studentProfileModel = {
      findOne: jest.fn(),
    };

    studentAssignmentModel = {
      findById: jest.fn(),
    };

    courseModel = {
      find: jest.fn(),
      findById: jest.fn(),
    };

    enrollmentModel = {
      find: jest.fn(),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: jest.fn().mockImplementation(async (cb: any) => {
          return await cb();
        }),
        endSession: jest.fn().mockResolvedValue(true),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PenaltiesService,
        { provide: getModelToken(PenaltyTransaction.name), useValue: penaltyModel },
        { provide: getModelToken(StudentProfile.name), useValue: studentProfileModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModel },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get<PenaltiesService>(PenaltiesService);
  });

  describe('getMine', () => {
    it('calculates total penalty points from ledger aggregation', async () => {
      penaltyModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      penaltyModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      });

      // Total 2 penalty points from sum of deltaPoints
      penaltyModel.aggregate.mockResolvedValue([{ _id: null, totalPoints: 2 }]);

      const res = await service.getMine(studentActor, {});

      expect(res.totalPoints).toBe(2);
      expect((res as any).totalVnd).toBeUndefined();
    });
  });

  describe('reverse', () => {
    it('creates compensating transaction (-1 pt) and updates profile penaltyPointsCache', async () => {
      const originalPenaltyDoc: any = {
        _id: transactionId,
        studentId,
        studentAssignmentId,
        deltaPoints: 1, // Original penalty
        reason: 'Overdue assignment',
        save: jest.fn().mockResolvedValue(true),
      };

      penaltyModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(originalPenaltyDoc),
      });

      penaltyModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // Has not been reversed yet
      });

      studentAssignmentModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            assignmentId: { courseId: new Types.ObjectId() },
          }),
        }),
      });

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ teacherId }),
      });

      const profileDoc: any = {
        userId: studentId,
        penaltyPointsCache: 1,
        save: jest.fn().mockResolvedValue(true),
      };

      studentProfileModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(profileDoc),
        }),
      });

      const res = await service.reverse(
        transactionId.toHexString(),
        { reason: 'Đã bổ sung giấy xin phép khám bệnh.' },
        teacherActor,
      );

      expect(res).toBeDefined();
      expect(res.deltaPoints).toBe(-1);
      expect(res.reversedTransactionId).toBe(transactionId.toHexString());
      // Profile cache decremented from 1 to 0
      expect(profileDoc.penaltyPointsCache).toBe(0);
    });

    it('rejects reversal if the penalty transaction was already reversed', async () => {
      const originalPenaltyDoc: any = {
        _id: transactionId,
        studentId,
        studentAssignmentId,
        deltaPoints: 1,
      };

      penaltyModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(originalPenaltyDoc),
      });

      // Existing reversal found!
      penaltyModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), reversedTransactionId: transactionId }),
      });

      await expect(
        service.reverse(
          transactionId.toHexString(),
          { reason: 'Thử reverse lần 2...' },
          teacherActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

