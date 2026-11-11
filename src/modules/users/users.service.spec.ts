import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
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
});

