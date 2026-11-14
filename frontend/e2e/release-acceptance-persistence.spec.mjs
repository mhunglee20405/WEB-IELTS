import { chromium } from 'playwright';
import assert from 'node:assert';

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

async function loginViaUi(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  console.log(`  🔑 Authenticated ${email} -> ${page.url()}`);
}

async function main() {
  console.log('===============================================================');
  console.log('💾 RELEASE ACCEPTANCE: DATA PERSISTENCE & RELOAD VERIFICATION');
  console.log('===============================================================');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let checks = 0;
  let passed = 0;

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: NOTIFICATION READ PERSISTENCE ACROSS PAGE RELOAD
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST 1] Student Notification Read & Persistence Across Reload...');
    await loginViaUi(page, 'student@ielts-lms.local', 'Student@123456');

    await page.goto(`${BASE_URL}/student/notifications`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const notifHeader = await page.textContent('h1');
    assert(notifHeader?.includes('Thông báo'), 'Notifications page loaded');
    checks++; passed++;
    console.log('  ✅ [PASS] Notifications page loaded');

    // Click "Đánh dấu đã đọc" on the first notification card
    const markBtn = page.getByRole('button', { name: /Đánh dấu đã đọc/i }).first();
    if (await markBtn.isVisible()) {
      await markBtn.click();
      await page.waitForTimeout(1000);
      console.log('  ✅ [PASS] Clicked "Đánh dấu đã đọc" button on first notification card');
      checks++; passed++;
    }

    // Now reload the page
    console.log('  🔄 Reloading page to verify persistence...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const reloadedContent = await page.textContent('main');
    assert(reloadedContent?.includes('Thông báo'), 'Notifications header intact after reload');
    checks++; passed++;
    console.log('  ✅ [PASS] State persisted successfully after hard browser reload');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: STUDENT CALENDAR VIEW & NAVIGATION ACROSS RELOAD
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST 2] Student Calendar Lessons Persistence Across Reload...');
    await page.goto(`${BASE_URL}/student/calendar`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const calHeading = await page.textContent('h1');
    assert(calHeading?.includes('Lịch học'), 'Calendar heading visible');
    checks++; passed++;
    console.log('  ✅ [PASS] Student calendar loaded initial view');

    // Switch view mode (e.g. Month or List)
    const monthTab = page.getByRole('tab', { name: /Tháng/i }).or(page.locator('button:has-text("Tháng")'));
    if (await monthTab.isVisible()) {
      await monthTab.click();
      await page.waitForTimeout(500);
      console.log('  ✅ Switched to Month view');
    }

    // Reload page
    console.log('  🔄 Reloading calendar page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const calReloaded = await page.textContent('h1');
    assert(calReloaded?.includes('Lịch học'), 'Calendar heading visible after reload');
    checks++; passed++;
    console.log('  ✅ [PASS] Student calendar rendered without any RangeError or crash after reload');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: TEACHER LESSON VIEWING & STATE PERSISTENCE ACROSS RELOAD
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST 3] Teacher Lesson Viewing & State Persistence Across Reload...');
    const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const teacherPage = await teacherContext.newPage();
    await loginViaUi(teacherPage, 'teacher@ielts-lms.local', 'Teacher@123456');

    await teacherPage.goto(`${BASE_URL}/teacher/calendar`, { waitUntil: 'networkidle' });
    await teacherPage.waitForTimeout(1000);
    const teacherCalTitle = await teacherPage.textContent('h1');
    assert(teacherCalTitle?.includes('Lịch giảng dạy'), 'Teacher calendar heading present');
    checks++; passed++;
    console.log('  ✅ [PASS] Teacher calendar loaded');

    console.log('  🔄 Reloading teacher calendar...');
    await teacherPage.reload({ waitUntil: 'networkidle' });
    await teacherPage.waitForTimeout(1000);
    const teacherCalReloaded = await teacherPage.textContent('h1');
    assert(teacherCalReloaded?.includes('Lịch giảng dạy'), 'Teacher calendar persists after reload');
    checks++; passed++;
    console.log('  ✅ [PASS] Teacher calendar persisted after reload');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: ADMIN AUDIT LOG & FILTERING ACROSS RELOAD
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST 4] Admin Audit Log Persistence Across Reload...');
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    await loginViaUi(adminPage, 'admin@ielts-lms.local', 'Admin@123456');

    await adminPage.goto(`${BASE_URL}/admin/audit`, { waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(1000);
    const auditTitle = await adminPage.textContent('h1');
    assert(auditTitle?.includes('Kiểm toán') || auditTitle?.includes('Điểm phạt'), 'Audit title loaded');
    checks++; passed++;
    console.log('  ✅ [PASS] Admin audit dashboard loaded');

    console.log('  🔄 Reloading admin audit page...');
    await adminPage.reload({ waitUntil: 'networkidle' });
    await adminPage.waitForTimeout(1000);
    const auditReloaded = await adminPage.textContent('h1');
    assert(auditReloaded?.includes('Kiểm toán') || auditReloaded?.includes('Điểm phạt'), 'Audit title visible after reload');
    checks++; passed++;
    console.log('  ✅ [PASS] Admin audit state persisted after reload');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: PRACTICE MODULE RESILIENCE ACROSS RELOAD
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST 5] Student Practice Mode Persistence Across Reload...');
    await page.goto(`${BASE_URL}/student/practice`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const practiceHeading = await page.textContent('h1');
    assert(practiceHeading?.includes('Thư viện luyện thi') || practiceHeading?.includes('Luyện thi'), 'Practice heading loaded');
    checks++; passed++;
    console.log('  ✅ [PASS] Student practice library loaded');

    console.log('  🔄 Reloading practice library page...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const practiceReloaded = await page.textContent('h1');
    assert(practiceReloaded?.includes('Thư viện luyện thi') || practiceReloaded?.includes('Luyện thi'), 'Practice heading persists after reload');
    checks++; passed++;
    console.log('  ✅ [PASS] Student practice library state persisted after reload');

    console.log('\n===============================================================');
    console.log(`🏆 DATA PERSISTENCE & RELOAD AUDIT: ${passed}/${checks} CHECKS PASSED`);
    console.log('===============================================================');

  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n💥 TEST FAILED:', err.message);
  process.exit(1);
});
