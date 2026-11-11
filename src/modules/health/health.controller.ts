import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { RedisHealthIndicator } from './indicators/redis.health';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly heapThresholdBytes: number;

  constructor(
    private health: HealthCheckService,
    private mongooseHealth: MongooseHealthIndicator,
    private memoryHealth: MemoryHealthIndicator,
    private redisHealth: RedisHealthIndicator,
    private configService: ConfigService,
  ) {
    const thresholdMb = this.configService.get<number>('health.heapThresholdMb', 768);
    this.heapThresholdBytes = thresholdMb * 1024 * 1024;
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe (process responsiveness & heap memory)' })
  @HealthCheck()
  live() {
    return this.health.check([
      () => this.memoryHealth.checkHeap('memory_heap', this.heapThresholdBytes),
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (MongoDB & Redis connection readiness)' })
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.mongooseHealth.pingCheck('mongodb'),
      () => this.redisHealth.isHealthy('redis'),
      () => this.memoryHealth.checkHeap('memory_heap', this.heapThresholdBytes),
    ]);
  }
}
