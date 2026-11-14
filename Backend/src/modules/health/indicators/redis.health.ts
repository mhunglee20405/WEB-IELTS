import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password', '') || undefined;

    let client: Redis | null = null;
    try {
      client = new Redis({
        host,
        port,
        password,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      await client.connect();
      const pong = await client.ping();
      await client.quit();

      if (pong === 'PONG') {
        return this.getStatus(key, true);
      }
      throw new Error(`Unexpected Redis response: ${pong}`);
    } catch (err: any) {
      if (client) {
        try {
          client.disconnect();
        } catch {
          // ignore
        }
      }
      this.logger.warn(`Redis readiness check failed: ${err.message}`);
      throw new HealthCheckError(
        'Redis ping failed',
        this.getStatus(key, false, { message: err.message }),
      );
    }
  }
}

