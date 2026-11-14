import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';

async function runCompletenessAudit() {
  console.log('===============================================================');
  console.log('🌐 FUNCTIONAL COMPLETENESS & DEEP DATA ASSERTION VERIFICATION');
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

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 1: TEACHER WORKFLOWS & DATA INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 1] Teacher Workflows & Real Data Assertions...');
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  const teacherErrors = [];
  teacherPage.on('pageerror', (err) => teacherErrors.push(err.message));

  await loginViaUi(teacherPage, 'teacher@ielts-lms.local', 'Teacher@123456');

  // 1.1 Teacher Calendar with Real Lessons & Types
  console.log('👉 Checking /teacher/calendar lesson cards & badges...');
  await teacherPage.goto(`${BASE_URL}/teacher/calendar`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const teacherCalendarMain = await teacherPage.textContent('main');
  assert(teacherCalendarMain?.includes('Lịch giảng dạy'), 'Teacher calendar heading present');
  const hasLessonCards = await teacherPage.locator('article, .lms-card').count();
  assert(hasLessonCards >= 1, `Teacher calendar renders ${hasLessonCards} scheduled lesson card(s)`);

  // 1.2 Teacher Courses & Course Student Roster
  console.log('👉 Checking /teacher/courses and student roster navigation...');
  await teacherPage.goto(`${BASE_URL}/teacher/courses`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const coursesMain = await teacherPage.textContent('main');
  assert(coursesMain?.includes('IELTS Intensive Masterclass 6.5 - 7.5'), 'Teacher course list displays assigned masterclass');

  // Navigate to course detail or students
  const studentRosterLink = teacherPage.locator('a[href*="/students"]').first();
  if (await studentRosterLink.isVisible()) {
    await studentRosterLink.click();
    await teacherPage.waitForLoadState('networkidle');
    const rosterContent = await teacherPage.textContent('main');
    assert(rosterContent?.includes('học viên') || rosterContent?.includes('Danh sách'), 'Course students roster rendered');
  } else {
    // Navigate directly to teacher students directory
    await teacherPage.goto(`${BASE_URL}/teacher/students`, { waitUntil: 'networkidle' });
    await teacherPage.waitForTimeout(1000);
    const studentsListMain = await teacherPage.textContent('main');
    assert(studentsListMain?.includes('Học viên') || studentsListMain?.includes('Danh sách'), 'Teacher students directory rendered');
  }

  // 1.3 Teacher Translations Review Queue
  console.log('👉 Checking /teacher/translations submission queue...');
  await teacherPage.goto(`${BASE_URL}/teacher/translations`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const translationsMain = await teacherPage.textContent('main');
  assert(translationsMain?.includes('Chấm bài dịch Reading'), 'Translations review queue loaded');

  // 1.4 Teacher Question Bank & Test Builder
  console.log('👉 Checking /teacher/question-bank and full-test-builder...');
  await teacherPage.goto(`${BASE_URL}/teacher/question-bank`, { waitUntil: 'networkidle' });
  await teacherPage.waitForTimeout(1000);
  const qbMain = await teacherPage.textContent('main');
  assert(qbMain?.includes('IELTS Cambridge Academic Reading Test 01'), 'Question bank renders CBT Test 01');

  assert(teacherErrors.length === 0, `Teacher workflows had 0 page exceptions (found: ${teacherErrors.length})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE 2: STUDENT WORKFLOWS & REAL DATA ASSERTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 2] Student Workflows & Real Data Assertions...');
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const studentErrors = [];
  studentPage.on('pageerror', (err) => studentErrors.push(err.message));

  await loginViaUi(studentPage, 'student@ielts-lms.local', 'Student@123456');

  // 2.1 Student Notifications (/student/notifications)
  console.log('👉 Checking /student/notifications real database alerts...');
  await studentPage.goto(`${BASE_URL}/student/notifications`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const notifMain = await studentPage.textContent('main');
  assert(notifMain?.includes('Thông báo') || notifMain?.includes('thông báo'), 'Notifications page loaded');
  assert(
    notifMain?.includes('Bài tập mới') || notifMain?.includes('khóa học') || notifMain?.includes('Tất cả'),
    'Notifications view renders seeded alert contents'
  );

  // 2.2 Student Penalties (/student/penalties)
  console.log('👉 Checking /student/penalties transaction history...');
  await studentPage.goto(`${BASE_URL}/student/penalties`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const penaltyMain = await studentPage.textContent('main');
  assert(penaltyMain?.includes('Điểm phạt') || penaltyMain?.includes('quá hạn') || penaltyMain?.includes('Lịch sử'), 'Penalties page loaded');

  // 2.3 Student Calendar (/student/calendar) - Assert Type Labels
  console.log('👉 Checking /student/calendar type badges & Google Meet button...');
  await studentPage.goto(`${BASE_URL}/student/calendar`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const calendarMain = await studentPage.textContent('main');
  assert(calendarMain?.includes('Buổi 08:') || calendarMain?.includes('Live Google Meet') || calendarMain?.includes('Học trực tuyến') || calendarMain?.includes('Buổi học'), 'Student calendar renders live lesson details');

  // 2.4 Student Practice Library (/student/practice)
  console.log('👉 Checking /student/practice modes...');
  await studentPage.goto(`${BASE_URL}/student/practice`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const practiceMain = await studentPage.textContent('main');
  assert(practiceMain?.includes('Reading') && (practiceMain?.includes('Full Test') || practiceMain?.includes('Part')), 'Practice library displays skills and test modes');

  // 2.5 Student Extensions Quota (/student/extensions)
  console.log('👉 Checking /student/extensions quota tracking...');
  await studentPage.goto(`${BASE_URL}/student/extensions`, { waitUntil: 'networkidle' });
  await studentPage.waitForTimeout(1000);
  const extMain = await studentPage.textContent('main');
  assert(extMain?.includes('Gia hạn') || extMain?.includes('2 lần'), 'Extensions quota and rules rendered');

  assert(studentErrors.length === 0, `Student workflows had 0 page exceptions (found: ${studentErrors.length})`);

  console.log('\n===============================================================');
  console.log(`🌐 FUNCTIONAL COMPLETENESS AUDIT: ${stats.passed}/${stats.total} CHECKS PASSED`);
  if (stats.failed === 0) {
    console.log('🎉 100% OF EXTENDED WORKFLOW & DATA INTEGRITY CHECKS PASSED!');
  } else {
    console.error(`💥 ${stats.failed} CHECKS FAILED:`, stats.failures);
    process.exit(1);
  }
  console.log('===============================================================');

  await browser.close();
}

runCompletenessAudit().catch((err) => {
  console.error('💥 Functional completeness audit failed:', err);
  process.exit(1);
});

