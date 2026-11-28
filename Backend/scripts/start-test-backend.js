process.env.PORT = '3001';
process.env.MONGODB_URI = 'mongodb://localhost:27018/ielts_lms_test?replicaSet=rs0&directConnection=true';
process.env.REDIS_KEY_PREFIX = 'ielts:test:';
process.env.NODE_ENV = 'development'; // Keep live logging and Swagger active
require('../dist/main.js');
