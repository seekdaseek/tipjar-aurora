import {useEffect, useState} from 'react';

/** "#tip=<deposit address>" -> the address, or null. The charset and length mirror the backend route, which is the real check. */
export function parseTipHash(hash: string): string | null {
  const m = /^#tip=([A-Za-z0-9._:-]{8,128})$/.exec(hash ?? '');
  return m ? m[1] : null;
}

export const tipHash = (address: string) => '#tip=' + address;

type HashWindow = {
  location: {hash: string};
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

// A hash can change without a reload: pasting a link that differs only in the fragment, Back/Forward, a script. hashchange covers
// those; popstate and pageshow are belt and braces (history traversal, a page restored from the back/forward cache).
export const HASH_EVENTS = ['hashchange', 'popstate', 'pageshow'];

/** The deposit address in the current #tip= hash (null when absent or malformed), kept in step with the hash while the page stays open. */
export function useTipAddress(win: HashWindow): string | null {
  const [addr, setAddr] = useState<string | null>(() => parseTipHash(win.location.hash));
  useEffect(() => {
    const sync = () => setAddr(parseTipHash(win.location.hash));
    sync(); // the hash may have changed between the first render and this effect
    HASH_EVENTS.forEach(t => win.addEventListener(t, sync));
    return () => HASH_EVENTS.forEach(t => win.removeEventListener(t, sync));
  }, [win]);
  return addr;
}
