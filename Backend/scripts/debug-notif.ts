async function debugNotif() {
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@ielts-lms.local', password: 'Student@123456' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.tokens?.accessToken || loginData.tokens?.accessToken;
  console.log('Got token');

  const url = 'http://localhost:3001/api/v1/notifications?read=false';
  const notifRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Status:', notifRes.status);
  const notifData = await notifRes.json();
  console.log('Result:', JSON.stringify(notifData, null, 2));
}

debugNotif().catch(console.error);
