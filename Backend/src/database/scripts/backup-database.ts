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

const { EJSON } = mongoose.mongo.BSON;

const DEFAULT_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';

function parseCliArgs(): { targetDb?: string; outputPath?: string } {
  const args = process.argv.slice(2);
  let targetDb: string | undefined;
  let outputPath: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--db=')) {
      targetDb = arg.replace('--db=', '').trim();
    } else if (arg.startsWith('--out=')) {
      outputPath = arg.replace('--out=', '').trim();
    }
  }

  return { targetDb, outputPath };
}

async function run() {
  console.log('===============================================================');
  console.log('💾 WEB-IELTS: BSON EXTENDED-JSON (EJSON) DATABASE BACKUP');
  console.log('===============================================================');

  const cli = parseCliArgs();
  let uri = DEFAULT_URI;

  if (cli.targetDb) {
    const urlObj = new URL(uri);
    urlObj.pathname = `/${cli.targetDb}`;
    uri = urlObj.toString();
  }

  await mongoose.connect(uri);
  const dbName = mongoose.connection.name || 'unknown';
  console.log(`📡 Connected to database "${dbName}"`);

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

  const dump: Record<string, unknown[]> = {};
  let totalDocuments = 0;

  console.log('\n📦 Exporting collections with strict BSON fidelity...');
  for (const [name, model] of Object.entries(models)) {
    const docs = await model.find({}).lean().exec();
    dump[name] = docs;
    totalDocuments += docs.length;
    console.log(`   - ${name.padEnd(25)}: ${docs.length.toString().padStart(4)} documents exported`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '../../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const destination = cli.outputPath
    ? path.resolve(cli.outputPath)
    : path.join(backupDir, `backup-${dbName}-${timestamp}.ejson`);

  const payload = {
    metadata: {
      version: '1.0',
      format: 'BSON_EXTENDED_JSON',
      createdAt: new Date().toISOString(),
      database: dbName,
      totalDocuments,
      collections: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])),
    },
    data: dump,
  };

  // Serialize with Canonical Extended JSON (relaxed: false guarantees exact BSON types: $oid, $date)
  const ejsonString = EJSON.stringify(payload, undefined, 2, { relaxed: false });
  fs.writeFileSync(destination, ejsonString, 'utf-8');

  console.log('\n===============================================================');
  console.log(`✅ Backup successfully created with BSON type preservation!`);
  console.log(`   Destination: ${destination}`);
  console.log(`   Total documents: ${totalDocuments}`);
  console.log('===============================================================');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ Fatal error in backup-database script:', err);
  await mongoose.disconnect();
  process.exit(1);
});
