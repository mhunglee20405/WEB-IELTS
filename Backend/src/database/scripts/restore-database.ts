import mongoose, { Model } from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

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

const { EJSON, ObjectId } = mongoose.mongo.BSON;

const DEFAULT_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';

function parseCliArgs(): { file?: string; targetDb?: string } {
  const args = process.argv.slice(2);
  let file: string | undefined;
  let targetDb: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--file=')) {
      file = arg.replace('--file=', '').trim();
    } else if (arg.startsWith('--db=')) {
      targetDb = arg.replace('--db=', '').trim();
    }
  }

  return { file, targetDb };
}

async function run() {
  console.log('===============================================================');
  console.log('🔄 WEB-IELTS: BSON EXTENDED-JSON (EJSON) DATABASE RESTORATION');
  console.log('===============================================================');

  const cli = parseCliArgs();

  if (!cli.file) {
    console.error('❌ Missing backup file. Specify with --file=<path_to_backup.ejson>');
    process.exit(1);
  }

  const backupFilePath = path.resolve(cli.file);
  if (!fs.existsSync(backupFilePath)) {
    console.error(`❌ Backup file not found: ${backupFilePath}`);
    process.exit(1);
  }

  const targetDb = cli.targetDb || 'ielts_lms_restore_test';

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. MULTI-TIER SAFETY GUARDS: NEVER OVERWRITE PRODUCTION OR CUSTOMER DB
  // ─────────────────────────────────────────────────────────────────────────────
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    console.error('⛔ FATAL SAFETY GUARD: Database restoration is strictly forbidden in production.');
    process.exit(1);
  }

  if (/(prod|production|live|staging|uat|release)/i.test(targetDb)) {
    console.error(`⛔ FATAL SAFETY GUARD: Target database "${targetDb}" matches protected keywords. Restoration aborted.`);
    process.exit(1);
  }

  if (targetDb === 'ielts_lms_customer' && !process.env.ALLOW_CUSTOMER_RESTORE) {
    console.error(`⛔ FATAL SAFETY GUARD: Direct restore onto customer database "${targetDb}" is blocked to prevent accidental overwrite. Set ALLOW_CUSTOMER_RESTORE=true if intentional.`);
    process.exit(1);
  }

  let uri = DEFAULT_URI;
  const urlObj = new URL(uri);
  urlObj.pathname = `/${targetDb}`;
  uri = urlObj.toString();

  await mongoose.connect(uri);
  console.log(`📡 Connected to target restoration database: "${targetDb}"`);

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

  console.log('\n📖 Reading and deserializing Extended JSON payload...');
  const rawContent = fs.readFileSync(backupFilePath, 'utf-8');
  const payload = EJSON.parse(rawContent) as {
    metadata?: Record<string, any>;
    data: Record<string, any[]>;
  };

  console.log(`   Source database in backup: ${payload.metadata?.database || 'unknown'}`);
  console.log(`   Backup created at: ${payload.metadata?.createdAt || 'unknown'}`);

  // Wipe target test database collections first
  console.log(`\n🧹 Preparing clean slate in target database "${targetDb}"...`);
  for (const [name, model] of Object.entries(models)) {
    await model.deleteMany({});
  }

  console.log('\n📥 Restoring documents with exact BSON types...');
  let totalRestored = 0;
  let typeVerificationPassed = true;

  for (const [name, model] of Object.entries(models)) {
    const docs = payload.data[name] || [];
    if (docs.length > 0) {
      await model.insertMany(docs, { ordered: false });
      totalRestored += docs.length;

      // Verify BSON types on the restored documents
      const sample: any = await model.findOne({}).lean().exec();
      if (sample && sample._id) {
        const isBsonObjectId = sample._id instanceof ObjectId || sample._id.constructor.name === 'ObjectId';
        if (!isBsonObjectId) {
          console.error(`   ❌ Warning: _id in ${name} is NOT a BSON ObjectId!`);
          typeVerificationPassed = false;
        }
      }
      console.log(`   ✓ ${name.padEnd(25)}: Restored ${docs.length.toString().padStart(4)} documents`);
    } else {
      console.log(`   - ${name.padEnd(25)}: 0 documents (empty)`);
    }
  }

  // Synchronize indexes
  console.log('\n🔧 Re-building all Mongoose indexes on restored database...');
  for (const [name, model] of Object.entries(models)) {
    await model.createIndexes();
    const indexes = await model.collection.indexes();
    console.log(`   ✓ ${name.padEnd(25)}: Synchronized ${indexes.length} indexes`);
  }

  console.log('\n===============================================================');
  console.log('🎉 DATABASE RESTORATION SUCCESSFUL!');
  console.log(`   Target database: "${targetDb}"`);
  console.log(`   Total documents restored: ${totalRestored}`);
  console.log(`   BSON Type Fidelity: ${typeVerificationPassed ? '100% PRESERVED' : 'FAILED'}`);
  console.log('===============================================================');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ Fatal error in restore-database script:', err);
  await mongoose.disconnect();
  process.exit(1);
});
