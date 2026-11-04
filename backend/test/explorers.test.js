import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { txLinks } from '../src/explorers.js';

const BASE_HASH = '0x' + 'ab'.repeat(32);
const SOL_SIG = '2' + 'F'.repeat(87); // 88 base58 characters

test('links are built from chain + hash when Aurora sends an empty explorerUrl (observed live)', () => {
  assert.deepEqual(txLinks([{ hash: BASE_HASH, explorerUrl: '' }], 'base'), [{ hash: BASE_HASH, url: 'https://base.blockscout.com/tx/' + BASE_HASH }]);
  assert.deepEqual(txLinks([{ hash: SOL_SIG, explorerUrl: '' }], 'sol'), [{ hash: SOL_SIG, url: 'https://explorer.solana.com/tx/' + SOL_SIG }]);
});

test('an https explorerUrl from Aurora wins; http, junk hashes and unknown chains give no link', () => {
  assert.equal(txLinks([{ hash: BASE_HASH, explorerUrl: 'https://example.org/x/1' }], 'base')[0].url, 'https://example.org/x/1');
  assert.equal(txLinks([{ hash: BASE_HASH, explorerUrl: 'http://example.org/x' }], 'base')[0].url, 'https://base.blockscout.com/tx/' + BASE_HASH);
  assert.deepEqual(txLinks([{ hash: 'not-a-hash', explorerUrl: '' }], 'base'), []);
  assert.deepEqual(txLinks([{ hash: '0x12', explorerUrl: '' }], 'base'), []);
  assert.deepEqual(txLinks([{ hash: BASE_HASH, explorerUrl: '' }], 'nope'), []);
  assert.deepEqual(txLinks(undefined, 'base'), []);
});

test('evidence.mjs counts a SUCCESS tip whose stored links are empty, from the stored hashes only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ev-'));
  const file = join(dir, 'tips.jsonl');
  const quote = { event: 'quote', depositAddress: '0xDEP', chain: 'base', symbol: 'USDC', creatorWallet: 'cj7' };
  const final = (over) => ({ event: 'final', depositAddress: '0xDEP', stage: 'arrived', links: { origin: [], destination: [] }, amounts: { delivered: '1.029777', deliveredUsd: '1.03' },
    raw: { status: 'SUCCESS', swapDetails: { originChainTxHashes: [{ hash: BASE_HASH, explorerUrl: '' }], destinationChainTxHashes: [{ hash: SOL_SIG, explorerUrl: '' }] } }, ...over });
  const run = (lines) => {
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    return spawnSync(process.execPath, ['scripts/evidence.mjs', file], { encoding: 'utf8' }).stdout;
  };
  const ok = run([quote, final({})]);
  assert.match(ok, /REAL TIPS \(SUCCESS \+ both tx links\): 1/);
  assert.match(ok, new RegExp('base\\.blockscout\\.com/tx/' + BASE_HASH));
  assert.match(ok, new RegExp('explorer\\.solana\\.com/tx/' + SOL_SIG));
  // negative controls: not SUCCESS, or no hashes, must not count
  assert.match(run([quote, final({ raw: { status: 'PROCESSING', swapDetails: final({}).raw.swapDetails } })]), /REAL TIPS \(SUCCESS \+ both tx links\): 0/);
  assert.match(run([quote, final({ raw: { status: 'SUCCESS', swapDetails: {} } })]), /REAL TIPS \(SUCCESS \+ both tx links\): 0/);
});

test('Ethereum, Arbitrum, Optimism and Polygon links use Blockscout (Etherscan-style sites challenge automated browsers)', () => {
  for (const [chain, host] of [['eth', 'eth.blockscout.com'], ['arb', 'arbitrum.blockscout.com'], ['op', 'optimism.blockscout.com'], ['pol', 'polygon.blockscout.com']]) {
    assert.deepEqual(txLinks([{ hash: BASE_HASH, explorerUrl: '' }], chain), [{ hash: BASE_HASH, url: 'https://' + host + '/tx/' + BASE_HASH }], chain);
  }
});
