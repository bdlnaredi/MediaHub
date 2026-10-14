// Unraid management: live container usage, updates, bulk actions, VMs, Unraid notifications and the container watchdog.
// Run against the pretend Unraid in lib/demo.js (including its small WebSocket server), so these prove MediaHub's own behaviour.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { boot, client, setup, sleep } = require('./helpers');
const fakes = require('../lib/demo');
// Live usage uses the WebSocket built into Node.js 22 (the Docker image). On Node.js 20 MediaHub says so instead.
const WS = typeof WebSocket === 'function';

async function world(env = {}, key = 'k') {
  const fake = fakes.create(), srv = http.createServer((req, res) => fake.handle(req, res, req.url));
  srv.on('upgrade', (req, sock) => fake.upgrade(req, sock, req.url));
  srv.listen(0); await new Promise(r => srv.once('listening', r));
  const s = await boot({ MONITOR_MS: '300', ...env }), a = client(s.base); await setup(a);
  const id = (await a.post('/api/services', { type: 'unraid', name: 'Tower', url: `http://127.0.0.1:${srv.address().port}/unraid`, apiKey: key })).data.id;
  const ur = fake.state.ur, cid = n => ur.containers.find(c => c.name === n).id;
  const until = async (f, ms = 6000) => { for (let t = 0; t < ms; t += 100) { const v = await f(); if (v) return v; await sleep(100); } return null; };
  return { s, a, id, fake, ur, cid, until, stop: async () => { await s.stop(); srv.close(); } };
}

test('page data: containers with details, live usage over WebSocket, VMs and Unraid notifications', async () => {
  const w = await world();
  try {
    const { a, id, until } = w;
    const d = (await a.get('/api/unraid/' + id)).data;
    assert.equal(d.containers.length, 7);
    const plex = d.containers.find(c => c.name === 'plex');
    assert.equal(plex.image, 'plexinc/pms-docker'); assert.equal(plex.autoStart, true);
    assert.equal(d.extra[plex.id].web, 'http://192.168.1.10:32400');
    assert.equal(d.vms.length, 2); assert.equal(d.notices.count.total, 2); assert.equal(d.notices.list[1].level, 'WARNING');
    assert.ok(d.updates[w.cid('radarr')] && d.updates[w.cid('qbittorrentvpn')]);
    assert.ok(d.watchdog && d.watchdog.on && d.watchdog.restart, 'watchdog is on and restarts by default');
    if (!WS) {
      const x = (await a.get(`/api/unraid/${id}?fast=1&usage=1`)).data;
      assert.match(x.usageErr, /Node\.js 22/, 'without WebSocket support the page says what is needed');
      assert.equal(x.states[w.cid('tautulli')].state, 'EXITED', 'and container states still update');
      return;
    }
    const live = await until(async () => { const x = (await a.get(`/api/unraid/${id}?fast=1&usage=1`)).data; return Object.keys(x.usage).length >= 6 && x; });
    assert.ok(live, 'live usage arrives');
    assert.ok(live.usageOn); assert.equal(live.usageErr, '');
    const u = live.usage[w.cid('plex').split(':').pop()];
    assert.ok(u.cpu > 0 && /MiB/.test(u.mem) && /GB \/ /.test(u.net));
    assert.equal(live.states[w.cid('tautulli')].state, 'EXITED');
  } finally { await w.stop(); }
});

test('updates run in the background, one, several or all, and are audited', async () => {
  const w = await world();
  try {
    const { a, id, ur, until } = w; ur.updateMs = 600;
    const r = await a.post(`/api/unraid/${id}/docker`, { action: 'update', ids: [w.cid('radarr')], names: ['radarr'] });
    assert.equal(r.status, 200); assert.ok(r.data.started);
    const busy = await a.post(`/api/unraid/${id}/docker`, { action: 'update', ids: [w.cid('radarr')] });
    assert.equal(busy.status, 409); assert.match(busy.data.error, /already running/);
    const job = await until(async () => { const j = (await a.get(`/api/unraid/${id}?fast=1&usage=1`)).data.job; return j && !j.running && j; });
    assert.equal(job.done, 1); assert.equal(job.error, '');
    assert.equal(ur.byId(w.cid('radarr')).isUpdateAvailable, false);
    await a.post(`/api/unraid/${id}/docker`, { action: 'update', all: true });
    await until(async () => { const j = (await a.get(`/api/unraid/${id}?fast=1&usage=1`)).data.job; return j && !j.running; });
    assert.ok(ur.containers.every(c => !c.isUpdateAvailable));
    assert.ok(w.fake.state.calls.some(c => /updateAllContainers/.test(c)));
    assert.ok((await a.get('/api/audit')).data.some(x => x.action === 'Updated containers'));
    assert.equal((await a.post(`/api/unraid/${id}/docker`, { action: 'stop', all: true })).status, 400, '"all" is only for updates');
  } finally { await w.stop(); }
});

