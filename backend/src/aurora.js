// Thin client for the Aurora Intents Swap API (https://docs.intents.aurora.dev).
// The API key is a path segment, so no error, log line or thrown message may ever carry the URL.

export class AuroraError extends Error {
  constructor(status, message, retryAfter) {
    super(message);
    this.name = 'AuroraError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AuroraClient {
  constructor({ baseUrl = 'https://intents-api.aurora.dev', apiKey, fetchImpl = fetch, sleep = defaultSleep, maxAttempts = 3, maxWaitMs = 12000, timeoutMs = 15000 }) {
    if (!apiKey) throw new Error('AURORA_API_KEY is required');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.maxAttempts = maxAttempts;
    this.maxWaitMs = maxWaitMs;
    this.timeoutMs = timeoutMs;
    this.calls = { tokens: 0, quote: 0, status: 0 };
  }

  async #request(kind, method, path, { query, body } = {}) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const url = `${this.baseUrl}${path}/${encodeURIComponent(this.apiKey)}${qs}`;
    for (let attempt = 1; ; attempt++) {
      this.calls[kind] = (this.calls[kind] || 0) + 1;
      let res;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        // network error or timeout: message deliberately generic (the cause can embed the URL)
        throw new AuroraError(0, 'Aurora API unreachable');
      }
      if (res.status === 429) {
        // Docs: honour Retry-After, back off with jitter; rejected requests still count toward the hourly quota.
        const retryAfter = Number(res.headers.get('retry-after')) || 1;
        if (attempt >= this.maxAttempts || retryAfter * 1000 > this.maxWaitMs) {
          throw new AuroraError(429, 'Aurora rate limit reached', retryAfter);
        }
        await this.sleep(retryAfter * 1000 + Math.floor(Math.random() * 400));
        continue;
      }
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* non-JSON body */
      }
      if (!res.ok) {
        const msg = typeof json?.message === 'string' ? json.message : `Aurora API error ${res.status}`;
        throw new AuroraError(res.status, msg.slice(0, 300));
      }
      return json;
    }
  }

  tokens() {
    return this.#request('tokens', 'GET', '/api/tokens');
  }
  quote(body) {
    return this.#request('quote', 'POST', '/api/quote', { body });
  }
  status(depositAddress, depositMemo) {
    const query = { depositAddress };
    if (depositMemo) query.depositMemo = depositMemo;
    return this.#request('status', 'GET', '/api/status', { query });
  }
}
