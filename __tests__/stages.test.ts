import {destinationLabel, isTerminal, minutesLeft, shortHash, stepStates} from '../src/anyChain/stages';
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

describe('amount rules', () => {
  const {isAmount, isStable} = require('../src/anyChain/stages');
  it('accepts plain decimals only, like the backend', () => {
    for (const ok of ['1', '1.04', '0.5', '25']) expect(isAmount(ok)).toBe(true);
    for (const bad of ['', '-1', '1e3', '1,04', ' 1', '1.', '.5', '1.1234567']) expect(isAmount(bad)).toBe(false);
  });
  it('only stablecoins are send-exact', () => {
    expect(isStable('USDC')).toBe(true);
    expect(isStable('USDT')).toBe(true);
    for (const s of ['ETH', 'BTC', 'TRX', 'NEAR']) expect(isStable(s)).toBe(false);
  });
});

import {parseTipHash, tipHash} from '../src/anyChain/permalink';

describe('permalink (#tip=<deposit address>)', () => {
  it('reads a deposit address of any chain family, and round-trips', () => {
    const a = '0xbfa9D9C3457AcAa0F755c79631758673DbC7b00A';
    expect(parseTipHash('#tip=' + a)).toBe(a);
    expect(parseTipHash(tipHash(a))).toBe(a);
    expect(parseTipHash('#tip=bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')).toBe('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
    expect(parseTipHash('#tip=alice.near')).toBe('alice.near');
  });
  it('rejects anything else: empty, short, long, odd characters, extra params, other keys', () => {
    for (const h of ['', '#', '#tip=', '#tip=abc', '#tip=' + 'x'.repeat(129), '#tip=0x12 34567890', '#tip=<script>alert(1)</script>', '#tip=0xabcdef01&x=1', '#other=0xbfa9D9C3457AcAa0', 'tip=0xbfa9D9C3457AcAa0', '#tip=../../etc/passwd']) {
      expect(parseTipHash(h)).toBeNull();
    }
  });
});

describe('destinationLabel (second Proof row)', () => {
  it('is the arrival on Solana, except for a refund, which came back on the origin chain', () => {
    expect(destinationLabel('arrived', 'Base')).toBe('Arrival on Solana');
    expect(destinationLabel('received', 'Base')).toBe('Arrival on Solana');
    expect(destinationLabel('refunded', 'Base')).toBe('Refund on Base');
    expect(destinationLabel('refunded', 'Ethereum')).toBe('Refund on Ethereum');
  });
});
