import { chromium } from 'playwright';
import assert from 'node:assert';

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

async function main() {
  console.log('===============================================================');
  console.log('🌟 E2E: EMPTY CUSTOMER DATABASE FRONTEND UX VERIFICATION');
  console.log('===============================================================');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => {
    console.error(`[PageError] ${err.message}`);
    pageErrors.push(err.message);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error(`[ConsoleError] ${msg.text()}`);
      consoleErrors.push(msg.text());
    }
  });

  let checks = 0;
  let passed = 0;

  try {
    // 1. Visit Login Page on clean uninitialized system
    console.log('\n[CHECK 1] Visiting /login on uninitialized customer platform...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const bodyText = await page.innerText('body');
    assert(bodyText.includes('Hệ thống chưa có Quản trị viên'), 'Uninitialized setup banner displayed');
    assert(bodyText.includes('Khởi tạo Quản trị viên ngay'), 'Setup link displayed');
    checks++; passed++;
    console.log('  ✅ [PASS] Login page detects uninitialized system and guides installer to /setup');

    // 2. Click setup link to go to /setup
    console.log('\n[CHECK 2] Navigating to /setup wizard...');
    const setupLink = page.getByRole('link', { name: /Khởi tạo Quản trị viên ngay/i });
    await setupLink.click();
    await page.waitForURL((u) => u.pathname.includes('/setup'), { timeout: 10000 });
    await page.waitForTimeout(1000);

    const setupHeader = await page.textContent('h1');
    assert(setupHeader?.includes('Khởi tạo'), 'Setup header visible');
    checks++; passed++;
    console.log(`  ✅ [PASS] Setup wizard rendered with heading: "${setupHeader?.trim()}"`);

    // Verify token input and form fields
    const tokenInput = page.locator('#setup-token');
    const emailInput = page.locator('#setup-email');
    const passwordInput = page.locator('#setup-password');

    assert(await tokenInput.isVisible(), 'Setup authorization token input is visible');
    assert(await emailInput.isVisible(), 'Admin email input is visible');
    assert(await passwordInput.isVisible(), 'Admin password input is visible');
    checks++; passed++;
    console.log('  ✅ [PASS] All required setup fields (token, email, password) are securely rendered');

    // 3. Verify zero runtime errors
    assert(pageErrors.length === 0, `Expected 0 page errors, found ${pageErrors.length}`);
    assert(consoleErrors.length === 0, `Expected 0 console errors, found ${consoleErrors.length}`);
    checks++; passed++;
    console.log('  ✅ [PASS] Zero runtime exceptions and zero console errors detected');

    console.log('\n===============================================================');
    console.log(`🎉 ALL ${passed}/${checks} EMPTY-STATE BROWSER CHECKS PASSED!`);
    console.log('===============================================================');
  } catch (err) {
    console.error('\n❌ Empty-state verification FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
