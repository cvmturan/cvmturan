import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const index = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const experience = fs.readFileSync(new URL('../public/js/experience.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
const worker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../public/css/main.css', import.meta.url), 'utf8');
const accounts = fs.readFileSync(new URL('../public/js/accounts.js', import.meta.url), 'utf8');

test('the production shell loads the interaction layer and refreshes its cache', () => {
  assert.match(index, /experience\.js\?v=20260915-3/);
  assert.match(worker, /tshow-shell-v50/);
  assert.match(app, /serviceWorker\.register\('\/sw\.js\?v=20260915-1'\)/);
  assert.match(worker, /experience\.js\?v=20260915-3/);
});

test('account add-ons reconcile across devices and refresh the active app', () => {
  assert.match(accounts, /function mergeAddonURLs\(remote, local\)/);
  assert.match(accounts, /e\.status !== 409 \|\| key !== 'addonURLs'/);
  assert.match(accounts, /tshow:account-data-refreshed/);
  assert.match(app, /event\.detail\?\.keys\?\.includes\('addonURLs'\)/);
  const start = accounts.indexOf('    function mergeAddonURLs(');
  const end = accounts.indexOf('    async function request(', start);
  const merge = Function(`${accounts.slice(start, end)}; return mergeAddonURLs;`)();
  assert.deepEqual(
    merge(['https://one.example/manifest.json', 'https://two.example/manifest.json'], ['https://two.example/manifest.json', 'https://three.example/manifest.json']),
    ['https://one.example/manifest.json', 'https://two.example/manifest.json', 'https://three.example/manifest.json']
  );
});

test('mobile video gestures do not trigger accidental double-tap page zoom', () => {
  assert.match(index, /viewport-fit=cover, interactive-widget=resizes-content/);
  assert.match(css, /\.video-stage, \.video-stage video \{ touch-action:manipulation; \}/);
});

test('mobile external-player actions stay visible before the long source controls', () => {
  assert.match(index, /id="open-in-outplayer"/);
  assert.match(app, /updateExternalPlayerActions\(null\)/);
  assert.match(css, /\.external-player-control:not\(\[hidden\]\)\s*\{\s*order:-1;/);
  assert.match(css, /\.external-player-control button\s*\{[^}]*min-height:44px;/);
});

test('smart search and player gestures remain wired without the mobile dock', () => {
  assert.match(experience, /smart-search-panel/);
  assert.doesNotMatch(experience, /setupMobileDock|mobile-dock/);
  assert.match(experience, /addEventListener\('dblclick'/);
  assert.match(experience, /addEventListener\('pointerup'/);
  assert.match(experience, /video\.currentTime - 10/);
  assert.match(experience, /video\.currentTime \+ 10/);
});

test('the PWA exposes useful launch shortcuts', () => {
  assert.equal(manifest.id, '/');
  assert.deepEqual(manifest.shortcuts.map((shortcut) => shortcut.name), ['Movies', 'Series', 'My List']);
});

