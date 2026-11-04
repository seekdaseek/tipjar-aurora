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
  assert.deepEqual(r.numbers, { send: '1.04', min: '1.00051', receive: '1.039', balance: '1.043813', eth: '0.0008501', gasEth: null, gasUsd: null }); // ERC-20 sends keep the fixed ETH reserve
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

// The CLI once rejected valid arguments (it read cfg.creator instead of cfg.creatorWallet); run it as a process.
test('preflight CLI accepts --wallet and --creator and gets as far as the key check', async () => {
  const { spawnSync } = await import('node:child_process');
  const env = { PATH: process.env.PATH };
  const run = (...args) => spawnSync(process.execPath, ['scripts/preflight.mjs', ...args], { env, encoding: 'utf8' });
  const ok = run(`--wallet=${EVM}`, `--creator=${CREATOR}`);
  assert.equal(ok.status, 2);
  assert.match(ok.stderr, /AURORA_API_KEY is not set/);
  const bad = run(`--wallet=${EVM}`);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage:/);
});

// ---- native ETH on Ethereum / Base / Arbitrum, and the refund drill ----

const ETH_TOKENS = {
  tokens: [
    { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', decimals: 6, blockchain: 'sol', symbol: 'USDC', price: 1 },
    { assetId: 'nep141:eth.omft.near', decimals: 18, blockchain: 'eth', symbol: 'ETH', price: 2324.38 },
    { assetId: 'nep141:base.omft.near', decimals: 18, blockchain: 'base', symbol: 'ETH', price: 2324.38 },
    { assetId: 'nep141:arb.omft.near', decimals: 18, blockchain: 'arb', symbol: 'ETH', price: 2324.38 },
  ],
};
// what Aurora really returned for "creator gets exactly 2 USDC" paid in ETH on 2026-11-04
const outputQuote = (over = {}) => ({ quote: { timeEstimate: 44, amountIn: '874471891781711', minAmountIn: '865770177327760', maxAmountIn: '883000000000000', amountInUsd: '2.0334', amountOut: '2000000', ...over } });
function nativeSetup(quoteOver) {
  const quoteCalls = [];
  const aurora = { tokens: async () => ETH_TOKENS, quote: async (b) => (quoteCalls.push(b), outputQuote(quoteOver)) };
  return { aurora, quoteCalls };
}
// native-aware RPC stub: balanceOf must never be called for ETH
const nativeRpc = ({ balance, gasPrice = 44_800_000n }, seen = []) => async (url, init) => {
  const body = JSON.parse(init.body);
  seen.push({ url, method: body.method });
  if (body.method === 'eth_call') throw new Error('balanceOf must not be called for native ETH');
  return { json: async () => ({ result: hex(body.method === 'eth_getBalance' ? balance : gasPrice) }) };
};
const runNative = (chain, aurora, fetchImpl, extra = {}) => preflight({ aurora, fetchImpl, chain, symbol: 'ETH', amountUsd: '2', wallet: EVM, creatorWallet: CREATOR, sendExact: false, ...extra });

test('native ETH on Ethereum: GO with the real balance and gas, EXACT_OUTPUT dry quote, the Ethereum RPC, no token call', async () => {
  const seen = [];
  const { aurora, quoteCalls } = nativeSetup();
  const r = await runNative('eth', aurora, nativeRpc({ balance: 2_066_650_529_136_243n }, seen));
  assert.equal(r.go, true, r.problems.join(';'));
  assert.equal(r.numbers.send, '0.000874471891781711');
  assert.equal(r.numbers.min, '0.00086577017732776');
  assert.equal(r.numbers.receive, '2');
  assert.equal(r.numbers.gasEth, '0.0000009408'); // 44,800,000 wei x 21,000 gas
  assert.equal(r.numbers.gasUsd, '0.0022');
  assert.ok(seen.every((s) => s.url === 'https://ethereum-rpc.publicnode.com'));
  assert.deepEqual([...new Set(seen.map((s) => s.method))].sort(), ['eth_gasPrice', 'eth_getBalance']);
  assert.equal(quoteCalls[0].dry, true);
  assert.equal(quoteCalls[0].swapType, 'EXACT_OUTPUT');
  assert.equal(quoteCalls[0].amount, '2000000');
  assert.equal(quoteCalls[0].originAsset, 'nep141:eth.omft.near');
  assert.match(r.lines.join('\n'), /network fee to send about .* ETH \(about 0\.002\d USD\) at 0\.0448 gwei/);
});

test('native ETH uses the Arbitrum and Base RPCs for those chains', async () => {
  for (const [chain, url] of [['arb', 'https://arb1.arbitrum.io/rpc'], ['base', 'https://mainnet.base.org']]) {
    const seen = [];
    await runNative(chain, nativeSetup().aurora, nativeRpc({ balance: 2_000_000_000_000_000n }, seen));
    assert.ok(seen.length > 0 && seen.every((s) => s.url === url), chain);
  }
});

test('native ETH NO-GO: the balance must cover the send AND a fee reserve', async () => {
  const { aurora } = nativeSetup();
  const exact = await runNative('eth', aurora, nativeRpc({ balance: 874_471_891_781_711n }));
  assert.equal(exact.go, false);
  assert.match(exact.problems.join(), /including the fee reserve/);
  const spike = await runNative('eth', aurora, nativeRpc({ balance: 1_000_000_000_000_000n, gasPrice: 100_000_000_000n })); // 100 gwei
  assert.equal(spike.go, false, 'a gas spike eats the reserve');
});

test('native ETH NO-GO when the quote is below the minimum or skims over 5% of its USD value', async () => {
  const lowMin = await runNative('eth', nativeSetup({ amountIn: '800000000000000' }).aurora, nativeRpc({ balance: 2_000_000_000_000_000n }));
  assert.match(lowMin.problems.join(), /below Aurora's live minimum/);
  const skim = await runNative('eth', nativeSetup({ amountOut: '1800000' }).aurora, nativeRpc({ balance: 2_000_000_000_000_000n }));
  assert.match(skim.problems.join(), /under 95%/);
});

test('refund drill: a deposit below the minimum and above 1 USD is GO and the full quote amount is not required', async () => {
  const r = await runNative('base', nativeSetup().aurora, nativeRpc({ balance: 645_097_379_815_999n }), { drillAmount: '0.00045' });
  assert.equal(r.go, true, r.problems.join(';')); // the wallet holds less than the 0.000874 a full tip needs
  assert.equal(r.drill.send, '0.00045');
  assert.equal(r.drill.usd, '1.05');
  assert.ok(r.drill.percentOfMinimum > 50 && r.drill.percentOfMinimum < 53);
  assert.match(r.lines.join('\n'), /refund drill: send 0\.00045 ETH \(about 1\.05 USD\)/);
});

test('refund drill NO-GO: not short of the minimum, worth under 1 USD, or more than the wallet holds', async () => {
  const w = nativeRpc({ balance: 645_097_379_815_999n });
  assert.match((await runNative('base', nativeSetup().aurora, w, { drillAmount: '0.0009' })).problems.join(), /not below the minimum/);
  assert.match((await runNative('base', nativeSetup().aurora, w, { drillAmount: '0.0004' })).problems.join(), /under the 1 USD floor/);
  assert.match((await runNative('base', nativeSetup().aurora, nativeRpc({ balance: 400_000_000_000_000n }), { drillAmount: '0.00045' })).problems.join(), /drill needs/);
});

test('refund drill needs the same fee reserve as a send', async () => {
  const r = await runNative('base', nativeSetup().aurora, nativeRpc({ balance: 450_000_000_000_000n }), { drillAmount: '0.00045' });
  assert.equal(r.go, false);
});
