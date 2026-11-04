# Aurora Intents notes (Swap API + Persistent Addresses)

Read on 2026-10-29 from docs.intents.aurora.dev (page markdown, appending `.md` to the page URL), before an API key existed.
Since then the backend has called tokens, quote (dry and live), status and incidents with a real key, and two real tips (Base USDC on
2026-10-29, Ethereum ETH on 2026-11-04) and one live refund (Base ETH, 2026-11-04) have run. Statements marked "Observed" below come from those calls; everything else is the
documentation's word. What is still unconfirmed is listed under UNVERIFIED at the end. The persistent-address (Plan B) section
comes from the docs only; it has not been called.

## Base URL, auth

- Base URL: `https://intents-api.aurora.dev`
- Auth: the API key is a **path segment** (`/api/quote/{apiKey}`), not a header. Keys come from Intents Studio (studio.aurora.dev).
- The docs call the key "not confidential" and safe in client code. Tip Jar keeps it on the backend anyway:
  rate limits are per key, so the backend also caches and debounces for every app instance.
- Monitoring and fee settings per key: Client Portal (portal.intents.aurora.dev).

## Endpoints used

| Purpose | Method + path |
|---|---|
| Supported tokens | `GET /api/tokens/{apiKey}` |
| Quote (+ deposit address) | `POST /api/quote/{apiKey}` |
| Tell Aurora the deposit tx hash (optional, speeds detection) | `POST /api/deposit/submit/{apiKey}` body `{txHash, depositAddress, memo?, nearSenderAccount?}` |
| Swap status | `GET /api/status/{apiKey}?depositAddress=...&depositMemo=...` |
| Active incidents | `GET /api/incidents/{apiKey}` |
| History | `GET /api/transactions/{apiKey}` (not used) |
| Persistent address create (Plan B) | `POST /api/persistent-deposit-address/{apiKey}` |
| Persistent deposit status (Plan B) | `GET /api/persistent-deposit-status/{apiKey}?address=...&type=received\|success\|failed` |

## Quote request: "any chain -> USDC on Solana"

`POST /api/quote/{apiKey}`, required fields: `dry, swapType, depositType, amount, originAsset, destinationAsset, slippageTolerance, refundTo, refundType, recipient, recipientType`.

```json
{
  "dry": false,
  "swapType": "EXACT_OUTPUT",
  "depositType": "ORIGIN_CHAIN",
  "originAsset": "nep141:base.omft.near",
  "destinationAsset": "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  "amount": "2000000",
  "slippageTolerance": 100,
  "refundTo": "<tipper address on the origin chain>",
  "refundType": "ORIGIN_CHAIN",
  "recipient": "<creator Solana wallet>",
  "recipientType": "DESTINATION_CHAIN",
  "deadline": "<ISO timestamp>",
  "appFees": []
}
```

- `amount` is in the smallest unit; for `EXACT_OUTPUT` it is the USDC the creator receives (USDC has 6 decimals, so `2000000` = 2 USDC).
- `slippageTolerance` is in basis points (100 = 1%).
- **Send-exact mode (stablecoin origins only, e.g. Base USDC):** `swapType: "EXACT_INPUT"` with `amount` in the ORIGIN token's smallest unit (Base USDC has 6 decimals, so `1040000` = 1.04 USDC). The tipper sends exactly that and the creator receives the quoted `amountOut`. Used when the wallet has no headroom for `EXACT_OUTPUT` fees. The backend refuses a quote whose `amountIn` differs from what was asked, or whose `amountOut` is under 95% of the amount sent.
- `deadline` optional: when refunds begin if the swap has not completed. A default applies if omitted.
- `dry: true` prices without reserving a deposit address; the response then lacks `depositAddress`, `timeWhenInactive`, `deadline`.
- `swapType` values: `EXACT_INPUT`, `EXACT_OUTPUT`, `FLEX_INPUT`, `ANY_INPUT`.
  - `EXACT_OUTPUT`: response has `minAmountIn` and `maxAmountIn`. Input above `maxAmountIn`: swap runs, excess is refunded to `refundTo`. Input below `minAmountIn`: refunded by the deadline.
  - `EXACT_INPUT`: deposit below `amountIn` is refunded by the deadline; above it, the swap runs and the excess is refunded.
- `depositMode`: `SIMPLE` (default) or `MEMO` (some chains, e.g. Stellar, need the memo with the address).
- Optional: `appFees: [{recipient, fee}]` (fee in bps, max 500 bps), `referral` (lowercase), `sessionId`, `quoteWaitingTimeMs`, `connectedWallets`.
- Not used: `depositType` / `refundType` / `recipientType` values `INTENTS` and `CONFIDENTIAL_INTENTS`; `confidentiality` `basic|advanced` (a Confidential Intents use case is a bonus line in the rubric, not in this build).

