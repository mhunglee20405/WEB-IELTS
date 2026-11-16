import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { SystemService } from './system.service';
import { User } from 'src/database/schemas/user.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';

describe('SystemService', () => {
  let service: SystemService;
  let mockUserModel: any;
  let mockConfigService: any;

  beforeEach(async () => {
    const mockConstructor: any = jest.fn().mockImplementation((dto) => ({
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      ...dto,
      save: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        ...dto,
      }),
    }));

    mockConstructor.countDocuments = jest.fn();
    mockConstructor.findOne = jest.fn();
    mockConstructor.db = {
      startSession: jest.fn().mockRejectedValue(new Error('No replica set in mock')),
    };

    mockUserModel = mockConstructor;

    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SystemService>(SystemService);
  });

  describe('getSetupStatus', () => {
    it('returns isInitialized: false when 0 admins exist', async () => {
      mockUserModel.countDocuments
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(0) }) // admin count
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(0) }); // total users

      const status = await service.getSetupStatus();
      expect(status.isInitialized).toBe(false);
      expect(status.adminCount).toBe(0);
      expect(status.totalUsers).toBe(0);
      expect(status.requiresSetupToken).toBe(true);
    });

    it('returns isInitialized: true when at least 1 admin exists', async () => {
      mockUserModel.countDocuments
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(1) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(5) });

      const status = await service.getSetupStatus();
      expect(status.isInitialized).toBe(true);
      expect(status.adminCount).toBe(1);
      expect(status.totalUsers).toBe(5);
    });
  });

  describe('bootstrapAdmin', () => {
    it('successfully bootstraps initial admin with valid setup token', async () => {
      mockConfigService.get.mockReturnValue('SETUP_SECRET_123');
      mockUserModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      mockUserModel.findOne
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) }) // no existing admin
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) }); // email not taken

      const result = await service.bootstrapAdmin({
        email: 'Admin@Customer.com ',
        fullName: '  Initial Admin  ',
        password: 'SecurePass@2026!',
        setupToken: 'SETUP_SECRET_123',
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('admin@customer.com');
      expect(result.user.role).toBe(UserRole.ADMIN);
    });

    it('throws UnauthorizedException if setup token is missing or invalid', async () => {
      mockConfigService.get.mockReturnValue('SETUP_SECRET_123');
      mockUserModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      await expect(
        service.bootstrapAdmin({
          email: 'admin@customer.com',
          fullName: 'Admin',
          password: 'SecurePass@2026!',
          setupToken: 'WRONG_TOKEN',
        }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.bootstrapAdmin({
          email: 'admin@customer.com',
          fullName: 'Admin',
          password: 'SecurePass@2026!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ConflictException if an administrator already exists', async () => {
      mockConfigService.get.mockReturnValue('SETUP_SECRET_123');
      mockUserModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      await expect(
        service.bootstrapAdmin({
          email: 'admin2@customer.com',
          fullName: 'Second Admin',
          password: 'SecurePass@2026!',
          setupToken: 'SETUP_SECRET_123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if email is already taken by another user', async () => {
      mockConfigService.get.mockReturnValue('SETUP_SECRET_123');
      mockUserModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      mockUserModel.findOne
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) }) // no admin
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue({ _id: 'some-user-id', email: 'admin@customer.com' }) }); // email exists

      await expect(
        service.bootstrapAdmin({
          email: 'admin@customer.com',
          fullName: 'Admin',
          password: 'SecurePass@2026!',
          setupToken: 'SETUP_SECRET_123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
