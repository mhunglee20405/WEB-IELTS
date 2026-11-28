import mongoose from 'mongoose';
import { execSync } from 'child_process';

const ISOLATED_URI = 'mongodb://localhost:27018/ielts_lms_verify?replicaSet=rs0&directConnection=true';

interface CollectionSnapshot {
  count: number;
  ids: string[];
}

async function takeSnapshot(db: mongoose.mongo.Db): Promise<Record<string, CollectionSnapshot>> {
  const collections = await db.listCollections().toArray();
  const snapshot: Record<string, CollectionSnapshot> = {};

  for (const col of collections) {
    const docs = await db.collection(col.name).find({}, { projection: { _id: 1 } }).toArray();
    snapshot[col.name] = {
      count: docs.length,
      ids: docs.map(d => d._id.toString()).sort(),
    };
  }

  return snapshot;
}

async function verifyIntegrity(db: mongoose.mongo.Db): Promise<{ errors: string[]; stats: Record<string, number> }> {
  const errors: string[] = [];
  const stats: Record<string, number> = {};

  // 1. Users
  const users = await db.collection('users').find().toArray();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  stats.users = users.length;

  const admins = users.filter(u => u.role === 'admin' || u.roles?.includes('admin'));
  const teachers = users.filter(u => u.role === 'teacher' || u.roles?.includes('teacher'));
  const students = users.filter(u => u.role === 'student' || u.roles?.includes('student'));

  if (admins.length < 2) errors.push(`Expected >= 2 admins, found ${admins.length}`);
  if (teachers.length < 4) errors.push(`Expected >= 4 teachers, found ${teachers.length}`);
  if (students.length < 15) errors.push(`Expected >= 15 students, found ${students.length}`);

  // 2. Courses
  const courses = await db.collection('courses').find().toArray();
  const courseMap = new Map(courses.map(c => [c._id.toString(), c]));
  stats.courses = courses.length;

  for (const c of courses) {
    const teacher = userMap.get(c.teacherId?.toString());
    if (!teacher) errors.push(`Course ${c.code} references non-existent teacherId: ${c.teacherId}`);
    if (c.startBand > c.targetBand) errors.push(`Course ${c.code} has invalid band range: ${c.startBand} > ${c.targetBand}`);
  }

  // 3. Enrollments
  const enrollments = await db.collection('enrollments').find().toArray();
  stats.enrollments = enrollments.length;
  const enrPairs = new Set<string>();

  for (const e of enrollments) {
    if (!courseMap.has(e.courseId?.toString())) errors.push(`Enrollment references non-existent courseId: ${e.courseId}`);
    if (!userMap.has(e.studentId?.toString())) errors.push(`Enrollment references non-existent studentId: ${e.studentId}`);
    const pair = `${e.courseId}_${e.studentId}`;
    if (enrPairs.has(pair)) errors.push(`Duplicate enrollment found for pair: ${pair}`);
    enrPairs.add(pair);
  }

  // 4. Lessons
  const lessons = await db.collection('lessons').find().toArray();
  stats.lessons = lessons.length;

  for (const l of lessons) {
    if (!courseMap.has(l.courseId?.toString())) errors.push(`Lesson "${l.title}" references non-existent courseId: ${l.courseId}`);
    const startAt = new Date(l.startAt);
    const endAt = new Date(l.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      errors.push(`Lesson "${l.title}" has invalid date(s): startAt=${l.startAt}, endAt=${l.endAt}`);
    } else if (startAt >= endAt) {
      errors.push(`Lesson "${l.title}" has startAt >= endAt (${l.startAt} >= ${l.endAt})`);
    }
    if (l.meetUrl && !l.meetUrl.startsWith('https://')) {
      errors.push(`Lesson "${l.title}" has non-HTTPS meetUrl: ${l.meetUrl}`);
    }
  }

  // 5. Exercises
  const exercises = await db.collection('exercises').find().toArray();
  stats.exercises = exercises.length;
  const exerciseMap = new Map(exercises.map(ex => [ex._id.toString(), ex]));

  // 6. Assignments & Student Assignments
  const assignments = await db.collection('assignments').find().toArray();
  stats.assignments = assignments.length;
  const assignmentMap = new Map(assignments.map(a => [a._id.toString(), a]));

  for (const a of assignments) {
    if (!courseMap.has(a.courseId?.toString())) errors.push(`Assignment references non-existent courseId: ${a.courseId}`);
    const avail = new Date(a.availableAt);
    const due = new Date(a.dueAt);
    if (avail >= due) errors.push(`Assignment has invalid window: availableAt (${a.availableAt}) >= dueAt (${a.dueAt})`);
  }

  const studentAssignments = await db.collection('student_assignments').find().toArray();
  stats.studentAssignments = studentAssignments.length;
  const saMap = new Map(studentAssignments.map(sa => [sa._id.toString(), sa]));

  for (const sa of studentAssignments) {
    if (!assignmentMap.has(sa.assignmentId?.toString())) errors.push(`StudentAssignment references non-existent assignmentId: ${sa.assignmentId}`);
    if (!userMap.has(sa.studentId?.toString())) errors.push(`StudentAssignment references non-existent studentId: ${sa.studentId}`);
  }

  // 7. Submissions
  const submissions = await db.collection('submissions').find().toArray();
  stats.submissions = submissions.length;

  for (const sub of submissions) {
    if (!userMap.has(sub.studentId?.toString())) errors.push(`Submission references non-existent studentId: ${sub.studentId}`);
    if (!saMap.has(sub.studentAssignmentId?.toString())) errors.push(`Submission references non-existent studentAssignmentId: ${sub.studentAssignmentId}`);
    if (sub.score !== undefined && (sub.score < 0 || sub.score > 100)) {
      errors.push(`Submission has out-of-range score: ${sub.score}`);
    }
    if (sub.bandScore !== undefined && (sub.bandScore < 1.0 || sub.bandScore > 9.0)) {
      errors.push(`Submission has out-of-range bandScore: ${sub.bandScore}`);
    }
  }

  // 8. Translation Submissions
  const translations = await db.collection('translation_submissions').find().toArray();
  stats.translations = translations.length;

  for (const tr of translations) {
    if (!userMap.has(tr.studentId?.toString())) errors.push(`Translation references non-existent studentId: ${tr.studentId}`);
    if (!tr.passageId) errors.push(`Translation missing passageId`);
    if (!tr.translatedText || typeof tr.translatedText !== 'string' || tr.translatedText.trim() === '') {
      errors.push(`Translation has empty translatedText`);
    }
  }

  // 9. Extensions
  const extensions = await db.collection('extension_requests').find().toArray();
  stats.extensions = extensions.length;

  for (const ext of extensions) {
    if (!userMap.has(ext.studentId?.toString())) errors.push(`Extension references non-existent studentId: ${ext.studentId}`);
    if (!saMap.has(ext.studentAssignmentId?.toString())) errors.push(`Extension references non-existent studentAssignmentId: ${ext.studentAssignmentId}`);
    if (!['pending', 'approved', 'rejected'].includes(ext.status)) errors.push(`Extension has invalid status: ${ext.status}`);
  }

  // 10. Penalties
  const penalties = await db.collection('penalty_transactions').find().toArray();
  stats.penalties = penalties.length;

  for (const pen of penalties) {
    if (!userMap.has(pen.studentId?.toString())) errors.push(`Penalty references non-existent studentId: ${pen.studentId}`);
  }

  // 11. Notifications
  const notifications = await db.collection('notifications').find().toArray();
  stats.notifications = notifications.length;

  for (const notif of notifications) {
    if (!userMap.has(notif.userId?.toString())) errors.push(`Notification references non-existent userId: ${notif.userId}`);
  }

  return { errors, stats };
}

