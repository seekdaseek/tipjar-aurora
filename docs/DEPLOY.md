# Deploy (a Linux VPS, `/opt/tipjar-aurora`, `tips.ochinimus.app`)

Same pattern as the other single-purpose services: own folder, own PM2 process with a memory cap, own Cloudflare
tunnel (the shared `config.yml` is not touched). Nothing else under `/opt` is modified.

Labels: **MAC** = run on your workstation, **VPS** = run on the server via `ssh "$VPS" '...'` (set `VPS` to your ssh host alias).

## 0. Before: read the box (VPS)

```bash
ssh "$VPS" 'free -m; pm2 jlist | python3 -c "import sys,json;print(len(json.load(sys.stdin)),\"pm2 processes\")"; ss -ltnH | grep -c 127.0.0.1:3037'
```
Port 3037 must show 0 listeners. Free memory (available) should be above ~1,200 MB; the service itself is capped at 150 MB.

## 1. Key (MAC, once, hidden prompt)

```bash
printf 'Paste key: '; read -rs K; echo; printf 'AURORA_API_KEY=%s\n' "$K" >> "$ENVSRC"; unset K; chmod 600 "$ENVSRC"
```

## 2. Code + env + PM2 (MAC)

```bash
VPS=<ssh host> ENVSRC=<env file> REGISTRY_URL='https://<project>-default-rtdb.firebaseio.com/creators.json' sh backend/deploy/deploy.sh
```
The script uploads, verifies the sha256 on the box before extracting, copies the env (mode 600), then `pm2 delete` + `pm2 start` + `pm2 save`.

## 3. Tunnel + DNS (VPS, one time)

```bash
ssh "$VPS" 'cloudflared tunnel create tipjar-aurora'   # prints the UUID
```
Then, with that UUID (`<UUID>`), write `/root/.cloudflared/tipjar.yml`:
```yaml
tunnel: <UUID>
credentials-file: /root/.cloudflared/<UUID>.json
ingress:
  - hostname: tips.ochinimus.app
    service: http://127.0.0.1:3037
  - service: http_status:404
```
Route DNS **with the UUID and `--overwrite-dns`**: `cloudflared tunnel route dns <name>` printed the wrong tunnel id on a previous deploy.
```bash
ssh "$VPS" 'cloudflared tunnel route dns --overwrite-dns <UUID> tips.ochinimus.app'
ssh "$VPS" 'pm2 delete tipjar-aurora-tunnel >/dev/null 2>&1; pm2 start /usr/local/bin/cloudflared --name tipjar-aurora-tunnel --interpreter none -- tunnel --config /root/.cloudflared/tipjar.yml --no-autoupdate run && pm2 save'
```

## 4. Verify (MAC)

```bash
curl -s https://tips.ochinimus.app/health
curl -s https://tips.ochinimus.app/api/routes | head -c 600
```
`/api/routes` is the first live call to Aurora (`/api/tokens`): it lists only chains whose assets Aurora returns for the key.

## 5. Watch 10 minutes (VPS)

```bash
ssh "$VPS" 'for i in 1 2 3 4 5 6 7 8 9 10; do pm2 jlist | python3 -c "import sys,json;[print(p[\"name\"],p[\"pm2_env\"][\"status\"],p[\"pm2_env\"][\"restart_time\"],round(p[\"monit\"][\"memory\"]/1048576),\"MB\") for p in json.load(sys.stdin) if p[\"name\"].startswith(\"tipjar\")]"; free -m | sed -n 2p; sleep 60; done'
```
Expect 0 restarts and well under 150 MB.

## Rollback

```bash
ssh "$VPS" 'pm2 delete tipjar-aurora tipjar-aurora-tunnel; pm2 save'
```
Everything else is untouched; `/opt/tipjar-aurora` can stay or be removed.

## Static web build (no server process)

The web build is two static files (`web/dist/index.html`, `web/dist/app.js`). Any static host works; the backend origin is baked
in at build time and the page's Content-Security-Policy only allows connections to that origin.

```bash
cd web && npm install && TIPS_API=https://tips.ochinimus.app npm run build
```
Host `web/dist/` on a static host (for example a Cloudflare Pages direct-upload project: upload the two files). Deploy it only
after `/health` and `/api/routes` on the backend answer, since the page shows a "no connection" message without it. The backend
already sends `access-control-allow-origin: *`, so the static host's origin needs no allow-list.
