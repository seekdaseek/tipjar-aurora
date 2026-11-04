// Run right before a real-money tip is proposed. Re-reads everything that can have changed:
// the wallet's on-chain balances, Aurora's live quote (a dry quote), the amount the quote says to send, and the network fee.
// It never quotes more than the wallet holds and never creates a deposit address (dry: true).
// Handles ERC-20 origins (USDC/USDT) and native ETH on Ethereum, Base and Arbitrum. An optional "drill" amount checks a
// deliberately short deposit for a refund test.
import { formatMinor, usdToMinor } from './validate.js';

export const RPC = {
  eth: 'https://ethereum-rpc.publicnode.com',
  base: 'https://mainnet.base.org',
  arb: 'https://arb1.arbitrum.io/rpc',
};
const GAS_FLOOR_WEI = 20_000_000_000_000n; // 0.00002 ETH: an ERC-20 transfer on Base costs a small fraction of this
const NATIVE_TRANSFER_GAS = 21_000n;
const GAS_SAFETY = 3n; // the price can move in the minutes before the send, and L2s add an L1 data fee
const DRILL_FLOOR_USD = 1; // Aurora's recommended minimum deposit; below it a deposit may not be returned automatically

async function rpcCall(fetchImpl, url, method, params) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  const json = await res.json();
  if (json.error || typeof json.result !== 'string') throw new Error(`rpc ${method} failed`);
  return BigInt(json.result);
}

