import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AuroraClient } from '../src/aurora.js';
import { preflight } from '../src/preflight.js';
import { CREATOR, EVM, KEY, TOKENS, startFake } from './helpers.js';

let fake;
before(async () => (fake = await startFake()));
after(() => fake.close());

// the fake token list carries no contract address for Base USDC; the live one does
const withContract = {
  ...TOKENS,
  tokens: TOKENS.tokens.map((t) => (t.blockchain === 'base' && t.symbol === 'USDC' ? { ...t, contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' } : t)),
};
const hex = (n) => '0x' + BigInt(n).toString(16);
const rpc = (usdc, eth) => async (_url, init) => {
  const { method } = JSON.parse(init.body);
  return { json: async () => ({ result: hex(method === 'eth_call' ? usdc : eth) }) };
};

function setup({ minIn = '1000510', amountIn = '1040000', amountOut = '1039000' } = {}) {
  fake.requests.length = 0;
  fake.tokensStatus = 200;
  fake.quoteHook = (body) => ({ status: 200, json: { timestamp: 't', signature: 's', quoteRequest: body, quote: { timeEstimate: 60, amountIn, amountInFormatted: '', amountInUsd: '', minAmountIn: minIn, amountOut, amountOutFormatted: '', amountOutUsd: '', minAmountOut: amountOut } } });
  const aurora = new AuroraClient({ baseUrl: fake.url, apiKey: KEY, sleep: async () => {} });
  aurora.tokens = async () => withContract;
  return aurora;
}
const run = (aurora, fetchImpl) => preflight({ aurora, fetchImpl, chain: 'base', symbol: 'USDC', amountUsd: '1.04', wallet: EVM, creatorWallet: CREATOR, sendExact: true });

test('GO: wallet holds 1.043813 USDC, live minimum 1.00051, dry quote, no deposit address requested', async () => {
  const r = await run(setup(), rpc(1043813, 850100000000000));
  assert.equal(r.go, true, r.problems.join(';'));
  assert.deepEqual(r.numbers, { send: '1.04', min: '1.00051', receive: '1.039', balance: '1.043813', eth: '0.0008501' });
  const q = fake.requests.find((x) => x.path.startsWith('/api/quote')).body;
  assert.equal(q.dry, true);
  assert.equal(q.swapType, 'EXACT_INPUT');
  assert.equal(q.amount, '1040000');
  assert.equal(q.refundTo, EVM);
});

test('NO-GO when the live minimum has risen above what we would send', async () => {
  const r = await run(setup({ minIn: '1060000' }), rpc(1043813, 850100000000000));
  assert.equal(r.go, false);
  assert.match(r.problems.join(), /below Aurora's live minimum 1.06/);
});

test('NO-GO when the quote needs more than the wallet holds (never quote more than the wallet has)', async () => {
  const r = await run(setup({ amountIn: '1050000' }), rpc(1043813, 850100000000000));
  assert.equal(r.go, false);
  assert.match(r.problems.join(), /needs 1.05 USDC, wallet holds 1.043813/);
});

test('NO-GO on no gas, and on a quote that skims over 5%', async () => {
  assert.match((await run(setup(), rpc(1043813, 1000))).problems.join(), /not enough ETH for gas/);
  assert.match((await run(setup({ amountOut: '900000' }), rpc(1043813, 850100000000000))).problems.join(), /under 95%/);
});

test('an RPC failure is an error, not a silent GO', async () => {
  await assert.rejects(run(setup(), async () => ({ json: async () => ({ error: { code: -32000 } }) })), /rpc .* failed/);
});

test('the balance read targets the token contract with a balanceOf call for the wallet', async () => {
  const seen = [];
  await run(setup(), async (_u, init) => {
    seen.push(JSON.parse(init.body));
    return rpc(1043813, 850100000000000)(_u, init);
  });
  const call = seen.find((b) => b.method === 'eth_call').params[0];
  assert.equal(call.to, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
  assert.equal(call.data, '0x70a08231000000000000000000000000' + EVM.slice(2).toLowerCase());
});
