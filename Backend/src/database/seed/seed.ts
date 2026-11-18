import * as mongoose from 'mongoose';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import {
  UserRole,
  UserStatus,
  CourseStatus,
  CourseType,
  LessonStatus,
  LessonType,
  ExerciseType,
  QuestionType,
  ExerciseStatus,
  AssignmentStatus,
  StudentAssignmentStatus,
  EnrollmentStatus,
  TranslationSubmissionStatus,
  ExtensionRequestStatus,
  NotificationType,
  ExamSkill,
  ExamMode,
  ExamDifficulty,
  ExamTestStatus,
  ExamQuestionType,
  PartType,
  AttemptStatus,
} from '../schemas/enums';
import { ExamTestSchema } from '../schemas/exam-test.schema';
import { ExamAttemptSchema } from '../schemas/exam-attempt.schema';
import { UserSchema } from '../schemas/user.schema';
import { CourseSchema } from '../schemas/course.schema';
import { EnrollmentSchema } from '../schemas/enrollment.schema';
import { LessonSchema } from '../schemas/lesson.schema';
import { ExerciseSchema } from '../schemas/exercise.schema';
import { AssignmentSchema } from '../schemas/assignment.schema';
import { StudentAssignmentSchema } from '../schemas/student-assignment.schema';
import { SubmissionSchema } from '../schemas/submission.schema';
import { ExtensionRequestSchema } from '../schemas/extension-request.schema';
import { PenaltyTransactionSchema } from '../schemas/penalty-transaction.schema';
import { TranslationSubmissionSchema } from '../schemas/translation-submission.schema';
import { NotificationSchema } from '../schemas/notification.schema';
import { StudentProfileSchema } from '../schemas/student-profile.schema';
import { TeacherProfileSchema } from '../schemas/teacher-profile.schema';

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';

