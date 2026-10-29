import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AuroraClient, AuroraError } from '../src/aurora.js';
import { CreatorRegistry, SolanaChecker } from '../src/checks.js';
import { TipError } from '../src/service.js';
import { CREATOR, EVM, KEY, SOL_USDC, goodTip, makeService, startFake } from './helpers.js';

let fake;
before(async () => (fake = await startFake()));
after(() => fake.close());
const reset = () => {
  fake.requests.length = 0;
  fake.quoteOver = {};
  fake.quoteHook = null;
  fake.statusQueue = [];
  fake.tokensStatus = 200;
};
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof TipError && e.code === code, code);

test('quote request: exact fields for "Base ETH -> USDC on Solana", refund on origin chain, no fee', async () => {
  reset();
  const { service } = makeService(fake);
  const q = await service.createTip(goodTip());
  const call = fake.requests.find((r) => r.path === `/api/quote/${KEY}`);
  assert.deepEqual(call.body, {
    dry: false,
    swapType: 'EXACT_OUTPUT',
    depositType: 'ORIGIN_CHAIN',
    originAsset: 'nep141:base.omft.near',
    destinationAsset: SOL_USDC,
    amount: '2000000',
    slippageTolerance: 100,
    refundTo: EVM,
    refundType: 'ORIGIN_CHAIN',
    recipient: CREATOR,
    recipientType: 'DESTINATION_CHAIN',
    deadline: '2026-10-30T10:30:00.000Z',
  });
  assert.equal(call.body.appFees, undefined, 'fee is 0: no appFees at all');
  assert.equal(q.depositAddress, '0xDEPOSIT00000000000000000000000000000001');
  assert.equal(q.sendAmount, '0.001');
  assert.equal(q.minAmount, '0.00099');
  assert.equal(q.receiveUsdc, '2');
  assert.match(q.requirements, /Send only ETH on the Base network/);
  assert.match(q.requirements, /Minimum tip from Base: \$1/);
});

test('deadline: the earlier of the requested and the quoted one is shown (Aurora returned +72 h)', async () => {
  reset();
  const { service } = makeService(fake);
  fake.quoteOver = { deadline: '2026-11-02T10:30:00.000Z', timeWhenInactive: '2026-11-02T10:30:00.000Z' };
  assert.equal((await service.createTip(goodTip())).deadline, '2026-10-30T10:30:00.000Z');
  reset();
  fake.quoteOver = { deadline: '2026-10-30T10:10:00.000Z' }; // an earlier quoted deadline also wins
  assert.equal((await service.createTip(goodTip())).deadline, '2026-10-30T10:10:00.000Z');
  reset();
  fake.quoteOver = { deadline: undefined }; // none quoted: keep the requested one
  assert.equal((await service.createTip(goodTip())).deadline, '2026-10-30T10:30:00.000Z');
});

test('integrator fee is only sent when configured', async () => {
  reset();
  const { service } = makeService(fake, { config: { feeBps: 10, feeRecipient: 'creatorplatform.near' } });
  await service.createTip(goodTip());
  const call = fake.requests.find((r) => r.path.startsWith('/api/quote'));
  assert.deepEqual(call.body.appFees, [{ recipient: 'creatorplatform.near', fee: 10 }]);
});

