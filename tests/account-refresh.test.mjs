import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../public/js/accounts.js', import.meta.url), 'utf8');
const block = source.slice(source.indexOf('    async function refresh()'), source.indexOf('    function exportData('));
function harness(request) {
  const writes = [], events = [];
  const factory = Function('request', 'localStorage', 'window', 'CustomEvent', `
    let user={id:'a'}, saving=false, pending=new Map(), lastRefresh=0, localRevision=0;
    const names={watchlist:'list'}, versions={watchlist:1}, keyFor=k=>'user:a:'+k;
    ${block}
    return {refresh, edit:()=>{localRevision++;}, switchUser:()=>{user={id:'b'};}};`);
  return { ...factory(request, {setItem:(...args)=>writes.push(args)}, {dispatchEvent:e=>events.push(e)}, class {constructor(type,detail){this.type=type;this.detail=detail;}}), writes, events };
}
test('cloud refresh cannot overwrite an edit made while its request is pending', async () => {
  let resolve; const h=harness(()=>new Promise(r=>resolve=r));
  const result=h.refresh(); h.edit(); resolve({data:{watchlist:{version:2,value:['old']}}});
  assert.deepEqual(await result,[]); assert.equal(h.writes.length,0);
});
test('cloud refresh cannot write another account data after switching accounts', async () => {
  let resolve; const h=harness(()=>new Promise(r=>resolve=r));
  const result=h.refresh(); h.switchUser(); resolve({data:{watchlist:{version:2,value:['private']}}});
  assert.deepEqual(await result,[]); assert.equal(h.writes.length,0);
});
test('background refresh handles network failure and applies valid new data', async () => {
  const offline=harness(()=>Promise.reject(Error('offline')));
  assert.deepEqual(await offline.refresh(),[]);
  const online=harness(async()=>({data:{watchlist:{version:2,value:['new']}}}));
  assert.deepEqual(await online.refresh(),['watchlist']); assert.equal(online.writes.length,1); assert.equal(online.events.length,1);
});
