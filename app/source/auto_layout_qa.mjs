import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {planAutoLayout} from './auto-layout.js';
import {PRODUCT_DEFINITIONS} from './product-definitions.js';
import * as T from '../vendor/package/build/three.module.js';
import {buildProductModel} from './product-models.js';

const tests=[];
function check(name,body){try{const details=body();tests.push({name,passed:true,...(details?{details}:{})});console.log('PASS',name);}catch(error){tests.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.message);}}
const port=(id,role,pos,kind='optical')=>({id,role,pos,dir:role==='in'?[-1,0,0]:[1,0,0],kind,connector:kind==='optical'?'FC/PC':'Free space'});
const definitions={
  device:{id:'device',size:[120,60,80],ports:[port('in','in',[-60,35,0]),port('out','out',[60,35,0]),port('branch','out',[60,35,20])]},
  block:{id:'block',size:[600,80,450],ports:[port('in','in',[-300,35,0]),port('out','out',[300,35,0])]},
  beam:{id:'beam',size:[100,80,80],ports:[port('in','in',[-50,40,0],'free-space'),port('out','out',[50,40,0],'free-space')]},
  ...PRODUCT_DEFINITIONS
};
const context={definition:type=>definitions[type]};
let itemSerial=0;
function item(id,type='device',extra={}){itemSerial++;return {id,type,label:id,x:itemSerial%7*13,z:itemSerial%5*17,y:0,rotation:0,scale:1,color:'#334455',...extra};}
function edge(a,b,extra={}){return {id:a+'_'+b,a:{item:a,port:'out'},b:{item:b,port:'in'},color:'#247cb4',fiber:'PM',side:1,slack:80,radius:1.15,...extra};}
function project(items,connections=[],board={width:2400,depth:1000}){return {format:'fiber-workbench',version:2,units:'mm',title:'auto layout QA',board,items,connections,assets:{},custom:[]};}
function get(scene,id){return scene.items.find(value=>value.id===id);}
function coords(scene){return scene.items.map(({id,x,z,y,rotation,scale})=>({id,x,z,y,rotation,scale}));}
function intactProperties(before,after){
  assert.deepEqual(before.items.map(({x,z,...rest})=>rest),after.items.map(({x,z,...rest})=>rest));
  assert.deepEqual(before.connections.map(({waypoints,...rest})=>rest),after.connections.map(({waypoints,...rest})=>rest));
}
function bodyRect(entry){
  const size=definitions[entry.type]?.size||[120,60,80],angle=entry.rotation*Math.PI/180;
  const w=(Math.abs(Math.cos(angle))*size[0]+Math.abs(Math.sin(angle))*size[2])*entry.scale;
  const d=(Math.abs(Math.cos(angle))*size[2]+Math.abs(Math.sin(angle))*size[0])*entry.scale;
  return {left:entry.x-w/2,right:entry.x+w/2,top:entry.z-d/2,bottom:entry.z+d/2};
}
function assertSeparated(scene){
  const visible=scene.items.filter(entry=>!entry.hidden);
  for(let left=0;left<visible.length;left++)for(let right=left+1;right<visible.length;right++){
    if(visible[left].assemblyId&&visible[left].assemblyId===visible[right].assemblyId)continue;
    const a=bodyRect(visible[left]),b=bodyRect(visible[right]);
    assert(a.right<=b.left+1e-5||a.left>=b.right-1e-5||a.bottom<=b.top+1e-5||a.top>=b.bottom-1e-5,`${visible[left].id} overlaps ${visible[right].id}`);
  }
}
function assertWithin(scene){
  for(const entry of scene.items.filter(entry=>!entry.hidden)){
    const rect=bodyRect(entry);
    assert(rect.left>=-scene.board.width/2-1e-5&&rect.right<=scene.board.width/2+1e-5);
    assert(rect.top>=-scene.board.depth/2-1e-5&&rect.bottom<=scene.board.depth/2+1e-5);
  }
}

