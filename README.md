# Tip Jar: tip a Solana creator from any chain

Tip Jar is a Solana app for tipping creators. This hackathon build (Encode Solana Hackathon 2026, Aurora Intents track)
adds **Tip from any chain**: the tipper pays from Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche,
Bitcoin, NEAR or TRON, and the creator receives **USDC in their Solana wallet**. The tipper never installs a Solana
wallet, bridges, or switches networks.

Aurora products used: **Swap API** (Aurora Intents, powered by NEAR Intents). Plan B, if Aurora approves our
organisation, is **Intents Deposits** persistent addresses (one address per creator that accepts tips from any chain);
see [docs/AURORA-NOTES.md](docs/AURORA-NOTES.md).

## What existed before, and what was built in the four weeks

Be explicit, as the rules ask.

**Existed before (git tags `pre-hackathon` and `baseline-v1.2`)**: the React Native Tip Jar app, a published Solana
dApp Store app: Home, Register, Tip (Solana Pay QR and a Phantom deep link), Success screens, and the Firebase Realtime
Database creator registry.

**Built during the hackathon (every commit after `baseline-v1.2`)**:
- `backend/`: the service that holds the Aurora API key, requests Swap API quotes, validates addresses, polls and
  normalises status, and logs real tips for evidence. Zero dependencies, 35 tests against a fake Aurora API.
- `src/screens/AnyChainTipScreen.tsx` and `src/anyChain/`: the new screen, API client, local QR renderer, stage logic.
- `docs/`: Aurora API notes, deploy runbook. `database.rules.json`: locked-down registry rules.
- Moved the Firebase web config out of git (`firebase.config.example.ts`).

## How it works

```
Tipper (phone)                Tip Jar backend                Aurora Swap API              Solana
  pick chain, token, $        POST /api/tip  ------------->  POST /api/quote
  paste own refund address    <---- deposit address -------  (EXACT_OUTPUT, USDC out,
  QR + exact amount shown                                      refundTo = tipper, ORIGIN_CHAIN)
  pay from any wallet  ===============================>  deposit address (origin chain)
  live status           GET /api/tip/:addr  -------------->  GET /api/status    ==> USDC to creator
  received / arrived    <---- stage + both tx links -----                          (recipient = creator)
```

- **Creator gets exactly the tip.** The quote is `EXACT_OUTPUT` in USDC on Solana, so the tipper is told how much of
  their own token to send, and the creator receives the stated amount.
- **How Solana powers it.** The destination is USDC on Solana: fast, cheap final settlement in the wallet the creator
  already uses. The backend checks the creator's wallet holds a USDC token account before it issues any deposit
  address, and the final proof link is a Solana explorer link.
- **No key in the app.** Aurora's API key lives only in the backend's environment. The app talks to the backend.
- **Fee.** The integrator fee is 0 bps (a tip jar should not skim). A creator platform built on this can set its own
  with the `TIP_FEE_BPS` and `FEE_RECIPIENT` settings (Aurora's `appFees`, max 500 bps; Aurora keeps its own floor).

## Settlement and refund handling

Handled and shown in the app, not hidden:
- Refund address is required up front, on the tipper's own chain, format-checked (base58check, bech32/bech32m
  checksums for Bitcoin and TRON) before any deposit address exists.
- Sending too little: status `INCOMPLETE_DEPOSIT` shows the exact shortfall; below the minimum or past the deadline,
  Aurora refunds and the app shows `Refunded`, the amount, the reason and the destination.
- Sending too much: the excess above the quote's maximum is refunded by Aurora; the app shows the refund.
- Expired request: shown as expired with "nothing was sent".
- Failed swap: never reported as arrived; points to Aurora support with the deposit address.
- A quote that would pay the creator less than the tip, or echoes a different recipient or refund address, is never
  shown to the user.
- Minimums per Aurora's guidance ($1, $2 for TRON) are enforced before the deposit address is shown.
- Upstream outages: last known state is served; the app keeps polling.

## Run it

Requirements: Node 20+ (backend), Node 18+ and the React Native Android toolchain (app).

```bash
# backend: tests need no network and no key
cd backend && npm test

# backend: run (needs an Aurora API key from https://studio.aurora.dev)
cp env.example .env   # fill in AURORA_API_KEY
node --env-file=.env src/main.js

# real tips counted from the backend log (no hand-entered numbers)
node scripts/evidence.mjs data/tips.jsonl
```

```bash
# app
cp firebase.config.example.ts firebase.config.ts   # fill in your Firebase web config
npm install
# point src/config.ts at your backend, then:
npm run android
npx jest __tests__/stages.test.ts
```

Deploying the backend: [docs/DEPLOY.md](docs/DEPLOY.md). Aurora endpoints, fields and limits: [docs/AURORA-NOTES.md](docs/AURORA-NOTES.md).

## Security notes

- The Aurora key never ships in the app, is never logged, and is stripped from every error (the key is a URL path
  segment on Aurora's API, so upstream URLs are never put in messages). Tests assert this.
- The backend only quotes for wallets in the Tip Jar creator registry, caps tips at $50, and rate limits per device, so
  it cannot be used as a free generic swap relay on our key.
- Firebase: `database.rules.json` makes the creator registry create-only with validated fields, so existing creators
  cannot be edited or deleted from a client (otherwise anyone could redirect a creator's tips to their own wallet).
  Deploy it in the Firebase console (Realtime Database, Rules). Open registration is still open by design.

## Limits, stated plainly

- There is no Aurora testnet; real tips run on mainnet with small amounts.
- The refund and incomplete-deposit paths are covered by tests against a fake Aurora API that follows the documented
  response shapes. A live refund drill against the real API is still to be done.
- The recipient must already hold a USDC token account on Solana; otherwise the app says so instead of taking a deposit.
- Format checks cannot prove an address is the tipper's own. EVM addresses are format-checked only (no EIP-55 checksum).
- In-flight tips are not recovered if the app is killed mid-payment; the payout still completes, the tipper just loses
  the live view.

## License

Not yet chosen.
