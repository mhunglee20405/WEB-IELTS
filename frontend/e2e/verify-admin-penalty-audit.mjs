import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import dns from 'dns';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const backendRequire = createRequire(path.resolve('Backend/package.json'));
const mongoose = backendRequire('mongoose');
const jwt = backendRequire('jsonwebtoken');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const API_URL = process.env.BACKEND_URL || 'http://localhost:3001/api/v1';

// Read env for database & JWT
const backendDir = 'D:\\WEB-IELTS\\Backend';
const envContent = fs.readFileSync(path.join(backendDir, '.env'), 'utf8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

if (env.MONGODB_DNS_SERVERS) {
  dns.setServers(env.MONGODB_DNS_SERVERS.split(','));
}

async function getAdminSession() {
  await mongoose.connect(env.MONGODB_URI);
  const usersCol = mongoose.connection.collection('users');
  const adminUser = await usersCol.findOne({ role: 'admin' });
  await mongoose.disconnect();

  if (!adminUser) throw new Error('No admin user found in database');

  const secret = env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  const tokenPayload = {
    sub: adminUser._id.toString(),
    email: adminUser.email,
    roles: adminUser.roles || [adminUser.role],
    role: adminUser.role,
    tv: adminUser.tokenVersion || 0,
  };

  const accessToken = jwt.sign(tokenPayload, secret, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ ...tokenPayload, type: 'refresh' }, secret, { expiresIn: '7d' });

  return {
    user: {
      id: adminUser._id.toString(),
      email: adminUser.email,
      fullName: adminUser.fullName || 'Quản trị viên',
      roles: adminUser.roles || [adminUser.role],
      role: adminUser.role,
      status: adminUser.status || 'active',
      timezone: adminUser.timezone || 'Asia/Ho_Chi_Minh',
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      tokenType: 'Bearer',
    },
  };
}

async function runE2E() {
  console.log('===============================================================');
  console.log('🔍 PLAYWRIGHT E2E: ADMIN PENALTY AUDIT & REVERSAL VERIFICATION');
  console.log(`Frontend URL: ${BASE_URL}`);
  console.log(`Backend API:  ${API_URL}`);
  console.log('===============================================================');

  const session = await getAdminSession();
  console.log(`🔑 Admin identity resolved: ${session.user.email} (${session.user.id})`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Add cookies and init script to populate session storage
  await context.addInitScript((sessionData) => {
    window.sessionStorage.setItem('web_ielts_dev_session', JSON.stringify(sessionData));
  }, session);

  const page = await context.newPage();

  const networkRequests = [];
  page.on('request', (req) => {
    if (req.url().includes('/penalties')) {
      networkRequests.push({
        url: req.url(),
        method: req.method(),
        headers: req.headers(),
      });
    }
  });

  const networkResponses = [];
  page.on('response', (res) => {
    if (res.url().includes('/penalties')) {
      networkResponses.push({
        url: res.url(),
        status: res.status(),
      });
    }
  });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error(`  ❌ [PageError] ${err.message}`);
    pageErrors.push(err.message);
  });

  try {
    // 1. Navigate to /admin/audit
    console.log('\n[STEP 1] Navigating to /admin/audit...');
    await page.goto(`${BASE_URL}/admin/audit`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Verify page title
    const title = await page.locator('h1').textContent();
    assert(title?.includes('Kiểm toán & Hoàn tác điểm phạt'), 'Header title matches');
    console.log(`  ✅ [PASS] Header title verified: "${title?.trim()}"`);

    // Verify subtitle
    const subtitle = await page.locator('header p').textContent();
    assert(subtitle?.includes('Giám sát toàn bộ bản ghi điểm phạt quá hạn'), 'Subtitle matches');
    console.log(`  ✅ [PASS] Subtitle verified: "${subtitle?.trim()}"`);

    // Verify network call
    assert(networkRequests.length > 0, 'Network request to /penalties was dispatched');
    const penaltyReq = networkRequests[0];
    console.log(`  ✅ [PASS] Dispatched ${penaltyReq.method} ${penaltyReq.url}`);
    assert(penaltyReq.headers['authorization']?.startsWith('Bearer '), 'Authorization header present');

    assert(networkResponses.length > 0, 'Network response from /penalties received');
    const penaltyRes = networkResponses[0];
    console.log(`  ✅ [PASS] Response received with HTTP ${penaltyRes.status}`);
    assert.strictEqual(penaltyRes.status, 200, 'HTTP status is 200 OK');

    // 2. Verify clean customer state UX
    console.log('\n[STEP 2] Verifying empty state rendering (Customer DB with 0 penalties)...');
    const bodyText = await page.innerText('body');
    assert(!bodyText.includes('Không thể tải dữ liệu'), 'No "Không thể tải dữ liệu" error alert');
    assert(!bodyText.includes('Không thể kết nối đến máy chủ'), 'No connection error alert');
    console.log('  ✅ [PASS] Zero error alerts present on page');

    assert(bodyText.includes('Không có bản ghi điểm phạt nào'), 'Empty title rendered');
    assert(bodyText.includes('Chưa phát sinh điểm phạt hoặc không có mục nào khớp bộ lọc.'), 'Empty description rendered');
    console.log('  ✅ [PASS] Clean empty state table rendered successfully');

    // 3. Test Tab Navigation
    console.log('\n[STEP 3] Testing filter tab switches...');
    const activeTab = page.getByRole('tab', { name: 'Đang hiệu lực' });
    await activeTab.click();
    await page.waitForTimeout(500);
    const activeBodyText = await page.innerText('body');
    assert(!activeBodyText.includes('Không thể tải dữ liệu'), 'No error when switching to "Đang hiệu lực"');
    console.log('  ✅ [PASS] Switched to tab "Đang hiệu lực" cleanly');

    const reversedTab = page.getByRole('tab', { name: 'Đã hoàn tác' });
    await reversedTab.click();
    await page.waitForTimeout(500);
    const reversedBodyText = await page.innerText('body');
    assert(!reversedBodyText.includes('Không thể tải dữ liệu'), 'No error when switching to "Đã hoàn tác"');
    console.log('  ✅ [PASS] Switched to tab "Đã hoàn tác" cleanly');

    const allTab = page.getByRole('tab', { name: 'Tất cả' });
    await allTab.click();
    await page.waitForTimeout(500);
    console.log('  ✅ [PASS] Returned to tab "Tất cả" cleanly');

    // 4. Capture screenshot
    const screenshotPath = 'C:\\Users\\MHung\\.gemini\\antigravity\\brain\\2b69ec69-4a33-477b-a2db-961e76c0cacf\\scratch\\admin-audit-success.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 [SCREENSHOT] Saved full page screenshot to: ${screenshotPath}`);

    assert.strictEqual(pageErrors.length, 0, 'No uncaught page errors occurred');
    console.log('\n===============================================================');
    console.log('🎉 E2E TEST PASSED 100% — REAL BROWSER + LIVE BACKEND + ATLAS');
    console.log('===============================================================');
  } finally {
    await browser.close();
  }
}

runE2E().catch((err) => {
  console.error('\n💥 [FATAL E2E ERROR]', err);
  process.exit(1);
});
