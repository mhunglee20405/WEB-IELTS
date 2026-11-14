import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),

  MONGODB_URI: Joi.string().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  SMTP_HOST: Joi.string().required(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().required(),
  SMTP_PASS: Joi.string().required(),
  MAIL_FROM_NAME: Joi.string().default('IELTS LMS'),
  MAIL_FROM_ADDRESS: Joi.string().email({ tlds: { allow: false } }).required(),

  STORAGE_TYPE: Joi.string().valid('disk', 's3').default('disk'),
  STORAGE_LOCAL_PATH: Joi.string().default('./uploads'),

  SEED_ADMIN_EMAIL: Joi.string().email({ tlds: { allow: false } }).required(),
  SEED_ADMIN_PASSWORD: Joi.string().min(8).required(),
  SEED_ADMIN_FULLNAME: Joi.string().required(),

  CORS_ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),
});

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',

  mongodb: {
    uri: process.env.MONGODB_URI,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    fromName: process.env.MAIL_FROM_NAME || 'IELTS LMS',
    fromAddress: process.env.MAIL_FROM_ADDRESS,
  },

  storage: {
    type: process.env.STORAGE_TYPE || 'disk',
    localPath: process.env.STORAGE_LOCAL_PATH || './uploads',
  },

  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL,
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
    adminFullName: process.env.SEED_ADMIN_FULLNAME,
  },

  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  },

  health: {
    heapThresholdMb: parseInt(process.env.HEALTH_HEAP_THRESHOLD_MB || '768', 10),
  },
});

