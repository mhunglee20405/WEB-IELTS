import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';

async function runDeepVerification() {
  console.log('===============================================================');
  console.log('🛡️ RUNNING DEEP PLAYWRIGHT QUALITY-GATE VERIFICATION');
  console.log('Target Frontend:', BASE_URL);
  console.log('Target Backend: ', API_URL);
  console.log('===============================================================');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  const stats = {
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    failures: [],
  };

  function assert(condition, message) {
    stats.totalChecks++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      stats.passedChecks++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      stats.failedChecks++;
      stats.failures.push(message);
    }
  }

  async function loginViaUi(page, email, password) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
    console.log(`  🔑 Logged in as ${email} -> ${page.url()}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: ADMINISTRATOR DEEP UI & DATA CONSISTENCY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 1] Administrator Deep UI & DB Verification...');
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  const adminErrors = [];
  adminPage.on('pageerror', (err) => adminErrors.push(err.message));

  await loginViaUi(adminPage, 'admin@ielts-lms.local', 'Admin@123456');

  // 1.1 Users Page
  console.log('👉 Testing /admin/users data table and search filter...');
  await adminPage.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle' });
  await adminPage.waitForSelector('table tbody tr', { timeout: 10000 });

  const userHeading = await adminPage.textContent('h1');
  assert(userHeading?.includes('Quản lý tài khoản'), 'Admin Users page title contains "Quản lý tài khoản"');

  const userRows = await adminPage.locator('table tbody tr').count();
  assert(userRows >= 10, `Admin table renders initial page with ${userRows} user rows`);

  // Test interactive search filter
  console.log('👉 Testing search filtering on /admin/users...');
  const searchInput = adminPage.locator('input[placeholder*="Tìm kiếm"]');
  if (await searchInput.isVisible()) {
    // Search 1: System Admin
    await searchInput.fill('System Admin');
    await adminPage.waitForTimeout(700);
    const adminMatch = await adminPage.textContent('table');
    assert(adminMatch?.includes('System Admin'), 'Search matches "System Admin"');

    // Search 2: Teacher Nguyen Van A
    await searchInput.fill('Nguyen Van A');
    await adminPage.waitForTimeout(700);
    const teacherMatch = await adminPage.textContent('table');
    assert(teacherMatch?.includes('Teacher Nguyen Van A'), 'Search matches "Teacher Nguyen Van A"');
    assert(!teacherMatch?.includes('Student Tran Thi B'), 'Search excludes non-matching Student Tran Thi B');

    // Search 3: Student Tran Thi B
    await searchInput.fill('Tran Thi B');
    await adminPage.waitForTimeout(700);
    const studentMatch = await adminPage.textContent('table');
    assert(studentMatch?.includes('Student Tran Thi B'), 'Search matches "Student Tran Thi B"');

    await searchInput.fill('');
    await adminPage.waitForTimeout(700);
  }

  // 1.2 Courses Page
  console.log('👉 Testing /admin/courses with real populated teacher names...');
  await adminPage.goto(`${BASE_URL}/admin/courses`, { waitUntil: 'networkidle' });
  await adminPage.waitForSelector('table tbody tr', { timeout: 10000 });

  const coursesHeading = await adminPage.textContent('h1');
  assert(coursesHeading?.includes('Giám sát khóa học'), 'Admin Courses page title contains "Giám sát khóa học"');

  const coursesTableText = await adminPage.textContent('table');
  assert(coursesTableText?.includes('IELTS-MASTER-01'), 'Admin courses table displays code "IELTS-MASTER-01"');
  assert(coursesTableText?.includes('Teacher Nguyen Van A'), 'Admin courses table displays teacher "Teacher Nguyen Van A"');
  assert(coursesTableText?.includes('6.5 - 7.5'), 'Admin courses table displays band range "6.5 - 7.5"');

  // 1.3 Audit Page
  console.log('👉 Testing /admin/audit...');
  await adminPage.goto(`${BASE_URL}/admin/audit`, { waitUntil: 'networkidle' });
  await adminPage.waitForTimeout(1000);
  const auditHeading = await adminPage.textContent('h1');
  assert(auditHeading?.includes('Kiểm toán') || auditHeading?.includes('điểm phạt'), 'Admin Audit page loads');

  assert(adminErrors.length === 0, `Admin workflow had 0 page exceptions (found: ${adminErrors.length})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: TEACHER DEEP UI & DATA CONSISTENCY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 2] Teacher Deep UI & DB Verification...');
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  const teacherErrors = [];
  teacherPage.on('pageerror', (err) => teacherErrors.push(err.message));

  await loginViaUi(teacherPage, 'teacher@ielts-lms.local', 'Teacher@123456');

  // 2.1 Dashboard
  console.log('👉 Testing /teacher/dashboard...');
  await teacherPage.goto(`${BASE_URL}/teacher/dashboard`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);

  const teacherDashText = await teacherPage.textContent('h1');
  assert(teacherDashText?.includes('Tổng quan Giảng viên'), 'Teacher dashboard heading is "Tổng quan Giảng viên"');

  // 2.2 Teacher Courses
  console.log('👉 Testing /teacher/courses...');
  await teacherPage.goto(`${BASE_URL}/teacher/courses`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const teacherCoursesText = await teacherPage.textContent('main');
  assert(teacherCoursesText?.includes('IELTS-MASTER-01'), 'Teacher courses renders assigned course IELTS-MASTER-01');

  // 2.3 Teacher Calendar
  console.log('👉 Testing /teacher/calendar...');
  await teacherPage.goto(`${BASE_URL}/teacher/calendar`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const teacherCalText = await teacherPage.textContent('h1');
  assert(teacherCalText?.includes('Lịch giảng dạy'), 'Teacher calendar heading is "Lịch giảng dạy"');

  // 2.4 Question Bank
  console.log('👉 Testing /teacher/question-bank...');
  await teacherPage.goto(`${BASE_URL}/teacher/question-bank`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const qBankTitle = await teacherPage.textContent('h1');
  assert(qBankTitle?.includes('Kho đề thi IELTS'), 'Question bank heading is "Kho đề thi IELTS"');
  const qBankMain = await teacherPage.textContent('main');
  assert(qBankMain?.includes('IELTS Cambridge Academic Reading Test 01'), 'Question bank renders CBT test 01');

  // 2.5 Translations Queue
  console.log('👉 Testing /teacher/translations...');
  await teacherPage.goto(`${BASE_URL}/teacher/translations`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const transQueueHeading = await teacherPage.textContent('h1');
  assert(transQueueHeading?.includes('Chấm bài dịch Reading'), 'Translations queue heading is "Chấm bài dịch Reading"');

  assert(teacherErrors.length === 0, `Teacher workflow had 0 page exceptions (found: ${teacherErrors.length})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 3: STUDENT DEEP UI & DATA CONSISTENCY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 3] Student Deep UI & DB Verification...');
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const studentErrors = [];
  studentPage.on('pageerror', (err) => studentErrors.push(err.message));

  await loginViaUi(studentPage, 'student@ielts-lms.local', 'Student@123456');

  // 3.1 Student Dashboard
  console.log('👉 Testing /student/dashboard...');
  await studentPage.goto(`${BASE_URL}/student/dashboard`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const studentDashTitle = await studentPage.textContent('h1');
  assert(studentDashTitle?.includes('Tổng quan học tập'), 'Student dashboard title is "Tổng quan học tập"');
  const studentDashMain = await studentPage.textContent('main');
  assert(studentDashMain?.includes('7.5'), 'Student dashboard renders target band 7.5');

  // 3.2 Student Courses
  console.log('👉 Testing /student/courses...');
  await studentPage.goto(`${BASE_URL}/student/courses`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const studentCoursesHeading = await studentPage.textContent('h1');
  assert(studentCoursesHeading?.includes('Khóa học của tôi'), 'Student courses heading is "Khóa học của tôi"');
  const studentCoursesMain = await studentPage.textContent('main');
  assert(studentCoursesMain?.includes('IELTS Intensive Masterclass 6.5 - 7.5'), 'Student enrolled course rendered');

  // 3.3 Student Assignments
  console.log('👉 Testing /student/assignments tabs & filters...');
  await studentPage.goto(`${BASE_URL}/student/assignments`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const asgTabs = await studentPage.locator('button[role="tab"]').count();
  assert(asgTabs >= 3, `Student assignments renders ${asgTabs} filter tabs (Tất cả, Chưa nộp, Đã nộp, ...)`);

  // 3.4 Student Practice Library
  console.log('👉 Testing /student/practice library & modes chips...');
  await studentPage.goto(`${BASE_URL}/student/practice`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const practiceTitle = await studentPage.textContent('h1');
  assert(practiceTitle?.includes('Thư viện luyện thi IELTS'), 'Student practice library heading is "Thư viện luyện thi IELTS"');
  const practiceMain = await studentPage.textContent('main');
  assert(practiceMain?.includes('IELTS Cambridge Academic Reading Test 01'), 'Student practice library displays CBT test 01');

  // 3.5 Student Extensions
  console.log('👉 Testing /student/extensions quota & history...');
  await studentPage.goto(`${BASE_URL}/student/extensions`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const extTitle = await studentPage.textContent('h1');
  assert(extTitle?.includes('Gia hạn nộp bài'), 'Student extensions page heading is "Gia hạn nộp bài"');

  // 3.6 Student Profile
  console.log('👉 Testing /student/profile...');
  await studentPage.goto(`${BASE_URL}/student/profile`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const profileTitle = await studentPage.textContent('h1');
  assert(profileTitle?.includes('Hồ sơ học viên'), 'Student profile heading is "Hồ sơ học viên"');
  const profileMain = await studentPage.textContent('main');
  assert(profileMain?.includes('Student Tran Thi B'), 'Student profile displays full name "Student Tran Thi B"');
  assert(profileMain?.includes('student@ielts-lms.local'), 'Student profile displays email');

  assert(studentErrors.length === 0, `Student workflow had 0 page exceptions (found: ${studentErrors.length})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 4: SECURITY GUARDS, FORBIDDEN ACCESS & EMPTY STATE RESILIENCE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 4] Security Guards, RBAC Boundaries & Edge Cases...');

  // 4.1 Student attempts to visit Admin route
  console.log('👉 Testing RBAC: Student attempting to navigate to /admin/users...');
  await studentPage.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const blockedText = await studentPage.textContent('main');
  const isBlocked = blockedText?.includes('Không có quyền truy cập') || studentPage.url().includes('/student') || studentPage.url().includes('/login') || studentPage.url().includes('/unauthorized');
  assert(isBlocked, 'Student is properly blocked/redirected from /admin/users (redirected to /unauthorized or blocked)');

  // 4.2 Unauthenticated user visits protected route
  console.log('👉 Testing Auth Guard: Unauthenticated user visiting /student/dashboard...');
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`${BASE_URL}/student/dashboard`, { waitUntil: 'networkidle' });
  await anonPage.waitForTimeout(1000);
  const anonUrl = anonPage.url();
  assert(anonUrl.includes('/login'), 'Unauthenticated user redirected to /login');

  console.log('\n===============================================================');
  console.log(`📊 FINAL PLAYWRIGHT DEEP AUDIT: ${stats.passedChecks}/${stats.totalChecks} CHECKS PASSED`);
  if (stats.failedChecks === 0) {
    console.log('🎉 100% OF DEEP UI, DATA CONSISTENCY & SECURITY CHECKS PASSED!');
  } else {
    console.error(`💥 ${stats.failedChecks} CHECKS FAILED:`, stats.failures);
    process.exit(1);
  }
  console.log('===============================================================');

  await browser.close();
}

runDeepVerification().catch((err) => {
  console.error('\n💥 PLAYWRIGHT DEEP VERIFICATION FAILED:', err);
  process.exit(1);
});
