import React from 'react';
import {act, create} from 'react-test-renderer';
import {HASH_EVENTS, useTipAddress} from '../src/anyChain/permalink';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const A = '0xbfa9D9C3457AcAa0F755c79631758673DbC7b00A';
const B = '0x1111111111111111111111111111111111111111';

function fakeWindow(hash: string) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    location: {hash},
    addEventListener: (t: string, f: () => void) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f); },
    removeEventListener: (t: string, f: () => void) => { listeners.get(t)?.delete(f); },
    // what the browser does: the hash changes, then the event fires
    navigate(next: string, type = 'hashchange') { this.location.hash = next; listeners.get(type)?.forEach(f => f()); },
    count: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
}

function mount(win: ReturnType<typeof fakeWindow>) {
  const seen: Array<string | null> = [];
  const Probe = () => { seen.push(useTipAddress(win)); return null; };
  let r: ReturnType<typeof create>;
  act(() => { r = create(<Probe />); });
  return {now: () => seen[seen.length - 1], unmount: () => act(() => r.unmount())};
}

describe('useTipAddress (hash changes on an already-open page)', () => {
  it('starts from the current hash', () => {
    expect(mount(fakeWindow('#tip=' + A)).now()).toBe(A);
    expect(mount(fakeWindow('')).now()).toBeNull();
    expect(mount(fakeWindow('#tip=bad')).now()).toBeNull();
  });

  it('switches to the receipt when only the hash changes, and back to the form when it is removed', () => {
    const w = fakeWindow('');
    const m = mount(w);
    expect(m.now()).toBeNull(); // form
    act(() => w.navigate('#tip=' + A));
    expect(m.now()).toBe(A); // receipt
    act(() => w.navigate('#tip=' + B));
    expect(m.now()).toBe(B); // another receipt, no reload
    act(() => w.navigate(''));
    expect(m.now()).toBeNull(); // form again
    act(() => w.navigate('#tip=nope'));
    expect(m.now()).toBeNull(); // malformed hash: form
  });

  it('also follows history traversal and bfcache restores', () => {
    const w = fakeWindow('');
    const m = mount(w);
    act(() => w.navigate('#tip=' + A, 'popstate'));
    expect(m.now()).toBe(A);
    act(() => w.navigate('', 'pageshow'));
    expect(m.now()).toBeNull();
  });

  it('listens for every event it needs and cleans up on unmount', () => {
    const w = fakeWindow('');
    const m = mount(w);
    expect(w.count()).toBe(HASH_EVENTS.length);
    expect(HASH_EVENTS).toEqual(expect.arrayContaining(['hashchange', 'popstate', 'pageshow']));
    m.unmount();
    expect(w.count()).toBe(0);
  });
});
