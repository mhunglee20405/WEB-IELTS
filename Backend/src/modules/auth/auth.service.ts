import {
  Injectable,
  UnauthorizedException,
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

  // In-memory fallback store for unit tests or when Redis is offline
  private readonly fallbackStore = new Map<string, { payload: string; expiresAt: number }>();

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Optional() @Inject('AUTH_REDIS_CLIENT') private injectedRedis?: Redis,
  ) {}

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

  async login(loginDto: LoginDto): Promise<TokenPair> {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    return this.generateTokenPair(user);
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

  private async generateTokenPair(user: UserDocument, existingFamily?: string): Promise<TokenPair> {
    const payload = {
      sub: (user._id as Types.ObjectId).toHexString(),
      email: user.email,
      role: user.role,
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
