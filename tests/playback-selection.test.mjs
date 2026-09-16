import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
const expression = source.match(/const selectedVideoId = ([^;]+);/)[1];
const select = new Function('media', 'requestedVideoId', 'state', 'mediaType', 'return ' + expression);
test('Mayday never inherits Silo episode IDs, including after repeated switching', () => {
 const state = {activeVideoId: 'tt14688458:1:2'};
 const type = m => m.media_type;
 assert.equal(select({media_type:'movie'}, null, state, type), null);
 assert.equal(select({media_type:'tv'}, 'tt14688458:1:2', state, type), 'tt14688458:1:2');
 assert.equal(select({media_type:'movie'}, state.activeVideoId, state, type), null);
 assert.equal(select({media_type:'tv'}, null, state, type), null);
});

const browserHelpers = source.slice(source.indexOf('    function browserAttemptURL('), source.indexOf('    function comparableSourceText('));
const classify = new Function('isSafeWebURL', 'isSafeExternalAppURL', browserHelpers + ';return streamCompatibilityGroup;')(value => /^https?:\/\//.test(value || ''), value => /^magnet:\?xt=urn:btih:[a-f0-9]{40}$/i.test(value || ''));
test('all direct URLs are browser attempts before checks, even after a failed probe', () => {
 for (const field of ['url','attemptUrl','externalPlayerUrl']) assert.equal(classify({[field]:'https://media.example/episode',browserReady:false,_browserCheckDone:true}), 'playable');
 assert.equal(classify({externalUrl:'https://store.example/title'}),'external');
 assert.equal(classify({externalAppUrl:'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567'}),'app-only');
 assert.equal(classify({url:'javascript:alert(1)'}),'app-only');
 assert.equal(classify({url:'https://example.com/demo.mp4',isDemo:true}),'demo');
});

test('initial playback prefers H.264 over a smaller HEVC source and skips demos', () => {
 const code=source.slice(source.indexOf('    function recommendedStreamIndex()'),source.indexOf('    function sourceCounts()'));
 const state={streams:[{isDemo:true,url:'https://example.com/demo.mp4',format:'mp4'},{url:'https://example.com/hevc',title:'H.265',sizeBytes:1},{url:'https://example.com/avc',title:'H.264',sizeBytes:2}]};
 const recommend=new Function('state','browserAttemptURL',code+';return recommendedStreamIndex();');
 assert.equal(recommend(state,s=>s.url),2);
});
