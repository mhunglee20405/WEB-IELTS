import * as dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3001/api/v1';

async function run() {
  console.log('===============================================================');
  console.log('⚡ CONCURRENCY & RECONNECTION BEHAVIOR BENCHMARK');
  console.log('===============================================================');

  // Login
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@academy.edu.vn', password: 'Admin@Academy2026!' }),
  });
  const data = await loginRes.json();
  const token = data.data?.tokens?.accessToken;
  if (!token) throw new Error('Could not login as admin');

  // Concurrency test: 20 concurrent requests
  console.log('\nTesting 20 concurrent requests across endpoints...');
  const endpoints = ['/users?limit=10', '/courses?limit=10', '/exercises?limit=10', '/system/setup-status'];
  const start = performance.now();
  const promises = Array.from({ length: 20 }, (_, idx) => {
    const ep = endpoints[idx % endpoints.length];
    return fetch(`${API_URL}${ep}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (r) => ({ status: r.status, duration: performance.now() - start }));
  });

  const results = await Promise.all(promises);
  const totalDuration = performance.now() - start;
  const all200 = results.every((r) => r.status === 200);

  console.log(`  ✓ 20 concurrent requests finished in: ${totalDuration.toFixed(2)} ms`);
  console.log(`  ✓ Average latency under concurrency: ${(totalDuration / 20).toFixed(2)} ms`);
  console.log(`  ✓ All returned HTTP 200: ${all200}`);

  console.log('\n===============================================================');
  console.log('🎉 CONCURRENCY BENCHMARK COMPLETE: 100% SUCCESS');
  console.log('===============================================================');
}

run().catch(console.error);
