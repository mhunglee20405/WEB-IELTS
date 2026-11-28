import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AudioAsset, AudioAssetSchema } from 'src/database/schemas/audio-asset.schema';
import { ImageAsset, ImageAssetSchema } from 'src/database/schemas/image-asset.schema';
import { MediaController, MediaImagesController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AudioAsset.name, schema: AudioAssetSchema },
      { name: ImageAsset.name, schema: ImageAssetSchema },
    ]),
  ],
  controllers: [MediaController, MediaImagesController],
  providers: [MediaService],
  exports: [MediaService, MongooseModule],
})
export class MediaModule {}
