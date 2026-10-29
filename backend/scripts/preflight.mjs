// Usage (after AURORA_API_KEY is in an env file):
//   node --env-file=<env file> scripts/preflight.mjs --wallet=0x<tipper> --creator=<creator solana wallet> [--chain=base --symbol=USDC --amount=1.04 --mode=send|receive]
// Run right before proposing a real-money tip: it re-reads the wallet balance and Aurora's live minimum and prints GO or NO-GO.
import { AuroraClient } from '../src/aurora.js';
import { preflight } from '../src/preflight.js';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const cfg = {
  chain: a.chain ?? 'base',
  symbol: a.symbol ?? 'USDC',
  amountUsd: a.amount ?? '1.04',
  wallet: a.wallet,
  creatorWallet: a.creator,
  sendExact: a.mode !== 'receive',
};
if (!cfg.wallet || !cfg.creator) {
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
