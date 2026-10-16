// A Plex profile that cannot open every Plex library never gets the apps that list whole libraries, only sees "recently added" from the libraries it may open, and can only load pictures of things it was shown.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { boot, client, setup, sleep } = require('./helpers');
const fakes = require('../lib/demo');

async function run(all, fn) {
  const fake = fakes.create(), srv = http.createServer((req, res) => fake.handle(req, res, req.url)).listen(0);
  await new Promise(r => srv.once('listening', r));
  const fb = `http://127.0.0.1:${srv.address().port}`, s = await boot({ PLEX_TV_URL: fb + '/plextv', PLEX_AUTH_URL: 'https://app.plex.example/auth' }), a = client(s.base); await setup(a);
  try {
    const mk = async (type, name) => (await a.post('/api/services', { type, name, url: `${fb}/${type}`, apiKey: 'k' })).data.id;
    const ids = { plex: await mk('plex', 'Plex'), sonarr: await mk('sonarr', 'Sonarr'), qb: await mk('qbittorrent', 'qBit'), seerr: await mk('seerr', 'Seerr'), tau: await mk('tautulli', 'Tautulli') };
    fake.state.pinDelay = 100; fake.state.streams = 2; fake.state.plexAll = all;
    await a.put('/api/plexsettings', { on: true, sid: ids.plex, auto: true, access: Object.values(ids), perms: { request: true } });
    const c = client(s.base), st = await c.post('/api/plexlogin/start'); let r;
    for (let i = 0; i < 30; i++) { r = await c.get('/api/plexlogin/poll?t=' + st.data.ticket); if (!r.data.pending) break; await sleep(150); }
    assert.equal(r.status, 200, JSON.stringify(r.data));
    await fn({ a, c, ids });
  } finally { await s.stop(); srv.close(); }
}

test('a library hidden in Plex is hidden here: no library apps, recent only from allowed libraries, pictures only for what was shown', () => run(false, async ({ a, c, ids }) => {
  const names = (await c.get('/api/services')).data.map(x => x.type).sort();
  assert.deepEqual(names, ['plex', 'seerr', 'tautulli'], 'Sonarr and qBittorrent are not for someone who cannot open every library');
  assert.equal((await c.get(`/api/library?sid=${ids.sonarr}`)).status, 404);
  const owner = (await a.get('/api/services')).data.map(x => x.type); assert.ok(owner.includes('sonarr') && owner.includes('qbittorrent'));
  const now = (await c.get(`/api/plex/${ids.plex}/now`)).data;
  assert.deepEqual(now.recent.map(x => x.title).sort(), ['Library 1 item', 'Library 2 item'], 'nothing from the hidden library');
  const shown = now.recent[0].thumb;
  assert.equal((await c.get(`/api/plex/${ids.plex}/img?p=${encodeURIComponent(shown)}`)).status, 200);
  assert.equal((await c.get(`/api/plex/${ids.plex}/img?p=${encodeURIComponent('/library/metadata/93/thumb')}`)).status, 403, 'a picture it was not shown');
  assert.equal((await a.get(`/api/plex/${ids.plex}/img?p=${encodeURIComponent('/library/metadata/93/thumb')}`)).status, 200, 'the owner is not limited');
  const u = (await a.get('/api/users')).data.find(x => x.plex); assert.deepEqual(u.libs, { n: 2, of: 3, limited: true });
}));

test('a Plex profile that can open every library keeps its apps and the normal recent list', () => run(true, async ({ c, ids }) => {
  const names = (await c.get('/api/services')).data.map(x => x.type); assert.ok(names.includes('sonarr') && names.includes('qbittorrent'));
  const now = (await c.get(`/api/plex/${ids.plex}/now`)).data; assert.ok(now.recent.length > 0);
}));
