import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ExtensionsService } from './extensions.service';
import { ExtensionRequest } from 'src/database/schemas/extension-request.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { PenaltyTransaction } from 'src/database/schemas/penalty-transaction.schema';
import { StudentProfile } from 'src/database/schemas/student-profile.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { AuditService } from 'src/modules/audit/audit.service';
import {
  ExtensionRequestStatus,
  StudentAssignmentStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('ExtensionsService', () => {
  let service: ExtensionsService;
  let extensionModel: any;
  let studentAssignmentModel: any;
  let assignmentModel: any;
  let courseModel: any;
  let connection: any;

  const studentId = new Types.ObjectId();
  const otherStudentId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const studentAssignmentId = new Types.ObjectId();
  const requestId = new Types.ObjectId();
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

  const futureEffectiveDeadline = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
  const requestedDeadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days from now

  const sampleStudentAssignment = {
    _id: studentAssignmentId,
    studentId,
    assignmentId,
    effectiveDeadlineAt: futureEffectiveDeadline,
    status: StudentAssignmentStatus.NOT_STARTED,
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    function MockExtensionInstance(dto: any) {
      Object.assign(this, dto);
      this._id = requestId;
      this.status = dto.status || ExtensionRequestStatus.PENDING;
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    extensionModel = MockExtensionInstance;
    extensionModel.find = jest.fn();
    extensionModel.findOne = jest.fn();
    extensionModel.findOneAndUpdate = jest.fn();
    extensionModel.findById = jest.fn();
    extensionModel.countDocuments = jest.fn();

    studentAssignmentModel = {
      findById: jest.fn(),
    };

    assignmentModel = {
      findById: jest.fn(),
    };

    courseModel = {
      findById: jest.fn(),
      find: jest.fn(),
    };

    const penaltyModelMock: any = jest.fn().mockImplementation((dto: any) => ({
      ...dto,
      save: jest.fn().mockResolvedValue(true),
    }));
    penaltyModelMock.find = jest.fn().mockReturnValue({
      session: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });

    const studentProfileModelMock = {
      updateOne: jest.fn().mockResolvedValue(true),
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
        ExtensionsService,
        { provide: getModelToken(ExtensionRequest.name), useValue: extensionModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(PenaltyTransaction.name), useValue: penaltyModelMock },
        { provide: getModelToken(StudentProfile.name), useValue: studentProfileModelMock },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get<ExtensionsService>(ExtensionsService);
  });

  describe('create & Quota limit', () => {
    it('throws ForbiddenException if student attempts to extend another student assignment', async () => {
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...sampleStudentAssignment,
          studentId: otherStudentId, // Belongs to someone else
        }),
      });

      await expect(
        service.create(
          {
            studentAssignmentId: studentAssignmentId.toHexString(),
            requestedDeadlineAt: requestedDeadline.toISOString(),
            reason: 'Xin gia hạn bài tập...',
          },
          studentActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if requested deadline is earlier than current effective deadline', async () => {
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleStudentAssignment),
      });

      const earlierDeadline = new Date(futureEffectiveDeadline.getTime() - 1000);

      await expect(
        service.create(
          {
            studentAssignmentId: studentAssignmentId.toHexString(),
            requestedDeadlineAt: earlierDeadline.toISOString(),
            reason: 'Xin gia hạn sớm hơn...',
          },
          studentActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if student has reached monthly quota of 3 requests', async () => {
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleStudentAssignment),
      });

      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ courseId }),
      });

      // No pending request
      extensionModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      // 3 existing requests already created this month
      extensionModel.countDocuments.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(3),
        }),
      });

      await expect(
        service.create(
          {
            studentAssignmentId: studentAssignmentId.toHexString(),
            requestedDeadlineAt: requestedDeadline.toISOString(),
            reason: 'Xin gia hạn lần thứ 4...',
          },
          studentActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates extension request successfully when within quota (X < 3)', async () => {
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleStudentAssignment),
      });

      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ courseId }),
      });

      // Only 1 existing request
      extensionModel.countDocuments.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(1),
        }),
      });

      extensionModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null), // No pending request
        }),
      });

      const res = await service.create(
        {
          studentAssignmentId: studentAssignmentId.toHexString(),
          requestedDeadlineAt: requestedDeadline.toISOString(),
          reason: 'Bị ốm đột xuất xin dời hạn nộp 3 ngày.',
        },
        studentActor,
      );

      expect(res).toBeDefined();
      expect(res.status).toBe(ExtensionRequestStatus.PENDING);
      expect(res.reason).toContain('Bị ốm đột xuất');
    });

    it('throws ConflictException if there is already a pending request for the same student assignment', async () => {
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleStudentAssignment),
      });

      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ courseId }),
      });

      extensionModel.countDocuments.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(1),
        }),
      });

      // Existing pending request found
      extensionModel.findOne.mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), status: ExtensionRequestStatus.PENDING }),
        }),
      });

      await expect(
        service.create(
          {
            studentAssignmentId: studentAssignmentId.toHexString(),
            requestedDeadlineAt: requestedDeadline.toISOString(),
            reason: 'Trùng request đang chờ...',
          },
          studentActor,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('review', () => {
    it('approves request and atomically updates effectiveDeadlineAt on StudentAssignment', async () => {
      const mockRequestDoc: any = {
        _id: requestId,
        studentId,
        courseId,
        studentAssignmentId,
        requestedDeadlineAt: requestedDeadline,
        status: ExtensionRequestStatus.PENDING,
        save: jest.fn().mockResolvedValue(true),
        toObject: function () {
          return { ...this };
        },
      };

      extensionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRequestDoc),
      });

      extensionModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockImplementation(async () => {
          mockRequestDoc.status = ExtensionRequestStatus.APPROVED;
          mockRequestDoc.reviewedBy = teacherId;
          return mockRequestDoc;
        }),
      });

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: courseId, teacherId }),
      });

      const updatedSa: any = {
        _id: studentAssignmentId,
        studentId,
        effectiveDeadlineAt: futureEffectiveDeadline,
        status: StudentAssignmentStatus.OVERDUE,
        save: jest.fn().mockResolvedValue(true),
      };

      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedSa),
      });

      const res = await service.review(
        requestId.toHexString(),
        {
          status: ExtensionRequestStatus.APPROVED,
          reviewNote: 'Đồng ý gia hạn.',
        },
        teacherActor,
      );

      expect(mockRequestDoc.status).toBe(ExtensionRequestStatus.APPROVED);
      expect(mockRequestDoc.reviewedBy).toBe(teacherId);
      // StudentAssignment effective deadline was updated to requestedDeadline
      expect(updatedSa.effectiveDeadlineAt).toEqual(requestedDeadline);
      // If assignment was OVERDUE, reverts to NOT_STARTED / SUBMITTED
      expect(updatedSa.status).toBe(StudentAssignmentStatus.NOT_STARTED);
      expect(res.status).toBe(ExtensionRequestStatus.APPROVED);
    });

    it('rejects request and preserves previous effective deadline on StudentAssignment', async () => {
      const mockRequestDoc: any = {
        _id: requestId,
        studentId,
        courseId,
        studentAssignmentId,
        requestedDeadlineAt: requestedDeadline,
        status: ExtensionRequestStatus.PENDING,
        save: jest.fn().mockResolvedValue(true),
        toObject: function () {
          return { ...this };
        },
      };

      extensionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRequestDoc),
      });

      extensionModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockImplementation(async () => {
          mockRequestDoc.status = ExtensionRequestStatus.REJECTED;
          mockRequestDoc.reviewedBy = teacherId;
          return mockRequestDoc;
        }),
      });

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: courseId, teacherId }),
      });

      const originalDeadline = new Date(futureEffectiveDeadline);
      const updatedSa: any = {
        _id: studentAssignmentId,
        studentId,
        effectiveDeadlineAt: originalDeadline,
        status: StudentAssignmentStatus.NOT_STARTED,
        save: jest.fn().mockResolvedValue(true),
      };

      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedSa),
      });

      const res = await service.review(
        requestId.toHexString(),
        {
          status: ExtensionRequestStatus.REJECTED,
          reviewNote: 'Không chấp thuận do lý do không chính đáng.',
        },
        teacherActor,
      );

      expect(mockRequestDoc.status).toBe(ExtensionRequestStatus.REJECTED);
      // Effective deadline is preserved
      expect(updatedSa.effectiveDeadlineAt).toEqual(originalDeadline);
      expect(res.status).toBe(ExtensionRequestStatus.REJECTED);
    });

    it('prevents concurrent double-review via atomic PENDING findOneAndUpdate inside transaction', async () => {
      const mockRequestDoc: any = {
        _id: requestId,
        studentId,
        courseId,
        studentAssignmentId,
        requestedDeadlineAt: requestedDeadline,
        status: ExtensionRequestStatus.PENDING,
        save: jest.fn().mockResolvedValue(true),
        toObject: function () {
          return { ...this };
        },
      };

      extensionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRequestDoc),
      });
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: courseId, teacherId }),
      });
      // Concurrent review already changed status before transaction claimed PENDING lock
      extensionModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const updatedSa: any = {
        _id: studentAssignmentId,
        studentId,
        effectiveDeadlineAt: futureEffectiveDeadline,
        status: StudentAssignmentStatus.OVERDUE,
        save: jest.fn().mockResolvedValue(true),
      };
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedSa),
      });

      await expect(
        service.review(
          requestId.toHexString(),
          { status: ExtensionRequestStatus.APPROVED },
          teacherActor,
        ),
      ).rejects.toThrow(new BadRequestException('Extension request has already been reviewed'));

      expect(updatedSa.save).not.toHaveBeenCalled();
    });

    it('writes actorId (not createdBy) on reversal, persists reversedBy/reversedAt/reversalReason, and logs effectiveStatus/effectiveReviewNote', async () => {
      const createdReversals: any[] = [];
      const penaltyModelMock: any = jest.fn().mockImplementation((dto: any) => {
        createdReversals.push(dto);
        return {
          ...dto,
          _id: new Types.ObjectId(),
          save: jest.fn().mockResolvedValue(true),
        };
      });

      const activePenalty: any = {
        _id: new Types.ObjectId(),
        studentId,
        studentAssignmentId,
        deltaPoints: 1,
        isReversed: false,
        save: jest.fn().mockResolvedValue(true),
      };

      penaltyModelMock.find = jest.fn().mockReturnValue({
        session: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([activePenalty]),
        }),
      });

      const notifMock = { create: jest.fn().mockResolvedValue({}) };
      const auditMock = { log: jest.fn().mockResolvedValue({}) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ExtensionsService,
          { provide: getModelToken(ExtensionRequest.name), useValue: extensionModel },
          { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
          { provide: getModelToken(Assignment.name), useValue: assignmentModel },
          { provide: getModelToken(Course.name), useValue: courseModel },
          { provide: getModelToken(PenaltyTransaction.name), useValue: penaltyModelMock },
          { provide: getModelToken(StudentProfile.name), useValue: { updateOne: jest.fn().mockResolvedValue(true) } },
          { provide: getConnectionToken(), useValue: connection },
          { provide: NotificationsService, useValue: notifMock },
          { provide: AuditService, useValue: auditMock },
        ],
      }).compile();

      const fullService = module.get<ExtensionsService>(ExtensionsService);

      const mockRequestDoc: any = {
        _id: requestId,
        studentId,
        courseId,
        studentAssignmentId,
        requestedDeadlineAt: requestedDeadline,
        status: ExtensionRequestStatus.PENDING,
        save: jest.fn().mockResolvedValue(true),
        toObject: function () {
          return { ...this };
        },
      };

      extensionModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRequestDoc),
      });
      extensionModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockImplementation(async (_f: any, u: any) => ({
          ...mockRequestDoc,
          ...(u?.$set || {}),
          toObject() {
            return { ...this };
          },
        })),
      });
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: courseId, teacherId }),
      });
      const updatedSa: any = {
        _id: studentAssignmentId,
        studentId,
        effectiveDeadlineAt: futureEffectiveDeadline,
        status: StudentAssignmentStatus.OVERDUE,
        save: jest.fn().mockResolvedValue(true),
      };
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(updatedSa),
      });

      await fullService.review(
        requestId.toHexString(),
        {
          decision: ExtensionRequestStatus.APPROVED,
          decisionNote: 'Approved via decision alias',
        },
        teacherActor,
      );

      expect(createdReversals).toHaveLength(1);
      expect(createdReversals[0].actorId).toEqual(teacherId);
      expect(createdReversals[0].createdBy).toBeUndefined();

      expect(activePenalty.isReversed).toBe(true);
      expect(activePenalty.reversedBy).toEqual(teacherId);
      expect(activePenalty.reversedAt).toBeInstanceOf(Date);
      expect(activePenalty.reversalReason).toBe(createdReversals[0].reason);
      expect(activePenalty.save).toHaveBeenCalled();

      expect(notifMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            status: ExtensionRequestStatus.APPROVED,
            reviewNote: 'Approved via decision alias',
          }),
        }),
      );
      expect(auditMock.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            status: ExtensionRequestStatus.APPROVED,
            reviewNote: 'Approved via decision alias',
          }),
        }),
      );
    });
  });
});
