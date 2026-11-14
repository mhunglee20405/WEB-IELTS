import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import {
  DeadlinesService,
  isAssignmentOverdue,
} from './deadlines.service';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { PenaltyTransaction } from 'src/database/schemas/penalty-transaction.schema';
import { StudentProfile } from 'src/database/schemas/student-profile.schema';
import { StudentAssignmentStatus } from 'src/database/schemas/enums';

describe('DeadlinesService', () => {
  let service: DeadlinesService;
  let studentAssignmentModel: any;
  let assignmentModel: any;
  let courseModel: any;
  let penaltyModel: any;
  let studentProfileModel: any;
  let connection: any;

  const studentId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const studentAssignmentId = new Types.ObjectId();

  beforeEach(async () => {
    function MockPenaltyInstance(dto: any) {
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    }

    penaltyModel = MockPenaltyInstance;
    penaltyModel.findOne = jest.fn();

    studentAssignmentModel = {
      find: jest.fn(),
      countDocuments: jest.fn(),
    };

    assignmentModel = {
      find: jest.fn(),
    };

    courseModel = {
      find: jest.fn(),
    };

    studentProfileModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
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
        DeadlinesService,
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(PenaltyTransaction.name), useValue: penaltyModel },
        { provide: getModelToken(StudentProfile.name), useValue: studentProfileModel },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get<DeadlinesService>(DeadlinesService);
  });

  describe('isAssignmentOverdue evaluation logic', () => {
    it('returns false if assignment status is PASSED regardless of timestamp', () => {
      const pastDate = new Date('2026-01-01T00:00:00Z');
      expect(
        isAssignmentOverdue(
          {
            effectiveDeadlineAt: pastDate,
            status: StudentAssignmentStatus.PASSED,
          },
          new Date('2026-06-01T00:00:00Z'),
        ),
      ).toBe(false);
    });

    it('returns false if effectiveDeadlineAt is in the future', () => {
      const futureDate = new Date('2026-12-31T23:59:59Z');
      expect(
        isAssignmentOverdue(
          {
            effectiveDeadlineAt: futureDate,
            status: StudentAssignmentStatus.NOT_STARTED,
          },
          new Date('2026-11-20T00:00:00Z'),
        ),
      ).toBe(false);
    });

    it('returns true if effectiveDeadlineAt has passed for uncompleted or submitted assignment', () => {
      const pastDate = new Date('2026-11-20T23:59:59Z');
      expect(
        isAssignmentOverdue(
          {
            effectiveDeadlineAt: pastDate,
            status: StudentAssignmentStatus.SUBMITTED, // Submitted but score < 70%
          },
          new Date('2026-11-21T00:00:01Z'),
        ),
      ).toBe(true);
    });
  });

  describe('processOverdueAssignments', () => {
    it('processes overdue assignments, sets status to OVERDUE, and creates idempotent penalty', async () => {
      const pastDeadline = new Date('2026-11-20T23:59:59.999Z');
      const mockOverdueDoc: any = {
        _id: studentAssignmentId,
        studentId,
        assignmentId,
        effectiveDeadlineAt: pastDeadline,
        status: StudentAssignmentStatus.NOT_STARTED,
        save: jest.fn().mockResolvedValue(true),
      };

      studentAssignmentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([mockOverdueDoc]),
          }),
        }),
      });

      penaltyModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null), // No penalty exists yet
        }),
      });

      const res = await service.processOverdueAssignments({}, undefined, new Date('2026-11-21T08:00:00Z'));

      expect(res.evaluatedCount).toBe(1);
      expect(res.processedCount).toBe(1);
      expect(res.newPenaltiesCount).toBe(1);
      expect(mockOverdueDoc.status).toBe(StudentAssignmentStatus.OVERDUE);
      expect(studentProfileModel.updateOne).toHaveBeenCalledWith(
        { userId: studentId },
        { $inc: { penaltyPointsCache: 1 } },
        expect.anything(),
      );
    });

    it('re-running is idempotent: does not duplicate penalty if idempotencyKey already exists', async () => {
      const pastDeadline = new Date('2026-11-20T23:59:59.999Z');
      const mockOverdueDoc: any = {
        _id: studentAssignmentId,
        studentId,
        assignmentId,
        effectiveDeadlineAt: pastDeadline,
        status: StudentAssignmentStatus.NOT_STARTED,
        save: jest.fn().mockResolvedValue(true),
      };

      studentAssignmentModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([mockOverdueDoc]),
          }),
        }),
      });

      // Existing penalty already found
      penaltyModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
        }),
      });

      const res = await service.processOverdueAssignments({}, undefined, new Date('2026-11-21T08:00:00Z'));

      expect(res.evaluatedCount).toBe(1);
      expect(res.processedCount).toBe(1);
      expect(res.newPenaltiesCount).toBe(0); // 0 new penalties charged!
    });
  });
});

