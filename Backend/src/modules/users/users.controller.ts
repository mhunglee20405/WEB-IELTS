import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserStatusDto, UpdateOwnProfileDto } from './dto/update-user.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';
import { Types } from 'mongoose';

@ApiTags('Users')
@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    return this.usersService.sanitize(user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'List all users (Admin: all; Teacher: students only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @CurrentUser() actor: UserDocument,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @Query('search') search?: string,
  ) {
    const effectiveRole = actor.role === UserRole.TEACHER ? UserRole.STUDENT : role;
    return this.usersService.findAll(page, limit, effectiveRole, status, search);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  async getMe(@CurrentUser() user: UserDocument) {
    return this.usersService.sanitize(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile (whitelisted fields: fullName, phone)' })
  async updateMe(@CurrentUser() user: UserDocument, @Body() updateDto: UpdateOwnProfileDto) {
    return this.usersService.updateOwnProfile(
      (user._id as Types.ObjectId).toHexString(),
      updateDto,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Get user by ID (Admin/Teacher)' })
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: UserDocument) {
    const user = await this.usersService.findById(id);
    if (
      currentUser.role === UserRole.TEACHER &&
      (currentUser._id as Types.ObjectId).toHexString() !== id
    ) {
      if (user.role !== UserRole.STUDENT) {
        throw new ForbiddenException('Teachers are not authorized to view non-student accounts');
      }
    }
    return this.usersService.sanitize(user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user (Admin only)' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    return this.usersService.update(id, updateDto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user status (Admin only)' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateUserStatusDto) {
    return this.usersService.updateStatus(id, dto);
  }
}

