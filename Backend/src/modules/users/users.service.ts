import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from 'src/database/schemas/student-profile.schema';
import {
  TeacherProfile,
  TeacherProfileDocument,
} from 'src/database/schemas/teacher-profile.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserStatusDto, UpdateOwnProfileDto } from './dto/update-user.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';

export interface PaginatedUsers {
  items: Partial<UserDocument>[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminResetPasswordResult {
  userId: string;
  email: string;
  temporaryPassword: string;
  mustChangePassword: boolean;
  revokedAllSessions: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(TeacherProfile.name)
    private teacherProfileModel: Model<TeacherProfileDocument>,
    @Optional() @InjectConnection() private readonly connection?: Connection,
    @Optional()
    @Inject(forwardRef(() => AuthService))
    private readonly authService?: AuthService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private async runInTransaction<T>(work: (session?: any) => Promise<T>): Promise<T> {
    if (typeof this.connection?.startSession !== 'function') {
      return await work(undefined);
    }

    const session = await this.connection.startSession();
    try {
      if (typeof session?.withTransaction === 'function') {
        let result!: T;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      }
      return await work(session);
    } finally {
      if (typeof session?.endSession === 'function') {
        await session.endSession();
      }
    }
  }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const normalizedEmail = createUserDto.email.toLowerCase().trim();
    const existing = await this.userModel
      .findOne({ email: normalizedEmail })
      .exec();

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(createUserDto.password, {
      type: argon2.argon2id,
    });

    const effectiveRole =
      createUserDto.role ||
      (createUserDto.roles && createUserDto.roles[0]) ||
      UserRole.STUDENT;

    try {
      return await this.runInTransaction(async (session) => {
        const saveOptions = session ? { session } : undefined;
        const user = new this.userModel({
          ...createUserDto,
          role: effectiveRole,
          email: normalizedEmail,
          passwordHash,
        });

        const savedUser = await user.save(saveOptions);

        // Create profile based on role
        if (effectiveRole === UserRole.STUDENT) {
          await new this.studentProfileModel({ userId: savedUser._id }).save(saveOptions);
        } else if (effectiveRole === UserRole.TEACHER) {
          await new this.teacherProfileModel({ userId: savedUser._id }).save(saveOptions);
        }

        return savedUser;
      });
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException('Email already exists');
      }
      throw err;
    }
  }

  async findAll(
    page = 1,
    limit = 20,
    role?: UserRole,
    status?: UserStatus,
    search?: string,
  ): Promise<PaginatedUsers> {
    const filter: Record<string, unknown> = {};
    if (role) filter['role'] = role;
    if (status) filter['status'] = status;
    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter['$or'] = [
        { fullName: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-passwordHash')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    const sanitizedItems = items.map((u) => {
      const obj = u.toObject() as unknown as Record<string, unknown>;
      delete obj['passwordHash'];
      obj['id'] = (u._id as Types.ObjectId).toHexString();
      obj['roles'] = [obj['role']];
      return obj;
    });

    return { items: sanitizedItems as any, total, page, limit };
  }

  async findById(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.userModel.findById(id).select('-passwordHash').exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async update(id: string, updateDto: UpdateUserDto): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }
    const updatePayload: Record<string, unknown> = { ...updateDto };
    const nextRole = updateDto.role || (updateDto.roles && updateDto.roles[0]);
    if (nextRole) {
      updatePayload.role = nextRole;
    }
    delete updatePayload.roles;

    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateStatus(id: string, dto: UpdateUserStatusDto): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: { status: dto.status } }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateOwnProfile(id: string, dto: UpdateOwnProfileDto): Promise<Partial<UserDocument>> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('User not found');
    }
    const updatePayload: Record<string, unknown> = {};
    if (dto.fullName !== undefined) {
      updatePayload.fullName = dto.fullName.trim();
    }
    if (dto.phone !== undefined) {
      updatePayload.phone = dto.phone.trim() || undefined;
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .select('-passwordHash')
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.sanitize(user);
  }

  generateTemporaryPassword(): string {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += charset[randomInt(0, charset.length)];
    }
    return `IELTS-${suffix}`;
  }

  async adminResetStudentPassword(
    targetUserId: string,
    dto: AdminResetPasswordDto = {},
    actor?: UserDocument,
  ): Promise<AdminResetPasswordResult> {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid user ID');
    }

    const user = await this.userModel.findById(targetUserId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException({
        code: 'ADMIN_RESET_STUDENT_ONLY',
        message: 'Chỉ được cấp lại mật khẩu trực tiếp cho tài khoản học viên.',
      });
    }

    let temporaryPassword: string;
    if (dto?.newPassword !== undefined && dto?.newPassword !== null) {
      const trimmed = typeof dto.newPassword === 'string' ? dto.newPassword.trim() : '';
      if (trimmed.length < 8) {
        throw new BadRequestException('Mật khẩu mới phải có ít nhất 8 ký tự.');
      }
      if (trimmed.length > 128) {
        throw new BadRequestException('Mật khẩu mới không được vượt quá 128 ký tự.');
      }
      temporaryPassword = trimmed;
    } else {
      temporaryPassword = this.generateTemporaryPassword();
    }

    user.passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });
    user.mustChangePassword = dto?.requirePasswordChange ?? true;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    const userId =
      typeof (user._id as Types.ObjectId | undefined)?.toHexString === 'function'
        ? (user._id as Types.ObjectId).toHexString()
        : String(user._id);

    let revokedAllSessions = false;
    if (this.authService) {
      await this.authService.revokeAllUserSessions(userId);
      revokedAllSessions = true;
    }

    await this.auditService?.log({
      action: 'ADMIN_RESET_STUDENT_PASSWORD',
      entityType: 'User',
      entityId: user._id as Types.ObjectId,
      actorId: (actor?._id ?? (actor as { id?: Types.ObjectId | string } | undefined)?.id) as
        | Types.ObjectId
        | string
        | undefined,
      metadata: {
        targetRole: user.role,
        mustChangePassword: user.mustChangePassword,
        reason: dto?.reason?.trim() || undefined,
      },
    });

    return {
      userId,
      email: user.email,
      temporaryPassword,
      mustChangePassword: user.mustChangePassword,
      revokedAllSessions,
    };
  }

  sanitize(user: UserDocument): Partial<UserDocument> {
    const obj = user.toObject() as unknown as Record<string, unknown>;
    delete obj['passwordHash'];
    obj['id'] = (user._id as Types.ObjectId).toHexString();
    obj['roles'] = [obj['role']];
    obj['timezone'] = 'Asia/Ho_Chi_Minh';
    obj['mustChangePassword'] = Boolean(user.mustChangePassword);
    return obj as unknown as Partial<UserDocument>;
  }
}

