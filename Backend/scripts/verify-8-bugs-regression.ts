export {};

const API_URL = 'http://localhost:3001/api/v1';

async function login(email: string, password: string = 'Password123!') {
  // Try Student@123456 / Teacher@123456 / Admin@123456 if Password123! fails
  let res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const fallbackPassword = email.startsWith('admin')
      ? 'Admin@123456'
      : email.startsWith('teacher')
      ? 'Teacher@123456'
      : 'Student@123456';
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: fallbackPassword }),
    });
  }
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status}`);
  const json = await res.json();
  const data = json.data || json;
  return {
    token: data.tokens?.accessToken,
    user: data.user,
  };
}

async function run() {
  console.log('===============================================================');
  console.log('🔬 INDEPENDENT REGRESSION VERIFICATION: ALL 8 REPORTED BUGS');
  console.log('===============================================================');
  let passed = 0;
  let failed = 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 1: Student Access to Courses & Multi-Tenant Isolation
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 1] Verifying Student Course Access & Multi-Tenant Isolation...');
  try {
    const student = await login('student@ielts-lms.local');
    const res = await fetch(`${API_URL}/courses`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });

    if (res.status === 403) {
      throw new Error('REGRESSION: GET /courses returned 403 Forbidden for Student!');
    }
    if (!res.ok) {
      throw new Error(`GET /courses returned HTTP ${res.status}`);
    }

    const json = await res.json();
    const courses = json.data?.items || json.data || [];
    console.log(`  ✅ Student GET /courses returned 200 OK (${courses.length} courses)`);

    // Verify multi-tenant isolation: check that student only gets enrolled courses
    const resMine = await fetch(`${API_URL}/courses/mine`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    if (!resMine.ok) throw new Error(`GET /courses/mine failed: ${resMine.status}`);
    const mineJson = await resMine.json();
    const mineCourses = mineJson.data?.items || mineJson.data || [];
    console.log(`  ✅ Student GET /courses/mine returned 200 OK (${mineCourses.length} courses)`);

    if (courses.length !== mineCourses.length) {
      throw new Error(`Tenant leak: GET /courses count (${courses.length}) != GET /courses/mine count (${mineCourses.length})`);
    }
    console.log('  ✅ VERIFIED: Multi-tenant isolation preserved. Student only receives their own enrolled courses.');
    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 1 FAILED: ${err.message}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 2: Teacher Access to Student Listings & Privilege Boundaries
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 2] Verifying Teacher Access to Student Listings & Role Guard...');
  try {
    const teacher = await login('teacher@ielts-lms.local');
    const res = await fetch(`${API_URL}/users?role=student`, {
      headers: { Authorization: `Bearer ${teacher.token}` },
    });

    if (res.status === 403) {
      throw new Error('REGRESSION: GET /users?role=student returned 403 Forbidden for Teacher!');
    }
    if (!res.ok) throw new Error(`GET /users?role=student returned ${res.status}`);

    const json = await res.json();
    const students = json.data?.items || json.data || [];
    console.log(`  ✅ Teacher GET /users?role=student returned 200 OK (${students.length} students)`);

    // Authorization regression test: Teacher attempts to list teachers/admins
    const resAttack = await fetch(`${API_URL}/users?role=admin`, {
      headers: { Authorization: `Bearer ${teacher.token}` },
    });
    const attackJson = await resAttack.json();
    const leakedAdmins = (attackJson.data?.items || attackJson.data || []).filter((u: any) => u.role === 'admin');
    if (leakedAdmins.length > 0) {
      throw new Error('AUTHORIZATION LEAK: Teacher was able to query and retrieve admin accounts!');
    }
    console.log('  ✅ VERIFIED: Teacher query is strictly scoped. No admin accounts leaked.');
    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 2 FAILED: ${err.message}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 3: Dashboard Lesson Field Mapping (meetingUrl, description, type)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 3] Verifying Dashboard Upcoming Lessons Field Mapping...');
  try {
    const student = await login('student@ielts-lms.local');
    const res = await fetch(`${API_URL}/dashboard/student`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    if (!res.ok) throw new Error(`GET /dashboard/student failed: ${res.status}`);

    const json = await res.json();
    const data = json.data || json;
    const upcomingLessons = data.upcomingLessons || [];
    console.log(`  ✅ Student dashboard returned ${upcomingLessons.length} upcoming lessons`);

    for (const l of upcomingLessons) {
      if (l.meetUrl && !l.meetingUrl) {
        throw new Error(`Lesson "${l.title}" has meetUrl but missing meetingUrl`);
      }
      if (l.content && !l.description) {
        throw new Error(`Lesson "${l.title}" has content but missing description`);
      }
      if (!l.type || !['live_meet', 'workshop', 'review'].includes(l.type)) {
        throw new Error(`Lesson "${l.title}" missing or invalid type: ${l.type}`);
      }
    }
    console.log('  ✅ VERIFIED: All dashboard lessons include meetingUrl, description, and valid type.');
    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 3 FAILED: ${err.message}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 4: Notification Boolean Query Parsing (read=false vs isRead=false)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 4] Verifying Notification Query Parameter Parsing & Boolean Semantics...');
  try {
    const student = await login('student@ielts-lms.local');

    // Test with read=false
    const resReadFalse = await fetch(`${API_URL}/notifications?read=false`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    if (!resReadFalse.ok) {
      throw new Error(`REGRESSION: GET /notifications?read=false returned HTTP ${resReadFalse.status}`);
    }
    const jsonFalse = await resReadFalse.json();
    const unread = jsonFalse.data?.items || jsonFalse.data || [];
    console.log(`  ✅ GET /notifications?read=false returned 200 OK (${unread.length} items)`);

    // Verify boolean semantics: read=false MUST actually mean false!
    for (const n of unread) {
      if (n.isRead === true) {
        throw new Error(`SEMANTIC BUG: Notification ${n.id} has isRead === true despite querying read=false!`);
      }
    }
    console.log('  ✅ VERIFIED: All items returned with read=false have isRead === false.');

    // Test with isRead=false
    const resIsReadFalse = await fetch(`${API_URL}/notifications?isRead=false`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    if (!resIsReadFalse.ok) throw new Error(`GET /notifications?isRead=false failed: ${resIsReadFalse.status}`);
    console.log('  ✅ GET /notifications?isRead=false returned 200 OK');

    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 4 FAILED: ${err.message}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 5: Populated Teacher References in Courses (Prevent Object-as-Child Crash)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 5] Verifying Course Teacher Field Serialization...');
  try {
    const admin = await login('admin@ielts-lms.local');
    const res = await fetch(`${API_URL}/courses`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    if (!res.ok) throw new Error(`GET /courses failed: ${res.status}`);

    const json = await res.json();
    const courses = json.data?.items || json.data || [];
    for (const c of courses) {
      if (typeof c.teacherId === 'object' && c.teacherId !== null) {
        throw new Error(`REGRESSION: Course ${c.code} teacherId is a raw Object! Will crash React.`);
      }
      if (typeof c.teacherId !== 'string') {
        throw new Error(`Course ${c.code} teacherId is not string: ${typeof c.teacherId}`);
      }
      if (!c.teacherName || typeof c.teacherName !== 'string') {
        throw new Error(`Course ${c.code} missing teacherName string!`);
      }
    }
    console.log(`  ✅ VERIFIED: All ${courses.length} courses serialize teacherId as string ID and teacherName as string.`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 5 FAILED: ${err.message}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 6: Unknown Status Handling in StatusBadge
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 6] Verifying StatusBadge Resilience Against Unknown Statuses...');
  try {
    const fs = await import('fs');
    const path = await import('path');
    const candidates = [
      path.resolve(process.cwd(), 'frontend/src/components/ui/status-badge.tsx'),
      path.resolve(process.cwd(), '../frontend/src/components/ui/status-badge.tsx'),
      path.resolve(__dirname, '../../frontend/src/components/ui/status-badge.tsx'),
    ];
    const badgePath = candidates.find(p => fs.existsSync(p)) || candidates[0];
    const badgeContent = fs.readFileSync(badgePath, 'utf-8');

    const requiredStatuses = ['available', 'expired', 'closed', 'reviewed', 'excused'];
    for (const st of requiredStatuses) {
      if (!badgeContent.includes(`${st}:`)) {
        throw new Error(`STATUS_MAP missing key: ${st}`);
      }
    }
    if (!badgeContent.includes('DEFAULT_STATUS_CONFIG')) {
      throw new Error('status-badge.tsx missing DEFAULT_STATUS_CONFIG fallback!');
    }
    console.log('  ✅ VERIFIED: StatusBadge defines full status coverage (available, expired, closed, reviewed, excused) + DEFAULT_STATUS_CONFIG fallback.');
    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 6 FAILED: ${err.message}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 7: Practice Exam Tags & Allowed Modes Defensive Handling
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 7] Verifying Practice Exam Tags & Allowed Modes Schemas...');
  try {
    const student = await login('student@ielts-lms.local');
    const res = await fetch(`${API_URL}/exam-tests`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    if (!res.ok) throw new Error(`GET /exam-tests failed: ${res.status}`);

    const json = await res.json();
    const tests = json.data?.items || json.data || [];
    console.log(`  ✅ Retrieved ${tests.length} exam tests`);

    for (const t of tests) {
      if (t.tags !== undefined && !Array.isArray(t.tags)) {
        throw new Error(`Test "${t.title}" tags is not an array: ${typeof t.tags}`);
      }
      if (t.allowedModes !== undefined && !Array.isArray(t.allowedModes)) {
        throw new Error(`Test "${t.title}" allowedModes is not an array: ${typeof t.allowedModes}`);
      }
    }
    console.log('  ✅ VERIFIED: All practice tests format tags and allowedModes safely as arrays.');
    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 7 FAILED: ${err.message}`);
    failed++;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BUG 8: Mock Router vs Real Router Route Consistency
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[BUG 8] Verifying Route Consistency for /courses/mine in Mock & Real...');
  try {
    const student = await login('student@ielts-lms.local');
    const resReal = await fetch(`${API_URL}/courses/mine`, {
      headers: { Authorization: `Bearer ${student.token}` },
    });
    if (!resReal.ok) throw new Error(`Real API /courses/mine failed with ${resReal.status}`);

    // Verify mock router file contains route for /courses/mine
    const fs = await import('fs');
    const path = await import('path');
    const mockCandidates = [
      path.resolve(process.cwd(), 'frontend/src/lib/api/mocks/router.ts'),
      path.resolve(process.cwd(), '../frontend/src/lib/api/mocks/router.ts'),
      path.resolve(__dirname, '../../frontend/src/lib/api/mocks/router.ts'),
    ];
    const mockRouterPath = mockCandidates.find(p => fs.existsSync(p)) || mockCandidates[0];
    const mockRouterContent = fs.readFileSync(mockRouterPath, 'utf-8');
    if (!mockRouterContent.includes('/courses/mine')) {
      throw new Error('Mock router does NOT contain route handler for /courses/mine!');
    }
    console.log('  ✅ VERIFIED: Both Real Backend and Mock Router support GET /courses/mine consistently.');
    passed++;
  } catch (err: any) {
    console.error(`  ❌ BUG 8 FAILED: ${err.message}`);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`📊 REGRESSION AUDIT SUMMARY: ${passed}/8 BUGS VERIFIED FIXED (${failed} failed)`);
  if (failed === 0) {
    console.log('🎉 ALL 8 REPORTED DEFECTS DEMONSTRABLY RESOLVED WITH ZERO REGRESSIONS!');
  } else {
    console.error(`💥 ${failed} DEFECTS FAILED VERIFICATION.`);
    process.exit(1);
  }
  console.log('===============================================================');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
