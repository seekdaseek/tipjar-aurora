import {EVM_CHAIN_IDS, buildPayRequest, canPayWithWallet, toWeiHex} from '../src/anyChain/payWallet';
import {Quote} from '../src/anyChain/api';

const DEP = '0x4D024F29e1Ae54AA3CF14C4A69F59D3B675ffABC';
const quote = (over: Partial<Quote> = {}) =>
  ({depositAddress: DEP, depositMemo: null, chain: 'arb', chainLabel: 'Arbitrum', symbol: 'ETH', sendAmount: '0.000438461', ...over} as Quote);

describe('toWeiHex (exact decimal -> wei, no floating point)', () => {
  it('converts exactly', () => {
    expect(toWeiHex('0.000438573038034668')).toBe('0x' + 438573038034668n.toString(16));
    expect(toWeiHex('1')).toBe('0x' + (10n ** 18n).toString(16));
    expect(toWeiHex('0.000439')).toBe('0x' + 439000000000000n.toString(16));
  });
  it('rejects anything that is not a plain positive decimal with at most 18 places', () => {
    for (const bad of ['', '0', '0.0', '-1', '1e3', '1,5', ' 1', '0.0000000000000000001', 'abc', '1.', '.5']) expect(toWeiHex(bad)).toBeNull();
  });
});

describe('canPayWithWallet', () => {
  it('is true for a native-coin EVM quote with an ordinary 0x address and no memo', () => {
    expect(canPayWithWallet(quote())).toBe(true);
    expect(canPayWithWallet(quote({chain: 'eth'}))).toBe(true);
    expect(canPayWithWallet(quote({chain: 'pol', symbol: 'POL'}))).toBe(true);
  });
  it('is false for tokens, other families, memos, bad addresses and bad amounts', () => {
    expect(canPayWithWallet(quote({symbol: 'USDC'}))).toBe(false); // ERC-20 transfers are not built yet
    expect(canPayWithWallet(quote({chain: 'btc', symbol: 'BTC'}))).toBe(false);
    expect(canPayWithWallet(quote({chain: 'near', symbol: 'NEAR'}))).toBe(false);
    expect(canPayWithWallet(quote({depositMemo: '123'}))).toBe(false);
    expect(canPayWithWallet(quote({depositAddress: '0x123'}))).toBe(false);
    expect(canPayWithWallet(quote({sendAmount: '0'}))).toBe(false);
    expect(canPayWithWallet(quote({chain: 'eth', symbol: 'POL'}))).toBe(false); // wrong coin for that chain
  });
});

describe('buildPayRequest', () => {
  it('asks for the right network and a transfer of exactly the quoted amount to the deposit address', () => {
    const r = buildPayRequest(quote(), '0x22DB3A9686EE5261e7Bf3ed4f91277232E8076e6')!;
    expect(r.chainIdHex).toBe('0xa4b1');
    expect(r.tx).toEqual({from: '0x22DB3A9686EE5261e7Bf3ed4f91277232E8076e6', to: DEP, value: '0x' + 438461000000000n.toString(16)});
    expect(Object.keys(r.tx).sort()).toEqual(['from', 'to', 'value']); // no data, no gas fields: the wallet prices the transfer
  });
  it('knows every EVM chain id the app offers', () => {
    expect(EVM_CHAIN_IDS).toEqual({eth: 1, base: 8453, arb: 42161, op: 10, pol: 137, bsc: 56, avax: 43114});
  });
  it('returns null when the quote cannot be paid from a wallet', () => {
    expect(buildPayRequest(quote({symbol: 'USDC'}), '0x22DB3A9686EE5261e7Bf3ed4f91277232E8076e6')).toBeNull();
  });
});

import {describeWalletError} from '../src/anyChain/payWallet';
describe('describeWalletError', () => {
  it('says plainly what happened, and that nothing was sent when it is true', () => {
    expect(describeWalletError({code: 4001})).toMatch(/declined .* Nothing was sent/);
    expect(describeWalletError({code: 4902})).toMatch(/does not have this network/);
    expect(describeWalletError({code: -32002})).toMatch(/already has a request open/);
    expect(describeWalletError({code: 4100})).toMatch(/locked/);
    expect(describeWalletError(new Error('boom'))).toMatch(/Nothing was sent.*copy the address/);
    expect(describeWalletError(undefined)).toMatch(/could not send/);
  });
});

describe('describeWalletError for the refusals', () => {
  it('says nothing was sent, and what to do', () => {
    expect(describeWalletError({code: 'CHAIN_MISMATCH'})).toMatch(/different network.*Nothing was sent/);
    expect(describeWalletError({code: 'QUOTE_MISMATCH'})).toMatch(/did not check out, so nothing was sent/);
    expect(describeWalletError({code: 'TX_MISMATCH'})).toMatch(/did not check out, so nothing was sent/);
  });
});
