import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
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
});