### Quote response (200)

`{timestamp, signature, correlationId, quoteRequest{...echo...}, quote{...}}`.
`quote` fields: `depositAddress, depositMemo, timeEstimate (s), deadline, timeWhenInactive, amountIn, amountInFormatted, amountInUsd, minAmountIn, maxAmountIn, amountOut, amountOutFormatted, amountOutUsd, minAmountOut, refundFee, withdrawFee`.
`withdrawFee` is already inside `amountOut`. `refundFee` is charged on a refund, in origin-asset units.

Errors: 400 (invalid params or fee config; body `{message, correlationId, timestamp, path}`), 404 (API key not assigned), 429 (rate limit), 500.

## Refund fields

- `refundTo` + `refundType: "ORIGIN_CHAIN"`: the tipper's own address on the chain they pay from. Required on every quote, so the app asks for it before showing the deposit address.
- Refunds are triggered by: deposit below `minAmountIn`, swap not completed by `deadline`, excess above `maxAmountIn`.
- Status values and refund detail (below) report the outcome.

## Status: `GET /api/status/{apiKey}?depositAddress=...`

Response: `{correlationId, quoteResponse, status, updatedAt, swapDetails}` (confidential swaps return only `{status}`).

`status` values (all seven): `PENDING_DEPOSIT`, `KNOWN_DEPOSIT_TX`, `INCOMPLETE_DEPOSIT`, `PROCESSING`, `SUCCESS`, `REFUNDED`, `FAILED`.
Terminal per the docs ("until SUCCESS, REFUNDED or FAILED"): `SUCCESS`, `REFUNDED`, `FAILED`.

`swapDetails`: `intentHashes[], nearTxHashes[], amountIn, amountInFormatted, amountInUsd, amountOut, amountOutFormatted, amountOutUsd, slippage, originChainTxHashes[{hash, explorerUrl}], destinationChainTxHashes[{hash, explorerUrl}], refundedAmount, refundedAmountFormatted, refundedAmountUsd, refundReason, depositedAmount, depositedAmountFormatted, depositedAmountUsd, referral`.

The docs describe `explorerUrl` for each hash, but **observed 2026-10-29: Aurora returned the hashes with `explorerUrl: ""`**, so the
backend builds the explorer links itself from the chain and the hash (`backend/src/explorers.js`; the Base, Ethereum and Solana links, and the Base refund link, have been checked live, the rest have not).
A refund shows as `REFUNDED` with `refundedAmount*` and `refundReason` (docs; first observed live on 2026-11-04, see the refund section).

## Supported tokens: `GET /api/tokens/{apiKey}`

`{asset_stats[], tokens[{assetId, decimals, blockchain, symbol, price, priceUpdatedAt, contractAddress}]}`. Some assets are listed only for approved keys. `blockchain` is the 1Click slug (`eth, base, arb, op, pol, bsc, avax, btc, near, tron, sol, ...`).

Asset IDs (taken 2026-10-29 from the public `https://1click.chaindefuser.com/v0/tokens`, which the docs name as the source of the slugs):

