import mongoose from 'mongoose';
import { execSync } from 'child_process';

const URI = 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';

async function main() {
  console.log('Connecting to ielts_lms...');
  const conn = await mongoose.connect(URI);
  await conn.connection.db!.dropDatabase();
  console.log('✅ ielts_lms database dropped cleanly.');
  await mongoose.disconnect();

  console.log('Running clean seed...');
  execSync('npx ts-node -r tsconfig-paths/register src/database/seed/seed.ts', {
    cwd: process.cwd().endsWith('Backend') ? process.cwd() : process.cwd() + '/Backend',
    stdio: 'inherit',
  });
  console.log('✅ Clean seed complete!');
}

main().catch(console.error);

