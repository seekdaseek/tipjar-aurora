// Run right before a real-money tip is proposed. Re-reads everything that can have changed:
// the wallet's on-chain balances, Aurora's live minimum (via a dry quote), and the amount the quote says to send.
// It never quotes more than the wallet holds and never creates a deposit address (dry: true).
import { formatMinor, usdToMinor } from './validate.js';

export const RPC = { base: 'https://mainnet.base.org' };
const GAS_FLOOR_WEI = 20_000_000_000_000n; // 0.00002 ETH: an ERC-20 transfer on Base costs a small fraction of this

async function rpcCall(fetchImpl, url, method, params) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  const json = await res.json();
  if (json.error || typeof json.result !== 'string') throw new Error(`rpc ${method} failed`);
  return BigInt(json.result);
}

export async function preflight({ aurora, fetchImpl = fetch, chain, symbol, amountUsd, wallet, creatorWallet, sendExact = true, rpcUrl, now = () => new Date() }) {
  const lines = [];
  const problems = [];
  const url = rpcUrl ?? RPC[chain];
  if (!url) throw new Error(`no RPC configured for ${chain}`);

  const list = await aurora.tokens();
  const origin = list.tokens.find((t) => t.blockchain === chain && t.symbol === symbol);
  const dest = list.tokens.find((t) => t.blockchain === 'sol' && t.symbol === 'USDC');
  if (!origin || !dest) throw new Error('route not in the live Aurora token list');
  if (!origin.contractAddress) throw new Error('origin token has no contract address');

  // 1. wallet, on chain, now
  const data = '0x70a08231' + wallet.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const tokenBal = await rpcCall(fetchImpl, url, 'eth_call', [{ to: origin.contractAddress, data }, 'latest']);
  const gasBal = await rpcCall(fetchImpl, url, 'eth_getBalance', [wallet, 'latest']);
  lines.push(`wallet ${wallet} holds ${formatMinor(tokenBal, origin.decimals)} ${symbol} and ${formatMinor(gasBal, 18)} ETH on ${chain} (read ${now().toISOString()})`);

  // 2. live minimum and the amount to send, from a dry quote (no deposit address is created)
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
  lines.push(`Aurora live minimum: ${formatMinor(min, origin.decimals)} ${symbol}; quote says send ${formatMinor(toSend, origin.decimals)} ${symbol}${q.maxAmountIn ? ` (max ${formatMinor(BigInt(q.maxAmountIn), origin.decimals)})` : ''}; creator receives about ${formatMinor(out, dest.decimals)} USDC; estimate ${q.timeEstimate ?? '?'} s`);

  // 3. verdict
  if (toSend > tokenBal) problems.push(`quote needs ${formatMinor(toSend, origin.decimals)} ${symbol}, wallet holds ${formatMinor(tokenBal, origin.decimals)}`);
  if (toSend < min) problems.push(`amount ${formatMinor(toSend, origin.decimals)} is below Aurora's live minimum ${formatMinor(min, origin.decimals)}`);
  if (gasBal < GAS_FLOOR_WEI) problems.push(`not enough ETH for gas (${formatMinor(gasBal, 18)})`);
  if (out < (toSend * 10n ** BigInt(dest.decimals) * 95n) / (10n ** BigInt(origin.decimals) * 100n)) problems.push('creator would receive under 95% of the amount sent');

  return {
    go: problems.length === 0,
    problems,
    lines,
    numbers: { send: formatMinor(toSend, origin.decimals), min: formatMinor(min, origin.decimals), receive: formatMinor(out, dest.decimals), balance: formatMinor(tokenBal, origin.decimals), eth: formatMinor(gasBal, 18) },
  };
}
