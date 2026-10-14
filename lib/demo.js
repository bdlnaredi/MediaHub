// Pretend versions of the apps MediaHub talks to. Used by DEMO mode and by the tests.
// Nothing here ever leaves the machine and nothing is saved.
'use strict';
const DAY = 864e5;
const iso = (d, off = 0) => new Date(d + off * DAY).toISOString();
const svg = (title, hue) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},60%,22%)"/></linearGradient></defs><rect width="300" height="450" fill="url(#g)"/><text x="150" y="235" font-family="sans-serif" font-size="30" font-weight="700" fill="white" text-anchor="middle">${title.replace(/[<&>]/g, '').slice(0, 14)}</text></svg>`);

function create(opts = {}) {
  const now = Date.now();
  const st = {
    streams: opts.streams || 0, altSpeed: false, calls: [],
    profiles: [{ id: 1, name: 'Any' }, { id: 2, name: 'HD-1080p' }, { id: 3, name: 'Ultra-HD' }],
    shows: [
      ['Harbor Lights', 2019, 4, 8, 'continuing', 'Northwind', ['Drama', 'Mystery'], 8.1],
      ['The Long Orbit', 2021, 3, 10, 'continuing', 'Starfall', ['Sci-Fi'], 8.6],
      ['Kitchen Wars', 2017, 6, 12, 'ended', 'Citrus TV', ['Reality'], 7.2],
      ['Paper Kingdoms', 2022, 2, 6, 'continuing', 'Northwind', ['Fantasy', 'Adventure'], 8.9],
      ['Night Shift', 2015, 5, 13, 'ended', 'Citrus TV', ['Comedy'], 7.7],
      ['Deep Field', 2023, 1, 8, 'continuing', 'Starfall', ['Documentary'], 8.3],
    ].map((x, i) => {
      const [title, year, seasons, per, status, network, genres, rating] = x, id = i + 1, eps = [];
      for (let s = 1; s <= seasons; s++) for (let e = 1; e <= per; e++) {
        // The newest season of a running show is still airing: a few episodes are in the future.
        const live = status === 'continuing' && s === seasons, weeksAgo = live ? per - e - 3 : (seasons - s) * 40 + per - e + 12;
        const t = now - weeksAgo * 7 * DAY, has = t < now && !(live && e > per - 4) && !(id === 1 && s === 2 && e > 5);
        eps.push({ id: id * 1000 + s * 100 + e, seriesId: id, seasonNumber: s, episodeNumber: e, title: `Episode ${e}`, airDateUtc: iso(t), monitored: true,
          hasFile: has, episodeFileId: has ? id * 1000 + s * 100 + e : 0, size: has ? 900e6 + e * 11e6 : 0 });
      }
      return { id, title, year, status, network, genres, ratings: { value: rating }, overview: `${title} is a demo show. Nothing here is real.`, monitored: true, qualityProfileId: 2,
        seasonsN: seasons, eps, seasons: Array.from({ length: seasons }, (_, k) => ({ seasonNumber: k + 1, monitored: true })), hue: (i * 57) % 360, added: iso(now, -400 + i * 30) };
    }),
    movies: [
      ['Glass Meridian', 2024, 'Thriller', 7.4, true], ['Salt & Ember', 2023, 'Drama', 8.0, true], ['The Last Lighthouse', 2022, 'Horror', 6.9, true],
      ['Parallel Sundays', 2025, 'Romance', 7.1, false], ['Orbit Breakers', 2021, 'Action', 7.8, true], ['Quiet Machines', 2026, 'Sci-Fi', 8.4, false],
    ].map((x, i) => ({ id: i + 1, title: x[0], year: x[1], genres: [x[2]], ratings: { imdb: { value: x[3] } }, overview: `${x[0]} is a demo movie.`, monitored: true, hasFile: x[4], sizeOnDisk: x[4] ? 4.2e9 + i * 3e8 : 0,
      qualityProfileId: i % 2 ? 3 : 2, runtime: 95 + i * 7, studio: 'Demo Pictures', status: x[4] ? 'released' : 'announced', certification: 'PG-13', hue: (i * 83 + 20) % 360, added: iso(now, -200 + i * 20),
      inCinemas: iso(now, x[4] ? -300 : 25), digitalRelease: x[4] ? iso(now, -250) : iso(now, 40) })),
    torrents: [
      ['Harbor.Lights.S04E06.1080p.WEB.x265', 1.4e9, 0.62, 'tv'], ['The.Long.Orbit.S03E08.2160p.WEB', 4.8e9, 0.18, 'tv'],
      ['Glass.Meridian.2024.1080p.BluRay', 8.1e9, 1, 'movies'], ['Ubuntu.24.04.iso', 5.9e9, 1, 'software'],
    ].map((x, i) => ({ hash: ('abcdef0123'.repeat(5)).slice(i, i + 40).padEnd(40, String(i)), name: x[0], size: x[1], progress: x[2], category: x[3], tags: '', state: x[2] >= 1 ? 'stalledUP' : 'downloading',
      dlspeed: x[2] >= 1 ? 0 : 2.4e6, upspeed: x[2] >= 1 ? 3e5 : 4e4, eta: x[2] >= 1 ? 8640000 : 3600, ratio: 1.2, num_seeds: 12, num_leechs: 3, added_on: Math.floor(now / 1000) - 86400 * (i + 1),
      completion_on: x[2] >= 1 ? Math.floor(now / 1000) - 3600 * (i + 2) : -1, save_path: '/downloads', amount_left: Math.round(x[1] * (1 - x[2])), uploaded: Math.round(x[1] * 1.2), downloaded: Math.round(x[1] * x[2]), priority: i + 1 })),
    indexers: [['NZBgeek', 'usenet'], ['1337x', 'torrent'], ['Demo Tracker', 'torrent'], ['Broken Tracker', 'torrent'], ['Archive Box', 'torrent'], ['Old Usenet', 'usenet']]
      .map((x, i) => ({ id: i + 1, name: x[0], protocol: x[1], enable: i !== 4, priority: 25, implementationName: 'Demo' })),
    artists: [['The Night Owls', 'Indie'], ['Velvet Static', 'Electronic'], ['Mara Quinn', 'Folk']].map((x, i) => ({ id: i + 1, artistName: x[0], overview: `${x[0]} (${x[1]}) is a demo artist.`, monitored: true, genres: [x[1]], hue: (i * 120 + 200) % 360,
      statistics: { albumCount: 3 + i, trackFileCount: 20 + i * 4, trackCount: 30 + i * 4, sizeOnDisk: 4e8 + i * 1e8 }, added: iso(now, -100), qualityProfileId: 1, metadataProfileId: 1 })),
    authors: [['Ada Linden', 'Fantasy'], ['Tom Reyes', 'Mystery']].map((x, i) => ({ id: i + 1, authorName: x[0], overview: `${x[0]} writes ${x[1]} books (demo).`, monitored: true, genres: [x[1]], hue: (i * 90 + 30) % 360,
      statistics: { bookCount: 5 + i, bookFileCount: 3 + i, totalBookCount: 6 + i, sizeOnDisk: 2e8 }, added: iso(now, -100), qualityProfileId: 1, metadataProfileId: 1 })),
    seerrReq: {}, nextReq: 100,
    subsEp: [{ seriesTitle: 'Harbor Lights', episode_number: '2x06', episodeTitle: 'Episode 6', sonarrSeriesId: 1, sonarrEpisodeId: 1206, missing_subtitles: [{ name: 'English', code2: 'en', code3: 'eng', forced: false, hi: false }] },
      { seriesTitle: 'The Long Orbit', episode_number: '3x02', episodeTitle: 'Episode 2', sonarrSeriesId: 2, sonarrEpisodeId: 2302, missing_subtitles: [{ name: 'English', code2: 'en', code3: 'eng', forced: false, hi: false }, { name: 'Spanish', code2: 'es', code3: 'spa', forced: false, hi: false }] }],
    subsMov: [{ title: 'Salt & Ember', radarrId: 2, missing_subtitles: [{ name: 'English', code2: 'en', code3: 'eng', forced: false, hi: false }] }],
    sabHist: [{ nzo_id: 'SABnzbd_nzo_a1', name: 'Harbor.Lights.S04E05.1080p', size: '1.3 GB', status: 'Completed', fail_message: '', category: 'tv', completed: Math.floor(now / 1000) - 7200 },
      { nzo_id: 'SABnzbd_nzo_a2', name: 'Orbit.Breakers.2021.2160p', size: '14.2 GB', status: 'Failed', fail_message: 'Aborted, cannot be completed', category: 'movies', completed: Math.floor(now / 1000) - 90000 }],
  };
  const json = (res, d, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
  const body = req => new Promise(ok => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch { ok({ _raw: b }); } }); });
  const stats = sr => { const have = sr.eps.filter(e => e.hasFile).length; return { seasonCount: sr.seasonsN, episodeCount: sr.eps.filter(e => Date.parse(e.airDateUtc) < now).length, episodeFileCount: have, sizeOnDisk: have * 1e9 }; };
  const sonarrOut = sr => ({ id: sr.id, title: sr.title, year: sr.year, status: sr.status, network: sr.network, genres: sr.genres, ratings: sr.ratings, overview: sr.overview, monitored: sr.monitored,
    qualityProfileId: sr.qualityProfileId, seasons: sr.seasons, statistics: stats(sr), images: [{ coverType: 'poster', remoteUrl: svg(sr.title, sr.hue) }], added: sr.added, tvdbId: 9000 + sr.id, tmdbId: 7000 + sr.id });
  const radarrOut = mv => ({ ...mv, images: [{ coverType: 'poster', remoteUrl: svg(mv.title, mv.hue) }], tmdbId: 5000 + mv.id });
  const media = (kind, x) => ({ ...x, images: [{ coverType: 'poster', remoteUrl: svg(x.artistName || x.authorName, x.hue) }] });
  const monitorEps = (ids, on) => st.shows.forEach(s => s.eps.forEach(e => { if (ids.includes(e.id)) e.monitored = on; }));

  async function arrApp(type, req, res, p, q) {
    const tv = type === 'sonarr', m = req.method, data = ['POST', 'PUT', 'DELETE'].includes(m) ? await body(req) : {}, a = tv ? st.shows : st.movies;
    st.calls.push(`${type} ${m} ${p}${q.toString() ? '?' + q : ''} ${m === 'GET' ? '' : JSON.stringify(data).slice(0, 300)}`);
    if (p === '/api/v3/system/status') return json(res, { version: '4.0.0.demo', appName: type });
    if (p === '/api/v3/health') return json(res, tv ? [{ type: 'warning', source: 'IndexerStatusCheck', message: 'Indexers unavailable due to failures: Broken Tracker' }] : []);
    if (p === '/api/v3/diskspace') return json(res, [{ path: '/tv', label: 'Media', freeSpace: 420e9, totalSpace: 4e12 }, { path: '/movies', label: 'Movies', freeSpace: 60e9, totalSpace: 2e12 }]);
    if (p === '/api/v3/qualityprofile') return json(res, st.profiles);
    if (p === '/api/v3/rootfolder') return json(res, [{ path: tv ? '/tv' : '/movies' }]);
    if (p === '/api/v3/command' && m === 'POST') return json(res, { id: 1, name: data.name });
    if (p === '/api/v3/queue') return json(res, { records: [{ id: 1, title: 'Harbor.Lights.S04E06', size: 1.4e9, sizeleft: 5e8, timeleft: '00:12:00', status: 'downloading', trackedDownloadStatus: 'ok', series: { title: 'Harbor Lights' }, movie: { title: 'Glass Meridian' } },
      { id: 2, title: 'Stuck.Release.1080p', size: 2e9, sizeleft: 2e9, status: 'warning', trackedDownloadStatus: 'warning', statusMessages: [{ messages: ['No files found are eligible for import'] }], series: { title: 'Night Shift' } }].slice(0, tv ? 2 : 1), totalRecords: 2 });
    if (p === '/api/v3/release') return json(res, []);
    if (p.startsWith('/api/v3/calendar')) {
      const f = tv ? st.shows.flatMap(s => s.eps.filter(e => { const t = Date.parse(e.airDateUtc); return t > now - DAY && t < now + 30 * DAY; }).map(e => ({ ...e, series: sonarrOut(s), seriesId: s.id })))
        : st.movies.filter(x => Date.parse(x.digitalRelease) > now - DAY * 3).map(radarrOut);
      return json(res, f);
    }
    if (p.startsWith('/api/v3/wanted/')) {
      const rec = tv ? st.shows.flatMap(s => s.eps.filter(e => !e.hasFile && Date.parse(e.airDateUtc) < now && e.monitored).map(e => ({ ...e, series: sonarrOut(s) }))) : st.movies.filter(x => x.monitored && !x.hasFile).map(radarrOut);
      return json(res, { page: 1, pageSize: 30, totalRecords: rec.length, records: rec });
    }
    if (tv) {
      if (p === '/api/v3/series/lookup') return json(res, ['Harbor Lights', 'Paper Kingdoms', 'Hidden Valley', 'Hidden Figures Reloaded'].filter(t => t.toLowerCase().includes(String(q.get('term') || '').toLowerCase())).map((t, i) => ({ title: t, year: 2020 + i, overview: 'Demo result.', remotePoster: svg(t, i * 70), tvdbId: 1e5 + i, id: st.shows.find(s => s.title === t) ? st.shows.find(s => s.title === t).id : undefined })));
      if (p === '/api/v3/series' && m === 'GET') return json(res, a.map(sonarrOut));
      if (p === '/api/v3/series' && m === 'POST') return json(res, { id: 99 });
      if (p === '/api/v3/series/editor') {
        const ids = data.seriesIds || [];
        a.filter(s => ids.includes(s.id)).forEach(s => { if (m === 'PUT') { if ('monitored' in data) s.monitored = !!data.monitored; if (data.qualityProfileId) s.qualityProfileId = +data.qualityProfileId; } });
        if (m === 'DELETE') st.shows = st.shows.filter(s => !ids.includes(s.id));
        return json(res, {});
      }
      let r = p.match(/^\/api\/v3\/series\/(\d+)$/);
      if (r) { const s = a.find(x => x.id === +r[1]); if (!s) return json(res, { message: 'NotFound' }, 404);
        if (m === 'PUT') { s.monitored = !!data.monitored; (data.seasons || []).forEach(d => { const t = s.seasons.find(y => y.seasonNumber === d.seasonNumber); if (t) t.monitored = !!d.monitored; }); return json(res, data); }
        if (m === 'DELETE') { st.shows = st.shows.filter(x => x !== s); return json(res, {}); }
        return json(res, sonarrOut(s)); }
      if (p === '/api/v3/episode' && m === 'GET') { const s = a.find(x => x.id === +q.get('seriesId')); return json(res, s ? s.eps.map(({ size, ...e }) => e) : []); }
      if (p === '/api/v3/episodefile') { const s = a.find(x => x.id === +q.get('seriesId')); return json(res, s ? s.eps.filter(e => e.hasFile).map(e => ({ id: e.episodeFileId, size: e.size, quality: { quality: { name: 'WEBDL-1080p' } } })) : []); }
      if (p === '/api/v3/episode/monitor') { monitorEps(data.episodeIds || [], !!data.monitored); return json(res, {}); }
    } else {
      if (p === '/api/v3/movie/lookup') return json(res, ['Glass Meridian', 'Hidden Harbor', 'Blue Hour'].filter(t => t.toLowerCase().includes(String(q.get('term') || '').toLowerCase())).map((t, i) => ({ title: t, year: 2020 + i, overview: 'Demo result.', remotePoster: svg(t, i * 90), tmdbId: 6e3 + i, id: st.movies.find(s => s.title === t) ? 1 : undefined })));
      if (p === '/api/v3/movie' && m === 'GET') { const t = q.get('tmdbId'); return json(res, a.filter(x => !t || 5000 + x.id === +t).map(radarrOut)); }
      if (p === '/api/v3/movie' && m === 'POST') return json(res, { id: 99 });
      if (p === '/api/v3/movie/editor') {
        const ids = data.movieIds || [];
        a.filter(s => ids.includes(s.id)).forEach(s => { if (m === 'PUT') { if ('monitored' in data) s.monitored = !!data.monitored; if (data.qualityProfileId) s.qualityProfileId = +data.qualityProfileId; } });
        if (m === 'DELETE') st.movies = st.movies.filter(s => !ids.includes(s.id));
        return json(res, {});
      }
      const r = p.match(/^\/api\/v3\/movie\/(\d+)$/);
      if (r) { const s = a.find(x => x.id === +r[1]); if (!s) return json(res, { message: 'NotFound' }, 404);
        if (m === 'PUT') { s.monitored = !!data.monitored; return json(res, data); }
        if (m === 'DELETE') { st.movies = st.movies.filter(x => x !== s); return json(res, {}); }
        return json(res, radarrOut(s)); }
    }
    json(res, [], 200);
  }

  async function musicBooks(type, req, res, p, q) {
    const music = type === 'lidarr', ent = music ? 'artist' : 'author', list = music ? st.artists : st.authors, m = req.method, data = ['POST', 'PUT', 'DELETE'].includes(m) ? await body(req) : {};
    st.calls.push(`${type} ${m} ${p}${q.toString() ? '?' + q : ''} ${m === 'GET' ? '' : JSON.stringify({ ...data, images: undefined, overview: undefined }).slice(0, 300)}`);
    const nm = x => x.artistName || x.authorName;
    if (p === '/api/v1/system/status') return json(res, { version: '2.0.0.demo' });
    if (p === '/api/v1/health') return json(res, []);
    if (p === '/api/v1/rootfolder') return json(res, [{ path: music ? '/music' : '/books' }]);
    if (p === '/api/v1/qualityprofile') return json(res, [{ id: 1, name: music ? 'Lossless' : 'eBook' }, { id: 2, name: 'Standard' }]);
    if (p === '/api/v1/metadataprofile') return json(res, [{ id: 1, name: 'Standard' }]);
    if (p === '/api/v1/command') return json(res, { id: 1, name: data.name });
    if (p === '/api/v1/wanted/missing') return json(res, { totalRecords: 7, records: [] });
    if (p === `/api/v1/${ent}/lookup`) return json(res, ['Echo Valley', 'The Night Owls', 'Ada Linden', 'Old Maps'].filter(t => t.toLowerCase().includes(String(q.get('term') || '').toLowerCase())).map((t, i) => ({
      [music ? 'artistName' : 'authorName']: t, overview: 'Demo result.', foreignArtistId: 'f' + i, foreignAuthorId: 'f' + i, images: [{ coverType: 'poster', remoteUrl: svg(t, i * 80) }], id: list.find(x => nm(x) === t) ? 1 : undefined })));
    if (p === `/api/v1/${ent}` && m === 'GET') return json(res, list.map(x => media(0, x)));
    if (p === `/api/v1/${ent}` && m === 'POST') return json(res, { id: 50 });
    const r = p.match(new RegExp(`^/api/v1/${ent}/(\\d+)$`));
    if (r) { const x = list.find(y => y.id === +r[1]); if (!x) return json(res, { message: 'NotFound' }, 404);
      if (m === 'PUT') { x.monitored = !!data.monitored; return json(res, data); }
      if (m === 'DELETE') { list.splice(list.indexOf(x), 1); return json(res, {}); }
      return json(res, media(0, x)); }
    json(res, [], 200);
  }

  async function handle(req, res, rest) {
    const u = new URL(rest, 'http://x'), p = u.pathname, q = u.searchParams, m = req.method, parts = p.split('/').filter(Boolean), type = parts[0], sub = '/' + parts.slice(1).join('/');
    if (type === 'sonarr' || type === 'radarr') return arrApp(type, req, res, sub, q);
    if (type === 'lidarr' || type === 'readarr') return musicBooks(type, req, res, sub, q);
    if (type === 'qbittorrent') {
      const data = m === 'POST' ? await body(req) : {};
      if (sub === '/api/v2/auth/login') { res.writeHead(200, { 'Set-Cookie': 'SID=demo; path=/', 'Content-Type': 'text/plain' }); return res.end('Ok.'); }
      if (sub === '/api/v2/app/version') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('v5.0.0-demo'); }
      if (sub === '/api/v2/transfer/speedLimitsMode') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(st.altSpeed ? '1' : '0'); }
      if (sub === '/api/v2/transfer/toggleSpeedLimitsMode') { st.altSpeed = !st.altSpeed; st.calls.push('qb toggleSpeedLimitsMode -> ' + st.altSpeed); res.writeHead(200); return res.end(''); }
      const wob = 0.85 + 0.3 * Math.sin(Date.now() / 4000);
      const live = () => st.torrents.map(x => x.progress < 1 ? { ...x, dlspeed: Math.round(x.dlspeed * wob * (st.altSpeed ? 0.2 : 1)), progress: Math.min(0.99, x.progress + ((Date.now() / 60000) % 0.2)) } : x);
      if (sub === '/api/v2/torrents/info') return json(res, live());
      if (sub.startsWith('/api/v2/sync/maindata')) return json(res, { server_state: { dl_info_speed: Math.round(2.4e6 * wob * (st.altSpeed ? 0.2 : 1)), up_info_speed: 3.5e5, dl_info_data: 4e10, up_info_data: 6e10, connection_status: 'connected', last_external_address_v4: '203.0.113.7',
        free_space_on_disk: 600e9, use_alt_speed_limits: st.altSpeed, dl_rate_limit: 0, up_rate_limit: 0 }, torrents: {}, categories: {}, tags: [] });
      if (sub === '/api/v2/transfer/info') return json(res, { dl_info_speed: 2.4e6, up_info_speed: 3.5e5, dl_info_data: 4e10, up_info_data: 6e10, connection_status: 'connected' });
      if (sub === '/api/v2/torrents/categories') return json(res, { tv: { name: 'tv', savePath: '/downloads/tv' }, movies: { name: 'movies', savePath: '/downloads/movies' }, software: { name: 'software', savePath: '/downloads/sw' } });
      if (sub === '/api/v2/torrents/tags') return json(res, []);
      if (sub === '/api/v2/app/preferences') return json(res, { scheduler_enabled: false, alt_dl_limit: 1024000, alt_up_limit: 512000, dl_limit: 0, up_limit: 0 });
      if (sub.startsWith('/api/v2/rss/')) return json(res, {});
      st.calls.push('qb ' + sub + ' ' + JSON.stringify(data).slice(0, 120)); res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('');
    }
    if (type === 'plex') {
      if (sub === '/library/sections') return json(res, { MediaContainer: { Directory: [{ title: 'Movies' }, { title: 'TV Shows' }] } });
      if (sub === '/status/sessions') return json(res, { MediaContainer: { Metadata: Array.from({ length: st.streams }, (_, i) => ({ type: 'episode', grandparentTitle: st.shows[i % st.shows.length].title, parentIndex: 1, index: i + 2, title: 'Demo episode',
        duration: 2.7e6, viewOffset: 9e5, Session: { id: 's' + i }, User: { title: ['alex', 'sam', 'jo'][i % 3] }, Player: { title: 'Living Room TV', state: 'playing' }, grandparentThumb: '/library/metadata/' + (i + 1) + '/thumb' })) } });
      if (sub.startsWith('/library/recentlyAdded')) return json(res, { MediaContainer: { Metadata: st.movies.filter(x => x.hasFile).slice(0, 5).map(x => ({ type: 'movie', title: x.title, year: x.year, thumb: '/library/metadata/' + x.id + '/thumb' })) } });
      if (sub.startsWith('/library/metadata/')) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); const t = decodeURIComponent(svg('Demo', 200).split(',')[1]); return res.end(t); }
      return json(res, { MediaContainer: {} });
    }
    if (type === 'seerr') {
      const data = m === 'POST' ? await body(req) : {};
      if (sub === '/api/v1/status') return json(res, { version: '2.0.0.demo' });
      if (sub === '/api/v1/search') return json(res, { results: ['Hidden Valley', 'Hidden Harbor', 'Paper Kingdoms'].filter(t => t.toLowerCase().includes(String(q.get('query') || '').toLowerCase())).map((t, i) => (i === 1 ? { mediaType: 'movie', id: 800 + i, title: t, releaseDate: '2024-03-01', overview: 'Demo result.', posterPath: '' } : { mediaType: 'tv', id: 800 + i, name: t, firstAirDate: '2022-05-01', overview: 'Demo result.', posterPath: '' })) });
      let r = sub.match(/^\/api\/v1\/tv\/(\d+)$/);
      if (r) return json(res, { id: +r[1], name: 'Demo show', numberOfSeasons: 3, seasons: [{ seasonNumber: 0, episodeCount: 2 }, { seasonNumber: 1, episodeCount: 8 }, { seasonNumber: 2, episodeCount: 10 }, { seasonNumber: 3, episodeCount: 6 }] });
      if (sub === '/api/v1/request' && m === 'POST') { const id = st.nextReq++; st.seerrReq[id] = data; st.calls.push('seerr request ' + JSON.stringify(data)); return json(res, { id }); }
      r = sub.match(/^\/api\/v1\/request\/(\d+)$/);
      if (r) return json(res, { id: +r[1], status: 2, media: { status: 3 } });
      return json(res, {});
    }
    if (type === 'prowlarr') {
      const data = m === 'POST' ? await body(req) : {};
      if (sub === '/api/v1/system/status') return json(res, { version: '1.0.0.demo' });
      if (sub === '/api/v1/health') return json(res, [{ type: 'warning', source: 'IndexerStatusCheck', message: 'Indexers unavailable due to failures: Broken Tracker' }]);
      if (sub === '/api/v1/indexer') return json(res, st.indexers);
      if (sub === '/api/v1/indexerstatus') return json(res, [{ indexerId: 4, disabledTill: iso(now, 0.25), mostRecentFailure: iso(now, -0.02) }]);
      if (sub === '/api/v1/indexer/testall') return json(res, st.indexers.filter(x => x.enable).map(x => (x.id === 4 ? { id: x.id, isValid: false, validationFailures: [{ errorMessage: 'Unable to connect to indexer' }] } : { id: x.id, isValid: true, validationFailures: [] })));
      if (sub === '/api/v1/indexer/test') { const bad = data.id === 4; return bad ? json(res, [{ errorMessage: 'Unable to connect to indexer: timeout' }], 400) : json(res, {}); }
      const r = sub.match(/^\/api\/v1\/indexer\/(\d+)$/); if (r) { const x = st.indexers.find(y => y.id === +r[1]); return x ? json(res, x) : json(res, { message: 'NotFound' }, 404); }
      return json(res, []);
    }
    if (type === 'bazarr') {
      const form = m === 'PATCH' || m === 'POST' ? await new Promise(ok => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => ok(b)); }) : '';
      if (sub === '/api/system/status') return json(res, { data: { bazarr_version: '1.4.0.demo' } });
      if (sub === '/api/episodes/wanted') return json(res, { data: st.subsEp, total: st.subsEp.length });
      if (sub === '/api/movies/wanted') return json(res, { data: st.subsMov, total: st.subsMov.length });
      if (sub === '/api/episodes/subtitles' && m === 'PATCH') { st.calls.push('bazarr episodes ' + form); const p2 = new URLSearchParams(form); st.subsEp.forEach(e => { if (String(e.sonarrEpisodeId) === p2.get('episodeid')) e.missing_subtitles = e.missing_subtitles.filter(x => x.code2 !== p2.get('language')); }); st.subsEp = st.subsEp.filter(e => e.missing_subtitles.length); res.writeHead(204); return res.end(); }
      if (sub === '/api/movies/subtitles' && m === 'PATCH') { st.calls.push('bazarr movies ' + form); const p2 = new URLSearchParams(form); st.subsMov.forEach(e => { if (String(e.radarrId) === p2.get('radarrid')) e.missing_subtitles = e.missing_subtitles.filter(x => x.code2 !== p2.get('language')); }); st.subsMov = st.subsMov.filter(e => e.missing_subtitles.length); res.writeHead(204); return res.end(); }
      return json(res, { data: [] });
    }
    if (type === 'sabnzbd' || sub === '/api') {
      const mode = q.get('mode');
      if (mode === 'version') return json(res, { version: '4.3.0-demo' });
      if (mode === 'queue') return json(res, { queue: { paused: false, status: 'Downloading', kbpersec: '5120', noofslots_total: 1, sizeleft: '2.1 GB', timeleft: '0:07:12', slots: [{ filename: 'Night.Shift.S06E01.1080p', percentage: '48', size: '3.1 GB', timeleft: '0:07:12' }] } });
      if (mode === 'history') {
        if (q.get('name') === 'delete') { st.sabHist = st.sabHist.filter(h => h.nzo_id !== q.get('value')); return json(res, { status: true }); }
        return json(res, { history: { slots: st.sabHist, noofslots: st.sabHist.length } });
      }
      if (mode === 'retry') { st.calls.push('sab retry ' + q.get('value')); st.sabHist = st.sabHist.filter(h => h.nzo_id !== q.get('value')); return json(res, { status: true }); }
      if (mode === 'addurl') { st.calls.push('sab addurl ' + q.get('name')); return json(res, { status: true, nzo_ids: ['SABnzbd_nzo_new'] }); }
      if (mode === 'addfile') { const chunks = []; await new Promise(ok => { req.on('data', c => chunks.push(c)); req.on('end', ok); }); st.calls.push('sab addfile ' + Buffer.concat(chunks).length + ' bytes'); return json(res, { status: true, nzo_ids: ['SABnzbd_nzo_file'] }); }
      return json(res, { status: true });
    }
    if (type === 'tautulli') {
      const cmd = q.get('cmd'), ok = d => json(res, { response: { result: 'success', data: d } });
      if (cmd === 'get_home_stats') return ok([{ stat_id: 'top_users', rows: [{ user: 'alex', total_plays: 42 }] }, { stat_id: 'popular_tv', rows: [{ title: 'Harbor Lights', users_watched: 3 }] }]);
      if (cmd === 'get_history') return ok({ data: [] });
      return ok({});
    }
    if (type === 'jackett') { res.writeHead(200, { 'Content-Type': 'application/xml' }); return res.end('<caps><server title="demo"/></caps>'); }
    json(res, {});
  }
  return { handle, state: st };
}
module.exports = { create };
