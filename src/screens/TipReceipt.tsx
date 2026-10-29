import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Linking} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ApiError, TipStatus, getStatus} from '../anyChain/api';
import {isHttps, isTerminal, shortHash} from '../anyChain/stages';
import StatusCard from '../anyChain/StatusCard';

const POLL_MS = 6000;

/** Read-only view of one tip by deposit address (the #tip=<address> permalink). It only reads status; it never creates a quote. */
export default function TipReceipt({address, onBack}: {address: string; onBack: () => void}) {
  const [status, setStatus] = useState<TipStatus | null>(null);
  const [err, setErr] = useState('');
  const [pollErr, setPollErr] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    setStatus(null); setErr('');
    const tick = async () => {
      try {
        const st = await getStatus(address);
        if (stopped.current) return;
        setStatus(st); setPollErr(false);
        if (isTerminal(st.stage)) stopped.current = true;
      } catch (e: any) {
        if (stopped.current) return;
        if ((e as ApiError).code === 'unknown_tip' || (e as ApiError).code === 'not_found') { stopped.current = true; setErr('No tip with that deposit address.'); }
        else setPollErr(true);
      }
    };
    tick();
    const id = setInterval(() => { if (!stopped.current) tick(); }, POLL_MS);
    return () => { stopped.current = true; clearInterval(id); };
  }, [address]);

  const open = (u: string) => { if (isHttps(u)) Linking.openURL(u).catch(() => {}); };
  const r = status?.route;
  const delivered = status?.amounts.delivered;
  const usd = status?.amounts.deliveredUsd;

  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.big}>Tip receipt</Text>
        {r && <Text style={s.sub}>{r.chainLabel} {r.symbol} → USDC on Solana</Text>}
        {!status && !err && <ActivityIndicator color="#7C3AED" style={{marginTop: 30}} />}
        {err ? <Text style={s.bad}>{err}</Text> : null}

        {status && r && (
          <View style={s.card}>
            <Row label="Sent" value={status.amounts.deposited ? `${status.amounts.deposited} ${r.symbol}` : '—'} />
            <Row label="Arrived" value={delivered ? `${delivered} USDC${usd && Number.isFinite(Number(usd)) ? ` (about $${Number(usd).toFixed(2)})` : ''}` : '—'} />
            <Row label="Creator wallet" value={shortHash(r.creator)} />
            <Text style={s.label}>Deposit address</Text>
            <Text selectable style={s.addr}>{status.depositAddress}</Text>
          </View>
        )}

        {status && r && <StatusCard status={status} name="the creator" chainLabel={r.chainLabel} symbol={r.symbol} pollErr={pollErr} onOpen={open} />}

        <TouchableOpacity style={s.primary} onPress={onBack}>
          <Text style={s.primaryText}>Tip from any chain</Text>
        </TouchableOpacity>
        <Text style={s.fine}>Read-only receipt: it shows the status Aurora reports for this deposit address and never creates a quote.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const Row = ({label, value}: {label: string; value: string}) => (
  <View style={s.row}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>
);

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0A14'},
  scroll: {padding: 20, paddingBottom: 48},
  big: {color: '#F9FAFB', fontSize: 24, fontWeight: '800'},
  sub: {color: '#9CA3AF', fontSize: 13, marginTop: 6, marginBottom: 16, lineHeight: 19},
  bad: {color: '#F87171', fontSize: 14, lineHeight: 20, marginTop: 16},
  card: {backgroundColor: '#131320', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1E1E30'},
  row: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6},
  label: {color: '#6B7280', fontSize: 12},
  value: {color: '#F9FAFB', fontSize: 14, fontWeight: '600'},
  addr: {color: '#C4B5FD', fontFamily: 'monospace', fontSize: 12, marginTop: 6},
  primary: {backgroundColor: '#7C3AED', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 24},
  primaryText: {color: '#FFF', fontSize: 16, fontWeight: '700'},
  fine: {color: '#4B5563', fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 17},
});
