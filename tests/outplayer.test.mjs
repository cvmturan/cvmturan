import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const start = source.indexOf('    function openActiveStreamInOutplayer()');
const end = source.indexOf('    function openActiveStreamInSourceApp()', start);
test('torrent-only sources are counted as app-only while direct video remains playable', () => {
  const begin = source.indexOf('    function streamCompatibilityGroup(stream)');
  const finish = source.indexOf('    function comparableSourceText(', begin);
  const classify = Function('browserAttemptURL', 'isSafeExternalAppURL', `${source.slice(begin, finish)}; return streamCompatibilityGroup;`)(
    stream => stream.url || stream.externalPlayerUrl || null,
    value => typeof value === 'string' && value.startsWith('magnet:?xt=urn:btih:')
  );
  assert.equal(classify({externalAppUrl:'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'}), 'app-only');
  assert.equal(classify({externalUrl:'https://provider.example/title'}), 'external');
  assert.equal(classify({externalPlayerUrl:'https://media.example/video.mkv'}), 'playable');
});
function harness(url) {
  const events = new Map(), timers = [], messages = [];
  let pauses = 0;
  const target = () => ({ addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) });
  const document = { ...target(), hidden: false };
  const window = { ...target(), location: { href: '' } };
  const state = { playerRequestKey: 'series:episode:1', activeStreamIndex: 2 };
  const run = Function('activeExternalPlayerURL', 'showToast', 'elements', 'state', 'document', 'window', 'setTimeout', `${source.slice(start, end)}; return openActiveStreamInOutplayer;`)(
    () => url, (...args) => messages.push(args), { videoPlayer: { pause: () => pauses++ } }, state, document, window, fn => timers.push(fn)
  );
  return { run, events, timers, messages, document, window, state, pauses: () => pauses };
}
test('Outplayer preserves signed URL characters and pauses browser playback', () => {
  const url = 'https://media.example/episode.mkv?token=a+b&name=A%20B#part';
  const h = harness(url); h.run();
  assert.equal(new URL(h.window.location.href).searchParams.get('url'), url);
  assert.equal(h.pauses(), 1);
  h.document.hidden = true; h.events.get('visibilitychange')();
  h.document.hidden = false; h.timers[0]();
  assert.equal(h.messages.length, 0);
  assert.equal(h.events.size, 0);
});
test('Outplayer fallback does not appear for a previously selected title', () => {
  const h = harness('https://media.example/video'); h.run();
  h.state.playerRequestKey = 'movie:2'; h.timers[0]();
  assert.equal(h.messages.length, 0);
});
test('missing direct URL never launches Outplayer or stops current playback', () => {
  const h = harness(null); h.run();
  assert.equal(h.window.location.href, ''); assert.equal(h.pauses(), 0);
  assert.equal(h.messages.length, 1); assert.equal(h.timers.length, 0);
});
