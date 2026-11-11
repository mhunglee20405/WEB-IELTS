import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { ExercisesService } from './exercises.service';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { ExerciseQueryDto } from './dto/exercise-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Exercises')
@Controller('exercises')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ExercisesController {
  constructor(private readonly exercisesService: ExercisesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Create exercise in bank (Admin or Teacher)' })
  create(@Body() dto: CreateExerciseDto, @CurrentUser() actor: UserDocument) {
    return this.exercisesService.create(dto, actor);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'List exercises with filtering & pagination (Admin/Teacher only)' })
  findAll(@CurrentUser() actor: UserDocument, @Query() query: ExerciseQueryDto) {
    return this.exercisesService.findAll(actor, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get exercise details (Teacher/Admin gets answer key; Student gets sanitized DTO only if assigned)',
  })
  @ApiParam({ name: 'id', description: 'Exercise ObjectId' })
  findOne(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.exercisesService.findById(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Update exercise (bumps version if already published)' })
  @ApiParam({ name: 'id', description: 'Exercise ObjectId' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateExerciseDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.exercisesService.update(id, dto, actor);
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish exercise to make it assignable' })
  @ApiParam({ name: 'id', description: 'Exercise ObjectId' })
  publish(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.exercisesService.publish(id, actor);
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive exercise' })
  @ApiParam({ name: 'id', description: 'Exercise ObjectId' })
  archivePost(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.exercisesService.archive(id, actor);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive exercise via DELETE' })
  @ApiParam({ name: 'id', description: 'Exercise ObjectId' })
  archiveDelete(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.exercisesService.archive(id, actor);
  }
}