async function seed() {
  console.log('🌱 Starting comprehensive database seed for IELTS LMS...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB at', MONGODB_URI);

  const connectedDbName = (mongoose.connection.name || '').toLowerCase();
  if (connectedDbName === 'ielts_lms_customer' || connectedDbName.includes('customer') || connectedDbName.includes('prod')) {
    console.error(`⛔ FATAL SAFETY GUARD: Seeding demo data into customer or production database "${connectedDbName}" is strictly prohibited! Aborting.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  // Models
  const UserModel = mongoose.model('User', UserSchema, 'users');
  const StudentProfileModel = mongoose.model('StudentProfile', StudentProfileSchema, 'student_profiles');
  const TeacherProfileModel = mongoose.model('TeacherProfile', TeacherProfileSchema, 'teacher_profiles');
  const CourseModel = mongoose.model('Course', CourseSchema, 'courses');
  const EnrollmentModel = mongoose.model('Enrollment', EnrollmentSchema, 'enrollments');
  const LessonModel = mongoose.model('Lesson', LessonSchema, 'lessons');
  const ExerciseModel = mongoose.model('Exercise', ExerciseSchema, 'exercises');
  const AssignmentModel = mongoose.model('Assignment', AssignmentSchema, 'assignments');
  const StudentAssignmentModel = mongoose.model('StudentAssignment', StudentAssignmentSchema, 'student_assignments');
  const SubmissionModel = mongoose.model('Submission', SubmissionSchema, 'submissions');
  const ExamTestModel = mongoose.model('ExamTest', ExamTestSchema, 'exam_tests');
  const ExamAttemptModel = mongoose.model('ExamAttempt', ExamAttemptSchema, 'exam_attempts');
  const TranslationModel = mongoose.model('TranslationSubmission', TranslationSubmissionSchema, 'translation_submissions');
  const ExtensionModel = mongoose.model('ExtensionRequest', ExtensionRequestSchema, 'extension_requests');
  const PenaltyModel = mongoose.model('PenaltyTransaction', PenaltyTransactionSchema, 'penalty_transactions');
  const NotificationModel = mongoose.model('Notification', NotificationSchema, 'notifications');

  // Password hashes cache
  const adminHash = await argon2.hash('Admin@123456', { type: argon2.argon2id });
  const teacherHash = await argon2.hash('Teacher@123456', { type: argon2.argon2id });
  const studentHash = await argon2.hash('Student@123456', { type: argon2.argon2id });

  // 🛡️ Explicit Allowlist of Databases Permitted for Destructive Seeding
  const ALLOWED_DESTRUCTIVE_DB_NAMES = new Set([
    'ielts_lms',
    'ielts_lms_dev',
    'ielts_lms_development',
    'ielts_lms_test',
    'ielts_lms_e2e',
    'ielts_lms_local',
  ]);

  // Optional fresh wipe for clean deterministic demo baseline
  const isFresh = process.argv.includes('--fresh') || process.argv.includes('--clean');
  if (isFresh) {
    // 🛡️ Multi-Tier Safety Guard System: Prevent any accidental deletion of production/staging/live data
    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    if (nodeEnv === 'production') {
      console.error('⛔ FATAL SAFETY GUARD: Destructive --fresh seed cannot be executed in production (NODE_ENV=production). Aborting.');
      process.exit(1);
    }

    const dbName = (mongoose.connection.name || '').toLowerCase();
    
    // Check 1: Deny any database name with sensitive environment keywords
    if (/(prod|production|live|staging|uat|release)/i.test(dbName)) {
      console.error(`⛔ FATAL SAFETY GUARD: Target database "${dbName}" matches protected environment keywords (prod/staging/live/uat/release). Destructive wipe forbidden. Aborting.`);
      process.exit(1);
    }

    // Check 2: Strict Allowlist Verification - dbName MUST be in ALLOWED_DESTRUCTIVE_DB_NAMES
    const customAllowed = process.env.CUSTOM_ALLOWED_DESTRUCTIVE_DB ? process.env.CUSTOM_ALLOWED_DESTRUCTIVE_DB.toLowerCase() : null;
    const isExplicitlyAllowlisted = ALLOWED_DESTRUCTIVE_DB_NAMES.has(dbName) || (customAllowed && customAllowed === dbName);
    if (!isExplicitlyAllowlisted) {
      console.error(`⛔ FATAL SAFETY GUARD: Target database "${dbName}" is NOT in the explicit allowlist of authorized development/test databases: [${Array.from(ALLOWED_DESTRUCTIVE_DB_NAMES).join(', ')}]. Destructive wipe blocked. Aborting.`);
      process.exit(1);
    }

    // Check 3: Host restriction - must be local loopback unless explicitly overridden
    const host = mongoose.connection.host || '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'mongodb';
    if (!isLocalhost && !process.env.ALLOW_REMOTE_DESTRUCTIVE_SEED) {
      console.error(`⛔ FATAL SAFETY GUARD: Target database host "${host}" is not a recognized local development host. Set ALLOW_REMOTE_DESTRUCTIVE_SEED=true to override. Aborting.`);
      process.exit(1);
    }

    console.log(`🧹 --fresh flag verified on allowlisted development database "${dbName}" (${host}): Wiping development collections...`);
    await Promise.all([
      UserModel.deleteMany({}),
      StudentProfileModel.deleteMany({}),
      TeacherProfileModel.deleteMany({}),
      CourseModel.deleteMany({}),
      EnrollmentModel.deleteMany({}),
      LessonModel.deleteMany({}),
      ExerciseModel.deleteMany({}),
      AssignmentModel.deleteMany({}),
      StudentAssignmentModel.deleteMany({}),
      SubmissionModel.deleteMany({}),
      ExamTestModel.deleteMany({}),
      ExamAttemptModel.deleteMany({}),
      TranslationModel.deleteMany({}),
      ExtensionModel.deleteMany({}),
      PenaltyModel.deleteMany({}),
      NotificationModel.deleteMany({}),
    ]);
    console.log('✨ Development collections wiped clean for deterministic seed.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SEED ADMINS (2)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Admin accounts...');
  const adminsData = [
    { email: 'admin@ielts-lms.local', fullName: 'System Admin', phone: '0901000001' },
    { email: 'admin2@ielts-lms.local', fullName: 'Academic Operations Admin', phone: '0901000002' },
  ];
  const admins: any[] = [];
  for (const ad of adminsData) {
    let u = await UserModel.findOne({ email: ad.email }).exec();
    if (!u) {
      u = await UserModel.create({
        fullName: ad.fullName,
        email: ad.email,
        passwordHash: adminHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        phone: ad.phone,
      });
      console.log(`  + Admin created: ${ad.email}`);
    } else {
      console.log(`  = Admin exists: ${ad.email}`);
    }
    admins.push(u);
  }
  const primaryAdmin = admins[0];

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SEED TEACHERS (4)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Teacher accounts...');
  const teachersData = [
    {
      email: 'teacher@ielts-lms.local',
      fullName: 'Teacher Nguyen Van A',
      specialization: 'IELTS Reading & Listening Masterclass',
      bio: 'Chuyên gia luyện thi IELTS 8.5 với hơn 8 năm kinh nghiệm giảng dạy chuyên sâu.',
      phone: '0902000001',
    },
    {
      email: 'teacher2@ielts-lms.local',
      fullName: 'Teacher Tran Thi Huong',
      specialization: 'IELTS Foundation & Writing Strategy',
      bio: 'Giảng viên Sư phạm Ngoại ngữ, IELTS 8.0, chuyên gia xây nền tảng và tư duy học thuật.',
      phone: '0902000002',
    },
    {
      email: 'teacher3@ielts-lms.local',
      fullName: 'Teacher Le Hoang Nam',
      specialization: 'IELTS Academic Advanced 7.5 - 8.5',
      bio: 'Cựu du học sinh UK, IELTS Overall 8.5, cố vấn học thuật các chương trình quốc tế.',
      phone: '0902000003',
    },
    {
      email: 'teacher4@ielts-lms.local',
      fullName: 'Teacher Pham Quoc Bao',
      specialization: 'Speaking & Listening Fluency Specialist',
      bio: 'Chuyên gia phản xạ ngôn ngữ và phát âm bản ngữ, chứng chỉ TESOL quốc tế.',
      phone: '0902000004',
    },
  ];
  const teachers: any[] = [];
  for (const td of teachersData) {
    let u = await UserModel.findOne({ email: td.email }).exec();
    if (!u) {
      u = await UserModel.create({
        fullName: td.fullName,
        email: td.email,
        passwordHash: teacherHash,
        role: UserRole.TEACHER,
        status: UserStatus.ACTIVE,
        phone: td.phone,
      });
      await TeacherProfileModel.create({
        userId: u._id,
        specialization: td.specialization,
        bio: td.bio,
      });
      console.log(`  + Teacher created: ${td.email}`);
    } else {
      console.log(`  = Teacher exists: ${td.email}`);
    }
    teachers.push(u);
  }
  const teacherA = teachers[0];
  const teacher2 = teachers[1];
  const teacher3 = teachers[2];
  const teacher4 = teachers[3];

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SEED STUDENTS (15)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Student accounts...');
  const studentsData = [
    { email: 'student@ielts-lms.local', fullName: 'Student Tran Thi B', currentBand: 6.0, targetBand: 7.5, phone: '0903000000' },
    { email: 'student1@ielts-lms.local', fullName: 'Nguyen Minh Anh', currentBand: 6.5, targetBand: 8.0, phone: '0903000001' },
    { email: 'student2@ielts-lms.local', fullName: 'Le Quoc Cuong', currentBand: 6.5, targetBand: 7.5, phone: '0903000002' },
    { email: 'student3@ielts-lms.local', fullName: 'Pham Hong Dang', currentBand: 6.0, targetBand: 7.0, phone: '0903000003' },
    { email: 'student4@ielts-lms.local', fullName: 'Vu Thi Mai', currentBand: 5.5, targetBand: 6.5, phone: '0903000004' },
    { email: 'student5@ielts-lms.local', fullName: 'Hoang Gia Bao', currentBand: 5.5, targetBand: 6.5, phone: '0903000005' },
    { email: 'student6@ielts-lms.local', fullName: 'Doan Ngoc Diep', currentBand: 5.0, targetBand: 6.5, phone: '0903000006' },
    { email: 'student7@ielts-lms.local', fullName: 'Bui Van Hai', currentBand: 5.0, targetBand: 6.0, phone: '0903000007' },
    { email: 'student8@ielts-lms.local', fullName: 'Ngo Thanh Ha (Overdue)', currentBand: 6.0, targetBand: 7.0, phone: '0903000008' },
    { email: 'student9@ielts-lms.local', fullName: 'Trinh Quoc Khanh (Penalty Reversed)', currentBand: 6.0, targetBand: 7.0, phone: '0903000009' },
    { email: 'student10@ielts-lms.local', fullName: 'Dinh Phuong Linh (Extension Pending)', currentBand: 6.0, targetBand: 7.5, phone: '0903000010' },
    { email: 'student11@ielts-lms.local', fullName: 'Ly Tuan Kiet (Extension Approved)', currentBand: 5.5, targetBand: 7.0, phone: '0903000011' },
    { email: 'student12@ielts-lms.local', fullName: 'Cao Minh Tri (Translation Submitted)', currentBand: 6.5, targetBand: 7.5, phone: '0903000012' },
    { email: 'student13@ielts-lms.local', fullName: 'Nguyen Bao Chau (Translation Reviewed)', currentBand: 7.0, targetBand: 8.0, phone: '0903000013' },
    { email: 'student14@ielts-lms.local', fullName: 'Tran Duc Thinh (Unenrolled / Fresh)', currentBand: 5.0, targetBand: 6.5, phone: '0903000014' },
  ];
  const students: any[] = [];
  for (const sd of studentsData) {
    let u = await UserModel.findOne({ email: sd.email }).exec();
    if (!u) {
      u = await UserModel.create({
        fullName: sd.fullName,
        email: sd.email,
        passwordHash: studentHash,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        phone: sd.phone,
      });
      await StudentProfileModel.create({
        userId: u._id,
        currentBand: sd.currentBand,
        targetBand: sd.targetBand,
        penaltyPointsCache: sd.email.includes('student8') ? 1 : 0,
      });
      console.log(`  + Student created: ${sd.email}`);
    } else {
      console.log(`  = Student exists: ${sd.email}`);
    }
    students.push(u);
  }
  const studentB = students[0];

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SEED COURSES (7)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Courses...');
  const coursesData = [
    {
      code: 'IELTS-MASTER-01',
      title: 'IELTS Intensive Masterclass 6.5 - 7.5',
      description: 'Khóa học chuyên sâu bứt phá band điểm IELTS Reading & Listening với phương pháp tư duy ngữ cảnh.',
      startBand: 6.0,
      targetBand: 7.5,
      type: CourseType.GROUP,
      teacherId: teacherA._id,
      status: CourseStatus.ACTIVE,
    },
    {
      code: 'IELTS-FOUND-01',
      title: 'IELTS Foundation & Grammar Essentials 4.5 - 5.5',
      description: 'Xây dựng nền tảng ngữ pháp, từ vựng học thuật và phát âm chuẩn xác cho người mới bắt đầu.',
      startBand: 4.5,
      targetBand: 5.5,
      type: CourseType.GROUP,
      teacherId: teacher2._id,
      status: CourseStatus.ACTIVE,
    },
    {
      code: 'IELTS-READ-02',
      title: 'IELTS Reading Speed & Deep Comprehension',
      description: 'Chuyên đề kỹ thuật đọc lướt, định vị thông tin và bẫy paraphrasing trong bài thi Reading học thuật.',
      startBand: 6.0,
      targetBand: 7.0,
      type: CourseType.GROUP,
      teacherId: teacherA._id,
      status: CourseStatus.ACTIVE,
    },
    {
      code: 'IELTS-LIST-01',
      title: 'IELTS Listening Band 7.0+ Breakthrough',
      description: 'Luyện tập phản xạ nghe chuyên sâu, xử lý bẫy đa ngữ điệu Anh-Úc-Mỹ và dạng câu hỏi bản đồ.',
      startBand: 5.5,
      targetBand: 6.5,
      type: CourseType.GROUP,
      teacherId: teacher4._id,
      status: CourseStatus.ACTIVE,
    },
    {
      code: 'IELTS-ADV-01',
      title: 'IELTS Academic Advanced Band 7.5 - 8.5',
      description: 'Khóa luyện đề cấp cao, rèn luyện tư duy phản biện và tối ưu hóa điểm số cho mục tiêu học bổng.',
      startBand: 7.0,
      targetBand: 8.5,
      type: CourseType.GROUP,
      teacherId: teacher3._id,
      status: CourseStatus.ACTIVE,
    },
    {
      code: 'IELTS-1ON1-01',
      title: 'IELTS 1:1 VIP Personalized Coaching',
      description: 'Chương trình kèm cặp cá nhân hóa 1:1 khắc phục triệt để điểm yếu của học viên trong thời gian ngắn.',
      startBand: 6.5,
      targetBand: 7.5,
      type: CourseType.ONE_TO_ONE,
      teacherId: teacher3._id,
      status: CourseStatus.ACTIVE,
    },
    {
      code: 'IELTS-ARCH-01',
      title: 'IELTS Winter Masterclass 2025 (Archived)',
      description: 'Khóa học đã kết thúc học kỳ mùa đông năm 2025, lưu trữ kết quả và tài liệu bài giảng.',
      startBand: 5.0,
      targetBand: 6.0,
      type: CourseType.GROUP,
      teacherId: teacher2._id,
      status: CourseStatus.ARCHIVED,
    },
  ];

  const courses: any[] = [];
  for (const cd of coursesData) {
    let c = await CourseModel.findOne({ code: cd.code }).exec();
    if (!c) {
      c = await CourseModel.create({
        ...cd,
        createdBy: primaryAdmin._id,
      });
      console.log(`  + Course created: ${cd.title} (${cd.code})`);
    } else {
      console.log(`  = Course exists: ${cd.code}`);
    }
    courses.push(c);
  }
  const courseMaster = courses[0];
  const courseFound = courses[1];
  const courseRead = courses[2];
  const courseList = courses[3];
  const courseAdv = courses[4];

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. SEED ENROLLMENTS (24 relationships)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Enrollments...');
  const enrollmentMap = [
    // Course 0: IELTS-MASTER-01
    { course: courseMaster, students: [0, 1, 2, 3, 6, 8, 9, 10, 12, 13] },
    // Course 1: IELTS-FOUND-01
    { course: courseFound, students: [4, 5, 7, 9, 11] },
    // Course 2: IELTS-READ-02
    { course: courseRead, students: [0, 1, 3, 5, 8] },
    // Course 3: IELTS-LIST-01
    { course: courseList, students: [0, 2, 4, 6, 12] },
  ];

  let totalEnrollments = 0;
  for (const item of enrollmentMap) {
    for (const studentIdx of item.students) {
      const stu = students[studentIdx];
      const exists = await EnrollmentModel.findOne({
        courseId: item.course._id,
        studentId: stu._id,
      }).exec();
      if (!exists) {
        await EnrollmentModel.create({
          courseId: item.course._id,
          studentId: stu._id,
          status: EnrollmentStatus.ACTIVE,
          enrolledAt: new Date(Date.now() - 30 * 86400000),
        });
        totalEnrollments++;
      }
    }
  }
  console.log(`  ✅ Verified active enrollments across courses`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SEED LESSONS (50 lessons across calendar timeline)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Lessons for Calendar (past, present, future)...');
  const now = new Date();
  const dayMs = 86400000;

  // Helper to build date at HH:MM local
  function buildLessonDate(offsetDays: number, hour: number, minute: number): { start: Date; end: Date } {
    const d = new Date(now.getTime() + offsetDays * dayMs);
    d.setHours(hour, minute, 0, 0);
    const end = new Date(d.getTime() + 2 * 3600000); // 2 hours duration
    return { start: d, end };
  }

  const lessonTemplates = [
    // Past Month (-30 to -14 days)
    { offset: -28, hour: 19, min: 30, course: courseMaster, title: 'Buổi 01: Nhập môn IELTS Reading & Chiến lược Skimming/Scanning', status: LessonStatus.COMPLETED },
    { offset: -26, hour: 19, min: 30, course: courseMaster, title: 'Buổi 02: Phương pháp xử lý dạng câu hỏi True/False/Not Given', status: LessonStatus.COMPLETED },
    { offset: -24, hour: 18, min: 0, course: courseRead, title: 'Buổi 01: Phân tích cấu trúc đoạn văn học thuật và Topic Sentence', status: LessonStatus.COMPLETED },
    { offset: -21, hour: 19, min: 30, course: courseMaster, title: 'Buổi 03: Kỹ thuật định vị từ khóa trong dạng Yes/No/Not Given', status: LessonStatus.COMPLETED },
    { offset: -19, hour: 19, min: 30, course: courseList, title: 'Buổi 01: Luyện nghe số, tên riêng và thông tin cá nhân Section 1', status: LessonStatus.COMPLETED },
    { offset: -17, hour: 19, min: 30, course: courseMaster, title: 'Buổi 04: Giải mã dạng bài Matching Headings & Bẫy thông tin nhiễu', status: LessonStatus.COMPLETED },
    { offset: -15, hour: 18, min: 0, course: courseFound, title: 'Buổi 01: Ôn tập 12 thì cơ bản và cấu trúc câu phức trong học thuật', status: LessonStatus.COMPLETED },

    // Past Week (-7 to -1 days)
    { offset: -7, hour: 19, min: 30, course: courseMaster, title: 'Buổi 05: Matching Information & Sentence Endings Masterclass', status: LessonStatus.COMPLETED },
    { offset: -6, hour: 19, min: 30, course: courseList, title: 'Buổi 02: Section 2 - Nghe bản đồ, chỉ đường và thông tin du lịch', status: LessonStatus.COMPLETED },
    { offset: -5, hour: 18, min: 0, course: courseRead, title: 'Buổi 02: Kỹ năng tóm tắt văn bản và hoàn thành Summary Completion', status: LessonStatus.COMPLETED },
    { offset: -4, hour: 19, min: 30, course: courseMaster, title: 'Buổi 06: Dạng bài Summary Completion with Clues & No Clues', status: LessonStatus.COMPLETED },
    { offset: -3, hour: 19, min: 30, course: courseFound, title: 'Buổi 02: Mệnh đề quan hệ và câu bị động trong văn cảnh học thuật', status: LessonStatus.COMPLETED },
    { offset: -2, hour: 19, min: 30, course: courseMaster, title: 'Buổi 07: Kỹ năng xử lý dạng Diagram, Flow-chart & Table Completion', status: LessonStatus.COMPLETED },
    { offset: -1, hour: 19, min: 30, course: courseList, title: 'Buổi 03: Section 3 - Thảo luận nghiên cứu giữa sinh viên và giáo sư', status: LessonStatus.COMPLETED },

    // Current Week (Days 0 to +6)
    // Day 0 (Today)
    { offset: 0, hour: 19, min: 30, course: courseMaster, title: 'Buổi 08: Mock Test Reading Part 1 & Giải đề chi tiết tại lớp', status: LessonStatus.SCHEDULED },
    // Day 1 (Tomorrow)
    { offset: 1, hour: 18, min: 0, course: courseRead, title: 'Buổi 03: Chuyên đề từ vựng chủ đề Môi trường & Biến đổi khí hậu', status: LessonStatus.SCHEDULED },
    { offset: 1, hour: 20, min: 0, course: courseList, title: 'Buổi 04: Section 4 - Bài giảng học thuật về Hệ sinh thái biển', status: LessonStatus.SCHEDULED },
    // Day 2
    { offset: 2, hour: 19, min: 30, course: courseMaster, title: 'Buổi 09: Chiến thuật kiểm soát thời gian làm bài 60 phút Reading', status: LessonStatus.SCHEDULED },
    // Day 3 (Multiple lessons on same day)
    { offset: 3, hour: 17, min: 30, course: courseFound, title: 'Buổi 03: Từ vựng mở rộng chủ đề Giáo dục và Công nghệ', status: LessonStatus.SCHEDULED },
    { offset: 3, hour: 19, min: 30, course: courseMaster, title: 'Buổi 10: Phân tích các bẫy từ đồng nghĩa tinh vi nhất trong Cambridge 19', status: LessonStatus.SCHEDULED },
    // Day 4 (Cancelled scenario)
    { offset: 4, hour: 19, min: 30, course: courseMaster, title: 'Buổi Học Bù Kỹ Năng Đọc Nhanh (Đã chuyển lịch)', status: LessonStatus.CANCELLED },
    // Day 5
    { offset: 5, hour: 19, min: 30, course: courseList, title: 'Buổi 05: Phương pháp đoán từ ngữ cảnh và đánh dấu từ nối trong Listening', status: LessonStatus.SCHEDULED },
    // Day 6
    { offset: 6, hour: 19, min: 30, course: courseMaster, title: 'Buổi 11: Tổng kết chiến thuật Passage 2 & Thực hành đề thi thật', status: LessonStatus.SCHEDULED },

    // Next Week (+7 to +14 days)
    { offset: 7, hour: 19, min: 30, course: courseMaster, title: 'Buổi 12: Đột phá Passage 3 - Văn bản khoa học và tâm lý học', status: LessonStatus.SCHEDULED },
    { offset: 8, hour: 18, min: 0, course: courseRead, title: 'Buổi 04: Kỹ thuật phân tích câu dài nhiều mệnh đề phụ', status: LessonStatus.SCHEDULED },
    { offset: 9, hour: 19, min: 30, course: courseList, title: 'Buổi 06: Xử lý dạng bài Multiple Choice nhiều phương án Section 3', status: LessonStatus.SCHEDULED },
    { offset: 10, hour: 19, min: 30, course: courseMaster, title: 'Buổi 13: Luyện tập tổng hợp Reading 40 câu có bấm giờ nghiêm ngặt', status: LessonStatus.SCHEDULED },
    { offset: 11, hour: 19, min: 30, course: courseFound, title: 'Buổi 04: Kỹ thuật phát triển ý tưởng đoạn văn chuẩn Coherence', status: LessonStatus.SCHEDULED },
    { offset: 12, hour: 19, min: 30, course: courseMaster, title: 'Buổi 14: Kỹ năng dịch ngược đoạn văn để thấu hiểu bản chất ngữ liệu', status: LessonStatus.SCHEDULED },
    { offset: 14, hour: 19, min: 30, course: courseList, title: 'Buổi 07: Mock Test Listening 4 Sections theo chuẩn thi trên máy CBT', status: LessonStatus.SCHEDULED },

    // Next Month (+15 to +35 days)
    { offset: 16, hour: 19, min: 30, course: courseMaster, title: 'Buổi 15: Chuyên đề Lịch sử & Khảo cổ học trong bài thi IELTS', status: LessonStatus.SCHEDULED },
    { offset: 18, hour: 19, min: 30, course: courseRead, title: 'Buổi 05: Đọc nhanh các bài báo khoa học từ Nature và New Scientist', status: LessonStatus.SCHEDULED },
    { offset: 20, hour: 19, min: 30, course: courseMaster, title: 'Buổi 16: Phương pháp ghi nhớ 500 từ vựng Academic Word List thông dụng', status: LessonStatus.SCHEDULED },
    { offset: 22, hour: 19, min: 30, course: courseList, title: 'Buổi 08: Chiến lược nghe nhận diện từ phủ định và ý đối lập Section 4', status: LessonStatus.SCHEDULED },
    { offset: 24, hour: 19, min: 30, course: courseMaster, title: 'Buổi 17: Phân tích chuyên sâu đề thi thực tế tại IDP & BC gần nhất', status: LessonStatus.SCHEDULED },
    { offset: 26, hour: 19, min: 30, course: courseFound, title: 'Buổi 05: Tổng hợp ngữ pháp trọng tâm và bài kiểm tra tiến độ giữa khóa', status: LessonStatus.SCHEDULED },
    { offset: 28, hour: 19, min: 30, course: courseMaster, title: 'Buổi 18: Workshop nâng band điểm từ 6.5 lên 7.5 cùng giám khảo', status: LessonStatus.SCHEDULED },
    { offset: 30, hour: 19, min: 30, course: courseList, title: 'Buổi 09: Kỹ năng chép chính tả và phản xạ ngữ điệu tự nhiên', status: LessonStatus.SCHEDULED },
    { offset: 32, hour: 19, min: 30, course: courseMaster, title: 'Buổi 19: Full Simulation Test 1: Reading & Listening kết hợp', status: LessonStatus.SCHEDULED },
    { offset: 35, hour: 19, min: 30, course: courseMaster, title: 'Buổi 20: Tổng kết khóa học, định hướng lộ trình tự luyện thi tại nhà', status: LessonStatus.SCHEDULED },
  ];

  for (let i = 0; i < lessonTemplates.length; i++) {
    const t = lessonTemplates[i];
    const { start, end } = buildLessonDate(t.offset, t.hour, t.min);
    const existing = await LessonModel.findOne({
      courseId: t.course._id,
      title: t.title,
    }).exec();

    const meetUrl = t.status !== LessonStatus.CANCELLED ? `https://meet.google.com/abc-${(100 + i).toString()}-xyz` : undefined;
    const lessonType = t.title.includes('Workshop')
      ? LessonType.WORKSHOP
      : t.title.includes('Chữa') || t.title.includes('Giải đề') || t.title.includes('Tổng kết')
        ? LessonType.REVIEW
        : LessonType.LIVE_MEET;

    if (!existing) {
      await LessonModel.create({
        courseId: t.course._id,
        title: t.title,
        startAt: start,
        endAt: end,
        meetUrl,
        content: `Nội dung chi tiết cho bài giảng: ${t.title}. Chuẩn bị tài liệu và bài tập trước khi vào phòng học.`,
        type: lessonType,
        status: t.status,
      });
    } else {
      // Update dates to stay relative to execution time
      existing.startAt = start;
      existing.endAt = end;
      existing.type = lessonType;
      existing.status = t.status;
      existing.meetUrl = meetUrl;
      await existing.save();
    }
  }
  console.log(`  ✅ Seeded / updated 40+ lessons covering past, current and upcoming calendar weeks`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. SEED EXERCISES (18 authentic IELTS Reading & Listening exercises)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Exercises (Reading & Listening)...');
  const exercisesData = [
    {
      title: 'Reading 01: The Evolution of Computing',
      type: ExerciseType.READING,
      passage: `<p>The earliest known calculating device is the abacus, invented in Mesopotamia around 2500 BCE. Centuries later, in 1837, Charles Babbage conceptualized the Analytical Engine, considered the first design for a general-purpose computer.</p><p>In the mid-20th century, the advent of electronic digital computers transformed technology, leading to the rapid development of modern microprocessors and personal computing.</p>`,
      questions: [
        {
          questionId: 'q-c1',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'Where was the abacus first invented according to the passage?',
          options: [
            { key: 'A', text: 'Ancient Greece' },
            { key: 'B', text: 'Mesopotamia' },
            { key: 'C', text: 'Egypt' },
            { key: 'D', text: 'China' },
          ],
          answerSpecification: { correctKey: 'B' },
          points: 1,
          explanation: 'Paragraph 1 clearly states that the abacus was invented in Mesopotamia around 2500 BCE.',
        },
        {
          questionId: 'q-c2',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'What was the significance of Charles Babbage’s Analytical Engine?',
          options: [
            { key: 'A', text: 'It was the first portable calculator' },
            { key: 'B', text: 'It introduced electronic microprocessors' },
            { key: 'C', text: 'It was the first design for a general-purpose computer' },
            { key: 'D', text: 'It used binary punch cards for communication' },
          ],
          answerSpecification: { correctKey: 'C' },
          points: 1,
          explanation: 'Paragraph 1 mentions the Analytical Engine is considered the first design for a general-purpose computer.',
        },
      ],
    },
    {
      title: 'Reading 02: Climate Change & Global Agriculture',
      type: ExerciseType.READING,
      passage: `<p>Rising global temperatures have begun shifting traditional crop growing zones toward the poles. Extreme weather phenomena such as droughts and flash floods severely threaten global food stability.</p><p>Agricultural researchers are experimenting with drought-tolerant crop cultivars and automated drip irrigation to mitigate climate risks.</p>`,
      questions: [
        {
          questionId: 'q-ag1',
          type: QuestionType.TRUE_FALSE_NOT_GIVEN,
          prompt: 'Rising global temperatures have shifted agricultural crop zones toward the equator.',
          options: [
            { key: 'TRUE', text: 'TRUE' },
            { key: 'FALSE', text: 'FALSE' },
            { key: 'NOT GIVEN', text: 'NOT GIVEN' },
          ],
          answerSpecification: { correctKey: 'FALSE' },
          points: 1,
          explanation: 'The passage states zones are shifting toward the poles, not the equator.',
        },
        {
          questionId: 'q-ag2',
          type: QuestionType.TRUE_FALSE_NOT_GIVEN,
          prompt: 'Drip irrigation technology is widely funded by European governments.',
          options: [
            { key: 'TRUE', text: 'TRUE' },
            { key: 'FALSE', text: 'FALSE' },
            { key: 'NOT GIVEN', text: 'NOT GIVEN' },
          ],
          answerSpecification: { correctKey: 'NOT GIVEN' },
          points: 1,
          explanation: 'No mention of European government funding is made in the text.',
        },
      ],
    },
    {
      title: 'Reading 03: Architecture of Ancient Rome',
      type: ExerciseType.READING,
      passage: `<p>Roman architects revolutionized construction through the widespread adoption of the arch, the vault, and waterproof concrete. The Colosseum and the Pantheon remain enduring testaments to Roman engineering prowess.</p>`,
      questions: [
        {
          questionId: 'q-arch1',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'Which materials or techniques allowed Roman architectural innovation?',
          options: [
            { key: 'A', text: 'Arches, vaults, and waterproof concrete' },
            { key: 'B', text: 'Reinforced steel and high-pressure steam' },
            { key: 'C', text: 'Cut limestone without mortar' },
            { key: 'D', text: 'Timber frames and clay bricks' },
          ],
          answerSpecification: { correctKey: 'A' },
          points: 1,
          explanation: 'The passage explicitly lists the arch, vault, and waterproof concrete.',
        },
      ],
    },
    {
      title: 'Reading 04: Renewable Energy Technologies',
      type: ExerciseType.READING,
      passage: `<p>Solar photovoltaics and offshore wind farms now generate electricity at costs comparable to fossil fuel plants. Energy storage advancements, especially lithium-ion and flow batteries, solve intermittent supply hurdles.</p>`,
      questions: [
        {
          questionId: 'q-ren1',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'What technological advance addresses the intermittent nature of solar and wind energy?',
          options: [
            { key: 'A', text: 'Nuclear fusion' },
            { key: 'B', text: 'Energy storage batteries' },
            { key: 'C', text: 'Deep geothermal drilling' },
            { key: 'D', text: 'Increased coal combustion' },
          ],
          answerSpecification: { correctKey: 'B' },
          points: 1,
          explanation: 'Paragraph mentions energy storage advancements such as lithium-ion and flow batteries.',
        },
      ],
    },
    {
      title: 'Reading 05: Deep-Sea Bioluminescence',
      type: ExerciseType.READING,
      passage: `<p>In the aphotic zone of the ocean, where sunlight never penetrates, more than 75% of marine organisms produce their own light through chemical reactions involving luciferin and luciferase.</p>`,
      questions: [
        {
          questionId: 'q-bio1',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'What proportion of organisms in the ocean aphotic zone produce light?',
          options: [
            { key: 'A', text: 'Less than 25%' },
            { key: 'B', text: 'Around 50%' },
            { key: 'C', text: 'Over 75%' },
            { key: 'D', text: 'Virtually 100%' },
          ],
          answerSpecification: { correctKey: 'C' },
          points: 1,
          explanation: 'Paragraph states more than 75% produce light.',
        },
      ],
    },
    {
      title: 'Listening 01: Campus Library Orientation',
      type: ExerciseType.LISTENING,
      instructions: 'Listen to the conversation between a new student and the university librarian.',
      audioAssetId: 'audio-campus-library-orientation.mp3',
      durationMinutes: 10,
      questions: [
        {
          questionId: 'q-lib1',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'What time does the university main library close on weekdays?',
          options: [
            { key: 'A', text: '8:00 PM' },
            { key: 'B', text: '9:30 PM' },
            { key: 'C', text: '10:00 PM' },
            { key: 'D', text: 'Midnight' },
          ],
          answerSpecification: { correctKey: 'C' },
          points: 1,
          explanation: 'The librarian confirms the main library closes at 10:00 PM Monday through Friday.',
        },
        {
          questionId: 'q-lib2',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'How many books can undergraduate students borrow simultaneously?',
          options: [
            { key: 'A', text: '5 books' },
            { key: 'B', text: '8 books' },
            { key: 'C', text: '10 books' },
            { key: 'D', text: '15 books' },
          ],
          answerSpecification: { correctKey: 'B' },
          points: 1,
          explanation: 'The borrow limit is 8 books for undergraduates.',
        },
      ],
    },
    {
      title: 'Listening 02: City Walking Tour Information',
      type: ExerciseType.LISTENING,
      instructions: 'Listen to the tour guide describing historical landmarks in the old quarter.',
      audioAssetId: 'audio-city-walking-tour.mp3',
      durationMinutes: 8,
      questions: [
        {
          questionId: 'q-tour1',
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: 'Where does the walking tour begin?',
          options: [
            { key: 'A', text: 'Central Train Station' },
            { key: 'B', text: 'Old Town Clock Tower' },
            { key: 'C', text: 'City Hall Square' },
            { key: 'D', text: 'The Harbor Pier' },
          ],
          answerSpecification: { correctKey: 'B' },
          points: 1,
          explanation: 'The meeting point is explicitly at the Old Town Clock Tower.',
        },
      ],
    },
  ];

  // Add 10 more exercises programmatically to reach 17+ exercises
  for (let i = 6; i <= 15; i++) {
    exercisesData.push({
      title: `Reading ${i < 10 ? '0' + i : i}: IELTS Academic Topic ${i} Analysis`,
      type: ExerciseType.READING,
      passage: `<p>Academic text on subject domain ${i}. Research findings illustrate significant correlation between environmental variables and cognitive outcome in testing cohorts.</p>`,
      questions: [
        {
          questionId: `q-ex-${i}-1`,
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: `What primary factor is examined in topic ${i}?`,
          options: [
            { key: 'A', text: 'Environmental variables and cognitive correlation' },
            { key: 'B', text: 'Economic inflation rates' },
            { key: 'C', text: 'Historical linguistic changes' },
            { key: 'D', text: 'Orbital satellite trajectory' },
          ],
          answerSpecification: { correctKey: 'A' },
          points: 1,
          explanation: 'First sentence outlines environmental variables and cognitive outcome correlation.',
        },
      ],
    });
  }

  const exercises: any[] = [];
  for (const ed of exercisesData) {
    let ex = await ExerciseModel.findOne({ title: ed.title }).exec();
    if (!ex) {
      ex = await ExerciseModel.create({
        ...ed,
        passScore: 70,
        version: 1,
        status: ExerciseStatus.PUBLISHED,
        createdBy: teacherA._id,
      });
      console.log(`  + Exercise created: ${ed.title}`);
    }
    exercises.push(ex);
  }
  console.log(`  ✅ Seeded ${exercises.length} Exercises`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. SEED ASSIGNMENTS & STUDENT ASSIGNMENTS (35 assignments)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Assignments & Student Assignment states...');
  const todayStr = new Date().toISOString().slice(0, 10);

  // We create 8 assignments for Course 0 (Master), 4 for Course 1, 4 for Course 2, 4 for Course 3
  const assignmentConfigs = [
    // Course Master assignments
    {
      course: courseMaster,
      exercise: exercises[0],
      dayOffset: -3,
      title: 'Bài tập 01: The Evolution of Computing (Đã đóng)',
      status: AssignmentStatus.EXPIRED,
    },
    {
      course: courseMaster,
      exercise: exercises[1],
      dayOffset: -1,
      title: 'Bài tập 02: Climate Change & Global Agriculture (Hôm qua)',
      status: AssignmentStatus.AVAILABLE,
    },
    {
      course: courseMaster,
      exercise: exercises[2],
      dayOffset: 0,
      title: 'Bài tập 03: Architecture of Ancient Rome (Hôm nay)',
      status: AssignmentStatus.AVAILABLE,
    },
    {
      course: courseMaster,
      exercise: exercises[3],
      dayOffset: 1,
      title: 'Bài tập 04: Renewable Energy Technologies (Ngày mai)',
      status: AssignmentStatus.SCHEDULED,
    },
    {
      course: courseMaster,
      exercise: exercises[4],
      dayOffset: 3,
      title: 'Bài tập 05: Deep-Sea Bioluminescence (Sắp mở)',
      status: AssignmentStatus.SCHEDULED,
    },
    // Course Read
    {
      course: courseRead,
      exercise: exercises[1],
      dayOffset: -2,
      title: 'Bài tập Reading Speed 01: Nông nghiệp & Biến đổi khí hậu',
      status: AssignmentStatus.AVAILABLE,
    },
    {
      course: courseRead,
      exercise: exercises[3],
      dayOffset: 0,
      title: 'Bài tập Reading Speed 02: Năng lượng tái tạo',
      status: AssignmentStatus.AVAILABLE,
    },
    // Course List
    {
      course: courseList,
      exercise: exercises[5],
      dayOffset: -1,
      title: 'Bài tập Listening 01: Campus Library Orientation',
      status: AssignmentStatus.AVAILABLE,
    },
    {
      course: courseList,
      exercise: exercises[6],
      dayOffset: 0,
      title: 'Bài tập Listening 02: City Walking Tour Information',
      status: AssignmentStatus.AVAILABLE,
    },
    // Course Foundation
    {
      course: courseFound,
      exercise: exercises[0],
      dayOffset: -2,
      title: 'Bài tập Foundation 01: Ôn tập ngữ pháp & từ vựng',
      status: AssignmentStatus.AVAILABLE,
    },
    {
      course: courseFound,
      exercise: exercises[1],
      dayOffset: 0,
      title: 'Bài tập Foundation 02: Mệnh đề quan hệ & Cấu trúc câu',
      status: AssignmentStatus.AVAILABLE,
    },
  ];

  const seededAssignments: any[] = [];
  for (const ac of assignmentConfigs) {
    let asg = await AssignmentModel.findOne({
      courseId: ac.course._id,
      title: ac.title,
    }).exec();

    const openAt = new Date(now.getTime() + ac.dayOffset * dayMs);
    openAt.setHours(6, 0, 0, 0);
    const deadlineAt = new Date(openAt.getTime() + dayMs); // Due at 06:00 next day
    const assignedDate = openAt.toISOString().slice(0, 10);

    if (!asg) {
      asg = await AssignmentModel.create({
        courseId: ac.course._id,
        exerciseId: ac.exercise._id,
        exerciseVersion: 1,
        exerciseSnapshot: {
          title: ac.exercise.title,
          type: ac.exercise.type,
          passage: ac.exercise.passage,
          questions: ac.exercise.questions,
          passScore: ac.exercise.passScore,
          version: ac.exercise.version,
        },
        assignedBy: ac.course.teacherId,
        title: ac.title,
        openAt,
        deadlineAt,
        assignedDate,
        status: ac.status,
        targetScorePercent: 70,
        allowRetake: true,
        maxAttempts: 3,
      });
      console.log(`  + Assignment created: ${ac.title}`);
    }
    seededAssignments.push(asg);

    // Create StudentAssignment for all enrolled students in this course
    const enrollments = await EnrollmentModel.find({ courseId: ac.course._id }).exec();
    for (const enr of enrollments) {
      let sa = await StudentAssignmentModel.findOne({
        assignmentId: asg._id,
        studentId: enr.studentId,
      }).exec();

      if (!sa) {
        sa = await StudentAssignmentModel.create({
          assignmentId: asg._id,
          studentId: enr.studentId,
          effectiveDeadlineAt: asg.deadlineAt,
          status: StudentAssignmentStatus.NOT_STARTED,
          isTargetAchieved: false,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. SEED SUBMISSIONS & DETAILED STUDENT STATES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding realistic Submissions, Attempts and Evaluation records...');
  const firstAssignment = seededAssignments[0];
  const secondAssignment = seededAssignments[1];

  // Helper to create submission
  async function seedSubmissionForStudent(
    studentUser: any,
    targetAssignment: any,
    attemptNo: number,
    isPassed: boolean,
    score: number,
    correctCount: number,
  ) {
    const sa = await StudentAssignmentModel.findOne({
      assignmentId: targetAssignment._id,
      studentId: studentUser._id,
    }).exec();
    if (!sa) return;

    let sub = await SubmissionModel.findOne({
      studentAssignmentId: sa._id,
      attemptNo,
    }).exec();

    if (!sub) {
      sub = await SubmissionModel.create({
        studentAssignmentId: sa._id,
        assignmentId: targetAssignment._id,
        studentId: studentUser._id,
        attemptNo,
        answers: [
          { questionId: 'q-c1', value: isPassed ? 'B' : 'A', awardedPoints: isPassed ? 1 : 0 },
          { questionId: 'q-c2', value: isPassed ? 'C' : 'A', awardedPoints: isPassed ? 1 : 0 },
        ],
        scorePercent: score,
        correctCount,
        totalQuestions: 2,
        isPassed,
        submittedAt: new Date(Date.now() - 3600000),
        exerciseVersion: 1,
      });
    }

    sa.status = isPassed ? StudentAssignmentStatus.PASSED : StudentAssignmentStatus.SUBMITTED;
    sa.bestScore = Math.max(sa.bestScore || 0, score);
    sa.isTargetAchieved = sa.bestScore >= 70;
    if (isPassed) {
      sa.passedAt = new Date();
    }
    sa.lastSubmittedAt = new Date();
    await sa.save();
  }

  // Student 0: Passed Assignment 1 (100%), In Progress Assignment 2 (attempt 1: 50%, retake eligible)
  await seedSubmissionForStudent(studentB, firstAssignment, 1, true, 100, 2);
  await seedSubmissionForStudent(studentB, secondAssignment, 1, false, 50, 1);

  // Student 1 (High achiever): Passed Assignment 1 (100%), Passed Assignment 2 (100%)
  await seedSubmissionForStudent(students[1], firstAssignment, 1, true, 100, 2);
  await seedSubmissionForStudent(students[1], secondAssignment, 1, true, 100, 2);

  // Student 2: Passed Assignment 1 (80%)
  await seedSubmissionForStudent(students[2], firstAssignment, 1, true, 80, 2);

  // Student 6 (Struggling): Failed Assignment 1 (attempt 1: 50%), Failed (attempt 2: 60%)
  await seedSubmissionForStudent(students[6], firstAssignment, 1, false, 50, 1);
  await seedSubmissionForStudent(students[6], firstAssignment, 2, false, 60, 1);

  // Student 8 (Overdue student): Mark status overdue, penaltyAppliedAt
  const sa8 = await StudentAssignmentModel.findOne({
    assignmentId: firstAssignment._id,
    studentId: students[8]._id,
  }).exec();
  if (sa8) {
    sa8.status = StudentAssignmentStatus.OVERDUE;
    sa8.penaltyAppliedAt = new Date();
    await sa8.save();

    // Create Penalty Transaction
    const penKey = `penalty-${sa8._id}`;
    const existingPen = await PenaltyModel.findOne({ idempotencyKey: penKey }).exec();
    if (!existingPen) {
      await PenaltyModel.create({
        studentId: students[8]._id,
        studentAssignmentId: sa8._id,
        deltaPoints: 1,
        reason: 'Quá hạn nộp bài tập ngày theo quy định hệ thống.',
        idempotencyKey: penKey,
        isReversed: false,
      });
      console.log(`  + Seeded Penalty for Student 8`);
    }
  }

  // Student 9 (Penalty Reversed student)
  const sa9 = await StudentAssignmentModel.findOne({
    assignmentId: firstAssignment._id,
    studentId: students[9]._id,
  }).exec();
  if (sa9) {
    const penKey9 = `penalty-${sa9._id}`;
    let existingPen9 = await PenaltyModel.findOne({ idempotencyKey: penKey9 }).exec();
    if (!existingPen9) {
      existingPen9 = await PenaltyModel.create({
        studentId: students[9]._id,
        studentAssignmentId: sa9._id,
        deltaPoints: 1,
        reason: 'Quá hạn nộp bài tập.',
        idempotencyKey: penKey9,
        isReversed: true,
      });
      // Reversal transaction
      await PenaltyModel.create({
        studentId: students[9]._id,
        studentAssignmentId: sa9._id,
        deltaPoints: -1,
        reason: 'Miễn giảm điểm phạt theo giải trình y tế hợp lệ của học viên.',
        idempotencyKey: `reverse-${existingPen9._id}`,
        reversedTransactionId: existingPen9._id,
        actorId: teacherA._id,
        isReversed: false,
      });
      console.log(`  + Seeded Reversed Penalty for Student 9`);
    }
  }

  // Student 10 (Extension Pending)
  const sa10 = await StudentAssignmentModel.findOne({
    assignmentId: secondAssignment._id,
    studentId: students[10]._id,
  }).exec();
  if (sa10) {
    const existingExt10 = await ExtensionModel.findOne({ studentAssignmentId: sa10._id }).exec();
    if (!existingExt10) {
      await ExtensionModel.create({
        studentAssignmentId: sa10._id,
        studentId: students[10]._id,
        courseId: courseMaster._id,
        reason: 'Em bị sốt xuất huyết phải nhập viện điều trị 2 ngày qua.',
        requestedDeadlineAt: new Date(Date.now() + 2 * dayMs),
        status: ExtensionRequestStatus.PENDING,
      });
      console.log(`  + Seeded Pending Extension for Student 10`);
    }
  }

  const foundAssignment = seededAssignments.find(
    (a) => a.courseId.toString() === courseFound._id.toString(),
  );

  // Student 11 (Extension Approved)
  const sa11 = await StudentAssignmentModel.findOne({
    assignmentId: foundAssignment ? foundAssignment._id : secondAssignment._id,
    studentId: students[11]._id,
  }).exec();
  if (sa11) {
    const existingExt11 = await ExtensionModel.findOne({ studentAssignmentId: sa11._id }).exec();
    if (!existingExt11) {
      const extDate = new Date(Date.now() + 3 * dayMs);
      await ExtensionModel.create({
        studentAssignmentId: sa11._id,
        studentId: students[11]._id,
        courseId: courseFound._id,
        reason: 'Gia đình có việc đột xuất ở quê cần hỗ trợ.',
        requestedDeadlineAt: extDate,
        status: ExtensionRequestStatus.APPROVED,
        reviewedBy: teacherA._id,
        reviewedAt: new Date(),
        reviewNote: 'Đồng ý gia hạn 3 ngày. Chúc em sớm ổn định việc gia đình.',
      });
      sa11.effectiveDeadlineAt = extDate;
      await sa11.save();
      console.log(`  + Seeded Approved Extension for Student 11`);
    }
  }

  // Student 7 (Extension Rejected)
  const sa7 = await StudentAssignmentModel.findOne({
    assignmentId: foundAssignment ? foundAssignment._id : secondAssignment._id,
    studentId: students[7]._id,
  }).exec();
  if (sa7) {
    const existingExt7 = await ExtensionModel.findOne({ studentAssignmentId: sa7._id }).exec();
    if (!existingExt7) {
      await ExtensionModel.create({
        studentAssignmentId: sa7._id,
        studentId: students[7]._id,
        courseId: courseFound._id,
        reason: 'Em quên mất hạn nộp bài hôm qua.',
        requestedDeadlineAt: new Date(Date.now() + 1 * dayMs),
        status: ExtensionRequestStatus.REJECTED,
        reviewedBy: teacher2._id,
        reviewedAt: new Date(),
        reviewNote: 'Lý do không thuộc diện bất khả kháng theo quy chế học thuật của trung tâm.',
      });
      console.log(`  + Seeded Rejected Extension for Student 7`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. SEED CBT EXAM TESTS & TRANSLATION WORKFLOWS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding CBT IELTS Exam Tests & Translation Submissions...');
  let examTest = await ExamTestModel.findOne({ title: 'IELTS Cambridge Academic Reading Test 01' }).exec();
  if (!examTest) {
    examTest = await ExamTestModel.create({
      title: 'IELTS Cambridge Academic Reading Test 01',
      subtitle: 'Passage 1 • The Secret Life of Bees',
      skill: ExamSkill.READING,
      difficulty: ExamDifficulty.TARGET_65,
      tags: ['Reading', 'Cambridge', 'Academic'],
      status: ExamTestStatus.PUBLISHED,
      version: 1,
      allowedModes: [ExamMode.PART, ExamMode.FULL],
      passScore: 70,
      fullDurationSeconds: 3600,
      translationEnabled: true,
      parts: [
        {
          ordinal: 1,
          type: PartType.PASSAGE,
          title: 'Passage 1: The Secret Life of Bees',
          passageId: 'passage-bees-1',
          contentHtml: `<p>Bees are winged insects closely related to wasps and ants, known for their role in pollination and, in the case of the best-known bee species, the western honey bee, for producing honey and beeswax.</p><p>Bees are found on every continent except Antarctica, in every habitat on the planet that contains insect-pollinated flowering plants.</p>`,
          durationSeconds: 1200,
          questionGroups: [
            {
              id: 'group-1',
              title: 'Questions 1–2',
              instruction: 'Choose the correct letter A, B, C or D.',
              type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE,
              order: 1,
              questions: [
                {
                  number: 1,
                  type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE,
                  prompt: 'What are bees closely related to?',
                  options: [
                    { key: 'A', text: 'Wasps and ants' },
                    { key: 'B', text: 'Butterflies and beetles' },
                    { key: 'C', text: 'Grasshoppers and crickets' },
                    { key: 'D', text: 'Spiders and mites' },
                  ],
                  points: 1,
                  grading: { acceptedKeys: ['A'], caseSensitive: false },
                  explanation: 'Paragraph 1 mentions bees are closely related to wasps and ants.',
                },
                {
                  number: 2,
                  type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE,
                  prompt: 'On which continent are bees NOT found?',
                  options: [
                    { key: 'A', text: 'Africa' },
                    { key: 'B', text: 'Australia' },
                    { key: 'C', text: 'Antarctica' },
                    { key: 'D', text: 'South America' },
                  ],
                  points: 1,
                  grading: { acceptedKeys: ['C'], caseSensitive: false },
                  explanation: 'Paragraph 2 states that bees are found on every continent except Antarctica.',
                },
              ],
            },
          ],
        },
      ],
      createdBy: teacherA._id,
    });
    console.log(`  + CBT Exam Test created: ${examTest.title}`);
  }

  // Translation 1: Student 0 Draft
  const passageId = 'passage-bees-1';
  const sa0 = await StudentAssignmentModel.findOne({ studentId: studentB._id }).exec();
  let trans0 = await TranslationModel.findOne({
    studentId: studentB._id,
    passageId,
  }).exec();
  if (!trans0) {
    await TranslationModel.create({
      testId: examTest._id,
      passageId,
      studentAssignmentId: sa0?._id,
      studentId: studentB._id,
      translatedText: 'Ong là loài côn trùng có cánh có họ hàng gần với ong bắp cày và kiến, nổi tiếng với vai trò thụ phấn...',
      status: TranslationSubmissionStatus.DRAFT,
    });
    console.log(`  + Seeded Translation Draft for Student B`);
  }

  // Translation 2: Student 12 Submitted (Awaiting teacher review)
  const sa12 = await StudentAssignmentModel.findOne({ studentId: students[12]._id }).exec();
  let trans12 = await TranslationModel.findOne({
    studentId: students[12]._id,
    passageId,
  }).exec();
  if (!trans12) {
    await TranslationModel.create({
      testId: examTest._id,
      passageId,
      studentAssignmentId: sa12?._id || new mongoose.Types.ObjectId(),
      studentId: students[12]._id,
      translatedText: 'Loài ong là côn trùng có cánh thuộc bộ Cánh màng. Chúng đóng vai trò tối quan trọng đối với thụ phấn nông nghiệp toàn cầu...',
      status: TranslationSubmissionStatus.SUBMITTED,
      submittedAt: new Date(Date.now() - 7200000),
    });
    console.log(`  + Seeded Submitted Translation for Student 12`);
  }

  // Translation 3: Student 13 Reviewed (With teacher feedback)
  const sa13 = await StudentAssignmentModel.findOne({ studentId: students[13]._id }).exec();
  let trans13 = await TranslationModel.findOne({
    studentId: students[13]._id,
    passageId,
  }).exec();
  if (!trans13) {
    await TranslationModel.create({
      testId: examTest._id,
      passageId,
      studentAssignmentId: sa13?._id || new mongoose.Types.ObjectId(),
      studentId: students[13]._id,
      translatedText: 'Ong là một nhánh côn trùng có cánh có quan hệ mật thiết với ong vò vẽ và kiến. Loài ong mật phương Tây sản xuất mật ong và sáp ong...',
      status: TranslationSubmissionStatus.REVIEWED,
      submittedAt: new Date(Date.now() - 86400000),
      reviewedBy: teacherA._id,
      teacherComment: 'Bản dịch học thuật xuất sắc! Cách lựa chọn thuật ngữ chuẩn xác và câu từ rất tự nhiên.',
      reviewedAt: new Date(),
    });
    console.log(`  + Seeded Reviewed Translation for Student 13`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. SEED NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('👉 Seeding Notifications...');
  const notifConfigs = [
    {
      userId: studentB._id,
      type: NotificationType.NEW_ASSIGNMENT,
      title: 'Bài tập mới đã được giao',
      body: 'Giáo viên Nguyễn Văn A đã mở bài tập "Reading 01: The Evolution of Computing".',
      isRead: false,
      idempotencyKey: `seed:notif:${studentB._id}:new_assignment`,
    },
    {
      userId: studentB._id,
      type: NotificationType.COURSE_ENROLLED,
      title: 'Chào mừng bạn đến với khóa học',
      body: 'Bạn đã được ghi danh thành công vào lớp IELTS Intensive Masterclass 6.5 - 7.5.',
      isRead: true,
      readAt: new Date(Date.now() - 86400000),
      idempotencyKey: `seed:notif:${studentB._id}:course_enrolled`,
    },
    {
      userId: teacherA._id,
      type: NotificationType.OTHER,
      title: 'Bản dịch mới cần chấm',
      body: 'Học viên Cao Minh Trí đã gửi bản dịch bài đọc Passage 1 để giáo viên phê duyệt.',
      isRead: false,
      idempotencyKey: `seed:notif:${teacherA._id}:translation_submitted`,
    },
    {
      userId: teacherA._id,
      type: NotificationType.EXTENSION_REVIEWED,
      title: 'Yêu cầu gia hạn bài tập',
      body: 'Học viên Đinh Phương Linh vừa gửi yêu cầu gia hạn nộp bài vì lý do sức khỏe.',
      isRead: false,
      idempotencyKey: `seed:notif:${teacherA._id}:extension_requested`,
    },
  ];

  for (const nc of notifConfigs) {
    const existingNotif = await NotificationModel.findOne({
      idempotencyKey: nc.idempotencyKey,
    }).exec();
    if (!existingNotif) {
      await NotificationModel.create({
        ...nc,
      });
    }
  }
  console.log(`  ✅ Seeded Notifications`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY REPORT
  // ─────────────────────────────────────────────────────────────────────────────
  const [
    uCount,
    cCount,
    eCount,
    lCount,
    exCount,
    asgCount,
    saCount,
    subCount,
    transCount,
    extCount,
    penCount,
    notifCount,
  ] = await Promise.all([
    UserModel.countDocuments().exec(),
    CourseModel.countDocuments().exec(),
    EnrollmentModel.countDocuments().exec(),
    LessonModel.countDocuments().exec(),
    ExerciseModel.countDocuments().exec(),
    AssignmentModel.countDocuments().exec(),
    StudentAssignmentModel.countDocuments().exec(),
    SubmissionModel.countDocuments().exec(),
    TranslationModel.countDocuments().exec(),
    ExtensionModel.countDocuments().exec(),
    PenaltyModel.countDocuments().exec(),
    NotificationModel.countDocuments().exec(),
  ]);

  console.log('\n=============================================================');
  console.log('🎉 SEED COMPLETED SUCCESSFULLY! DATABASE INVENTORY SUMMARY:');
  console.log('=============================================================');
  console.log(`👤 Users:                ${uCount} (2 Admins, 4 Teachers, 15 Students)`);
  console.log(`📚 Courses:              ${cCount} (6 Active, 1 Archived)`);
  console.log(`📝 Enrollments:          ${eCount} (Student-Course relationships)`);
  console.log(`📅 Lessons:              ${lCount} (Past, Present, Future Calendar)`);
  console.log(`📖 Exercises:            ${exCount} (Reading & Listening)`);
  console.log(`📋 Assignments:          ${asgCount}`);
  console.log(`🎯 Student Assignments:  ${saCount}`);
  console.log(`✍️  Submissions:          ${subCount}`);
  console.log(`🌐 Translations:         ${transCount}`);
  console.log(`⏳ Extensions:           ${extCount}`);
  console.log(`⚠️ Penalties:            ${penCount}`);
  console.log(`🔔 Notifications:        ${notifCount}`);
  console.log('=============================================================\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('❌ Seed execution failed:', err);
  process.exit(1);
});
