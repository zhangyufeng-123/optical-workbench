import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from '../vendor/package/build/three.module.js';
import {createFiberCurve,createFiberPlug,createFCPlug,createFCAdapter,fiberExitDistance,supportedFiberConnectorPair} from './fiber-routing.js';
import {preserveConnectionColors} from './connection-colors.js';

const tests=[];
async function check(name,body){try{tests.push({name,passed:true,detail:await body()});}catch(error){tests.push({name,passed:false,error:error.stack});}}
const port=(position,direction,connector='FC/PC',id='a',extra={})=>({pos:new T.Vector3(...position),dir:new T.Vector3(...direction),p:{connector,kind:'optical',...extra},it:{id}});
const edge=()=>({id:'connection',kind:'fiber',fiber:'SM',color:'#d28b25',side:1,slack:80,radius:1.15});
const box=(id,min,max)=>({id,box:new T.Box3(new T.Vector3(...min),new T.Vector3(...max))});
function finiteCurve(curve){
  const points=curve.getPoints(1000);assert(points.every(point=>point.toArray().every(Number.isFinite)));assert(Number.isFinite(curve.getLength()));assert(curve.getLength()>0);return points;
}
function exactEndpoints(curve,a,b){assert(curve.getPoint(0).distanceTo(a.pos)<1e-8);assert(curve.getPoint(1).distanceTo(b.pos)<1e-8);assert(curve.getTangent(0).dot(a.dir.clone().normalize())>.99999);assert(curve.getTangent(1).dot(b.dir.clone().normalize().negate())>.99999);}
function continuous(curve){for(let index=1;index<curve.curves.length;index++){assert(curve.curves[index-1].getPoint(1).distanceTo(curve.curves[index].getPoint(0))<1e-9);assert(curve.curves[index-1].getTangent(1).dot(curve.curves[index].getTangent(0))>.98);}}
function geometryFinite(root){let meshes=0;root.traverse(object=>{if(object.geometry){meshes++;const values=object.geometry.attributes.position.array;assert([...values].every(Number.isFinite));}if(object.isInstancedMesh)assert([...object.instanceMatrix.array].every(Number.isFinite));});assert(meshes>=3);return meshes;}

