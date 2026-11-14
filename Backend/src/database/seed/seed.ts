import * as mongoose from 'mongoose';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { ExamTest, ExamTestSchema } from '../schemas/exam-test.schema';
import { ExamSkill, ExamMode, ExamPreset, ExamTestStatus, ExamQuestionType, PartType } from '../schemas/enums';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@ielts-lms.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
const ADMIN_FULLNAME = process.env.SEED_ADMIN_FULLNAME || 'System Admin';

const UserSchema = new mongoose.Schema(
  {
    fullName: String,
    email: { type: String, lowercase: true, unique: true },
    passwordHash: String,
    role: { type: String, enum: ['student', 'teacher', 'admin'] },
    status: { type: String, default: 'active' },
    phone: String,
  },
  { timestamps: true },
);

const StudentProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Types.ObjectId, unique: true },
    currentBand: Number,
    targetBand: Number,
    penaltyPointsCache: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const TeacherProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Types.ObjectId, unique: true },
    specialization: String,
    bio: String,
  },
  { timestamps: true },
);

const CourseSchema = new mongoose.Schema(
  {
    code: { type: String, uppercase: true, unique: true },
    title: String,
    description: String,
    startBand: Number,
    targetBand: Number,
    type: { type: String, default: 'group' },
    teacherId: { type: mongoose.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'active' },
    createdBy: { type: mongoose.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const EnrollmentSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Types.ObjectId, ref: 'Course' },
    studentId: { type: mongoose.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'active' },
    enrolledAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

const LessonSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Types.ObjectId, ref: 'Course' },
    title: String,
    startAt: Date,
    endAt: Date,
    meetUrl: String,
    content: String,
    status: { type: String, default: 'scheduled' },
  },
  { timestamps: true },
);

const ExerciseSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    type: { type: String, default: 'reading' },
    passage: String,
    questions: [
      {
        questionId: String,
        type: { type: String, default: 'multiple_choice' },
        prompt: String,
        options: [{ key: String, text: String }],
        answerSpecification: Object,
        points: Number,
        explanation: String,
      },
    ],
    passScore: { type: Number, default: 70 },
    version: { type: Number, default: 1 },
    status: { type: String, default: 'published' },
    createdBy: { type: mongoose.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

const AssignmentSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Types.ObjectId, ref: 'Course' },
    exerciseId: { type: mongoose.Types.ObjectId, ref: 'Exercise' },
    exerciseVersion: { type: Number, default: 1 },
    exerciseSnapshot: Object,
    assignedBy: { type: mongoose.Types.ObjectId, ref: 'User' },
    title: String,
    openAt: Date,
    deadlineAt: Date,
    assignedDate: String,
    status: { type: String, default: 'published' },
    targetScorePercent: { type: Number, default: 70 },
    allowRetake: { type: Boolean, default: true },
    maxAttempts: { type: Number, default: 3 },
  },
  { timestamps: true },
);

const StudentAssignmentSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Types.ObjectId, ref: 'Assignment' },
    studentId: { type: mongoose.Types.ObjectId, ref: 'User' },
    effectiveDeadlineAt: Date,
    status: { type: String, default: 'not_started' },
    bestScore: Number,
    isTargetAchieved: { type: Boolean, default: false },
    attemptsCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