export async function preflight({ aurora, fetchImpl = fetch, chain, symbol, amountUsd, wallet, creatorWallet, sendExact = true, drillAmount, rpcUrl, now = () => new Date() }) {
  const lines = [];
  const problems = [];
  const url = rpcUrl ?? RPC[chain];
  if (!url) throw new Error(`no RPC configured for ${chain}`);

  const list = await aurora.tokens();
  const origin = list.tokens.find((t) => t.blockchain === chain && t.symbol === symbol);
  const dest = list.tokens.find((t) => t.blockchain === 'sol' && t.symbol === 'USDC');
  if (!origin || !dest) throw new Error('route not in the live Aurora token list');
  const native = symbol === 'ETH' && !origin.contractAddress;
  if (!origin.contractAddress && !native) throw new Error('origin token has no contract address');

  // 1. wallet, on chain, now
  const gasBal = await rpcCall(fetchImpl, url, 'eth_getBalance', [wallet, 'latest']);
  let tokenBal = gasBal;
  if (!native) {
    const data = '0x70a08231' + wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    tokenBal = await rpcCall(fetchImpl, url, 'eth_call', [{ to: origin.contractAddress, data }, 'latest']);
  }
  lines.push(`wallet ${wallet} holds ${formatMinor(tokenBal, origin.decimals)} ${symbol}${native ? '' : ` and ${formatMinor(gasBal, 18)} ETH`} on ${chain} (read ${now().toISOString()})`);

  // 2. network fee to send (native sends pay gas out of the same balance)
  let reserve = GAS_FLOOR_WEI;
  let gasEth = null;
  let gasUsd = null;
  if (native) {
    const gasPrice = await rpcCall(fetchImpl, url, 'eth_gasPrice', []);
    const cost = gasPrice * NATIVE_TRANSFER_GAS;
    gasEth = formatMinor(cost, 18);
    gasUsd = origin.price ? ((Number(cost) / 1e18) * origin.price).toFixed(4) : null;
    reserve = cost * GAS_SAFETY > GAS_FLOOR_WEI ? cost * GAS_SAFETY : GAS_FLOOR_WEI;
    lines.push(`network fee to send about ${gasEth} ETH${gasUsd ? ` (about ${gasUsd} USD)` : ''} at ${(Number(gasPrice) / 1e9).toFixed(4)} gwei; kept in reserve: ${formatMinor(reserve, 18)} ETH`);
  }

  // 3. live quote and the amount to send, from a dry quote (no deposit address is created)
  const amountMinor = sendExact ? usdToMinor(amountUsd, origin.decimals) : usdToMinor(amountUsd, dest.decimals);
  if (amountMinor === null) throw new Error('bad amount');
  const dry = await aurora.quote({
    dry: true,
    swapType: sendExact ? 'EXACT_INPUT' : 'EXACT_OUTPUT',
    depositType: 'ORIGIN_CHAIN',
    originAsset: origin.assetId,
    destinationAsset: dest.assetId,
    amount: amountMinor.toString(),
    slippageTolerance: 100,
    refundTo: wallet,
    refundType: 'ORIGIN_CHAIN',
    recipient: creatorWallet,
    recipientType: 'DESTINATION_CHAIN',
  });
  const q = dry.quote;
  const toSend = BigInt(q.amountIn);
  const min = BigInt(q.minAmountIn);
  const out = BigInt(q.amountOut);
  lines.push(`Aurora quote: minimum ${formatMinor(min, origin.decimals)} ${symbol}; quote says send ${formatMinor(toSend, origin.decimals)} ${symbol}${q.maxAmountIn ? ` (max ${formatMinor(BigInt(q.maxAmountIn), origin.decimals)})` : ''}; creator receives about ${formatMinor(out, dest.decimals)} USDC; estimate ${q.timeEstimate ?? '?'} s`);

  // 4. verdict
  let drill = null;
  if (drillAmount !== undefined) {
    const drillMinor = usdToMinor(String(drillAmount), origin.decimals);
    if (drillMinor === null) throw new Error('bad drill amount');
    const drillUsd = origin.price ? (Number(drillMinor) / 10 ** origin.decimals) * origin.price : null;
    drill = { send: formatMinor(drillMinor, origin.decimals), usd: drillUsd === null ? null : drillUsd.toFixed(2), percentOfMinimum: Number((drillMinor * 1000n) / (min || 1n)) / 10 };
    lines.push(`refund drill: send ${drill.send} ${symbol}${drill.usd ? ` (about ${drill.usd} USD)` : ''}, ${drill.percentOfMinimum}% of the minimum, so Aurora should report a shortfall and refund it`);
    if (drillMinor >= min) problems.push(`drill amount ${drill.send} is not below the minimum ${formatMinor(min, origin.decimals)}: nothing would be refunded`);
    if (drillUsd !== null && drillUsd < DRILL_FLOOR_USD) problems.push(`drill amount is worth ${drill.usd} USD, under the ${DRILL_FLOOR_USD} USD floor below which a deposit may not be returned`);
    const need = native ? drillMinor + reserve : drillMinor;
    if (need > tokenBal) problems.push(`drill needs ${formatMinor(need, origin.decimals)} ${symbol} including the fee reserve, wallet holds ${formatMinor(tokenBal, origin.decimals)}`);
  } else {
    const need = native ? toSend + reserve : toSend;
    if (need > tokenBal) problems.push(`quote needs ${formatMinor(native ? need : toSend, origin.decimals)} ${symbol}${native ? ' including the fee reserve' : ''}, wallet holds ${formatMinor(tokenBal, origin.decimals)}`);
    if (toSend < min) problems.push(`amount ${formatMinor(toSend, origin.decimals)} is below Aurora's live minimum ${formatMinor(min, origin.decimals)}`);
  }
  if (!native && gasBal < GAS_FLOOR_WEI) problems.push(`not enough ETH for gas (${formatMinor(gasBal, 18)})`);
  if (native) {
    const inUsd = Number(q.amountInUsd);
    if (Number.isFinite(inUsd) && inUsd > 0 && Number(out) / 10 ** dest.decimals < inUsd * 0.95) problems.push('creator would receive under 95% of the amount sent');
  } else if (out < (toSend * 10n ** BigInt(dest.decimals) * 95n) / (10n ** BigInt(origin.decimals) * 100n)) problems.push('creator would receive under 95% of the amount sent');

  return {
    go: problems.length === 0,
    problems,
    lines,
    numbers: { send: formatMinor(toSend, origin.decimals), min: formatMinor(min, origin.decimals), receive: formatMinor(out, dest.decimals), balance: formatMinor(tokenBal, origin.decimals), eth: formatMinor(gasBal, 18), gasEth, gasUsd },
    drill,
  };
}
