import * as mongoose from 'mongoose';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ielts_lms';
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
  { userId: { type: mongoose.Types.ObjectId, unique: true }, penaltyPointsCache: { type: Number, default: 0 } },
  { timestamps: true },
);

const TeacherProfileSchema = new mongoose.Schema(
  { userId: { type: mongoose.Types.ObjectId, unique: true }, specialization: String, bio: String },
  { timestamps: true },
);

async function seed() {
  console.log('🌱 Starting database seed...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const UserModel = mongoose.model('User', UserSchema);
  const StudentProfileModel = mongoose.model('StudentProfile', StudentProfileSchema, 'student_profiles');
  const TeacherProfileModel = mongoose.model('TeacherProfile', TeacherProfileSchema, 'teacher_profiles');

  // Seed Admin
  const existingAdmin = await UserModel.findOne({ email: ADMIN_EMAIL }).exec();
  if (!existingAdmin) {
    const adminHash = await argon2.hash(ADMIN_PASSWORD, { type: argon2.argon2id });
    await UserModel.create({
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

  // Seed sample Teacher
  const teacherEmail = 'teacher@ielts-lms.local';
  const existingTeacher = await UserModel.findOne({ email: teacherEmail }).exec();
  if (!existingTeacher) {
    const teacherHash = await argon2.hash('Teacher@123456', { type: argon2.argon2id });
    const teacher = await UserModel.create({
      fullName: 'Sample Teacher',
      email: teacherEmail,
      passwordHash: teacherHash,
      role: 'teacher',
      status: 'active',
    });
    await TeacherProfileModel.create({
      userId: teacher._id,
      specialization: 'IELTS Reading & Listening',
      bio: 'Experienced IELTS instructor',
    });
    console.log(`✅ Teacher created: ${teacherEmail} / Teacher@123456`);
  } else {
    console.log(`ℹ️  Teacher already exists: ${teacherEmail}`);
  }

  // Seed sample Student
  const studentEmail = 'student@ielts-lms.local';
  const existingStudent = await UserModel.findOne({ email: studentEmail }).exec();
  if (!existingStudent) {
    const studentHash = await argon2.hash('Student@123456', { type: argon2.argon2id });
    const student = await UserModel.create({
      fullName: 'Sample Student',
      email: studentEmail,
      passwordHash: studentHash,
      role: 'student',
      status: 'active',
    });
    await StudentProfileModel.create({
      userId: student._id,
      currentBand: 5.5,
      targetBand: 7.0,
      penaltyPointsCache: 0,
    });
    console.log(`✅ Student created: ${studentEmail} / Student@123456`);
  } else {
    console.log(`ℹ️  Student already exists: ${studentEmail}`);
  }

  console.log('🌱 Seed completed!');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});

