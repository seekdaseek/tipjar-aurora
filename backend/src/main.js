// Entry point (kept separate from server.js: under PM2 fork mode argv[1] is PM2's container,
// so an "is main module" check would never start the server).
import { AuroraClient } from './aurora.js';
import { CreatorRegistry, SolanaChecker } from './checks.js';
import { createApp } from './server.js';
import { TipService } from './service.js';
import { TipStore } from './store.js';

const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

const config = {
  maxTipUsd: num(env.MAX_TIP_USD, 50),
  slippageBps: num(env.SLIPPAGE_BPS, 100),
  feeBps: num(env.TIP_FEE_BPS, 0), // a tip jar should not skim; a creator platform can set its own
  feeRecipient: env.FEE_RECIPIENT || '',
  statusMinIntervalMs: num(env.STATUS_MIN_INTERVAL_MS, 5000), // Aurora: poll every 5-10 s
  requireCreatorUsdcAccount: env.REQUIRE_CREATOR_USDC_ACCOUNT !== '0',
};
if (config.feeBps > 0 && !config.feeRecipient) throw new Error('TIP_FEE_BPS > 0 needs FEE_RECIPIENT');
if (!env.AURORA_API_KEY) throw new Error('AURORA_API_KEY is not set');

const service = new TipService({
  aurora: new AuroraClient({ apiKey: env.AURORA_API_KEY, baseUrl: env.AURORA_BASE_URL || undefined }),
  store: new TipStore(env.DATA_FILE || './data/tips.jsonl'),
  config,
  solana: new SolanaChecker({ rpcUrl: env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com' }),
  registry: env.CREATOR_REGISTRY_URL ? new CreatorRegistry({ url: env.CREATOR_REGISTRY_URL }) : null,
});

const port = num(env.PORT, 3037);
createApp({ service, trustProxy: env.TRUST_PROXY === '1' }).listen(port, '127.0.0.1', () => console.log(`tipjar-aurora listening on 127.0.0.1:${port}`));
