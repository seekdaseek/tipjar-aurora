import React, {useCallback, useEffect, useRef, useState} from 'react';
import {View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, ActivityIndicator, Linking} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RouteProp} from '@react-navigation/native';
import {RootStackParamList} from '../../App';
import {ApiError, Quote, RouteChain, Routes, TipStatus, createTip, getRoutes, getStatus} from '../anyChain/api';
import {isAmount, isHttps, isStable, isTerminal, minutesLeft, shortHash, stepStates, StepState} from '../anyChain/stages';
import QrCode from '../anyChain/QrCode';
import {shareAddress} from '../anyChain/shareAddress';

type Props = {navigation: NativeStackNavigationProp<RootStackParamList, 'AnyChain'>; route: RouteProp<RootStackParamList, 'AnyChain'>};
const AMOUNTS = ['1', '2', '5', '10', '25'];
const POLL_MS = 6000; // Aurora: poll status every 5-10 s

export default function AnyChainTipScreen({navigation, route}: Props) {
  const {name, wallet, color} = route.params;
  const [routes, setRoutes] = useState<Routes | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [chainKey, setChainKey] = useState('');
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('2');
  const [refund, setRefund] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [status, setStatus] = useState<TipStatus | null>(null);
  const [pollErr, setPollErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const stopped = useRef(false);

  const loadRoutes = useCallback(() => {
    setLoadErr('');
    getRoutes()
      .then(r => {
        setRoutes(r);
        const first = r.chains[0];
        if (first) { setChainKey(k => k || first.key); setSymbol(s => s || first.tokens[0].symbol); }
      })
      .catch((e: ApiError) => setLoadErr(e.message));
  }, []);
  useEffect(loadRoutes, [loadRoutes]);

  const chain: RouteChain | undefined = routes?.chains.find(c => c.key === chainKey);
  const family = chain?.family ?? 'evm';
  const refundTo = (refund[family] ?? '').trim();
  const minUsd = chain?.minUsd ?? 1;
  const amountOk = isAmount(amount) && Number(amount) >= minUsd && Number(amount) <= (routes?.maxTipUsd ?? 50);
  const sendExact = isStable(symbol);

  const pickChain = (c: RouteChain) => { setChainKey(c.key); setSymbol(c.tokens[0].symbol); setErr(''); if (Number(amount) < c.minUsd) setAmount(String(c.minUsd)); };

  const submit = async () => {
    if (!chain || busy) return;
    setBusy(true); setErr('');
    try {
      setQuote(await createTip({chain: chain.key, symbol, amountUsd: amount, refundTo, creatorWallet: wallet, sendExact}));
    } catch (e: any) { setErr(e.message ?? 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  // Live status: poll until a terminal stage.
  useEffect(() => {
    if (!quote) return;
    stopped.current = false;
    const tick = async () => {
      try {
        const s = await getStatus(quote.depositAddress);
        if (stopped.current) return;
        setStatus(s); setPollErr('');
        if (isTerminal(s.stage)) stopped.current = true;
      } catch (e: any) { if (!stopped.current) setPollErr(e.message ?? 'Reconnecting…'); }
    };
    tick();
    const id = setInterval(() => { if (!stopped.current) tick(); }, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { stopped.current = true; clearInterval(id); clearInterval(clock); };
  }, [quote]);

  const open = (u: string) => { if (isHttps(u)) Linking.openURL(u).catch(() => {}); };

  // ---------- step 2: deposit + live tracking ----------
  if (quote) {
    const steps = stepStates(status);
    const stage = status?.stage ?? 'waiting';
    const waiting = stage === 'waiting' || stage === 'incomplete';
    const mins = minutesLeft(quote.deadline, now);
    return (
      <SafeAreaView style={s.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={s.scroll}>
          {stage !== 'arrived' && stage !== 'refunded' && stage !== 'failed' && stage !== 'expired' && (
            <>
              <Text style={s.big}>Send {quote.sendAmount} {quote.symbol}</Text>
              <Text style={s.sub}>on {quote.chainLabel}{quote.sendAmountUsd ? ` · about $${quote.sendAmountUsd}` : ''} → {name} receives {quote.receiveUsdc} USDC on Solana</Text>
              <View style={s.qrCard}>
                <QrCode value={quote.qr} />
                <Text selectable style={s.addr}>{quote.depositAddress}</Text>
                {quote.depositMemo ? <Text style={s.memo}>Memo (required): {quote.depositMemo}</Text> : null}
                <TouchableOpacity style={s.shareBtn} onPress={() => { shareAddress(quote.depositAddress).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }}>
                  <Text style={s.shareText}>{copied ? 'Copied ✓' : 'Copy / share address'}</Text>
                </TouchableOpacity>
              </View>
              <View style={s.reqCard}>
                <Text style={s.reqTitle}>Transfer requirements</Text>
                <Text style={s.reqText}>{quote.requirements}</Text>
                {waiting && <Text style={s.reqText}>Send within {mins} min. After that, anything not converted is refunded to {shortHash(quote.refundTo)}.</Text>}
              </View>
            </>
          )}

          <Text style={s.section}>Progress</Text>
          <Step state={steps[0]} text={stage === 'incomplete' ? 'Deposit incomplete' : 'Waiting for your deposit'} />
          <Step state={steps[1]} text={stage === 'seen' ? 'Deposit seen, confirming' : 'Received'} />
          <Step state={steps[2]} text={`Arrived in ${name}'s wallet`} />
          {status && <Text style={[s.msg, (stage === 'failed' || stage === 'expired') && s.msgBad]}>{status.message}</Text>}
          {pollErr ? <Text style={s.poll}>Connection hiccup, retrying. Your tip is safe.</Text> : null}

          {status && (status.links.origin.length > 0 || status.links.destination.length > 0) && (
            <View style={s.linksCard}>
              <Text style={s.reqTitle}>Proof</Text>
              {status.links.origin.map(l => <LinkRow key={l.url} label={`Your tip on ${quote.chainLabel}`} hash={l.hash} onPress={() => open(l.url)} />)}
              {status.links.destination.map(l => <LinkRow key={l.url} label="Arrival on Solana" hash={l.hash} onPress={() => open(l.url)} />)}
            </View>
          )}
          {status?.refund && (
            <View style={s.refundCard}>
              <Text style={s.refundTitle}>Refunded</Text>
              <Text style={s.reqText}>{status.refund.amount ? `${status.refund.amount} ${quote.symbol}` : 'Your deposit'} was returned to {status.refund.to}{status.refund.reason ? ` (${status.refund.reason})` : ''}.</Text>
            </View>
          )}
          {status?.supportUrl && (
            <TouchableOpacity onPress={() => open(status.supportUrl!)}>
              <Text style={s.support}>Something wrong? Contact Aurora support with this deposit address →</Text>
            </TouchableOpacity>
          )}

          {isTerminal(stage) && (
            <TouchableOpacity style={s.primary} onPress={() => navigation.popToTop()}>
              <Text style={s.primaryText}>{stage === 'arrived' ? 'Done' : 'Back to creators'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- step 1: pick chain, amount, refund address ----------
  const evm = routes?.chains.filter(c => c.family === 'evm') ?? [];
  const other = routes?.chains.filter(c => c.family !== 'evm') ?? [];
  const canSubmit = !!chain && amountOk && refundTo.length > 0 && !busy;
  return (
    <SafeAreaView style={s.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.creatorRow}>
          <View style={[s.avatar, {backgroundColor: color}]}><Text style={s.avatarText}>{name[0]}</Text></View>
          <View style={{flex: 1}}>
            <Text style={s.creatorName}>Tip {name} from any chain</Text>
            <Text style={s.creatorSub}>{name} gets USDC on Solana. You pay in what you hold.</Text>
          </View>
        </View>

        {!routes && !loadErr && <ActivityIndicator color="#7C3AED" style={{marginTop: 30}} />}
        {loadErr ? (
          <View style={s.reqCard}><Text style={s.msgBad}>{loadErr}</Text>
            <TouchableOpacity style={s.shareBtn} onPress={loadRoutes}><Text style={s.shareText}>Try again</Text></TouchableOpacity></View>
        ) : null}

        {routes && (
          <>
            <Text style={s.section}>Pay from</Text>
            <Text style={s.hint}>EVM chains · one address works on all of them</Text>
            <View style={s.chips}>{evm.map(c => <Chip key={c.key} label={c.label} on={c.key === chainKey} onPress={() => pickChain(c)} />)}</View>
            <View style={[s.chips, {marginTop: 8}]}>{other.map(c => <Chip key={c.key} label={c.label} on={c.key === chainKey} onPress={() => pickChain(c)} />)}</View>

            {chain && chain.tokens.length > 1 && (
              <>
                <Text style={s.section}>Token</Text>
                <View style={s.chips}>{chain.tokens.map(t => <Chip key={t.symbol} label={t.symbol} on={t.symbol === symbol} onPress={() => setSymbol(t.symbol)} />)}</View>
              </>
            )}

            <Text style={s.section}>{sendExact ? `You send (${symbol})` : `${name} receives`}</Text>
            <View style={s.chips}>
              {AMOUNTS.filter(a => Number(a) >= minUsd && Number(a) <= routes.maxTipUsd).map(a => <Chip key={a} label={`$${a}`} on={a === amount} onPress={() => setAmount(a)} />)}
            </View>
            <TextInput
              style={[s.input, {marginTop: 10, fontFamily: undefined, fontSize: 15}]} value={amount} onChangeText={v => { setAmount(v.replace(',', '.')); setErr(''); }}
              keyboardType="decimal-pad" placeholder="or type an amount" placeholderTextColor="#4B5563" accessibilityLabel="Tip amount"
            />
            <Text style={s.hint}>
              {sendExact ? `${name} gets USDC on Solana, a little under what you send after network fees. ` : ''}Minimum from {chain?.label}: ${minUsd}. Smaller deposits can get stuck.
            </Text>

            <Text style={s.section}>Your {chain?.label} address (for refunds)</Text>
            <TextInput
              style={s.input} value={refund[family] ?? ''} onChangeText={v => { setRefund(r => ({...r, [family]: v})); setErr(''); }}
              placeholder={chain?.addressHint} placeholderTextColor="#4B5563" autoCapitalize="none" autoCorrect={false}
            />
            <Text style={s.hint}>If a tip cannot complete, it goes back here. Use an address you control, not an exchange deposit address.</Text>

            {err ? <Text style={s.msgBad}>{err}</Text> : null}
            <TouchableOpacity style={[s.primary, !canSubmit && s.primaryOff]} disabled={!canSubmit} onPress={submit}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={s.primaryText}>Get deposit address</Text>}
            </TouchableOpacity>
            <Text style={s.fine}>No fee added by Tip Jar. Routed by Aurora Intents (NEAR Intents).</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const Chip = ({label, on, onPress}: {label: string; on: boolean; onPress: () => void}) => (
  <TouchableOpacity style={[s.chip, on && s.chipOn]} onPress={onPress}><Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text></TouchableOpacity>
);
const MARK: Record<StepState, string> = {todo: '○', active: '◔', done: '✓', bad: '✕'};
const Step = ({state, text}: {state: StepState; text: string}) => (
  <View style={s.step}>
    <Text style={[s.mark, state === 'done' && s.markDone, state === 'bad' && s.markBad, state === 'active' && s.markActive]}>{MARK[state]}</Text>
    <Text style={[s.stepText, state === 'todo' && s.stepTodo]}>{text}</Text>
  </View>
);
const LinkRow = ({label, hash, onPress}: {label: string; hash: string; onPress: () => void}) => (
  <TouchableOpacity style={s.linkRow} onPress={onPress}>
    <Text style={s.linkLabel}>{label}</Text><Text style={s.linkHash}>{shortHash(hash)} ↗</Text>
  </TouchableOpacity>
);

const s = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0A0A14'},
  scroll: {padding: 20, paddingBottom: 48},
  creatorRow: {flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20, backgroundColor: '#131320', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1E1E30'},
  avatar: {width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center'},
  avatarText: {color: '#FFF', fontSize: 20, fontWeight: '800'},
  creatorName: {color: '#F9FAFB', fontSize: 16, fontWeight: '700'},
  creatorSub: {color: '#6B7280', fontSize: 12, marginTop: 2},
  section: {color: '#6B7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 18, marginBottom: 8},
  hint: {color: '#6B7280', fontSize: 12, marginBottom: 8, lineHeight: 17},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {backgroundColor: '#131320', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#1E1E30'},
  chipOn: {backgroundColor: '#4C1D95', borderColor: '#7C3AED'},
  chipText: {color: '#9CA3AF', fontSize: 14, fontWeight: '600'},
  chipTextOn: {color: '#C4B5FD'},
  input: {backgroundColor: '#131320', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E30', color: '#F9FAFB', padding: 14, fontFamily: 'monospace', fontSize: 12},
  primary: {backgroundColor: '#7C3AED', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 20},
  primaryOff: {opacity: 0.4},
  primaryText: {color: '#FFF', fontSize: 16, fontWeight: '700'},
  fine: {color: '#4B5563', fontSize: 12, textAlign: 'center', marginTop: 14},
  big: {color: '#F9FAFB', fontSize: 24, fontWeight: '800'},
  sub: {color: '#9CA3AF', fontSize: 13, marginTop: 6, marginBottom: 16, lineHeight: 19},
  qrCard: {backgroundColor: '#131320', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#1E1E30', alignItems: 'center', marginBottom: 14},
  addr: {color: '#C4B5FD', fontFamily: 'monospace', fontSize: 12, marginTop: 14, textAlign: 'center'},
  memo: {color: '#FBBF24', fontSize: 13, fontWeight: '700', marginTop: 8},
  shareBtn: {borderWidth: 1, borderColor: '#4C1D95', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18, marginTop: 14},
  shareText: {color: '#C4B5FD', fontSize: 14, fontWeight: '600'},
  reqCard: {backgroundColor: '#1a1200', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#C9A84C', marginBottom: 6},
  reqTitle: {color: '#E8C454', fontSize: 13, fontWeight: '700', marginBottom: 6},
  reqText: {color: '#D1D5DB', fontSize: 13, lineHeight: 19, marginTop: 4},
  step: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10},
  mark: {width: 24, textAlign: 'center', color: '#6B7280', fontSize: 18},
  markDone: {color: '#34D399'}, markBad: {color: '#F87171'}, markActive: {color: '#C4B5FD'},
  stepText: {color: '#F9FAFB', fontSize: 15, flex: 1}, stepTodo: {color: '#4B5563'},
  msg: {color: '#9CA3AF', fontSize: 13, lineHeight: 19, marginTop: 6},
  msgBad: {color: '#F87171', fontSize: 13, lineHeight: 19, marginTop: 10},
  poll: {color: '#6B7280', fontSize: 12, marginTop: 8},
  linksCard: {backgroundColor: '#131320', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1E1E30', marginTop: 16},
  linkRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8},
  linkLabel: {color: '#D1D5DB', fontSize: 13}, linkHash: {color: '#C4B5FD', fontSize: 13, fontFamily: 'monospace'},
  refundCard: {backgroundColor: '#1f1014', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#7f1d1d', marginTop: 16},
  refundTitle: {color: '#FCA5A5', fontSize: 14, fontWeight: '700'},
  support: {color: '#9CA3AF', fontSize: 12, marginTop: 16, textDecorationLine: 'underline'},
});
