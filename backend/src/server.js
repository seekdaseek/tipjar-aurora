import { createServer } from 'node:http';
import { TipError } from './service.js';

class Limiter {
  constructor(max, windowMs, now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }
  allow(key) {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
    return true;
  }
}

const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
  res.end(body);
};

export function createApp({ service, trustProxy = false, now = Date.now, startedAt = Date.now(), tipLimit = 20, statusLimit = 120 }) {
  const tipLimiter = new Limiter(tipLimit, 60_000, now); // quotes per minute per client
  const statusLimiter = new Limiter(statusLimit, 60_000, now);
  const clientKey = (req) => (trustProxy && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress || 'unknown';

  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > 8192) {
          reject(new TipError('too_large', 'Request too large.', 413));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(new TipError('bad_json', 'Body must be JSON.'));
        }
      });
      req.on('error', () => reject(new TipError('bad_request', 'Bad request.')));
    });

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const key = clientKey(req);
      if (req.method === 'OPTIONS') return send(res, 204, {});
      if (req.method === 'GET' && url.pathname === '/health')
        return send(res, 200, { ok: true, uptimeSec: Math.round((now() - startedAt) / 1000) });
      if (req.method === 'GET' && url.pathname === '/api/routes') return send(res, 200, await service.routes());
      if (req.method === 'POST' && url.pathname === '/api/tip') {
        if (!tipLimiter.allow(key)) return send(res, 429, { error: { code: 'rate_limited', message: 'Too many tips from this device. Wait a minute.' } });
        return send(res, 200, await service.createTip(await readJson(req)));
      }
      const m = url.pathname.match(/^\/api\/tip\/([A-Za-z0-9._:-]{8,128})$/);
      if (req.method === 'GET' && m) {
        if (!statusLimiter.allow(key)) return send(res, 429, { error: { code: 'rate_limited', message: 'Slow down.' } });
        return send(res, 200, await service.tipStatus(m[1]));
      }
      return send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
    } catch (e) {
      if (e instanceof TipError) return send(res, e.http, { error: { code: e.code, message: e.message } });
      console.error('unhandled', e?.name, e?.message); // never log request URLs: they can carry the API key
      return send(res, 500, { error: { code: 'internal', message: 'Something went wrong.' } });
    }
  });
}