async function run() {
  console.log('===============================================================');
  console.log('🔬 ISOLATED DATABASE SEED INTEGRITY & IDEMPOTENCY TEST');
  console.log('Target Database:', ISOLATED_URI);
  console.log('===============================================================');

  // Step 1: Connect and drop isolated test database
  console.log('\n[Step 1] Connecting to isolated database and dropping old data...');
  const conn = await mongoose.connect(ISOLATED_URI);
  const db = conn.connection.db!;
  await db.dropDatabase();
  console.log('✅ Isolated database dropped clean.');

  // Step 2: Run Seed #1
  console.log('\n[Step 2] Executing Seed Run #1 against clean isolated database...');
  execSync('npx ts-node -r tsconfig-paths/register src/database/seed/seed.ts', {
    cwd: process.cwd().endsWith('Backend') ? process.cwd() : process.cwd() + '/Backend',
    env: { ...process.env, MONGODB_URI: ISOLATED_URI },
    stdio: 'inherit',
  });
  console.log('✅ Seed Run #1 completed.');

  // Step 3: Verify Integrity & Foreign Keys on Run #1
  console.log('\n[Step 3] Verifying integrity, foreign keys, and constraints on Run #1...');
  const check1 = await verifyIntegrity(db);
  console.log('Stats after Run #1:');
  console.table(check1.stats);

  if (check1.errors.length > 0) {
    console.error(`❌ Found ${check1.errors.length} integrity errors after Run #1:`);
    check1.errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }
  console.log('✅ Run #1 has 0 foreign key errors, 0 constraint violations!');

  // Snapshot Run #1
  const snapshot1 = await takeSnapshot(db);

  // Step 4: Run Seed #2 (Idempotency Test)
  console.log('\n[Step 4] Executing Seed Run #2 (IDEMPOTENCY TEST)...');
  execSync('npx ts-node -r tsconfig-paths/register src/database/seed/seed.ts', {
    cwd: process.cwd().endsWith('Backend') ? process.cwd() : process.cwd() + '/Backend',
    env: { ...process.env, MONGODB_URI: ISOLATED_URI },
    stdio: 'inherit',
  });
  console.log('✅ Seed Run #2 completed.');

  // Step 5: Verify Integrity & Foreign Keys on Run #2
  console.log('\n[Step 5] Verifying integrity after Run #2...');
  const check2 = await verifyIntegrity(db);
  if (check2.errors.length > 0) {
    console.error(`❌ Found ${check2.errors.length} integrity errors after Run #2:`);
    check2.errors.forEach(e => console.error('  - ' + e));
    process.exit(1);
  }

  // Snapshot Run #2 and compare
  const snapshot2 = await takeSnapshot(db);

  console.log('\n[Step 6] Comparing Snapshot 1 vs Snapshot 2 (Idempotency Check)...');
  let idempotencyErrors = 0;

  for (const col of Object.keys(snapshot1)) {
    const s1 = snapshot1[col]!;
    const s2 = snapshot2[col];

    if (!s2) {
      console.error(`❌ Collection ${col} disappeared after Run #2!`);
      idempotencyErrors++;
      continue;
    }

    if (s1.count !== s2.count) {
      console.error(`❌ Collection ${col} count changed: Run #1 had ${s1.count}, Run #2 has ${s2.count} (DIFF: ${s2.count - s1.count})`);
      idempotencyErrors++;
    } else {
      console.log(`  ✅ ${col.padEnd(25)} Count preserved: ${s1.count}`);
    }

    // Verify IDs match exactly
    const ids1Str = s1.ids.join(',');
    const ids2Str = s2.ids.join(',');
    if (ids1Str !== ids2Str) {
      console.error(`❌ Collection ${col} document IDs changed between runs!`);
      idempotencyErrors++;
    }
  }

  console.log('\n===============================================================');
  if (idempotencyErrors === 0) {
    console.log('🎉 100% IDEMPOTENCY & DATA INTEGRITY VERIFIED!');
    console.log('Zero duplicate documents. Zero changed IDs. Zero foreign key errors.');
  } else {
    console.error(`💥 Idempotency check failed with ${idempotencyErrors} errors.`);
    process.exit(1);
  }
  console.log('===============================================================');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
