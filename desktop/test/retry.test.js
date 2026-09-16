'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../main.js'),'utf8');
const block=source.slice(source.indexOf('async function startPlayback(payload)'),source.indexOf('app.whenReady()'));
test('a failed new source replaces the previous retry target',async()=>{
 const make=Function('preparePlaybackRequest','process',`let playbackRequest=0,lastPayload={url:'https://old.example/video'};const playback={stop(){}};const playerView={open(){},update(){}};const mainWindow={isDestroyed:()=>false};${block};return {startPlayback,last:()=>lastPayload};`);
 const h=make(async()=>{throw Error('Host unavailable');},{platform:'win32'});
 const payload={url:'https://new.example/video',title:'New selection'};
 assert.equal((await h.startPlayback(payload)).ok,false);assert.equal(h.last(),payload);
});
