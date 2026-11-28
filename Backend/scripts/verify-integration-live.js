// verify-integration-live.js
const assert = require('assert');

async function main() {
  console.log('--- 1. Testing Health Check ---');
  const healthRes = await fetch('http://localhost:3001/api/v1/health/live');
  const healthJson = await healthRes.json();
  console.log('Health status:', healthRes.status, healthJson);
  assert.strictEqual(healthRes.status, 200, 'Health check should be 200');

  console.log('\n--- 2. Testing Student Login ---');
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
    },
    body: JSON.stringify({
      email: 'student@ielts-lms.local',
      password: 'Student@123456',
    }),
  });
  console.log('Login HTTP status:', loginRes.status);
  const loginData = await loginRes.json();
  console.log('User logged in:', loginData.data?.user);
  assert.strictEqual(loginRes.status, 200, 'Login should succeed with 200');
  const accessToken = loginData.data?.accessToken;
  assert.ok(accessToken, 'Access token must be present');

  console.log('\n--- 3. Testing GET /auth/me with Student Token ---');
  const meRes = await fetch('http://localhost:3001/api/v1/auth/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Origin': 'http://localhost:3000',
    },
  });
  const meData = await meRes.json();
  console.log('Me endpoint status:', meRes.status, meData.data?.email, meData.data?.roles);
  assert.strictEqual(meRes.status, 200);

  console.log('\n--- 4. Testing GET /dashboard/student ---');
  const dashRes = await fetch('http://localhost:3001/api/v1/dashboard/student', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Origin': 'http://localhost:3000',
    },
  });
  const dashData = await dashRes.json();
  console.log('Student dashboard status:', dashRes.status, 'Summary:', dashData.data?.summary);
  assert.strictEqual(dashRes.status, 200);

  console.log('\n--- 5. Testing Teacher Login & Dashboard ---');
  const teacherLoginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
    },
    body: JSON.stringify({
      email: 'teacher@ielts-lms.local',
      password: 'Teacher@123456',
    }),
  });
  const teacherLoginData = await teacherLoginRes.json();
  console.log('Teacher login status:', teacherLoginRes.status, teacherLoginData.data?.user?.email);
  assert.strictEqual(teacherLoginRes.status, 200);
  const teacherToken = teacherLoginData.data?.accessToken;

  const teacherDashRes = await fetch('http://localhost:3001/api/v1/dashboard/teacher', {
    headers: {
      'Authorization': `Bearer ${teacherToken}`,
      'Origin': 'http://localhost:3000',
    },
  });
  const teacherDashData = await teacherDashRes.json();
  console.log('Teacher dashboard status:', teacherDashRes.status, 'Active courses count:', teacherDashData.data?.activeCoursesCount);
  assert.strictEqual(teacherDashRes.status, 200);

  console.log('\n--- 6. Testing Admin Login ---');
  const adminLoginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'http://localhost:3000',
    },
    body: JSON.stringify({
      email: 'admin@ielts-lms.local',
      password: 'Admin@123456',
    }),
  });
  const adminLoginData = await adminLoginRes.json();
  console.log('Admin login status:', adminLoginRes.status, adminLoginData.data?.user?.email);
  assert.strictEqual(adminLoginRes.status, 200);

  console.log('\n====================================');
  console.log('ALL LIVE INTEGRATION TESTS PASSED!');
  console.log('====================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

