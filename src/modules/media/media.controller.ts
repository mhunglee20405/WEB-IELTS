import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { AudioUploadIntentDto } from './dto/media.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Media & Audio Storage')
@Controller('media/audio')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':assetId/playback')
  @ApiOperation({ summary: 'Get signed playback stream URL for listening section audio' })
  @ApiParam({ name: 'assetId', description: 'Audio Asset ObjectId / key' })
  getPlayback(
    @Param('assetId') assetId: string,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.mediaService.getPlaybackUrl(assetId, actor);
  }

  @Post('upload-intent')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtain signed upload URL for teacher audio file (Max 50MB)' })
  createUploadIntent(
    @Body() dto: AudioUploadIntentDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.mediaService.createUploadIntent(dto, actor);
  }
}

