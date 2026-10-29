# Demo video plan (2 to 4 minutes)

Target length 3:15. Real footage only for the headline claim: the real tip is screen-recorded on a real device,
with explorer links opened on camera. Anything run against a fake API is labelled on screen as such.

## What must be in it (from the judging rubric)

1. A working flow, not a mock: one real tip from another chain arriving as USDC in a Solana wallet (recorded on the web build).
2. The friction it removes: a tipper holding value on another chain cannot tip a Solana creator without a Solana wallet.
3. Settlement and refund handling shown, not described.
4. A clean flow with no unnecessary actions.
5. How Solana powers it (final USDC settlement in the creator's wallet; Solana explorer proof).
6. What existed beforehand (said out loud and on a slide).

## Scenes

| Time | Scene | On screen | Say |
|---|---|---|---|
| 0:00 to 0:15 | Problem | Tip Jar home, creators list | "Tip Jar is a published Solana app. A tipper with ETH or USDC on Base had no way to tip a Solana creator without setting up a Solana wallet." |
| 0:15 to 0:30 | What existed | Slide: before vs new | "Before this hackathon: the app, the creator registry, Solana Pay tips. New: Tip from any chain, built on Aurora's Swap API." |
| 0:30 to 1:30 | The real tip (live proof) | Screen recording of the web build: Tip from any chain, Tip from any chain, pick chain, token, amount, refund address, QR + exact amount, send from the wallet, progress ticks Waiting, Received, Arrived | "I pick Base and USDC, paste my refund address, and the app shows one address and the exact amount. I send it from my wallet." |
| 1:30 to 2:00 | Proof | Tap both links: origin chain explorer, Solana explorer showing USDC into the creator wallet | "Here is my transaction on Base, and here is the USDC arriving on Solana." |
| 2:00 to 2:40 | Refunds | Refund drill recording (real, if done by then) or the labelled fake-API recording | "If a deposit is too small the app shows the shortfall; if it expires or fails, the funds go back to my own address and the app says so." |
| 2:40 to 3:00 | Coverage + design | Chain picker; short architecture slide | "Seven EVM chains under one address, Bitcoin, NEAR, TRON. The Aurora key lives on a small backend, never in the app." |
| 3:00 to 3:15 | Close | Repo URL, live demo URL | "Fee is zero here; a creator platform can set its own." |

## Capture checklist

- Surface: the web build (the same screen code as the app, hosted as static files). Screen-record the desktop browser window with the system recorder; the Android app is shown with stills or a short phone clip only if one exists.
- Wallet for the real tip: the one used in the first real tip; show the app, never a seed phrase or a key.
- Open both explorer links on camera. Do not blur the transaction hashes: they are the evidence.
- Fake-API footage (kept outside the repo with its harness) always carries the red "FAKE AURORA API" banner; keep it visible.
- Record the real tip only after the preflight prints GO (see `backend/scripts/preflight.mjs`). One take: the wallet holds funds for one tip only.
- Export 1080p landscape; H.264, under 100 MB.

## What not to claim

- Do not say "supports N chains" beyond the chains that have a real tip, or are shown labelled as fake.
- Do not show the fake demo as the live flow.
- Do not say the refund path was tested live until a real refund drill has run.

## Slides (separate deliverable, 5 to 7 slides)

1. Title and one-line pitch. 2. The friction. 3. Flow diagram (README). 4. Aurora products used (Swap API; Intents
Deposits if approved). 5. What existed vs what is new. 6. Evidence: real tips and links, counted by
`backend/scripts/evidence.mjs`. 7. Roadmap: persistent address per creator, creator-set fee.
