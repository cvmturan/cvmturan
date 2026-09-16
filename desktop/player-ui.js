'use strict';
const el=id=>document.getElementById(id);
const act=(name,value)=>window.playerControls.action(name,value).catch(()=>{el('status').textContent='Control unavailable. Return to sources and try again.';});
const time=s=>{s=Math.max(0,Math.floor(s||0));return (s>=3600?Math.floor(s/3600)+':':'')+String(Math.floor(s/60)%60).padStart(s>=3600?2:1,'0')+':'+String(s%60).padStart(2,'0');};
let dragging=false,trackKey='',current={};
for(const [id,name,value]of [['back','back'],['fullscreen','fullscreen'],['rewind','seek',-10],['forward','seek',10],['pause','pause'],['retry','retry']])el(id).onclick=()=>act(name,value);
el('volume').oninput=e=>act('volume',Number(e.target.value));
el('seek').oninput=()=>{dragging=true;};el('seek').onchange=e=>{act('position',Number(e.target.value));dragging=false;};
for(const [id,name]of [['audio','audio'],['subtitle','subtitle'],['speed','speed']])el(id).onchange=e=>act(name,e.target.value);
window.playerControls.subscribe(state=>{
 current=state;el('title').textContent=state.title||'TShow';el('time').textContent=time(state.position)+' / '+time(state.duration);
 el('status').textContent=state.phase==='error'?'Source unavailable':state.phase==='loading'?'Connecting to source…':state.buffering?'Buffering…':state.paused?'Paused':'Playing';
 el('pause').disabled=state.phase!=='playing';el('pause').textContent=state.paused?'Play':'Pause';
 el('seek').disabled=!(state.duration>0);el('seek').max=state.duration||100;if(!dragging)el('seek').value=state.position||0;
 el('loading').hidden=state.phase==='playing'&&state.videoReady;document.body.classList.toggle('error',state.phase==='error');
 el('message').textContent=state.phase==='error'?'This source could not start':state.phase==='playing'?'Audio playback':'Connecting to your source…';
 el('detail').textContent=state.error||'You can return to sources at any time.';el('retry').hidden=state.phase!=='error';
 el('volume').value=state.volume??100;el('speed').value=String(state.speed||1);
 const key=JSON.stringify(state.tracks||[]);if(key!==trackKey){trackKey=key;for(const [id,type]of [['audio','audio'],['subtitle','sub']]){const select=el(id);select.replaceChildren();if(type==='sub')select.add(new Option('Off','no'));for(const track of state.tracks||[])if(track.type===type)select.add(new Option(track.title||track.lang||('Track '+track.id),String(track.id)));if(!select.options.length)select.add(new Option('No tracks','no'));}}
 if(state.aid!=null)el('audio').value=String(state.aid);if(state.sid!=null)el('subtitle').value=state.sid===false?'no':String(state.sid);
});
document.addEventListener('keydown',event=>{if(/INPUT|SELECT/.test(event.target.tagName))return;const actions={Escape:['back'],' ':['pause'],ArrowLeft:['seek',-10],ArrowRight:['seek',10],f:['fullscreen'],F11:['fullscreen']};const action=actions[event.key];if(action){event.preventDefault();act(...action);}});
