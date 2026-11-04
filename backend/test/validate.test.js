import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinor, isBtcAddress, isEvmAddress, isNearAccount, isSolanaAddress, isTokenContract, isTronAddress, usdToMinor } from '../src/validate.js';

// Known-positive samples first (BIP173/BIP350 test vectors, Bitcoin genesis, USDT-TRON contract, cj7).
test('accepts known-valid addresses', () => {
  assert.ok(isBtcAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'));
  assert.ok(isBtcAddress('BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'));
  assert.ok(isBtcAddress('bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0')); // bech32m, taproot
  assert.ok(isBtcAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'));
  assert.ok(isBtcAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'));
  assert.ok(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'));
  assert.ok(isEvmAddress('0xA11CE00000000000000000000000000000000B01'));
  assert.ok(isSolanaAddress('4a8o45skRPcyjAdyR8yES215Swvh8uTpZD6KLarhxCJ7'));
  assert.ok(isNearAccount('alice.near'));
  assert.ok(isNearAccount('a'.repeat(64)));
});

test('rejects a one-character typo (the refund-address failure mode)', () => {
  assert.equal(isBtcAddress('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdp'), false);
  assert.equal(isBtcAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb'), false);
  assert.equal(isBtcAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLz'), false);
  assert.equal(isTronAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u'), false);
  assert.equal(isBtcAddress('bc1QAR0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'), false); // mixed case
});

test('rejects wrong shapes', () => {
  assert.equal(isEvmAddress('0x123'), false);
  assert.equal(isEvmAddress('A11CE00000000000000000000000000000000B01'), false);
  assert.equal(isSolanaAddress('0xA11CE00000000000000000000000000000000B01'), false);
  assert.equal(isSolanaAddress('short'), false);
  assert.equal(isTronAddress(EVM_LIKE), false);
  assert.equal(isNearAccount('Alice.NEAR'), false);
  assert.equal(isNearAccount(''), false);
  assert.equal(isBtcAddress(undefined), false);
});
const EVM_LIKE = '0xA11CE00000000000000000000000000000000B01';

test('usdToMinor is strict and exact', () => {
  assert.equal(usdToMinor('2'), 2_000_000n);
  assert.equal(usdToMinor('2.5'), 2_500_000n);
  assert.equal(usdToMinor('0.000001'), 1n);
  for (const bad of ['', '-1', '1e3', '2,5', ' 2', '2.1234567', 'abc', null, 2]) assert.equal(usdToMinor(bad), null, String(bad));
});

test('formatMinor', () => {
  assert.equal(formatMinor(1_000_000_000_000_000n, 18), '0.001');
  assert.equal(formatMinor(2_000_000n, 6), '2');
  assert.equal(formatMinor(1n, 8), '0.00000001');
});

test('isTokenContract: the token\'s own contract or NEAR account is caught, an ordinary wallet is not', () => {
  const baseUsdc = { contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near' };
  assert.ok(isTokenContract('0x833589fcD6eDb6E08f4c7C32D4f71b54bdA02913', baseUsdc)); // mixed case
  assert.ok(isTokenContract('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', { contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', assetId: 'nep141:tron-d28a.omft.near' }));
  assert.ok(isTokenContract('wrap.near', { contract: null, assetId: 'nep141:wrap.near' }));
  assert.ok(isTokenContract('17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1' }));
  assert.equal(isTokenContract('0xA11CE00000000000000000000000000000000B01', baseUsdc), false);
  assert.equal(isTokenContract('aurora', { assetId: 'nep141:wrap.near' }), false);
  assert.equal(isTokenContract(undefined, baseUsdc), false);
  assert.equal(isTokenContract('0xabc', undefined), false);
});
