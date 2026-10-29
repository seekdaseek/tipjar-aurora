/** "#tip=<deposit address>" -> the address, or null. The charset and length mirror the backend route, which is the real check. */
export function parseTipHash(hash: string): string | null {
  const m = /^#tip=([A-Za-z0-9._:-]{8,128})$/.exec(hash ?? '');
  return m ? m[1] : null;
}

export const tipHash = (address: string) => '#tip=' + address;
