import {Quote} from './api';

/** Chain ids of the EVM chains the app offers (the wallet is asked to switch to the quote's chain before paying). */
export const EVM_CHAIN_IDS: Record<string, number> = {eth: 1, base: 8453, arb: 42161, op: 10, pol: 137, bsc: 56, avax: 43114};
/** The native coin of each of those chains. Only native-coin quotes can be paid from the wallet button for now (ERC-20 transfers are not built). */
const NATIVE_COIN: Record<string, string> = {eth: 'ETH', base: 'ETH', arb: 'ETH', op: 'ETH', pol: 'POL', bsc: 'BNB', avax: 'AVAX'};

export type PayRequest = {chainIdHex: string; tx: {from: string; to: string; value: string}};

/** "0.000438573038034668" -> hex wei, exactly (no floating point). null for anything but a positive plain decimal with at most 18 places. */
export function toWeiHex(decimal: string): string | null {
  if (!/^\d+(\.\d{1,18})?$/.test(decimal)) return null;
  const [whole, frac = ''] = decimal.split('.');
  const wei = BigInt(whole + frac.padEnd(18, '0'));
  return wei > BigInt(0) ? '0x' + wei.toString(16) : null;
}

export function canPayWithWallet(q: Pick<Quote, 'chain' | 'symbol' | 'depositAddress' | 'depositMemo' | 'sendAmount'>): boolean {
  return (
    q.chain in EVM_CHAIN_IDS &&
    q.symbol === NATIVE_COIN[q.chain] &&
    !q.depositMemo &&
    /^0x[0-9a-fA-F]{40}$/.test(q.depositAddress) &&
    toWeiHex(q.sendAmount) !== null
  );
}

/** The wallet requests for a quote: switch to its chain, then send exactly the quoted amount to the deposit address. No data and no gas fields: the wallet prices it. */
export function buildPayRequest(q: Quote, from: string): PayRequest | null {
  if (!canPayWithWallet(q)) return null;
  return {chainIdHex: '0x' + EVM_CHAIN_IDS[q.chain].toString(16), tx: {from, to: q.depositAddress, value: toWeiHex(q.sendAmount)!}};
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** An error with a code the screen turns into a plain message; thrown before anything is sent. */
export const payError = (code: 'CHAIN_MISMATCH' | 'QUOTE_MISMATCH' | 'TX_MISMATCH', message: string) => Object.assign(new Error(message), {code});

/**
 * The quote must agree with itself before money moves: its QR payload is the deposit address, and the amount to send lies within the
 * minimum and maximum the backend gave with it. null when consistent, else why not.
 */
export function checkQuoteForWallet(q: Quote): string | null {
  if (!sameAddress(q.qr ?? '', q.depositAddress)) return 'the quote\'s QR address differs from its deposit address';
  const amount = toWeiHex(q.sendAmount);
  if (amount === null) return 'the quote\'s amount is not a valid amount';
  if (q.minAmount) {
    const min = toWeiHex(q.minAmount);
    if (min === null || BigInt(amount) < BigInt(min)) return 'the amount to send is below the quote\'s minimum';
  }
  if (q.maxAmount) {
    const max = toWeiHex(q.maxAmount);
    if (max === null || BigInt(amount) > BigInt(max)) return 'the amount to send is above the quote\'s maximum';
  }
  return null;
}

/** The transaction about to be sent must be exactly the quote's: its deposit address, its amount in wei, and only from/to/value. null when it is. */
export function verifyPayTx(q: Quote, tx: PayRequest['tx']): string | null {
  const keys = Object.keys(tx).sort().join(',');
  if (keys !== 'from,to,value') return 'the transaction has unexpected fields';
  if (!sameAddress(tx.to, q.depositAddress)) return 'the transaction address is not the quote\'s deposit address';
  if (tx.value !== toWeiHex(q.sendAmount)) return 'the transaction amount is not the quote\'s amount';
  return null;
}

/** Plain-language message for an EIP-1193 provider error. */
export function describeWalletError(e: any): string {
  const code = e?.code;
  if (code === 'CHAIN_MISMATCH') return 'Your wallet is on a different network than this tip needs. Switch it to the network shown above and try again. Nothing was sent.';
  if (code === 'QUOTE_MISMATCH' || code === 'TX_MISMATCH') return 'The tip details did not check out, so nothing was sent. Get a new deposit address, or copy the address below and pay from any wallet.';
  if (code === 4001 || code === 'ACTION_REJECTED') return 'You declined it in your wallet. Nothing was sent.';
  if (code === 4902) return 'Your wallet does not have this network yet. Add it in the wallet, then try again.';
  if (code === -32002) return 'Your wallet already has a request open. Open it and finish or reject it, then try again.';
  if (code === 4100) return 'Your wallet is locked or has not shared an account. Unlock it and try again.';
  return 'The wallet could not send this. Nothing was sent. You can still copy the address and pay from any wallet.';
}
