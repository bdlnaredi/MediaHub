const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const DATA = process.env.DATA_DIR || '/data', FILE = path.join(DATA, 'db.json');
fs.mkdirSync(DATA, { recursive: true });
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version; } catch { return 'dev'; } })();
const TRUST = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || ''), SETUP_TOKEN = process.env.SETUP_TOKEN || '';
const same = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const PUB = path.join(__dirname, 'public'), KEYF = path.join(DATA, 'secret.key');
let KEY; try { KEY = fs.readFileSync(KEYF); } catch { KEY = crypto.randomBytes(32); fs.writeFileSync(KEYF, KEY, { mode: 0o600 }); }
const enc = v => {
  if (!v) return v;
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv), ct = Buffer.concat([c.update(String(v), 'utf8'), c.final()]);
  return 'enc:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
};
const dec = v => {
  if (!v || !String(v).startsWith('enc:')) return v;
  try {
    const b = Buffer.from(v.slice(4), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', KEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
};
let db = { users: [], services: [], requests: [], alerts: null };
if (fs.existsSync(FILE)) {
  try { db = JSON.parse(fs.readFileSync(FILE)); }
  catch (e) {
    try { db = JSON.parse(fs.readFileSync(FILE + '.bak')); console.error('db.json could not be read, so the last automatic copy (db.json.bak) was loaded instead.'); }
    catch { console.error('db.json is damaged and there is no usable db.json.bak. Refusing to start so nothing is overwritten. Restore it from a backup in ' + DATA); process.exit(1); }
  }
}
db.requests = db.requests || []; db.log = db.log || []; db.history = db.history || []; db.seedRules = db.seedRules || [];
db.services.forEach(s => { s.apiKey = dec(s.apiKey); s.pass = dec(s.pass); });
if (db.alerts) db.alerts.token = dec(db.alerts.token);
let lastBak = 0;
const save = () => {
  const data = JSON.stringify({ ...db,
    services: db.services.map(s => ({ ...s, apiKey: enc(s.apiKey), pass: enc(s.pass) })),
    alerts: db.alerts && { ...db.alerts, token: enc(db.alerts.token) } }, null, 1);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  try { if (fs.existsSync(FILE) && Date.now() - lastBak > 36e5) { fs.copyFileSync(FILE, FILE + '.bak'); lastBak = Date.now(); } } catch {}
  fs.renameSync(tmp, FILE);
};
if (db.users.length) save();
const uid = () => crypto.randomBytes(6).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const audit = (who, action, detail) => { db.log.push({ at: Date.now(), user: who, action, detail: String(detail == null ? '' : detail).slice(0, 200) }); if (db.log.length > 500) db.log.splice(0, db.log.length - 500); save(); };
const histKeys = new Set(db.history.map(h => h.hash + ':' + Math.round(h.at / 1000))), health = {};
const userOf = id => db.users.find(u => u.id === id);
const devLabel = ua => { ua = ua || ''; const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  const o = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''; return o ? b + ' on ' + o : b; };
async function pushTo(url, title, body) {
  if (!/^https?:\/\//i.test(url || '')) return false;
  const go = async (u, opt) => { const r = await fetch(u, { method: 'POST', signal: AbortSignal.timeout(8000), ...opt }); if (!r.ok) throw new Error('Notification service returned ' + r.status); };
  if (/discord(app)?\.com\/api\/webhooks/i.test(url)) await go(url, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `**${title}**\n${body}` }) });
  else await go(url, { headers: { Title: title }, body });
  return true;
}
const notifyUser = (u, title, body) => u && u.notify ? pushTo(u.notify, title, body) : Promise.resolve(false);
const KINDS = ['sonarr', 'radarr', 'prowlarr', 'jackett', 'qbittorrent', 'seerr', 'unraid', 'plex', 'tautulli', 'sabnzbd', 'bazarr', 'lidarr', 'readarr'];
const SESSF = path.join(DATA, 'sessions.json'), th = t => crypto.createHash('sha256').update(String(t || '')).digest('hex');
let sessions; try { sessions = new Map(Object.entries(JSON.parse(fs.readFileSync(SESSF))).map(([k, v]) => [k, typeof v === 'string' ? { uid: v, at: 0, seen: 0, ua: '', ip: '' } : v])); } catch { sessions = new Map(); }
const saveSess = () => fs.writeFileSync(SESSF, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
const qbCookie = {}, fails = {};
const ipOf = req => TRUST ? String(req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress).trim() : String(req.socket.remoteAddress || '');

const mkUser = (name, pw, role) => { const salt = uid(); return { id: uid(), name, role, salt, hash: hash(pw, salt), access: [] }; };
const pubUser = u => ({ id: u.id, name: u.name, role: u.role, access: u.access, perms: u.perms || null, notify: u.notify || '', dash: u.dash || null });
const pubSvc = s => ({ id: s.id, type: s.type, name: s.name, url: s.url });

// Checks that a service answers with the details you saved.
async function test(s) {
  const u = s.url.replace(/\/+$/, ''), t = { signal: AbortSignal.timeout(8000) };
  if (s.type === 'qbittorrent') {
    const r = await fetch(u + '/api/v2/auth/login', { ...t, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: u },
      body: new URLSearchParams({ username: s.user || '', password: s.pass || '' }) });
    return r.ok && !!(r.headers.get('set-cookie') || '');
  }
  if (s.type === 'unraid') {
    const r = await fetch(u + '/graphql', { ...t, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': s.apiKey || '' },
      body: JSON.stringify({ query: '{ online }' }) });
    return r.ok;
  }
  if (s.type === 'jackett')
    return (await fetch(u + '/api/v2.0/indexers/all/results/torznab/api?t=caps&apikey=' + encodeURIComponent(s.apiKey || ''), t)).ok;
  if (s.type === 'plex') return (await fetch(u + '/library/sections', { ...t, headers: { 'X-Plex-Token': s.apiKey || '' } })).ok;
  if (s.type === 'sabnzbd') { const r = await fetch(`${u}/api?mode=version&output=json&apikey=${encodeURIComponent(s.apiKey || '')}`, t); return r.ok && !!((await r.json().catch(() => ({}))).version); }
  if (s.type === 'tautulli') { const r = await fetch(`${u}/api/v2?apikey=${encodeURIComponent(s.apiKey || '')}&cmd=arnold`, t); return r.ok && ((await r.json().catch(() => ({}))).response || {}).result === 'success'; }
  if (s.type === 'bazarr') return (await fetch(u + '/api/system/status', { ...t, headers: { 'X-API-KEY': s.apiKey || '' } })).ok;
  const p = { sonarr: '/api/v3/system/status', radarr: '/api/v3/system/status', lidarr: '/api/v1/system/status', readarr: '/api/v1/system/status',
    prowlarr: '/api/v1/system/status', seerr: '/api/v1/status' }[s.type];
  return (await fetch(u + p, { ...t, headers: { 'X-Api-Key': s.apiKey || '' } })).ok;
}

