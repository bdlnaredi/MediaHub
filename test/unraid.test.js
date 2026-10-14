// The Unraid page shows the CPU by its full name (maker and model), cores, threads and speed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { boot, client, setup } = require('./helpers');
const fakes = require('../lib/demo');

test('unraid: the CPU is named in full, with trademark signs removed', async () => {
  const fake = fakes.create(), srv = http.createServer((req, res) => fake.handle(req, res, req.url)).listen(0);
  await new Promise(r => srv.once('listening', r));
  const s = await boot({}), a = client(s.base); await setup(a);
  try {
    const id = (await a.post('/api/services', { type: 'unraid', name: 'Tower', url: `http://127.0.0.1:${srv.address().port}/unraid`, apiKey: 'k' })).data.id;
    const d = (await a.get(`/api/unraid/${id}`)).data;
    assert.deepEqual(d.cpuInfo, { brand: 'Intel Core i5-12400', cores: 6, threads: 12, ghz: 2.5 });
    assert.ok(d.uptime, 'uptime comes along');
  } finally { await s.stop(); srv.close(); }
});
