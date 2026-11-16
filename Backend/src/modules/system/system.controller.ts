import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SystemService } from './system.service';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('setup-status')
  @ApiOperation({ summary: 'Check if system has been initialized with an initial administrator' })
  @ApiResponse({ status: 200, description: 'Returns initialization status' })
  async getSetupStatus() {
    return this.systemService.getSetupStatus();
  }

  @Post('bootstrap-admin')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'One-time secure bootstrap of the initial Administrator on a clean system' })
  @ApiHeader({ name: 'x-setup-token', required: false, description: 'Optional setup token' })
  @ApiResponse({ status: 201, description: 'Administrator successfully initialized' })
  @ApiResponse({ status: 409, description: 'System already initialized. Bootstrap disabled.' })
  @ApiResponse({ status: 401, description: 'Invalid setup token' })
  async bootstrapAdmin(
    @Body() dto: BootstrapAdminDto,
    @Headers('x-setup-token') headerToken?: string,
  ) {
    return this.systemService.bootstrapAdmin(dto, headerToken);
  }
}
