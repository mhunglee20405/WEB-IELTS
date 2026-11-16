import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3001/api/v1';
const TEST_MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://localhost:27018/ielts_lms_test?replicaSet=rs0&directConnection=true';

interface BenchmarkStat {
  endpoint: string;
  method: string;
  samples: number;
  min: number;
  median: number;
  p95: number;
  max: number;
  avg: number;
}

function computeStats(samples: number[]): { min: number; median: number; p95: number; max: number; avg: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const min = Math.round(sorted[0] * 100) / 100;
  const max = Math.round(sorted[sorted.length - 1] * 100) / 100;
  const avg = Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 100) / 100;
  const median = Math.round(sorted[Math.floor(sorted.length * 0.5)] * 100) / 100;
  const p95 = Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100;
  return { min, median, p95, max, avg };
}

async function measureRequest(
  url: string,
  options: RequestInit,
): Promise<{ durationMs: number; status: number }> {
  const start = performance.now();
  const res = await fetch(url, options);
  const durationMs = performance.now() - start;
  await res.text();
  return { durationMs, status: res.status };
}

async function benchmarkEndpoint(
  name: string,
  method: string,
  path: string,
  token?: string,
  body?: any,
  iterations = 30,
): Promise<BenchmarkStat> {
  const durations: number[] = [];
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Warmup 2 requests
  for (let i = 0; i < 2; i++) {
    await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  for (let i = 0; i < iterations; i++) {
    const { durationMs, status } = await measureRequest(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (status >= 400) {
      console.warn(`[WARN] Non-2xx response on ${method} ${path}: ${status}`);
    }
    durations.push(durationMs);
  }

  const { min, median, p95, max, avg } = computeStats(durations);
  return {
    endpoint: path,
    method,
    samples: iterations,
    min,
    median,
    p95,
    max,
    avg,
  };
}

async function run() {
  console.log('===============================================================');
  console.log('⚡ WEB-IELTS: MEASURABLE PERFORMANCE & LATENCY BENCHMARK SUITE');
  console.log('===============================================================');

  // Obtain admin & student tokens
  console.log('Logging in to acquire benchmark tokens...');
  const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@academy.edu.vn', password: 'Admin@Academy2026!' }),
  });
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.data.tokens.accessToken;

  // Find a student from database
  await mongoose.connect(TEST_MONGODB_URI);
  const dbName = (mongoose.connection.name || '').toLowerCase();
  if (dbName === 'ielts_lms_customer' || dbName.includes('customer') || dbName.includes('prod')) {
    throw new Error(
      `[FATAL GUARD] Benchmark is strictly forbidden against customer/production database "${dbName}". Target must be "ielts_lms_test".`,
    );
  }
  const studentUser = await mongoose.connection.db!.collection('users').findOne({ role: 'student' });
  let studentToken = '';
  if (studentUser) {
    const studentLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: studentUser.email, password: 'Student@Academy2026!' }),
    });
    const sData = await studentLoginRes.json();
    studentToken = sData.data?.tokens?.accessToken || '';
  }

  const results: BenchmarkStat[] = [];

  // 1. Health check
  console.log('Benchmarking: GET /health...');
  results.push(await benchmarkEndpoint('Health Check', 'GET', '/health', undefined, undefined, 30));

  // 2. Setup status
  console.log('Benchmarking: GET /system/setup-status...');
  results.push(await benchmarkEndpoint('System Setup Status', 'GET', '/system/setup-status', undefined, undefined, 30));

  // 3. Auth login (Argon2id password verification)
  console.log('Benchmarking: POST /auth/login (Argon2id CPU Cost)...');
  results.push(
    await benchmarkEndpoint(
      'Auth Login',
      'POST',
      '/auth/login',
      undefined,
      { email: 'admin@academy.edu.vn', password: 'Admin@Academy2026!' },
      20,
    ),
  );

  // 4. Admin Users list
  console.log('Benchmarking: GET /users...');
  results.push(await benchmarkEndpoint('Users List (Admin)', 'GET', '/users?limit=20', adminToken, undefined, 30));

  // 5. Courses list
  console.log('Benchmarking: GET /courses...');
  results.push(await benchmarkEndpoint('Courses List', 'GET', '/courses?limit=20', adminToken, undefined, 30));

  // 6. Exercises list
  console.log('Benchmarking: GET /exercises...');
  results.push(await benchmarkEndpoint('Exercises List', 'GET', '/exercises?limit=20', adminToken, undefined, 30));

  // 7. Student Courses
  if (studentToken) {
    console.log('Benchmarking: GET /courses/mine (Student)...');
    results.push(await benchmarkEndpoint('Student Courses', 'GET', '/courses/mine', studentToken, undefined, 30));

    console.log('Benchmarking: GET /lessons/mine (Calendar)...');
    results.push(await benchmarkEndpoint('Student Lessons Calendar', 'GET', '/lessons/mine', studentToken, undefined, 30));

    console.log('Benchmarking: GET /assignments/mine (Homework)...');
    results.push(
      await benchmarkEndpoint('Student Assignments', 'GET', '/assignments/mine', studentToken, undefined, 30),
    );

    console.log('Benchmarking: GET /notifications...');
    results.push(
      await benchmarkEndpoint('Student Notifications', 'GET', '/notifications', studentToken, undefined, 30),
    );
  }

  console.log('\n===============================================================');
  console.log('📊 PERFORMANCE LATENCY BENCHMARK RESULTS (Customer Production DB)');
  console.log('===============================================================');
  console.log(
    'Endpoint'.padEnd(30) +
      'Method'.padEnd(8) +
      'Samples'.padEnd(10) +
      'Median (ms)'.padEnd(14) +
      'p95 (ms)'.padEnd(12) +
      'Avg (ms)'.padEnd(12) +
      'Min (ms)',
  );
  console.log('-'.repeat(95));
  for (const r of results) {
    console.log(
      r.endpoint.padEnd(30) +
        r.method.padEnd(8) +
        String(r.samples).padEnd(10) +
        String(r.median).padEnd(14) +
        String(r.p95).padEnd(12) +
        String(r.avg).padEnd(12) +
        String(r.min),
    );
  }

  // Memory usage
  const mem = process.memoryUsage();
  console.log('\n🧠 Node.js Client Benchmark Process Memory:');
  console.log(`   - RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   - Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   - Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error('Benchmark error:', e);
  await mongoose.disconnect();
});
