import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { CREATOR, EVM, KEY, goodTip, makeService, startFake } from './helpers.js';

let fake, app, base, clock;
before(async () => {
  fake = await startFake();
  const ctx = makeService(fake);
  clock = ctx.clock;
  app = createApp({ service: ctx.service, now: () => clock.t, tipLimit: 3, statusLimit: 5 });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}`;
});
after(async () => {
  await fake.close();
  await new Promise((r) => app.close(r));
});

const post = (path, body, raw) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) });

test('health, routes, 404', async () => {
  assert.equal((await (await fetch(base + '/health')).json()).ok, true);
  const r = await (await fetch(base + '/api/routes')).json();
  assert.equal(r.destination.symbol, 'USDC');
  assert.ok(r.chains.length > 0);
  assert.equal((await fetch(base + '/nope')).status, 404);
});

test('POST /api/tip then GET status end to end; the API key appears in no response body', async () => {
  fake.statusQueue = [{ status: 'SUCCESS', swapDetails: { originChainTxHashes: [{ hash: 'a', explorerUrl: 'https://e.example/a' }], destinationChainTxHashes: [{ hash: 'b', explorerUrl: 'https://e.example/b' }] } }];
  const res = await post('/api/tip', goodTip());
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!text.includes(KEY));
  const q = JSON.parse(text);
  const st = await fetch(`${base}/api/tip/${q.depositAddress}`);
  const stText = await st.text();
  assert.ok(!stText.includes(KEY));
  const s = JSON.parse(stText);
  assert.equal(s.stage, 'arrived');
  assert.equal(s.links.destination[0].url, 'https://e.example/b');
});

test('errors are JSON {error:{code,message}} with the right status', async () => {
  clock.t += 120_000; // fresh limiter window
  let r = await post('/api/tip', goodTip({ amountUsd: '0.5' }));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'below_minimum');
  r = await post('/api/tip', null, '{not json');
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error.code, 'bad_json');
  r = await fetch(`${base}/api/tip/0xunknownunknown`);
  assert.equal(r.status, 404);
});

test('oversized body is rejected', async () => {
  clock.t += 120_000;
  const r = await post('/api/tip', null, JSON.stringify({ pad: 'x'.repeat(20000) })).catch((e) => e);
  assert.ok(r instanceof Error || r.status === 413);
});

test('per-client rate limit on quotes (3/min here) answers 429, and recovers next window', async () => {
  clock.t += 120_000;
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await post('/api/tip', goodTip({ amountUsd: '0.5' }))).status);
  assert.deepEqual(codes, [400, 400, 400, 429]);
  clock.t += 61_000;
  assert.equal((await post('/api/tip', goodTip({ amountUsd: '0.5' }))).status, 400);
});
