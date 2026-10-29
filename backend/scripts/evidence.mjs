// Counts real finished tips from the backend's JSONL log. Usage: node scripts/evidence.mjs [data/tips.jsonl]
// A tip counts as evidence only when Aurora reported SUCCESS and gave BOTH an origin-chain and a destination-chain
// explorer link. Nothing is hand-entered, so the headline number cannot include fixtures.
import { readFileSync } from 'node:fs';

const file = process.argv[2] || './data/tips.jsonl';
const quotes = new Map();
const finals = new Map();
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    continue;
  }
  if (e.event === 'quote') quotes.set(e.depositAddress, e);
  if (e.event === 'final') finals.set(e.depositAddress, e);
}

const rows = [];
let refunded = 0;
let failed = 0;
for (const [addr, f] of finals) {
  const q = quotes.get(addr);
  if (!q) continue;
  if (f.stage === 'refunded') refunded++;
  else if (f.stage === 'failed') failed++;
  else if (f.stage === 'arrived' && f.links?.origin?.length && f.links?.destination?.length) {
    rows.push({ chain: q.chain, symbol: q.symbol, delivered: f.amounts?.delivered, usd: f.amounts?.deliveredUsd, creator: q.creatorWallet, origin: f.links.origin[0].url, destination: f.links.destination[0].url });
  }
}

console.log(`quotes created: ${quotes.size}`);
console.log(`REAL TIPS (SUCCESS + both tx links): ${rows.length}`);
console.log(`refunded: ${refunded}   failed: ${failed}`);
const chains = [...new Set(rows.map((r) => r.chain))];
console.log(`source chains with a real tip: ${chains.length ? chains.join(', ') : '-'}`);
for (const r of rows) console.log(`- ${r.chain}/${r.symbol} -> ${r.delivered} USDC (${r.usd} USD)\n    tip:     ${r.origin}\n    arrival: ${r.destination}`);
