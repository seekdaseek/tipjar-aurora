// Which source chains and tokens the app offers. Only routes whose assetId also appears in the live
// /api/tokens list are served, so a delisted asset disappears without a code change.

export const DEST = { chain: 'sol', symbol: 'USDC', decimals: 6 };

// family: how the tipper's address is typed. EVM chains share one 0x address, so the app asks once.
export const CHAINS = [
  { key: 'eth', label: 'Ethereum', family: 'evm', slug: 'eth', tokens: ['ETH', 'USDC', 'USDT'], minUsd: 1, deadlineMin: 30 },
  { key: 'base', label: 'Base', family: 'evm', slug: 'base', tokens: ['ETH', 'USDC'], minUsd: 1, deadlineMin: 30 },
  { key: 'arb', label: 'Arbitrum', family: 'evm', slug: 'arb', tokens: ['ETH', 'USDC'], minUsd: 1, deadlineMin: 30 },
  { key: 'op', label: 'Optimism', family: 'evm', slug: 'op', tokens: ['ETH', 'USDC'], minUsd: 1, deadlineMin: 30 },
  { key: 'pol', label: 'Polygon', family: 'evm', slug: 'pol', tokens: ['POL', 'USDC'], minUsd: 1, deadlineMin: 30 },
  { key: 'bsc', label: 'BNB Chain', family: 'evm', slug: 'bsc', tokens: ['BNB', 'USDC', 'USDT'], minUsd: 1, deadlineMin: 30 },
  { key: 'avax', label: 'Avalanche', family: 'evm', slug: 'avax', tokens: ['AVAX', 'USDC'], minUsd: 1, deadlineMin: 30 },
  { key: 'btc', label: 'Bitcoin', family: 'btc', slug: 'btc', tokens: ['BTC'], minUsd: 1, deadlineMin: 120 },
  { key: 'near', label: 'NEAR', family: 'near', slug: 'near', tokens: ['wNEAR', 'USDC'], minUsd: 1, deadlineMin: 30 },
  // Aurora: recommended minimum is $2 on TRON, below that funds can get stuck.
  { key: 'tron', label: 'TRON', family: 'tron', slug: 'tron', tokens: ['TRX', 'USDT'], minUsd: 2, deadlineMin: 30 },
];

export const FAMILY_HINT = {
  evm: 'Your 0x address (one address works on every EVM chain)',
  btc: 'Your Bitcoin address (bc1... or 1... or 3...)',
  near: 'Your NEAR account (name.near or 64 hex chars)',
  tron: 'Your TRON address (T...)',
};

export const displaySymbol = (s) => (s === 'wNEAR' ? 'NEAR' : s);

/** Build the offered routes from a live Aurora token list. */
export function buildRoutes(tokenList) {
  const tokens = tokenList?.tokens ?? [];
  const dest = tokens.find((t) => t.blockchain === DEST.chain && t.symbol === DEST.symbol);
  if (!dest) return { dest: null, chains: [] };
  const chains = [];
  for (const c of CHAINS) {
    const offered = [];
    for (const sym of c.tokens) {
      const t = tokens.find((x) => x.blockchain === c.slug && x.symbol === sym);
      if (t) offered.push({ symbol: displaySymbol(sym), auroraSymbol: sym, assetId: t.assetId, decimals: t.decimals, priceUsd: t.price });
    }
    if (offered.length) chains.push({ ...c, offered });
  }
  return { dest: { assetId: dest.assetId, decimals: dest.decimals }, chains };
}
