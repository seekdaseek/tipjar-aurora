#!/bin/sh
# Run on the MAC. Uploads the backend to the VPS (/opt/tipjar-aurora), verifies the upload, installs the env, restarts PM2.
# Needs: VPS=<ssh host alias>, ENVSRC=<env file holding AURORA_API_KEY, written with a hidden prompt>, REGISTRY_URL.
# Reads the key from the file; never prints it.
set -eu
HERE=$(cd "$(dirname "$0")/.." && pwd)
ENVSRC=${ENVSRC:?set ENVSRC=<path to env file with AURORA_API_KEY>}
VPS=${VPS:?set VPS=<ssh host alias of the server>}
REGISTRY_URL=${REGISTRY_URL:?set REGISTRY_URL=https://<firebase-db>/creators.json}
[ -s "$ENVSRC" ] || { echo "no $ENVSRC"; exit 1; }
grep -q '^AURORA_API_KEY=.' "$ENVSRC" || { echo "AURORA_API_KEY missing in $ENVSRC"; exit 1; }

TMP=$(mktemp -d)
tar -C "$HERE" -czf "$TMP/tipjar-aurora.tgz" src package.json
LOCAL_SHA=$(shasum -a 256 "$TMP/tipjar-aurora.tgz" | cut -d' ' -f1)
ssh -o BatchMode=yes "$VPS" 'mkdir -p /opt/tipjar-aurora && chmod 700 /opt/tipjar-aurora'
scp -q "$TMP/tipjar-aurora.tgz" "$VPS":/opt/tipjar-aurora/upload.tgz
REMOTE_SHA=$(ssh -o BatchMode=yes "$VPS" 'sha256sum /opt/tipjar-aurora/upload.tgz | cut -d" " -f1')
[ "$LOCAL_SHA" = "$REMOTE_SHA" ] || { echo "sha mismatch, not installing"; exit 1; }
ssh -o BatchMode=yes "$VPS" 'cd /opt/tipjar-aurora && tar -xzf upload.tgz && rm upload.tgz'

# env: the Mac file (secret) plus the non-secret server settings
{ cat "$ENVSRC"; printf '\nPORT=3037\nTRUST_PROXY=1\nTIP_FEE_BPS=0\nCREATOR_REGISTRY_URL=%s\nSOLANA_RPC_URL=https://api.mainnet-beta.solana.com\nDATA_FILE=/opt/tipjar-aurora/data/tips.jsonl\n' "$REGISTRY_URL"; } > "$TMP/env"
scp -q "$TMP/env" "$VPS":/opt/tipjar-aurora/.env
ssh -o BatchMode=yes "$VPS" 'chmod 600 /opt/tipjar-aurora/.env && mkdir -p /opt/tipjar-aurora/data && wc -c < /opt/tipjar-aurora/.env'
rm -rf "$TMP"

# PM2: delete + start + save (restart would not reload env). Memory cap 150 MB: the box is tight.
ssh -o BatchMode=yes "$VPS" 'pm2 delete tipjar-aurora >/dev/null 2>&1 || true; cd /opt/tipjar-aurora && pm2 start src/main.js --name tipjar-aurora --node-args="--env-file=/opt/tipjar-aurora/.env" --max-memory-restart 150M --cwd /opt/tipjar-aurora && pm2 save'
echo "deployed; next: watch it for 10 minutes (see docs/DEPLOY.md)"
