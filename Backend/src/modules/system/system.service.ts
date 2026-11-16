import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ClientSession } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';

export interface SetupStatusResponse {
  isInitialized: boolean;
  adminCount: number;
  totalUsers: number;
  requiresSetupToken: boolean;
}

@Injectable()
export class SystemService implements OnModuleInit {
  private readonly logger = new Logger(SystemService.name);
  private readonly tokenFilePath = path.resolve(process.cwd(), '.bootstrap-token');

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const adminCount = await this.userModel.countDocuments({ role: UserRole.ADMIN }).exec();
      if (adminCount === 0) {
        this.ensureBootstrapToken();
      }
    } catch {
      // Database might still be connecting on bootstrap
    }
  }

  /**
   * Retrieves or generates a secure one-time bootstrap authorization token.
   * If SETUP_TOKEN is not in env, generates a random 32-char token and saves to .bootstrap-token.
   */
  public ensureBootstrapToken(): string {
    const configuredToken = this.configService.get<string>('SETUP_TOKEN');
    if (configuredToken && configuredToken.trim().length > 0) {
      return configuredToken.trim();
    }

    if (fs.existsSync(this.tokenFilePath)) {
      try {
        const token = fs.readFileSync(this.tokenFilePath, 'utf8').trim();
        if (token.length > 0) return token;
      } catch {
        // Fallback to regeneration
      }
    }

    const generatedToken = crypto.randomBytes(16).toString('hex');
    try {
      fs.writeFileSync(this.tokenFilePath, generatedToken, { mode: 0o600, encoding: 'utf8' });
      this.logger.warn(
        `🛡️ [SECURITY] Uninitialized system detected! Generated one-time bootstrap token at: ${this.tokenFilePath}`,
      );
    } catch (err: any) {
      this.logger.error(`Could not persist .bootstrap-token file: ${err.message}`);
    }
    return generatedToken;
  }

  /**
   * Check if system has already been initialized with an administrator.
   */
  async getSetupStatus(): Promise<SetupStatusResponse> {
    const [adminCount, totalUsers] = await Promise.all([
      this.userModel.countDocuments({ role: UserRole.ADMIN }).exec(),
      this.userModel.countDocuments({}).exec(),
    ]);

    return {
      isInitialized: adminCount > 0,
      adminCount,
      totalUsers,
      requiresSetupToken: true,
    };
  }

  /**
   * Atomically bootstrap the initial Administrator.
   * Permanently fails if an administrator already exists.
   */
  async bootstrapAdmin(
    dto: BootstrapAdminDto,
    headerToken?: string,
  ): Promise<{ success: boolean; message: string; user: Record<string, unknown> }> {
    // 1. Strict one-time bootstrap lock: check if ANY administrator already exists
    const adminCount = await this.userModel.countDocuments({ role: UserRole.ADMIN }).exec();
    if (adminCount > 0) {
      this.logger.warn(`Blocked bootstrap attempt: Administrator already exists in database.`);
      throw new ConflictException(
        'Hệ thống đã có quản trị viên. Chức năng khởi tạo ban đầu bị khóa vĩnh viễn vì lý do an toàn.',
      );
    }

    // 2. Mandatory one-time authorization guard on uninitialized system
    const expectedToken = this.ensureBootstrapToken();
    const providedToken = (headerToken || dto.setupToken || '').trim();

    if (!providedToken || providedToken !== expectedToken) {
      this.logger.warn(`Rejected unauthorized bootstrap attempt from anonymous user (Invalid or missing setupToken).`);
      throw new UnauthorizedException(
        'Mã ủy quyền khởi tạo (Setup Token) không hợp lệ hoặc không được cung cấp. Vui lòng lấy mã từ biến môi trường SETUP_TOKEN hoặc tệp .bootstrap-token trên máy chủ.',
      );
    }

    // 3. Strict one-time bootstrap transaction with concurrency guard
    let session: ClientSession | null = null;
    const db = this.userModel.db;
    const hasTransactions = typeof db.startSession === 'function';

    if (hasTransactions) {
      try {
        session = await db.startSession();
        session.startTransaction();
      } catch {
        session = null;
      }
    }

    try {
      const adminQuery = this.userModel.findOne({ role: UserRole.ADMIN });
      if (session) adminQuery.session(session);
      const existingAdmin = await adminQuery.exec();

      if (existingAdmin) {
        this.logger.warn(`Blocked bootstrap attempt: Administrator already exists in database.`);
        throw new ConflictException(
          'Hệ thống đã có quản trị viên. Chức năng khởi tạo ban đầu bị khóa vĩnh viễn vì lý do an toàn.',
        );
      }

      // 3. Normalize email and check uniqueness
      const normalizedEmail = dto.email.toLowerCase().trim();
      const emailQuery = this.userModel.findOne({ email: normalizedEmail });
      if (session) emailQuery.session(session);
      const existingEmail = await emailQuery.exec();

      if (existingEmail) {
        throw new ConflictException('Email này đã được sử dụng bởi một tài khoản khác trong hệ thống.');
      }

      // 4. Secure Argon2id password hash
      const hashedPassword = await argon2.hash(dto.password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });

      // 5. Persist initial Administrator
      const adminUser = new this.userModel({
        email: normalizedEmail,
        fullName: dto.fullName.trim(),
        passwordHash: hashedPassword,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        phone: dto.phone?.trim() || undefined,
      });

      if (session) {
        await adminUser.save({ session });
        await session.commitTransaction();
      } else {
        await adminUser.save();
      }

      this.logger.log(`Initial System Administrator successfully created: ${normalizedEmail} (ID: ${adminUser._id})`);

      // 6. Secure cleanup of temporary one-time bootstrap token file
      if (fs.existsSync(this.tokenFilePath)) {
        try {
          fs.unlinkSync(this.tokenFilePath);
          this.logger.log(`Temporary bootstrap token file removed after successful initialization.`);
        } catch {
          // Non-critical
        }
      }

      return {
        success: true,
        message: 'Khởi tạo Quản trị viên ban đầu thành công. Bạn có thể đăng nhập ngay.',
        user: {
          id: adminUser._id.toString(),
          email: adminUser.email,
          fullName: adminUser.fullName,
          role: adminUser.role,
          status: adminUser.status,
        },
      };
    } catch (err) {
      if (session && session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch {
          // Ignore
        }
      }
      throw err;
    } finally {
      if (session) {
        try {
          await session.endSession();
        } catch {
          // Ignore
        }
      }
    }
  }
}
