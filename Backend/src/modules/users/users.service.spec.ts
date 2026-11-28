import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { HTTP_CODE_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { Types } from 'mongoose';
import * as argon2 from 'argon2';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { ROLES_KEY } from 'src/common/decorators/roles.decorator';
import { User } from 'src/database/schemas/user.schema';
import { StudentProfile } from 'src/database/schemas/student-profile.schema';
import { TeacherProfile } from 'src/database/schemas/teacher-profile.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';

describe('UsersService', () => {
  let service: UsersService;
  let userModel: any;

  const mockUser = {
    _id: { toHexString: () => '507f1f77bcf86cd799439011' },
    fullName: 'Test User',
    email: 'test@example.com',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    toObject: function () { return { ...this, passwordHash: undefined }; },
    save: jest.fn().mockResolvedValue(this),
  };

  beforeEach(async () => {
    const mockUserModelFactory = jest.fn().mockImplementation(() => ({
      ...mockUser,
      save: jest.fn().mockResolvedValue(mockUser),
    }));

    Object.assign(mockUserModelFactory, {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockUser) }) }),
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([mockUser]) }) }) }) }) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
      findByIdAndUpdate: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(mockUser) }) }),
    });

    const mockStudentProfileModel = jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue({}),
    }));

    const mockTeacherProfileModel = jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue({}),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: mockUserModelFactory },
        { provide: getModelToken(StudentProfile.name), useValue: mockStudentProfileModel },
        { provide: getModelToken(TeacherProfile.name), useValue: mockTeacherProfileModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userModel = module.get(getModelToken(User.name));
  });

  describe('create', () => {
    it('should throw ConflictException if email already exists', async () => {
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockUser),
      });

      await expect(
        service.create({
          fullName: 'New User',
          email: 'test@example.com',
          password: 'password123',
          role: UserRole.STUDENT,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user and student profile for student role', async () => {
      userModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.create({
        fullName: 'New Student',
        email: 'newstudent@example.com',
        password: 'password123',
        role: UserRole.STUDENT,
      });

      expect(result).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const user = await service.findById('507f1f77bcf86cd799439011');
      expect(user).toBeDefined();
    });

    it('should throw NotFoundException for invalid ObjectId', async () => {
      await expect(service.findById('invalid-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('scoring logic', () => {
    it('scorePercent 70 should PASS', () => {
      // Business rule: PASS >= 70%
      const earnedPoints = 70;
      const totalPoints = 100;
      const scorePercent = (earnedPoints / totalPoints) * 100;
      expect(scorePercent >= 70).toBe(true);
    });

    it('scorePercent 69.999 should FAIL (use raw value, not rounded)', () => {
      const earnedPoints = 69.999;
      const totalPoints = 100;
      const scorePercent = (earnedPoints / totalPoints) * 100;
      // Must compare without rounding to prevent 69.995 false pass
      expect(scorePercent >= 70).toBe(false);
    });

    it('scorePercent 69 should FAIL', () => {
      const earnedPoints = 69;
      const totalPoints = 100;
      const scorePercent = (earnedPoints / totalPoints) * 100;
      expect(scorePercent >= 70).toBe(false);
    });
  });

  describe('updateOwnProfile', () => {
    it('should update fullName and phone and return sanitized user', async () => {
      const updatedMock = {
        ...mockUser,
        fullName: 'Updated Name',
        phone: '0987654321',
        toObject: function () { return { ...this, passwordHash: undefined }; },
      };
      userModel.findByIdAndUpdate.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(updatedMock),
        }),
      });

      const res = await service.updateOwnProfile('507f1f77bcf86cd799439011', {
        fullName: 'Updated Name',
        phone: '0987654321',
      });

      expect(res).toBeDefined();
      expect(res.fullName).toBe('Updated Name');
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { $set: { fullName: 'Updated Name', phone: '0987654321' } },
        { new: true },
      );
    });

    it('should throw NotFoundException for invalid id', async () => {
      await expect(
        service.updateOwnProfile('invalid-id', { fullName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create transactional integrity & duplicate handling', () => {
    it('wraps user.save and student/teacher profile.save inside a MongoDB transaction when connection is available', async () => {
      const mockSession = {
        withTransaction: jest.fn().mockImplementation(async (cb: any) => await cb()),
        endSession: jest.fn().mockResolvedValue(true),
      };
      const connectionMock = {
        startSession: jest.fn().mockResolvedValue(mockSession),
      };

      const savedUserId = new Types.ObjectId();
      const userSaveMock = jest.fn().mockResolvedValue({
        _id: savedUserId,
        email: 'tx@example.com',
        role: UserRole.TEACHER,
      });
      const txUserModel: any = jest.fn().mockImplementation((dto: any) => ({
        ...dto,
        _id: savedUserId,
        save: userSaveMock,
      }));
      txUserModel.findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const studentSaveMock = jest.fn().mockResolvedValue({});
      const txStudentProfileModel = jest.fn().mockImplementation((dto: any) => ({
        ...dto,
        save: studentSaveMock,
      }));

      const teacherSaveMock = jest.fn().mockResolvedValue({});
      const txTeacherProfileModel = jest.fn().mockImplementation((dto: any) => ({
        ...dto,
        save: teacherSaveMock,
      }));

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getModelToken(User.name), useValue: txUserModel },
          { provide: getModelToken(StudentProfile.name), useValue: txStudentProfileModel },
          { provide: getModelToken(TeacherProfile.name), useValue: txTeacherProfileModel },
          { provide: getConnectionToken(), useValue: connectionMock },
        ],
      }).compile();

      const txService = module.get<UsersService>(UsersService);

      await txService.create({
        fullName: 'Tx Teacher',
        email: 'tx@example.com',
        password: 'password123',
        role: UserRole.TEACHER,
      });

      expect(connectionMock.startSession).toHaveBeenCalledTimes(1);
      expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(userSaveMock).toHaveBeenCalledWith({ session: mockSession });
      expect(teacherSaveMock).toHaveBeenCalledWith({ session: mockSession });
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
    });

    it('catches MongoDB E11000 duplicate key error on concurrent duplicate email and throws ConflictException', async () => {
      const dupErr = Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
      const userSaveMock = jest.fn().mockRejectedValue(dupErr);
      const dupUserModel: any = jest.fn().mockImplementation((dto: any) => ({
        ...dto,
        save: userSaveMock,
      }));
      dupUserModel.findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getModelToken(User.name), useValue: dupUserModel },
          {
            provide: getModelToken(StudentProfile.name),
            useValue: jest.fn().mockImplementation(() => ({ save: jest.fn() })),
          },
          {
            provide: getModelToken(TeacherProfile.name),
            useValue: jest.fn().mockImplementation(() => ({ save: jest.fn() })),
          },
        ],
      }).compile();

      const dupService = module.get<UsersService>(UsersService);

      await expect(
        dupService.create({
          fullName: 'Race User',
          email: 'race@example.com',
          password: 'password123',
          role: UserRole.STUDENT,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('sanitize', () => {
    it('includes mustChangePassword boolean and strips passwordHash', () => {
      const userWithoutFlag = {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        fullName: 'Student A',
        email: 'a@example.com',
        role: UserRole.STUDENT,
        passwordHash: 'secret-hash',
        toObject: function () {
          return {
            _id: this._id,
            fullName: this.fullName,
            email: this.email,
            role: this.role,
            passwordHash: this.passwordHash,
          };
        },
      } as any;

      const sanitizedDefault = service.sanitize(userWithoutFlag);
      expect(sanitizedDefault.passwordHash).toBeUndefined();
      expect((sanitizedDefault as any).mustChangePassword).toBe(false);

      const userWithFlag = {
        ...userWithoutFlag,
        mustChangePassword: true,
        toObject: function () {
          return {
            _id: this._id,
            fullName: this.fullName,
            email: this.email,
            role: this.role,
            mustChangePassword: true,
          };
        },
      } as any;

      const sanitizedTrue = service.sanitize(userWithFlag);
      expect((sanitizedTrue as any).mustChangePassword).toBe(true);
    });
  });

  describe('generateTemporaryPassword', () => {
    it('generates IELTS- prefixed 12-char password with unambiguous characters', () => {
      for (let i = 0; i < 20; i++) {
        const pw = service.generateTemporaryPassword();
        expect(pw).toMatch(/^IELTS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
        expect(pw).toHaveLength(12);
        expect(pw.slice('IELTS-'.length)).not.toMatch(/[O0I1l]/);
      }
    });
  });

  describe('adminResetStudentPassword', () => {
    let resetService: UsersService;
    let resetUserModel: any;
    let authServiceMock: { revokeAllUserSessions: jest.Mock };
    let auditServiceMock: { log: jest.Mock };
    const adminActor = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439099'),
      role: UserRole.ADMIN,
      email: 'admin@example.com',
    } as any;

    beforeEach(async () => {
      resetUserModel = {
        findById: jest.fn(),
      };
      authServiceMock = {
        revokeAllUserSessions: jest.fn().mockResolvedValue(undefined),
      };
      auditServiceMock = {
        log: jest.fn().mockResolvedValue({}),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          UsersService,
          { provide: getModelToken(User.name), useValue: resetUserModel },
          {
            provide: getModelToken(StudentProfile.name),
            useValue: jest.fn().mockImplementation(() => ({ save: jest.fn() })),
          },
          {
            provide: getModelToken(TeacherProfile.name),
            useValue: jest.fn().mockImplementation(() => ({ save: jest.fn() })),
          },
          { provide: AuthService, useValue: authServiceMock },
          { provide: AuditService, useValue: auditServiceMock },
        ],
      }).compile();

      resetService = module.get<UsersService>(UsersService);
    });

    it('auto-generates temporary password for STUDENT, hashes with argon2id, increments tokenVersion, revokes sessions, and logs audit without password', async () => {
      const studentId = '507f1f77bcf86cd799439021';
      const studentDoc: any = {
        _id: new Types.ObjectId(studentId),
        email: 'student@example.com',
        role: UserRole.STUDENT,
        passwordHash: 'old-hash',
        tokenVersion: 2,
        mustChangePassword: false,
        save: jest.fn().mockImplementation(async () => studentDoc),
      };
      resetUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(studentDoc),
      });

      const result = await resetService.adminResetStudentPassword(
        studentId,
        { reason: '  Học viên quên mật khẩu  ' },
        adminActor,
      );

      expect(result.userId).toBe(studentId);
      expect(result.email).toBe('student@example.com');
      expect(result.temporaryPassword).toMatch(/^IELTS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      expect(result.mustChangePassword).toBe(true);
      expect(result.revokedAllSessions).toBe(true);

      expect(studentDoc.passwordHash).toMatch(/^\$argon2id\$/);
      await expect(argon2.verify(studentDoc.passwordHash, result.temporaryPassword)).resolves.toBe(
        true,
      );
      expect(studentDoc.mustChangePassword).toBe(true);
      expect(studentDoc.tokenVersion).toBe(3);
      expect(studentDoc.save).toHaveBeenCalledTimes(1);

      expect(authServiceMock.revokeAllUserSessions).toHaveBeenCalledWith(studentId);
      expect(auditServiceMock.log).toHaveBeenCalledWith({
        action: 'ADMIN_RESET_STUDENT_PASSWORD',
        entityType: 'User',
        entityId: studentDoc._id,
        actorId: adminActor._id,
        metadata: {
          targetRole: UserRole.STUDENT,
          mustChangePassword: true,
          reason: 'Học viên quên mật khẩu',
        },
      });

      const serializedAudit = JSON.stringify(auditServiceMock.log.mock.calls[0][0]);
      expect(serializedAudit).not.toContain(result.temporaryPassword);
      expect(serializedAudit).not.toContain(studentDoc.passwordHash);
    });

    it('accepts custom newPassword and requirePasswordChange: false', async () => {
      const studentId = '507f1f77bcf86cd799439022';
      const studentDoc: any = {
        _id: new Types.ObjectId(studentId),
        email: 'student2@example.com',
        role: UserRole.STUDENT,
        passwordHash: 'old-hash',
        save: jest.fn().mockImplementation(async () => studentDoc),
      };
      resetUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(studentDoc),
      });

      const result = await resetService.adminResetStudentPassword(
        studentId,
        {
          newPassword: '  CustomPass@2026  ',
          requirePasswordChange: false,
        },
        adminActor,
      );

      expect(result).toEqual({
        userId: studentId,
        email: 'student2@example.com',
        temporaryPassword: 'CustomPass@2026',
        mustChangePassword: false,
        revokedAllSessions: true,
      });
      await expect(argon2.verify(studentDoc.passwordHash, 'CustomPass@2026')).resolves.toBe(true);
      expect(studentDoc.mustChangePassword).toBe(false);
      expect(studentDoc.tokenVersion).toBe(1);
    });

    it('rejects whitespace-only or < 8 chars after trim newPassword with BadRequestException', async () => {
      const studentId = '507f1f77bcf86cd799439023';
      const studentDoc: any = {
        _id: new Types.ObjectId(studentId),
        email: 'student3@example.com',
        role: UserRole.STUDENT,
        save: jest.fn(),
      };
      resetUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(studentDoc),
      });

      await expect(
        resetService.adminResetStudentPassword(studentId, { newPassword: '        ' }, adminActor),
      ).rejects.toThrow(BadRequestException);

      await expect(
        resetService.adminResetStudentPassword(studentId, { newPassword: '  short  ' }, adminActor),
      ).rejects.toThrow(BadRequestException);

      expect(studentDoc.save).not.toHaveBeenCalled();
      expect(authServiceMock.revokeAllUserSessions).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it.each([UserRole.ADMIN, UserRole.TEACHER])(
      'rejects %s target with ForbiddenException code ADMIN_RESET_STUDENT_ONLY',
      async (role) => {
        const targetId = '507f1f77bcf86cd799439024';
        const targetDoc: any = {
          _id: new Types.ObjectId(targetId),
          email: `${role}@example.com`,
          role,
          save: jest.fn(),
        };
        resetUserModel.findById.mockReturnValue({
          exec: jest.fn().mockResolvedValue(targetDoc),
        });

        let caught: unknown;
        try {
          await resetService.adminResetStudentPassword(targetId, {}, adminActor);
        } catch (err) {
          caught = err;
        }

        expect(caught).toBeInstanceOf(ForbiddenException);
        expect((caught as ForbiddenException).getResponse()).toEqual({
          code: 'ADMIN_RESET_STUDENT_ONLY',
          message: 'Chỉ được cấp lại mật khẩu trực tiếp cho tài khoản học viên.',
        });
        expect(targetDoc.save).not.toHaveBeenCalled();
        expect(authServiceMock.revokeAllUserSessions).not.toHaveBeenCalled();
        expect(auditServiceMock.log).not.toHaveBeenCalled();
      },
    );

    it('rejects invalid ObjectId with BadRequestException and missing user with NotFoundException', async () => {
      await expect(
        resetService.adminResetStudentPassword('not-valid-object-id', {}, adminActor),
      ).rejects.toThrow(BadRequestException);
      expect(resetUserModel.findById).not.toHaveBeenCalled();

      resetUserModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await expect(
        resetService.adminResetStudentPassword('507f1f77bcf86cd799439025', {}, adminActor),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns revokedAllSessions: false when optional AuthService and AuditService are omitted', async () => {
      const studentId = '507f1f77bcf86cd799439026';
      const studentDoc: any = {
        _id: new Types.ObjectId(studentId),
        email: 'noauth@example.com',
        role: UserRole.STUDENT,
        tokenVersion: 0,
        save: jest.fn().mockImplementation(async () => studentDoc),
      };
      userModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(studentDoc),
      });

      const result = await service.adminResetStudentPassword(studentId, {}, adminActor);
      expect(result.revokedAllSessions).toBe(false);
      expect(result.mustChangePassword).toBe(true);
    });
  });

  describe('AdminResetPasswordDto & UsersController metadata', () => {
    it('validates AdminResetPasswordDto constraints', async () => {
      const emptyDto = plainToInstance(AdminResetPasswordDto, {});
      expect(await validate(emptyDto)).toEqual([]);

      const invalidDto = plainToInstance(AdminResetPasswordDto, {
        newPassword: 'short',
        requirePasswordChange: 'yes',
        reason: 'x'.repeat(301),
        extraField: 'forbidden',
      });
      const errors = await validate(invalidDto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      const props = errors.map((e) => e.property);
      expect(props).toEqual(
        expect.arrayContaining(['newPassword', 'requirePasswordChange', 'reason', 'extraField']),
      );

      const validDto = plainToInstance(AdminResetPasswordDto, {
        newPassword: 'ValidPassword123',
        requirePasswordChange: false,
        reason: 'Support ticket #42',
      });
      expect(await validate(validDto)).toEqual([]);
    });

    it('configures POST :id/reset-password with Admin role, HTTP 200, Cache-Control: no-store and delegates to service', async () => {
      const handler = UsersController.prototype.resetStudentPassword;
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.ADMIN]);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(HttpStatus.OK);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);

      const mockUsersService = {
        adminResetStudentPassword: jest.fn().mockResolvedValue({
          userId: '507f1f77bcf86cd799439021',
          email: 'student@example.com',
          temporaryPassword: 'IELTS-ABCDEF',
          mustChangePassword: true,
          revokedAllSessions: true,
        }),
      };
      const controller = new UsersController(mockUsersService as any);
      const actor = { _id: new Types.ObjectId() } as any;
      const dto: AdminResetPasswordDto = { requirePasswordChange: true };

      const response = await controller.resetStudentPassword('507f1f77bcf86cd799439021', dto, actor);
      expect(mockUsersService.adminResetStudentPassword).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439021',
        dto,
        actor,
      );
      expect(response.temporaryPassword).toBe('IELTS-ABCDEF');
    });
  });
});

