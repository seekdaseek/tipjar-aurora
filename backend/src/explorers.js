// Aurora's status returns tx hashes with explorerUrl "" (observed 2026-10-29, Base -> Solana), so the explorer link is built here
// from the chain and the hash. Only Base and Solana are verified live; the other templates are the chains' standard explorers.
const HEX64 = /^[0-9a-fA-F]{64}$/;
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;
const B58_SOL = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const B58_NEAR = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/;

export const EXPLORERS = {
  eth: { url: 'https://etherscan.io/tx/', ok: EVM_HASH },
  base: { url: 'https://basescan.org/tx/', ok: EVM_HASH },
  arb: { url: 'https://arbiscan.io/tx/', ok: EVM_HASH },
  op: { url: 'https://optimistic.etherscan.io/tx/', ok: EVM_HASH },
  pol: { url: 'https://polygonscan.com/tx/', ok: EVM_HASH },
  bsc: { url: 'https://bscscan.com/tx/', ok: EVM_HASH },
  avax: { url: 'https://snowtrace.io/tx/', ok: EVM_HASH },
  btc: { url: 'https://mempool.space/tx/', ok: HEX64 },
  near: { url: 'https://nearblocks.io/txns/', ok: B58_NEAR },
  tron: { url: 'https://tronscan.org/#/transaction/', ok: HEX64 },
  sol: { url: 'https://explorer.solana.com/tx/', ok: B58_SOL },
};

/** Links for a list of {hash, explorerUrl} from Aurora: its own https URL if it gave one, else a built one for a well-formed hash. */
export function txLinks(arr, chainKey) {
  const ex = EXPLORERS[chainKey];
  return (Array.isArray(arr) ? arr : [])
    .slice(0, 5)
    .map((x) => {
      const hash = String(x?.hash ?? '').slice(0, 128);
      const given = typeof x?.explorerUrl === 'string' && x.explorerUrl.startsWith('https://') ? x.explorerUrl.slice(0, 300) : null;
      if (given) return { hash, url: given };
      if (ex && ex.ok.test(hash)) return { hash, url: ex.url + hash };
      return null;
    })
    .filter(Boolean);
}
