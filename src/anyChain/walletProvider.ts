import {Quote} from './api';

/** Native build: no browser wallet. The web build uses walletProvider.web.ts. */
export const walletAvailable = (): boolean => false;
export async function payFromWallet(_q: Quote): Promise<string> {
  throw new Error('no wallet');
}
