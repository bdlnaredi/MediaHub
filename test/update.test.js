// "Is there a newer MediaHub?" reads the project's version tags, ignores app tags, and can be turned off.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { boot, client, setup } = require('./helpers');
const pkg = require('../package.json');

const tagsServer = async tags => { const calls = []; const srv = http.createServer((req, res) => { calls.push(req.headers['user-agent']); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(tags.map(name => ({ name })))); }).listen(0); await new Promise(r => srv.once('listening', r)); return { srv, calls, url: `http://127.0.0.1:${srv.address().port}/tags` }; };

test('update notice: newest v-tag wins, app tags are ignored, up to date says so', async () => {
  const t = await tagsServer(['v0.14.1', 'app-v9.0.0', 'v0.99.0-beta', 'v0.15.0', 'v0.9.99', 'not-a-version']);
  const s = await boot({ UPDATE_URL: t.url }), a = client(s.base); await setup(a);
  try {
    const u = (await a.get('/api/update')).data; assert.equal(u.current, pkg.version); assert.equal(u.latest, 'v0.15.0'); assert.equal(u.newer, true); assert.equal(u.off, false); assert.match(u.url, /github\.com\/bdlnaredi\/mediahub\/releases$/);
    await a.get('/api/update'); assert.equal(t.calls.length, 1, 'asked GitHub once, then remembered'); assert.equal(t.calls[0], 'MediaHub');
    await a.post('/api/users', { name: 'kid', password: 'kid-password-1', role: 'user' });
    const k = client(s.base); await k.post('/api/login', { name: 'kid', password: 'kid-password-1' }); assert.equal((await k.get('/api/update')).status, 403, 'admins only');
    assert.equal((await client(s.base).get('/api/update')).status, 401);
  } finally { await s.stop(); t.srv.close(); }
  const t2 = await tagsServer(['v' + pkg.version, 'v0.1.0']), s2 = await boot({ UPDATE_URL: t2.url }), b = client(s2.base); await setup(b);
  try { const u = (await b.get('/api/update')).data; assert.equal(u.latest, 'v' + pkg.version); assert.equal(u.newer, false); } finally { await s2.stop(); t2.srv.close(); }
});

test('update notice: UPDATE_CHECK=off never calls GitHub, and an unreachable GitHub is not an error', async () => {
  const t = await tagsServer(['v9.9.9']), s = await boot({ UPDATE_URL: t.url, UPDATE_CHECK: 'off' }), a = client(s.base); await setup(a);
  try { const u = (await a.get('/api/update')).data; assert.equal(u.off, true); assert.equal(u.newer, false); assert.equal(t.calls.length, 0); } finally { await s.stop(); t.srv.close(); }
  const s2 = await boot({ UPDATE_URL: 'http://127.0.0.1:9/tags' }), b = client(s2.base); await setup(b);
  try { const r = await b.get('/api/update'); assert.equal(r.status, 200); assert.equal(r.data.latest, ''); assert.equal(r.data.newer, false); } finally { await s2.stop(); }
});
