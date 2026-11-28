import mongoose, { Model } from 'mongoose';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import Redis from 'ioredis';

import { UserSchema } from '../schemas/user.schema';
import { StudentProfileSchema } from '../schemas/student-profile.schema';
import { TeacherProfileSchema } from '../schemas/teacher-profile.schema';
import { CourseSchema } from '../schemas/course.schema';
import { EnrollmentSchema } from '../schemas/enrollment.schema';
import { LessonSchema } from '../schemas/lesson.schema';
import { ExerciseSchema } from '../schemas/exercise.schema';
import { AssignmentSchema } from '../schemas/assignment.schema';
import { StudentAssignmentSchema } from '../schemas/student-assignment.schema';
import { SubmissionSchema } from '../schemas/submission.schema';
import { ExamTestSchema } from '../schemas/exam-test.schema';
import { ExamAttemptSchema } from '../schemas/exam-attempt.schema';
import { TranslationSubmissionSchema } from '../schemas/translation-submission.schema';
import { ExtensionRequestSchema } from '../schemas/extension-request.schema';
import { PenaltyTransactionSchema } from '../schemas/penalty-transaction.schema';
import { NotificationSchema } from '../schemas/notification.schema';
import { AuditLogSchema } from '../schemas/audit-log.schema';
import { EmailDeliverySchema } from '../schemas/email-delivery.schema';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

const ALLOWED_DESTRUCTIVE_DB_NAMES = new Set([
  'ielts_lms',
  'ielts_lms_dev',
  'ielts_lms_development',
  'ielts_lms_test',
  'ielts_lms_e2e',
  'ielts_lms_local',
]);

