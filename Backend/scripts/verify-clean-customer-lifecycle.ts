import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3001/api/v1';
const TEST_MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://localhost:27018/ielts_lms_test?replicaSet=rs0&directConnection=true';

interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
  message?: string;
  timestamp: string;
}

async function request<T = any>(
  path: string,
  options: {
    method?: string;
    body?: any;
    token?: string;
    expectedStatus?: number;
  } = {},
): Promise<{ status: number; body: ApiResponse<T> }> {
  const { method = 'GET', body, token, expectedStatus } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (expectedStatus && res.status !== expectedStatus) {
    throw new Error(
      `[FAIL] ${method} ${path} expected status ${expectedStatus} but got ${res.status}: ${JSON.stringify(json)}`,
    );
  }

  return { status: res.status, body: json };
}

async function run() {
  console.log('===============================================================');
  console.log('🚀 WEB-IELTS: ZERO-DATA CUSTOMER ONBOARDING & PRODUCT LIFECYCLE');
  console.log('===============================================================');

  await mongoose.connect(TEST_MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Could not connect to MongoDB database.');
  const dbName = (mongoose.connection.name || '').toLowerCase();
  if (dbName === 'ielts_lms_customer' || dbName.includes('customer') || dbName.includes('prod')) {
    throw new Error(
      `[FATAL GUARD] Test execution is strictly forbidden against customer/production database "${dbName}". Target must be "ielts_lms_test".`,
    );
  }
  console.log(`📡 Connected to Isolated Test MongoDB database: "${dbName}"`);

  // Inspect user count
  const userCountBefore = await db.collection('users').countDocuments();
  console.log(`ℹ️ Current users count in "${dbName}": ${userCountBefore}`);

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('PHASE 1: Verify Initial Setup Status Detection');
  console.log('─────────────────────────────────────────────────────────────');

  const { body: initialStatus } = await request('/system/setup-status', { expectedStatus: 200 });
  console.log(`  ✓ GET /system/setup-status returned:`, initialStatus.data);

  // If already initialized with users, verify bootstrap lock
  if (initialStatus.data.isInitialized) {
    console.log('\n─────────────────────────────────────────────────────────────');
    console.log('PHASE 2: Verify Setup Lockout on Already-Initialized System');
    console.log('─────────────────────────────────────────────────────────────');
    const { status: lockStatus, body: lockBody } = await request('/system/bootstrap-admin', {
      method: 'POST',
      body: {
        fullName: 'Attacker Admin',
        email: 'attacker@evil.com',
        password: 'Password@123',
      },
    });

    if (lockStatus === 409) {
      console.log('  ✓ Bootstrap Admin endpoint rejected unauthorized privilege escalation with 409 Conflict.');
      console.log('  ✓ Error message:', lockBody.message || lockBody);
    } else {
      throw new Error(`Expected 409 Conflict but received ${lockStatus}: ${JSON.stringify(lockBody)}`);
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('PHASE 3: Customer Lifecycle Simulation (Admin -> Teacher -> Student)');
  console.log('─────────────────────────────────────────────────────────────');

  // 1. Authenticate as Admin
  console.log('  1. Authenticating as Administrator...');
  let adminToken = '';
  try {
    const adminLoginRes = await request('/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@ielts-lms.local',
        password: 'Admin@123456',
      },
      expectedStatus: 200,
    });
    adminToken = adminLoginRes.body.data.tokens.accessToken;
    console.log('  ✓ Admin logged in successfully.');
  } catch {
    const adminLoginRes = await request('/auth/login', {
      method: 'POST',
      body: {
        email: 'admin@academy.edu.vn',
        password: 'Admin@Academy2026!',
      },
      expectedStatus: 200,
    });
    adminToken = adminLoginRes.body.data.tokens.accessToken;
    console.log('  ✓ Customer Admin logged in successfully.');
  }

  // 2. Admin provisions new Teacher
  const customerTeacherEmail = `teacher.customer.${Date.now()}@academy.edu.vn`;
  console.log(`  2. Admin provisions new Teacher: ${customerTeacherEmail}...`);
  const { body: teacherCreated } = await request('/users', {
    method: 'POST',
    token: adminToken,
    body: {
      email: customerTeacherEmail,
      fullName: 'Thầy Đặng Quang Minh (Customer Teacher)',
      password: 'Teacher@Academy2026!',
      role: 'teacher',
      phone: '0901234567',
    },
    expectedStatus: 201,
  });
  const teacherId = teacherCreated.data.id || teacherCreated.data._id;
  console.log(`  ✓ Teacher created with ID: ${teacherId}`);

  // 3. Admin provisions new Student
  const customerStudentEmail = `student.customer.${Date.now()}@academy.edu.vn`;
  console.log(`  3. Admin provisions new Student: ${customerStudentEmail}...`);
  const { body: studentCreated } = await request('/users', {
    method: 'POST',
    token: adminToken,
    body: {
      email: customerStudentEmail,
      fullName: 'Nguyễn Thu Trang (Customer Student)',
      password: 'Student@Academy2026!',
      role: 'student',
      phone: '0909876543',
    },
    expectedStatus: 201,
  });
  const studentId = studentCreated.data.id || studentCreated.data._id;
  console.log(`  ✓ Student created with ID: ${studentId}`);

  // 4. Admin creates new Course
  const courseCode = `CRS-CUST-${Date.now().toString(36).toUpperCase()}`;
  console.log(`  4. Admin creates new Course: ${courseCode}...`);
  const { body: courseCreated } = await request('/courses', {
    method: 'POST',
    token: adminToken,
    body: {
      code: courseCode,
      title: 'Khóa học IELTS Academic Intensive 6.5 - 7.5',
      description: 'Lớp học mục tiêu nâng band Reading và Speaking thực chiến với giảng viên 8.5.',
      type: 'one_to_one',
      startBand: 6.5,
      targetBand: 7.5,
      teacherId: teacherId,
    },
    expectedStatus: 201,
  });
  const courseId = courseCreated.data.id || courseCreated.data._id;
  console.log(`  ✓ Course created with ID: ${courseId}`);

  // 5. Admin enrolls Student into Course
  console.log(`  5. Enrolling Student ${studentId} into Course ${courseId}...`);
  const { body: enrollmentCreated } = await request(`/courses/${courseId}/students`, {
    method: 'POST',
    token: adminToken,
    body: {
      studentId,
    },
    expectedStatus: 201,
  });
  console.log(`  ✓ Student enrolled into course successfully.`);

  // 6. Teacher logs in
  console.log('\n  6. Authenticating as newly created Teacher...');
  const { body: teacherLogin } = await request('/auth/login', {
    method: 'POST',
    body: {
      email: customerTeacherEmail,
      password: 'Teacher@Academy2026!',
    },
    expectedStatus: 200,
  });
  const teacherToken = teacherLogin.data.tokens.accessToken;
  console.log('  ✓ Teacher successfully logged in.');

  // 7. Teacher schedules a Live Lesson with Google Meet
  console.log('  7. Teacher schedules a Live Lesson with Google Meet...');
  const lessonStartTime = new Date(Date.now() + 2 * 3600000).toISOString();
  const lessonEndTime = new Date(Date.now() + 3.5 * 3600000).toISOString();
  const { body: lessonCreated } = await request('/lessons', {
    method: 'POST',
    token: teacherToken,
    body: {
      courseId,
      title: 'Buổi 01: Chiến thuật giải mã Reading True/False/Not Given',
      content: 'Phân tích từ khóa định vị, bẫy paraphrasing và kỹ thuật scan chi tiết.',
      meetUrl: 'https://meet.google.com/xyz-ielts-live',
      startAt: lessonStartTime,
      endAt: lessonEndTime,
      startTime: lessonStartTime,
      endTime: lessonEndTime,
    },
    expectedStatus: 201,
  });
  const lessonId = lessonCreated.data.id || lessonCreated.data._id;
  console.log(`  ✓ Lesson created with ID: ${lessonId}`);

  // 8. Teacher updates the Lesson
  console.log('  8. Teacher updates the scheduled Lesson topic...');
  const { body: lessonUpdated } = await request(`/lessons/${lessonId}`, {
    method: 'PATCH',
    token: teacherToken,
    body: {
      title: 'Buổi 01: Chiến thuật giải mã Reading True/False/Not Given (Đã cập nhật)',
      content: 'Bổ sung tài liệu Cambridge IELTS 18 Test 1.',
    },
    expectedStatus: 200,
  });
  console.log(`  ✓ Lesson updated: "${lessonUpdated.data.title}"`);

  // 9. Student logs in
  console.log('\n  9. Authenticating as newly enrolled Student...');
  const { body: studentLogin } = await request('/auth/login', {
    method: 'POST',
    body: {
      email: customerStudentEmail,
      password: 'Student@Academy2026!',
    },
    expectedStatus: 200,
  });
  const studentToken = studentLogin.data.tokens.accessToken;
  console.log('  ✓ Student successfully logged in.');

  // 10. Student checks enrolled courses & calendar lessons
  console.log('  10. Student verifies enrolled courses...');
  const { body: studentCourses } = await request('/courses/mine', {
    token: studentToken,
    expectedStatus: 200,
  });
  const enrolledItems = studentCourses.data.items || studentCourses.data || [];
  const foundEnrolledCourse = enrolledItems.find((c: any) => (c.id || c._id) === courseId);
  if (!foundEnrolledCourse) {
    throw new Error(`Enrolled course ${courseId} not found in student's course list`);
  }
  console.log(`  ✓ Student sees enrolled course: "${foundEnrolledCourse.title}"`);

  console.log('  11. Student verifies calendar lessons...');
  const { body: studentLessons } = await request('/lessons/mine', {
    token: studentToken,
    expectedStatus: 200,
  });
  const lessonItems = studentLessons.data.items || studentLessons.data || [];
  const foundLesson = lessonItems.find((l: any) => (l.id || l._id) === lessonId);
  if (!foundLesson) {
    throw new Error(`Lesson ${lessonId} not found in student's calendar`);
  }
  console.log(
    `  ✓ Student sees scheduled lesson: "${foundLesson.title}" (meetUrl: ${foundLesson.meetUrl}, start: ${foundLesson.startTime || foundLesson.startAt})`,
  );

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('PHASE 4: MongoDB Persistence Audit');
  console.log('─────────────────────────────────────────────────────────────');

  const persistedUser = await db.collection('users').findOne({ email: customerStudentEmail });
  const persistedCourse = await db.collection('courses').findOne({ _id: new mongoose.Types.ObjectId(courseId) });
  const persistedLesson = await db.collection('lessons').findOne({ _id: new mongoose.Types.ObjectId(lessonId) });

  if (!persistedUser) throw new Error('Persisted user not found in MongoDB');
  if (!persistedCourse) throw new Error('Persisted course not found in MongoDB');
  if (!persistedLesson) throw new Error('Persisted lesson not found in MongoDB');

  console.log(`  ✓ MongoDB documents verified:`);
  console.log(`    - User: "${persistedUser.fullName}" (${persistedUser.email}, role: ${persistedUser.role})`);
  console.log(`    - Course: "${persistedCourse.title}" (${persistedCourse.code}, type: ${persistedCourse.type})`);
  console.log(`    - Lesson: "${persistedLesson.title}" (meetUrl: ${persistedLesson.meetUrl})`);

  console.log('\n===============================================================');
  console.log('🎉 ZERO-DATA CUSTOMER ONBOARDING & PRODUCT LIFECYCLE: 100% SUCCESS');
  console.log('===============================================================');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ Fatal error in customer lifecycle verification:', err);
  await mongoose.disconnect();
  process.exit(1);
});
