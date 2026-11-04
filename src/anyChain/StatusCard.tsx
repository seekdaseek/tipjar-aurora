import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {TipStatus} from './api';
import {destinationLabel, shortHash, stepStates, StepState} from './stages';

type Props = {status: TipStatus | null; name: string; chainLabel: string; symbol: string; pollErr?: boolean; onOpen: (url: string) => void};

/** Progress (Waiting / Received / Arrived), the status message, proof links, refund and support. Shared by the live flow and the read-only receipt. */
export default function StatusCard({status, name, chainLabel, symbol, pollErr, onOpen}: Props) {
  const steps = stepStates(status);
  const stage = status?.stage ?? 'waiting';
  return (
    <>
      <Text style={s.section}>Progress</Text>
      <Step state={steps[0]} text={stage === 'incomplete' ? 'Deposit incomplete' : 'Waiting for your deposit'} />
      <Step state={steps[1]} text={stage === 'seen' ? 'Deposit seen, confirming' : 'Received'} />
      <Step state={steps[2]} text={`Arrived in ${name}'s wallet`} />
      {status && <Text style={[s.msg, (stage === 'failed' || stage === 'expired') && s.msgBad]}>{status.message}</Text>}
      {pollErr ? <Text style={s.poll}>Connection hiccup, retrying. Your tip is safe.</Text> : null}

      {status && (status.links.origin.length > 0 || status.links.destination.length > 0) && (
        <View style={s.linksCard}>
          <Text style={s.reqTitle}>Proof</Text>
          {status.links.origin.map(l => <LinkRow key={l.url} label={`Tip on ${chainLabel}`} hash={l.hash} onPress={() => onOpen(l.url)} />)}
          {status.links.destination.map(l => <LinkRow key={l.url} label={destinationLabel(stage, chainLabel)} hash={l.hash} onPress={() => onOpen(l.url)} />)}
        </View>
      )}
      {status?.refund && (
        <View style={s.refundCard}>
          <Text style={s.refundTitle}>Refunded</Text>
          <Text style={s.reqText}>{status.refund.amount ? `${status.refund.amount} ${symbol}` : 'The deposit'} was returned to {status.refund.to}{status.refund.reason ? ` (${status.refund.reason})` : ''}.</Text>
        </View>
      )}
      {status?.supportUrl && (
        <TouchableOpacity onPress={() => onOpen(status.supportUrl!)}>
          <Text style={s.support}>Something wrong? Contact Aurora support with this deposit address →</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

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
  section: {color: '#6B7280', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 18, marginBottom: 8},
  step: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10},
  mark: {width: 24, textAlign: 'center', color: '#6B7280', fontSize: 18},
  markDone: {color: '#34D399'}, markBad: {color: '#F87171'}, markActive: {color: '#C4B5FD'},
  stepText: {color: '#F9FAFB', fontSize: 15, flex: 1}, stepTodo: {color: '#4B5563'},
  msg: {color: '#9CA3AF', fontSize: 13, lineHeight: 19, marginTop: 6},
  msgBad: {color: '#F87171', marginTop: 10},
  poll: {color: '#6B7280', fontSize: 12, marginTop: 8},
  linksCard: {backgroundColor: '#131320', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1E1E30', marginTop: 16},
  reqTitle: {color: '#E8C454', fontSize: 13, fontWeight: '700', marginBottom: 6},
  reqText: {color: '#D1D5DB', fontSize: 13, lineHeight: 19, marginTop: 4},
  linkRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8},
  linkLabel: {color: '#D1D5DB', fontSize: 13}, linkHash: {color: '#C4B5FD', fontSize: 13, fontFamily: 'monospace'},
  refundCard: {backgroundColor: '#1f1014', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#7f1d1d', marginTop: 16},
  refundTitle: {color: '#FCA5A5', fontSize: 14, fontWeight: '700'},
  support: {color: '#9CA3AF', fontSize: 12, marginTop: 16, textDecorationLine: 'underline'},
});
