// Integration test: login as admin, create a user (role=user), login as that user and attempt admin action
// Use global fetch (Node 18+)
async function postJson(url, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function getJson(url, token) {
  const headers = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function main() {
  const base = 'http://localhost:4000';
  console.log('Logging in as default admin...');
  const adminLogin = await postJson(`${base}/api/login`, { username: 'admin', password: 'password' });
  console.log('adminLogin', adminLogin.status, adminLogin.body);
  const adminToken = JSON.parse(adminLogin.body).token;

  console.log('Creating user bob (role=user) as admin...');
  const createUser = await postJson(`${base}/api/users`, { username: 'bob', password: 'bobpass', role: 'user' }, adminToken);
  console.log('createUser', createUser.status, createUser.body);

  console.log('Logging in as bob...');
  const bobLogin = await postJson(`${base}/api/login`, { username: 'bob', password: 'bobpass' });
  console.log('bobLogin', bobLogin.status, bobLogin.body);
  const bobToken = JSON.parse(bobLogin.body).token;

  console.log('Bob attempts to create a track (should be forbidden)...');
  const bobCreateTrack = await postJson(`${base}/api/tracks`, { name: 'track1' }, bobToken);
  console.log('bobCreateTrack', bobCreateTrack.status, bobCreateTrack.body);

  console.log('Admin creates a track (should succeed)...');
  const adminCreateTrack = await postJson(`${base}/api/tracks`, { name: 'track-admin' }, adminToken);
  console.log('adminCreateTrack', adminCreateTrack.status, adminCreateTrack.body);
}

main().catch((e) => { console.error('Integration test error', e && e.stack ? e.stack : e); process.exit(1); });