check('Five real products follow optical flow from source to analyzer and keep all attributes',()=>{
  const types=['laser','polarizer','paddle','qwp','polarimeter'],scene=project(types.map(type=>item(type,type)),types.slice(1).map((type,index)=>edge(types[index],type)));
  const snapshot=structuredClone(scene),result=planAutoLayout(scene,{},context);
  assert.deepEqual(scene,snapshot);intactProperties(scene,result.scene);assertSeparated(result.scene);assertWithin(result.scene);
  const xs=result.scene.items.map(entry=>entry.x);assert(xs.slice(1).every((x,index)=>x>xs[index]));
  assert.equal(result.summary.boardChanged,false);assert.equal(result.summary.movedItems,5);assert.equal(result.summary.reroutedConnections,4);
  return {coordinates:coords(result.scene)};
});

check('Input and output role metadata determines direction even when stored endpoints are reversed',()=>{
  const scene=project([item('source'),item('sink')],[edge('sink','source',{a:{item:'sink',port:'in'},b:{item:'source',port:'out'}})]);
  const result=planAutoLayout(scene,{},context).scene;assert(get(result,'source').x<get(result,'sink').x);
});

check('Branches occupy separate rows at the same graph level and reconverge downstream',()=>{
  const scene=project(['source','split','armA','armB','merge','sink'].map(id=>item(id)),[edge('source','split'),edge('split','armA'),edge('split','armB',{a:{item:'split',port:'branch'}}),edge('armA','merge'),edge('armB','merge'),edge('merge','sink')]);
  const result=planAutoLayout(scene,{},context).scene;assertSeparated(result);assertWithin(result);
  assert.equal(get(result,'armA').x,get(result,'armB').x);assert.notEqual(get(result,'armA').z,get(result,'armB').z);
  assert(get(result,'split').x<get(result,'armA').x);assert(get(result,'merge').x>get(result,'armA').x);
});

check('Cycles lay out deterministically without recursion failure or overlapping devices',()=>{
  const scene=project(['a','b','c','d'].map(id=>item(id)),[edge('a','b'),edge('b','c'),edge('c','a'),edge('c','d')]);
  const first=planAutoLayout(scene,{},context),second=planAutoLayout(first.scene,{},context);
  assertSeparated(first.scene);assertWithin(first.scene);assert.deepEqual(coords(first.scene),coords(second.scene));assert.equal(second.summary.changed,false);
});

check('Repeated execution produces no positional drift on a branched graph',()=>{
  const scene=project(['a','b','c','d','e'].map(id=>item(id)),[edge('a','b'),edge('a','c'),edge('b','d'),edge('c','e')]);
  const first=planAutoLayout(scene,{},context),second=planAutoLayout(first.scene,{},context);
  assert.deepEqual(coords(second.scene),coords(first.scene));assert.equal(second.summary.changed,false);
});

check('Real product mesh world bounds remain stable when rebuilt after automatic placement',()=>{
  const previousDocument=globalThis.document,models=new Map();
  globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>({fillRect(){},fillText(){}})})};
  try{
    const types=['laser','polarizer','paddle','qwp','polarimeter'];
    for(const type of types)models.set(type,buildProductModel(PRODUCT_DEFINITIONS[type]));
    const bounds=scene=>new Map(scene.items.map(entry=>{
      const model=models.get(entry.type);model.position.set(entry.x,entry.y,entry.z);model.rotation.y=entry.rotation*Math.PI/180;model.scale.setScalar(entry.scale);model.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(model,true);return [entry.id,{min:box.min.toArray(),max:box.max.toArray()}];
    }));
    const scene=project(types.map(type=>item(type,type)),types.slice(1).map((type,index)=>edge(types[index],type)));
    const first=planAutoLayout(scene,{}, {...context,bounds:bounds(scene)}),second=planAutoLayout(first.scene,{}, {...context,bounds:bounds(first.scene)});
    assert.deepEqual(coords(first.scene),coords(second.scene));assert.equal(second.summary.changed,false);
  }finally{
    for(const model of models.values())model.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material?.dispose();});
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
});

