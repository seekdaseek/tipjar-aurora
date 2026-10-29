import { ADDRESS_CHECKS, formatMinor, isSolanaAddress, usdToMinor } from './validate.js';
import { buildRoutes, CHAINS, FAMILY_HINT, DEST } from './routes.js';
import { txLinks } from './explorers.js';

export const SUPPORT_URL = 'https://aurora.dev/intents-support';
const TOKEN_TTL_MS = 5 * 60_000;
const INCIDENT_TTL_MS = 60_000;
const INCIDENT_RETRY_MS = 10_000;

export class TipError extends Error {
  constructor(code, message, http = 400) {
    super(message);
    this.code = code;
    this.http = http;
  }
}

const big = (v) => {
  try {
    return v == null ? null : BigInt(v);
  } catch {
    return null;
  }
};

// Aurora's quote.deadline came back exactly 72 h later than the deadline we requested (observed 2026-10-29,
// unexplained, and whether a deposit after the requested time is honoured is untested). Show the earlier one.
const earlier = (requested, quoted) => {
  const a = Date.parse(requested);
  const b = Date.parse(quoted);
  if (!Number.isFinite(b)) return requested;
  if (!Number.isFinite(a)) return quoted;
  return a <= b ? requested : quoted;
};

// Aurora prices in USD with 12 decimals; the screen shows cents.
const usd2 = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v).toFixed(2) : null);
// A status link can be shared (the #tip= permalink), so the refund address is shown shortened.
const maskAddr = (a) => (typeof a === 'string' && a.length > 16 ? a.slice(0, 8) + '…' + a.slice(-6) : a);
const chainIncident = (list, slug) => list.find((i) => i.scopeType === 'chain' && i.scopeValue === slug);
const tokenIncident = (list, assetId) => list.find((i) => i.scopeType === 'token' && i.scopeValue === assetId);
// Aurora's Shield incidents. A withdrawal pause on the origin chain stalls a refund there, so the chain is not offered.
const pauseNote = (label, i) =>
  i.direction === 'withdraw'
    ? `Aurora has paused withdrawals on ${label}, so a refund there would be stuck until it clears. Pick another chain.`
    : i.direction === 'deposit'
      ? `Aurora has paused deposits on ${label}. Pick another chain.`
      : `${label} is paused by Aurora right now. Pick another chain.`;

export class TipService {
  constructor({ aurora, store, config, solana, registry, now = Date.now }) {
    this.aurora = aurora;
    this.store = store;
    this.cfg = config;
    this.solana = solana;
    this.registry = registry;
    this.now = now;
    this.tokens = null;
    this.tokensAt = 0;
    this.statusCache = new Map(); // depositAddress -> {at, raw, inflight}
    this.incidents = null;
    this.incidentsUntil = 0;
  }

