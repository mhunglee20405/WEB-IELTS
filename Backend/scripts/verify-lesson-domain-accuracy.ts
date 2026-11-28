export {};

import mongoose from 'mongoose';

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

async function runDomainVerification() {
  console.log('===============================================================');
  console.log('🔬 VALIDATING LESSON DOMAIN ACCURACY & TYPE PERSISTENCE');
  console.log('===============================================================');

  const teacher = await login('teacher@ielts-lms.local', 'Teacher@123456');

  // Connect to DB directly to verify persistence
  await mongoose.connect('mongodb://localhost:27018/ielts_lms?replicaSet=rs0&directConnection=true');
  const LessonDb = mongoose.connection.db!.collection('lessons');

  // Find course owned by teacher
  const coursesRes = await fetch(`${API_URL}/courses`, {
    headers: { Authorization: `Bearer ${teacher.token}` },
  });
  const coursesData = ((await coursesRes.json()) as any).data.items;
  const course = coursesData.find((c: any) => c.teacherId === teacher.user.id || c.teacherId?._id === teacher.user.id);
  const courseId = course.id || course._id;

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

  const now = Date.now();
  const startTime = new Date(now + 86400000).toISOString();
  const endTime = new Date(now + 86400000 + 7200000).toISOString();

  // 1. Create a lesson with type: "workshop" and meetUrl
  console.log('\n[Check 1] Creating lesson with type: "workshop" and HTTPS Google Meet URL...');
  const createWorkshopRes = await fetch(`${API_URL}/courses/${courseId}/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacher.token}` },
    body: JSON.stringify({
      title: 'Specialized Academic Workshop 2026',
      description: 'Interactive workshop on complex grammatical structures',
      type: 'workshop',
      meetUrl: 'https://meet.google.com/wrk-test-999',
      startTime,
      endTime,
    }),
  });
  assert(createWorkshopRes.status === 201, `Lesson created with status 201 (got ${createWorkshopRes.status})`);
  const workshopJson = (await createWorkshopRes.json()) as any;
  const workshopData = workshopJson.data || workshopJson;
  assert(workshopData.type === 'workshop', `API response preserves type: "workshop" despite having meetUrl (got: "${workshopData.type}")`);

  // Verify persistence in MongoDB
  const workshopDbDoc = await LessonDb.findOne({ _id: new mongoose.Types.ObjectId(workshopData.id) });
  assert(workshopDbDoc?.type === 'workshop', `MongoDB document actually persists type: "workshop" (db value: "${workshopDbDoc?.type}")`);

  // 2. Create a lesson with type: "review"
  console.log('\n[Check 2] Creating lesson with type: "review"...');
  const createReviewRes = await fetch(`${API_URL}/courses/${courseId}/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacher.token}` },
    body: JSON.stringify({
      title: 'Full Simulation Test Review Session',
      description: 'Detailed analysis of student mock test answers',
      type: 'review',
      startTime,
      endTime,
    }),
  });
  assert(createReviewRes.status === 201, `Review lesson created with status 201 (got ${createReviewRes.status})`);
  const reviewJson = (await createReviewRes.json()) as any;
  const reviewData = reviewJson.data || reviewJson;
  assert(reviewData.type === 'review', `API response preserves type: "review" (got: "${reviewData.type}")`);

  const reviewDbDoc = await LessonDb.findOne({ _id: new mongoose.Types.ObjectId(reviewData.id) });
  assert(reviewDbDoc?.type === 'review', `MongoDB document actually persists type: "review" (db value: "${reviewDbDoc?.type}")`);

  // 3. Update lesson type via PATCH /lessons/:id
  console.log('\n[Check 3] Updating lesson type via PATCH /lessons/:id...');
  const updateRes = await fetch(`${API_URL}/lessons/${workshopData.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacher.token}` },
    body: JSON.stringify({
      type: 'review',
    }),
  });
  assert(updateRes.status === 200, `Lesson updated with status 200 (got ${updateRes.status})`);
  const updatedJson = (await updateRes.json()) as any;
  const updatedData = updatedJson.data || updatedJson;
  assert(updatedData.type === 'review', `API response returns updated type: "review" (got: "${updatedData.type}")`);

  const updatedDbDoc = await LessonDb.findOne({ _id: new mongoose.Types.ObjectId(workshopData.id) });
  assert(updatedDbDoc?.type === 'review', `MongoDB document updated to type: "review" (db value: "${updatedDbDoc?.type}")`);

  // 4. Validate rejection of invalid lesson type
  console.log('\n[Check 4] Rejecting invalid lesson type...');
  const invalidTypeRes = await fetch(`${API_URL}/courses/${courseId}/lessons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacher.token}` },
    body: JSON.stringify({
      title: 'Invalid Lesson Type Test',
      type: 'invalid_type_name',
      startTime,
      endTime,
    }),
  });
  assert(invalidTypeRes.status === 400, `Backend rejects invalid lesson type with 400 Bad Request (got ${invalidTypeRes.status})`);

  // 5. Clean up test lessons
  await LessonDb.deleteMany({ _id: { $in: [new mongoose.Types.ObjectId(workshopData.id), new mongoose.Types.ObjectId(reviewData.id)] } });
  await mongoose.disconnect();

  console.log('\n===============================================================');
  console.log(`🔬 LESSON DOMAIN ACCURACY AUDIT: ${passed}/${total} CHECKS PASSED`);
  if (passed === total) {
    console.log('🎉 100% OF LESSON DOMAIN ACCURACY CHECKS PASSED (ZERO FABRICATION)!');
  } else {
    console.error(`💥 ${total - passed} CHECKS FAILED`);
    process.exit(1);
  }
  console.log('===============================================================');
}

runDomainVerification().catch((err) => {
  console.error('💥 Lesson Domain verification failed:', err);
  process.exit(1);
});

