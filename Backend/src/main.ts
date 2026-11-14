import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Correlation ID tracking
  app.use(new CorrelationIdMiddleware().use);

  // Security
  app.use(helmet());
  app.use(cookieParser());

  // CORS
  const configuredOrigins = configService.get<string[]>('cors.allowedOrigins', [
    'http://localhost:3000',
  ]);
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, server-to-server, curl)
      if (!origin) return callback(null, true);
      if (
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:') ||
        configuredOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin denied'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'idempotency-key',
      'X-Correlation-Id',
      'x-correlation-id',
      'X-Request-Id',
      'x-request-id',
    ],
  });

  // Global prefix
  const apiPrefix = configService.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Global pipes — DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Request size limit
  app.use((req: any, res: any, next: any) => {
    if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 10 * 1024 * 1024) {
      res.status(413).json({ statusCode: 413, message: 'Payload too large' });
      return;
    }
    next();
  });

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('IELTS LMS API')
    .setDescription('IELTS Learning Management System — Backend REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer(`http://localhost:${configService.get<number>('port', 3000)}`, 'Local Dev')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = configService.get<number>('port', 3000);
  await app.listen(port);

  console.log(`🚀 IELTS LMS Backend running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap();