test('BTC uses a BIP21 QR with the amount, 120 min deadline', async () => {
  reset();
  fake.quoteOver = { amountInFormatted: '0.0000375', depositAddress: 'bc1qdeposit0000000000000000000000000000' };
  const { service } = makeService(fake);
  const q = await service.createTip(goodTip({ chain: 'btc', symbol: 'BTC', refundTo: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq' }));
  assert.equal(q.qr, 'bitcoin:bc1qdeposit0000000000000000000000000000?amount=0.0000375');
  assert.equal(fake.requests.find((r) => r.path.startsWith('/api/quote')).body.deadline, '2026-10-30T12:00:00.000Z');
});

test('input validation happens before any quote is requested', async () => {
  reset();
  const { service } = makeService(fake);
  await rejects(service.createTip(goodTip({ chain: 'dogechain' })), 'unsupported_route');
  await rejects(service.createTip(goodTip({ symbol: 'PEPE' })), 'unsupported_route');
  await rejects(service.createTip(goodTip({ amountUsd: '0.99' })), 'below_minimum');
  await rejects(service.createTip(goodTip({ amountUsd: '51' })), 'above_maximum');
  await rejects(service.createTip(goodTip({ amountUsd: '2e3' })), 'bad_amount');
  await rejects(service.createTip(goodTip({ refundTo: 'nope' })), 'bad_refund_address');
  await rejects(service.createTip(goodTip({ chain: 'btc', symbol: 'BTC', refundTo: EVM })), 'bad_refund_address');
  await rejects(service.createTip(goodTip({ creatorWallet: EVM })), 'bad_creator');
  await rejects(service.createTip(goodTip({ chain: 'tron', symbol: 'USDT', amountUsd: '1.5', refundTo: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' })), 'below_minimum'); // TRON minimum is $2
  assert.equal(fake.requests.filter((r) => r.path.startsWith('/api/quote')).length, 0);
});

test('creator without a USDC account is refused with a clear reason; RPC outage is not "no account"', async () => {
  reset();
  await rejects(makeService(fake, { solana: { hasUsdcAccount: async () => false } }).service.createTip(goodTip()), 'creator_no_usdc_account');
  await rejects(makeService(fake, { solana: { hasUsdcAccount: async () => null } }).service.createTip(goodTip()), 'solana_unavailable');
  assert.equal(fake.requests.filter((r) => r.path.startsWith('/api/quote')).length, 0);
});

test('registry gate: unknown wallet 403, registry down 503, known wallet passes', async () => {
  reset();
  await rejects(makeService(fake, { registry: { isRegistered: async () => false } }).service.createTip(goodTip()), 'unknown_creator');
  await rejects(makeService(fake, { registry: { isRegistered: async () => null } }).service.createTip(goodTip()), 'registry_unavailable');
  await makeService(fake, { registry: { isRegistered: async (w) => w === CREATOR } }).service.createTip(goodTip());
});

test('a quote that does not pay the creator in full, or echoes another recipient, is never shown', async () => {
  reset();
  const { service } = makeService(fake);
  fake.quoteOver = { amountOut: '1999999' };
  await rejects(service.createTip(goodTip()), 'bad_quote');
  fake.quoteOver = {};
  fake.quoteHook = (body) => ({ status: 200, json: { ...JSON.parse(JSON.stringify({ quoteRequest: { ...body, recipient: 'Attacker1111111111111111111111111111111111' }, quote: { depositAddress: 'x', amountIn: '1', minAmountIn: '1', amountOut: body.amount } })), timestamp: 't', signature: 's' } });
  await rejects(service.createTip(goodTip()), 'bad_quote');
  fake.quoteHook = (body) => ({ status: 200, json: { timestamp: 't', signature: 's', quoteRequest: { ...body, refundTo: 'x' }, quote: { depositAddress: 'x', amountOut: body.amount } } });
  await rejects(service.createTip(goodTip()), 'bad_quote');
});

test('Aurora 400 / 500 / 429 map to user-safe errors, and the API key never appears in any message', async () => {
  reset();
  const { service } = makeService(fake);
  fake.quoteHook = () => ({ status: 400, json: { message: 'Amount is too low', correlationId: 'c', timestamp: 't', path: `/api/quote/${KEY}` } });
  await assert.rejects(service.createTip(goodTip()), (e) => e.code === 'quote_rejected' && e.http === 422 && /Amount is too low/.test(e.message) && !e.message.includes(KEY));
  fake.quoteHook = () => ({ status: 500, json: { message: 'boom' } });
  await assert.rejects(service.createTip(goodTip()), (e) => e.code === 'aurora_unavailable' && e.http === 503 && !e.message.includes(KEY));
  fake.quoteHook = () => ({ status: 429, json: { message: 'Rate limit exceeded' }, headers: { 'retry-after': '1' } });
  await assert.rejects(service.createTip(goodTip()), (e) => e.code === 'busy' && e.http === 429);
});

test('client honours Retry-After, retries, then succeeds; gives up after maxAttempts', async () => {
  reset();
  const sleeps = [];
  let n = 0;
  fake.quoteHook = (body) => (++n < 3 ? { status: 429, json: { message: 'Rate limit exceeded' }, headers: { 'retry-after': '2' } } : null);
  const aurora = new AuroraClient({ baseUrl: fake.url, apiKey: KEY, sleep: async (ms) => sleeps.push(ms) });
  const res = await aurora.quote({ dry: true, amount: '1' });
  assert.ok(res.quote);
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps.every((ms) => ms >= 2000 && ms < 2500), `waited ${sleeps}`);
  n = -100;
  await assert.rejects(aurora.quote({ dry: true, amount: '1' }), (e) => e instanceof AuroraError && e.status === 429 && e.retryAfter === 2);
});

test('client does not wait out an hourly Retry-After', async () => {
  reset();
  fake.quoteHook = () => ({ status: 429, json: {}, headers: { 'retry-after': '3000' } });
  const aurora = new AuroraClient({ baseUrl: fake.url, apiKey: KEY, sleep: async () => assert.fail('must not sleep') });
  await assert.rejects(aurora.quote({ amount: '1' }), (e) => e.status === 429);
});

test('network failure error carries no URL', async () => {
  const aurora = new AuroraClient({ baseUrl: 'http://127.0.0.1:1', apiKey: KEY });
  await assert.rejects(aurora.tokens(), (e) => e.status === 0 && !e.message.includes(KEY) && !e.message.includes('127.0.0.1'));
});

// ---- status ----

async function tipWith(statusQueue, opts) {
  reset();
  fake.statusQueue = statusQueue;
  const ctx = makeService(fake, opts);
  const q = await ctx.service.createTip(goodTip());
  return { ...ctx, q };
}
const links = (h) => [{ hash: h, explorerUrl: `https://explorer.example/tx/${h}` }];

test('status: waiting -> seen -> received -> arrived, with both explorer links', async () => {
  const { service, clock, q } = await tipWith([
    { status: 'PENDING_DEPOSIT' },
    { status: 'KNOWN_DEPOSIT_TX' },
    { status: 'PROCESSING', swapDetails: { originChainTxHashes: links('0xabc') } },
    { status: 'SUCCESS', swapDetails: { originChainTxHashes: links('0xabc'), destinationChainTxHashes: links('SoLtx'), amountOutFormatted: '2', amountOutUsd: '2.00' } },
  ]);
  const step = async () => {
    clock.t += 6000;
    return service.tipStatus(q.depositAddress);
  };
  let s = await step();
  assert.deepEqual([s.stage, s.steps.received, s.steps.arrived], ['waiting', false, false]);
  s = await step();
  assert.deepEqual([s.stage, s.steps.received, s.steps.arrived], ['seen', true, false]);
  s = await step();
  assert.deepEqual([s.stage, s.steps.received, s.steps.arrived], ['received', true, false]);
  assert.equal(s.links.origin[0].url, 'https://explorer.example/tx/0xabc');
  s = await step();
  assert.deepEqual([s.stage, s.steps.received, s.steps.arrived], ['arrived', true, true]);
  assert.equal(s.links.destination[0].url, 'https://explorer.example/tx/SoLtx');
  assert.equal(s.links.origin.length, 1);
  assert.match(s.message, /Arrived. 2 USDC/);
  assert.equal(s.supportUrl, null);
});

test('status: refund is shown with amount, reason, destination, and a support link', async () => {
  const { service, q } = await tipWith([
    { status: 'REFUNDED', swapDetails: { refundedAmountFormatted: '0.00099', refundedAmountUsd: '2.27', refundReason: 'PARTIAL_DEPOSIT', originChainTxHashes: links('0xdep').concat(links('0xrefund')) } },
  ]);
  const s = await service.tipStatus(q.depositAddress);
  assert.equal(s.stage, 'refunded');
  assert.deepEqual(s.refund, { amount: '0.00099', amountUsd: '2.27', reason: 'PARTIAL_DEPOSIT', to: EVM });
  assert.match(s.message, /Refunded 0\.00099 ETH to 0xA11CE/);
  assert.equal(s.steps.arrived, false);
  assert.equal(s.links.origin.length, 2);
  assert.equal(s.supportUrl, 'https://aurora.dev/intents-support');
});

test('status: incomplete deposit reports the exact shortfall', async () => {
  const { service, q } = await tipWith([{ status: 'INCOMPLETE_DEPOSIT', swapDetails: { depositedAmount: '400000000000000', depositedAmountFormatted: '0.0004' } }]);
  const s = await service.tipStatus(q.depositAddress);
  assert.equal(s.stage, 'incomplete');
  assert.equal(s.shortfall, '0.00059'); // minAmountIn 0.00099 - 0.0004
  assert.match(s.message, /0\.0004 ETH, which is 0\.00059 ETH short/);
});

test('status: failed never claims arrival and points at support', async () => {
  const { service, q } = await tipWith([{ status: 'FAILED' }]);
  const s = await service.tipStatus(q.depositAddress);
  assert.deepEqual([s.stage, s.steps.arrived], ['failed', false]);
  assert.match(s.message, /not delivered/);
  assert.ok(s.supportUrl);
});

test('status: still PENDING_DEPOSIT after the deadline is "expired", not an endless wait', async () => {
  const { service, clock, q } = await tipWith([{ status: 'PENDING_DEPOSIT' }]);
  clock.t += 31 * 60_000;
  const s = await service.tipStatus(q.depositAddress);
  assert.equal(s.stage, 'expired');
  assert.match(s.message, /Nothing was sent/);
});

test('status: an unknown future Aurora status is not reported as success', async () => {
  const { service, q } = await tipWith([{ status: 'SOMETHING_NEW' }]);
  const s = await service.tipStatus(q.depositAddress);
  assert.deepEqual([s.stage, s.steps.arrived, s.auroraStatus], ['waiting', false, 'SOMETHING_NEW']);
});

test('status: non-https explorer links from upstream are dropped', async () => {
  const { service, q } = await tipWith([{ status: 'SUCCESS', swapDetails: { originChainTxHashes: [{ hash: 'a', explorerUrl: 'javascript:alert(1)' }, { hash: 'b', explorerUrl: 'https://ok.example/b' }], destinationChainTxHashes: [] } }]);
  const s = await service.tipStatus(q.depositAddress);
  assert.deepEqual(s.links.origin, [{ hash: 'b', url: 'https://ok.example/b' }]);
});

test('status polling is cached: many clients inside 5 s cost one upstream call; terminal state is final', async () => {
  const { service, clock, q } = await tipWith([{ status: 'PROCESSING' }, { status: 'SUCCESS', swapDetails: {} }]);
  const statusCalls = () => fake.requests.filter((r) => r.path.startsWith('/api/status')).length;
  await Promise.all(Array.from({ length: 20 }, () => service.tipStatus(q.depositAddress)));
  assert.equal(statusCalls(), 1);
  clock.t += 2000;
  await service.tipStatus(q.depositAddress);
  assert.equal(statusCalls(), 1);
  clock.t += 5000;
  const s = await service.tipStatus(q.depositAddress);
  assert.equal(s.stage, 'arrived');
  assert.equal(statusCalls(), 2);
  clock.t += 60_000;
  await service.tipStatus(q.depositAddress);
  assert.equal(statusCalls(), 2, 'finished tips never hit Aurora again');
});

test('status: upstream outage serves the last known state; first-ever failure is a retryable 503', async () => {
  const { service, clock, q } = await tipWith([{ status: 'PROCESSING' }]);
  assert.equal((await service.tipStatus(q.depositAddress)).stage, 'received');
  fake.statusQueue = [{ http: 500, json: { message: 'down' } }];
  clock.t += 6000;
  assert.equal((await service.tipStatus(q.depositAddress)).stage, 'received');
  const fresh = await tipWith([{ http: 500, json: { message: 'down' } }]);
  await assert.rejects(fresh.service.tipStatus(fresh.q.depositAddress), (e) => e.code === 'status_unavailable' && e.http === 503);
});

test('status for an unknown deposit address is 404', async () => {
  const { service } = makeService(fake);
  await assert.rejects(service.tipStatus('0xnotours000000000'), (e) => e.code === 'unknown_tip' && e.http === 404);
});

test('routes only list assets that exist in the live Aurora token list', async () => {
  reset();
  const { service } = makeService(fake);
  const r = await service.routes();
  assert.deepEqual(r.chains.map((c) => c.key), ['base', 'btc', 'tron']); // fake list has only these
  assert.deepEqual(r.chains.find((c) => c.key === 'tron').tokens.map((t) => t.symbol), ['TRX', 'USDT']);
  assert.equal(r.chains.find((c) => c.key === 'tron').minUsd, 2);
});

test('token list outage with no cache is a 503, with cache it keeps serving', async () => {
  reset();
  fake.tokensStatus = 500;
  await assert.rejects(makeService(fake).service.routes(), (e) => e.code === 'aurora_unavailable');
  fake.tokensStatus = 200;
  const { service, clock } = makeService(fake);
  await service.routes();
  fake.tokensStatus = 500;
  clock.t += 10 * 60_000;
  assert.equal((await service.routes()).chains.length, 3);
});

// ---- checks ----

test('SolanaChecker: account present, absent, and RPC failure are three different answers', async () => {
  const rpc = (v) => async () => ({ json: async () => v });
  assert.equal(await new SolanaChecker({ rpcUrl: 'x', fetchImpl: rpc({ result: { value: [{}] } }) }).hasUsdcAccount(CREATOR), true);
  assert.equal(await new SolanaChecker({ rpcUrl: 'x', fetchImpl: rpc({ result: { value: [] } }) }).hasUsdcAccount(CREATOR), false);
  assert.equal(await new SolanaChecker({ rpcUrl: 'x', fetchImpl: rpc({ error: { code: -32005 } }) }).hasUsdcAccount(CREATOR), null);
  assert.equal(await new SolanaChecker({ rpcUrl: 'x', fetchImpl: async () => { throw new Error('net'); } }).hasUsdcAccount(CREATOR), null);
});

test('CreatorRegistry reads wallets from the Firebase creators object and caches', async () => {
  let calls = 0;
  let t = 0;
  const reg = new CreatorRegistry({ url: 'x', now: () => t, fetchImpl: async () => (calls++, { ok: true, json: async () => ({ a: { wallet: CREATOR }, b: { wallet: 'W2' } }) }) });
  assert.equal(await reg.isRegistered(CREATOR), true);
  assert.equal(await reg.isRegistered('nobody'), false);
  assert.equal(calls, 1);
  t += 61_000;
  await reg.isRegistered(CREATOR);
  assert.equal(calls, 2);
  assert.equal(await new CreatorRegistry({ url: 'x', fetchImpl: async () => ({ ok: false }) }).isRegistered(CREATOR), null);
});

// ---- sendExact (EXACT_INPUT, stablecoins only): the first real tip is exactly 1.04 USDC from Base ----

const BASE_USDC = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
const exactOver = (over = {}) => ({ amountIn: '1040000', amountInFormatted: '1.04', amountInUsd: '1.04', minAmountIn: '1040000', maxAmountIn: undefined, amountOut: '1039000', amountOutFormatted: '1.039', ...over });

test('sendExact: Base USDC 1.04 -> EXACT_INPUT in origin units, refund to the same wallet, creator gets the quoted out', async () => {
  reset();
  fake.quoteOver = exactOver();
  const { service } = makeService(fake);
  const q = await service.createTip(goodTip({ symbol: 'USDC', amountUsd: '1.04', sendExact: true }));
  const body = fake.requests.find((r) => r.path.startsWith('/api/quote')).body;
  assert.equal(body.swapType, 'EXACT_INPUT');
  assert.equal(body.amount, '1040000');
  assert.equal(body.originAsset, BASE_USDC);
  assert.equal(body.destinationAsset, SOL_USDC);
  assert.equal(body.refundTo, EVM);
  assert.equal(body.recipient, CREATOR);
  assert.equal(q.sendAmount, '1.04');
  assert.equal(q.receiveUsdc, '1.039');
  assert.match(q.requirements, /Send exactly 1\.04 USDC\. Minimum tip from Base: \$1/);
  assert.doesNotMatch(q.requirements, /maximum/);
});

test('sendExact is refused for volatile tokens and still enforces the minimum', async () => {
  reset();
  const { service } = makeService(fake);
  await rejects(service.createTip(goodTip({ symbol: 'ETH', amountUsd: '2', sendExact: true })), 'send_exact_stable_only');
  await rejects(service.createTip(goodTip({ symbol: 'USDC', amountUsd: '0.9', sendExact: true })), 'below_minimum');
  assert.equal(fake.requests.filter((r) => r.path.startsWith('/api/quote')).length, 0);
});

test('sendExact: a quote that disagrees on the amount to send, or skims over 5%, is never shown', async () => {
  reset();
  const { service } = makeService(fake);
  fake.quoteOver = exactOver({ amountIn: '1050000' });
  await rejects(service.createTip(goodTip({ symbol: 'USDC', amountUsd: '1.04', sendExact: true })), 'bad_quote');
  fake.quoteOver = exactOver({ amountOut: '900000' });
  await rejects(service.createTip(goodTip({ symbol: 'USDC', amountUsd: '1.04', sendExact: true })), 'bad_quote');
  fake.quoteOver = exactOver({ amountOut: '988000' }); // exactly the 95% boundary: allowed
  await service.createTip(goodTip({ symbol: 'USDC', amountUsd: '1.04', sendExact: true }));
});