const readBody = req => new Promise(ok => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 12e6) req.destroy(); });
  req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({}); } });
});
const send = (res, code, obj, headers = {}) => {
  if (res.headersSent) return;
  res.writeHead(code, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', ...headers });
  res.end(JSON.stringify(obj));
};
const login = (res, user) => {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(th(token), { uid: user.id, at: Date.now(), seen: Date.now(), ...res.info }); saveSess();
  send(res, 200, { user: pubUser(user) }, { 'Set-Cookie': `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${res.secure ? '; Secure' : ''}` });
};

    const gql = async (s, query) => {
      const x = await fetch(s.url.replace(/\/+$/, '') + '/graphql', { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', 'x-api-key': s.apiKey }, body: JSON.stringify({ query }) });
      const d = await x.json().catch(() => ({}));
      if (!x.ok || d.errors) throw new Error((d.errors && d.errors[0].message) || 'Unraid returned ' + x.status);
      return d.data;
    };
    const qb = async (s, path, form) => {
      const u = s.url.replace(/\/+$/, ''), F = { 'Content-Type': 'application/x-www-form-urlencoded', Referer: u };
      for (let i = 0; i < 2; i++) {
        if (!qbCookie[s.id]) {
          const x = await fetch(u + '/api/v2/auth/login', { method: 'POST', signal: AbortSignal.timeout(8000), headers: F,
            body: new URLSearchParams({ username: s.user || '', password: s.pass || '' }) });
          qbCookie[s.id] = (x.headers.get('set-cookie') || '').split(';')[0];
          if (!qbCookie[s.id]) throw new Error('qBittorrent sign-in failed');
        }
        const x = await fetch(u + path, { method: form ? 'POST' : 'GET', signal: AbortSignal.timeout(10000),
          headers: { ...F, Cookie: qbCookie[s.id] }, body: form ? new URLSearchParams(form) : undefined });
        if (x.status === 403) { delete qbCookie[s.id]; continue; }
        if (x.status === 404) throw Object.assign(new Error('Not supported'), { nf: true });
        const t = await x.text(); if (!x.ok) throw new Error(t || 'qBittorrent returned ' + x.status);
        try { return JSON.parse(t); } catch { return t; }
      }
      throw new Error('qBittorrent refused the request');
    };

const grabCache = new Map(), vpnCache = {}, mon = { up: {}, done: {}, seeded: {}, disk: {}, vpn: {}, share: {}, reqT: 0, n: 0, busy: false };
let homeIp = { v: '', t: 0 };
const cut = (v, n = 200) => String(v == null ? '' : v).slice(0, n);
async function qbUpload(s, fields, files) {
  await qb(s, '/api/v2/app/version');
  const u = s.url.replace(/\/+$/, ''), fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  for (const f of files) fd.append('torrents', new Blob([f.buf], { type: 'application/x-bittorrent' }), f.name);
  const x = await fetch(u + '/api/v2/torrents/add', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { Cookie: qbCookie[s.id], Referer: u }, body: fd });
  const r = (await x.text()).trim();
  if (!x.ok || r === 'Fails.') throw new Error(r || 'qBittorrent refused the file');
}
const rssFlat = (node, base, out) => {
  for (const [k, v] of Object.entries(node || {})) {
    const pth = base ? base + '\\' + k : k;
    if (v && typeof v === 'object' && (typeof v.url === 'string' || 'uid' in v)) out.push({ path: pth, name: k, url: v.url, error: v.hasError, articles: v.articles || [] });
    else if (v && typeof v === 'object') rssFlat(v, pth, out);
  }
  return out;
};
const rssItems = async s => rssFlat(await qb(s, '/api/v2/rss/items?withData=true'), '', []);
const ruleDef = x => ({ enabled: !!x.enabled, mustContain: cut(x.mustContain, 500), mustNotContain: cut(x.mustNotContain, 500), useRegex: !!x.useRegex,
  episodeFilter: cut(x.episodeFilter, 200), smartFilter: !!x.smartFilter, affectedFeeds: (Array.isArray(x.affectedFeeds) ? x.affectedFeeds : []).filter(u => typeof u === 'string').slice(0, 100),
  savePath: cut(x.savePath, 500), assignedCategory: cut(x.assignedCategory, 200), ignoreDays: Math.max(0, +x.ignoreDays || 0), addPaused: x.addPaused === true ? true : null,
  ...(x.torrentContentLayout ? { torrentContentLayout: cut(x.torrentContentLayout, 40) } : {}), ...(x.lastMatch ? { lastMatch: cut(x.lastMatch, 60) } : {}),
  ...(Array.isArray(x.previouslyMatchedEpisodes) ? { previouslyMatchedEpisodes: x.previouslyMatchedEpisodes.slice(0, 2000).map(e => cut(e, 60)) } : {}) });
async function notify(title, body) {
  const a = db.alerts;
  if (!a || !(a.target || (a.type === 'telegram' && a.token && a.chat))) return false;
  const go = async (url, opt) => {
    const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(8000), ...opt });
    if (!r.ok) throw new Error('Notification service returned ' + r.status);
  };
  if (a.type === 'discord') await go(a.target, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: `**${title}**\n${body}` }) });
  else if (a.type === 'telegram') await go(`https://api.telegram.org/bot${a.token}/sendMessage`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: a.chat, text: `${title}\n${body}` }) });
  else await go(a.target, { headers: { Title: title }, body });
  return true;
}
async function vpnStatus(s) {
  const c = vpnCache[s.id]; if (c && Date.now() - c.t < 60000) return c.r;
  const md = await qb(s, '/api/v2/sync/maindata?rid=0'), st = (md && md.server_state) || {}, ip = st.last_external_address_v4 || '';
  if (Date.now() - homeIp.t > 300000) {
    try { homeIp = { v: (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(6000) })).text()).trim(), t: Date.now() }; }
    catch { homeIp = { v: homeIp.v, t: Date.now() }; }
  }
  const r = { ip, conn: st.connection_status, vpn: ip && homeIp.v ? ip !== homeIp.v : null };
  vpnCache[s.id] = { t: Date.now(), r }; return r;
}
async function refreshRequests() {
  const open = db.requests.filter(x => x.status === 'approved' && x.seerrId && x.stage !== 'available').slice(0, 30); let changed = false;
  await Promise.all(open.map(async x => { try {
    const s = db.services.find(y => y.id === x.sid); if (!s) return;
    const r = await fetch(s.url.replace(/\/+$/, '') + '/api/v1/request/' + x.seerrId, { signal: AbortSignal.timeout(8000), headers: { 'X-Api-Key': s.apiKey } }); if (!r.ok) return;
    const d = await r.json(), ms = (d.media || {}).status, stage = d.status === 3 ? 'declined' : ms === 5 ? 'available' : ms === 4 ? 'partial' : ms === 3 ? 'downloading' : 'approved';
    if (stage !== x.stage) { x.stage = stage; changed = true; if (stage === 'available') await notifyUser(userOf(x.uid), 'Ready to watch', `${x.title} is now available.`).catch(() => {}); }
  } catch {} }));
  if (changed) save();
}
async function monitor() {
  if (mon.busy) return; mon.busy = true;
  try {
    const a = db.alerts || {}, safe = async f => { try { await f(); } catch {} }, now = Date.now() / 1000, sigOf = r => `${r.category}|${r.ratio}|${r.minutes}`;
    for (const s of db.services.filter(x => x.type === 'qbittorrent')) await safe(async () => {
      const list = await qb(s, '/api/v2/torrents/info'), first = !mon.seeded[s.id]; mon.seeded[s.id] = 1; let added = false;
      for (const x of list) {
        if (x.progress >= 1 && x.completion_on > 0 && x.completion_on < 4e9 && now - x.completion_on < 2592000) {
          const key = x.hash + ':' + x.completion_on;
          if (!histKeys.has(key)) {
            histKeys.add(key); added = true;
            db.history.push({ hash: x.hash, name: x.name, size: x.size, at: x.completion_on * 1000, cat: x.category || '', svc: s.id });
            if (!first && a.finished) await notify('Download finished', x.name).catch(() => {});
          }
        }
      }
      if (added) { db.history.sort((p, q) => p.at - q.at); if (db.history.length > 1000) db.history.splice(0, db.history.length - 1000); save(); }
      const rules = db.seedRules.filter(r => r.sid === s.id).sort((p, q) => (p.category === '*') - (q.category === '*')), groups = new Map();
      for (const x of list) {
        const r = rules.find(r => r.category === '*' || r.category === (x.category || '')); if (!r || mon.share[x.hash] === sigOf(r)) continue;
        if (!groups.has(r)) groups.set(r, []); groups.get(r).push(x.hash);
      }
      for (const [r, hl] of groups) {
        await qb(s, '/api/v2/torrents/setShareLimits', { hashes: hl.join('|'), ratioLimit: r.ratio > 0 ? r.ratio : -2, seedingTimeLimit: r.minutes > 0 ? r.minutes : -2, inactiveSeedingTimeLimit: -2 });
        hl.forEach(h => { mon.share[h] = sigOf(r); });
      }
    });
    await Promise.all(db.services.map(async s => {
      let ok = false; try { ok = await test(s); } catch {}
      health[s.id] = { ok, t: Date.now() };
      if (!a.offline) return;
      const st = mon.up[s.id] || (mon.up[s.id] = { ok: true, n: 0 });
      if (ok) { if (!st.ok) await notify('App back online', s.name + ' is reachable again').catch(() => {}); st.ok = true; st.n = 0; }
      else if (++st.n >= 2 && st.ok) { st.ok = false; await notify('App offline', s.name + ' is not responding').catch(() => {}); }
    }));
    if (a.disk) for (const s of db.services.filter(x => x.type === 'unraid')) await safe(async () => {
      const k = (await gql(s, '{ array { capacity { kilobytes { used total } } } }')).array.capacity.kilobytes, pct = +k.used / +k.total * 100;
      if (pct >= a.diskPct && !mon.disk[s.id]) { mon.disk[s.id] = 1; await notify('Array almost full', pct.toFixed(0) + '% of the array is used'); }
      else if (pct < a.diskPct - 3) mon.disk[s.id] = 0;
    });
    if (a.vpn) for (const s of db.services.filter(x => x.type === 'qbittorrent')) await safe(async () => {
      const v = await vpnStatus(s);
      if (v.vpn === false && !mon.vpn[s.id]) { mon.vpn[s.id] = 1; await notify('VPN not active', s.name + ' is not using the VPN'); }
      else if (v.vpn === true) mon.vpn[s.id] = 0;
    });
    if (++mon.n % 10 === 0) await safe(refreshRequests);
  } finally { mon.busy = false; }
}

