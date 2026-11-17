// Actual resizeBoard, resize/expand handlers, camera fitting and undo/redo code.
// Rendering and storage are recorded. Shell checks reuse its existing DOM fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as T from '../vendor/package/build/three.module.js';
import {commandEntries} from './command-palette.js';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8'),source=read('./app.js'),tests=[];
function between(text,start,end){const first=text.indexOf(start),last=text.indexOf(end,first+start.length);assert(first>=0&&last>first,`source boundary ${start}`);return text.slice(first,last);}
async function check(name,body){try{await body();tests.push({name,passed:true});}catch(error){tests.push({name,passed:false,error:error.stack});}}
const checkpointSource=between(source,'function checkpoint(','function updateHistory('),fitSource=between(source,'function fitView(','function focusSelected('),resizeSource=between(source,'async function resizeBoard(','async function restoreHistory('),historySource=between(source,'async function restoreHistory(',"$('undo').onclick"),expandSource=between(source,"$('expandBoard').onclick=","$('search').oninput");
function fixture(){
  const camera=new T.PerspectiveCamera(38,1.5,2,18000);camera.position.set(900,1250,1450);camera.updateMatrixWorld(true);
  const controls={target:new T.Vector3(0,20,0),maxDistance:8500,update(){camera.lookAt(this.target);camera.updateMatrixWorld(true);}};
  const fields={boardW:{value:'1800'},boardD:{value:'800'},expandBoard:{},resize:{click(){this.pending=this.onclick?.();}}};
  const context={T,console,clone:structuredClone,structuredClone,state:{board:{width:1800,depth:800},items:[{id:'instrument',x:710,z:0,aiSource:{jobId:'existing'}}],connections:[{id:'edge',a:{item:'instrument',port:'out'},b:{item:'other',port:'in'},color:'#246cab'}]},
    camera,controls,viewport:{clientWidth:1200,clientHeight:800},history:[],future:[],selection:new Set(['instrument']),selected:'instrument',selectedEdge:'edge',pending:{item:'instrument',port:'out'},loading:false,renderStudio:{setView(){}},
    calls:{rebuild:[],persist:[],historyUI:0,messages:[],restores:[]},failNext:false,gate:null,$:id=>fields[id],
    snapshotCamera:()=>({position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray(),near:camera.near,far:camera.far,fov:camera.fov,zoom:camera.zoom,aspect:camera.aspect}),
    restoreCamera:view=>{if(!view)return;camera.position.fromArray(view.position);camera.up.fromArray(view.up);camera.near=view.near;camera.far=view.far;camera.fov=view.fov;camera.zoom=view.zoom;controls.target.fromArray(view.target);camera.updateProjectionMatrix();controls.update();context.calls.restores.push(structuredClone(view));},
    updateHistory:()=>context.calls.historyUI++,toast:message=>context.calls.messages.push(message)
  };
  context.persist=()=>{context.state.camera=context.snapshotCamera();context.calls.persist.push(JSON.parse(JSON.stringify(context.state)));};
  context.rebuild=async fit=>{
    context.loading=true;context.calls.rebuild.push({fit:!!fit,board:structuredClone(context.state.board)});
    if(context.gate)await context.gate;
    if(context.failNext){context.failNext=false;throw new Error('intentional table redraw failure');}
    fields.boardW.value=String(context.state.board.width);fields.boardD.value=String(context.state.board.depth);
    if(fit)context.fitView();context.loading=false;context.persist();
  };
  vm.createContext(context);vm.runInContext(checkpointSource+'\n'+fitSource+'\n'+resizeSource+'\n'+historySource+'\n'+expandSource,context);
  context.state.camera=context.snapshotCamera();return {context,fields};
}
const interaction=c=>({selected:c.selected,edge:c.selectedEdge,pending:structuredClone(c.pending),selection:[...c.selection]});
await check('normal resize changes only table/camera and records one undo snapshot while retaining interaction',async()=>{
  const {context:c}=fixture(),before=structuredClone(c.state),selection=interaction(c);c.future.push({title:'redo'});
  assert.equal(await c.resizeBoard(2400,1200),true);assert.deepEqual(structuredClone(c.state.board),{width:2400,depth:1200});assert.equal(c.history.length,1);assert.equal(c.future.length,0);assert.deepEqual(c.state.items,before.items);assert.deepEqual(c.state.connections,before.connections);assert.deepEqual(interaction(c),selection);assert.equal(c.calls.rebuild[0].fit,true);assert.deepEqual(c.calls.persist.at(-1).board,{width:2400,depth:1200});assert.match(c.calls.messages.at(-1),/2400 × 1200/);
});
await check('minimum, maximum and decimal dimensions use the actual resize handler',async()=>{
  for(const [width,depth]of [[300,300],[500,400],[10000,10000],[1375,865],[525.5,425.5]]){
    const {context:c,fields}=fixture();fields.boardW.value=String(width);fields.boardD.value=String(depth);assert.equal(await fields.resize.onclick(),true);assert.equal(c.state.board.width,width);assert.equal(c.state.board.depth,depth);assert.equal(c.history.length,1);assert.equal(fields.boardW.value,String(width));assert.equal(fields.boardD.value,String(depth));
    if(width===10000){assert(c.camera.far>18000);assert(c.controls.maxDistance>8500);assert.deepEqual(c.calls.persist.at(-1).camera.position,c.camera.position.toArray());}
  }
});
await check('invalid dimensions and empty input leave project, undo/redo, selection and camera intact',async()=>{
  for(const [width,depth]of [[299,800],[1800,299],[10001,800],[1800,10001],[NaN,800],[Infinity,800]]){
    const {context:c}=fixture();c.future.push({title:'redo'});const before=structuredClone(c.state),selection=interaction(c);assert.equal(await c.resizeBoard(width,depth),false);assert.deepEqual(c.state,before);assert.deepEqual(interaction(c),selection);assert.equal(c.history.length,0);assert.equal(c.future.length,1);assert.equal(c.calls.rebuild.length,0);assert.equal(c.calls.persist.length,0);
  }
  const {context:c,fields}=fixture();fields.boardW.value='';assert.equal(await fields.resize.onclick(),false);assert.equal(c.history.length,0);assert.equal(c.state.board.width,1800);
});
await check('same-size input is a successful no-op with no redraw or empty undo',async()=>{
  const {context:c}=fixture(),before=structuredClone(c.state);c.future.push({title:'redo'});assert.equal(await c.resizeBoard(1800,800),true);assert.deepEqual(c.state,before);assert.equal(c.history.length,0);assert.equal(c.future.length,1);assert.equal(c.calls.rebuild.length,0);assert.equal(c.calls.persist.length,0);
});
await check('loading rejects resizing before mutation or history changes',async()=>{
  const {context:c}=fixture();c.loading=true;const before=structuredClone(c.state);assert.equal(await c.resizeBoard(2400,1200),false);assert.deepEqual(c.state,before);assert.equal(c.history.length,0);assert.equal(c.calls.rebuild.length,0);assert.match(c.calls.messages.at(-1),/正在更新场景/);
});
await check('an in-flight redraw prevents a second concurrent resize commit',async()=>{
  const {context:c}=fixture();let release;c.gate=new Promise(resolve=>release=resolve);const first=c.resizeBoard(2400,1200);assert.equal(c.loading,true);assert.equal(await c.resizeBoard(3000,1600),false);assert.equal(c.history.length,1);assert.equal(c.state.board.width,2400);c.gate=null;release();assert.equal(await first,true);assert.equal(c.calls.rebuild.length,1);assert.equal(c.calls.persist.at(-1).board.width,2400);
});
await check('redraw failure restores table, camera, interaction, undo/redo and persisted project',async()=>{
  const {context:c}=fixture();c.history.push({...structuredClone(c.state),title:'previous'});c.future.push({...structuredClone(c.state),title:'redo'});const before=structuredClone(c.state),history=structuredClone(c.history),future=structuredClone(c.future),selection=interaction(c);c.failNext=true;
  assert.equal(await c.resizeBoard(2600,1400),false);assert.deepEqual(c.state,before);assert.deepEqual(c.history,history);assert.deepEqual(c.future,future);assert.deepEqual(interaction(c),selection);assert.deepEqual(c.snapshotCamera(),before.camera);assert.equal(c.calls.rebuild.length,2);assert.equal(c.calls.rebuild[1].fit,false);assert.deepEqual(c.calls.persist.at(-1),before);assert.equal(c.loading,false);assert.match(c.calls.messages.at(-1),/intentional table redraw failure/);
});
await check('table dimensions and fitted camera round-trip through one undo and redo',async()=>{
  const {context:c}=fixture(),before=structuredClone(c.state);await c.resizeBoard(3200,1800);const after=structuredClone(c.state);await c.restoreHistory(c.history,c.future);assert.deepEqual(c.state,before);assert.deepEqual(c.snapshotCamera(),before.camera);await c.restoreHistory(c.future,c.history);assert.deepEqual(c.state,after);assert.deepEqual(c.snapshotCamera(),after.camera);assert.deepEqual(c.calls.persist.at(-1),after);
});
await check('25 percent expansion reuses resize and maximum-size expansion is a no-op',async()=>{
  const {context:c,fields}=fixture();await c.resizeBoard(6000,4500);fields.expandBoard={};vm.runInContext(expandSource,c);fields.expandBoard.onclick();await fields.resize.pending;assert.deepEqual(structuredClone(c.state.board),{width:7500,depth:5700});assert.equal(c.history.length,2);await c.resizeBoard(10000,10000);const count=c.history.length,redraws=c.calls.rebuild.length;fields.expandBoard.onclick();await fields.resize.pending;assert.equal(c.history.length,count);assert.equal(c.calls.rebuild.length,redraws);
});
await check('toolbar and command entry open existing settings, scroll and focus its original width field',()=>{
  const shell=read('./workbench-shell.js'),fixtureSource=read('./workbench_shell_qa.mjs'),context=vm.createContext({console,structuredClone});
  vm.runInContext(shell.replace(/^export /gm,'')+'\n'+between(fixtureSource,'class Element{','const api=installWorkbenchShell('),context);
  vm.runInContext("globalThis.width=make('input',document.querySelector('.scene-options'),{id:'boardW'});globalThis.scrolled=0;document.querySelector('.scene-options').scrollIntoView=()=>scrolled++;width.select=()=>{width.selectionRequested=true;};globalThis.shellAPI=installWorkbenchShell({getState:()=>({items:[],connections:[]}),getSelection:()=>[],getSelectedEdge:()=>null});",context);
  const button=context.document.getElementById('editBoardSize');button.click();assert.equal(context.shellAPI.getPreferences().inspector,'settings');assert.equal(context.document.activeElement,context.width);assert.equal(context.width.selectionRequested,true);assert.equal(context.scrolled,1);
  const entries=commandEntries({getState:()=>({items:[],connections:[]}),getSelection:()=>[],getSelectedEdge:()=>null,getCatalog:()=>[],getButton:id=>context.document.getElementById(id)},'桌子');const entry=entries.find(item=>item.id==='editBoardSize');assert(entry&&!entry.disabled);entry.run();assert.equal(context.scrolled,2);assert.equal(context.document.activeElement,context.width);context.shellAPI.destroy();
});
const report={allPassed:tests.every(test=>test.passed),checks:tests.length,scope:'Actual table resize/expand/history/camera and shell entry functions. Real Three.js camera, recording redraw/storage and existing in-memory shell DOM. No native browser layout or WebGL pixels.',tests};console.log(JSON.stringify(report,null,2));if(!report.allPassed)process.exitCode=1;
