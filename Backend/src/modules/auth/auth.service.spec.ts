import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { EventEmitter } from 'events';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { User } from 'src/database/schemas/user.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';
import * as argon2 from 'argon2';

describe('AuthService', () => {
  let authService: AuthService;
  let userModel: any;
  let auditService: any;
  let mailService: any;
  let configService: any;

  const mockUser: any = {
    _id: { toHexString: () => '507f1f77bcf86cd799439011' },
    fullName: 'Test User',
    email: 'test@example.com',
    passwordHash: '',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    tokenVersion: 0,
    save: jest.fn().mockResolvedValue(true),
    toObject: () => mockUser,
  };

  beforeEach(async () => {
    // Pre-hash a known password
    mockUser.email = 'test@example.com';
    mockUser.fullName = 'Test User';
    mockUser.tokenVersion = 0;
    mockUser.passwordHash = await argon2.hash('password123', { type: argon2.argon2id });
    mockUser.save = jest.fn().mockResolvedValue(true);

    const mockUserModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser),
        }),
        exec: jest.fn().mockResolvedValue(mockUser),
      }),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockUser),
        }),
        exec: jest.fn().mockResolvedValue(mockUser),
      }),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(true),
    };

    const mockMailService = {
      renderTemplate: jest.fn((_key: string, payload: Record<string, any>) => ({
        subject: '[IELTS LMS] Yêu cầu đặt lại mật khẩu',
        html: `<p>${payload.resetToken}</p>`,
        text: `Token: ${payload.resetToken}`,
      })),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-msg-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock_access_token'),
          },
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, string> = {
                'jwt.accessSecret': 'test_access_secret_at_least_32_chars_long',
                'jwt.accessExpiresIn': '15m',
                'jwt.refreshSecret': 'test_refresh_secret_at_least_32_chars_long',
                'jwt.refreshExpiresIn': '7d',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userModel = module.get(getModelToken(User.name));
    auditService = module.get(AuditService);
    mailService = module.get(MailService);
    configService = module.get(ConfigService);
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      const user = await authService.validateUser('test@example.com', 'password123');
      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(
        authService.validateUser('nonexistent@example.com', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      await expect(
        authService.validateUser('test@example.com', 'wrongpassword'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is inactive', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      userModel.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(inactiveUser),
        }),
      });

      await expect(
        authService.validateUser('test@example.com', 'password123'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return token pair on valid login', async () => {
      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('expiresIn');
      expect(result.accessToken).toBe('mock_access_token');
    });
  });

  describe('refresh and logout with replay prevention', () => {
    it('should refresh token pair and rotate refresh token', async () => {
      const loginResult = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      const refreshResult = await authService.refresh(loginResult.refreshToken);
      expect(refreshResult).toBeDefined();
      expect(refreshResult.accessToken).toBe('mock_access_token');
      expect(refreshResult.refreshToken).not.toBe(loginResult.refreshToken);
    });

    it('should prevent replay: reusing an already-refreshed token throws UnauthorizedException', async () => {
      const loginResult = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      await authService.refresh(loginResult.refreshToken);

      // Attempting to reuse old refresh token must be rejected
      await expect(authService.refresh(loginResult.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should revoke token on logout so subsequent refresh fails', async () => {
      const loginResult = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      await authService.logout(loginResult.refreshToken);

      // Refreshing after logout must be rejected
      await expect(authService.refresh(loginResult.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject malformed or non-existent refresh tokens', async () => {
      await expect(authService.refresh('invalid.fake-token')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.refresh('')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changeEmail', () => {
    it('should successfully change email when password is valid and email is unused', async () => {
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // new email not in use
      });

      const result = await authService.changeEmail('507f1f77bcf86cd799439011', {
        newEmail: 'newadmin@example.com',
        currentPassword: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('newadmin@example.com');
      expect(mockUser.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_EMAIL_CHANGED' }),
      );
    });

    it('should reject email change when current password is wrong', async () => {
      await expect(
        authService.changeEmail('507f1f77bcf86cd799439011', {
          newEmail: 'newadmin@example.com',
          currentPassword: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when new email is identical to current email', async () => {
      await expect(
        authService.changeEmail('507f1f77bcf86cd799439011', {
          newEmail: 'test@example.com',
          currentPassword: 'password123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when new email is already in use by another account', async () => {
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'other_user_id', email: 'taken@example.com' }),
      });

      await expect(
        authService.changeEmail('507f1f77bcf86cd799439011', {
          newEmail: 'taken@example.com',
          currentPassword: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('should successfully change password when current password matches', async () => {
      const result = await authService.changePassword('507f1f77bcf86cd799439011', {
        currentPassword: 'password123',
        newPassword: 'BrandNewSecurePass@2026!',
      });

      expect(result.success).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_PASSWORD_CHANGED' }),
      );
    });

    it('should reject password change when current password is wrong', async () => {
      await expect(
        authService.changePassword('507f1f77bcf86cd799439011', {
          currentPassword: 'wrongpassword',
          newPassword: 'BrandNewSecurePass@2026!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject password reuse when new password equals current password', async () => {
      await expect(
        authService.changePassword('507f1f77bcf86cd799439011', {
          currentPassword: 'password123',
          newPassword: 'password123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeAllUserSessions (Redis)', () => {
    it('scans with keyPrefix, strips prefix before get/del, preserves other users tokens, and awaits pending deletes after end', async () => {
      const stream = new EventEmitter();
      let resolveDel!: () => void;
      let delCompleted = false;
      const delPromise = new Promise<number>((resolve) => {
        resolveDel = () => {
          delCompleted = true;
          resolve(1);
        };
      });

      const mockRedisClient: any = {
        scanStream: jest.fn().mockReturnValue(stream),
        get: jest.fn(async (key: string) => {
          if (key === 'auth:refresh:t1') {
            return JSON.stringify({ userId: 'user-1', tokenHash: 'h1', family: 'f1' });
          }
          if (key === 'auth:refresh:t2') {
            return JSON.stringify({ userId: 'user-2', tokenHash: 'h2', family: 'f2' });
          }
          return null;
        }),
        del: jest.fn().mockReturnValue(delPromise),
      };

      const redisModule: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: getModelToken(User.name), useValue: userModel },
          { provide: JwtService, useValue: { sign: jest.fn() } },
          { provide: AuditService, useValue: auditService },
          { provide: ConfigService, useValue: configService },
          { provide: 'AUTH_REDIS_CLIENT', useValue: mockRedisClient },
        ],
      }).compile();

      const redisAuthService = redisModule.get<AuthService>(AuthService);
      await redisAuthService.onModuleInit();

      const revokePromise = redisAuthService.revokeAllUserSessions('user-1');
      let revokeSettled = false;
      revokePromise.then(() => {
        revokeSettled = true;
      });

      stream.emit('data', [
        'ielts:customer:auth:refresh:t1',
        'ielts:customer:auth:refresh:t2',
      ]);
      stream.emit('end');

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      expect(revokeSettled).toBe(false);
      expect(delCompleted).toBe(false);

      resolveDel();
      await revokePromise;

      expect(delCompleted).toBe(true);
      expect(mockRedisClient.scanStream).toHaveBeenCalledWith({
        match: 'ielts:customer:auth:refresh:*',
        count: 100,
      });
      expect(mockRedisClient.get).toHaveBeenCalledWith('auth:refresh:t1');
      expect(mockRedisClient.get).toHaveBeenCalledWith('auth:refresh:t2');
      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
      expect(mockRedisClient.del).toHaveBeenCalledWith('auth:refresh:t1');
      expect(mockRedisClient.del).not.toHaveBeenCalledWith('auth:refresh:t2');
    });

    it('resolves cleanly when scanStream emits error', async () => {
      const stream = new EventEmitter();
      const mockRedisClient: any = {
        scanStream: jest.fn().mockReturnValue(stream),
        get: jest.fn(),
        del: jest.fn(),
      };

      const redisModule: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: getModelToken(User.name), useValue: userModel },
          { provide: JwtService, useValue: { sign: jest.fn() } },
          { provide: AuditService, useValue: auditService },
          { provide: ConfigService, useValue: configService },
          { provide: 'AUTH_REDIS_CLIENT', useValue: mockRedisClient },
        ],
      }).compile();

      const redisAuthService = redisModule.get<AuthService>(AuthService);
      await redisAuthService.onModuleInit();

      const revokePromise = redisAuthService.revokeAllUserSessions('user-1');
      stream.emit('error', new Error('Redis stream failure'));
      await expect(revokePromise).resolves.toBeUndefined();
    });
  });

  describe('forgotPassword and resetPassword', () => {
    it('renders password-reset email, sends it to active user with a valid token accepted by resetPassword', async () => {
      configService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, string> = {
          'jwt.accessSecret': 'test_access_secret_at_least_32_chars_long',
          'jwt.accessExpiresIn': '15m',
          'jwt.refreshSecret': 'test_refresh_secret_at_least_32_chars_long',
          'jwt.refreshExpiresIn': '7d',
          frontendUrl: 'https://lms.example.com/',
        };
        return config[key] ?? defaultValue;
      });

      const res = await authService.forgotPassword({ email: '  TEST@EXAMPLE.COM ' });

      expect(res.ok).toBe(true);
      expect(mailService.renderTemplate).toHaveBeenCalledWith(
        'password-reset',
        expect.objectContaining({
          fullName: 'Test User',
          expiresInMinutes: 15,
          resetToken: expect.stringMatching(/^[^.]+\.[^.]+$/),
          resetUrl: expect.stringContaining('https://lms.example.com/reset-password?token='),
        }),
      );

      const { resetToken } = mailService.renderTemplate.mock.calls[0][1];
      expect(mailService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: '[IELTS LMS] Yêu cầu đặt lại mật khẩu',
        html: expect.stringContaining(resetToken),
        text: expect.stringContaining(resetToken),
      });

      const resetRes = await authService.resetPassword({
        token: resetToken,
        newPassword: 'ResetPassword@2026!',
      });
      expect(resetRes.ok).toBe(true);
      expect(mockUser.save).toHaveBeenCalled();
      expect(await argon2.verify(mockUser.passwordHash, 'ResetPassword@2026!')).toBe(true);
      expect(mockUser.tokenVersion).toBe(1);
    });

    it('does not send email when user does not exist while returning non-enumerating response', async () => {
      userModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await authService.forgotPassword({ email: 'missing@example.com' });

      expect(res).toEqual({
        ok: true,
        message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
      });
      expect(mailService.renderTemplate).not.toHaveBeenCalled();
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('still returns non-enumerating ok response if sendMail fails', async () => {
      mailService.sendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const res = await authService.forgotPassword({ email: 'test@example.com' });

      expect(res).toEqual({
        ok: true,
        message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_PASSWORD_RESET_REQUESTED' }),
      );
    });
  });
});

