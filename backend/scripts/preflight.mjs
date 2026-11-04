// Usage (after AURORA_API_KEY is in an env file):
//   node --env-file=<env file> scripts/preflight.mjs --wallet=0x<tipper> --creator=<creator solana wallet> [--chain=eth|base|arb --symbol=USDC|USDT|ETH --amount=1.04 --mode=send|receive --drill=<token amount>]
// --mode=send: the tipper sends exactly --amount (stablecoins, the default for USDC/USDT); --mode=receive: the creator receives --amount USD (the default for ETH).
// --drill=0.00045: check a deliberately short deposit for a refund test instead of a full tip.
// Run right before proposing a real-money tip: it re-reads the wallet balance, the network fee and Aurora's live quote and prints GO or NO-GO.
import { AuroraClient } from '../src/aurora.js';
import { preflight } from '../src/preflight.js';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const cfg = {
  chain: a.chain ?? 'base',
  symbol: a.symbol ?? 'USDC',
  amountUsd: a.amount ?? '1.04',
  wallet: a.wallet,
  creatorWallet: a.creator,
  sendExact: a.mode ? a.mode !== 'receive' : ['USDC', 'USDT'].includes(a.symbol ?? 'USDC'),
  drillAmount: a.drill,
};
if (!cfg.wallet || !cfg.creatorWallet) {
  console.error('usage: --wallet=<tipper address on the chain> --creator=<creator Solana wallet>');
  process.exit(2);
}
if (!process.env.AURORA_API_KEY) {
  console.error('AURORA_API_KEY is not set (use --env-file)');
  process.exit(2);
}
const aurora = new AuroraClient({ apiKey: process.env.AURORA_API_KEY, baseUrl: process.env.AURORA_BASE_URL || undefined });
try {
  const r = await preflight({ aurora, ...cfg });
  console.log(r.lines.join('\n'));
  console.log(r.go ? '\nGO' : '\nNO-GO:\n- ' + r.problems.join('\n- '));
  process.exit(r.go ? 0 : 1);
} catch (e) {
  console.error('preflight failed:', e.message);
  process.exit(2);
}