| Chain slug | Asset | assetId | decimals |
|---|---|---|---|
| sol | USDC (destination) | `nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near` | 6 |
| eth | ETH | `nep141:eth.omft.near` | 18 |
| eth | USDC | `nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near` | 6 |
| base | ETH | `nep141:base.omft.near` | 18 |
| base | USDC | `nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near` | 6 |
| arb | ETH | `nep141:arb.omft.near` | 18 |
| arb | USDC | `nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near` | 6 |
| btc | BTC | `nep141:btc.omft.near` | 8 |
| tron | TRX | `nep141:tron.omft.near` | 6 |
| tron | USDT | `nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near` | 6 |
| near | USDC | `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | 6 |

The backend does not trust this table: it loads `/api/tokens/{apiKey}` on first use (cached for 5 minutes) and only offers routes whose assetIds exist in that live list. Polygon, Optimism, BSC, Avalanche USDC use `nep245:v2_1.omni.hot.tg:...` ids per the public list; those come from the live list too. Observed 2026-10-29: the live list for our key yielded all ten chains the app offers.

## Rate limits

Per API key, per endpoint: 100 requests / 10 s and 2000 / hour, both fixed clock-aligned windows. Rejected requests still count toward the hour. 429 carries `Retry-After` (seconds). Guidance from the docs: poll status every 5-10 s (one swap polled every second burns 3600/h), cache the token list, quote on user intent not per keystroke, auto-refresh quotes no faster than every 10 s. The backend follows all of it: status polling is cached server-side so any number of phones watching one tip cost one upstream call per 5 s.

## Observed 2026-11-04 (live dry quotes, no deposit addresses)

- **Refund address equal to the origin token's own contract gives `400 Internal server error`.** Seen for NEAR wNEAR with `refundTo: wrap.near` (that account IS the wNEAR contract) and for TRON USDT with `refundTo` set to the USDT contract `TR7NHq...`. The same routes quote normally (wNEAR 19 s, TRON USDT 77 s, 10 USD in) with an ordinary refund account. A first reading of this as "those routes are broken" was wrong. Such a refund would be lost anyway, so the backend refuses a refund address that is the token's contract or NEAR account (`isTokenContract` in `backend/src/validate.js`).
- **Real floors.** BTC: `400 Amount is too low for bridge, try at least 8300` (satoshis, about 6.5 USD at 78,500 USD per BTC), so the app's BTC minimum is 8 USD. TRX: Aurora rejects under 4 TRX (about 1.3 USD); the app's TRON minimum is 2 USD. No dollar floor appeared on EVM quotes down to 0.25 USD; the app keeps its own 1 USD minimum.
- For an `EXACT_INPUT` quote `minAmountIn` simply equals the amount asked for, so it is not a market minimum.
- `EXACT_OUTPUT` (what the page uses for ETH): the quote's `amountIn` is about 0.6 to 1.7 percent above the exact price (it carries a slippage margin), `minAmountIn` is the exact-price amount, and the creator receives exactly the requested USDC.
- Estimates seen: Arbitrum 24 s, Base 34 s, Ethereum 44 s, NEAR 17 s, TRON 77 to 79 s, BTC about 13 minutes.
- **Explorer links.** Etherscan and BaseScan sit behind a Cloudflare challenge for automated browsers (observed 2026-11-04), so the backend builds Ethereum, Base, Arbitrum, Optimism and Polygon links on Blockscout, which loads for both people and scripts. The Oct 29 Base tip is also linked on BaseScan in the README, which works in a normal browser.
- **Real network fee on Ethereum mainnet** for a 21,000 gas ETH send was 0.000044 ETH (about 0.10 USD) at an effective 2.0955 gwei, with a base fee of 0.085 gwei: MetaMask adds a tip of about 2 gwei that the RPC does not suggest. Preflight floors the Ethereum tip at 2 gwei.

## Observed 2026-11-04: the first live refund (Base ETH, deliberately short deposit)
- Quote: `EXACT_OUTPUT`, "creator receives 2 USD", minimum 0.000864478 ETH, requested deadline 11:52:57 UTC (quote.deadline reported as 2026-11-07 11:52:57). Deposit: 0.00045 ETH at 11:30:01 UTC.
- Status `INCOMPLETE_DEPOSIT` appeared within about 40 seconds, with the exact shortfall (`0.000414477749375101` ETH).
- Refund: `REFUNDED`, `refundReason: QUOTE_EXPIRED`, `refundedAmountFormatted: 0.00044944` (0.00045 minus a 0.00000056 ETH fee, exactly the quote's `refundFee` 560,000,000,000 wei). Refund transaction on Base at 11:53:23 UTC from Aurora's address `0x2cff890f…` to the refund address, 26 seconds after the requested deadline; `updatedAt` 11:53:43.
- **The deadline we REQUEST governs refunds, not the 72-hours-later `quote.deadline`** (this answers the open question under UNVERIFIED 3).
- For a refund, `destinationChainTxHashes` holds the **refund transaction on the origin chain** (a Base hash here), not a Solana transaction. The backend now builds that link on the origin chain and the page labels it "Refund on <chain>". `explorerUrl` was empty again.
- A third party sent 0.000000393 ETH to the deposit address at 11:30:05 (origin unknown; possibly Aurora funding gas for its sweep).

## Minimums, testing

- No public testnet. Test on mainnet with small amounts above the thresholds.
- Recommended minimum deposit $1 ($2 for TRON). Below-threshold or unsupported deposits are not returned automatically (persistent-address FAQ). For Swap API quotes, `minAmountIn` is the binding number.

## Fees

Integrator fee in bps via `appFees` (max 500). Split 60% integrator / 40% Aurora; Aurora floor 2 bps on stables, 10 bps on non-stables, so a 0 bps integrator fee still carries Aurora's floor in the price. Tip Jar sets the integrator fee to 0. Fees Collection (payout in one asset, default $1000 threshold) is configured by Aurora on request and is not needed at 0 bps.

## Plan B: Persistent Addresses (Intents Deposits)

`POST /api/persistent-deposit-address/{apiKey}`; body fields: `sender` (stable user id; we use the creator id), `recipient` (creator Solana wallet), `depositChain` (`evm` gives one address for all EVM chains; also `btc, tron, near, sol, ...`), `destinationChain: "sol"`, `destinationAsset` (symbol `USDC` or an assetId), plus optional `recipientType`, `confidential`.
- Same inputs always return the same address; no expiry; `alreadyExists` says it was a cache hit.
- **403 unless the organisation is approved by Aurora.** Already-issued addresses still return.
- 429 can also mean "a concurrent request is already creating this address; retry". 504: the address was not minted in time, retry.
- Status: `type=received` (reached the Intents account, intermediate) vs `success` (payout reached the recipient) vs `failed`.
- Failed deposits are retried, not refunded on a deadline. Unsupported assets and sub-threshold deposits are not returned automatically.
- Conversion price is not locked at creation.

## UX rules from Aurora's own page (applied in the app)

An Intents address is not a generic deposit address: show the source network, the supported asset, the minimum, and a "send only X from network Y" line right next to the address and the QR, never the QR alone.

## Support

Individual user cases go through https://aurora.dev/intents-support with the transaction hash and the deposit address. The app's refund screen links it and shows both.

## UNVERIFIED (confirm with the first real call)

1. That `EXACT_OUTPUT` quotes return a `depositAddress` for every origin asset we list. Base USDC with `EXACT_INPUT` (2026-10-29) and native ETH with `EXACT_OUTPUT` on Ethereum and on Base (2026-11-04) have been quoted live with a real deposit address and paid or refunded; no other origin asset (USDC or USDT on other chains, POL, BNB, AVAX, BTC, NEAR, TRON) has been exercised.
2. That the Solana recipient needs an existing USDC token account (the backend checks it before quoting; if Aurora creates it, the check can be relaxed). The creator wallet used already had one, so this was not tested.
3. The real `deadline` default and `timeEstimate` per chain. (Resolved 2026-11-04: the requested deadline governs refunds; see the refund section above.) Observed 2026-10-29 for Base USDC (request `deadline` = now + 30 min):
   the quote response carried `deadline` and `timeWhenInactive` exactly 72 h after the requested time, while `quoteRequest.deadline`
   (visible in `/api/status`) kept the requested one. The 72 h is unexplained and undocumented, and dry quotes return no deadline,
   so it could not be probed that way. Whether a deposit landing after the requested time (but before the quoted one) is honoured is
   untested. The backend therefore reports the earlier of the two and the app counts down to it.
4. `originChainTxHashes` fills in once the deposit is detected; its timing relative to `KNOWN_DEPOSIT_TX`.
   Observed 2026-10-29 (Base USDC -> Solana USDC, 1.04 USDC, real tip): `PENDING_DEPOSIT` -> `PROCESSING` about 21 s after the deposit was
   seen on-chain -> `SUCCESS` about 22 s later (Base tx confirmed 18:13:15 UTC, Solana tx 18:13:50 UTC). In `SUCCESS` both
   `originChainTxHashes` and `destinationChainTxHashes` were present, but with `explorerUrl: ""`, so explorer links are built from the
   chain and hash (`backend/src/explorers.js`). Fees were about 1% (1.04 in, 1.029777 out). `KNOWN_DEPOSIT_TX` was not seen by
   our 6 to 8 second polling (it may be too short-lived, or skipped).
5. ~~Whether `/api/tokens` exposes every chain~~: observed, yes for all ten chains the app offers (the Asset IDs table lists only some of them).
6. Refund outcomes: ONE has been triggered live (incomplete deposit, refunded as `QUOTE_EXPIRED` after the deadline). Too much sent, a failed swap and a refund on a non-Base chain have not; the app's handling of those follows the documented response shapes and is tested against a fake server only. The live one: deposit tx `0x9b0acb49b84a3c19535ef57a6a7b17c92d35af5219388b9e9472f5d5155c5b60`, refund tx on Base `0x10aa658f4f236a59d4147cb7fb83f261d34bf71b5f0843922d401106e4ffd2c8`, receipt https://tipjar-aurora.pages.dev/#tip=0x56F3724eE72fF7DE7CE747b553aC8A8cE72EC7c6.
7. Incidents: `GET /api/incidents` was observed returning chain-scope and token-scope entries (a `bsc` withdrawal pause on 2026-10-28/29, since resolved). The backend hides an affected chain and refuses quotes there; the `direction` semantics (withdraw vs deposit) are as documented, not tested beyond that one incident.
