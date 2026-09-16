import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('    function setView(view)'),source.indexOf('    function updateIndexingForView(view)'));
test('leaving a full title hides it and invalidates pending title responses',()=>{
 const panel={hidden:true},oldPanel={hidden:false},state={titlePageActive:true,detailsRequest:4,region:'IN'};
 const elements={titleDetailView:{hidden:false},regionSelect:{value:''}},scroll=[];
 const document={title:'Mayday',querySelector:()=>panel,querySelectorAll:s=>s==='[data-view-panel]'?[oldPanel,panel]:[]};
 const fn=Function('state','elements','document','window','history','matchMedia','leaveBrowseMode','updateIndexingForView',`${block}; return setView;`)(state,elements,document,{scrollTo:x=>scroll.push(x)},{replaceState(){}},()=>({matches:true}),()=>{},()=>{});
 fn('settings');
 assert.equal(elements.titleDetailView.hidden,true);assert.equal(state.titlePageActive,false);assert.equal(state.detailsRequest,5);
 assert.equal(panel.hidden,false);assert.equal(oldPanel.hidden,true);assert.equal(elements.regionSelect.value,'IN');assert.equal(scroll[0].behavior,'instant');
});