test('bulk start, stop and pause; profiles that are not admins cannot control anything', async () => {
  const w = await world();
  try {
    const { a, id, ur } = w, ids = ['sonarr', 'radarr'].map(w.cid);
    assert.equal((await a.post(`/api/unraid/${id}/docker`, { action: 'stop', ids })).status, 200);
    assert.ok(ids.every(x => ur.byId(x).state === 'EXITED'));
    await a.post(`/api/unraid/${id}/docker`, { action: 'start', ids });
    assert.ok(ids.every(x => ur.byId(x).state === 'RUNNING'));
    await a.post(`/api/unraid/${id}/docker`, { action: 'pause', id: ids[0] }); assert.equal(ur.byId(ids[0]).state, 'PAUSED');
    await a.post(`/api/unraid/${id}/docker`, { action: 'unpause', id: ids[0] }); assert.equal(ur.byId(ids[0]).state, 'RUNNING');
    assert.equal((await a.post(`/api/unraid/${id}/docker`, { action: 'remove', ids })).status, 400, 'only known actions');
    assert.equal((await a.post(`/api/unraid/${id}/docker`, { action: 'stop', ids: ['x" } } mutation {'] })).status, 400, 'odd ids are refused');
    await a.post('/api/users', { name: 'kid', password: 'kid-password' });
    const kid = (await a.get('/api/users')).data.find(u => u.name === 'kid');
    await a.put(`/api/users/${kid.id}/access`, { access: [id] });
    const k = client(w.s.base); await k.post('/api/login', { name: 'kid', password: 'kid-password' });
    assert.equal((await k.get('/api/unraid/' + id)).status, 200, 'can look');
    assert.equal((await k.get('/api/unraid/' + id)).data.watchdog, undefined, 'but sees no watchdog settings');
    for (const [p, b] of [['docker', { action: 'stop', ids }], ['vm', { id: 'demoserver:vm-ha', action: 'stop' }], ['notices', { all: true }]])
      assert.equal((await k.post(`/api/unraid/${id}/${p}`, b)).status, 403, p);
    assert.equal((await k.put('/api/watchdog', { on: false })).status, 403);
  } finally { await w.stop(); }
});

test('VMs and Unraid notifications can be controlled', async () => {
  const w = await world();
  try {
    const { a, id, ur } = w;
    assert.equal((await a.post(`/api/unraid/${id}/vm`, { id: 'demoserver:vm-win', action: 'start', name: 'Windows 11' })).status, 200);
    assert.equal(ur.vms[1].state, 'RUNNING');
    await a.post(`/api/unraid/${id}/vm`, { id: 'demoserver:vm-win', action: 'forceStop' }); assert.equal(ur.vms[1].state, 'SHUTOFF');
    assert.equal((await a.post(`/api/unraid/${id}/vm`, { id: 'demoserver:vm-win', action: 'destroy' })).status, 400);
    await a.post(`/api/unraid/${id}/notices`, { ids: ['demoserver:n1'] });
    assert.deepEqual(ur.notes.map(n => n.id), ['demoserver:n2']);
    await a.post(`/api/unraid/${id}/notices`, { all: true }); assert.equal(ur.notes.length, 0);
    ur.noVmPerm = true;
    assert.match((await a.get('/api/unraid/' + id)).data.miss.vms, /not allowed/, 'a key without VM permission gets a plain explanation');
  } finally { await w.stop(); }
});

