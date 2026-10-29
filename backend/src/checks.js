// Two guards that run before any quote is requested: the creator must be a registered Tip Jar creator,
// and (by default) must already hold a USDC token account on Solana so the payout has somewhere to land.

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export class SolanaChecker {
  constructor({ rpcUrl, fetchImpl = fetch, now = Date.now, negativeTtlMs = 60_000 }) {
    this.rpcUrl = rpcUrl;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.negativeTtlMs = negativeTtlMs;
    this.positive = new Set();
    this.negative = new Map(); // owner -> checkedAt
  }
  /** true / false, or null when the RPC could not answer (caller decides). */
  async hasUsdcAccount(owner) {
    if (this.positive.has(owner)) return true;
    const t = this.negative.get(owner);
    if (t && this.now() - t < this.negativeTtlMs) return false;
    let json;
    try {
      const res = await this.fetchImpl(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [owner, { mint: USDC_MINT }, { encoding: 'base64', commitment: 'confirmed' }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      json = await res.json();
    } catch {
      return null;
    }
    if (!Array.isArray(json?.result?.value)) return null;
    if (json.result.value.length > 0) {
      this.positive.add(owner);
      return true;
    }
    this.negative.set(owner, this.now());
    return false;
  }
}

export class CreatorRegistry {
  constructor({ url, fetchImpl = fetch, now = Date.now, ttlMs = 60_000 }) {
    this.url = url;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.ttlMs = ttlMs;
    this.wallets = null;
    this.at = 0;
  }
  /** true / false, or null when the registry is unreachable (callers fail closed). */
  async isRegistered(wallet) {
    if (!this.wallets || this.now() - this.at > this.ttlMs) {
      try {
        const res = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error('registry http ' + res.status);
        const data = await res.json();
        this.wallets = new Set(Object.values(data ?? {}).map((c) => c?.wallet).filter(Boolean));
        this.at = this.now();
      } catch {
        if (!this.wallets) return null;
      }
    }
    return this.wallets.has(wallet);
  }
}