function ask(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function parseCliArgs(): {
  isForce: boolean;
  isDemoOnly: boolean;
  noBackup: boolean;
  targetDb?: string;
} {
  const args = process.argv.slice(2);
  return {
    isForce: args.includes('--force') || args.includes('-f'),
    isDemoOnly: args.includes('--demo-only'),
    noBackup: args.includes('--no-backup'),
    targetDb: args.find((a) => a.startsWith('--db='))?.replace('--db=', ''),
  };
}

async function run() {
  console.log('===============================================================');
  console.log('🧹 WEB-IELTS SAFE DATABASE CLEANUP & ISOLATION UTILITY');
  console.log('===============================================================');

  const cli = parseCliArgs();

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. EARLY MULTI-TIER SAFETY GUARDS (Before connecting)
  // ─────────────────────────────────────────────────────────────────────────────
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    console.error('⛔ FATAL SAFETY GUARD: Database cleanup is strictly forbidden in production (NODE_ENV=production).');
    process.exit(1);
  }

  // Connect to MongoDB
  await mongoose.connect(MONGODB_URI);
  const dbName = (mongoose.connection.name || '').toLowerCase();
  const host = mongoose.connection.host || '';

  console.log(`📡 Connected to MongoDB: database="${dbName}", host="${host}"`);

  if (/(prod|production|live|staging|uat|release)/i.test(dbName)) {
    console.error(`⛔ FATAL SAFETY GUARD: Database name "${dbName}" matches protected keywords (prod/staging/live/uat/release). Cleanup forbidden.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const customAllowed = process.env.CUSTOM_ALLOWED_DESTRUCTIVE_DB
    ? process.env.CUSTOM_ALLOWED_DESTRUCTIVE_DB.toLowerCase()
    : null;
  const isAllowlisted = ALLOWED_DESTRUCTIVE_DB_NAMES.has(dbName) || (customAllowed && customAllowed === dbName);
  if (!isAllowlisted) {
    console.error(
      `⛔ FATAL SAFETY GUARD: Database "${dbName}" is NOT in the allowlist of authorized development databases: [${Array.from(ALLOWED_DESTRUCTIVE_DB_NAMES).join(', ')}].`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'mongodb';
  if (!isLocalhost && !process.env.ALLOW_REMOTE_DESTRUCTIVE_SEED) {
    console.error(
      `⛔ FATAL SAFETY GUARD: Host "${host}" is not local loopback. Set ALLOW_REMOTE_DESTRUCTIVE_SEED=true to override.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. MODEL REGISTRATIONS (Typed as Model<any> to prevent excessive union expansion)
  // ─────────────────────────────────────────────────────────────────────────────
  const models: Record<string, Model<any>> = {
    users: mongoose.model('User', UserSchema, 'users'),
    student_profiles: mongoose.model('StudentProfile', StudentProfileSchema, 'student_profiles'),
    teacher_profiles: mongoose.model('TeacherProfile', TeacherProfileSchema, 'teacher_profiles'),
    courses: mongoose.model('Course', CourseSchema, 'courses'),
    enrollments: mongoose.model('Enrollment', EnrollmentSchema, 'enrollments'),
    lessons: mongoose.model('Lesson', LessonSchema, 'lessons'),
    exercises: mongoose.model('Exercise', ExerciseSchema, 'exercises'),
    assignments: mongoose.model('Assignment', AssignmentSchema, 'assignments'),
    student_assignments: mongoose.model('StudentAssignment', StudentAssignmentSchema, 'student_assignments'),
    submissions: mongoose.model('Submission', SubmissionSchema, 'submissions'),
    exam_tests: mongoose.model('ExamTest', ExamTestSchema, 'exam_tests'),
    exam_attempts: mongoose.model('ExamAttempt', ExamAttemptSchema, 'exam_attempts'),
    translation_submissions: mongoose.model('TranslationSubmission', TranslationSubmissionSchema, 'translation_submissions'),
    extension_requests: mongoose.model('ExtensionRequest', ExtensionRequestSchema, 'extension_requests'),
    penalty_transactions: mongoose.model('PenaltyTransaction', PenaltyTransactionSchema, 'penalty_transactions'),
    notifications: mongoose.model('Notification', NotificationSchema, 'notifications'),
    audit_logs: mongoose.model('AuditLog', AuditLogSchema, 'audit_logs'),
    email_deliveries: mongoose.model('EmailDelivery', EmailDeliverySchema, 'email_deliveries'),
  };

  // Inspect current document counts
  console.log('\n📊 Current Database Inspection:');
  const initialCounts: Record<string, number> = {};
  for (const [name, model] of Object.entries(models)) {
    const count = await model.countDocuments().exec();
    initialCounts[name] = count;
    console.log(`   - ${name.padEnd(25)}: ${count} documents`);
  }

  const totalDocuments = Object.values(initialCounts).reduce((a, b) => a + b, 0);
  console.log(`   TOTAL DOCUMENTS         : ${totalDocuments}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. INTERACTIVE CONFIRMATION (UNLESS --force)
  // ─────────────────────────────────────────────────────────────────────────────
  const mode = cli.isDemoOnly ? 'DEMO-DATA-ONLY CLEANUP' : 'FULL CLEANUP (EMPTY DATABASE FOR CUSTOMER ONBOARDING)';
  console.log(`\nMode: [${mode}]`);

  if (!cli.isForce) {
    const confirmation = await ask(`⚠️ Are you sure you want to execute [${mode}] on database "${dbName}"? Type "yes" to proceed: `);
    if (confirmation.toLowerCase() !== 'yes') {
      console.log('❌ Cleanup aborted by user.');
      await mongoose.disconnect();
      process.exit(0);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. AUTOMATIC BACKUP CREATION
  // ─────────────────────────────────────────────────────────────────────────────
  if (!cli.noBackup && totalDocuments > 0) {
    console.log('\n💾 Creating automated pre-cleanup backup...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.resolve(__dirname, '../../../backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupPath = path.join(backupDir, `backup-${dbName}-${timestamp}.json`);

    const dump: Record<string, unknown[]> = {};
    for (const [name, model] of Object.entries(models)) {
      dump[name] = await model.find({}).lean().exec();
    }

    const payload = {
      createdAt: new Date().toISOString(),
      database: dbName,
      totalDocuments,
      collections: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])),
      data: dump,
    };

    fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`✅ Backup successfully saved to: ${backupPath}`);
  } else if (cli.noBackup) {
    console.log('\n⚠️ Backup skipped due to --no-backup flag.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. EXECUTE CLEANUP
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n⚡ Performing safe deletion...');

  if (cli.isDemoOnly) {
    // Collect demo user IDs
    const demoUsers = await models.users.find({ email: /@ielts-lms\.local$/i }).lean().exec();
    const demoUserIds = demoUsers.map((u: any) => u._id);
    const demoUserEmails = demoUsers.map((u: any) => u.email);

    console.log(`   Found ${demoUsers.length} demo user accounts to purge.`);

    // Purge student and teacher profiles
    await models.student_profiles.deleteMany({ userId: { $in: demoUserIds } });
    await models.teacher_profiles.deleteMany({ userId: { $in: demoUserIds } });

    // Courses taught by demo teachers
    const demoCourses = await models.courses.find({ instructorId: { $in: demoUserIds } }).lean().exec();
    const demoCourseIds = demoCourses.map((c: any) => c._id);

    // Delete enrollments, lessons, exercises, assignments for demo courses or students
    await models.enrollments.deleteMany({
      $or: [{ userId: { $in: demoUserIds } }, { courseId: { $in: demoCourseIds } }],
    });
    await models.lessons.deleteMany({ courseId: { $in: demoCourseIds } });
    await models.exercises.deleteMany({ courseId: { $in: demoCourseIds } });

    const demoAssignments = await models.assignments.find({ courseId: { $in: demoCourseIds } }).lean().exec();
    const demoAssignmentIds = demoAssignments.map((a: any) => a._id);

    await models.assignments.deleteMany({ courseId: { $in: demoCourseIds } });
    await models.student_assignments.deleteMany({
      $or: [{ studentId: { $in: demoUserIds } }, { assignmentId: { $in: demoAssignmentIds } }],
    });
    await models.submissions.deleteMany({
      $or: [{ studentId: { $in: demoUserIds } }, { assignmentId: { $in: demoAssignmentIds } }],
    });
    await models.courses.deleteMany({ _id: { $in: demoCourseIds } });

    // Purge student activities
    await models.exam_attempts.deleteMany({ studentId: { $in: demoUserIds } });
    await models.translation_submissions.deleteMany({ studentId: { $in: demoUserIds } });
    await models.extension_requests.deleteMany({ studentId: { $in: demoUserIds } });
    await models.penalty_transactions.deleteMany({ studentId: { $in: demoUserIds } });
    await models.notifications.deleteMany({ userId: { $in: demoUserIds } });
    await models.audit_logs.deleteMany({ actorId: { $in: demoUserIds } });
    await models.email_deliveries.deleteMany({ recipientEmail: { $in: demoUserEmails } });

    // Finally delete demo users
    await models.users.deleteMany({ _id: { $in: demoUserIds } });

    console.log('✅ Demo records successfully deleted.');
  } else {
    // Full clean: wipe all data in registered collections
    for (const [name, model] of Object.entries(models)) {
      await model.deleteMany({});
      console.log(`   ✓ Wiped collection "${name}"`);
    }
    console.log('✅ All business collections wiped clean.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. CLEAR BULLMQ QUEUES IN REDIS (IF AVAILABLE)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    await redis.connect();
    const keys = await redis.keys('bull:*');
    if (keys.length > 0) {
      console.log(`🧹 Clearing ${keys.length} BullMQ queue keys from Redis...`);
      await redis.del(...keys);
      console.log('✅ BullMQ Redis queues drained.');
    }
    await redis.quit();
  } catch {
    console.log('ℹ️ Redis connection bypassed or not reachable (BullMQ queues left untouched).');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. POST-CLEANUP VERIFICATION & INDEX PRESERVATION CHECK
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔍 Post-Cleanup Verification:');
  let hasLeak = false;

  for (const [name, model] of Object.entries(models)) {
    const remaining = await model.countDocuments().exec();
    const indexes = await model.collection.indexes();
    const initial = initialCounts[name] || 0;
    const diff = initial - remaining;

    console.log(
      `   ${name.padEnd(25)}: Deleted ${diff.toString().padEnd(4)} | Remaining ${remaining.toString().padEnd(4)} | Verified Indexes: ${indexes.length}`,
    );

    if (!cli.isDemoOnly && remaining > 0) {
      console.error(`   ❌ Collection "${name}" still contains ${remaining} documents!`);
      hasLeak = true;
    }
  }

  if (hasLeak) {
    console.error('\n❌ Cleanup verification failed: some collections were not fully emptied.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('\n✨ Database is clean, indexes preserved, ready for customer onboarding.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('\n❌ Fatal error in clean-database script:', err);
  await mongoose.disconnect();
  process.exit(1);
});
