declare module 'qrcode/lib/core/qrcode' {
  export function create(
    data: string | {data: string | Uint8Array; mode?: 'byte' | 'numeric' | 'alphanumeric' | 'kanji'}[],
    options?: {errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'},
  ): {modules: {size: number; data: Uint8Array | number[]}};
}
