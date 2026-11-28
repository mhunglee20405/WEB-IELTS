import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import {
  AudioUploadCompleteDto,
  AudioUploadIntentDto,
  ImageUploadIntentDto,
} from './dto/media.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

function extractRequestOrigin(req: any): string | undefined {
  const rawHost =
    req?.headers?.['x-forwarded-host'] ||
    req?.headers?.host ||
    (typeof req?.get === 'function' ? req.get('host') : undefined);
  if (!rawHost) return undefined;
  const host = String(rawHost).split(',')[0].trim();
  const rawProto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http';
  const proto = String(rawProto).split(',')[0].trim();
  return `${proto}://${host}`;
}

@ApiTags('Media & Audio Storage')
@Controller('media/audio')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':assetId/playback')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get signed playback stream URL for listening section audio' })
  @ApiParam({ name: 'assetId', description: 'Audio Asset ObjectId / key' })
  getPlayback(
    @Param('assetId') assetId: string,
    @CurrentUser() actor: UserDocument,
    @Req() req: any,
  ) {
    return this.mediaService.getPlaybackUrl(assetId, actor, extractRequestOrigin(req));
  }

  @Post('upload-intent')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtain signed upload URL for teacher audio file (Max 50MB)' })
  createUploadIntent(
    @Body() dto: AudioUploadIntentDto,
    @CurrentUser() actor: UserDocument,
    @Req() req: any,
  ) {
    return this.mediaService.createUploadIntent(dto, actor, extractRequestOrigin(req));
  }

  @Post('upload-init')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtain signed upload URL (alias for upload-intent)' })
  uploadInit(
    @Body() dto: AudioUploadIntentDto,
    @CurrentUser() actor: UserDocument,
    @Req() req: any,
  ) {
    return this.mediaService.createUploadIntent(dto, actor, extractRequestOrigin(req));
  }

  @Post('upload-complete')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acknowledge audio upload complete and attach metadata' })
  uploadComplete(
    @Body() dto: AudioUploadCompleteDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.mediaService.completeUpload(dto, actor);
  }

  @Put('upload/:filename')
  @ApiOperation({ summary: 'Upload raw audio binary file directly to GridFS/disk storage' })
  uploadFile(
    @Param('filename') filename: string,
    @Req() req: any,
  ) {
    return this.mediaService.handleBinaryUpload(filename, req, extractRequestOrigin(req));
  }

  @Get('stream/:filename')
  @ApiOperation({ summary: 'Stream audio file with HTTP Range support' })
  streamAudio(
    @Param('filename') filename: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    return this.mediaService.streamAudio(filename, req, res);
  }
}

@ApiTags('Media & Image Storage')
@Controller('media/images')
export class MediaImagesController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload-intent')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtain signed upload URL for exam diagram/map/chart image (Max 10MB)' })
  createImageUploadIntent(
    @Body() dto: ImageUploadIntentDto,
    @CurrentUser() actor: UserDocument,
    @Req() req: any,
  ) {
    return this.mediaService.createImageUploadIntent(dto, actor, extractRequestOrigin(req));
  }

  @Put('upload/:filename')
  @ApiOperation({ summary: 'Upload raw image binary file directly to GridFS/disk storage' })
  uploadImageFile(
    @Param('filename') filename: string,
    @Req() req: any,
  ) {
    return this.mediaService.handleImageBinaryUpload(filename, req, extractRequestOrigin(req));
  }

  @Get('stream/:filename')
  @ApiOperation({ summary: 'Serve uploaded exam diagram/map/chart image' })
  streamImage(
    @Param('filename') filename: string,
    @Res() res: any,
  ) {
    return this.mediaService.streamImage(filename, res);
  }
}
