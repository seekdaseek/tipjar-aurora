// Append-only JSONL log of tips. It doubles as the evidence source: scripts/evidence.mjs counts
// real, finished tips from this file. Events: {event:'quote', ...record} and {event:'final', depositAddress, ...}.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;

export class TipStore {
  constructor(file) {
    this.file = file;
    this.tips = new Map(); // depositAddress -> record
    this.evmLower = new Map(); // lowercase 0x deposit address -> stored spelling (EVM addresses are case-insensitive; others are not)
    if (file) {
      mkdirSync(dirname(file), { recursive: true });
      if (existsSync(file)) this.#load();
    }
  }
  #load() {
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.event === 'quote') this.#put(e);
        else if (e.event === 'final' && this.tips.has(e.depositAddress)) this.tips.get(e.depositAddress).final = e;
      } catch {
        /* skip a torn line */
      }
    }
  }
  #put(e) {
    this.tips.set(e.depositAddress, e);
    if (EVM_ADDR.test(e.depositAddress)) this.evmLower.set(e.depositAddress.toLowerCase(), e.depositAddress);
  }
  #append(obj) {
    if (this.file) appendFileSync(this.file, JSON.stringify(obj) + '\n', { mode: 0o600 });
  }
  get(depositAddress) {
    const exact = this.tips.get(depositAddress);
    if (exact || typeof depositAddress !== 'string' || !EVM_ADDR.test(depositAddress)) return exact;
    return this.tips.get(this.evmLower.get(depositAddress.toLowerCase()));
  }
  addQuote(rec) {
    const e = { event: 'quote', at: new Date().toISOString(), ...rec };
    this.#put(e);
    this.#append(e);
    return e;
  }
  markFinal(depositAddress, data) {
    const rec = this.tips.get(depositAddress);
    if (!rec || rec.final) return;
    const e = { event: 'final', at: new Date().toISOString(), depositAddress, ...data };
    rec.final = e;
    this.#append(e);
  }
}