  /** Active Aurora incidents. Fails open: a broken incidents endpoint must not take tipping down; the last known list is kept. */
  async #incidentList() {
    const t = this.now();
    if (this.incidents && t < this.incidentsUntil) return this.incidents;
    try {
      const r = await this.aurora.incidents();
      const all = r?.status === 'incidents' && Array.isArray(r.incidents) ? r.incidents : [];
      this.incidents = all.filter((i) => i && typeof i === 'object' && i.status !== 'resolved' && !i.resolvedAt);
      this.incidentsUntil = t + INCIDENT_TTL_MS;
    } catch {
      this.incidents ??= [];
      this.incidentsUntil = t + INCIDENT_RETRY_MS;
    }
    return this.incidents;
  }

  async #tokenList() {
    if (this.tokens && this.now() - this.tokensAt < TOKEN_TTL_MS) return this.tokens;
    try {
      this.tokens = await this.aurora.tokens();
      this.tokensAt = this.now();
    } catch (e) {
      if (!this.tokens) throw new TipError('aurora_unavailable', 'Cross-chain tipping is temporarily unavailable. Try again in a minute.', 503);
    }
    return this.tokens;
  }

  async routes() {
    const { dest, chains } = buildRoutes(await this.#tokenList());
    const inc = await this.#incidentList();
    const solPaused = !!chainIncident(inc, DEST.chain);
    const paused = [];
    const shown = [];
    for (const c of chains) {
      const hit = chainIncident(inc, c.slug);
      if (hit) {
        paused.push({ key: c.key, label: c.label, reason: pauseNote(c.label, hit) });
        continue;
      }
      const tokens = c.offered.filter((t) => !tokenIncident(inc, t.assetId));
      if (tokens.length) shown.push({ ...c, offered: tokens });
    }
    return {
      destination: { chain: DEST.chain, symbol: DEST.symbol, ready: !!dest && !solPaused && !(dest && tokenIncident(inc, dest.assetId)) },
      maxTipUsd: this.cfg.maxTipUsd,
      chains: shown.map((c) => ({
        key: c.key,
        label: c.label,
        family: c.family,
        addressHint: FAMILY_HINT[c.family],
        minUsd: c.minUsd,
        tokens: c.offered.map((t) => ({ symbol: t.symbol, decimals: t.decimals, priceUsd: t.priceUsd })),
      })),
      paused,
    };
  }

  async createTip({ chain, symbol, amountUsd, refundTo, creatorWallet, sendExact = false } = {}) {
    const { dest, chains } = buildRoutes(await this.#tokenList());
    if (!dest) throw new TipError('route_unavailable', 'USDC on Solana is not available right now.', 503);
    const c = chains.find((x) => x.key === chain);
    const tok = c?.offered.find((t) => t.symbol === symbol);
    if (!c || !tok) throw new TipError('unsupported_route', 'That chain or token is not supported.');
    const inc = await this.#incidentList();
    const hit = chainIncident(inc, c.slug) ?? tokenIncident(inc, tok.assetId);
    if (hit) throw new TipError('chain_paused', pauseNote(c.label, hit), 409);
    if (chainIncident(inc, DEST.chain) || tokenIncident(inc, dest.assetId))
      throw new TipError('route_unavailable', 'USDC payouts on Solana are paused by Aurora right now. Try again later.', 503);

    sendExact = sendExact === true;
    // sendExact: the tipper sends exactly this amount (EXACT_INPUT). Only for stablecoins, where "$X" is also X tokens;
    // for volatile tokens the creator-receives amount (EXACT_OUTPUT) is the only honest way to state a tip.
    if (sendExact && !['USDC', 'USDT'].includes(tok.auroraSymbol)) throw new TipError('send_exact_stable_only', 'Sending an exact amount is only offered for USDC and USDT.');
    const outMinor = usdToMinor(amountUsd, DEST.decimals);
    if (outMinor === null) throw new TipError('bad_amount', 'Enter an amount like 2 or 2.50.');
    if (outMinor < usdToMinor(String(c.minUsd)))
      throw new TipError('below_minimum', `The minimum tip from ${c.label} is $${c.minUsd}. Smaller deposits can get stuck.`);
    if (outMinor > usdToMinor(String(this.cfg.maxTipUsd)))
      throw new TipError('above_maximum', `Tips are capped at $${this.cfg.maxTipUsd} for now.`);

    if (!ADDRESS_CHECKS[c.family]?.(refundTo))
      throw new TipError('bad_refund_address', `That does not look like a valid ${c.label} address. It is where a refund would go, so it must be yours.`);
    if (!isSolanaAddress(creatorWallet)) throw new TipError('bad_creator', 'The creator wallet is not a valid Solana address.');

    if (this.registry) {
      const ok = await this.registry.isRegistered(creatorWallet);
      if (ok === null) throw new TipError('registry_unavailable', 'Could not verify the creator right now. Try again shortly.', 503);
      if (!ok) throw new TipError('unknown_creator', 'That wallet is not a registered Tip Jar creator.', 403);
    }
    if (this.cfg.requireCreatorUsdcAccount && this.solana) {
      const has = await this.solana.hasUsdcAccount(creatorWallet);
      if (has === false)
        throw new TipError('creator_no_usdc_account', 'This creator has not received USDC yet, so there is no USDC account to pay into. They need to receive any USDC once.', 409);
      if (has === null) throw new TipError('solana_unavailable', 'Could not check the creator wallet right now. Try again shortly.', 503);
    }

    const amountMinor = sendExact ? usdToMinor(amountUsd, tok.decimals) : outMinor;
    const deadline = new Date(this.now() + c.deadlineMin * 60_000).toISOString();
    const body = {
      dry: false,
      swapType: sendExact ? 'EXACT_INPUT' : 'EXACT_OUTPUT',
      depositType: 'ORIGIN_CHAIN',
      originAsset: tok.assetId,
      destinationAsset: dest.assetId,
      amount: amountMinor.toString(),
      slippageTolerance: this.cfg.slippageBps,
      refundTo,
      refundType: 'ORIGIN_CHAIN',
      recipient: creatorWallet,
      recipientType: 'DESTINATION_CHAIN',
      deadline,
    };
    if (this.cfg.feeBps > 0) body.appFees = [{ recipient: this.cfg.feeRecipient, fee: this.cfg.feeBps }];

    let res;
    try {
      res = await this.aurora.quote(body);
    } catch (e) {
      if (e.status === 429) throw new TipError('busy', 'Lots of tips right now. Try again in a few seconds.', 429);
      if (e.status === 400) throw new TipError('quote_rejected', `Aurora could not quote this route: ${e.message}`, 422);
      throw new TipError('aurora_unavailable', 'Cross-chain tipping is temporarily unavailable. Try again in a minute.', 503);
    }

    const q = res?.quote;
    const req = res?.quoteRequest;
    // Never show a deposit address for a quote that does not pay the creator exactly as asked.
    if (!q?.depositAddress || req?.recipient !== creatorWallet || req?.refundTo !== refundTo)
      throw new TipError('bad_quote', 'Aurora returned an unusable quote. Nothing was charged. Try again.', 502);
    const outGot = big(q.amountOut);
    if (sendExact) {
      // We tell the tipper to send exactly amountMinor. Refuse a quote that disagrees, or that skims more than 5% on a stable-to-stable route.
      const inGot = big(q.amountIn);
      const floorOk = outGot !== null && outGot * 10n ** BigInt(tok.decimals) * 100n >= amountMinor * 10n ** BigInt(DEST.decimals) * 95n;
      if (inGot !== amountMinor || !floorOk) throw new TipError('bad_quote', 'The quote does not match the amount you chose. Nothing was charged. Try again.', 502);
    } else if (outGot === null || outGot < outMinor) {
      throw new TipError('bad_quote', 'The quote would pay the creator less than the tip. Nothing was charged. Try again.', 502);
    }

    const rec = this.store.addQuote({
      chain: c.key,
      symbol: tok.symbol,
      assetId: tok.assetId,
      decimals: tok.decimals,
      creatorWallet,
      refundTo,
      depositAddress: q.depositAddress,
      depositMemo: q.depositMemo ?? null,
      swapType: body.swapType,
      amountOutMinor: (sendExact ? outGot : outMinor).toString(),
      amountIn: q.amountIn,
      minAmountIn: q.minAmountIn,
      maxAmountIn: q.maxAmountIn ?? null,
      deadline: earlier(deadline, q.deadline),
      timeEstimate: q.timeEstimate ?? null,
      correlationId: res.correlationId ?? null,
    });
    return this.#publicQuote(rec, c, q);
  }

  #publicQuote(rec, c, q) {
    const dec = rec.decimals;
    const fmt = (v) => (big(v) === null ? null : formatMinor(big(v), dec));
    const sym = rec.symbol;
    const minIn = fmt(rec.minAmountIn);
    const maxIn = fmt(rec.maxAmountIn);
    const mem = rec.depositMemo ? ` Include memo ${rec.depositMemo}.` : '';
    return {
      depositAddress: rec.depositAddress,
      depositMemo: rec.depositMemo,
      chain: c.key,
      chainLabel: c.label,
      symbol: sym,
      sendAmount: q.amountInFormatted ?? fmt(rec.amountIn),
      sendAmountUsd: usd2(q.amountInUsd),
      minAmount: minIn,
      maxAmount: maxIn,
      receiveUsdc: formatMinor(big(rec.amountOutMinor), DEST.decimals),
      deadline: rec.deadline,
      timeEstimateSec: rec.timeEstimate,
      qr: c.key === 'btc' && q.amountInFormatted ? `bitcoin:${rec.depositAddress}?amount=${q.amountInFormatted}` : rec.depositAddress,
      requirements:
        `Send only ${sym} on the ${c.label} network to this address.${mem} ` +
        (rec.swapType === 'EXACT_INPUT'
          ? `Send exactly ${q.amountInFormatted ?? fmt(rec.amountIn)} ${sym}`
          : `Send ${q.amountInFormatted ?? fmt(rec.amountIn)} ${sym}` +
            (minIn ? ` (anything from ${minIn} up${maxIn ? ' to ' + maxIn : ''} works; more than the maximum is refunded)` : '')) +
        `. Minimum tip from ${c.label}: $${c.minUsd}. Another asset or another network may be lost.`,
      refundTo: rec.refundTo,
      supportUrl: SUPPORT_URL,
    };
  }

  async tipStatus(depositAddress) {
    const rec = this.store.get(depositAddress);
    if (!rec) throw new TipError('unknown_tip', 'No tip with that deposit address.', 404);
    depositAddress = rec.depositAddress; // canonical spelling (a lowercase permalink finds the same record)
    if (rec.final) return this.derive(rec.final.raw ?? null, rec);

    let entry = this.statusCache.get(depositAddress);
    if (entry && this.now() - entry.at < this.cfg.statusMinIntervalMs) return this.derive(entry.raw, rec);
    if (entry?.inflight) return this.derive(await entry.inflight, rec);

    entry = entry ?? { at: 0, raw: null };
    this.statusCache.set(depositAddress, entry);
    entry.inflight = this.aurora
      .status(depositAddress, rec.depositMemo)
      .then((raw) => {
        entry.raw = raw;
        entry.at = this.now();
        return raw;
      })
      .finally(() => {
        entry.inflight = null;
      });
    let raw;
    try {
      raw = await entry.inflight;
    } catch (e) {
      // 404 before any deposit is normal on some chains; treat as waiting. Anything else: serve last known.
      if (e.status === 404 || e.status === 400) raw = { status: 'PENDING_DEPOSIT', swapDetails: {} };
      else if (entry.raw) raw = entry.raw;
      else throw new TipError('status_unavailable', 'Could not read the tip status right now. Your funds are safe. Retrying.', 503);
    }
    const out = this.derive(raw, rec);
    if (['arrived', 'refunded', 'failed'].includes(out.stage)) {
      this.store.markFinal(depositAddress, { stage: out.stage, auroraStatus: out.auroraStatus, links: out.links, amounts: out.amounts, refund: out.refund, raw: { status: raw.status, swapDetails: raw.swapDetails, updatedAt: raw.updatedAt } });
    }
    return out;
  }

  derive(raw, rec) {
    const status = raw?.status ?? 'PENDING_DEPOSIT';
    const d = raw?.swapDetails ?? {};
    const links = { origin: txLinks(d.originChainTxHashes, rec.chain), destination: txLinks(d.destinationChainTxHashes, DEST.chain) };
    const sym = rec.symbol;
    const expiredAt = rec.deadline ? Date.parse(rec.deadline) : NaN;
    let stage;
    let message;
    let shortfall = null;
    let refund = null;
    switch (status) {
      case 'PENDING_DEPOSIT':
        if (Number.isFinite(expiredAt) && this.now() > expiredAt) {
          stage = 'expired';
          message = 'This tip request expired before a deposit arrived. Nothing was sent, so nothing is lost. Start a new tip.';
        } else {
          stage = 'waiting';
          message = `Waiting for your ${sym}. Send it to the address above.`;
        }
        break;
      case 'KNOWN_DEPOSIT_TX':
        stage = 'seen';
        message = 'Your deposit was seen and is waiting for confirmations.';
        break;
      case 'INCOMPLETE_DEPOSIT': {
        stage = 'incomplete';
        const dep = big(d.depositedAmount);
        const min = big(rec.minAmountIn);
        if (dep !== null && min !== null && dep < min) shortfall = formatMinor(min - dep, rec.decimals);
        message = shortfall
          ? `Received ${d.depositedAmountFormatted ?? formatMinor(dep, rec.decimals)} ${sym}, which is ${shortfall} ${sym} short. Send the rest to the same address before the deadline, or it is refunded after it.`
          : 'The deposit is below the required amount. Send the rest to the same address before the deadline, or it is refunded after it.';
        break;
      }
      case 'PROCESSING':
        stage = 'received';
        message = 'Received. Converting to USDC and sending it to the creator.';
        break;
      case 'SUCCESS':
        stage = 'arrived';
        message = `Arrived. ${d.amountOutFormatted ?? formatMinor(big(rec.amountOutMinor), DEST.decimals)} USDC is in the creator's wallet.`;
        break;
      case 'REFUNDED':
        stage = 'refunded';
        refund = {
          amount: d.refundedAmountFormatted ?? null,
          amountUsd: d.refundedAmountUsd ?? null,
          reason: d.refundReason ?? null,
          to: maskAddr(rec.refundTo),
        };
        message = `Refunded${refund.amount ? ' ' + refund.amount + ' ' + sym : ''} to ${maskAddr(rec.refundTo)}${refund.reason ? ` (${refund.reason})` : ''}.`;
        break;
      case 'FAILED':
        stage = 'failed';
        message = 'The swap failed. If you sent funds they were not delivered. Contact Aurora support with the deposit address and your transaction hash.';
        break;
      default:
        stage = 'waiting';
        message = 'Working on it.';
    }
    return {
      depositAddress: rec.depositAddress,
      route: { chain: rec.chain, chainLabel: CHAINS.find((c) => c.key === rec.chain)?.label ?? rec.chain, symbol: rec.symbol, creator: rec.creatorWallet },
      stage,
      auroraStatus: status,
      updatedAt: raw?.updatedAt ?? null,
      steps: { received: ['seen', 'received', 'arrived'].includes(stage) || (stage === 'refunded' && links.origin.length > 0), arrived: stage === 'arrived' },
      message,
      amounts: {
        deposited: d.depositedAmountFormatted ?? null,
        delivered: d.amountOutFormatted ?? null,
        deliveredUsd: d.amountOutUsd ?? null,
      },
      links,
      refund,
      shortfall,
      deadline: rec.deadline,
      supportUrl: ['failed', 'refunded', 'incomplete', 'expired'].includes(stage) || status === 'FAILED' ? SUPPORT_URL : null,
    };
  }
}