check('Assemblies preserve relative offsets, height, rotation, scale and internal manual routes',()=>{
  const scene=project([item('a','device',{x:-50,z:40,y:80,rotation:30,scale:1.2,assemblyId:'rigid'}),item('b','device',{x:190,z:190,y:50,rotation:70,assemblyId:'rigid'}),item('c')],[edge('a','b',{waypoints:[{x:40,y:10,z:80}]}),edge('b','c',{waypoints:[{x:350,y:8,z:200}]})]);
  const result=planAutoLayout(scene,{},context),dx=get(result.scene,'a').x-get(scene,'a').x,dz=get(result.scene,'a').z-get(scene,'a').z;
  assert(Math.abs(get(result.scene,'b').x-get(scene,'b').x-dx)<1e-5);assert(Math.abs(get(result.scene,'b').z-get(scene,'b').z-dz)<1e-5);
  intactProperties(scene,result.scene);assert.equal(result.summary.translatedRoutes,1);assert.equal(result.summary.reroutedConnections,1);
  assert(Math.abs(result.scene.connections[0].waypoints[0].x-(40+dx))<1e-5);assert(Math.abs(result.scene.connections[0].waypoints[0].z-(80+dz))<1e-5);
  assert.equal(result.scene.connections[1].waypoints,undefined);
});

check('One locked assembly member fixes the entire assembly while other items avoid it',()=>{
  const scene=project([item('a','device',{x:-150,z:100,assemblyId:'rigid',locked:true}),item('b','device',{x:150,z:100,assemblyId:'rigid'}),item('c'),item('d')],[edge('b','c'),edge('c','d')]);
  const result=planAutoLayout(scene,{},context);assert.deepEqual(get(result.scene,'a'),get(scene,'a'));assert.deepEqual(get(result.scene,'b'),get(scene,'b'));assertSeparated(result.scene);assertWithin(result.scene);assert.equal(result.summary.fixedUnits,1);
});

check('Hidden items remain fixed and do not consume the visible table area',()=>{
  const scene=project([item('hidden','block',{x:9000,z:9000,hidden:true}),item('visible')]);
  const result=planAutoLayout(scene,{},context);assert.deepEqual(get(result.scene,'hidden'),get(scene,'hidden'));assertWithin(result.scene);assert.equal(result.summary.hiddenItems,1);
});

check('Existing free-space connections remain rigid so their optical axes and fold angles are retained',()=>{
  const scene=project([item('a','beam',{x:-400,z:-80,y:15}),item('b','beam',{x:-100,z:-80,y:15}),item('c','beam',{x:-100,z:220,y:15,rotation:-90}),item('fiber')],[edge('a','b',{kind:'beam'}),edge('b','c',{kind:'beam'}),edge('c','fiber')]);
  const result=planAutoLayout(scene,{},context),a=get(result.scene,'a'),dx=a.x+400,dz=a.z+80;
  for(const id of ['b','c']){assert(Math.abs(get(result.scene,id).x-get(scene,id).x-dx)<1e-5);assert(Math.abs(get(result.scene,id).z-get(scene,id).z-dz)<1e-5);}
  intactProperties(scene,result.scene);assert.equal(result.summary.rigidUnits,1);
});

check('Supplied world-space mesh bounds determine placement instead of nominal library dimensions',()=>{
  const scene=project([item('a','device',{x:0,z:0}),item('b','device',{x:0,z:0})],[edge('a','b')]);
  const bounds=new Map([['a',{min:[-350,0,-100],max:[350,80,100]}],['b',{min:[-300,0,-120],max:[300,80,120]}]]);
  const result=planAutoLayout(scene,{}, {...context,bounds}).scene;
  assert(get(result,'b').x-get(result,'a').x>=650+89.9);
});

check('Fallback bounds honor rotation, scale, custom ports and post bases',()=>{
  const scene=project([item('a','device',{rotation:90,scale:2,support:{baseWidth:300,height:100,radius:10}}),item('b')],[edge('a','b')]);
  const result=planAutoLayout(scene,{},context).scene;
  assert(get(result,'b').x-get(result,'a').x>=497-1e-5);intactProperties(scene,result);assertWithin(result);
});

check('Imported definitions can be resolved from the project custom catalog',()=>{
  const scene=project([item('custom','imported',{x:0,z:0}),item('built')],[edge('custom','built')]);
  scene.custom=[{...definitions.block,id:'imported',shape:'import'}];scene.assets={imported:'AAAA'};
  const result=planAutoLayout(scene,{},context).scene;assert.equal(result.assets.imported,'AAAA');assert.deepEqual(result.custom,scene.custom);assert(get(result,'built').x-get(result,'custom').x>400);
});

