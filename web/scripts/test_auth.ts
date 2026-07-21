const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:15431';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runTest() {
  console.log('--- Testing Auth S2-T1 ---');

  if (!SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is missing');
    return;
  }

  // 1. Create a dummy admin user
  console.log('Creating dummy admin user (admin@eventgate.com)...');
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'admin@eventgate.com',
      password: 'securepassword',
      email_confirm: true,
    })
  });
  
  const createData = await createRes.json();
  if (!createRes.ok && createData.msg !== 'User already registered' && createData.code !== 'user_already_exists') {
    console.error('Failed to create user:', createData);
  } else {
    console.log('User ready.');
  }

  // 2. Test Login API (Valid)
  console.log('\nTesting POST /api/v1/auth/admin/login (Valid credentials)...');
  const resValid = await fetch('http://localhost:3000/api/v1/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@eventgate.com', password: 'securepassword' })
  });
  const resValidText = await resValid.text();
  console.log('Login Valid Result Status:', resValid.status);
  console.log('Login Valid Result Body:', resValidText);
  let dataValid: any = {};
  try { dataValid = JSON.parse(resValidText); } catch(e){}
  
  let token = '';
  if (dataValid.status === 'success') {
    token = dataValid.data.access_token;
    console.log('✅ Access token received!');
  } else {
    console.log('Login failed:', dataValid);
  }

  // 3. Test Login API (Invalid)
  console.log('\nTesting POST /api/v1/auth/admin/login (Invalid credentials)...');
  const resInvalid = await fetch('http://localhost:3000/api/v1/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@eventgate.com', password: 'wrongpassword' })
  });
  console.log('Login Invalid HTTP Status:', resInvalid.status); // Expect 401
  if (resInvalid.status === 401) console.log('✅ Correctly blocked invalid credentials (401)');

  // 4. Test Protected Route without token
  console.log('\nTesting GET /api/v1/events (No Token)...');
  const resProtectedFail = await fetch('http://127.0.0.1:3000/api/v1/events');
  console.log('Protected Route (No Token) HTTP Status:', resProtectedFail.status); // Expect 401
  if (resProtectedFail.status === 401) console.log('✅ Correctly blocked unauthorized access (401)');

  // 5. Test Protected Route with token
  console.log('\nTesting GET /api/v1/events (With Token)...');
  const resProtectedSuccess = await fetch('http://127.0.0.1:3000/api/v1/events', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('Protected Route (With Token) HTTP Status:', resProtectedSuccess.status); // Expect 404 (not implemented), but NOT 401
  if (resProtectedSuccess.status !== 401) console.log('✅ Token successfully bypassed auth middleware!');

  console.log('\n--- Test Auth Finished ---');
}

runTest();
