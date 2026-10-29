# Aurora Intents notes (Swap API + Persistent Addresses)

Read live on 2026-10-29 from docs.intents.aurora.dev (page markdown, appending `.md` to the page URL).
Nothing below has been executed against the API yet: no API key existed when this was written.
Every line marked UNVERIFIED must be confirmed by a real call before the demo.

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

So the UI gets both explorer links straight from Aurora: `originChainTxHashes[].explorerUrl` (the tip) and `destinationChainTxHashes[].explorerUrl` (arrival on Solana). A refund shows as `REFUNDED` with `refundedAmount*` and `refundReason`.

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

The backend does not trust this table: it loads `/api/tokens/{apiKey}` at startup (cached, refreshed every 5 minutes) and only offers routes whose assetIds exist in that live list. Polygon, Optimism, BSC, Avalanche USDC use `nep245:v2_1.omni.hot.tg:...` ids; those come from the live list too.

## Rate limits

Per API key, per endpoint: 100 requests / 10 s and 2000 / hour, both fixed clock-aligned windows. Rejected requests still count toward the hour. 429 carries `Retry-After` (seconds). Guidance from the docs: poll status every 5-10 s (one swap polled every second burns 3600/h), cache the token list, quote on user intent not per keystroke, auto-refresh quotes no faster than every 10 s. The backend follows all of it: status polling is cached server-side so any number of phones watching one tip cost one upstream call per 5 s.

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

1. That `EXACT_OUTPUT` quotes return a `depositAddress` for every origin asset we list.
2. That the Solana recipient needs an existing USDC token account (the backend checks it before quoting; if Aurora creates it, the check can be relaxed).
3. The real `deadline` default and `timeEstimate` per chain. Observed 2026-10-29 for Base USDC (request `deadline` = now + 30 min):
   the quote response carried `deadline` and `timeWhenInactive` exactly 72 h after the requested time, while `quoteRequest.deadline`
   (visible in `/api/status`) kept the requested one. The 72 h is unexplained and undocumented, and dry quotes return no deadline,
   so it could not be probed that way. Whether a deposit landing after the requested time (but before the quoted one) is honoured is
   untested. The backend therefore reports the earlier of the two and the app counts down to it.
4. `originChainTxHashes` fills in once the deposit is detected; its timing relative to `KNOWN_DEPOSIT_TX`.
5. Whether `/api/tokens` exposes every chain in section "Asset IDs" for our key.
