import {checkQuoteForWallet, verifyPayTx, toWeiHex} from '../src/anyChain/payWallet';
import {payFromWallet} from '../src/anyChain/walletProvider.web';
import {Quote} from '../src/anyChain/api';

const ME = '0x22DB3A9686EE5261e7Bf3ed4f91277232E8076e6';
const DEP = '0x4D024F29e1Ae54AA3CF14C4A69F59D3B675ffABC';
const quote = (over: Partial<Quote> = {}) =>
  ({depositAddress: DEP, depositMemo: null, chain: 'base', chainLabel: 'Base', symbol: 'ETH', sendAmount: '0.000438573038034668', minAmount: '0.00043423', maxAmount: null, qr: DEP, ...over} as Quote);

/** A fake EIP-1193 wallet that records every request. `chain` is the chain it is on; `switchWorks:false` makes the switch a silent no-op. */
function wallet(opts: {chain: number; switchWorks?: boolean}) {
  const calls: Array<{method: string; params?: any}> = [];
  let chain = opts.chain;
  const eth = {
    request: async ({method, params}: {method: string; params?: any[]}) => {
      calls.push({method, params});
      if (method === 'eth_requestAccounts') return [ME];
      if (method === 'eth_chainId') return '0x' + chain.toString(16);
      if (method === 'wallet_switchEthereumChain') { if (opts.switchWorks !== false) chain = parseInt(params![0].chainId, 16); return null; }
      if (method === 'eth_sendTransaction') return '0x' + 'ab'.repeat(32);
      throw new Error('unexpected ' + method);
    },
  };
  (globalThis as any).window = {ethereum: eth};
  return {calls, sent: () => calls.filter(c => c.method === 'eth_sendTransaction')};
}

describe('chain check before sending', () => {
  it('already on the quote\'s chain: sends without a switch', async () => {
    const w = wallet({chain: 8453});
    await payFromWallet(quote());
    expect(w.calls.map(c => c.method)).toEqual(['eth_requestAccounts', 'eth_chainId', 'eth_sendTransaction']);
  });

  it('on another chain: switches, re-reads the chain, then sends', async () => {
    const w = wallet({chain: 1});
    await payFromWallet(quote());
    expect(w.calls.map(c => c.method)).toEqual(['eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain', 'eth_chainId', 'eth_sendTransaction']);
    expect(w.calls[2].params).toEqual([{chainId: '0x2105'}]);
  });

  it('REFUSES when the wallet is still on a different chain after the switch (the old code sent anyway)', async () => {
    const w = wallet({chain: 1, switchWorks: false});
    await expect(payFromWallet(quote())).rejects.toMatchObject({code: 'CHAIN_MISMATCH'});
    expect(w.sent()).toHaveLength(0);
  });
});

describe('the transaction is exactly the backend quote', () => {
  it('sends to exactly the quote\'s deposit address, exactly its amount, and nothing else', async () => {
    const w = wallet({chain: 8453});
    await payFromWallet(quote());
    const tx = w.sent()[0].params[0];
    expect(tx).toEqual({from: ME, to: DEP, value: toWeiHex('0.000438573038034668')});
    expect(Object.keys(tx).sort()).toEqual(['from', 'to', 'value']);
  });

  it('REFUSES a quote whose QR address differs from its deposit address (the old code sent anyway)', async () => {
    const w = wallet({chain: 8453});
    await expect(payFromWallet(quote({qr: '0x1111111111111111111111111111111111111111'}))).rejects.toMatchObject({code: 'QUOTE_MISMATCH'});
    expect(w.sent()).toHaveLength(0);
  });

  it('REFUSES an amount below the quote\'s own minimum or above its maximum (the old code sent anyway)', async () => {
    const w = wallet({chain: 8453});
    await expect(payFromWallet(quote({sendAmount: '0.00045', minAmount: '0.0008'}))).rejects.toMatchObject({code: 'QUOTE_MISMATCH'});
    await expect(payFromWallet(quote({sendAmount: '0.002', maxAmount: '0.001'}))).rejects.toMatchObject({code: 'QUOTE_MISMATCH'});
    expect(w.sent()).toHaveLength(0);
  });

  it('verifyPayTx is exact: wrong address, one wei off, or an extra field is an error', () => {
    const q = quote();
    const good = {from: ME, to: DEP, value: toWeiHex(q.sendAmount)!};
    expect(verifyPayTx(q, good)).toBeNull();
    expect(verifyPayTx(q, {...good, to: DEP.slice(0, -1) + 'D'})).toMatch(/address/);
    expect(verifyPayTx(q, {...good, value: '0x' + (BigInt(good.value) + BigInt(1)).toString(16)})).toMatch(/amount/);
    expect(verifyPayTx(q, {...good, data: '0x'} as any)).toMatch(/fields/);
    expect(verifyPayTx(q, {...good, to: DEP.toLowerCase()})).toBeNull(); // 0x addresses compare case-insensitively
  });

  it('checkQuoteForWallet accepts a consistent quote', () => {
    expect(checkQuoteForWallet(quote())).toBeNull();
    expect(checkQuoteForWallet(quote({qr: DEP.toLowerCase()}))).toBeNull();
    expect(checkQuoteForWallet(quote({minAmount: null, maxAmount: null}))).toBeNull();
  });
});
