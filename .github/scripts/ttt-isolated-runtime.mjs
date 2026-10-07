import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = path.resolve('isolated-artifact');
// Disposable downloaded artifact only, never production storage.
for (const dir of [root, path.join(root, 'backend')]) {
  for (const name of fs.readdirSync(dir)) if (name.startsWith('.env')) fs.rmSync(path.join(dir, name), { force: true });
}
const sourceId = n => `ABCDEF01-0000-4000-8000-${String(n).padStart(12, '0')}`;
const localSession = { id: 'fixture-existing', sr: 41, type: 'tttSession', eventId: 'FIXTURE-TTT-1', trackName: 'Manual trainer session', notes: 'Keep my notes', status: 'Scheduled', sessionDate: '2026-09-04' };
const fixture = {
  catalog: [localSession], tracks: [], events: [], reviews: [], metrics: { completed: 9 },
  users: [{ id: 'fixture-user', username: 'fixture', role: 'admin' }],
  tokens: [{ token: 'fixture-admin-only', userId: 'fixture-user', role: 'admin', expiresAt: Date.now() + 3600000 }, { token: 'fixture-viewer-only', userId: 'fixture-viewer', role: 'viewer', expiresAt: Date.now() + 3600000 }],
  _rmpSync: { lastSync: '2026-10-01T00:00:00Z', processedRequestIds: [sourceId(1), sourceId(2)] },
};
const dataPath = path.join(root, 'backend', 'data.json');
fs.writeFileSync(dataPath, JSON.stringify(fixture));
const source = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.endsWith('/myevents')) return res.end(JSON.stringify({ Status: 'Success', Data: [1, 2].map(n => ({ RequestUniqueName: sourceId(n), RequestId: `FIXTURE-TTT-${n}`, Title: `Trainer ${n} – 日本語`, EventFormat: 'Train-The-Trainer', ScheduledDate: '2026-09-04', Status: n === 2 ? 'Canceled' : 'Completed', TotalRecords: 2 })) }));
  const id = req.url.split('/').at(-1);
  if ([sourceId(1), sourceId(2)].includes(id)) return res.end(JSON.stringify({ Status: 'Success', Data: { UniqueName: id, TimeZone: 'India Standard Time', DeliveryLanguageName: 'English', SessionRequests: [] } }));
  res.statusCode = 404; res.end('{}');
});
source.listen(4124, '127.0.0.1');
await once(source, 'listening');
let child;
async function start() {
  child = spawn(process.execPath, ['backend/server.js'], {
    cwd: root, env: { PATH: process.env.PATH, HOME: process.env.RUNNER_TEMP, PORT: '4123', NODE_ENV: 'production', STORAGE_MODE: 'local', RMP_API_BASE_URL: 'http://127.0.0.1:4124', RMP_REQUEST_IMPORTS_ENABLED: 'false', RMP_SYNC_ENABLED: 'false', GITHUB_SYNC_SCHEDULE: '0 0 1 1 *' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated server startup exceeded 20 seconds')), 20000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('Backend running on')) { clearTimeout(timer); resolve(); } });
    child.stderr.on('data', () => {});
    child.once('error', () => { clearTimeout(timer); reject(new Error('Isolated server could not start')); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Isolated server exited before ready (${code})`)); });
  });
}
async function stop() {
  if (child && child.exitCode === null) { const closed = once(child, 'close'); child.kill('SIGTERM'); await closed; }
}
async function call(route, { method = 'GET', token, body } = {}) {
  const response = await fetch(`http://127.0.0.1:4123${route}`, { method, signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
try {
  await start();
  const page = await fetch('http://127.0.0.1:4123/dashboard/ttt');
  assert.equal(page.status, 200);
  const html = await page.text();
  const asset = html.match(/src="([^"]+\.js)"/)[1];
  const script = await (await fetch(`http://127.0.0.1:4123${asset}`)).text();
  for (const marker of ['/api/rmp/ttt/import', 'Save matching TTT requests', 'Import from RMP']) assert.ok(script.includes(marker));
  assert.equal((await call('/api/rmp/ttt/import', { method: 'POST', body: {} })).status, 401);
  assert.equal((await call('/api/rmp/ttt/import', { method: 'POST', token: 'fixture-viewer-only', body: {} })).status, 403);
  const b2cToken = `fixture.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
  const scanned = await call('/api/rmp/ttt/scan', { method: 'POST', token: 'fixture-admin-only', body: { b2cToken } });
  assert.equal(scanned.status, 200); assert.equal(scanned.body.items.length, 2);
  assert.deepEqual(JSON.parse(fs.readFileSync(dataPath, 'utf8')), fixture);
  const body = { b2cToken, requestIds: [sourceId(2)] };
  const saved = await call('/api/rmp/ttt/import', { method: 'POST', token: 'fixture-admin-only', body });
  assert.equal(saved.status, 200); assert.equal(saved.body.created, 1);
  const duplicate = await call('/api/rmp/ttt/import', { method: 'POST', token: 'fixture-admin-only', body });
  assert.equal(duplicate.status, 200); assert.equal(duplicate.body.existing, 1);
  await stop(); await start();
  const reloaded = await call('/api/catalog');
  assert.equal(reloaded.status, 200); assert.equal(reloaded.body.length, 2);
  assert.deepEqual(reloaded.body[0], localSession);
  assert.equal(reloaded.body[1].status, 'Canceled');
  assert.equal(reloaded.body[1].trackName, 'Trainer 2 – 日本語');
  const stored = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  assert.deepEqual(stored._rmpSync, fixture._rmpSync); assert.deepEqual(stored.metrics, fixture.metrics);
  console.log(JSON.stringify({ isolatedRuntime: 'passed', artifactRun: 37656130344, releaseSha: '75119101d7dcbc46f7cd6d47cbb07bcf3456774b', node: process.version, frontend: 200, adminGuard: true, scanReadOnly: true, save: true, deduplication: true, persistedAfterRestart: true, sourceStatusPreserved: true, noLiveCredentials: true }));
} finally { await stop(); await new Promise(resolve => source.close(resolve)); }