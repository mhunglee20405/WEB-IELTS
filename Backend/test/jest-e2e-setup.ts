// Jest E2E Environment Setup & Isolation Guard
process.env.NODE_ENV = 'test';

const targetUri =
  process.env.TEST_MONGODB_URI ||
  'mongodb://localhost:27018/ielts_lms_test?replicaSet=rs0&directConnection=true';

const parsedMatch = targetUri.match(/\/([^/?]+)(\?|$)/);
const dbName = parsedMatch ? parsedMatch[1].toLowerCase() : '';

if (dbName === 'ielts_lms_customer' || dbName.includes('customer') || dbName.includes('prod')) {
  throw new Error(
    `[FATAL ENVIRONMENT GUARD] Automated E2E test runner detected customer or production database "${dbName}" in MONGODB_URI. Tests must run exclusively against "ielts_lms_test".`,
  );
}

process.env.MONGODB_URI = targetUri;
process.env.REDIS_KEY_PREFIX = 'ielts:test:';
