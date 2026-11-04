import {Stage, TipStatus} from './api';

export const TERMINAL: Stage[] = ['arrived', 'refunded', 'failed', 'expired'];
export const isTerminal = (s: Stage) => TERMINAL.includes(s);

export type StepState = 'todo' | 'active' | 'done' | 'bad';

/** The three rows the tipper sees: deposit -> received -> arrived. */
export function stepStates(st: TipStatus | null): [StepState, StepState, StepState] {
  const stage: Stage = st?.stage ?? 'waiting';
  if (stage === 'arrived') return ['done', 'done', 'done'];
  if (stage === 'refunded') return ['done', 'bad', 'todo'];
  if (stage === 'failed') return ['done', 'bad', 'todo'];
  if (stage === 'expired') return ['bad', 'todo', 'todo'];
  if (stage === 'received') return ['done', 'done', 'active'];
  if (stage === 'seen') return ['done', 'active', 'todo'];
  if (stage === 'incomplete') return ['active', 'todo', 'todo'];
  return ['active', 'todo', 'todo'];
}

export function minutesLeft(deadline: string, now: number): number {
  const ms = Date.parse(deadline) - now;
  return Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 60000)) : 0;
}

/** Stablecoins: the tipper states what they SEND (so "$X" is X tokens). Volatile tokens: what the creator RECEIVES. */
export const isStable = (symbol: string) => symbol === 'USDC' || symbol === 'USDT';

/** "1", "1.04", "0.5" -> true. Mirrors the backend rule (up to 6 digits, up to 6 decimals). */
export const isAmount = (s: string) => /^\d{1,6}(\.\d{1,6})?$/.test(s);

/** Label of the second Proof row: a refund lands on the chain the tipper paid from, everything else arrives on Solana. */
export const destinationLabel = (stage: Stage, originChainLabel: string) => (stage === 'refunded' ? `Refund on ${originChainLabel}` : 'Arrival on Solana');
export const shortHash = (h: string) => (h.length > 16 ? h.slice(0, 8) + '…' + h.slice(-6) : h);
export const isHttps = (u: string) => u.startsWith('https://');
