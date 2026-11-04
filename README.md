# Tip Jar: tip a Solana creator from any chain

Tip Jar is a Solana app for tipping creators. This hackathon build (Encode Solana Hackathon 2026, Aurora Intents track)
adds **Tip from any chain**: the tipper pays from Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche,
Bitcoin, NEAR or TRON, and the creator receives **USDC in their Solana wallet**. The tipper never installs a Solana
wallet, bridges, or switches networks. All of those chains are offered from Aurora's live token list; **only Base has been
proven with a real tip so far** (see below).

Aurora products used: **Swap API** (Aurora Intents, powered by NEAR Intents). Plan B, if Aurora approves our
organisation, is **Intents Deposits** persistent addresses (one address per creator that accepts tips from any chain);
see [docs/AURORA-NOTES.md](docs/AURORA-NOTES.md).

## Verify the real tip (mainnet, 2026-10-29)

One real tip went through the live page: **1.04 USDC sent on Base arrived as 1.029777 USDC in the creator's Solana wallet**
(about 1% in fees), about 35 seconds after the Base transaction confirmed.

| | |
|---|---|
| Receipt (read-only, live status from the backend) | https://tipjar-aurora.pages.dev/#tip=0xbfa9d9c3457acaa0f755c79631758673dbc7b00a |
| Tip on Base (18:13:15 UTC) | https://basescan.org/tx/0xcfe9d57b9b29581bb5eeb87b5069da2749ccae2f27d9222d9aebff0790464c80 |
| Arrival on Solana (18:13:50 UTC, finalized) | https://explorer.solana.com/tx/2FfaTW7nkQ7mCM5x7c26MnxPcq21g35vSc7taHYrz3HW29RQFBnsQDzpQZHzyEfMD8N24L2vmtWGgpCr4WR8ZNkd |

