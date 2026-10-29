import {isTerminal, minutesLeft, shortHash, stepStates} from '../src/anyChain/stages';
import {TipStatus} from '../src/anyChain/api';

const st = (stage: TipStatus['stage']) => ({stage} as TipStatus);

describe('stepStates (the three progress rows)', () => {
  it('walks waiting -> seen -> received -> arrived', () => {
    expect(stepStates(null)).toEqual(['active', 'todo', 'todo']);
    expect(stepStates(st('seen'))).toEqual(['done', 'active', 'todo']);
    expect(stepStates(st('received'))).toEqual(['done', 'done', 'active']);
    expect(stepStates(st('arrived'))).toEqual(['done', 'done', 'done']);
  });
  it('a refund or failure never shows the arrival step as done', () => {
    for (const s of ['refunded', 'failed'] as const) expect(stepStates(st(s))[2]).toBe('todo');
    expect(stepStates(st('refunded'))[1]).toBe('bad');
  });
  it('an expired request marks the deposit step bad', () => {
    expect(stepStates(st('expired'))).toEqual(['bad', 'todo', 'todo']);
  });
});

describe('helpers', () => {
  it('terminal stages stop polling', () => {
    for (const s of ['arrived', 'refunded', 'failed', 'expired'] as const) expect(isTerminal(s)).toBe(true);
    for (const s of ['waiting', 'seen', 'received', 'incomplete'] as const) expect(isTerminal(s)).toBe(false);
  });
  it('minutesLeft rounds up, never negative', () => {
    const now = Date.parse('2026-10-30T10:00:00Z');
    expect(minutesLeft('2026-10-30T10:29:10Z', now)).toBe(30);
    expect(minutesLeft('2026-10-30T09:00:00Z', now)).toBe(0);
    expect(minutesLeft('garbage', now)).toBe(0);
  });
  it('shortHash keeps both ends', () => {
    expect(shortHash('0x1234567890abcdef1234567890abcdef')).toBe('0x123456…abcdef');
    expect(shortHash('short')).toBe('short');
  });
});
