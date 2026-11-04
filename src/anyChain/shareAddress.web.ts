/// <reference lib="dom" />
/** Web: copy to the clipboard; fall back to a hidden textarea where the async clipboard API is unavailable. Rejects when both fail. */
export async function shareAddress(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('copy failed');
  }
}

/** Select the deposit address text (`testID="deposit-address"`) so Cmd/Ctrl+C copies it after an automatic copy failed. */
export function selectAddress(): void {
  const el = document.querySelector('[data-testid="deposit-address"]');
  const sel = window.getSelection();
  if (!el || !sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}
