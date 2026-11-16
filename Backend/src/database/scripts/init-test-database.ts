import mongoose, { Model } from 'mongoose';
import * as dotenv from 'dotenv';

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

const TEST_DB_NAME = 'ielts_lms_test';
const MONGODB_HOST = process.env.MONGO_HOST || 'localhost:27018';
const TEST_URI = process.env.TEST_MONGODB_URI || `mongodb://${MONGODB_HOST}/${TEST_DB_NAME}?replicaSet=rs0&directConnection=true`;

async function run() {
  console.log('===============================================================');
  console.log('🧪 WEB-IELTS: ISOLATED TEST DATABASE INITIALIZATION');
  console.log('===============================================================');
  console.log(`📡 Connecting to Test Database: "${TEST_DB_NAME}"`);

  await mongoose.connect(TEST_URI);
  console.log('✅ Connected successfully.');

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

  const isWipe = process.argv.includes('--wipe') || process.argv.includes('--clean');
  if (isWipe) {
    console.log('🧹 Wiping existing test documents in ielts_lms_test...');
    for (const [name, model] of Object.entries(models)) {
      await model.deleteMany({});
    }
  }

  console.log('\n🔧 Synchronizing compound & unique indexes on ielts_lms_test...');
  for (const [name, model] of Object.entries(models)) {
    await model.createIndexes();
    const count = await model.countDocuments();
    const indexes = await model.collection.indexes();
    console.log(`   ✓ ${name.padEnd(25)}: ${count} docs | ${indexes.length} verified indexes`);
  }

  console.log('\n===============================================================');
  console.log('🎉 TEST DATABASE READY & ISOLATED FOR AUTOMATED VERIFICATION');
  console.log('===============================================================');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ Fatal error in test database initialization:', err);
  await mongoose.disconnect();
  process.exit(1);
});
