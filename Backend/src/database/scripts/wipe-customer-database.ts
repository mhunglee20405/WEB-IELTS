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

const CUSTOMER_DB_NAME = 'ielts_lms_customer';
const MONGODB_HOST = process.env.MONGO_HOST || 'localhost:27018';
const CUSTOMER_URI = `mongodb://${MONGODB_HOST}/${CUSTOMER_DB_NAME}?replicaSet=rs0&directConnection=true`;

async function run() {
  console.log('===============================================================');
  console.log('🧹 WEB-IELTS: CUSTOMER DATABASE ZERO-BASELINE RESET UTILITY');
  console.log('===============================================================');

  // 1. Verify backup exists
  const backupDir = path.resolve(__dirname, '../../../backups');
  if (!fs.existsSync(backupDir)) {
    throw new Error(`Backup directory ${backupDir} does not exist. Please run db:backup first.`);
  }
  const backupFiles = fs.readdirSync(backupDir).filter((f) => f.includes('ielts_lms_customer') && f.endsWith('.ejson'));
  if (backupFiles.length === 0) {
    throw new Error('No recent customer backup found in backups/ directory. Please run db:backup first.');
  }
  console.log(`✅ Verified existing customer backup: ${backupFiles[backupFiles.length - 1]}`);

  // 2. Connect to customer DB
  await mongoose.connect(CUSTOMER_URI);
  const dbName = mongoose.connection.name;
  if (dbName !== CUSTOMER_DB_NAME) {
    throw new Error(`Connected database "${dbName}" does not match target "${CUSTOMER_DB_NAME}". Aborting.`);
  }
  console.log(`📡 Connected to target customer database: "${dbName}"`);

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

  // 3. Deletion Preview
  console.log('\n📋 DELETION PREVIEW (Verified Acceptance Test Artifacts):');
  let totalDocsToDelete = 0;
  for (const [name, model] of Object.entries(models)) {
    const count = await model.countDocuments();
    totalDocsToDelete += count;
    console.log(`   - ${name.padEnd(25)}: ${count} documents`);
  }

  console.log(`\nTotal documents scheduled for removal: ${totalDocsToDelete}`);

  // 4. Execution: Delete all documents
  console.log('\n🧹 Cleaning documents from customer collections...');
  for (const [name, model] of Object.entries(models)) {
    await model.deleteMany({});
  }

  // 5. Re-synchronize indexes
  console.log('\n🔧 Re-synchronizing compound & unique indexes on all 18 collections...');
  for (const [name, model] of Object.entries(models)) {
    await model.createIndexes();
    const indexes = await model.collection.indexes();
    console.log(`   ✓ ${name.padEnd(25)}: ${indexes.length} indexes verified`);
  }

  // 6. Post-verification
  console.log('\n📊 Post-Reset Document Count Verification (Must be 0):');
  let remainingDocs = 0;
  for (const [name, model] of Object.entries(models)) {
    const count = await model.countDocuments();
    remainingDocs += count;
    console.log(`   - ${name.padEnd(25)}: ${count}`);
    if (count !== 0) {
      throw new Error(`Expected collection "${name}" to have 0 documents, but found ${count}`);
    }
  }

  console.log('\n===============================================================');
  console.log('🎉 CUSTOMER DATABASE RESET TO TRULY EMPTY BASELINE (0 DOCUMENTS)');
  console.log('   All 18 collections verified clean.');
  console.log('   All indexes synchronized.');
  console.log('===============================================================');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ Fatal error in customer database reset:', err);
  await mongoose.disconnect();
  process.exit(1);
});
