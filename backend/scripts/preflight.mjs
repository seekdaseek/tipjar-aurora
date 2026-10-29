// Usage (after the key exists in $ENVSRC):
//   node --env-file=$ENVSRC scripts/preflight.mjs
// Defaults are the first real tip: 1.04 USDC on Base from Operator's wallet to USDC on Solana (cj7), refund to the same wallet.
import { AuroraClient } from '../src/aurora.js';
import { preflight } from '../src/preflight.js';

const a = Object.fromEntries(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const cfg = {
  chain: a.chain ?? 'base',
  symbol: a.symbol ?? 'USDC',
  amountUsd: a.amount ?? '1.04',
  wallet: a.wallet ?? '0xA11CE00000000000000000000000000000000B01',
  creatorWallet: a.creator ?? '4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7',
  sendExact: a.mode !== 'receive',
};
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
