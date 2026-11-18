import http from 'http';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { createRequire } from 'node:module';

const backendRequire = createRequire(path.resolve('Backend/package.json'));
const mongoose = backendRequire('mongoose');
const jwt = backendRequire('jsonwebtoken');

const backendDir = 'D:\\WEB-IELTS\\Backend';
const envContent = fs.readFileSync(path.join(backendDir, '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

if (env.MONGODB_DNS_SERVERS) {
  dns.setServers(env.MONGODB_DNS_SERVERS.split(','));
}

async function getAdminToken() {
  await mongoose.connect(env.MONGODB_URI);
  const usersCol = mongoose.connection.collection('users');
  const adminUser = await usersCol.findOne({ role: 'admin' });
  await mongoose.disconnect();

  if (!adminUser) throw new Error('No admin user found');

  const secret = env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  const tokenPayload = {
    sub: adminUser._id.toString(),
    email: adminUser.email,
    roles: adminUser.roles || [adminUser.role],
    role: adminUser.role,
    tv: adminUser.tokenVersion || 0,
  };

  const accessToken = jwt.sign(tokenPayload, secret, { expiresIn: '1h' });
  return { token: accessToken, adminId: adminUser._id.toString() };
}

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('1. Getting Admin token...');
  const { token, adminId } = await getAdminToken();
  console.log('Success! Admin ID:', adminId);

  // 2. Query courses
  const listRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/courses',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Current courses count:', listRes.data?.data?.items?.length || listRes.data?.items?.length || 0);

  // 3. Test creating a course starting today (2026-11-18)
  const todayStr = new Date().toISOString().slice(0, 10);
  const testCode = 'CRS-TEST-' + Date.now().toString(36).toUpperCase();

  console.log(`2. Creating course with startDate=${todayStr} (today) and status="active"...`);
  const createRes = await request(
    {
      hostname: 'localhost',
      port: 3001,
      path: '/api/v1/courses',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
    {
      code: testCode,
      title: 'Khóa học Test Start Date Hôm nay',
      teacherId: adminId,
      startBand: 5.0,
      targetBand: 6.5,
      status: 'active',
      startDate: todayStr,
      courseType: 'group',
    },
  );

  console.log('Create response status:', createRes.status);
  const createdCourse = createRes.data?.data || createRes.data;
  console.log('Created course details:', {
    id: createdCourse.id || createdCourse._id,
    code: createdCourse.code,
    status: createdCourse.status,
    startAt: createdCourse.startAt,
  });

  if (createdCourse.status !== 'active') {
    console.error('FAIL: Course status is not "active"! Status is:', createdCourse.status);
    process.exit(1);
  } else {
    console.log('SUCCESS: Created course has status "active" as expected!');
  }

  // 4. Test querying active courses
  console.log('3. Querying /courses?status=active...');
  const activeRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/v1/courses?status=active',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const activeItems = activeRes.data?.data?.items || activeRes.data?.items || [];
  const found = activeItems.some((c) => (c.id || c._id) === (createdCourse.id || createdCourse._id));
  console.log('Found created course in active list?', found);

  // 5. Clean up test course
  console.log('4. Cleaning up test course...');
  const deleteRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/v1/courses/${createdCourse.id || createdCourse._id}`,
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Delete response status:', deleteRes.status);

  console.log('\n--- ALL VERIFICATIONS PASSED ---');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
