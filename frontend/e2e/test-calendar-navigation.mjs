// test-calendar-navigation.mjs
import { chromium } from '@playwright/test';

async function testCalendarForRole({ role, email, password, calendarUrl }) {
  console.log(`\n========================================`);
  console.log(`Testing ${role} Calendar at ${calendarUrl}`);
  console.log(`========================================`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
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

  // Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
  console.log(`Login successful, redirected to: ${page.url()}`);

  // Navigate to calendar
  console.log(`Navigating to ${calendarUrl}...`);
  await page.goto(calendarUrl, { waitUntil: 'networkidle' });

  // Give React time to render hooks, queries and effects
  await page.waitForTimeout(3000);

  const pageContent = await page.content();
  const hasRangeError = pageErrors.some((e) => e.includes('RangeError') || e.includes('Invalid date value'));
  const hasCrash = pageContent.includes('Application error') || pageContent.includes('An unexpected error has occurred');

  console.log(`Current page title/heading: ${await page.title()}`);
  console.log(`PageErrors count: ${pageErrors.length}`);
  console.log(`ConsoleErrors count: ${consoleErrors.length}`);

  if (hasRangeError || hasCrash) {
    console.error(`❌ CRITICAL FAILURE: Calendar crashed with errors!`);
    if (pageErrors.length > 0) console.error('Page errors:', pageErrors);
    await browser.close();
    process.exit(1);
  }

  // Look for calendar-specific UI text
  const bodyText = await page.innerText('body');
  const containsCalendarText = bodyText.includes('Lịch học') || bodyText.includes('Tuần') || bodyText.includes('Thứ');
  console.log(`Contains expected calendar Vietnamese keywords: ${containsCalendarText}`);

  if (!containsCalendarText) {
    console.warn(`⚠️ Warning: Expected calendar UI text was not detected in body`);
  } else {
    console.log(`✅ ${role} Calendar rendered smoothly without any date/time crashes!`);
  }

  await browser.close();
}

async function main() {
  await testCalendarForRole({
    role: 'Student',
    email: 'student@academy.edu.vn',
    password: 'Student@Academy2026!',
    calendarUrl: 'http://localhost:3000/student/calendar',
  });

  await testCalendarForRole({
    role: 'Teacher',
    email: 'teacher@academy.edu.vn',
    password: 'Teacher@Academy2026!',
    calendarUrl: 'http://localhost:3000/teacher/calendar',
  });

  console.log('\n======================================================');
  console.log('🎉 ALL CALENDAR TESTS PASSED WITH 0 RANGEERRORS / CRASHES!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

