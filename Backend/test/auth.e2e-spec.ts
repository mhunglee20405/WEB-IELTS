import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from 'src/app.module';

/**
 * E2E tests require a running MongoDB and Redis.
 * Run with: npm run test:e2e
 * Requires .env with valid MONGODB_URI and REDIS_HOST.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 400 for missing fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);
    });

    it('should return 401 for wrong credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'wrongpassword' })
        .expect(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });
  });

  describe('Health Probes & Heap Separation Regression Tests', () => {
    it('GET /api/v1/health/live should return healthy 200 without being coupled to heap usage', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);
    });

    it('GET /api/v1/health/ready should return 200 verifying critical dependencies', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);
    });

    it('GET /api/v1/health/memory should isolate heap check to separate monitoring', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/memory');
      expect([200, 503]).toContain(res.status);
      const payload = res.body.data || res.body;
      expect(payload.details || payload.info).toHaveProperty('memory_heap');
    });
  });
});

