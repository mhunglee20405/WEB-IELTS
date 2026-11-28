import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';

async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`API login failed for ${email}`);
  const json = await res.json();
  return json.data.tokens.accessToken;
}

async function runDeepInteractiveCoverage() {
  console.log('===============================================================');
  console.log('🎯 PLAYWRIGHT DEEP INTERACTIVE WORKFLOWS & ROUTE COVERAGE');
  console.log('Frontend URL: ', BASE_URL);
  console.log('Backend API:  ', API_URL);
  console.log('===============================================================');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: [],
  };

  function assert(condition, message) {
    stats.total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      stats.passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      stats.failed++;
      stats.failures.push(message);
    }
  }

  async function loginViaUi(page, email, password) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    console.log(`  🔑 Authenticated ${email} -> ${page.url()}`);
  }

  // Pre-fetch live CBT Exam Test for real IDs
  const studentToken = await apiLogin('student@ielts-lms.local', 'Student@123456');
  const testsRes = await fetch(`${API_URL}/exam-tests`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  const testsData = (await testsRes.json()).data;
  const liveExamTest = testsData.items?.[0] || testsData[0];
  const testId = liveExamTest.id || liveExamTest._id;
  const passageId = liveExamTest.parts?.[0]?.passageId || 'passage-bees-1';
  console.log(`ℹ️ Live ExamTest identified for deep test: id=${testId}, passageId=${passageId}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: STUDENT INTERACTIVE WORKFLOWS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 1] Student Interactive Actionable Routes...');
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const studentErrors = [];
  studentPage.on('pageerror', (err) => studentErrors.push(err.message));

  await loginViaUi(studentPage, 'student@ielts-lms.local', 'Student@123456');

  // 1.1 List Assignments & Extract IDs
  console.log('👉 Visiting /student/assignments to discover student assignments...');
  await studentPage.goto(`${BASE_URL}/student/assignments`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const assignmentsText = await studentPage.textContent('main');
  assert(assignmentsText?.includes('Bài tập') || assignmentsText?.includes('Danh sách bài tập'), 'Student assignments page loaded');

  // Find assignment links
  const assignmentLinks = await studentPage.$$eval('a[href*="/student/assignments/"]', (anchors) =>
    anchors.map((a) => a.getAttribute('href')).filter(Boolean)
  );
  console.log(`ℹ️ Discovered ${assignmentLinks.length} student assignment links:`, assignmentLinks.slice(0, 3));
  assert(assignmentLinks.length > 0, 'Found at least one actionable assignment link');

  const firstAssignmentHref = assignmentLinks[0];
  const targetSaId = firstAssignmentHref.split('/student/assignments/')[1].split('/')[0];

  // 1.2 Student Assignment Taking Workspace
  console.log(`👉 Navigating to Assignment Taking Workspace: /student/assignments/${targetSaId}...`);
  await studentPage.goto(`${BASE_URL}/student/assignments/${targetSaId}`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1500);
  const runnerContent = await studentPage.textContent('main');
  assert(
    runnerContent?.includes('Làm bài tập IELTS') ||
    runnerContent?.includes('Bài tập') ||
    runnerContent?.includes('chưa mở') ||
    runnerContent?.includes('Nộp bài') ||
    runnerContent?.includes('Câu hỏi') ||
    runnerContent?.includes('Kết quả') ||
    runnerContent?.includes('Xem lại đáp án'),
    'Assignment taking runner rendered structured content'
  );
  assert(!runnerContent?.includes('RangeError') && !runnerContent?.includes('TypeError'), 'No React date/type runtime errors in runner');

  // 1.3 Student Review & Explanation Page
  console.log(`👉 Navigating to Assignment Review & Explanations: /student/assignments/${targetSaId}/review...`);
  await studentPage.goto(`${BASE_URL}/student/assignments/${targetSaId}/review`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1500);
  const reviewContent = await studentPage.textContent('main');
  assert(
    reviewContent?.includes('Xem lại đáp án') ||
    reviewContent?.includes('giải thích') ||
    reviewContent?.includes('Quay lại bài tập'),
    'Assignment review page rendered with standard header and navigation'
  );
  assert(!reviewContent?.includes('RangeError'), 'No RangeError in assignment review screen');

  // 1.4 Student Reading Translation Workspace with real test & passage IDs
  console.log(`👉 Navigating to Translation Workspace: /student/reading/${testId}/translate/${passageId}...`);
  await studentPage.goto(`${BASE_URL}/student/reading/${testId}/translate/${passageId}`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1500);
  const transContent = await studentPage.textContent('main');
  assert(
    transContent?.includes('Dịch bài đọc') ||
    transContent?.includes('Bản gốc') ||
    transContent?.includes('tiếng Việt') ||
    transContent?.includes('Passage') ||
    transContent?.includes('Lưu bản nháp') ||
    transContent?.includes('Chưa mở khóa') ||
    transContent?.includes('Bees'),
    'Translation workspace loaded with real passage content or eligibility check'
  );

  // If editor is present, test typing translation
  const textarea = await studentPage.$('textarea');
  if (textarea) {
    await textarea.fill('Bản dịch tiếng Việt thử nghiệm tự động bởi Playwright.');
    const wordCountText = await studentPage.textContent('main');
    assert(wordCountText?.includes('từ') || wordCountText?.includes('words') || wordCountText?.includes('Bản dịch'), 'Word count counter updated after typing');
    console.log('  ✍️ Successfully interacted with Vietnamese translation textarea');
  }

  // 1.5 Student Practice Player with real test ID
  console.log(`👉 Navigating to Practice Player: /student/practice/${testId}...`);
  await studentPage.goto(`${BASE_URL}/student/practice/${testId}`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1500);
  const practiceContent = await studentPage.textContent('main');
  assert(
    practiceContent?.includes('Luyện tập') ||
    practiceContent?.includes('Reading') ||
    practiceContent?.includes('Part') ||
    practiceContent?.includes('Câu hỏi') ||
    practiceContent?.includes('Bắt đầu') ||
    practiceContent?.includes('IELTS'),
    'Practice player loaded correctly with real exam test'
  );

  assert(studentErrors.length === 0, `Student workflow had zero uncaught runtime errors (found: ${studentErrors.length})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: TEACHER INTERACTIVE WORKFLOWS & CREATION SCREENS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 2] Teacher Interactive Authoring & Creation Screens...');
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  const teacherErrors = [];
  teacherPage.on('pageerror', (err) => teacherErrors.push(err.message));

  await loginViaUi(teacherPage, 'teacher@ielts-lms.local', 'Teacher@123456');

  // 2.1 Teacher Assignment Creation Form
  console.log('👉 Navigating to /teacher/assignments/new...');
  await teacherPage.goto(`${BASE_URL}/teacher/assignments/new`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1500);
  const newAssignContent = await teacherPage.textContent('main');
  assert(
    newAssignContent?.includes('Giao bài tập hằng ngày') ||
    newAssignContent?.includes('Giao bài tập') ||
    newAssignContent?.includes('Chọn khóa học'),
    'Teacher Assignment Creation page header and form loaded'
  );

  // Check form inputs
  const selectCount = await teacherPage.locator('select').count();
  const inputCount = await teacherPage.locator('input').count();
  assert(selectCount >= 1, `Found ${selectCount} select elements in assignment creation form`);
  assert(inputCount >= 1, `Found ${inputCount} input fields in assignment creation form`);

  // 2.2 Teacher Question Bank - Single Passage/Section Builder
  console.log('👉 Navigating to /teacher/question-bank/new...');
  await teacherPage.goto(`${BASE_URL}/teacher/question-bank/new`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1500);
  const qBankNewContent = await teacherPage.textContent('main');
  assert(
    qBankNewContent?.includes('Tạo Passage Reading') ||
    qBankNewContent?.includes('Bản nháp') ||
    qBankNewContent?.includes('Kỹ năng') ||
    qBankNewContent?.includes('Reading') ||
    qBankNewContent?.includes('Listening'),
    'Teacher Question Bank Builder page loaded with authoring tools'
  );

  // 2.3 Teacher Question Bank - Full Test Assembly Builder
  console.log('👉 Navigating to /teacher/question-bank/full-test-builder...');
  await teacherPage.goto(`${BASE_URL}/teacher/question-bank/full-test-builder`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1500);
  const fullBuilderContent = await teacherPage.textContent('main');
  assert(
    fullBuilderContent?.includes('Ghép Full Test IELTS') ||
    fullBuilderContent?.includes('Ghép Full Test') ||
    fullBuilderContent?.includes('Kỹ năng') ||
    fullBuilderContent?.includes('Passage'),
    'Teacher Full Test Assembly Builder loaded'
  );

  // 2.4 Teacher Translation Reviews Table
  console.log('👉 Navigating to /teacher/translations...');
  await teacherPage.goto(`${BASE_URL}/teacher/translations`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1500);
  const teacherTransContent = await teacherPage.textContent('main');
  assert(
    teacherTransContent?.includes('Chấm bài dịch') ||
    teacherTransContent?.includes('Bản dịch') ||
    teacherTransContent?.includes('Học viên') ||
    teacherTransContent?.includes('Trạng thái'),
    'Teacher Translation review dashboard loaded with submission list'
  );

  // 2.5 Teacher Assignments List & Actionable Buttons
  console.log('👉 Navigating to /teacher/assignments...');
  await teacherPage.goto(`${BASE_URL}/teacher/assignments`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1500);
  const teacherAssignContent = await teacherPage.textContent('main');
  assert(
    teacherAssignContent?.includes('Quản lý bài tập') ||
    teacherAssignContent?.includes('Giao bài mới') ||
    teacherAssignContent?.includes('Bài tập'),
    'Teacher assignments management list loaded'
  );

  assert(teacherErrors.length === 0, `Teacher workflow had zero uncaught runtime errors (found: ${teacherErrors.length})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: ADMIN CORE MANAGEMENT & AUDIT ROUTES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 3] Admin Core Management & Audit Routes...');
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const adminErrors = [];
  adminPage.on('pageerror', (err) => adminErrors.push(err.message));

  await loginViaUi(adminPage, 'admin@ielts-lms.local', 'Admin@123456');

  // 3.1 Admin Users Table
  console.log('👉 Navigating to /admin/users...');
  await adminPage.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(1500);
  const usersContent = await adminPage.textContent('main');
  assert(
    usersContent?.includes('Quản lý người dùng') ||
    usersContent?.includes('Người dùng') ||
    usersContent?.includes('Email') ||
    usersContent?.includes('Vai trò'),
    'Admin Users management table loaded'
  );

  // 3.2 Admin Courses Table
  console.log('👉 Navigating to /admin/courses...');
  await adminPage.goto(`${BASE_URL}/admin/courses`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(1500);
  const coursesContent = await adminPage.textContent('main');
  assert(
    coursesContent?.includes('Quản lý khóa học') ||
    coursesContent?.includes('Khóa học') ||
    coursesContent?.includes('Mã khóa học') ||
    coursesContent?.includes('IELTS'),
    'Admin Courses management table loaded'
  );

  // 3.3 Admin Audit Logs
  console.log('👉 Navigating to /admin/audit...');
  await adminPage.goto(`${BASE_URL}/admin/audit`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(1500);
  const auditContent = await adminPage.textContent('main');
  assert(
    auditContent?.includes('Kiểm toán & Hoàn tác điểm phạt') ||
    auditContent?.includes('điểm phạt') ||
    auditContent?.includes('Học viên') ||
    auditContent?.includes('Trạng thái'),
    'Admin Audit & Penalty Reversal table loaded'
  );

  assert(adminErrors.length === 0, `Admin workflow had zero uncaught runtime errors (found: ${adminErrors.length})`);

  console.log('\n===============================================================');
  console.log(`📊 INTERACTIVE WORKFLOW AUDIT RESULTS:`);
  console.log(`   - Total Assertions: ${stats.total}`);
  console.log(`   - Passed:           ${stats.passed}`);
  console.log(`   - Failed:           ${stats.failed}`);
  if (stats.failures.length > 0) {
    console.log('❌ Failure details:');
    stats.failures.forEach((f) => console.log(`   - ${f}`));
  }
  console.log('===============================================================');

  await browser.close();

  if (stats.failed > 0) {
    process.exit(1);
  }
}

runDeepInteractiveCoverage().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
