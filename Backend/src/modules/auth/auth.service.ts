import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import { UserStatus } from 'src/database/schemas/enums';
import { LoginDto } from './dto/login.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface StoredRefreshToken {
  userId: string;
  tokenHash: string;
  family: string;
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private redisClient: Redis | null = null;
  private isRedisConnected = false;
  private readonly redisKeyPrefix: string;

  // In-memory fallback store for unit tests or when Redis is offline
  private readonly fallbackStore = new Map<string, { payload: string; expiresAt: number }>();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    @Optional() @Inject('AUTH_REDIS_CLIENT') private injectedRedis?: Redis,
    @Optional() private readonly mailService?: MailService,
  ) {
    this.redisKeyPrefix =
      this.configService.get<string>('redis.keyPrefix', 'ielts:customer:') ?? 'ielts:customer:';
  }

  async onModuleInit() {
    if (this.injectedRedis) {
      this.redisClient = this.injectedRedis;
      this.isRedisConnected = true;
      return;
    }

    // Attempt Redis connection
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '') || undefined;

    try {
      const client = new Redis({
        host,
        port,
        password,
        keyPrefix: this.redisKeyPrefix,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });

      client.on('error', (err) => {
        this.isRedisConnected = false;
      });

      await client.connect();
      this.redisClient = client;
      this.isRedisConnected = true;
      this.logger.log('AuthService: Redis connected for refresh token store');
    } catch (err: any) {
      this.isRedisConnected = false;
      this.logger.warn(
        `AuthService: Redis unavailable (${err?.message || err}). Falling back to memory store.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.redisClient && !this.injectedRedis) {
      try {
        await this.redisClient.quit();
      } catch {
        // ignore on shutdown
      }
    }
  }

  async validateUser(email: string, password: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ email: email.toLowerCase().trim() })
      .select('+passwordHash')
      .exec();

    // Prevent account enumeration: generic message on both missing user and invalid password
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is inactive or suspended');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async login(loginDto: LoginDto): Promise<TokenPair & { user?: any; tokens?: TokenPair }> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const tokens = await this.generateTokenPair(user);
    const userSummary = {
      id: (user._id as Types.ObjectId).toHexString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      roles: [user.role],
      status: user.status,
      phone: user.phone,
      timezone: 'Asia/Ho_Chi_Minh',
    };
    return {
      ...tokens,
      user: userSummary,
      tokens,
    };
  }

  /**
   * Refreshes token pair with atomic rotation and replay detection.
   * If token is already used or revoked, the atomic get-and-del returns null and rejects with 401.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let tokenId = '';
    let rawSecret = '';
    if (refreshToken.includes('.')) {
      const parts = refreshToken.split('.');
      tokenId = parts[0];
      rawSecret = parts.slice(1).join('.');
    } else {
      tokenId = refreshToken;
      rawSecret = refreshToken;
    }

    const key = `auth:refresh:${tokenId}`;

    // Atomically retrieve and delete token to prevent concurrent replay race conditions
    const rawPayload = await this.atomicGetAndDel(key);
    if (!rawPayload) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    let record: StoredRefreshToken;
    try {
      record = JSON.parse(rawPayload);
    } catch {
      throw new UnauthorizedException('Invalid refresh token record');
    }

    // Verify secret signature
    const isMatch = await argon2.verify(record.tokenHash, rawSecret);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.userModel
      .findOne({ _id: record.userId, status: UserStatus.ACTIVE })
      .exec();

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Rotate: issue a new token pair in the same token family
    return this.generateTokenPair(user, record.family);
  }

  /**
   * Revokes refresh token on logout (idempotent).
   */
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      return;
    }

    const tokenId = refreshToken.includes('.') ? refreshToken.split('.')[0] : refreshToken;
    const key = `auth:refresh:${tokenId}`;
    await this.deleteStoreKey(key);
  }

  /**
   * Revokes all active sessions/refresh tokens for a specific user.
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    // 1. In-memory store cleanup
    for (const [key, value] of this.fallbackStore.entries()) {
      try {
        const parsed = JSON.parse(value.payload);
        if (parsed.userId === userId) {
          this.fallbackStore.delete(key);
        }
      } catch {
        // ignore
      }
    }

    // 2. Redis store cleanup
    if (this.isRedisConnected && this.redisClient) {
      try {
        const stream = this.redisClient.scanStream({
          match: `${this.redisKeyPrefix}auth:refresh:*`,
          count: 100,
        });

        const pending: Promise<void>[] = [];
        await new Promise<void>((resolve) => {
          stream.on('data', (keys: string[]) => {
            if (!keys?.length) return;
            const work = (async () => {
              for (const rawKey of keys) {
                const key =
                  this.redisKeyPrefix && rawKey.startsWith(this.redisKeyPrefix)
                    ? rawKey.slice(this.redisKeyPrefix.length)
                    : rawKey;
                try {
                  const val = await this.redisClient?.get(key);
                  if (val) {
                    const parsed = JSON.parse(val);
                    if (parsed.userId === userId) {
                      await this.redisClient?.del(key);
                    }
                  }
                } catch {
                  // ignore malformed payload or transient per-key failure
                }
              }
            })();
            pending.push(work);
          });
          stream.on('end', async () => {
            try {
              await Promise.all(pending);
            } finally {
              resolve();
            }
          });
          stream.on('error', async (err: any) => {
            this.logger.warn(
              `Redis scanStream error revoking sessions for user ${userId}: ${err?.message || err}`,
            );
            try {
              await Promise.allSettled(pending);
            } finally {
              resolve();
            }
          });
        });
      } catch (err: any) {
        this.logger.warn(`Could not revoke Redis sessions for user ${userId}: ${err.message}`);
      }
    }
  }

  /**
   * Secure email change for authenticated user:
   * - Requires and verifies current account password
   * - Normalizes new email and verifies uniqueness in Atlas
   * - Increments tokenVersion to invalidate stale JWTs
   * - Revokes previous refresh tokens
   * - Generates new token pair with updated email
   * - Records sanitized audit log event
   */
  async changeEmail(
    userId: string,
    dto: ChangeEmailDto,
  ): Promise<{ success: boolean; message: string; user: Record<string, unknown>; tokens: TokenPair }> {
    const user = await this.userModel.findById(userId).select('+passwordHash').exec();
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa.');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không chính xác.');
    }

    const normalizedNewEmail = dto.newEmail.toLowerCase().trim();
    if (normalizedNewEmail === user.email) {
      throw new BadRequestException('Email mới không được trùng với email hiện tại.');
    }

    const emailInUse = await this.userModel.findOne({ email: normalizedNewEmail }).exec();
    if (emailInUse) {
      throw new ConflictException('Email này đã được sử dụng bởi một tài khoản khác trong hệ thống.');
    }

    const oldEmail = user.email;
    user.email = normalizedNewEmail;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await this.revokeAllUserSessions(userId);
    const newTokens = await this.generateTokenPair(user);

    await this.auditService.log({
      action: 'USER_EMAIL_CHANGED',
      entityType: 'User',
      entityId: user._id,
      actorId: user._id,
      metadata: {
        oldEmail,
        newEmail: normalizedNewEmail,
      },
    });

    const userSummary = {
      id: (user._id as Types.ObjectId).toHexString(),
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      roles: [user.role],
      status: user.status,
      phone: user.phone,
      timezone: 'Asia/Ho_Chi_Minh',
      createdAt: (user as any).createdAt,
      updatedAt: (user as any).updatedAt,
    };

    return {
      success: true,
      message: 'Cập nhật địa chỉ email thành công.',
      user: userSummary,
      tokens: newTokens,
    };
  }

  /**
   * Secure password change for authenticated user:
   * - Requires and verifies current password
   * - Rejects password reuse
   * - Hashes new password with Argon2id
   * - Increments tokenVersion (immediate invalidation of all existing access tokens)
   * - Revokes all refresh tokens in Redis
   * - Records sanitized audit log event
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findById(userId).select('+passwordHash').exec();
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị khóa.');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không chính xác.');
    }

    const isSamePassword = await argon2.verify(user.passwordHash, dto.newPassword);
    if (isSamePassword) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    user.passwordHash = newPasswordHash;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await this.revokeAllUserSessions(userId);

    await this.auditService.log({
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'User',
      entityId: user._id,
      actorId: user._id,
    });

    return {
      success: true,
      message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ ok: boolean; message: string }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email: normalizedEmail, status: UserStatus.ACTIVE })
      .exec();

    if (user) {
      const tokenId = uuidv4();
      const rawSecret = uuidv4();
      const tokenHash = await argon2.hash(rawSecret, { type: argon2.argon2id });
      const resetPayload = JSON.stringify({
        userId: (user._id as Types.ObjectId).toHexString(),
        tokenHash,
      });
      // 15 minutes TTL
      await this.setStoreKey(`auth:reset:${tokenId}`, resetPayload, 15 * 60);

      const resetToken = `${tokenId}.${rawSecret}`;
      const frontendUrl = (this.configService.get<string>('frontendUrl', '') || '').replace(
        /\/+$/,
        '',
      );
      const resetUrl = frontendUrl
        ? `${frontendUrl}/reset-password?token=${encodeURIComponent(resetToken)}`
        : '';

      if (this.mailService) {
        try {
          const rendered = this.mailService.renderTemplate('password-reset', {
            fullName: user.fullName,
            resetToken,
            resetUrl,
            expiresInMinutes: 15,
          });
          await this.mailService.sendMail({
            to: user.email,
            ...rendered,
          });
        } catch (err: any) {
          this.logger.warn(
            `Failed to send password reset email to ${user.email}: ${err?.message || err}`,
          );
        }
      }

      await this.auditService.log({
        action: 'USER_PASSWORD_RESET_REQUESTED',
        entityType: 'User',
        entityId: user._id,
        actorId: user._id,
      });
    }

    // Non-enumerating response: identical whether email exists or not
    return {
      ok: true,
      message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ ok: boolean; message: string }> {
    const rawToken = dto.token.trim();
    if (!rawToken.includes('.')) {
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }
    const [tokenId, ...secretParts] = rawToken.split('.');
    const rawSecret = secretParts.join('.');

    const rawPayload = await this.atomicGetAndDel(`auth:reset:${tokenId}`);
    if (!rawPayload) {
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    let parsed: { userId: string; tokenHash: string };
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ.');
    }

    const valid = await argon2.verify(parsed.tokenHash, rawSecret);
    if (!valid) {
      throw new BadRequestException('Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
    }

    const user = await this.userModel.findById(parsed.userId).exec();
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.');
    }

    user.passwordHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    await this.revokeAllUserSessions((user._id as Types.ObjectId).toHexString());
    await this.auditService.log({
      action: 'USER_PASSWORD_RESET_COMPLETED',
      entityType: 'User',
      entityId: user._id,
      actorId: user._id,
    });

    return {
      ok: true,
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
    };
  }

  private async generateTokenPair(user: UserDocument, existingFamily?: string): Promise<TokenPair> {
    const payload = {
      sub: (user._id as Types.ObjectId).toHexString(),
      email: user.email,
      role: user.role,
      tv: user.tokenVersion || 0,
    };

    const accessSecret = this.configService.get<string>('jwt.accessSecret');
    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn', '7d');

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: accessExpiresIn,
    });

    const tokenId = uuidv4();
    const rawSecret = uuidv4();
    const tokenHash = await argon2.hash(rawSecret, { type: argon2.argon2id });
    const family = existingFamily || uuidv4();
    const fullRefreshToken = `${tokenId}.${rawSecret}`;

    const ttlMs = this.parseDuration(refreshExpiresIn);
    const ttlSeconds = Math.max(1, Math.floor(ttlMs / 1000));

    const storedData: StoredRefreshToken = {
      userId: (user._id as Types.ObjectId).toHexString(),
      tokenHash,
      family,
    };

    await this.setStoreKey(`auth:refresh:${tokenId}`, JSON.stringify(storedData), ttlSeconds);

    return {
      accessToken,
      refreshToken: fullRefreshToken,
      expiresIn: accessExpiresIn,
    };
  }

  private async atomicGetAndDel(key: string): Promise<string | null> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        // Lua script for atomic get-and-delete
        const script = `
          local val = redis.call('GET', KEYS[1])
          if val then
            redis.call('DEL', KEYS[1])
          end
          return val
        `;
        const res = (await this.redisClient.eval(script, 1, key)) as string | null;
        return res;
      } catch (err) {
        this.logger.warn(`Redis eval failed, falling back to local store: ${err}`);
      }
    }

    const entry = this.fallbackStore.get(key);
    if (!entry) return null;
    this.fallbackStore.delete(key);
    if (entry.expiresAt < Date.now()) {
      return null;
    }
    return entry.payload;
  }

  private async setStoreKey(key: string, payload: string, ttlSeconds: number): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.set(key, payload, 'EX', ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn(`Redis set failed, saving to fallback store: ${err}`);
      }
    }
    this.fallbackStore.set(key, {
      payload,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private async deleteStoreKey(key: string): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
        return;
      } catch (err) {
        this.logger.warn(`Redis del failed, deleting from fallback store: ${err}`);
      }
    }
    this.fallbackStore.delete(key);
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * (multipliers[unit] || 1000);
  }
}
