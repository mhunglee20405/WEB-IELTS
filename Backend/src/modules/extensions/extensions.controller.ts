import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ExtensionsService } from './extensions.service';
import { CreateExtensionRequestDto } from './dto/create-extension-request.dto';
import { ReviewExtensionRequestDto } from './dto/review-extension-request.dto';
import { ExtensionQueryDto } from './dto/extension-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, ExtensionRequestStatus } from 'src/database/schemas/enums';

@ApiTags('Extension Requests')
@Controller(['extension-requests', 'extensions'])
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ExtensionsController {
  constructor(private readonly extensionsService: ExtensionsService) {}

  @Post()
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary:
      'Submit deadline extension request (Max 3 per calendar month in Asia/Ho_Chi_Minh)',
  })
  create(
    @Body() dto: CreateExtensionRequestDto,
    @CurrentUser() student: UserDocument,
  ) {
    return this.extensionsService.create(dto, student);
  }

  @Get('quota')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Check remaining monthly extension request quota for authenticated student',
  })
  getQuota(@CurrentUser() student: UserDocument) {
    return this.extensionsService.getQuota(student);
  }

  @Get('mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'List own extension requests and review decisions',
  })
  findMine(
    @CurrentUser() student: UserDocument,
    @Query() query: ExtensionQueryDto,
  ) {
    return this.extensionsService.findMine(student, query);
  }

  @Post(':id/cancel')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a pending extension request',
  })
  @ApiParam({ name: 'id', description: 'ExtensionRequest ObjectId' })
  cancel(@Param('id') id: string, @CurrentUser() student: UserDocument) {
    return this.extensionsService.cancel(id, student);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'List pending extension requests' })
  findPending(
    @CurrentUser() actor: UserDocument,
    @Query() query: ExtensionQueryDto,
  ) {
    query.status = ExtensionRequestStatus.PENDING;
    return this.extensionsService.findAll(actor, query);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary: 'List extension requests with filters (Admin or course Teacher)',
  })
  findAll(
    @CurrentUser() actor: UserDocument,
    @Query() query: ExtensionQueryDto,
  ) {
    return this.extensionsService.findAll(actor, query);
  }

  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get extension request details',
  })
  @ApiParam({ name: 'id', description: 'ExtensionRequest ObjectId' })
  findOne(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.extensionsService.findById(id, actor);
  }

  @Post(':id/decision')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decide on extension request (alias for :id/review)' })
  decide(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() actor: UserDocument,
  ) {
    const reviewDto: ReviewExtensionRequestDto = {
      status: (dto.status || dto.decision || 'approved').toLowerCase(),
      reviewNote: dto.reviewNote || dto.note || dto.reason || '',
    };
    return this.extensionsService.review(id, reviewDto, actor);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary:
      'Approve or reject extension request (Approval atomically extends effective deadline)',
  })
  @ApiParam({ name: 'id', description: 'ExtensionRequest ObjectId' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewExtensionRequestDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.extensionsService.review(id, dto, actor);
  }
}

