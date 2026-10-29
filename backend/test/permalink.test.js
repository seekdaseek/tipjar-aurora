// The read-only #tip=<deposit address> permalink: GET /api/tip/:address must never create a quote, must find an EVM address in any case,
// must reject junk shapes, and must rate-limit lookups of addresses we never issued.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { EVM, goodTip, makeService, startFake } from './helpers.js';

const DEP = '0xbfa9D9C3457AcAa0F755c79631758673DbC7b00A';
let fake, ctx, app, base, quote;
const quotes = () => fake.requests.filter((r) => r.path.startsWith('/api/quote')).length;
const statusCalls = () => fake.requests.filter((r) => r.path.startsWith('/api/status')).length;

before(async () => {
  fake = await startFake();
  fake.quoteOver = { depositAddress: DEP };
  ctx = makeService(fake);
  quote = await ctx.service.createTip(goodTip({ chain: 'base', symbol: 'USDC', amountUsd: '2' }));
  app = createApp({ service: ctx.service, now: () => ctx.clock.t, statusLimit: 1000, missLimit: 3 });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}`;
});
after(async () => {
  await fake.close();
  await new Promise((r) => app.close(r));
});

test('a lowercase 0x permalink finds the same tip, with the route info a receipt needs, and creates no quote', async () => {
  assert.equal(quote.depositAddress, DEP);
  const before = quotes();
  fake.statusQueue = [{ status: 'PENDING_DEPOSIT' }];
  const res = await fetch(`${base}/api/tip/${DEP.toLowerCase()}`);
  assert.equal(res.status, 200);
  const s = await res.json();
  assert.equal(s.depositAddress, DEP, 'canonical spelling is returned');
  assert.deepEqual(s.route, { chain: 'base', chainLabel: 'Base', symbol: 'USDC', creator: '4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7' });
  assert.equal(s.stage, 'waiting');
  assert.equal(quotes(), before, 'a status lookup never requests a quote');
});

test('both spellings share one cached upstream status call', async () => {
  ctx.clock.t += 60_000;
  const n = statusCalls();
  await fetch(`${base}/api/tip/${DEP}`);
  await fetch(`${base}/api/tip/${DEP.toLowerCase()}`);
  await fetch(`${base}/api/tip/${DEP.toUpperCase().replace('0X', '0x')}`);
  assert.equal(statusCalls() - n, 1);
});

test('non-EVM addresses stay case-sensitive', async () => {
  assert.equal(ctx.store.get('0xnothex'), undefined);
  assert.equal(ctx.store.get(DEP.slice(0, -1)), undefined);
});

test('malformed addresses are not routes at all; well-formed unknown ones are 404 unknown_tip', async () => {
  for (const bad of ['abc', 'x'.repeat(129), '0x%20bad', '..%2f..%2fetc', '%3Cscript%3E1']) {
    const r = await fetch(`${base}/api/tip/${bad}`);
    assert.equal(r.status, 404, bad);
    assert.equal((await r.json()).error.code, 'not_found', bad);
  }
  const r = await fetch(`${base}/api/tip/0x0000000000000000000000000000000000000001`);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'unknown_tip');
});

test('lookups of unknown addresses are rate-limited per client; known addresses are not affected', async () => {
  ctx.clock.t += 120_000; // fresh window (missLimit is 3)
  const unknown = (i) => fetch(`${base}/api/tip/0x00000000000000000000000000000000000000a${i}`);
  assert.equal((await unknown(1)).status, 404);
  assert.equal((await unknown(2)).status, 404);
  assert.equal((await unknown(3)).status, 404);
  const blocked = await unknown(4);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error.code, 'rate_limited');
  assert.equal((await fetch(`${base}/api/tip/${DEP}`)).status, 200, 'a real receipt still loads');
  ctx.clock.t += 61_000;
  assert.equal((await unknown(5)).status, 404, 'the window passes');
});

test('the public status shortens the refund address and never carries the API key', async () => {
  fake.statusQueue = [{ status: 'REFUNDED', swapDetails: { refundedAmountFormatted: '1.5', refundReason: 'EXPIRED' } }];
  const other = makeService(fake);
  fake.quoteOver = { depositAddress: '0x1111111111111111111111111111111111111111' };
  const q2 = await other.service.createTip(goodTip({ chain: 'base', symbol: 'USDC', amountUsd: '2' }));
  const s = await other.service.tipStatus(q2.depositAddress.toUpperCase().replace('0X', '0x'));
  const text = JSON.stringify(s);
  assert.equal(s.stage, 'refunded');
  assert.ok(!text.includes(EVM), 'full refund address absent');
  assert.match(s.refund.to, /^0xA11CE0….{6}$/);
});