async function seed() {
  console.log('🌱 Starting database seed...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const UserModel = mongoose.model('User', UserSchema);
  const StudentProfileModel = mongoose.model('StudentProfile', StudentProfileSchema, 'student_profiles');
  const TeacherProfileModel = mongoose.model('TeacherProfile', TeacherProfileSchema, 'teacher_profiles');
  const CourseModel = mongoose.model('Course', CourseSchema, 'courses');
  const EnrollmentModel = mongoose.model('Enrollment', EnrollmentSchema, 'enrollments');
  const LessonModel = mongoose.model('Lesson', LessonSchema, 'lessons');
  const ExerciseModel = mongoose.model('Exercise', ExerciseSchema, 'exercises');
  const AssignmentModel = mongoose.model('Assignment', AssignmentSchema, 'assignments');
  const StudentAssignmentModel = mongoose.model('StudentAssignment', StudentAssignmentSchema, 'student_assignments');
  const ExamTestModel = mongoose.model('ExamTest', ExamTestSchema, 'exam_tests');

  // 1. Seed Admin
  let admin = await UserModel.findOne({ email: ADMIN_EMAIL }).exec();
  if (!admin) {
    const adminHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    admin = await UserModel.create({
      fullName: ADMIN_FULLNAME,
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      role: 'admin',
      status: 'active',
    });
    console.log(`✅ Admin user created: ${ADMIN_EMAIL}`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${ADMIN_EMAIL}`);
  }

  // 2. Seed Teacher
  const teacherEmail = 'teacher@ielts-lms.local';
  let teacher = await UserModel.findOne({ email: teacherEmail }).exec();
  if (!teacher) {
    const teacherHash = await argon2.hash('Teacher@123456', { type: argon2.argon2id });
    teacher = await UserModel.create({
      fullName: 'Teacher Nguyen Van A',
      email: teacherEmail,
      passwordHash: teacherHash,
      role: 'teacher',
      status: 'active',
    });
    await TeacherProfileModel.create({
      userId: teacher._id,
      specialization: 'IELTS Reading & Listening Masterclass',
      bio: 'Chuyên gia luyện thi IELTS 8.5 với hơn 8 năm kinh nghiệm giảng dạy chuyên sâu.',
    });
    console.log(`✅ Teacher created: ${teacherEmail} / Teacher@123456`);
  } else {
    console.log(`ℹ️  Teacher already exists: ${teacherEmail}`);
  }

  // 3. Seed Student
  const studentEmail = 'student@ielts-lms.local';
  let student = await UserModel.findOne({ email: studentEmail }).exec();
  if (!student) {
    const studentHash = await argon2.hash('Student@123456', { type: argon2.argon2id });
    student = await UserModel.create({
      fullName: 'Student Tran Thi B',
      email: studentEmail,
      passwordHash: studentHash,
      role: 'student',
      status: 'active',
    });
    await StudentProfileModel.create({
      userId: student._id,
      currentBand: 6.0,
      targetBand: 7.5,
      penaltyPointsCache: 0,
    });
    console.log(`✅ Student created: ${studentEmail} / Student@123456`);
  } else {
    console.log(`ℹ️  Student already exists: ${studentEmail}`);
  }

  // 4. Seed Course
  const courseCode = 'IELTS-MASTER-01';
  let course = await CourseModel.findOne({ code: courseCode }).exec();
  if (!course) {
    course = await CourseModel.create({
      code: courseCode,
      title: 'IELTS Intensive Masterclass 6.5 - 7.5',
      description: 'Khóa học chuyên sâu bứt phá band điểm IELTS Reading & Listening với phương pháp tư duy ngữ cảnh.',
      startBand: 6.0,
      targetBand: 7.5,
      type: 'group',
      teacherId: teacher._id,
      status: 'active',
      createdBy: admin._id,
    });
    console.log(`✅ Course created: ${course.title} (${courseCode})`);
  } else {
    console.log(`ℹ️  Course already exists: ${courseCode}`);
  }

  // 5. Seed Enrollment
  const enrollment = await EnrollmentModel.findOne({ courseId: course._id, studentId: student._id }).exec();
  if (!enrollment) {
    await EnrollmentModel.create({
      courseId: course._id,
      studentId: student._id,
      status: 'active',
      enrolledAt: new Date(),
    });
    console.log(`✅ Enrolled student into course: ${courseCode}`);
  }

  // 6. Seed Upcoming Lesson
  const existingLesson = await LessonModel.findOne({ courseId: course._id }).exec();
  if (!existingLesson) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 30, 0, 0);
    const endLesson = new Date(tomorrow);
    endLesson.setHours(21, 30, 0, 0);

    await LessonModel.create({
      courseId: course._id,
      title: 'Buổi 01: Chiến lược xử lý True/False/Not Given & Heading Matching',
      startAt: tomorrow,
      endAt: endLesson,
      meetUrl: 'https://meet.google.com/abc-defg-hij',
      content: 'Phân tích bản chất câu hỏi, bẫy từ đồng nghĩa và kỹ thuật Skimming/Scanning đỉnh cao.',
      status: 'scheduled',
    });
    console.log(`✅ Upcoming lesson created for course: ${courseCode}`);
  }

  // 7. Seed Exercise & Today Daily Assignment
  let exercise = await ExerciseModel.findOne({ title: 'Reading Exercise: The Evolution of Computing' }).exec();
  if (!exercise) {
    exercise = await ExerciseModel.create({
      title: 'Reading Exercise: The Evolution of Computing',
      description: 'Luyện tập kỹ năng đọc hiểu và phân tích thông tin lịch sử phát triển máy tính.',
      type: 'reading',
      passage: `<p>The earliest known calculating device is the abacus, invented in Mesopotamia around 2500 BCE. Centuries later, in 1837, Charles Babbage conceptualized the Analytical Engine, considered the first design for a general-purpose computer.</p><p>In the mid-20th century, the advent of electronic digital computers transformed technology, leading to the rapid development of modern microprocessors and personal computing.</p>`,
      questions: [
        {
          questionId: 'q-comp-1',
          type: 'multiple_choice',
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
          questionId: 'q-comp-2',
          type: 'multiple_choice',
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
      passScore: 70,
      version: 1,
      status: 'published',
      createdBy: teacher._id,
    });
    console.log(`✅ Exercise created: ${exercise.title}`);
  }

  // 8. Seed Daily Assignment & Student Assignment
  const todayStr = new Date().toISOString().slice(0, 10);
  let assignment = await AssignmentModel.findOne({ courseId: course._id, exerciseId: exercise._id }).exec();
  if (!assignment) {
    const openAt = new Date();
    openAt.setHours(6, 0, 0, 0);
    const deadlineAt = new Date(openAt);
    deadlineAt.setDate(deadlineAt.getDate() + 1);

    assignment = await AssignmentModel.create({
      courseId: course._id,
      exerciseId: exercise._id,
      exerciseVersion: 1,
      exerciseSnapshot: {
        title: exercise.title,
        type: exercise.type,
        passage: exercise.passage,
        questions: exercise.questions,
        passScore: exercise.passScore,
        version: exercise.version,
      },
      assignedBy: teacher._id,
      title: `Bài tập ngày: ${exercise.title}`,
      openAt,
      deadlineAt,
      assignedDate: todayStr,
      status: 'published',
      targetScorePercent: 70,
      allowRetake: true,
      maxAttempts: 3,
    });
    console.log(`✅ Daily Assignment created: ${assignment.title}`);
  }

  const studentAssignment = await StudentAssignmentModel.findOne({
    assignmentId: assignment._id,
    studentId: student._id,
  }).exec();
  if (!studentAssignment) {
    await StudentAssignmentModel.create({
      assignmentId: assignment._id,
      studentId: student._id,
      effectiveDeadlineAt: assignment.deadlineAt,
      status: 'not_started',
      isTargetAchieved: false,
      attemptsCount: 0,
    });
    console.log(`✅ Student assignment assigned to: ${studentEmail}`);
  }

  // 9. Seed CBT Practice Exam Test
  let examTest = await ExamTestModel.findOne({ title: 'IELTS Cambridge Academic Reading Test 01' }).exec();
  if (!examTest) {
    examTest = await ExamTestModel.create({
      title: 'IELTS Cambridge Academic Reading Test 01',
      skill: ExamSkill.READING,
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
      createdBy: teacher._id,
    });
    console.log(`✅ CBT Practice Exam Test created: ${examTest.title}`);
  }

  console.log('🌱 Seed completed successfully! All sample data is ready.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
