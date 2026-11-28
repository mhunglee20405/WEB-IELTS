export {};

const API_URL = 'http://localhost:3001/api/v1';

async function login(email: string, pass: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as any;
  return {
    token: json.data?.tokens?.accessToken || json.tokens?.accessToken,
    user: json.data?.user || json.user,
  };
}

async function runScopeAudit() {
  console.log('===============================================================');
  console.log('🛡️ AUDITING TEACHER AUTHORIZATION SCOPE & ISOLATION BOUNDARIES');
  console.log('===============================================================');

  // Authenticate Admin, Teacher 1, Teacher 2, and Student
  const admin = await login('admin@ielts-lms.local', 'Admin@123456');
  const teacherA = await login('teacher@ielts-lms.local', 'Teacher@123456');
  const teacherB = await login('teacher2@ielts-lms.local', 'Teacher@123456');
  const student = await login('student@ielts-lms.local', 'Student@123456');

  console.log('✅ Authenticated test actors:');
  console.log(`   - Admin:     ${admin.user.email} (${admin.user.id})`);
  console.log(`   - Teacher A: ${teacherA.user.email} (${teacherA.user.id})`);
  console.log(`   - Teacher B: ${teacherB.user.email} (${teacherB.user.id})`);
  console.log(`   - Student:   ${student.user.email} (${student.user.id})`);

  // Find a course taught by Teacher B
  const coursesRes = await fetch(`${API_URL}/courses`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  const coursesData = ((await coursesRes.json()) as any).data.items;
  const courseB = coursesData.find((c: any) => c.teacherId === teacherB.user.id || c.teacherId?._id === teacherB.user.id);
  const courseA = coursesData.find((c: any) => c.teacherId === teacherA.user.id || c.teacherId?._id === teacherA.user.id);

  if (!courseB || !courseA) {
    throw new Error('Could not find distinct courses for Teacher A and Teacher B');
  }
  console.log(`\n📚 Target Courses identified:`);
  console.log(`   - Course A (owned by Teacher A): ${courseA.title} (${courseA.id || courseA._id})`);
  console.log(`   - Course B (owned by Teacher B): ${courseB.title} (${courseB.id || courseB._id})`);

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
    }
  }

  const courseAId = courseA.id || courseA._id;
  const courseBId = courseB.id || courseB._id;

  // 1. Teacher A attempts to access Course B details
  console.log('\n[Check 1] Teacher A accessing Course B details (GET /courses/:id)...');
  const cRes = await fetch(`${API_URL}/courses/${courseBId}`, {
    headers: { Authorization: `Bearer ${teacherA.token}` },
  });
  assert(cRes.status === 403, `Teacher A blocked from viewing Course B (HTTP ${cRes.status}, expected 403)`);

  // 2. Teacher A attempts to view student roster of Course B
  console.log('\n[Check 2] Teacher A viewing student roster of Course B (GET /courses/:id/students)...');
  const rosterRes = await fetch(`${API_URL}/courses/${courseBId}/students`, {
    headers: { Authorization: `Bearer ${teacherA.token}` },
  });
  assert(rosterRes.status === 403, `Teacher A blocked from viewing Course B student roster (HTTP ${rosterRes.status}, expected 403)`);

  // 3. Teacher A attempts to enroll a student into Course B
  console.log('\n[Check 3] Teacher A enrolling student into Course B (POST /courses/:id/students)...');
  const enrollRes = await fetch(`${API_URL}/courses/${courseBId}/students`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherA.token}` },
    body: JSON.stringify({ studentId: student.user.id }),
  });
  assert(enrollRes.status === 403, `Teacher A blocked from enrolling into Course B (HTTP ${enrollRes.status}, expected 403)`);

  // 4. Teacher A attempts to drop a student from Course B
  console.log('\n[Check 4] Teacher A dropping student from Course B (DELETE /courses/:id/students/:studentId)...');
  const dropRes = await fetch(`${API_URL}/courses/${courseBId}/students/${student.user.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${teacherA.token}` },
  });
  assert(dropRes.status === 403, `Teacher A blocked from dropping student from Course B (HTTP ${dropRes.status}, expected 403)`);

  // 5. Teacher A attempts to create a lesson in Course B
  console.log('\n[Check 5] Teacher A creating lesson in Course B (POST /courses/:id/lessons)...');
  const lessonRes = await fetch(`${API_URL}/courses/${courseBId}/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherA.token}` },
    body: JSON.stringify({
      title: 'Illegal Lesson by Teacher A',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      type: 'live_meet',
    }),
  });
  assert(lessonRes.status === 403, `Teacher A blocked from creating lesson in Course B (HTTP ${lessonRes.status}, expected 403)`);

  // 6. Teacher A attempts to create an assignment in Course B
  console.log('\n[Check 6] Teacher A creating assignment in Course B (POST /assignments)...');
  const asgRes = await fetch(`${API_URL}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacherA.token}` },
    body: JSON.stringify({
      courseId: courseBId,
      title: 'Illegal Assignment by Teacher A',
      assignedDate: new Date().toISOString().slice(0, 10),
    }),
  });
  assert(asgRes.status === 400 || asgRes.status === 403, `Teacher A blocked from creating assignment in Course B (HTTP ${asgRes.status}, expected 400/403)`);

  // 7. Teacher A attempts to view Admin account profile (GET /users/:adminId)
  console.log('\n[Check 7] Teacher A viewing Admin account profile (GET /users/:adminId)...');
  const uAdminRes = await fetch(`${API_URL}/users/${admin.user.id}`, {
    headers: { Authorization: `Bearer ${teacherA.token}` },
  });
  assert(uAdminRes.status === 403, `Teacher A blocked from viewing Admin account details (HTTP ${uAdminRes.status}, expected 403)`);

  // 8. Teacher A attempts to view Teacher B account profile (GET /users/:teacherBId)
  console.log('\n[Check 8] Teacher A viewing Teacher B account profile (GET /users/:teacherBId)...');
  const uTeacherBRes = await fetch(`${API_URL}/users/${teacherB.user.id}`, {
    headers: { Authorization: `Bearer ${teacherA.token}` },
  });
  assert(uTeacherBRes.status === 403, `Teacher A blocked from viewing Teacher B account details (HTTP ${uTeacherBRes.status}, expected 403)`);

  // 9. Teacher A views their own profile (GET /users/:teacherAId)
  console.log('\n[Check 9] Teacher A viewing own account profile (GET /users/:teacherAId)...');
  const uSelfRes = await fetch(`${API_URL}/users/${teacherA.user.id}`, {
    headers: { Authorization: `Bearer ${teacherA.token}` },
  });
  assert(uSelfRes.status === 200, `Teacher A can view their own profile (HTTP ${uSelfRes.status}, expected 200)`);

  // 10. Teacher A views student profile (GET /users/:studentId)
  console.log('\n[Check 10] Teacher A viewing student account profile (GET /users/:studentId)...');
  const uStudentRes = await fetch(`${API_URL}/users/${student.user.id}`, {
    headers: { Authorization: `Bearer ${teacherA.token}` },
  });
  assert(uStudentRes.status === 200, `Teacher A can view student profile (HTTP ${uStudentRes.status}, expected 200)`);

  console.log('\n===============================================================');
  console.log(`🛡️ TEACHER AUTHORIZATION SCOPE AUDIT: ${passed}/${total} CHECKS PASSED`);
  if (passed === total) {
    console.log('🎉 100% OF TEACHER ISOLATION AND AUTHORIZATION CHECKS PASSED!');
  } else {
    console.error(`💥 ${total - passed} CHECKS FAILED`);
    process.exit(1);
  }
  console.log('===============================================================');
}

runScopeAudit().catch((err) => {
  console.error('💥 Scope Audit failed with unhandled error:', err);
  process.exit(1);
});
