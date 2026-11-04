// A fake Aurora API over real HTTP, so the client's URL building, 429 handling and error mapping are exercised too.
import { createServer } from 'node:http';
import { AuroraClient } from '../src/aurora.js';
import { TipService } from '../src/service.js';
import { TipStore } from '../src/store.js';

export const KEY = 'unit-test-fixture-only';
export const CREATOR = '4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7';
export const EVM = '0xA11CE00000000000000000000000000000000B01';
export const SOL_USDC = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';

export const TOKENS = {
  asset_stats: [],
  tokens: [
    { assetId: SOL_USDC, decimals: 6, blockchain: 'sol', symbol: 'USDC', price: 1, priceUpdatedAt: 'x' },
    { assetId: 'nep141:base.omft.near', decimals: 18, blockchain: 'base', symbol: 'ETH', price: 2300, priceUpdatedAt: 'x' },
    { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', decimals: 6, blockchain: 'base', symbol: 'USDC', price: 1, priceUpdatedAt: 'x', contractAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
    { assetId: 'nep141:bsc-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omft.near', decimals: 18, blockchain: 'bsc', symbol: 'USDC', price: 1, priceUpdatedAt: 'x' },
    { assetId: 'nep141:btc.omft.near', decimals: 8, blockchain: 'btc', symbol: 'BTC', price: 80000, priceUpdatedAt: 'x' },
    { assetId: 'nep141:tron.omft.near', decimals: 6, blockchain: 'tron', symbol: 'TRX', price: 0.33, priceUpdatedAt: 'x' },
    { assetId: 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near', decimals: 6, blockchain: 'tron', symbol: 'USDT', price: 1, priceUpdatedAt: 'x', contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },
  ],
};

export function quoteResponse(body, over = {}) {
  return {
    timestamp: '2026-10-30T10:00:00.000Z',
    signature: 'sig',
    correlationId: 'corr-1',
    quoteRequest: { ...body, deadline: body.deadline },
    quote: {
      timeEstimate: 60,
      deadline: body.deadline,
      timeWhenInactive: body.deadline,
      depositAddress: '0xDEPOSIT00000000000000000000000000000001',
      amountIn: '1000000000000000',
      amountInFormatted: '0.001',
      amountInUsd: '2.30',
      minAmountIn: '990000000000000',
      maxAmountIn: '1010000000000000',
      amountOut: body.amount,
      amountOutFormatted: '2',
      amountOutUsd: '2',
      minAmountOut: body.amount,
      ...over,
    },
  };
}

export async function startFake() {
  const fake = {
    requests: [],
    quoteOver: {},
    quoteHook: null, // (body) => {status, json, headers}
    statusQueue: [], // each GET /api/status shifts one; the last one repeats
    tokensStatus: 200,
    incidents: { status: 'operational' },
    incidentsStatus: 200,
  };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      const url = new URL(req.url, 'http://x');
      fake.requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body: raw ? JSON.parse(raw) : null });
      const reply = (code, json, headers = {}) => {
        res.writeHead(code, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(json));
      };
      if (url.pathname === `/api/tokens/${KEY}`) return fake.tokensStatus === 200 ? reply(200, TOKENS) : reply(fake.tokensStatus, { message: 'down' });
      if (url.pathname === `/api/incidents/${KEY}`) return fake.incidentsStatus === 200 ? reply(200, fake.incidents) : reply(fake.incidentsStatus, { message: 'down' });
      if (url.pathname === `/api/quote/${KEY}`) {
        const body = JSON.parse(raw);
        if (fake.quoteHook) {
          const r = fake.quoteHook(body);
          if (r) return reply(r.status, r.json, r.headers);
        }
        return reply(200, quoteResponse(body, fake.quoteOver));
      }
      if (url.pathname === `/api/status/${KEY}`) {
        const next = fake.statusQueue.length > 1 ? fake.statusQueue.shift() : fake.statusQueue[0];
        if (!next) return reply(200, { status: 'PENDING_DEPOSIT', swapDetails: {} });
        return reply(next.http ?? 200, next.json ?? { status: next.status, updatedAt: 'now', swapDetails: next.swapDetails ?? {} });
      }
      return reply(404, { message: 'Application key is not assigned', statusCode: 404 });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  fake.url = `http://127.0.0.1:${server.address().port}`;
  fake.close = () => new Promise((r) => server.close(r));
  return fake;
}

export function makeService(fake, opts = {}) {
  const aurora = new AuroraClient({ baseUrl: fake.url, apiKey: KEY, sleep: async () => {}, ...opts.aurora });
  const store = new TipStore(null);
  const clock = { t: Date.parse('2026-10-30T10:00:00Z') };
  const service = new TipService({
    aurora,
    store,
    solana: opts.solana ?? { hasUsdcAccount: async () => true },
    registry: opts.registry ?? null,
    now: () => clock.t,
    config: { maxTipUsd: 50, slippageBps: 100, feeBps: 0, feeRecipient: '', statusMinIntervalMs: 5000, requireCreatorUsdcAccount: true, ...opts.config },
  });
  return { service, aurora, store, clock };
}

export const goodTip = (over = {}) => ({ chain: 'base', symbol: 'ETH', amountUsd: '2', refundTo: EVM, creatorWallet: CREATOR, ...over });
