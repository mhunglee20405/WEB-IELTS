import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TranslationsService } from './translations.service';
import { SubmitTranslationDto } from './dto/submit-translation.dto';
import { ReviewTranslationDto } from './dto/review-translation.dto';
import { TranslationQueryDto } from './dto/translation-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Translations')
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class TranslationsController {
  constructor(private readonly translationsService: TranslationsService) {}

  @Post('assignments/:id/translations')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Submit Vietnamese translation for a Reading passage',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitTranslationDto,
    @CurrentUser() student: UserDocument,
  ) {
    return this.translationsService.submit(id, dto, student);
  }

  @Get('assignments/:id/translations/mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary:
      'Get authenticated student translation submission and original English passage',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  findMine(@Param('id') id: string, @CurrentUser() student: UserDocument) {
    return this.translationsService.findMine(id, student);
  }

  @Get('assignments/:id/translations')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary: 'List student translation submissions for an assignment (Admin or course Teacher)',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  findAllForAssignment(
    @Param('id') id: string,
    @Query() query: TranslationQueryDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.findAllForAssignment(id, query, actor);
  }

  @Patch('translations/:id/review')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary: 'Review and leave comments on a student translation submission',
  })
  @ApiParam({ name: 'id', description: 'TranslationSubmission ObjectId' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewTranslationDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.review(id, dto, actor);
  }
}

