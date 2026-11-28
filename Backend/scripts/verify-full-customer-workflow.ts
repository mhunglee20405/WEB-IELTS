import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

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
  console.log('======================================================================');
  console.log('🏆 WEB-IELTS: COMPLETE PRODUCTION CUSTOMER WORKFLOW ACCEPTANCE SUITE');
  console.log('======================================================================');

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

  // 1. Initial Admin Bootstrap Verification
  console.log('\nStep 1: First-Time Admin Bootstrap Verification...');
  const { body: statusRes } = await request('/system/setup-status', { expectedStatus: 200 });
  if (!statusRes.data.isInitialized) {
    const candidates = [
      path.resolve(process.cwd(), '.bootstrap-token'),
      path.resolve(process.cwd(), 'Backend/.bootstrap-token'),
      path.resolve(__dirname, '../.bootstrap-token'),
      path.resolve(__dirname, '../../.bootstrap-token'),
    ];
    let setupToken = process.env.SETUP_TOKEN || '';
    for (const p of candidates) {
      if (!setupToken && fs.existsSync(p)) {
        setupToken = fs.readFileSync(p, 'utf8').trim();
      }
    }
    console.log(`  Bootstrapping initial Admin using authorization token...`);
    await request('/system/bootstrap-admin', {
      method: 'POST',
      body: {
        fullName: 'Học Viện Administrator',
        email: 'admin@academy.edu.vn',
        password: 'Admin@Academy2026!',
        setupToken,
      },
      expectedStatus: 201,
    });
    console.log('  ✓ Initial Admin successfully bootstrapped!');

    // Verify bootstrap lockout on subsequent attempts
    const { status: lockStatus } = await request('/system/bootstrap-admin', {
      method: 'POST',
      body: {
        fullName: 'Attacker Admin',
        email: 'attacker@evil.com',
        password: 'Password@123',
      },
    });
    if (lockStatus === 409) {
      console.log('  ✓ Verified: Setup wizard permanently locked (409 Conflict) after first admin creation.');
    } else {
      throw new Error(`Expected 409 Conflict on repeated bootstrap, got ${lockStatus}`);
    }
  }

  console.log('\nStep 1b: Authenticating as Bootstrap Customer Admin...');
  const adminLoginRes = await request('/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@academy.edu.vn',
      password: 'Admin@Academy2026!',
    },
    expectedStatus: 200,
  });
  const adminToken = adminLoginRes.body.data.tokens.accessToken;
  console.log('  ✓ Admin logged in successfully.');

  // 2. Admin provisions Teacher
  const teacherEmail = `teacher.${Date.now()}@academy.edu.vn`;
  console.log(`\nStep 2: Admin provisions Teacher (${teacherEmail})...`);
  const { body: teacherCreated } = await request('/users', {
    method: 'POST',
    token: adminToken,
    body: {
      email: teacherEmail,
      fullName: 'Thầy Lê Hoàng Long (Senior IELTS Specialist)',
      password: 'Teacher@Academy2026!',
      role: 'teacher',
      phone: '0912345678',
    },
    expectedStatus: 201,
  });
  const teacherId = teacherCreated.data.id || teacherCreated.data._id;
  console.log(`  ✓ Teacher provisioned with ID: ${teacherId}`);

  // 3. Admin provisions Student
  const studentEmail = `student.${Date.now()}@academy.edu.vn`;
  console.log(`\nStep 3: Admin provisions Student (${studentEmail})...`);
  const { body: studentCreated } = await request('/users', {
    method: 'POST',
    token: adminToken,
    body: {
      email: studentEmail,
      fullName: 'Vũ Minh Anh (IELTS Target 7.5 Candidate)',
      password: 'Student@Academy2026!',
      role: 'student',
      phone: '0987654321',
    },
    expectedStatus: 201,
  });
  const studentId = studentCreated.data.id || studentCreated.data._id;
  console.log(`  ✓ Student provisioned with ID: ${studentId}`);

  // 4. Admin creates Course assigned to Teacher
  const courseCode = `IELTS-75-${Date.now().toString(36).toUpperCase()}`;
  console.log(`\nStep 4: Admin creates Course (${courseCode})...`);
  const { body: courseCreated } = await request('/courses', {
    method: 'POST',
    token: adminToken,
    body: {
      code: courseCode,
      title: 'IELTS Academic Intensive Mastery 7.5+',
      description: 'Chương trình đào tạo chuyên sâu 4 kỹ năng chuẩn học thuật Cambridge.',
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
  console.log(`\nStep 5: Admin enrolls Student into Course...`);
  await request(`/courses/${courseId}/students`, {
    method: 'POST',
    token: adminToken,
    body: { studentId },
    expectedStatus: 201,
  });
  console.log(`  ✓ Student enrolled into course successfully.`);

  // 6. Teacher logs in
  console.log('\nStep 6: Authenticating as newly provisioned Teacher...');
  const { body: teacherLogin } = await request('/auth/login', {
    method: 'POST',
    body: {
      email: teacherEmail,
      password: 'Teacher@Academy2026!',
    },
    expectedStatus: 200,
  });
  const teacherToken = teacherLogin.data.tokens.accessToken;
  console.log('  ✓ Teacher authenticated successfully.');

  // 7. Teacher creates Reading Exercise with Answer Key
  console.log('\nStep 7: Teacher authors Reading Exercise in Exercise Bank...');
  const { body: exerciseCreated } = await request('/exercises', {
    method: 'POST',
    token: teacherToken,
    body: {
      title: 'Reading Test: The Impact of Artificial Intelligence in Healthcare',
      description: 'Academic reading passage with multiple-choice and short answer questions.',
      type: 'reading',
      passage: 'Artificial Intelligence (AI) has rapidly transitioned from speculative research to clinical application...',
      passScore: 70,
      status: 'published',
      questions: [
        {
          questionId: 'q-reading-1',
          type: 'multiple_choice',
          prompt: 'According to paragraph 1, what is the primary diagnostic benefit of AI in medical imaging?',
          points: 1,
          options: [
            { key: 'A', text: 'Reduction of equipment manufacturing costs' },
            { key: 'B', text: 'Accelerated detection of early-stage microcalcifications' },
            { key: 'C', text: 'Elimination of all human radiologist oversight' },
            { key: 'D', text: 'Replacement of standard MRI scanners' },
          ],
          answerSpecification: {
            correctKey: 'B',
          },
          explanation: 'Paragraph 1 clearly states early-stage microcalcifications are identified 40% faster.',
        },
        {
          questionId: 'q-reading-2',
          type: 'true_false_not_given',
          prompt: 'Do the following statements agree with the information in the text? Choose TRUE, FALSE, or NOT GIVEN.',
          points: 1,
          answerSpecification: {
            correctKey: 'TRUE',
          },
          explanation: 'Text confirms predictive neural networks are integrated into tertiary trauma centers.',
        },
      ],
    },
    expectedStatus: 201,
  });
  const exerciseId = exerciseCreated.data.id || exerciseCreated.data._id;
  console.log(`  ✓ Exercise published with ID: ${exerciseId}`);

  // 8. Teacher creates Assignment linking Course and Exercise
  console.log('\nStep 8: Teacher assigns Exercise to the Course...');
  const openDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
  const deadlineDate = new Date(Date.now() + 24 * 3600000).toISOString(); // 24 hours from now
  const { body: assignmentCreated } = await request('/assignments', {
    method: 'POST',
    token: teacherToken,
    body: {
      courseId,
      exerciseId,
      title: 'Bài tập Reading Tuần 1: AI in Healthcare',
      openAt: openDate,
      deadlineAt: deadlineDate,
      status: 'published',
    },
    expectedStatus: 201,
  });
  const assignmentId = assignmentCreated.data.id || assignmentCreated.data._id;
  console.log(`  ✓ Assignment created with ID: ${assignmentId}`);

  // 9. Teacher schedules Live Lesson with Google Meet URL
  console.log('\nStep 9: Teacher schedules Live Lesson with Google Meet URL...');
  const lessonStart = new Date(Date.now() + 4 * 3600000).toISOString();
  const lessonEnd = new Date(Date.now() + 5.5 * 3600000).toISOString();
  const { body: lessonCreated } = await request('/lessons', {
    method: 'POST',
    token: teacherToken,
    body: {
      courseId,
      title: 'Buổi 1: Phân tích chiến lược Reading Matching Headings & True/False/Not Given',
      content: 'Chữa chi tiết bài tập Reading Tuần 1 và phương pháp quản trị thời gian 20 phút/passage.',
      meetUrl: 'https://meet.google.com/ielts-live-session-2026',
      startAt: lessonStart,
      endAt: lessonEnd,
      startTime: lessonStart,
      endTime: lessonEnd,
    },
    expectedStatus: 201,
  });
  const lessonId = lessonCreated.data.id || lessonCreated.data._id;
  console.log(`  ✓ Lesson created with ID: ${lessonId}`);

  // 10. Teacher updates the Lesson
  console.log('\nStep 10: Teacher updates Lesson content...');
  const { body: lessonUpdated } = await request(`/lessons/${lessonId}`, {
    method: 'PATCH',
    token: teacherToken,
    body: {
      content: 'Bổ sung tài liệu Handout PDF và bộ câu hỏi mẫu Cambridge IELTS 19.',
    },
    expectedStatus: 200,
  });
  console.log(`  ✓ Lesson content updated successfully.`);

  // 11. Student logs in
  console.log('\nStep 11: Authenticating as newly enrolled Student...');
  const { body: studentLogin } = await request('/auth/login', {
    method: 'POST',
    body: {
      email: studentEmail,
      password: 'Student@Academy2026!',
    },
    expectedStatus: 200,
  });
  const studentToken = studentLogin.data.tokens.accessToken;
  console.log('  ✓ Student authenticated successfully.');

  // 12. Student verifies Course and Calendar
  console.log('\nStep 12: Student verifies Course and Calendar views...');
  const { body: studentCourses } = await request('/courses/mine', {
    token: studentToken,
    expectedStatus: 200,
  });
  const coursesList = studentCourses.data.items || studentCourses.data || [];
  const foundCourse = coursesList.find((c: any) => (c.id || c._id) === courseId);
  if (!foundCourse) throw new Error('Student cannot see enrolled course');
  console.log(`  ✓ Enrolled course visible: "${foundCourse.title}"`);

  const { body: studentLessons } = await request('/lessons/mine', {
    token: studentToken,
    expectedStatus: 200,
  });
  const lessonsList = studentLessons.data.items || studentLessons.data || [];
  const foundLesson = lessonsList.find((l: any) => (l.id || l._id) === lessonId);
  if (!foundLesson) throw new Error('Student cannot see scheduled lesson');
  console.log(`  ✓ Calendar lesson visible: "${foundLesson.title}" (meetUrl: ${foundLesson.meetUrl})`);

  // 13. Student verifies assigned homework
  console.log('\nStep 13: Student checks assigned homework...');
  const { body: studentAssignments } = await request('/assignments/mine', {
    token: studentToken,
    expectedStatus: 200,
  });
  const saList = studentAssignments.data.items || studentAssignments.data || [];
  const myAssignment = saList.find((sa: any) => {
    const aid = sa.assignmentId?._id || sa.assignmentId?.id || sa.assignmentId || sa.id || sa._id;
    return aid === assignmentId;
  });
  if (!myAssignment) throw new Error('Assignment not generated for enrolled student');
  console.log(`  ✓ Assignment located in student portal: ID ${myAssignment.id || myAssignment._id}`);

  // 14. Student submits answers
  console.log('\nStep 14: Student submits answers for automated server-side evaluation...');
  const { body: submissionResult } = await request(`/assignments/${assignmentId}/submissions`, {
    method: 'POST',
    token: studentToken,
    body: {
      answers: [
        { questionId: 'q-reading-1', value: 'B' },
        { questionId: 'q-reading-2', value: 'TRUE' },
      ],
    },
    expectedStatus: 201,
  });
  const subData = submissionResult.data;
  console.log(`  ✓ Submission processed!`);
  console.log(`    - Total Score: ${subData.score}/100 (${subData.percentage}%)`);
  console.log(`    - Passed: ${subData.passed}`);
  console.log(`    - Correct Answers: ${subData.correctCount}/${subData.totalQuestions}`);

  if (!subData.passed) {
    throw new Error('Expected student to pass with 100% correct answers');
  }

  // 15. Student checks notifications
  console.log('\nStep 15: Verifying automated system notifications...');
  const { body: notificationsRes } = await request('/notifications', {
    token: studentToken,
    expectedStatus: 200,
  });
  const notifs = notificationsRes.data.items || notificationsRes.data || [];
  console.log(`  ✓ Student has received ${notifs.length} system notification(s):`);
  for (const n of notifs.slice(0, 3)) {
    console.log(`    - [${n.type}] ${n.title}: ${n.message}`);
  }

  // 16. Teacher inspects submission results
  console.log('\nStep 16: Teacher inspects assignment submission grading results...');
  const { body: teacherResults } = await request(`/assignments/${assignmentId}/submissions`, {
    token: teacherToken,
    expectedStatus: 200,
  });
  const submissionsList = teacherResults.data.items || teacherResults.data || [];
  console.log(`  ✓ Teacher retrieved ${submissionsList.length} graded submission(s).`);

  // 17. Deep MongoDB Persistence & Audit Verification
  console.log('\nStep 17: Validating MongoDB Document Persistence Across Collections...');
  const counts = {
    users: await db.collection('users').countDocuments(),
    teacher_profiles: await db.collection('teacher_profiles').countDocuments(),
    student_profiles: await db.collection('student_profiles').countDocuments(),
    courses: await db.collection('courses').countDocuments(),
    enrollments: await db.collection('enrollments').countDocuments(),
    exercises: await db.collection('exercises').countDocuments(),
    assignments: await db.collection('assignments').countDocuments(),
    student_assignments: await db.collection('student_assignments').countDocuments(),
    lessons: await db.collection('lessons').countDocuments(),
    submissions: await db.collection('submissions').countDocuments(),
    notifications: await db.collection('notifications').countDocuments(),
  };

  console.log('  ✓ MongoDB Document Counts:');
  for (const [col, count] of Object.entries(counts)) {
    console.log(`    • ${col.padEnd(22)} : ${count}`);
    if (count === 0 && col !== 'exam_tests' && col !== 'exam_attempts') {
      throw new Error(`Expected collection ${col} to contain records, but found 0`);
    }
  }

  console.log('\n======================================================================');
  console.log('🎉 100% SUCCESS: COMPLETE PRODUCTION CUSTOMER LIFECYCLE ACCEPTED!');
  console.log('======================================================================');

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ Customer Workflow Failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