test('an older Unraid API: basic controls still work, new parts explain what is missing', async () => {
  const w = await world();
  try {
    const { a, id, ur, until } = w; ur.oldApi = true;
    const d = (await a.get('/api/unraid/' + id)).data;
    assert.equal(d.containers.length, 7); assert.match(d.miss.extra, /too old/); assert.equal(d.errors.length, 0);
    const msg = await until(async () => (await a.get(`/api/unraid/${id}?fast=1&usage=1`)).data.usageErr);
    assert.match(msg, WS ? /too old/ : /Node\.js 22/);
    await a.post(`/api/unraid/${id}/docker`, { action: 'update', ids: [w.cid('radarr')] });
    const job = await until(async () => { const j = (await a.get(`/api/unraid/${id}?fast=1&usage=1`)).data.job; return j && !j.running && j; });
    assert.match(job.error, /too old/);
    assert.equal((await a.post(`/api/unraid/${id}/docker`, { action: 'stop', id: w.cid('sonarr') })).status, 200);
  } finally { await w.stop(); }
});

test('a bad key on the live usage stream is explained', { skip: !WS && 'needs Node.js 22 (WebSocket)' }, async () => {
  const w = await world({}, 'bad');
  try { assert.match(await w.until(async () => (await w.a.get(`/api/unraid/${w.id}?fast=1&usage=1`)).data.usageErr), /not allowed/); }
  finally { await w.stop(); }
});

test('watchdog: restarts crashes, leaves deliberate stops alone, respects the skip list and gives up on crash loops', async () => {
  const w = await world();
  try {
    const { a, id, ur, until } = w, log = async () => (await a.get('/api/unraid/' + id)).data.watchdog.log;
    await sleep(900); // the first look only records what is running
    ur.crash('sonarr', 1);
    assert.ok(await until(() => ur.containers.find(c => c.name === 'sonarr').state === 'RUNNING'), 'a crashed container is started again');
    assert.match((await log())[0].what, /crashed \(exit code 1\), restarted it/);
    assert.ok((await a.get('/api/audit')).data.some(x => x.action === 'Restarted a container'));

    ur.crash('radarr', 0); await sleep(1200);
    assert.equal(ur.containers.find(c => c.name === 'radarr').state, 'EXITED', 'exit code 0 means someone stopped it on purpose');
    assert.ok((await log()).some(x => x.name === 'radarr' && x.what === 'was stopped'));
    await a.post(`/api/unraid/${id}/docker`, { action: 'start', id: w.cid('radarr') });

    await a.post(`/api/unraid/${id}/docker`, { action: 'stop', id: w.cid('plex') });
    ur.byId(w.cid('plex')).status = 'Exited (137) 1 second ago'; await sleep(1200);
    assert.equal(ur.byId(w.cid('plex')).state, 'EXITED', 'stopped from MediaHub: not restarted, even with an odd exit code');
    await a.post(`/api/unraid/${id}/docker`, { action: 'start', id: w.cid('plex') });

    assert.equal((await a.put('/api/watchdog', { skip: ['jackettvpn'] })).status, 200);
    await sleep(700); ur.crash('jackettvpn', 2); await sleep(1200);
    assert.equal(ur.containers.find(c => c.name === 'jackettvpn').state, 'EXITED', 'skipped containers are only reported');
    assert.ok((await log()).some(x => x.name === 'jackettvpn' && /crashed/.test(x.what)));

    await a.post(`/api/unraid/${id}/docker`, { action: 'start', id: w.cid('tautulli') }); await sleep(1100);
    for (let i = 0; i < 4; i++) { ur.crash('tautulli', 139); await sleep(900); }
    const t = ur.containers.find(c => c.name === 'tautulli');
    assert.equal(t.state, 'EXITED', 'stops trying after 3 restarts in an hour');
    assert.ok((await log()).some(x => x.name === 'tautulli' && /Gave up/.test(x.what)));
    const att = (await a.get('/api/attention')).data;
    assert.ok(att.some(x => x.tab === 'ur' && /stopped unexpectedly/.test(x.text)), 'shows under Needs attention');

    ur.arrayState = 'STOPPED'; ur.crash('sonarr', 1); await sleep(1200);
    assert.equal(ur.containers.find(c => c.name === 'sonarr').state, 'EXITED', 'nothing is restarted while the array is stopped');
    ur.arrayState = 'STARTED';

    assert.equal((await a.put('/api/watchdog', { restart: false })).data.restart, false);
    await a.post(`/api/unraid/${id}/docker`, { action: 'start', id: w.cid('sonarr') }); await sleep(1200);
    ur.crash('sonarr', 1); await sleep(1200);
    assert.equal(ur.containers.find(c => c.name === 'sonarr').state, 'EXITED', 'alerts only when restarting is off');
  } finally { await w.stop(); }
});
