// test-all-roles-login.mjs
import { chromium } from '@playwright/test';

async function testRole(email, password, expectedPathSnippet) {
  console.log(`\n--- Testing ${email} ---`);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  page.on('response', (response) => {
    if (response.url().includes('/auth/login')) {
      console.log(`[Network] POST /auth/login -> Status: ${response.status()}`);
    }
  });

  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });

  const currentUrl = page.url();
  console.log('Navigated to:', currentUrl);

  if (currentUrl.includes(expectedPathSnippet)) {
    console.log(`✅ ${email} LOGIN VERIFIED at ${currentUrl}`);
  } else {
    console.error(`❌ Unexpected URL: ${currentUrl}`);
    process.exit(1);
  }

  await browser.close();
}

async function main() {
  await testRole('student@ielts-lms.local', 'Student@123456', '/student');
  await testRole('teacher@ielts-lms.local', 'Teacher@123456', '/teacher');
  await testRole('admin@ielts-lms.local', 'Admin@123456', '/admin');
  console.log('\n=======================================');
  console.log('ALL THREE ROLES LOGGED IN SUCCESSFULLY!');
  console.log('=======================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

