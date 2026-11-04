/// <reference lib="dom" />
import {Quote} from './api';
import {buildPayRequest, checkQuoteForWallet, payError, verifyPayTx} from './payWallet';

type Eip1193 = {request: (a: {method: string; params?: unknown[]}) => Promise<any>};
const provider = (): Eip1193 | null => (typeof window !== 'undefined' && (window as any).ethereum) || null;

/** True when an injected EIP-1193 wallet (MetaMask, Rabby, ...) is present. */
export const walletAvailable = (): boolean => !!provider();

/**
 * Asks the wallet to connect, switch to the quote's chain and send exactly the quoted amount to the deposit address.
 * The user confirms in the wallet; nothing is sent without that. Resolves with the transaction hash.
 */
export async function payFromWallet(q: Quote): Promise<string> {
  const eth = provider();
  if (!eth) throw Object.assign(new Error('no wallet'), {code: 'NO_WALLET'});
  const accounts: string[] = await eth.request({method: 'eth_requestAccounts'});
  const req = buildPayRequest(q, accounts[0]);
  if (!req) throw payError('QUOTE_MISMATCH', 'this quote cannot be paid from a wallet');
  const bad = checkQuoteForWallet(q);
  if (bad) throw payError('QUOTE_MISMATCH', bad);

  // The wallet must be on the quote's chain: switch if it is not, then read it back; refuse if it still is not.
  const onChain = async () => parseInt(await eth.request({method: 'eth_chainId'}), 16) === parseInt(req.chainIdHex, 16);
  if (!(await onChain())) {
    await eth.request({method: 'wallet_switchEthereumChain', params: [{chainId: req.chainIdHex}]});
    if (!(await onChain())) throw payError('CHAIN_MISMATCH', 'the wallet is not on the quote\'s network');
  }

  // Last look, on the transaction itself, before the wallet is asked to send it.
  const mismatch = verifyPayTx(q, req.tx);
  if (mismatch) throw payError('TX_MISMATCH', mismatch);
  return eth.request({method: 'eth_sendTransaction', params: [req.tx]});
}
