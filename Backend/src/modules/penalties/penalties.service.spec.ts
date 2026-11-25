import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
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
    penaltyModel.findOneAndUpdate = jest.fn();
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

  describe('findAll', () => {
    it('returns formatted penalty items and records for Admin with empty list', async () => {
      const adminActor = {
        _id: new Types.ObjectId(),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      } as unknown as UserDocument;

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
        exec: jest.fn().mockResolvedValue(0),
      });

      const res = await service.findAll(adminActor, { status: 'all', page: 1, limit: 20 });

      expect(res.items).toEqual([]);
      expect(res.records).toEqual([]);
      expect(res.total).toBe(0);
    });

    it('filters active penalties for Admin when status=active', async () => {
      const adminActor = {
        _id: new Types.ObjectId(),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      } as unknown as UserDocument;

      const mockDoc: any = {
        _id: transactionId,
        studentId: { _id: studentId, fullName: 'Nguyen Van A', email: 'a@test.com' },
        studentAssignmentId: {
          _id: studentAssignmentId,
          assignmentId: { _id: new Types.ObjectId(), title: 'IELTS Reading Test 1' },
        },
        deltaPoints: 1,
        reason: 'Overdue deadline',
        isReversed: false,
        createdAt: new Date('2026-11-18T10:00:00.000Z'),
        toObject: function () {
          return this;
        },
      };

      penaltyModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([mockDoc]),
              }),
            }),
          }),
        }),
      });

      penaltyModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const res = await service.findAll(adminActor, { status: 'active' });

      expect(res.items.length).toBe(1);
      expect(res.items[0].points).toBe(1);
      expect(res.items[0].reversed).toBe(false);
      expect(res.items[0].studentName).toBe('Nguyen Van A');
      expect(res.items[0].assignmentTitle).toBe('IELTS Reading Test 1');
      expect(res.records).toBe(res.items);
    });

    it('rejects Teacher filtering by studentId not enrolled in teacher courses', async () => {
      const courseId = new Types.ObjectId();
      const otherStudentId = new Types.ObjectId();

      courseModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: courseId }]),
        }),
      });
      enrollmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ studentId }]),
        }),
      });

      await expect(
        service.findAll(teacherActor, { studentId: otherStudentId.toHexString() }),
      ).rejects.toThrow(
        new ForbiddenException("You do not have access to this student's penalties"),
      );
    });

    it('allows Teacher filtering by studentId enrolled in teacher courses', async () => {
      const courseId = new Types.ObjectId();

      courseModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ _id: courseId }]),
        }),
      });
      enrollmentModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ studentId }]),
        }),
      });
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
        exec: jest.fn().mockResolvedValue(0),
      });

      const res = await service.findAll(teacherActor, {
        studentId: studentId.toHexString(),
      });

      expect(res.items).toEqual([]);
      expect(penaltyModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId,
        }),
      );
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
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
        exec: jest.fn().mockResolvedValue(null), // Has not been reversed yet
      });

      penaltyModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...originalPenaltyDoc, isReversed: true }),
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

    it('rejects reversal if the penalty transaction was already reversed inside transaction', async () => {
      const originalPenaltyDoc: any = {
        _id: transactionId,
        studentId,
        studentAssignmentId,
        deltaPoints: 1,
      };

      penaltyModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(originalPenaltyDoc),
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

      let insideTransaction = false;
      connection.startSession.mockResolvedValue({
        withTransaction: jest.fn().mockImplementation(async (cb: any) => {
          insideTransaction = true;
          try {
            return await cb();
          } finally {
            insideTransaction = false;
          }
        }),
        endSession: jest.fn().mockResolvedValue(true),
      });

      let findOneCalledInsideTx = false;
      const sessionSpy = jest.fn().mockImplementation(() => {
        findOneCalledInsideTx = insideTransaction;
        return {
          exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), reversedTransactionId: transactionId }),
        };
      });
      penaltyModel.findOne.mockReturnValue({
        session: sessionSpy,
        exec: jest.fn().mockImplementation(() => {
          findOneCalledInsideTx = insideTransaction;
          return Promise.resolve({ _id: new Types.ObjectId(), reversedTransactionId: transactionId });
        }),
      });

      await expect(
        service.reverse(
          transactionId.toHexString(),
          { reason: 'Thử reverse lần 2...' },
          teacherActor,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(findOneCalledInsideTx).toBe(true);
      expect(sessionSpy).toHaveBeenCalled();
    });

    it('catches MongoDB E11000 duplicate key error on concurrent reversal and throws ConflictException', async () => {
      const originalPenaltyDoc: any = {
        _id: transactionId,
        studentId,
        studentAssignmentId,
        deltaPoints: 1,
        save: jest.fn().mockResolvedValue(true),
      };

      penaltyModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(originalPenaltyDoc),
      });
      penaltyModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });
      penaltyModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...originalPenaltyDoc, isReversed: true }),
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

      const dupErr = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      const origModel = penaltyModel;
      const raceModel: any = jest.fn().mockImplementation((dto: any) => ({
        ...dto,
        _id: new Types.ObjectId(),
        save: jest.fn().mockRejectedValue(dupErr),
      }));
      Object.assign(raceModel, origModel);
      (service as any).penaltyModel = raceModel;

      await expect(
        service.reverse(
          transactionId.toHexString(),
          { reason: 'Concurrent duplicate reversal test' },
          teacherActor,
        ),
      ).rejects.toThrow(new ConflictException('Penalty transaction has already been reversed'));
    });
  });
});

