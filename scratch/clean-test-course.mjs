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

async function clean() {
  await mongoose.connect(env.MONGODB_URI);
  await mongoose.connection.collection('courses').deleteOne({ code: 'CRS-TEST-MWMF70LQ' });
  const remaining = await mongoose.connection.collection('courses').find({}).toArray();
  console.log('Remaining courses:', remaining.map(c => ({ code: c.code, title: c.title, status: c.status })));
  await mongoose.disconnect();
}

clean().catch(console.error);
