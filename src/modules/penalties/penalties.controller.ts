import {
  Controller,
  Get,
  Post,
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
import { PenaltiesService } from './penalties.service';
import { ReversePenaltyDto } from './dto/reverse-penalty.dto';
import { PenaltyQueryDto } from './dto/penalty-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Penalties')
@Controller('penalties')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class PenaltiesController {
  constructor(private readonly penaltiesService: PenaltiesService) {}

  @Get('mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'View own penalty points and transaction ledger (Student)',
  })
  getMine(
    @CurrentUser() student: UserDocument,
    @Query() query: PenaltyQueryDto,
  ) {
    return this.penaltiesService.getMine(student, query);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary: 'List penalty transactions for students in authorized courses (Admin/Teacher)',
  })
  findAll(
    @CurrentUser() actor: UserDocument,
    @Query() query: PenaltyQueryDto,
  ) {
    return this.penaltiesService.findAll(actor, query);
  }

  @Post(':id/reverse')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reverse an incorrectly issued penalty with an auditable compensating transaction (-1 pt)',
  })
  @ApiParam({ name: 'id', description: 'Original PenaltyTransaction ObjectId' })
  reverse(
    @Param('id') id: string,
    @Body() dto: ReversePenaltyDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.penaltiesService.reverse(id, dto, actor);
  }
}

