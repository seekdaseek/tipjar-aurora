import {TIPS_API} from '../config';

export type RouteToken = {symbol: string; decimals: number; priceUsd: number};
export type RouteChain = {key: string; label: string; family: 'evm' | 'btc' | 'near' | 'tron'; addressHint: string; minUsd: number; tokens: RouteToken[]};
export type Routes = {destination: {chain: string; symbol: string; ready: boolean}; maxTipUsd: number; chains: RouteChain[]};

export type Quote = {
  depositAddress: string; depositMemo: string | null; chain: string; chainLabel: string; symbol: string;
  sendAmount: string; sendAmountUsd: string | null; minAmount: string | null; maxAmount: string | null;
  receiveUsdc: string; deadline: string; timeEstimateSec: number | null; qr: string; requirements: string;
  refundTo: string; supportUrl: string;
};

export type Stage = 'waiting' | 'seen' | 'received' | 'arrived' | 'incomplete' | 'refunded' | 'failed' | 'expired';
export type Link = {hash: string; url: string};
export type TipStatus = {
  depositAddress: string; route: {chain: string; chainLabel: string; symbol: string; creator: string}; stage: Stage; auroraStatus: string; message: string;
  steps: {received: boolean; arrived: boolean};
  amounts: {deposited: string | null; delivered: string | null; deliveredUsd: string | null};
  links: {origin: Link[]; destination: Link[]};
  refund: {amount: string | null; amountUsd: string | null; reason: string | null; to: string} | null;
  shortfall: string | null; deadline: string; supportUrl: string | null;
};

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(TIPS_API + path, {...init, headers: {'content-type': 'application/json'}});
  } catch {
    throw new ApiError('network', 'No connection. Check your internet and try again.');
  }
  let json: any = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) throw new ApiError(json?.error?.code ?? 'http_' + res.status, json?.error?.message ?? 'Something went wrong. Try again.');
  return json as T;
}

export const getRoutes = () => call<Routes>('/api/routes');
export const createTip = (b: {chain: string; symbol: string; amountUsd: string; refundTo: string; creatorWallet: string; sendExact?: boolean}) =>
  call<Quote>('/api/tip', {method: 'POST', body: JSON.stringify(b)});
export const getStatus = (depositAddress: string) => call<TipStatus>('/api/tip/' + encodeURIComponent(depositAddress));
