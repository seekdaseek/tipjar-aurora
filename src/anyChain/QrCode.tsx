import React, {useMemo} from 'react';
import {View} from 'react-native';
import {create} from 'qrcode/lib/core/qrcode';

// Renders the QR locally from the module matrix: the deposit address never goes to a QR web service.
export default function QrCode({value, size = 220}: {value: string; size?: number}) {
  const rows = useMemo(() => {
    // Pre-encode to bytes: the library's string path needs TextEncoder, which Hermes on RN 0.73 may not have.
    // Deposit addresses and BIP21 URIs are ASCII.
    const bytes = Uint8Array.from(value, ch => ch.charCodeAt(0) & 0xff);
    const {modules} = create([{data: bytes, mode: 'byte'}], {errorCorrectionLevel: 'M'});
    const n = modules.size;
    const out: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(!!modules.data[r * n + c]);
      out.push(row);
    }
    return out;
  }, [value]);
  const quiet = 2;
  const cells = rows.length + quiet * 2;
  const cell = Math.floor(size / cells);
  const px = cell * cells;
  return (
    <View style={{width: px, height: px, backgroundColor: '#FFFFFF', padding: quiet * cell}} accessibilityLabel="Deposit address QR code">
      {rows.map((row, r) => (
        <View key={r} style={{flexDirection: 'row', height: cell}}>
          {row.map((on, c) => (
            <View key={c} style={{width: cell, height: cell, backgroundColor: on ? '#000000' : '#FFFFFF'}} />
          ))}
        </View>
      ))}
    </View>
  );
}
