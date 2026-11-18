import fs from 'fs';
import path from 'path';
import dns from 'dns';
import { createRequire } from 'node:module';

const backendRequire = createRequire(path.resolve('Backend/package.json'));
const mongoose = backendRequire('mongoose');

const envContent = fs.readFileSync('Backend/.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || '').trim().replace(/^"|"$/g, '');
});
if (env.MONGODB_DNS_SERVERS) dns.setServers(env.MONGODB_DNS_SERVERS.split(','));

async function inspect() {
  await mongoose.connect(env.MONGODB_URI);
  const courses = await mongoose.connection.collection('courses').find({}).toArray();
  console.log('Courses in DB:', JSON.stringify(courses.map(c => ({
    id: c._id.toString(),
    code: c.code,
    title: c.title,
    status: c.status,
    startAt: c.startAt,
    endAt: c.endAt,
  })), null, 2));

  // If there are courses in draft status with startAt <= today, update them to 'active'
  const now = new Date();
  for (const c of courses) {
    if (c.status === 'draft') {
      console.log(`Found course ${c.code} in 'draft' status. Updating to 'active'...`);
      await mongoose.connection.collection('courses').updateOne(
        { _id: c._id },
        { $set: { status: 'active' } }
      );
      console.log(`Updated ${c.code} to 'active'.`);
    }
  }

  await mongoose.disconnect();
}

inspect().catch(console.error);