check('A small custom table stays unchanged when it can fit the complete layout',()=>{
  const scene=project([item('a'),item('b')],[edge('a','b')],{width:875.5,depth:525.25});
  const result=planAutoLayout(scene,{},context);assert.deepEqual(result.scene.board,scene.board);assertWithin(result.scene);assertSeparated(result.scene);
});

check('Insufficient table space fails atomically with actionable feedback',()=>{
  const scene=project([item('a','block'),item('b','block')],[edge('a','b')],{width:300,depth:300}),before=structuredClone(scene);
  assert.throws(()=>planAutoLayout(scene,{},context),/台面.*扩展/);assert.deepEqual(scene,before);
});

check('Opt-in expansion enlarges only as needed and fits all components within the table limit',()=>{
  const scene=project([item('a','block'),item('b','block')],[edge('a','b')],{width:300,depth:300}),result=planAutoLayout(scene,{expandBoard:true},context);
  assert(result.summary.boardChanged);assert(result.scene.board.width<=10000&&result.scene.board.depth<=10000);assertWithin(result.scene);assertSeparated(result.scene);assert.equal(scene.board.width,300);
});

check('Locked devices outside a small table are accommodated by optional table expansion',()=>{
  const scene=project([item('locked','device',{x:1000,z:0,locked:true}),item('other')],[],{width:500,depth:500});
  assert.throws(()=>planAutoLayout(scene,{},context),/台面/);
  const result=planAutoLayout(scene,{expandBoard:true},context);assert.deepEqual(get(result.scene,'locked'),get(scene,'locked'));assertWithin(result.scene);
});

check('Oversized imported objects cannot silently exceed the maximum board size',()=>{
  const scene=project([item('a','oversized',{x:0,z:0})]);scene.custom=[{id:'oversized',size:[12000,80,100],ports:[]}];
  assert.throws(()=>planAutoLayout(scene,{expandBoard:true},context),/10000/);
});

check('A long chain wraps within the existing table while preserving topology',()=>{
  const items=Array.from({length:10},(_,index)=>item('n'+index)),connections=items.slice(1).map((entry,index)=>edge(items[index].id,entry.id));
  const scene=project(items,connections,{width:1300,depth:1000}),result=planAutoLayout(scene,{},context);
  assert(result.summary.wrappedRows>0);assertWithin(result.scene);assertSeparated(result.scene);intactProperties(scene,result.scene);
});

check('Empty scenes and fully locked scenes are stable successful no-ops',()=>{
  const empty=project([]),locked=project([item('a','device',{locked:true})]);
  for(const scene of [empty,locked]){const result=planAutoLayout(scene,{},context);assert.equal(result.summary.changed,false);assert.deepEqual(result.scene,scene);}
});

check('Unmoved manual connections and their user route metadata survive',()=>{
  const scene=project([item('a','device',{x:-500,z:0,locked:true}),item('b','device',{x:-200,z:0,locked:true}),item('c')],[edge('a','b',{waypoints:[{x:-350,y:8,z:100}],note:'manual route'})]);
  const result=planAutoLayout(scene,{},context);assert.deepEqual(result.scene.connections,scene.connections);
});

check('Two hundred fifty independent devices fit without pairwise body overlaps',()=>{
  const scene=project(Array.from({length:250},(_,index)=>item('n'+index)),[],{width:10000,depth:10000}),start=performance.now(),result=planAutoLayout(scene,{},context);
  const elapsedMS=performance.now()-start;assertWithin(result.scene);assertSeparated(result.scene);assert(elapsedMS<10000,`250-node layout took ${elapsedMS} ms`);
  return {elapsedMS:Math.round(elapsedMS)};
});

const report={checkedAt:new Date().toISOString(),allPassed:tests.every(test=>test.passed),checks:tests.length,tests};
fs.writeFileSync(new URL('../qa/auto_layout_qa.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({allPassed:report.allPassed,checks:tests.length,failures:tests.filter(test=>!test.passed).map(test=>test.name)}));
if(!report.allPassed)process.exitCode=1;
