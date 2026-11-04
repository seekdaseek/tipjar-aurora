export type CopyResult = 'ok' | 'failed';

/**
 * The deposit-address copy button. Clipboards can refuse (permissions, a window without focus, a browser setting), and the old
 * button swallowed that, leaving the tipper's previous clipboard contents in place with no message. On failure this selects the
 * address text (so Cmd/Ctrl+C works) and reports 'failed' so the screen can say so.
 */
export async function copyAddress(text: string, share: (t: string) => unknown, select: () => void): Promise<CopyResult> {
  try {
    await share(text);
    return 'ok';
  } catch {
    try {
      select();
    } catch {
      /* no DOM to select in */
    }
    return 'failed';
  }
}