http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname, m = req.method;
  res.secure = !!req.socket.encrypted || (TRUST && req.headers['x-forwarded-proto'] === 'https');
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (res.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  res.info = { ua: cut(req.headers['user-agent'], 200), ip: ipOf(req) };
  if (!p.startsWith('/api/')) {
    const fp = path.join(PUB, p), mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.js': 'text/javascript' }[path.extname(fp)];
    if (p !== '/' && mime && fp.startsWith(PUB + path.sep) && fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(fp));
    }
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
    return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
  }
  if (m !== 'GET' && m !== 'HEAD' && req.headers.origin) {
    let ok = false;
    try { const o = new URL(req.headers.origin).host, host = (TRUST && req.headers['x-forwarded-host']) || req.headers.host; ok = o === host || (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean).includes(req.headers.origin); } catch {}
    if (!ok) return send(res, 403, { error: 'Blocked a request from another website' });
  }
  try {
    const token = ((req.headers.cookie || '').match(/sid=(\w+)/) || [])[1];
    const sess = sessions.get(th(token)), me = db.users.find(u => sess && u.id === sess.uid);
    if (me && Date.now() - sess.seen > 60000) sess.seen = Date.now();
    const setup = !db.users.length;
    if (p === '/api/health') return send(res, 200, { ok: true, version: VERSION });
    if (p === '/api/me') return send(res, 200, { setup, setupCode: setup && !!SETUP_TOKEN, version: VERSION, user: me ? pubUser(me) : null });

    if (p === '/api/setup' && m === 'POST') {
      if (!setup) return send(res, 403, { error: 'Already set up' });
      const b = await readBody(req);
      if (SETUP_TOKEN && !same(b.token, SETUP_TOKEN)) return send(res, 403, { error: 'That setup code is not right' });
      if (!b.name || (b.password || '').length < 8) return send(res, 400, { error: 'Enter a name and a password of 8+ characters' });
      const u = mkUser(b.name, b.password, 'admin'); db.users.push(u); save(); return login(res, u);
    }
    if (p === '/api/login' && m === 'POST') {
      const ip = ipOf(req), fl = fails[ip] || { n: 0, t: 0 };
      if (Date.now() - fl.t > 600000) fl.n = 0;
      if (fl.n >= 8) return send(res, 429, { error: 'Too many attempts. Try again in 10 minutes.' });
      const b = await readBody(req), u = db.users.find(x => x.name.trim().toLowerCase() === (b.name || '').trim().toLowerCase());
      if (!(u ? crypto.timingSafeEqual(Buffer.from(hash(b.password || '', u.salt)), Buffer.from(u.hash)) : (hash(b.password || '', 'x'), false)))
        { fl.n++; fl.t = Date.now(); fails[ip] = fl; audit(cut(b.name, 40) || '?', 'Failed sign-in', ip); return send(res, 401, { error: 'Wrong name or password' }); }
      delete fails[ip]; audit(u.name, 'Signed in', res.info.ip);
      return login(res, u);
    }
    if (p === '/api/logout') { sessions.delete(th(token)); saveSess(); return send(res, 200, {}, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' }); }
    if (!me) return send(res, 401, { error: 'Sign in first' });

    if (p === '/api/password' && m === 'POST') {
      const b = await readBody(req);
      if (hash(b.old || '', me.salt) !== me.hash) return send(res, 400, { error: 'Your current password is wrong' });
      if ((b.new || '').length < 8) return send(res, 400, { error: 'New password must be 8+ characters' });
      me.salt = uid(); me.hash = hash(b.new, me.salt); save();
      for (const [k, v] of sessions) if (v.uid === me.id && k !== th(token)) sessions.delete(k);
      saveSess();
      return send(res, 200, {});
    }
    const allowed = s => me.role === 'admin' || me.access.includes(s.id);
    const can = k => me.role === 'admin' || !me.perms || me.perms[k] !== false;
    const deny = (k, what) => can(k) ? false : (send(res, 403, { error: `Your profile cannot ${what}.` }), true);
    if (p === '/api/services' && m === 'GET') return send(res, 200, db.services.filter(allowed).map(pubSvc));
    let r;
    if ((r = p.match(/^\/api\/status\/(\w+)$/))) {
      const s = db.services.find(x => x.id === r[1]);
      if (!s || !allowed(s)) return send(res, 404, { error: 'Not found' });
      return send(res, 200, { ok: await test(s).catch(() => false) });
    }

    const arr = s => s && allowed(s) && ['sonarr', 'radarr'].includes(s.type) ? s : null;
    const call = async (s, path, opt = {}) => {
      const r = await fetch(s.url.replace(/\/+$/, '') + path, { signal: AbortSignal.timeout(20000), ...opt,
        headers: { 'X-Api-Key': s.apiKey, 'Content-Type': 'application/json' } });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error((Array.isArray(d) && d[0] && d[0].errorMessage) || (d && d.message) || 'Request failed (' + r.status + ')');
      return d;
    };
    if (p === '/api/search' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, s = arr(db.services.find(x => x.id === q.get('sid')));
      if (!s) return send(res, 404, { error: 'Pick a Sonarr or Radarr service' });
      const look = (s.type === 'sonarr' ? '/api/v3/series/lookup?term=' : '/api/v3/movie/lookup?term=') + encodeURIComponent(q.get('term') || '');
      const [found, folders, profiles] = await Promise.all([call(s, look), call(s, '/api/v3/rootfolder'), call(s, '/api/v3/qualityprofile')]);
      const results = found.slice(0, 12).map(x => ({ title: x.title, year: x.year, overview: x.overview, added: !!x.id,
        poster: x.remotePoster || ((x.images || []).find(i => i.coverType === 'poster') || {}).remoteUrl, raw: x }));
      return send(res, 200, { results, folders: folders.map(f => ({ path: f.path })), profiles: profiles.map(f => ({ id: f.id, name: f.name })) });
    }
    if (p === '/api/add' && m === 'POST') {
      if (deny('add', 'add shows or movies')) return;
      const b = await readBody(req), s = arr(db.services.find(x => x.id === b.sid));
      if (!s || !b.item) return send(res, 404, { error: 'Not found' });
      const base = { ...b.item, rootFolderPath: b.rootFolderPath, qualityProfileId: +b.qualityProfileId, monitored: true };
      const body = s.type === 'sonarr' ? { ...base, seasonFolder: true, addOptions: { searchForMissingEpisodes: true } }
        : { ...base, minimumAvailability: 'released', addOptions: { searchForMovie: true } };
      await call(s, '/api/v3/' + (s.type === 'sonarr' ? 'series' : 'movie'), { method: 'POST', body: JSON.stringify(body) });
      return send(res, 200, {});
    }
    const svcOf = (id, t) => { const s = db.services.find(x => x.id === id); return s && allowed(s) && s.type === t ? s : null; };
    const addOpts = b => ({ ...(b.category ? { category: cut(b.category) } : {}),
      ...(b.savepath && me.role === 'admin' && !/[\r\n]/.test(b.savepath) ? { savepath: cut(b.savepath, 500) } : {}), ...(b.paused ? { paused: 'true', stopped: 'true' } : {}) });
    const hs = v => { const a = Array.isArray(v) ? v : [v]; return a.length && a.length <= 500 && a.every(x => /^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(x)) ? a.join('|') : null; };
    const adminOnly = () => me.role === 'admin' ? false : (send(res, 403, { error: 'Admins only' }), true);
    if ((r = p.match(/^\/api\/qb\/(\w+)\/list$/))) {
      const s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      const [t, ti, alt] = await Promise.all([qb(s, '/api/v2/torrents/info'), qb(s, '/api/v2/transfer/info'), qb(s, '/api/v2/transfer/speedLimitsMode').catch(() => 0)]);
      return send(res, 200, { dl: ti.dl_info_speed || 0, ul: ti.up_info_speed || 0, alt: +alt === 1, torrents: t.map(x => ({ hash: x.hash, name: x.name, state: x.state, progress: x.progress,
        dlspeed: x.dlspeed, upspeed: x.upspeed, size: x.size, added: x.added_on, eta: x.eta, ratio: x.ratio, seeds: x.num_seeds, peers: x.num_leechs, category: x.category || '',
        tags: x.tags || '', path: x.save_path, prio: x.priority })) });
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/act$/)) && m === 'POST') {
      const b = await readBody(req), s = svcOf(r[1], 'qbittorrent'), act = b.action;
      if (deny(act === 'delete' ? 'remove' : 'control', act === 'delete' ? 'remove downloads' : 'control downloads')) return;
      const hashes = b.hashes === 'all' ? 'all' : hs(b.hashes || b.hash);
      if (!s || !hashes) return send(res, 400, { error: 'Bad request' });
      if (hashes === 'all' && !['pause', 'resume'].includes(act)) return send(res, 400, { error: 'Bad request' });
      const either = async (n, f) => { try { await qb(s, '/api/v2/torrents/' + n[0], f); } catch (e) { if (!e.nf) throw e; await qb(s, '/api/v2/torrents/' + n[1], f); } };
      const f = { hashes };
      if (act === 'pause') await either(['stop', 'pause'], f);
      else if (act === 'resume') await either(['start', 'resume'], f);
      else if (act === 'force') await qb(s, '/api/v2/torrents/setForceStart', { ...f, value: 'true' });
      else if (act === 'recheck') await qb(s, '/api/v2/torrents/recheck', f);
      else if (act === 'reannounce') await qb(s, '/api/v2/torrents/reannounce', f);
      else if (act === 'delete') { await qb(s, '/api/v2/torrents/delete', { ...f, deleteFiles: b.files ? 'true' : 'false' }); audit(me.name, 'Removed downloads', hashes.split('|').length + ' torrent(s)' + (b.files ? ' with files' : '')); }
      else if (['top', 'up', 'down', 'bottom'].includes(act)) await qb(s, '/api/v2/torrents/' + { top: 'topPrio', up: 'increasePrio', down: 'decreasePrio', bottom: 'bottomPrio' }[act], f);
      else if (act === 'category') await qb(s, '/api/v2/torrents/setCategory', { ...f, category: cut(b.value) });
      else if (act === 'addtag' || act === 'rmtag') await qb(s, '/api/v2/torrents/' + (act === 'addtag' ? 'addTags' : 'removeTags'), { ...f, tags: cut(b.value) });
      else if (act === 'location') { if (adminOnly()) return; await qb(s, '/api/v2/torrents/setLocation', { ...f, location: cut(b.value, 500) }); }
      else if (act === 'rename' && !hashes.includes('|')) await qb(s, '/api/v2/torrents/rename', { hash: hashes, name: cut(b.value) });
      else return send(res, 400, { error: 'Unknown action' });
      return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/info$/))) {
      const s = svcOf(r[1], 'qbittorrent'), h = new URL(req.url, 'http://x').searchParams.get('hash') || '';
      if (!s || !hs(h) || h.includes('|')) return send(res, 400, { error: 'Bad request' });
      const [pr, files, trk, pe] = await Promise.all([qb(s, '/api/v2/torrents/properties?hash=' + h), qb(s, '/api/v2/torrents/files?hash=' + h),
        qb(s, '/api/v2/torrents/trackers?hash=' + h), qb(s, '/api/v2/sync/torrentPeers?hash=' + h + '&rid=0').catch(() => ({}))]);
      return send(res, 200, {
        props: { path: pr.save_path, size: pr.total_size, added: pr.addition_date, done: pr.completion_date, ratio: pr.share_ratio, down: pr.total_downloaded, up: pr.total_uploaded,
          seedTime: pr.seeding_time, comment: pr.comment, conns: pr.nb_connections },
        files: files.map((x, i) => ({ i: x.index != null ? x.index : i, name: x.name, size: x.size, progress: x.progress, prio: x.priority })),
        trackers: trk.filter(x => /^(https?|udp):/.test(x.url)).map(x => ({ url: x.url, status: x.status, seeds: x.num_seeds, peers: x.num_peers, msg: x.msg })),
        peers: Object.values(pe.peers || {}).slice(0, 100).map(x => ({ ip: x.ip, client: x.client, progress: x.progress, dl: x.dl_speed, up: x.up_speed })) });
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/meta$/))) {
      const s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      const md = await qb(s, '/api/v2/sync/maindata?rid=0');
      return send(res, 200, { free: (md.server_state || {}).free_space_on_disk, categories: Object.values(md.categories || {}).map(c => ({ name: c.name, path: c.savePath })), tags: md.tags || [] });
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/prefs$/))) {
      const s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      if (m === 'GET') { const a = await qb(s, '/api/v2/app/preferences'), k = v => Math.round((v || 0) / 1024);
        return send(res, 200, { dl: k(a.dl_limit), up: k(a.up_limit), altDl: k(a.alt_dl_limit), altUp: k(a.alt_up_limit) }); }
      if (adminOnly()) return;
      const b = await readBody(req), kb = v => Math.max(0, Math.round(+v || 0)) * 1024;
      await qb(s, '/api/v2/app/setPreferences', { json: JSON.stringify({ dl_limit: kb(b.dl), up_limit: kb(b.up), alt_dl_limit: kb(b.altDl), alt_up_limit: kb(b.altUp) }) });
      return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/alt$/)) && m === 'POST') {
      if (deny('control', 'change speed limits')) return;
      const s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      await qb(s, '/api/v2/transfer/toggleSpeedLimitsMode', {}); return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/(cat|tag)$/)) && m === 'POST') {
      if (adminOnly()) return;
      const b = await readBody(req), s = svcOf(r[1], 'qbittorrent'), n = cut(b.name, 100).trim(); if (!s || !n) return send(res, 400, { error: 'Enter a name' });
      if (r[2] === 'cat') {
        if (b.op === 'create') await qb(s, '/api/v2/torrents/createCategory', { category: n, savePath: cut(b.path, 500) });
        else if (b.op === 'remove') await qb(s, '/api/v2/torrents/removeCategories', { categories: n });
        else return send(res, 400, { error: 'Bad request' });
      } else if (b.op === 'create') await qb(s, '/api/v2/torrents/createTags', { tags: n });
      else if (b.op === 'remove') await qb(s, '/api/v2/torrents/deleteTags', { tags: n });
      else return send(res, 400, { error: 'Bad request' });
      return send(res, 200, {});
    }
    const rssOf = id => svcOf(id, 'qbittorrent');
    if ((r = p.match(/^\/api\/rss\/(\w+)\/feeds$/))) {
      const s = rssOf(r[1]); if (!s) return send(res, 404, { error: 'Not found' });
      return send(res, 200, (await rssItems(s)).map(f => ({ path: f.path, name: f.name, url: f.url, unread: f.articles.filter(a => !a.isRead).length, total: f.articles.length, error: !!f.error })));
    }
    if ((r = p.match(/^\/api\/rss\/(\w+)\/articles$/))) {
      const s = rssOf(r[1]), feed = new URL(req.url, 'http://x').searchParams.get('feed') || ''; if (!s) return send(res, 404, { error: 'Not found' });
      const out = [];
      for (const f of await rssItems(s)) if (!feed || f.path === feed) for (const a of f.articles) out.push({ id: a.id, title: a.title, date: a.date, feed: f.path, read: !!a.isRead });
      out.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
      return send(res, 200, out.slice(0, 300));
    }
    if ((r = p.match(/^\/api\/rss\/(\w+)\/(refresh|read)$/)) && m === 'POST') {
      const s = rssOf(r[1]), b = await readBody(req); if (!s) return send(res, 404, { error: 'Not found' });
      if (r[2] === 'refresh') await qb(s, '/api/v2/rss/refreshItem', { itemPath: cut(b.path, 300) });
      else await qb(s, '/api/v2/rss/markAsRead', { itemPath: cut(b.path, 300), ...(b.id ? { articleId: cut(b.id, 300) } : {}) });
      return send(res, 200, {});
    }
    if (p === '/api/rss/download' && m === 'POST') {
      if (deny('add', 'add downloads')) return;
      const b = await readBody(req), s = rssOf(b.sid); if (!s) return send(res, 404, { error: 'Not found' });
      const f = (await rssItems(s)).find(x => x.path === b.feed), a = f && f.articles.find(x => x.id === b.id), url = a && (a.torrentURL || a.link);
      if (!url || !/^(magnet:\?|https?:\/\/)/i.test(url)) return send(res, 400, { error: 'This article has no download link' });
      const out = await qb(s, '/api/v2/torrents/add', { urls: url, ...addOpts(b) });
      if (String(out).trim() === 'Fails.') return send(res, 400, { error: 'qBittorrent could not add that link' });
      qb(s, '/api/v2/rss/markAsRead', { itemPath: f.path, articleId: a.id }).catch(() => {});
      return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/rss\/(\w+)\/rules$/)) && m === 'GET') {
      const s = rssOf(r[1]); if (!s) return send(res, 404, { error: 'Not found' });
      const rules = await qb(s, '/api/v2/rss/rules');
      return send(res, 200, { rules: Object.entries(rules || {}).filter(([n]) => n !== '__mh_preview__').map(([name, v]) => ({ name, ...v })),
        feeds: (await rssItems(s)).map(f => ({ path: f.path, url: f.url })) });
    }
    if ((r = p.match(/^\/api\/rss\/(\w+)\/matches$/))) {
      const s = rssOf(r[1]); if (!s) return send(res, 404, { error: 'Not found' });
      return send(res, 200, await qb(s, '/api/v2/rss/matchingArticles?ruleName=' + encodeURIComponent(new URL(req.url, 'http://x').searchParams.get('name') || '')));
    }
    if ((r = p.match(/^\/api\/rss\/(\w+)\/(feed|rule)$/)) && m === 'POST') {
      if (adminOnly()) return;
      const s = rssOf(r[1]), b = await readBody(req); if (!s) return send(res, 404, { error: 'Not found' });
      if (r[2] === 'feed') {
        if (b.op === 'add') {
          if (!/^https?:\/\//i.test(b.url || '')) return send(res, 400, { error: 'Enter the feed web address (starts with http)' });
          await qb(s, '/api/v2/rss/addFeed', { url: cut(b.url, 1000), ...(b.path ? { path: cut(b.path, 300) } : {}) });
        } else if (b.op === 'remove') await qb(s, '/api/v2/rss/removeItem', { path: cut(b.path, 300) });
        else return send(res, 400, { error: 'Bad request' });
        return send(res, 200, {});
      }
      const name = cut(b.name, 120).trim();
      if (b.op === 'set') {
        if (!name || name === '__mh_preview__') return send(res, 400, { error: 'Give the rule a name' });
        await qb(s, '/api/v2/rss/setRule', { ruleName: name, ruleDef: JSON.stringify(ruleDef(b.rule || {})) }); return send(res, 200, {});
      }
      if (b.op === 'remove') { await qb(s, '/api/v2/rss/removeRule', { ruleName: name }); return send(res, 200, {}); }
      if (b.op === 'preview') {
        await qb(s, '/api/v2/rss/setRule', { ruleName: '__mh_preview__', ruleDef: JSON.stringify({ ...ruleDef(b.rule || {}), enabled: false }) });
        try { return send(res, 200, await qb(s, '/api/v2/rss/matchingArticles?ruleName=__mh_preview__')); }
        finally { await qb(s, '/api/v2/rss/removeRule', { ruleName: '__mh_preview__' }).catch(() => {}); }
      }
      return send(res, 400, { error: 'Bad request' });
    }
    if ((r = p.match(/^\/api\/jackett\/(\w+)$/))) {
      const s = svcOf(r[1], 'jackett'); if (!s) return send(res, 404, { error: 'Not found' });
      const term = new URL(req.url, 'http://x').searchParams.get('term') || '';
      const x = await fetch(`${s.url.replace(/\/+$/, '')}/api/v2.0/indexers/all/results?apikey=${encodeURIComponent(s.apiKey)}&Query=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(40000) });
      if (!x.ok) throw new Error('Jackett returned ' + x.status);
      const d = await x.json();
      return send(res, 200, (d.Results || []).sort((a, b) => (b.Seeders || 0) - (a.Seeders || 0)).slice(0, 30)
        .map(i => { if (grabCache.size > 300) grabCache.clear(); const id = uid(); grabCache.set(id, { u: i.MagnetUri || i.Link });
          return { id, title: i.Title, size: i.Size, seeders: i.Seeders || 0, tracker: i.Tracker }; }));
    }
    if ((r = p.match(/^\/api\/unraid\/(\w+)$/)) && m === 'GET') {
      const s = svcOf(r[1], 'unraid'); if (!s) return send(res, 404, { error: 'Not found' });
      const out = { containers: [], errors: [], notes: [] };
      const part = async (q, f, soft) => { try { f(await gql(s, q)); } catch (e) { (soft ? out.notes : out.errors).push(e.message); } };
      if (new URL(req.url, 'http://x').searchParams.get('fast')) {
        await part('{ metrics { cpu { percentTotal } memory { percentTotal } } }', d => { out.cpu = d.metrics.cpu.percentTotal; out.mem = d.metrics.memory.percentTotal; });
        return send(res, 200, out);
      }
      await Promise.all([
        part('{ info { os { hostname } } array { state capacity { kilobytes { used total } } } }', d => {
          out.host = d.info.os.hostname; out.arrayState = d.array.state;
          out.used = +d.array.capacity.kilobytes.used; out.total = +d.array.capacity.kilobytes.total; }),
        part('{ metrics { cpu { percentTotal } memory { percentTotal } } }', d => { out.cpu = d.metrics.cpu.percentTotal; out.mem = d.metrics.memory.percentTotal; }),
        part('{ docker { containers { id names state } } }', d => { out.containers = d.docker.containers.map(c => ({ id: c.id, name: (c.names[0] || '').replace(/^\//, ''), state: c.state })); }),
        part('{ array { parityCheckStatus { status progress errors running } disks { name temp status } parities { name temp status } caches { name temp status } } }', d => {
          const a = d.array, tag = (l, r) => (l || []).map(x => ({ name: x.name, role: r, temp: x.temp, status: x.status }));
          out.disks = [...tag(a.parities, 'Parity'), ...tag(a.disks, 'Data'), ...tag(a.caches, 'Cache')]; out.parity = a.parityCheckStatus || null;
        }, true),
        part('{ shares { name free used size } }', d => { out.shares = (d.shares || []).map(x => ({ name: x.name, free: +x.free, used: +x.used, size: +x.size })); }, true),
        part('{ docker { containers { id isUpdateAvailable } } }', d => { out.updates = {}; for (const c of d.docker.containers) if (c.isUpdateAvailable) out.updates[c.id] = true; }, true)
      ]);
      return send(res, 200, out);
    }
    if (p === '/api/torrent/add' && m === 'POST') {
      if (deny('add', 'add downloads')) return;
      const b = await readBody(req), s = svcOf(b.sid, 'qbittorrent');
      const urls = (b.jid ? [(grabCache.get(b.jid) || {}).u] : String(b.url || '').split(/\r?\n/).map(x => x.trim())).filter(Boolean).slice(0, 50);
      const ok = u => /^magnet:\?/i.test(u) || (/^https?:\/\//i.test(u) && (b.jid || me.role === 'admin'));
      if (!s || !urls.length || !urls.every(ok)) return send(res, 400, { error: 'Paste magnet links, one per line (admins can also paste torrent web addresses)' });
      const out = await qb(s, '/api/v2/torrents/add', { urls: urls.join('\n'), ...addOpts(b) });
      if (String(out).trim() === 'Fails.') return send(res, 400, { error: 'qBittorrent could not add that link' });
      return send(res, 200, {});
    }
    if (p === '/api/torrent/upload' && m === 'POST') {
      if (deny('add', 'add downloads')) return;
      const b = await readBody(req), s = svcOf(b.sid, 'qbittorrent');
      const files = (Array.isArray(b.files) ? b.files : []).slice(0, 5).map(f => ({ name: cut(f.name || 'file.torrent', 120).replace(/[^\w.\- ]/g, '_'), buf: Buffer.from(String(f.data || ''), 'base64') }));
      if (!s || !files.length || !files.every(f => f.buf.length > 20 && f.buf.length < 2e6 && f.buf[0] === 0x64)) return send(res, 400, { error: 'Choose valid .torrent files (up to 5, each under 2 MB)' });
      await qbUpload(s, addOpts(b), files);
      return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/vpn\/(\w+)$/))) {
      const s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      const v = await vpnStatus(s);
      return send(res, 200, { vpn: v.vpn, conn: v.conn, ip: v.ip ? v.ip.replace(/\.\d+$/, '.x') : '' });
    }
    if (p === '/api/seerr/search' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, s = svcOf(q.get('sid'), 'seerr');
      if (!s) return send(res, 404, { error: 'Pick a Seerr service' });
      const d = await call(s, '/api/v1/search?page=1&language=en&query=' + encodeURIComponent(q.get('term') || ''));
      if (!d || !Array.isArray(d.results)) throw new Error('Seerr gave an unexpected reply: ' + JSON.stringify(d).slice(0, 160));
      const kind = x => x.mediaType || (x.firstAirDate || x.name ? 'tv' : x.releaseDate || x.title ? 'movie' : '');
      return send(res, 200, d.results.filter(x => ['movie', 'tv'].includes(kind(x))).slice(0, 20).map(x => ({
        mediaType: kind(x), id: x.id, title: x.title || x.name, year: String(x.releaseDate || x.firstAirDate || '').slice(0, 4), overview: x.overview,
        poster: x.posterPath ? 'https://image.tmdb.org/t/p/w342' + x.posterPath : '', status: (x.mediaInfo || {}).status || 0 })));
    }
    const seerrAdd = (s, x) => call(s, '/api/v1/request', { method: 'POST',
      body: JSON.stringify({ mediaType: x.mediaType, mediaId: +x.mediaId, ...(x.mediaType === 'tv' ? { seasons: 'all' } : {}) }) });
    if (p === '/api/requests' && m === 'POST') {
      if (deny('request', 'make requests')) return;
      const b = await readBody(req), s = svcOf(b.sid, 'seerr');
      if (!s || !+b.mediaId || !['movie', 'tv'].includes(b.mediaType)) return send(res, 400, { error: 'Bad request' });
      const x = { id: uid(), sid: s.id, uid: me.id, user: me.name, mediaType: b.mediaType, mediaId: +b.mediaId, title: String(b.title || '').slice(0, 200),
        year: String(b.year || '').slice(0, 4), poster: String(b.poster || '').slice(0, 300), status: 'pending', at: Date.now() };
      if (me.role === 'admin') { const sr = await seerrAdd(s, x); x.seerrId = sr && sr.id; x.status = 'approved'; x.stage = 'approved'; }
      else notify('New request', `${me.name} requested ${x.title}`).catch(() => {});
      db.requests.push(x); save(); audit(me.name, 'Requested', x.title); return send(res, 200, x);
    }
    if (p === '/api/requests' && m === 'GET') {
      if (Date.now() - mon.reqT > 60000) { mon.reqT = Date.now(); await refreshRequests().catch(() => {}); }
      return send(res, 200, db.requests.filter(x => me.role === 'admin' || x.uid === me.id).slice(-100).reverse().map(x => ({ ...x, stage: x.stage || x.status })));
    }
    if (p === '/api/library' && m === 'GET') {
      const s = arr(db.services.find(x => x.id === new URL(req.url, 'http://x').searchParams.get('sid')));
      if (!s) return send(res, 404, { error: 'Pick a Sonarr or Radarr service' });
      const [d, profs] = await Promise.all([call(s, s.type === 'sonarr' ? '/api/v3/series' : '/api/v3/movie', { signal: AbortSignal.timeout(60000) }), call(s, '/api/v3/qualityprofile').catch(() => [])]);
      const prof = {}; (Array.isArray(profs) ? profs : []).forEach(q => { prof[q.id] = q.name; });
      return send(res, 200, d.map(x => {
        const st = x.statistics || {}, img = (x.images || []).find(i => i.coverType === 'poster') || {}, tv = s.type === 'sonarr', rt = x.ratings || {};
        const rating = tv ? +rt.value || 0 : +((rt.imdb || {}).value || (rt.tmdb || {}).value || rt.value) || 0;
        return { id: x.id, title: x.title, year: x.year, poster: img.remoteUrl || x.remotePoster, overview: (x.overview || '').slice(0, 600),
          size: tv ? st.sizeOnDisk || 0 : x.sizeOnDisk || 0, missing: tv ? Math.max(0, (st.episodeCount || 0) - (st.episodeFileCount || 0)) : (x.monitored && !x.hasFile ? 1 : 0),
          monitored: !!x.monitored, status: x.status || '', genres: (x.genres || []).slice(0, 6), maker: (tv ? x.network : x.studio) || '', profile: prof[x.qualityProfileId] || '',
          added: x.added || '', rating, runtime: x.runtime || 0, cert: x.certification || '',
          seasons: tv ? st.seasonCount || 0 : 0, have: tv ? st.episodeFileCount || 0 : (x.hasFile ? 1 : 0), total: tv ? st.episodeCount || 0 : 1, next: tv ? x.nextAiring || '' : '' };
      }));
    }
    if ((r = p.match(/^\/api\/series\/(\w+)\/(\d+)$/)) && m === 'GET') {
      const s = arr(db.services.find(x => x.id === r[1])); if (!s || s.type !== 'sonarr') return send(res, 404, { error: 'Not found' });
      const [sr, eps, files] = await Promise.all([call(s, `/api/v3/series/${r[2]}`), call(s, `/api/v3/episode?seriesId=${r[2]}`), call(s, `/api/v3/episodefile?seriesId=${r[2]}`).catch(() => [])]);
      const fmap = {}; (Array.isArray(files) ? files : []).forEach(f => { fmap[f.id] = { q: ((f.quality || {}).quality || {}).name || '', size: f.size || 0 }; });
      const now = Date.now();
      return send(res, 200, { id: sr.id, title: sr.title, monitored: !!sr.monitored, seasons: (sr.seasons || []).map(x => ({ n: x.seasonNumber, monitored: !!x.monitored })),
        episodes: (Array.isArray(eps) ? eps : []).map(e => { const dt = e.airDateUtc || e.airDate || '', f = fmap[e.episodeFileId] || {};
          return { id: e.id, season: e.seasonNumber, num: e.episodeNumber, title: e.title || '', date: dt, monitored: !!e.monitored, has: !!e.hasFile, quality: f.q || '', size: f.size || 0, aired: !!dt && Date.parse(dt) <= now }; })
          .sort((a, b) => a.season - b.season || a.num - b.num) });
    }
    if (p === '/api/monitor' && m === 'POST') {
      if (deny('add', 'change what is monitored')) return;
      const b = await readBody(req), s = arr(db.services.find(x => x.id === b.sid)), mon = !!b.monitored, id = +b.id;
      if (!s) return send(res, 404, { error: 'Not found' });
      const put = (path, obj) => call(s, path, { method: 'PUT', body: JSON.stringify(obj) });
      if (b.kind === 'movie' && s.type === 'radarr' && id > 0) { const mv = await call(s, `/api/v3/movie/${id}`); mv.monitored = mon; await put(`/api/v3/movie/${id}`, mv); }
      else if (b.kind === 'series' && s.type === 'sonarr' && id > 0) { const sr = await call(s, `/api/v3/series/${id}`); sr.monitored = mon; await put(`/api/v3/series/${id}`, sr); }
      else if (b.kind === 'season' && s.type === 'sonarr' && id > 0 && Number.isInteger(+b.season)) {
        const sr = await call(s, `/api/v3/series/${id}`), se = (sr.seasons || []).find(x => x.seasonNumber === +b.season);
        if (!se) return send(res, 404, { error: 'That season was not found' });
        se.monitored = mon; await put(`/api/v3/series/${id}`, sr);
        const ids = (await call(s, `/api/v3/episode?seriesId=${id}`)).filter(e => e.seasonNumber === +b.season).map(e => e.id);
        if (ids.length) await put('/api/v3/episode/monitor', { episodeIds: ids, monitored: mon });
      } else if (b.kind === 'episodes' && s.type === 'sonarr') {
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500);
        if (!ids.length) return send(res, 400, { error: 'Bad request' });
        await put('/api/v3/episode/monitor', { episodeIds: ids, monitored: mon });
      } else return send(res, 400, { error: 'Bad request' });
      audit(me.name, mon ? 'Started monitoring' : 'Stopped monitoring', `${s.name} ${b.kind}${id > 0 ? ' ' + id : ''}${b.season != null ? ' season ' + b.season : ''}${b.kind === 'episodes' ? ' (' + b.ids.length + ')' : ''}`);
      return send(res, 200, {});
    }
    const plex = async (s, pth) => {
      const x = await fetch(s.url.replace(/\/+$/, '') + pth, { signal: AbortSignal.timeout(8000), headers: { 'X-Plex-Token': s.apiKey, Accept: 'application/json' } });
      if (!x.ok) throw new Error('Plex returned ' + x.status); return x;
    };
    if ((r = p.match(/^\/api\/plex\/(\w+)\/now$/))) {
      const s = svcOf(r[1], 'plex'); if (!s) return send(res, 404, { error: 'Not found' });
      const [a, b] = await Promise.all([plex(s, '/status/sessions').then(x => x.json()), plex(s, '/library/recentlyAdded?X-Plex-Container-Start=0&X-Plex-Container-Size=14').then(x => x.json())]);
      const pad = n => String(n || 0).padStart(2, '0'), th2 = x => x.grandparentThumb || x.parentThumb || x.thumb || '';
      const nm = x => x.type === 'episode' ? { title: x.grandparentTitle, sub: `S${pad(x.parentIndex)}E${pad(x.index)} ${x.title}` } : { title: x.title, sub: String(x.year || '') };
      return send(res, 200, {
        sessions: ((a.MediaContainer || {}).Metadata || []).map(x => ({ ...nm(x), sid: (x.Session || {}).id, user: (x.User || {}).title, player: (x.Player || {}).title, state: (x.Player || {}).state,
          progress: x.duration ? (x.viewOffset || 0) / x.duration : 0, thumb: th2(x) })),
        recent: ((b.MediaContainer || {}).Metadata || []).map(x => ({ ...nm(x), thumb: th2(x) })) });
    }
    if ((r = p.match(/^\/api\/plex\/(\w+)\/img$/))) {
      const s = svcOf(r[1], 'plex'), pth = new URL(req.url, 'http://x').searchParams.get('p') || '';
      if (!s || !/^\/library\/[\w\/.-]+$/.test(pth)) return send(res, 400, { error: 'Bad request' });
      const x = await plex(s, pth);
      res.writeHead(200, { 'Content-Type': x.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=3600' });
      return res.end(Buffer.from(await x.arrayBuffer()));
    }
    const taut = async (s, cmd, extra = '') => {
      const x = await fetch(`${s.url.replace(/\/+$/, '')}/api/v2?apikey=${encodeURIComponent(s.apiKey)}&cmd=${cmd}${extra}`, { signal: AbortSignal.timeout(10000) });
      const d = await x.json().catch(() => null);
      if (!x.ok || !d || !d.response || d.response.result !== 'success') throw new Error((d && d.response && d.response.message) || 'Tautulli returned ' + x.status);
      return d.response.data;
    };
    const sab = async (s, q) => {
      const x = await fetch(`${s.url.replace(/\/+$/, '')}/api?output=json&apikey=${encodeURIComponent(s.apiKey)}&${q}`, { signal: AbortSignal.timeout(8000) });
      if (!x.ok) throw new Error('SABnzbd returned ' + x.status); return x.json();
    };
    if (p === '/api/attention' && m === 'GET') {
      const items = [], add = (level, text, tab) => items.push({ level, text, tab }), mine = db.services.filter(allowed), plural = (n, a, b) => n === 1 ? a : b;
      for (const s of mine) { const h = health[s.id]; if (h && !h.ok) add('bad', `${s.name} is not responding`, 'st:apps'); }
      await Promise.all(mine.map(async s => { try {
        if (s.type === 'qbittorrent') {
          const l = await qb(s, '/api/v2/torrents/info'), now = Date.now() / 1000;
          const err = l.filter(x => x.state === 'error' || x.state === 'missingFiles'); if (err.length) add('bad', `${err.length} ${plural(err.length, 'download has an error', 'downloads have errors')} in ${s.name}`, 'dl');
          const stuck = l.filter(x => x.progress < 1 && !/^(paused|stopped|queued|error|missing)/.test(x.state) && x.last_activity > 0 && now - x.last_activity > 86400);
          if (stuck.length) add('warn', `${stuck.length} ${plural(stuck.length, 'download has', 'downloads have')} made no progress for a day`, 'dl');
          const v = await vpnStatus(s).catch(() => null); if (v && v.vpn === false) add('bad', `${s.name} is not using the VPN`, 'dl');
        } else if (s.type === 'unraid') {
          const k = (await gql(s, '{ array { capacity { kilobytes { used total } } } }')).array.capacity.kilobytes, pct = +k.used / +k.total * 100, lim = (db.alerts && db.alerts.diskPct) || 90;
          if (pct >= lim) add(pct >= 95 ? 'bad' : 'warn', `The Unraid array is ${pct.toFixed(0)}% full`, 'ur');
        } else if (s.type === 'sonarr' || s.type === 'radarr') {
          const q = await call(s, '/api/v3/queue?page=1&pageSize=100'), bad = (q.records || []).filter(x => ['warning', 'error'].includes(x.trackedDownloadStatus) || x.status === 'failed');
          if (bad.length) add('warn', `${bad.length} ${plural(bad.length, 'item', 'items')} in ${s.name}'s queue ${plural(bad.length, 'needs', 'need')} attention`, 'up');
        }
      } catch {} }));
      if (me.role === 'admin') { const n = db.requests.filter(x => x.status === 'pending').length; if (n) add('warn', `${n} ${plural(n, 'request is', 'requests are')} waiting for approval`, 'rq'); }
      return send(res, 200, items);
    }
    if (p === '/api/history' && m === 'GET') {
      const ids = new Set(db.services.filter(allowed).map(s => s.id)), now = Date.now(), mine = db.history.filter(h => ids.has(h.svc));
      const tot = ms => { const l = mine.filter(h => now - h.at < ms); return { count: l.length, bytes: l.reduce((a, h) => a + (h.size || 0), 0) }; };
      return send(res, 200, { items: mine.slice(-200).reverse(), day: tot(864e5), week: tot(7 * 864e5), month: tot(30 * 864e5) });
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/match$/))) {
      const s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      const out = {};
      await Promise.all(db.services.filter(x => arr(x)).map(async x => { try {
        const q = await call(x, '/api/v3/queue?page=1&pageSize=200&' + (x.type === 'sonarr' ? 'includeSeries=true' : 'includeMovie=true'));
        for (const rec of q.records || []) if (rec.downloadId) out[String(rec.downloadId).toLowerCase()] = (x.type === 'sonarr' ? (rec.series || {}).title : (rec.movie || {}).title) || rec.title;
      } catch {} }));
      return send(res, 200, out);
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/files$/)) && m === 'POST') {
      if (deny('control', 'change downloads')) return;
      const b = await readBody(req), s = svcOf(r[1], 'qbittorrent');
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(n => Number.isInteger(n) && n >= 0).slice(0, 3000);
      if (!s || !hs(b.hash) || String(b.hash).includes('|') || !ids.length || ![0, 1].includes(+b.priority)) return send(res, 400, { error: 'Bad request' });
      await qb(s, '/api/v2/torrents/filePrio', { hash: b.hash, id: ids.join('|'), priority: String(+b.priority) });
      return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/schedule$/)) && m === 'GET') {
      const s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      const a = await qb(s, '/api/v2/app/preferences'), z = n => String(n || 0).padStart(2, '0');
      return send(res, 200, { on: !!a.scheduler_enabled, from: z(a.schedule_from_hour) + ':' + z(a.schedule_from_min), to: z(a.schedule_to_hour) + ':' + z(a.schedule_to_min), days: a.scheduler_days || 0, action: a.max_ratio_act || 0 });
    }
    if (p === '/api/wanted' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, s = arr(db.services.find(x => x.id === q.get('sid')));
      if (!s) return send(res, 404, { error: 'Pick a Sonarr or Radarr service' });
      const kind = q.get('kind') === 'cutoff' ? 'cutoff' : 'missing', page = Math.max(1, +q.get('page') || 1), tv = s.type === 'sonarr', z = n => String(n || 0).padStart(2, '0');
      const d = await call(s, `/api/v3/wanted/${kind}?page=${page}&pageSize=30${tv ? '&sortKey=airDateUtc&sortDirection=descending&includeSeries=true' : ''}`);
      const poster = o => ((o.images || []).find(i => i.coverType === 'poster') || {}).remoteUrl || o.remotePoster;
      return send(res, 200, { total: d.totalRecords || 0, items: (d.records || []).map(x => tv
        ? { id: x.id, title: (x.series || {}).title || x.title, sub: `S${z(x.seasonNumber)}E${z(x.episodeNumber)} ${x.title}`, date: x.airDateUtc, poster: poster(x.series || {}), overview: x.overview || '', about: (x.series || {}).overview || '' }
        : { id: x.id, title: x.title, sub: String(x.year || ''), date: x.digitalRelease || x.physicalRelease || x.inCinemas, poster: poster(x), overview: x.overview || '', about: '' }) });
    }
    if ((r = p.match(/^\/api\/tautulli\/(\w+)\/stats$/))) {
      const s = svcOf(r[1], 'tautulli'); if (!s) return send(res, 404, { error: 'Not found' });
      const days = [7, 30, 90].includes(+new URL(req.url, 'http://x').searchParams.get('days')) ? +new URL(req.url, 'http://x').searchParams.get('days') : 30;
      const [home, hist] = await Promise.all([taut(s, 'get_home_stats', `&time_range=${days}&stats_count=5`), taut(s, 'get_history', '&length=15')]);
      const pick = id => ((home || []).find(x => x.stat_id === id) || {}).rows || [];
      return send(res, 200, { days, movies: pick('top_movies').map(x => ({ title: x.title, plays: x.total_plays })), tv: pick('top_tv').map(x => ({ title: x.title, plays: x.total_plays })),
        users: pick('top_users').map(x => ({ title: x.friendly_name || x.user, plays: x.total_plays })),
        history: ((hist || {}).data || []).map(x => ({ user: x.friendly_name || x.user, title: x.full_title || x.title, type: x.media_type, at: (x.date || 0) * 1000, player: x.player, pct: x.percent_complete })) });
    }
    if ((r = p.match(/^\/api\/sab\/(\w+)\/queue$/))) {
      const s = svcOf(r[1], 'sabnzbd'); if (!s) return send(res, 404, { error: 'Not found' });
      const d = (await sab(s, 'mode=queue&limit=8')).queue || {};
      return send(res, 200, { paused: !!d.paused, status: d.status, speed: (+d.kbpersec || 0) * 1024, slots: +d.noofslots_total || +d.noofslots || 0, left: d.sizeleft, timeleft: d.timeleft,
        jobs: (d.slots || []).map(j => ({ name: j.filename, pct: +j.percentage || 0, size: j.size, left: j.timeleft })) });
    }
    if ((r = p.match(/^\/api\/sab\/(\w+)\/act$/)) && m === 'POST') {
      if (deny('control', 'control downloads')) return;
      const s = svcOf(r[1], 'sabnzbd'), b = await readBody(req); if (!s || !['pause', 'resume'].includes(b.op)) return send(res, 400, { error: 'Bad request' });
      await sab(s, 'mode=' + b.op); return send(res, 200, {});
    }
    if (p === '/api/sessions' && m === 'GET') {
      const all = me.role === 'admin' && new URL(req.url, 'http://x').searchParams.get('all') === '1';
      return send(res, 200, [...sessions].filter(([, v]) => all || v.uid === me.id).map(([k, v]) => ({ id: k.slice(0, 16), user: (userOf(v.uid) || {}).name || '?', device: devLabel(v.ua), ip: v.ip, at: v.at, seen: v.seen, current: k === th(token) })).sort((a, b) => b.seen - a.seen));
    }
    if (p === '/api/sessions/revoke' && m === 'POST') {
      const b = await readBody(req);
      for (const [k, v] of [...sessions]) {
        if (k === th(token) || !(v.uid === me.id || me.role === 'admin')) continue;
        if (b.others ? v.uid === me.id : k.slice(0, 16) === b.id) sessions.delete(k);
      }
      saveSess(); audit(me.name, 'Signed out devices', b.others ? 'all other devices' : cut(b.id, 16)); return send(res, 200, {});
    }
    if (p === '/api/me/notify' && m === 'PUT') {
      const v = String((await readBody(req)).url || '').trim();
      if (v && !/^https?:\/\//i.test(v)) return send(res, 400, { error: 'Enter a web address starting with https://' });
      me.notify = v.slice(0, 500); save(); return send(res, 200, {});
    }
    if (p === '/api/me/notify/test' && m === 'POST') {
      try { if (!(await pushTo(me.notify, 'MediaHub test', 'Phone messages are working.'))) return send(res, 400, { error: 'Save an address first' }); }
      catch (e) { return send(res, 400, { error: e.message }); }
      return send(res, 200, {});
    }
    if (p === '/api/me/dash' && m === 'PUT') {
      const b = await readBody(req), ok = a => (Array.isArray(a) ? a : []).filter(x => typeof x === 'string' && /^\w{1,20}$/.test(x)).slice(0, 20);
      me.dash = { order: ok(b.order), hidden: ok(b.hidden) }; save(); return send(res, 200, {});
    }
    if (p === '/api/auto' && m === 'POST') {
      if (deny('add', 'start searches')) return;
      const b = await readBody(req), s = arr(db.services.find(x => x.id === b.sid));
      if (!s || !+b.id || (b.scope === 'season' && !Number.isInteger(+b.season))) return send(res, 400, { error: 'Bad request' });
      await call(s, '/api/v3/command', { method: 'POST', body: JSON.stringify(s.type === 'sonarr'
        ? (b.scope === 'season' ? { name: 'SeasonSearch', seriesId: +b.id, seasonNumber: +b.season } : b.scope === 'series' ? { name: 'SeriesSearch', seriesId: +b.id } : { name: 'EpisodeSearch', episodeIds: [+b.id] }) : { name: 'MoviesSearch', movieIds: [+b.id] }) });
      return send(res, 200, {});
    }
    if (p === '/api/releases' && m === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams, s = arr(db.services.find(x => x.id === q.get('sid')));
      if (!s || !+q.get('id')) return send(res, 400, { error: 'Bad request' });
      const rel = await call(s, `/api/v3/release?${s.type === 'sonarr' ? 'episodeId' : 'movieId'}=${+q.get('id')}`, { signal: AbortSignal.timeout(90000) });
      return send(res, 200, rel.map(x => ({ guid: x.guid, indexerId: x.indexerId, title: x.title, size: x.size, seeders: x.seeders || 0,
        indexer: x.indexer, quality: ((x.quality || {}).quality || {}).name, age: x.age, rejected: !!x.rejected, why: (x.rejections || []).slice(0, 2).join('; ') }))
        .sort((a, b) => a.rejected - b.rejected || b.seeders - a.seeders).slice(0, 40));
    }
    if (p === '/api/grab' && m === 'POST') {
      if (deny('add', 'grab releases')) return;
      const b = await readBody(req), s = arr(db.services.find(x => x.id === b.sid));
      if (!s || !b.guid) return send(res, 400, { error: 'Bad request' });
      await call(s, '/api/v3/release', { method: 'POST', body: JSON.stringify({ guid: b.guid, indexerId: b.indexerId }) });
      return send(res, 200, {});
    }
    if (p === '/api/upcoming' && m === 'GET') {
      const qs = new URL(req.url, 'http://x').searchParams, pd = v => { const d = new Date(v); return v && !isNaN(d) ? d : null; };
      const from = pd(qs.get('from')) || new Date(); let to = pd(qs.get('to')) || new Date(+from + 14 * 864e5);
      if (to < from || to - from > 70 * 864e5) to = new Date(+from + 14 * 864e5);
      const cal = [], queue = [], errors = [];
      const day = d => d.toISOString().slice(0, 10), z = n => String(n).padStart(2, '0');
      await Promise.all(db.services.filter(s => allowed(s) && (s.type === 'sonarr' || s.type === 'radarr')).map(async s => {
        const tv = s.type === 'sonarr';
        try {
          const [c, q] = await Promise.all([
            call(s, `/api/v3/calendar?start=${day(from)}&end=${day(to)}${tv ? '&includeSeries=true' : ''}`),
            call(s, `/api/v3/queue?page=1&pageSize=50&${tv ? 'includeSeries=true&includeEpisode=true' : 'includeMovie=true'}`)]);
          c.forEach(x => {
            const d = tv ? x.airDateUtc : [x.digitalRelease, x.physicalRelease, x.inCinemas].filter(v => v && v >= day(from)).sort()[0];
            if (d) {
              const o = tv ? x.series || {} : x, img = (o.images || []).find(i => i.coverType === 'poster') || {};
              cal.push({ date: d, sid: s.id, id: x.id, title: tv ? o.title : x.title,
                sub: tv ? `S${z(x.seasonNumber)}E${z(x.episodeNumber)} · ${x.title}` : 'Movie release',
                poster: img.remoteUrl || o.remotePoster, overview: x.overview || '', about: tv ? o.overview || '' : '' });
            }
          });
          (q.records || []).forEach(x => {
            const o = tv ? x.series || {} : x.movie || {}, img = (o.images || []).find(i => i.coverType === 'poster') || {};
            queue.push({ title: o.title || x.title, sub: x.title, status: x.status, timeleft: x.timeleft,
              progress: x.size ? 1 - x.sizeleft / x.size : 0, poster: img.remoteUrl || o.remotePoster,
              overview: tv ? (x.episode || {}).overview || '' : o.overview || '', about: tv ? o.overview || '' : '',
              meta: [x.protocol, x.indexer, x.downloadClient].filter(Boolean).join(' · ') });
          });
        } catch (e) { errors.push(s.name + ': ' + e.message); }
      }));
      return send(res, 200, { calendar: cal.sort((a, b) => a.date.localeCompare(b.date)), queue, errors });
    }
    if (me.role !== 'admin') return send(res, 403, { error: 'Admins only' });
    if ((r = p.match(/^\/api\/unraid\/(\w+)\/docker$/)) && m === 'POST') {
      const b = await readBody(req), s = svcOf(r[1], 'unraid');
      if (!s || !/^[\w:.\-]+$/.test(b.id || '') || !['start', 'stop', 'restart'].includes(b.action)) return send(res, 400, { error: 'Bad request' });
      const run = a => gql(s, `mutation { docker { ${a}(id: ${JSON.stringify(b.id)}) { id } } }`);
      if (b.action === 'restart') { await run('stop'); await run('start'); } else await run(b.action);
      return send(res, 200, {});
    }
    if (p === '/api/services' && m === 'POST') {
      const b = await readBody(req);
      if (!b.name || !/^https?:\/\//.test(b.url || '')) return send(res, 400, { error: 'Enter a name and an address starting with http:// or https://' });
      if (!KINDS.includes(b.type)) return send(res, 400, { error: 'Pick an app type' });
      const s = { id: uid(), type: b.type, name: b.name, url: b.url, apiKey: b.apiKey || '', user: b.user || '', pass: b.pass || '' };
      db.services.push(s); save(); audit(me.name, 'Added an app', s.name); return send(res, 200, pubSvc(s));
    }
    if ((r = p.match(/^\/api\/services\/(\w+)$/)) && m === 'DELETE') {
      const gone = db.services.find(s => s.id === r[1]); if (gone) audit(me.name, 'Removed an app', gone.name);
      db.services = db.services.filter(s => s.id !== r[1]);
      db.users.forEach(u => u.access = u.access.filter(a => a !== r[1])); save(); return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/users\/(\w+)\/password$/)) && m === 'POST') {
      const u = db.users.find(x => x.id === r[1]), b = await readBody(req);
      if (!u) return send(res, 404, { error: 'Not found' });
      if ((b.password || '').length < 8) return send(res, 400, { error: 'Password must be 8+ characters' });
      u.salt = uid(); u.hash = hash(b.password, u.salt); save(); audit(me.name, 'Reset a password', u.name);
      for (const [k, v] of sessions) if (v.uid === u.id && k !== th(token)) sessions.delete(k);
      saveSess(); return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/requests\/(\w+)\/(approve|decline)$/)) && m === 'POST') {
      const x = db.requests.find(y => y.id === r[1]);
      if (!x || x.status !== 'pending') return send(res, 404, { error: 'Request not found' });
      if (r[2] === 'approve') {
        const s = db.services.find(y => y.id === x.sid); if (!s) return send(res, 400, { error: 'That Seerr service was removed' });
        const sr = await seerrAdd(s, x); x.seerrId = sr && sr.id; x.status = 'approved'; x.stage = 'approved';
      } else { x.status = 'declined'; x.stage = 'declined'; }
      save(); audit(me.name, r[2] === 'approve' ? 'Approved a request' : 'Declined a request', x.title + ' (' + x.user + ')');
      notifyUser(userOf(x.uid), r[2] === 'approve' ? 'Request approved' : 'Request declined', x.title).catch(() => {});
      mon.reqT = 0;
      return send(res, 200, x);
    }
    if (p === '/api/alerts' && m === 'GET') { const a = db.alerts || {}; return send(res, 200, { ...a, token: undefined, hasToken: !!a.token }); }
    if (p === '/api/alerts' && m === 'PUT') {
      const b = await readBody(req), o = db.alerts || {};
      db.alerts = { type: ['ntfy', 'telegram', 'discord'].includes(b.type) ? b.type : 'ntfy', target: String(b.target || '').trim(), token: b.token || o.token || '',
        chat: String(b.chat || '').trim(), finished: !!b.finished, offline: !!b.offline, disk: !!b.disk, vpn: !!b.vpn, requests: !!b.requests,
        diskPct: Math.min(99, Math.max(50, +b.diskPct || 90)) };
      save(); audit(me.name, 'Changed alert settings', db.alerts.type); return send(res, 200, {});
    }
    if (p === '/api/alerts/test' && m === 'POST') {
      if (!(await notify('MediaHub test', 'Alerts are working.'))) return send(res, 400, { error: 'Save your settings first' });
      return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/library\/(\w+)\/(\d+)$/)) && m === 'DELETE') {
      const s = arr(db.services.find(x => x.id === r[1])); if (!s) return send(res, 404, { error: 'Not found' });
      const files = new URL(req.url, 'http://x').searchParams.get('files') === '1';
      await call(s, `/api/v3/${s.type === 'sonarr' ? 'series' : 'movie'}/${r[2]}?deleteFiles=${files}`, { method: 'DELETE' }); audit(me.name, 'Removed from library', s.name + ' item ' + r[2] + (files ? ' with files' : ''));
      return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/unraid\/(\w+)\/logs$/))) {
      const s = svcOf(r[1], 'unraid'), id = new URL(req.url, 'http://x').searchParams.get('id') || '';
      if (!s || !/^[\w:.\-]+$/.test(id)) return send(res, 400, { error: 'Bad request' });
      const d = await gql(s, `{ docker { logs(id: ${JSON.stringify(id)}, tail: 200) { lines { message } } } }`);
      return send(res, 200, { text: (((d.docker || {}).logs || {}).lines || []).map(l => l.message).join('\n') });
    }
    if (p === '/api/audit' && m === 'GET') return send(res, 200, db.log.slice(-200).reverse());
    if (p === '/api/services/test' && m === 'POST') {
      const b = await readBody(req), o = db.services.find(x => x.id === b.id) || {};
      const s = { ...o, type: b.type || o.type, url: String(b.url || o.url || '').trim(), apiKey: b.apiKey || o.apiKey || '', user: b.user != null ? b.user : o.user, pass: b.pass || o.pass || '' };
      if (!KINDS.includes(s.type) || !/^https?:\/\//.test(s.url)) return send(res, 400, { error: 'Enter an address starting with http:// or https://' });
      try { const ok = await test(s); return send(res, 200, { ok, message: ok ? 'Connected' : 'It answered, but the key or password was refused, or the address is a different app.' }); }
      catch (e) { return send(res, 200, { ok: false, message: 'Could not reach it (' + ((e.cause && e.cause.code) || e.message) + '). Check the address and port.' }); }
    }
    if ((r = p.match(/^\/api\/services\/(\w+)$/)) && m === 'PUT') {
      const s = db.services.find(x => x.id === r[1]), b = await readBody(req); if (!s) return send(res, 404, { error: 'Not found' });
      if (b.url != null) { if (!/^https?:\/\//.test(b.url)) return send(res, 400, { error: 'The address must start with http:// or https://' }); s.url = b.url.trim(); }
      if (b.name) s.name = cut(b.name, 80); if (b.apiKey) s.apiKey = b.apiKey; if (b.user != null) s.user = cut(b.user, 120); if (b.pass) s.pass = b.pass;
      delete qbCookie[s.id]; save(); audit(me.name, 'Edited an app', s.name); return send(res, 200, pubSvc(s));
    }
    if ((r = p.match(/^\/api\/users\/(\w+)$/)) && m === 'PUT') {
      const u = userOf(r[1]), b = await readBody(req); if (!u) return send(res, 404, { error: 'Not found' });
      if (b.role && ['admin', 'user'].includes(b.role) && b.role !== u.role) {
        if (u.role === 'admin' && db.users.filter(x => x.role === 'admin').length < 2) return send(res, 400, { error: 'There must be at least one admin' });
        u.role = b.role;
      }
      if ('perms' in b) u.perms = b.perms ? Object.fromEntries(['add', 'control', 'remove', 'request'].map(k => [k, b.perms[k] !== false])) : undefined;
      if ('notify' in b) { const v = String(b.notify || '').trim(); if (v && !/^https?:\/\//i.test(v)) return send(res, 400, { error: 'Enter a web address starting with https://' }); u.notify = v.slice(0, 500); }
      save(); audit(me.name, 'Changed a profile', u.name); return send(res, 200, pubUser(u));
    }
    if (p === '/api/backup' && m === 'POST') {
      const b = await readBody(req); if (String(b.passphrase || '').length < 8) return send(res, 400, { error: 'Choose a passphrase of 8 or more characters' });
      const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(String(b.passphrase), salt, 32), iv);
      const ct = Buffer.concat([c.update(JSON.stringify({ v: 1, at: Date.now(), db }), 'utf8'), c.final()]);
      audit(me.name, 'Exported a backup', '');
      return send(res, 200, { v: 1, app: 'mediahub', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: ct.toString('base64') });
    }
    if (p === '/api/restore' && m === 'POST') {
      const b = await readBody(req), k = b.backup || {}; let obj;
      try { const d = crypto.createDecipheriv('aes-256-gcm', crypto.scryptSync(String(b.passphrase || ''), Buffer.from(k.salt, 'base64'), 32), Buffer.from(k.iv, 'base64'));
        d.setAuthTag(Buffer.from(k.tag, 'base64')); obj = JSON.parse(Buffer.concat([d.update(Buffer.from(k.data, 'base64')), d.final()]).toString('utf8')); }
      catch { return send(res, 400, { error: 'Wrong passphrase, or this is not a MediaHub backup' }); }
      const n = obj && obj.db;
      if (!n || !Array.isArray(n.users) || !n.users.some(u => u.role === 'admin') || !Array.isArray(n.services)) return send(res, 400, { error: 'That backup looks incomplete' });
      db = { requests: [], log: [], history: [], seedRules: [], alerts: null, ...n };
      histKeys.clear(); db.history.forEach(h => histKeys.add(h.hash + ':' + Math.round(h.at / 1000)));
      sessions.clear(); saveSess(); save(); audit('System', 'Restored a backup', 'started by ' + me.name);
      return send(res, 200, {});
    }
    if (p === '/api/seedrules' && m === 'GET') return send(res, 200, db.seedRules);
    if (p === '/api/seedrules' && m === 'PUT') {
      const b = await readBody(req), ok = x => db.services.some(s => s.id === x.sid && s.type === 'qbittorrent');
      db.seedRules = (Array.isArray(b.rules) ? b.rules : []).filter(ok).slice(0, 50).map(x => ({ sid: x.sid, category: cut(x.category === '' ? '' : x.category || '*', 100), ratio: Math.max(0, +x.ratio || 0), minutes: Math.max(0, Math.round(+x.minutes || 0)) }));
      mon.share = {}; save(); audit(me.name, 'Changed seeding rules', db.seedRules.length + ' rules'); return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/qb\/(\w+)\/schedule$/)) && m === 'POST') {
      const b = await readBody(req), s = svcOf(r[1], 'qbittorrent'); if (!s) return send(res, 404, { error: 'Not found' });
      const hm = v => { const q = /^(\d{1,2}):(\d{2})$/.exec(String(v)); return q && +q[1] < 24 && +q[2] < 60 ? [+q[1], +q[2]] : [0, 0]; }, f = hm(b.from), to = hm(b.to);
      await qb(s, '/api/v2/app/setPreferences', { json: JSON.stringify({ scheduler_enabled: !!b.on, schedule_from_hour: f[0], schedule_from_min: f[1], schedule_to_hour: to[0], schedule_to_min: to[1],
        scheduler_days: Math.min(9, Math.max(0, +b.days || 0)), max_ratio_act: [0, 1, 2, 3].includes(+b.action) ? +b.action : 0 }) });
      audit(me.name, 'Changed the speed schedule', s.name); return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/unraid\/(\w+)\/parity$/)) && m === 'POST') {
      const s = svcOf(r[1], 'unraid'), b = await readBody(req), ops = { start: 'start(correct: false)', cancel: 'cancel', pause: 'pause', resume: 'resume' };
      if (!s || !ops[b.op]) return send(res, 400, { error: 'Bad request' });
      await gql(s, `mutation { parityCheck { ${ops[b.op]} } }`); audit(me.name, 'Parity check: ' + b.op, s.name); return send(res, 200, {});
    }
    if ((r = p.match(/^\/api\/plex\/(\w+)\/terminate$/)) && m === 'POST') {
      const s = svcOf(r[1], 'plex'), b = await readBody(req); if (!s || !/^[\w-]{1,80}$/.test(b.session || '')) return send(res, 400, { error: 'Bad request' });
      await plex(s, `/status/sessions/terminate?sessionId=${encodeURIComponent(b.session)}&reason=${encodeURIComponent(cut(b.reason || 'Stopped by the server owner', 200))}`);
      audit(me.name, 'Ended a Plex stream', s.name); return send(res, 200, {});
    }
    if (p === '/api/users' && m === 'GET') return send(res, 200, db.users.map(pubUser));
    if (p === '/api/users' && m === 'POST') {
      const b = await readBody(req);
      if (!b.name || (b.password || '').length < 8) return send(res, 400, { error: 'Enter a name and a password of 8+ characters' });
      if (db.users.some(u => u.name.toLowerCase() === b.name.toLowerCase())) return send(res, 400, { error: 'That name is taken' });
      const u = mkUser(b.name, b.password, b.role === 'admin' ? 'admin' : 'user'); db.users.push(u); save(); audit(me.name, 'Added a profile', u.name); return send(res, 200, pubUser(u));
    }
    if ((r = p.match(/^\/api\/users\/(\w+)\/access$/)) && m === 'PUT') {
      const u = db.users.find(x => x.id === r[1]); if (!u) return send(res, 404, { error: 'Not found' });
      u.access = ((await readBody(req)).access || []).filter(a => db.services.some(s => s.id === a)); save(); return send(res, 200, pubUser(u));
    }
    if ((r = p.match(/^\/api\/users\/(\w+)$/)) && m === 'DELETE') {
      if (r[1] === me.id) return send(res, 400, { error: "You can't delete yourself" });
      const gone = userOf(r[1]); db.users = db.users.filter(u => u.id !== r[1]); for (const [k, v] of [...sessions]) if (v.uid === r[1]) sessions.delete(k);
      saveSess(); save(); if (gone) audit(me.name, 'Deleted a profile', gone.name); return send(res, 200, {});
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) { console.error(req.method, p, e); send(res, 500, { error: 'Server error: ' + e.message }); }
}).listen(process.env.PORT || 8080, () => console.log('MediaHub running'));
setInterval(() => monitor().catch(() => {}), 30000);
setInterval(() => { for (const k in fails) if (Date.now() - fails[k].t > 600000) delete fails[k]; }, 600000).unref();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { console.log('MediaHub stopping'); process.exit(0); });
setTimeout(() => monitor().catch(() => {}), 3000);
