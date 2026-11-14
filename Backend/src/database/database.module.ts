import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongodb.uri'),
        // For transactions, MongoDB must run as a replica set
        // See README for local dev replica set setup
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    if (isProduction) {
      this.logger.log(
        'Production mode detected: skipping automatic index rebuild on bootstrap. Controlled index migration is managed via init:indexes.',
      );
      return;
    }

    const models = Object.values(this.connection.models);
    await Promise.all(models.map((model) => model.createIndexes()));
    this.logger.log(`Verified indexes for ${models.length} Mongoose models`);
  }
}