for(const [name,a,b] of [
  ['facing',port([-250,60,0],[1,0,0]),port([250,60,0],[-1,0,0],'FC/PC','b')],
  ['same direction',port([-250,60,0],[1,0,0]),port([250,60,0],[1,0,0],'FC/PC','b')],
  ['raised and noncoplanar',port([-250,320,-90],[0,0,1]),port([250,110,180],[-1,0,0],'FC/PC','b')],
  ['vertical port',port([-250,75,0],[0,1,0]),port([250,65,0],[-1,0,0],'FC/PC','b')],
  ['near-coincident',port([0,120,0],[1,0,0]),port([.05,120,.05],[1,0,0],'FC/PC','b')]
])await check(`continuous finite ${name} route with coaxial stress-relief leads`,()=>{
  const source=edge(),before=structuredClone(source),aBefore=a.pos.clone(),bBefore=b.pos.clone(),curve=createFiberCurve(T,source,a,b),points=finiteCurve(curve);
  exactEndpoints(curve,a,b);continuous(curve);assert(points.every(point=>point.y>=2.15-1e-8));assert.deepEqual(source,before);assert(a.pos.equals(aBefore));assert(b.pos.equals(bBefore));
  const resting=points.filter(point=>Math.abs(point.y-2.15)<1e-5);assert(resting.length>10);return {segments:curve.curves.length,length:curve.getLength(),restingSamples:resting.length};
});
await check('table height, displayed jacket radius and lift set the actual resting plane',()=>{
  const a=port([-300,240,0],[1,0,0]),b=port([300,220,0],[-1,0,0],'FC/PC','b'),curve=createFiberCurve(T,{...edge(),radius:3,lift:15},a,b,{tableY:120});
  const points=finiteCurve(curve);assert.equal(curve.userData.routing.restingHeight,139);assert(points.every(point=>point.y>=139-1e-8));assert(points.some(point=>Math.abs(point.y-139)<1e-5));return {restingHeight:139};
});
await check('legacy bend supplies a side offset and side reverses the automatic route',()=>{
  const a=port([-300,60,0],[1,0,0]),b=port([300,60,0],[-1,0,0],'FC/PC','b'),source=edge();delete source.slack;source.bend=95;
  const positive=createFiberCurve(T,source,a,b),negative=createFiberCurve(T,{...source,side:-1},a,b);assert(positive.getPoint(.5).z>60);assert(negative.getPoint(.5).z<-60);assert.equal(source.bend,95);return {positiveZ:positive.getPoint(.5).z,negativeZ:negative.getPoint(.5).z};
});
await check('manual waypoint coordinates remain exact and source values stay unchanged',()=>{
  const a=port([-300,60,0],[1,0,0]),b=port([300,100,100],[-1,0,0],'FC/PC','b'),source={...edge(),waypoints:[{x:-70,y:45,z:160},{x:80,y:80,z:190}]},before=structuredClone(source),curve=createFiberCurve(T,source,a,b);
  finiteCurve(curve);continuous(curve);exactEndpoints(curve,a,b);assert.equal(curve.userData.routing.manual,true);for(const point of source.waypoints)assert(curve.curves.some(segment=>segment.getPoint(0).distanceTo(new T.Vector3(point.x,point.y,point.z))<1e-8));assert.deepEqual(source,before);return {exactWaypoints:2};
});
for(const [name,obstacles] of [
  ['central body',[box('center',[-90,0,-65],[90,130,130])]],
  ['overlapping bodies',[box('one',[-110,0,-80],[30,90,100]),box('two',[-30,0,-20],[100,160,150])]],
  ['high body over the table',[box('overhead',[-110,50,-70],[110,180,150])]],
  ['several staggered bodies',[box('one',[-150,0,-80],[-50,120,85]),box('two',[10,0,30],[110,130,180]),box('three',[110,0,-130],[190,100,-40])]]
])await check(`automatic route conservatively avoids ${name}`,()=>{
  const a=port([-330,75,0],[1,0,0]),b=port([330,75,0],[-1,0,0],'FC/PC','b'),source=edge(),before=obstacles.map(record=>record.box.clone()),started=performance.now(),curve=createFiberCurve(T,source,a,b,{obstacles}),elapsed=performance.now()-started;
  const points=finiteCurve(curve);continuous(curve);exactEndpoints(curve,a,b);assert.deepEqual(curve.userData.routing.unresolvedObstacles,[]);for(const record of obstacles)assert(points.every(point=>!record.box.clone().expandByScalar(source.radius+.1).containsPoint(point)),record.id);obstacles.forEach((record,index)=>assert(record.box.equals(before[index])));return {obstacles:obstacles.length,segments:curve.curves.length,elapsedMs:elapsed};
});
await check('raised host bodies escape outward and the descending route stays outside their housings',()=>{
  const a=port([-210,220,0],[1,0,0]),b=port([210,110,0],[-1,0,0],'FC/PC','b'),obstacles=[box('a',[-410,100,-90],[-218,300,90]),box('b',[218,40,-90],[410,180,90])],curve=createFiberCurve(T,edge(),a,b,{obstacles});
  finiteCurve(curve);assert.deepEqual(curve.userData.routing.unresolvedObstacles,[]);continuous(curve);exactEndpoints(curve,a,b);return {raisedHostsAvoided:true};
});
await check('rotated and scaled endpoint transforms preserve the outward plug axis and route tangents',()=>{
  const matrix=new T.Matrix4().compose(new T.Vector3(-240,130,90),new T.Quaternion().setFromEuler(new T.Euler(.15,.8,-.12)),new T.Vector3(1.8,1.2,.7)),a=port([60,35,0],[1,0,0]),b=port([300,110,130],[-1,0,0],'FC/APC','b');
  a.pos.applyMatrix4(matrix);a.dir.transformDirection(matrix);const plug=createFiberPlug(T,a,edge()),curve=createFiberCurve(T,edge(),a,b);assert(new T.Vector3(0,1,0).applyQuaternion(plug.quaternion).distanceTo(a.dir)<1e-10);exactEndpoints(curve,a,b);finiteCurve(curve);return {axis:a.dir.toArray()};
});
await check('a manual point inside a body remains user-defined and records the unresolved obstacle',()=>{
  const source={...edge(),waypoints:[{x:0,y:35,z:0}]},a=port([-300,60,0],[1,0,0]),b=port([300,60,0],[-1,0,0],'FC/PC','b'),curve=createFiberCurve(T,source,a,b,{obstacles:[box('body',[-30,0,-30],[30,100,30])]});
  finiteCurve(curve);assert(curve.userData.routing.unresolvedObstacles.includes('body'));assert(curve.curves.some(segment=>segment.getPoint(0).distanceTo(new T.Vector3(0,35,0))<1e-9));return {userPointPreserved:true,unresolved:['body']};
});
await check('free-space beams remain exact straight lines with untouched source semantics',()=>{
  const source={...edge(),kind:'beam',glow:.7},a=port([-200,80,0],[1,0,0],'Free space'),b=port([200,140,50],[-1,0,0],'Free space','b'),before=structuredClone(source),curve=createFiberCurve(T,source,a,b,{obstacles:[box('irrelevant',[-50,0,-50],[50,200,50])],tableY:300});
  assert(curve.isLineCurve3);assert(curve.getPoint(.5).distanceTo(a.pos.clone().lerp(b.pos,.5))<1e-9);assert.equal(createFiberPlug(T,a,source),null);assert.equal(createFCAdapter(T,{id:'free',pos:[0,0,0],dir:[1,0,0],kind:'free-space',connector:'Free space'}),null);assert.deepEqual(source,before);return {lineLength:curve.getLength()};
});
for(const connector of ['FC/PC','FC/APC','SC/PC','LC/APC'])await check(`${connector} plug and adapter have finite geometry and a shared mating plane`,()=>{
  const a=port([40,70,90],[1,0,1],connector),source=edge(),plug=createFiberPlug(T,a,source),adapter=createFCAdapter(T,{id:'in',pos:a.pos.toArray(),dir:a.dir.toArray(),connector}),meshes=geometryFinite(plug)+geometryFinite(adapter);
  assert(plug.position.equals(a.pos));assert(adapter.position.equals(a.pos));assert(new T.Vector3(0,1,0).applyQuaternion(plug.quaternion).distanceTo(a.dir.clone().normalize())<1e-10);assert(new T.Vector3(0,1,0).applyQuaternion(adapter.quaternion).distanceTo(a.dir.clone().normalize())<1e-10);
  assert.equal(fiberExitDistance(a.p),35);assert.deepEqual(plug.userData.cableExit,[0,35,0]);plug.traverse(object=>assert.equal(object.userData.edgeId,source.id));return {meshes,exitDistance:35};
});
await check('PC blue and APC green boot materials preserve exact RGB during publication conversion',()=>{
  const group=new T.Group(),pc=createFCPlug(T,{connector:'FC/PC',color:'#b8297d'}),apc=createFCPlug(T,{connector:'FC/APC',color:'#b8297d'});group.add(pc,apc);
  const meshes=[];group.traverse(object=>{if(object.material)meshes.push({object,original:object.material});});const restore=preserveConnectionColors(T,group);
  for(const {object,original} of meshes){if(original.userData.connectionColor){assert.equal(object.material.isMeshBasicMaterial,true);assert.equal(object.material.toneMapped,false);assert.equal(object.material.color.getHexString(),original.color.getHexString());}else assert.equal(object.material,original);}
  assert.equal(pc.getObjectByName('connector_strain_relief_boot').material.color.getHexString(),'245ba1');assert.equal(apc.getObjectByName('connector_strain_relief_boot').material.color.getHexString(),'15905e');assert.equal(pc.getObjectByName('connector_jacket_transition').material.color.getHexString(),'b8297d');assert(apc.getObjectByName('fc_apc_8deg_ferrule'));restore();for(const {object,original} of meshes)assert.equal(object.material,original);return {PC:'#245ba1',APC:'#15905e',jacket:'#b8297d'};
});
await check('a permanent male pigtail adds a mating sleeve and a separate correctly oriented patch-cord plug',()=>{
  const a=port([-200,70,0],[1,0,0],'FC/PC','a',{gender:'male',pigtailEnd:true}),source=edge(),plug=createFiberPlug(T,a,source),adapter=createFCAdapter(T,{id:'tail',pos:[0,0,0],dir:[1,0,0],connector:'FC/PC',gender:'male'});
  assert.equal(adapter,null);assert(plug.getObjectByName('fc_inline_mating_sleeve'));assert.equal(plug.children.find(child=>child.name==='fiber_connector').position.y,12);assert.equal(fiberExitDistance(a.p),47);assert.deepEqual(plug.userData.cableExit,[0,47,0]);geometryFinite(plug);return {matingSleeveLength:12,cableExit:47};
});
await check('fixed product pigtail boot and collar color overrides retain independent polish metadata and RGB tags',()=>{
  for(const bootColor of ['#151a20','#e8c43b']){
    const plug=createFCPlug(T,{connector:'FC/PC',color:'#245f9e',bootColor,collarColor:'#efefdf',radius:.45});
    assert.equal(plug.userData.polish,'PC');assert.equal(plug.getObjectByName('connector_strain_relief_boot').material.color.getHexString(),bootColor.slice(1));assert.equal(plug.getObjectByName('connector_jacket_transition').material.color.getHexString(),'efefdf');assert.equal(plug.getObjectByName('connector_strain_relief_boot').material.userData.connectionColor,true);assert.deepEqual(plug.userData.cableExit,[0,35,0]);
  }
  return {productBoots:['black','yellow'],polish:'PC',exitDistance:35};
});
await check('bare permanent pigtails receive no fabricated FC socket or plug',()=>{
  for(const connector of ['尾纤熔接','pigtail','bare-fiber']){const a=port([0,60,0],[1,0,0],connector);assert.equal(createFiberPlug(T,a,edge()),null);assert.equal(createFCAdapter(T,{id:'tail',pos:[0,0,0],dir:[1,0,0],connector}),null);assert.equal(fiberExitDistance(a.p),14);}return {supportedLabels:3};
});
await check('vendor dimension overrides keep plug and automatic stress-relief exits consistent',()=>{
  const options={dimensions:{bootLength:25,sleeveLength:16}},a=port([-300,70,0],[1,0,0],'FC/APC','a',{gender:'male'}),b=port([300,70,0],[-1,0,0],'FC/PC','b'),plug=createFiberPlug(T,a,edge(),options),curve=createFiberCurve(T,edge(),a,b,options);
  assert.equal(fiberExitDistance(a.p,options),59);assert.equal(plug.userData.cableExit[1],59);assert.equal(curve.userData.routing.exitDistances[0],59);assert(curve.curves[0].getLength()>=59);return {customExit:59};
});
await check('hybrid FC patch cords allow individually matched PC and APC plugs while other connector families retain compatibility checks',()=>{
  assert.equal(supportedFiberConnectorPair('FC/PC','FC/APC'),true);assert.equal(supportedFiberConnectorPair('FC/SPC','FC/PC'),true);assert.equal(supportedFiberConnectorPair('FC/UPC','FC/APC'),true);assert.equal(supportedFiberConnectorPair('SC/PC','SC/PC'),true);assert.equal(supportedFiberConnectorPair('SC/PC','FC/APC'),false);assert.equal(supportedFiberConnectorPair(undefined,'FC/PC'),false);return {hybridFCSupported:true};
});
await check('missing endpoints return no path and invalid finite-coordinate or dimension inputs are rejected',()=>{
  const a=port([-300,70,0],[1,0,0]),b=port([300,70,0],[-1,0,0],'FC/PC','b');assert.equal(createFiberCurve(T,edge(),null,b),null);assert.equal(createFiberPlug(T,null,edge()),null);assert.throws(()=>createFiberCurve(T,edge(),{...a,dir:new T.Vector3()},b));assert.throws(()=>createFiberCurve(T,edge(),{...a,pos:[NaN,0,0]},b));assert.throws(()=>createFCPlug(T,{dimensions:{bootLength:-1}}));assert.throws(()=>createFCAdapter(T,{pos:[0,0,0],dir:[0,0,0],connector:'FC/PC'}));return {invalidInputsRejected:true};
});
await check('a long tabletop route avoids a row of thirty separate instrument bodies',()=>{
  const obstacles=Array.from({length:30},(_,index)=>box('body_'+index,[-1420+index*95,0,-65],[-1370+index*95,130,105])),a=port([-1550,90,0],[1,0,0]),b=port([1550,90,0],[-1,0,0],'FC/PC','b'),started=performance.now(),curve=createFiberCurve(T,edge(),a,b,{obstacles}),elapsedMs=performance.now()-started;
  const points=finiteCurve(curve);assert.deepEqual(curve.userData.routing.unresolvedObstacles,[]);for(const record of obstacles)assert(points.every(point=>!record.box.containsPoint(point)));continuous(curve);assert(elapsedMs<2000);return {obstacles:30,elapsedMs,segments:curve.curves.length};
});
await check('connector geometry exports as a valid binary GLB including knurl instances and material color tags',async()=>{
  const previous=globalThis.FileReader;
  globalThis.FileReader=class {async readAsArrayBuffer(blob){this.result=await blob.arrayBuffer();this.onload?.();this.onloadend?.();}async readAsDataURL(blob){this.result='data:'+blob.type+';base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload?.();this.onloadend?.();}};
  try{
    const {GLTFExporter}=await import('../vendor/package/examples/jsm/exporters/GLTFExporter.js'),group=new T.Group();group.add(createFCPlug(T,{connector:'FC/PC'}),createFCPlug(T,{connector:'FC/APC'}));group.children[1].position.x=20;group.updateMatrixWorld(true);
    const result=await new GLTFExporter().parseAsync(group,{binary:true,onlyVisible:true,trs:true}),bytes=Buffer.from(result);assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
    const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());assert(json.extensionsUsed.includes('EXT_mesh_gpu_instancing'));assert(json.nodes.some(node=>node.extras?.isCable===true));assert(json.materials.some(material=>material.extras?.connectionColor===true));assert(json.meshes.length>10);return {bytes:bytes.length,meshes:json.meshes.length,instancingPreserved:true};
  }finally{if(previous===undefined)delete globalThis.FileReader;else globalThis.FileReader=previous;}
});
const source=fs.readFileSync(new URL('./fiber-routing.js',import.meta.url)),report={allPassed:tests.every(test=>test.passed),count:tests.length,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),scope:'Actual Three.js curves, transforms, connector geometry, AABB avoidance and connection-color preservation. These are geometric layout checks. No optical propagation, stress, bend-rating certification, real WebGL pixels or vendor-CAD fidelity is asserted.',tests};
fs.writeFileSync(new URL('../qa/fiber_routing_qa.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({allPassed:report.allPassed,count:report.count,failures:tests.filter(test=>!test.passed)}));if(!report.allPassed)process.exitCode=1;