The receipt link is `https://tipjar-aurora.pages.dev/#tip=<deposit address>`. It only reads that tip's status
(`GET /api/tip/<address>`), never creates a quote, and shows the same Waiting / Received / Arrived card with both proof
links. The backend counts real tips from its own log with `node backend/scripts/evidence.mjs` (SUCCESS plus both transaction
links). Only Base has a real tip so far, and the refund path is covered by tests against a fake Aurora API but has not been
exercised live. The live demo (https://tipjar-aurora.pages.dev) moves real money on mainnet.

## What existed before, and what was built in the four weeks

Be explicit, as the rules ask.

**Existed before (git tags `pre-hackathon` and `baseline-v1.2`)**: the React Native Tip Jar app, a published Solana
dApp Store app: Home, Register, Tip (Solana Pay QR and a Phantom deep link), Success screens, and the Firebase Realtime
Database creator registry.

**Built during the hackathon (every commit after `baseline-v1.2`)**:
- `backend/`: the service that holds the Aurora API key, requests Swap API quotes, validates addresses, polls and
  normalises status, hides chains while Aurora reports an incident on them, and logs real tips for evidence. Zero
  dependencies, 61 tests against a fake Aurora API (`cd backend && npm test`).
- `src/screens/AnyChainTipScreen.tsx`, `src/screens/TipReceipt.tsx` and `src/anyChain/`: the new screen, the read-only
  receipt, API client, local QR renderer, stage logic. 14 app tests.
- `web/`: a static react-native-web build of the same screen plus the `#tip=` receipt (the live demo).
- `docs/`: Aurora API notes (with what is and is not verified), deploy runbook, video plan. `database.rules.json`: a
  reference copy of the intended registry rules.
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

- **Say what is fixed.** For volatile tokens (ETH, BTC, ...) the quote is `EXACT_OUTPUT` in USDC on Solana: the tipper is
  told how much of their token to send and the creator receives the stated amount. For stablecoins (USDC, USDT) the tipper
  states what they send (`EXACT_INPUT`) and the creator gets that minus network fees.
- **How Solana powers it.** The destination is USDC on Solana: fast, cheap final settlement in the wallet the creator
  already uses. The backend checks the creator's wallet holds a USDC token account before it issues any deposit
  address, and the final proof link is a Solana explorer link.
- **No key in the app.** Aurora's API key lives only in the backend's environment. The app talks to the backend.
- **Fee.** The integrator fee is 0 bps (a tip jar should not skim). A creator platform built on this can set its own
  with the `TIP_FEE_BPS` and `FEE_RECIPIENT` settings (Aurora's `appFees`, max 500 bps; Aurora keeps its own floor).

## Settlement and refund handling

Implemented in the backend and the screen and covered by tests against a fake Aurora API. Only the success path has run
live (one real tip); the refund, shortfall, expiry and failure paths have never been triggered against the real API:
- Refund address is required up front, on the tipper's own chain, format-checked (base58check, bech32/bech32m
  checksums for Bitcoin and TRON) before any deposit address exists.
- Sending too little: status `INCOMPLETE_DEPOSIT` shows the exact shortfall; below the minimum or past the deadline,
  Aurora refunds and the app shows `Refunded`, the amount, the reason and the destination.
- Sending too much: the excess above the quote's maximum is refunded by Aurora; the app shows the refund.
- Expired request: shown as expired with "nothing was sent".
- Failed swap: never reported as arrived; points to Aurora support with the deposit address.
- A quote that would pay the creator less than the tip, or echoes a different recipient or refund address, is never
  shown to the user.
- Minimums are enforced before the deposit address is shown: 1 USD, 2 USD for TRON and 8 USD for Bitcoin (Aurora rejects under 8,300 sat).
- A refund address that is the token's own contract (or NEAR token account) is refused: a refund sent there would be lost.
- Upstream outages: last known state is served; the app keeps polling.

## Run it

Requirements: Node 22+ for the backend (it runs on Node 22 in production and is tested on Node 24), Node 18+ and the
React Native Android toolchain for the app.

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
npx jest __tests__/stages.test.ts __tests__/permalink.test.tsx
```

Web build (the same `AnyChainTipScreen.tsx`, rendered with react-native-web; static files, no server process):

```bash
cd web && npm install
TIPS_API=https://<your backend origin> npm run build   # writes web/dist/index.html + app.js
```

Deploying the backend and hosting the web build: [docs/DEPLOY.md](docs/DEPLOY.md). Aurora endpoints, fields and limits: [docs/AURORA-NOTES.md](docs/AURORA-NOTES.md).

## Security notes

- The Aurora key never ships in the app, is never logged, and is stripped from every error (the key is a URL path
  segment on Aurora's API, so upstream URLs are never put in messages). Tests assert this.
- With the registry gate on (it is on in the live deployment), the backend only quotes for wallets in the Tip Jar creator
  registry. It also caps tips at $50 and rate limits per client, so it cannot be used as a free generic swap relay on our key.
- The `#tip=` receipt shows the refund address shortened and never creates a quote; lookups of addresses the backend never
  issued are rate limited.
- Firebase: the creator registry is public-read and create-only (a creator can be added but not edited or deleted from a
  client), with every field validated and everything else locked; the maintainer read this from the Firebase console on
  2026-10-29 (it cannot be verified from this repository). Without that, anyone could redirect a creator's tips to their
  own wallet. `database.rules.json` is a reference copy of the intended rules, not a verified copy of what is deployed. Open registration is still open by design, so a duplicate or
  impersonating creator can be added; that needs moderation or sign-in, not rules.

## Limits, stated plainly

- There is no Aurora testnet; real tips run on mainnet with small amounts.
- The refund and incomplete-deposit paths are covered by tests against a fake Aurora API that follows the documented
  response shapes. A live refund drill against the real API is still to be done.
- One real tip, from Base (USDC, send-exact), has run end to end. Other source chains and tokens, and the volatile-token
  path (`EXACT_OUTPUT`), are untested live.
- Intents Deposits (persistent addresses, Plan B) is not built: it needs Aurora to approve the organisation.
- Aurora returned the quote's deadline 72 hours after the one we asked for (observed, unexplained); the app shows the
  earlier one. See [docs/AURORA-NOTES.md](docs/AURORA-NOTES.md).
- `__tests__/App.test.tsx` (from the original app template) fails to parse a dependency and is not part of this work.
- The recipient must already hold a USDC token account on Solana; otherwise the app says so instead of taking a deposit.
- Format checks cannot prove an address is the tipper's own. EVM addresses are format-checked only (no EIP-55 checksum).
- In-flight tips are not recovered if the app is killed mid-payment; the payout still completes, the tipper just loses
  the live view.

## License

Not yet chosen.
