import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserStatusDto, UpdateOwnProfileDto } from './dto/update-user.dto';

export interface PaginatedUsers {
  items: Partial<UserDocument>[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(TeacherProfile.name)
    private teacherProfileModel: Model<TeacherProfileDocument>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel
      .findOne({ email: createUserDto.email.toLowerCase().trim() })
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

    const user = new this.userModel({
      ...createUserDto,
      role: effectiveRole,
      email: createUserDto.email.toLowerCase().trim(),
      passwordHash,
    });

    const savedUser = await user.save();

    // Create profile based on role
    if (effectiveRole === UserRole.STUDENT) {
      await new this.studentProfileModel({ userId: savedUser._id }).save();
    } else if (effectiveRole === UserRole.TEACHER) {
      await new this.teacherProfileModel({ userId: savedUser._id }).save();
    }

    return savedUser;
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

  sanitize(user: UserDocument): Partial<UserDocument> {
    const obj = user.toObject() as unknown as Record<string, unknown>;
    delete obj['passwordHash'];
    obj['id'] = (user._id as Types.ObjectId).toHexString();
    obj['roles'] = [obj['role']];
    obj['timezone'] = 'Asia/Ho_Chi_Minh';
    return obj as unknown as Partial<UserDocument>;
  }
}

