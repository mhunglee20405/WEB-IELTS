import mongoose, { Types } from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';

async function main() {
  console.log('===============================================================');
  console.log('🔍 RUNNING DATABASE INTEGRITY & SEED VERIFICATION');
  console.log('Connecting to:', MONGO_URI.replace(/:[^:]*@/, ':***@'));
  console.log('===============================================================');

  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db!;

  // 1. Check collection counts
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map(c => c.name);
  console.log('Found collections:', collectionNames);

  const counts: Record<string, number> = {};
  for (const name of collectionNames) {
    counts[name] = await db.collection(name).countDocuments();
  }
  console.log('\n📊 Collection counts:');
  console.table(counts);

  // 2. Integrity checks
  console.log('\n🔎 Verifying Foreign Key & Relation Integrity...');
  let errors = 0;

  // Users
  const users = await db.collection('users').find().toArray();
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  console.log(`✅ Loaded ${users.length} users.`);

  // Courses
  const courses = await db.collection('courses').find().toArray();
  const courseMap = new Map(courses.map(c => [c._id.toString(), c]));
  for (const course of courses) {
    const teacher = userMap.get(course.teacherId?.toString());
    if (!teacher) {
      console.error(`❌ Course ${course.code} has invalid teacherId: ${course.teacherId}`);
      errors++;
    } else if (teacher.role !== 'teacher' && teacher.role !== 'admin' && !teacher.roles?.includes('teacher')) {
      console.error(`❌ Course ${course.code} teacherId ${course.teacherId} is not a teacher/admin.`);
      errors++;
    }
    if (course.startBand > course.targetBand) {
      console.error(`❌ Course ${course.code} has startBand ${course.startBand} > targetBand ${course.targetBand}`);
      errors++;
    }
  }
  console.log(`✅ Verified ${courses.length} courses: valid teachers, valid band ranges.`);

  // Enrollments
  const enrollments = await db.collection('enrollments').find().toArray();
  const enrollmentPairs = new Set<string>();
  for (const enr of enrollments) {
    const course = courseMap.get(enr.courseId?.toString());
    const student = userMap.get(enr.studentId?.toString());
    if (!course) {
      console.error(`❌ Enrollment has invalid courseId: ${enr.courseId}`);
      errors++;
    }
    if (!student) {
      console.error(`❌ Enrollment has invalid studentId: ${enr.studentId}`);
      errors++;
    }
    const pair = `${enr.courseId}_${enr.studentId}`;
    if (enrollmentPairs.has(pair)) {
      console.error(`❌ Duplicate enrollment pair found: ${pair}`);
      errors++;
    }
    enrollmentPairs.add(pair);
  }
  console.log(`✅ Verified ${enrollments.length} enrollments: valid course/student FKs, zero duplicates.`);

  // Lessons
  const lessons = await db.collection('lessons').find().toArray();
  for (const lesson of lessons) {
    const course = courseMap.get(lesson.courseId?.toString());
    if (!course) {
      console.error(`❌ Lesson ${lesson.title} has invalid courseId: ${lesson.courseId}`);
      errors++;
    }
    const startAt = new Date(lesson.startAt);
    const endAt = new Date(lesson.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      console.error(`❌ Lesson ${lesson.title} has invalid date(s): startAt=${lesson.startAt}, endAt=${lesson.endAt}`);
      errors++;
    }
    if (startAt >= endAt) {
      console.error(`❌ Lesson ${lesson.title} has startAt >= endAt`);
      errors++;
    }
    if (lesson.meetUrl && !lesson.meetUrl.startsWith('https://')) {
      console.error(`❌ Lesson ${lesson.title} has non-HTTPS meetUrl: ${lesson.meetUrl}`);
      errors++;
    }
  }
  console.log(`✅ Verified ${lessons.length} lessons: valid courses, valid chronological intervals, HTTPS meet URLs.`);

  // Assignments & Student Assignments
  const assignments = await db.collection('assignments').find().toArray();
  const assignmentMap = new Map(assignments.map(a => [a._id.toString(), a]));
  for (const a of assignments) {
    const course = courseMap.get(a.courseId?.toString());
    if (!course) {
      console.error(`❌ Assignment has invalid courseId: ${a.courseId}`);
      errors++;
    }
    const availableAt = new Date(a.availableAt);
    const dueAt = new Date(a.dueAt);
    if (availableAt >= dueAt) {
      console.error(`❌ Assignment has availableAt >= dueAt`);
      errors++;
    }
  }
  console.log(`✅ Verified ${assignments.length} assignments: valid course FKs, valid availableAt < dueAt window.`);

  const studentAssignments = await db.collection('student_assignments').find().toArray();
  for (const sa of studentAssignments) {
    const assignment = assignmentMap.get(sa.assignmentId?.toString());
    const student = userMap.get(sa.studentId?.toString());
    if (!assignment) {
      console.error(`❌ StudentAssignment has invalid assignmentId: ${sa.assignmentId}`);
      errors++;
    }
    if (!student) {
      console.error(`❌ StudentAssignment has invalid studentId: ${sa.studentId}`);
      errors++;
    }
  }
  console.log(`✅ Verified ${studentAssignments.length} student assignments: valid assignment & student FKs.`);

  // Submissions
  const submissions = await db.collection('submissions').find().toArray();
  for (const sub of submissions) {
    const student = userMap.get(sub.studentId?.toString());
    if (!student) {
      console.error(`❌ Submission has invalid studentId: ${sub.studentId}`);
      errors++;
    }
    if (sub.score !== undefined && (sub.score < 0 || sub.score > 100)) {
      console.error(`❌ Submission has invalid score: ${sub.score}`);
      errors++;
    }
    if (sub.bandScore !== undefined && (sub.bandScore < 1.0 || sub.bandScore > 9.0)) {
      console.error(`❌ Submission has invalid bandScore: ${sub.bandScore}`);
      errors++;
    }
  }
  console.log(`✅ Verified ${submissions.length} submissions: valid student FKs, score [0, 100], band [1.0, 9.0].`);

  // Translation Submissions
  const translations = await db.collection('translation_submissions').find().toArray();
  for (const tr of translations) {
    const student = userMap.get(tr.studentId?.toString());
    if (!student) {
      console.error(`❌ TranslationSubmission has invalid studentId: ${tr.studentId}`);
      errors++;
    }
    if (!tr.passageId) {
      console.error(`❌ TranslationSubmission missing passageId`);
      errors++;
    }
    if (!tr.translatedText || typeof tr.translatedText !== 'string' || tr.translatedText.trim() === '') {
      console.error(`❌ TranslationSubmission has empty translatedText`);
      errors++;
    }
  }
  console.log(`✅ Verified ${translations.length} translations: valid student FKs, valid passages and paragraph translations.`);

  // Extensions
  const extensions = await db.collection('extension_requests').find().toArray();
  for (const ext of extensions) {
    const student = userMap.get(ext.studentId?.toString());
    if (!student) {
      console.error(`❌ Extension has invalid studentId: ${ext.studentId}`);
      errors++;
    }
    if (!['pending', 'approved', 'rejected'].includes(ext.status)) {
      console.error(`❌ Extension has invalid status: ${ext.status}`);
      errors++;
    }
  }
  console.log(`✅ Verified ${extensions.length} extensions: valid student FKs, valid status.`);

  // Penalties
  const penalties = await db.collection('penalty_transactions').find().toArray();
  for (const pen of penalties) {
    const student = userMap.get(pen.studentId?.toString());
    if (!student) {
      console.error(`❌ Penalty has invalid studentId: ${pen.studentId}`);
      errors++;
    }
  }
  console.log(`✅ Verified ${penalties.length} penalties: valid student FKs.`);

  // Notifications
  const notifications = await db.collection('notifications').find().toArray();
  for (const notif of notifications) {
    const user = userMap.get(notif.userId?.toString());
    if (!user) {
      console.error(`❌ Notification has invalid userId: ${notif.userId}`);
      errors++;
    }
  }
  console.log(`✅ Verified ${notifications.length} notifications: valid user FKs.`);

  console.log('\n===============================================================');
  if (errors === 0) {
    console.log('🎉 ALL DATABASE INTEGRITY CHECKS PASSED WITH 0 ERRORS!');
  } else {
    console.error(`💥 FAILED WITH ${errors} ERRORS.`);
    process.exit(1);
  }
  console.log('===============================================================');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
