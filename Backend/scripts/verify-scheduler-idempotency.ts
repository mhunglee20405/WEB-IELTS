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

async function runIdempotencyAudit() {
  console.log('===============================================================');
  console.log('⚡ AUDITING BULLMQ DEADLINE SCHEDULER & PENALTY IDEMPOTENCY');
  console.log('===============================================================');

  const admin = await login('admin@ielts-lms.local', 'Admin@123456');
  const teacher = await login('teacher@ielts-lms.local', 'Teacher@123456');
  const student = await login('student@ielts-lms.local', 'Student@123456');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // 1. Check student profile initial penalty points
  const profileRes = await fetch(`${API_URL}/students/me/profile`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  assert(profileRes.ok, 'Student can fetch /students/me/profile');
  const profileData = (await profileRes.json()).data;
  const initialActivePenalties = profileData.activePenaltiesCount ?? 0;
  console.log(`ℹ️ Initial student activePenaltiesCount: ${initialActivePenalties}`);

  // 2. Fetch student's penalty ledger before tests
  const initialLedgerRes = await fetch(`${API_URL}/penalties/mine`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  assert(initialLedgerRes.ok, 'Student can fetch /penalties/mine');
  const initialLedger = (await initialLedgerRes.json()).data;
  const initialTotalPoints = initialLedger.totalPoints ?? 0;
  console.log(`ℹ️ Initial penalty ledger items count: ${initialLedger.items.length}, totalPoints: ${initialTotalPoints}`);

  // 3. Create a unique course, assignment, and student assignment due in the past
  console.log('\n--- Setting up isolated overdue test scenario ---');
  const timestamp = Date.now();
  const courseRes = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      title: `Idempotency Test Course ${timestamp}`,
      code: `IDEMP-${timestamp.toString().slice(-6)}`,
      description: 'Temporary course for scheduler idempotency audit',
      type: 'group',
      teacherId: teacher.user.id,
      startBand: 5.0,
      targetBand: 6.5,
    }),
  });
  if (!courseRes.ok) {
    console.error(`Course create failed: ${courseRes.status} ${await courseRes.text()}`);
  }
  assert(courseRes.ok, 'Admin created isolated test course');
  const course = (await courseRes.json()).data;

  // Fetch available exercise
  const exRes = await fetch(`${API_URL}/exercises`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert(exRes.ok, 'Fetched exercises list');
  const exList = ((await exRes.json()) as any).data.items;
  assert(exList && exList.length > 0, 'Found at least one published exercise');
  const targetExercise = exList[0];

  // Enroll student
  const enrollRes = await fetch(`${API_URL}/courses/${course.id || course._id}/students`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({ studentId: student.user.id }),
  });
  assert(enrollRes.ok, 'Student enrolled into test course');

  // Create an assignment due in past (2 hours ago)
  const pastDeadline = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const pastOpen = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const assignRes = await fetch(`${API_URL}/assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({
      courseId: course.id || course._id,
      exerciseId: targetExercise.id || targetExercise._id,
      title: `Overdue Idempotency Assignment ${timestamp}`,
      openAt: pastOpen,
      deadlineAt: pastDeadline,
    }),
  });
  if (!assignRes.ok) {
    console.error(`Assignment create failed: ${assignRes.status} ${await assignRes.text()}`);
  }
  assert(assignRes.ok, 'Assignment created with past deadline');
  const assignment = (await assignRes.json()).data;

  // Find the student assignment record
  const studentAssignRes = await fetch(`${API_URL}/assignments/mine`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  if (!studentAssignRes.ok) {
    console.error(`Fetch mine failed: ${studentAssignRes.status} ${await studentAssignRes.text()}`);
  }
  assert(studentAssignRes.ok, 'Student fetched assignments');
  const myAssignmentsResp = (await studentAssignRes.json()).data;
  const myAssignments = myAssignmentsResp.items || myAssignmentsResp;
  const targetSA = myAssignments.find((sa: any) =>
    (sa.assignmentId || sa.id) === (assignment.id || assignment._id)
  );
  assert(!!targetSA, 'Target student assignment record found in student roster');
  const targetSAId = targetSA.studentAssignmentId || targetSA.id || targetSA._id;
  console.log(`ℹ️ Target StudentAssignment ID: ${targetSAId}, status: ${targetSA.status}`);

  // 4. Test 10 sequential calls to process-overdue
  console.log('\n--- Running 10 Sequential process-overdue runs ---');
  for (let i = 1; i <= 10; i++) {
    const procRes = await fetch(`${API_URL}/deadlines/process-overdue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ courseId: course.id || course._id }),
    });
    assert(procRes.ok, `Sequential run #${i} returned HTTP 200`);
    const procData = (await procRes.json()).data;
    if (i === 1) {
      assert(procData.newPenaltiesCount === 1, 'First run charged exactly 1 new penalty');
    } else {
      assert(procData.newPenaltiesCount === 0, `Run #${i} charged 0 new penalties (idempotent skipped)`);
    }
  }

  // 5. Test 5 concurrent calls to process-overdue
  console.log('\n--- Running 5 Concurrent process-overdue runs ---');
  const concurrentPromises = Array.from({ length: 5 }, () =>
    fetch(`${API_URL}/deadlines/process-overdue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ courseId: course.id || course._id }),
    })
  );
  const concurrentResults = await Promise.all(concurrentPromises);
  for (let i = 0; i < concurrentResults.length; i++) {
    assert(concurrentResults[i].ok, `Concurrent request #${i + 1} succeeded safely`);
    const resJson = (await concurrentResults[i].json()).data;
    assert(resJson.newPenaltiesCount === 0, `Concurrent request #${i + 1} produced 0 new penalties`);
  }

  // 6. Verify ledger has exactly 1 penalty for this student assignment
  console.log('\n--- Verifying Ledger & Cache Integrity ---');
  const ledgerAfterRes = await fetch(`${API_URL}/penalties/mine`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  const ledgerAfter = (await ledgerAfterRes.json()).data;
  const newTransactions = ledgerAfter.items.filter((item: any) =>
    item.studentAssignmentId === targetSAId
  );
  assert(newTransactions.length === 1, `Exactly 1 penalty transaction created for target assignment (found: ${newTransactions.length})`);
  assert(newTransactions[0].deltaPoints === 1, 'Penalty transaction is +1 delta point');
  const createdPenalty = newTransactions[0];

  // Verify ledger totalPoints incremented by exactly 1
  assert(ledgerAfter.totalPoints === initialTotalPoints + 1, `Ledger totalPoints incremented by exactly 1 (${initialTotalPoints} -> ${ledgerAfter.totalPoints})`);

  // Verify profile activePenaltiesCount incremented by exactly 1
  const profileAfterRes = await fetch(`${API_URL}/students/me/profile`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  const profileAfterData = (await profileAfterRes.json()).data;
  assert(profileAfterData.activePenaltiesCount === initialActivePenalties + 1, `activePenaltiesCount incremented by exactly 1 (${initialActivePenalties} -> ${profileAfterData.activePenaltiesCount})`);

  // Verify notifications deduplicated
  const notifsRes = await fetch(`${API_URL}/notifications?limit=50`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  assert(notifsRes.ok, 'Student fetched notifications');
  const notifsData = (await notifsRes.json()).data;
  console.log(`ℹ️ Fetched ${notifsData.items.length} notifications. Types:`, notifsData.items.map((n: any) => ({ type: n.type, payload: n.payload })));
  const overdueNotifs = notifsData.items.filter((n: any) =>
    n.type?.toLowerCase() === 'overdue' && n.payload?.studentAssignmentId === targetSAId
  );
  assert(overdueNotifs.length === 1, `Exactly 1 overdue notification created (found: ${overdueNotifs.length})`);

  // 7. Test Reversal and Reversal Idempotency
  console.log('\n--- Testing Penalty Reversal Idempotency ---');
  const reverseRes = await fetch(`${API_URL}/penalties/${createdPenalty.id || createdPenalty._id}/reverse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({ reason: 'Excused due to technical issue' }),
  });
  assert(reverseRes.ok, 'First penalty reversal succeeded (HTTP 200/201)');
  const reverseData = (await reverseRes.json()).data;
  assert(reverseData.deltaPoints === -1, 'Reversal transaction has deltaPoints = -1');

  // Verify profile points restored
  const profileRestoredRes = await fetch(`${API_URL}/students/me/profile`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  const profileRestoredData = (await profileRestoredRes.json()).data;
  assert(profileRestoredData.activePenaltiesCount === initialActivePenalties, `activePenaltiesCount restored to initial level (${initialActivePenalties})`);

  const ledgerRestoredRes = await fetch(`${API_URL}/penalties/mine`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  const ledgerRestored = (await ledgerRestoredRes.json()).data;
  assert(ledgerRestored.totalPoints === initialTotalPoints, `Ledger totalPoints restored to initial level (${initialTotalPoints})`);

  // Attempt duplicate reversal (sequential)
  const dupReverseRes = await fetch(`${API_URL}/penalties/${createdPenalty.id || createdPenalty._id}/reverse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${admin.token}`,
    },
    body: JSON.stringify({ reason: 'Second attempt should fail' }),
  });
  assert(dupReverseRes.status === 400, `Second reversal attempt correctly rejected with HTTP 400 (got ${dupReverseRes.status})`);

  // Attempt concurrent duplicate reversals
  console.log('--- Testing Concurrent Duplicate Reversal Protection ---');
  const concurrentReversePromises = Array.from({ length: 5 }, () =>
    fetch(`${API_URL}/penalties/${createdPenalty.id || createdPenalty._id}/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ reason: 'Concurrent duplicate reversal attempt' }),
    })
  );
  const concurrentReverseResults = await Promise.all(concurrentReversePromises);
  const allRejected = concurrentReverseResults.every((r) => r.status === 400);
  assert(allRejected, 'All concurrent duplicate reversal attempts rejected with HTTP 400');

  // Verify total points ledger consistency
  const finalLedgerRes = await fetch(`${API_URL}/penalties/mine`, {
    headers: { Authorization: `Bearer ${student.token}` },
  });
  const finalLedger = (await finalLedgerRes.json()).data;
  const netDeltaForTest = finalLedger.items
    .filter((item: any) => item.studentAssignmentId === targetSAId)
    .reduce((sum: number, it: any) => sum + it.deltaPoints, 0);
  assert(netDeltaForTest === 0, `Net penalty delta for test assignment is exactly 0 (+1 and -1)`);

  // 8. Clean up test artifacts
  console.log('\n--- Cleaning up test course artifacts ---');
  await fetch(`${API_URL}/courses/${course.id || course._id}/students/${student.user.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  console.log('✅ Student dropped from temporary test course');

  console.log('===============================================================');
  console.log(`🏆 ALL IDEMPOTENCY CHECKS PASSED: ${passed}/${total}`);
  console.log('===============================================================');
}

runIdempotencyAudit().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
