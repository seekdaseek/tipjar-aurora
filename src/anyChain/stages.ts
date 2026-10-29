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

export const shortHash = (h: string) => (h.length > 16 ? h.slice(0, 8) + '…' + h.slice(-6) : h);
export const isHttps = (u: string) => u.startsWith('https://');
