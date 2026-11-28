import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
import { applyDnsServersOverride } from './dns-resolver';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dnsServers = configService.get<string>('mongodb.dnsServers') || process.env.MONGODB_DNS_SERVERS;
        if (dnsServers) {
          applyDnsServersOverride(dnsServers);
        }

        const uri = configService.get<string>('mongodb.uri') || '';
        const nodeEnv = (configService.get<string>('nodeEnv') || process.env.NODE_ENV || 'development').toLowerCase();
        const isTestEnv = nodeEnv === 'test' || process.env.JEST_WORKER_ID !== undefined;

        const dbMatch = uri.match(/\/([^/?]+)(\?|$)/);
        const dbName = dbMatch ? dbMatch[1].toLowerCase() : '';

        // 🛡️ Strict environment guard: automated test suites must NEVER target the customer database
        if (isTestEnv && (dbName === 'ielts_lms_customer' || dbName.includes('customer') || dbName.includes('prod'))) {
          throw new Error(
            `[FATAL ENVIRONMENT GUARD] Automated test execution is strictly forbidden against customer or production database "${dbName}". Automated tests must run against "ielts_lms_test".`,
          );
        }

        return {
          uri,
          autoIndex: false,
        };
      },
    }),
  ],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) { }

  async onApplicationBootstrap(): Promise<void> {
    const isProduction = this.configService.get<string>('nodeEnv') === 'production';
    if (isProduction) {
      this.logger.log(
        'Production mode detected: skipping automatic index rebuild on bootstrap. Controlled index migration is managed via init:indexes.',
      );
      return;
    }

    const models = Object.values(this.connection.models);
    let successCount = 0;
    let warningCount = 0;

    for (const model of models) {
      try {
        await model.createIndexes();
        successCount++;
      } catch (err: any) {
        warningCount++;
        this.logger.warn(
          `Index sync warning on model [${model.modelName}]: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Verified indexes for ${models.length} Mongoose models (${successCount} synced, ${warningCount} warnings handled)`,
    );
  }
}
