// Usage: TIPS_API=https://tips.example.com node build.mjs   -> dist/index.html + dist/app.js (static files, no server process)
import {build} from 'esbuild';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const api = process.env.TIPS_API;
if (!api || !/^https?:\/\//.test(api)) throw new Error('set TIPS_API=https://<backend origin>');
const origin = new URL(api).origin;
const nm = (p) => path.join(here, 'node_modules', p);

rmSync(path.join(here, 'dist'), {recursive: true, force: true});
mkdirSync(path.join(here, 'dist'), {recursive: true});
await build({
  entryPoints: [path.join(here, 'entry.jsx')],
  bundle: true, minify: true, outfile: path.join(here, 'dist/app.js'), format: 'iife', jsx: 'automatic',
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  loader: {'.js': 'jsx'},
  define: {'process.env.NODE_ENV': '"production"', __DEV__: 'false', global: 'window', __TIPS_API__: JSON.stringify(origin)},
  // one copy of React for both web/ and ../src
  alias: {'react-native': nm('react-native-web'), react: nm('react'), 'react-dom': nm('react-dom'), qrcode: nm('qrcode')},
  plugins: [{name: 'web-shims', setup(b) {
    b.onResolve({filter: /^react-native-safe-area-context$/}, () => ({path: path.join(here, 'shim-safe-area.js')}));
    b.onResolve({filter: /\/config$/}, (a) => (a.importer.includes('/src/anyChain/') ? {path: path.join(here, 'shim-config.js')} : null));
  }}],
  logLevel: 'warning',
});
const csp = `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src ${origin}; img-src data:; base-uri 'none'; form-action 'none'`;
writeFileSync(path.join(here, 'dist/index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Tip Jar: tip from any chain</title>
<style>html,body,#root{height:100%;margin:0;background:#0A0A14}#root{display:flex}body{font-family:-apple-system,system-ui,sans-serif}</style>
</head><body><div id="root"></div><script src="app.js"></script></body></html>
`);
console.log('built dist/ for', origin);
