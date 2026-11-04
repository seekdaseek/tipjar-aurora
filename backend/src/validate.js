// Address and amount validation. A wrong refund address loses the tipper's money,
// so checksummed formats are checked for real (base58check, bech32/bech32m).
import { createHash } from 'node:crypto';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58decode(s) {
  if (typeof s !== 'string' || s.length === 0) return null;
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

const sha256 = (b) => createHash('sha256').update(b).digest();

function base58check(s) {
  const raw = base58decode(s);
  if (!raw || raw.length < 5) return null;
  const body = raw.subarray(0, raw.length - 4);
  const sum = raw.subarray(raw.length - 4);
  const want = sha256(sha256(body)).subarray(0, 4);
  return want.every((v, i) => v === sum[i]) ? body : null;
}

export function isSolanaAddress(s) {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
  const raw = base58decode(s);
  return !!raw && raw.length === 32;
}

export function isEvmAddress(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

export function isTronAddress(s) {
  const body = typeof s === 'string' && s.length === 34 ? base58check(s) : null;
  return !!body && body.length === 21 && body[0] === 0x41;
}

const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Polymod(values) {
  const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= gen[i];
  }
  return chk >>> 0;
}
function bech32Valid(addr) {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return false;
  const a = addr.toLowerCase();
  const pos = a.lastIndexOf('1');
  if (pos < 1 || pos + 7 > a.length || a.length > 90) return false;
  const hrp = a.slice(0, pos);
  const data = [];
  for (const ch of a.slice(pos + 1)) {
    const i = BECH32.indexOf(ch);
    if (i < 0) return false;
    data.push(i);
  }
  const hrpExp = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  const poly = bech32Polymod(hrpExp.concat(data));
  const witnessVersion = data[0];
  return witnessVersion === 0 ? poly === 1 : poly === 0x2bc830a3;
}

export function isBtcAddress(s) {
  if (typeof s !== 'string') return false;
  if (/^bc1/i.test(s)) return bech32Valid(s);
  if (/^[13]/.test(s)) {
    const body = base58check(s);
    return !!body && body.length === 21 && (body[0] === 0x00 || body[0] === 0x05);
  }
  return false;
}

export function isNearAccount(s) {
  if (typeof s !== 'string' || s.length < 2 || s.length > 64) return false;
  if (/^[0-9a-f]{64}$/.test(s)) return true;
  return /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(s);
}

export const ADDRESS_CHECKS = {
  evm: isEvmAddress,
  btc: isBtcAddress,
  near: isNearAccount,
  tron: isTronAddress,
  sol: isSolanaAddress,
};

/** "2", "2.5", "2.50" -> 2500000n (USDC has 6 decimals). Null when malformed. */
/** True when `address` is the origin token's own contract/account (e.g. the USDC contract, wrap.near): a refund sent there is lost,
 *  and Aurora answers 400 for it (observed 2026-11-04). `tok.contract` comes from the live token list; NEAR tokens are accounts named in the assetId. */
export function isTokenContract(address, tok) {
  if (typeof address !== 'string' || !tok) return false;
  const a = address.toLowerCase();
  if (tok.contract && a === String(tok.contract).toLowerCase()) return true;
  const m = /^nep141:([a-z0-9._-]+)$/.exec(tok.assetId ?? '');
  return !!m && a === m[1];
}

export function usdToMinor(s, decimals = 6) {
  if (typeof s !== 'string' || !/^\d{1,6}(\.\d{1,6})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0'));
}

export function formatMinor(minor, decimals) {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`;
}
