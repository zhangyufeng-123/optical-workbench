import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as T from '../vendor/package/build/three.module.js';
import {buildProductModel} from './product-models.js';
import {PRODUCT_DEFINITIONS} from './product-definitions.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tests=[],models={},previousDocument=globalThis.document;
globalThis.document={createElement:()=>({width:1,height:1,getContext:()=>({fillRect(){},fillText(){}})})};
function check(name,run){try{const detail=run();tests.push({name,passed:true,detail:detail??null});console.log('PASS',name);}catch(error){tests.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.message);}}
function near(a,b,tolerance=1e-5){assert(Math.abs(a-b)<=tolerance,`${a} versus ${b}`);}
function allMaterials(model){const materials=new Set();model.traverse(node=>{for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material);});return [...materials];}
function tubeCenter(mesh,end){const parameters=mesh.geometry.parameters,positions=mesh.geometry.attributes.position,count=parameters.radialSegments,offset=end?parameters.tubularSegments*(count+1):0,point=new T.Vector3();for(let index=0;index<count;index++)point.add(new T.Vector3().fromBufferAttribute(positions,offset+index));return point.divideScalar(count).applyMatrix4(mesh.matrixWorld);}

try{
  for(const [id,definition] of Object.entries(PRODUCT_DEFINITIONS)){
    const model=buildProductModel(definition);models[id]=model;
    check(id+' has finite editable mesh geometry and a conservative public envelope',()=>{
      const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());let meshes=0,vertices=0;
      model.traverse(node=>{if(!node.isMesh)return;meshes++;for(const value of node.geometry.attributes.position.array)assert(Number.isFinite(value));vertices+=node.geometry.attributes.position.count;assert(node.name);});
      assert(meshes>10);assert([...bounds.min,...bounds.max].every(Number.isFinite));
      size.toArray().forEach((value,axis)=>assert(value<=definition.size[axis]+.001));
      return {meshes,vertices,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},size:size.toArray()};
    });
    check(id+' preserves its declared millimetres, physical port metadata and product provenance',()=>{
      assert.equal(model.userData.opticalWorkbenchUnits,'mm');assert.deepEqual(model.userData.opticalPorts,definition.ports);
      assert.notEqual(model.userData.opticalPorts,definition.ports);assert.deepEqual(model.userData.metadata.bodySizeMM,definition.product.bodySize);
      assert.equal(model.userData.metadata.kind,definition.product.kind);assert(model.userData.metadata.geometryNotes.length>0);
      if(id!=='qwp')assert(model.userData.metadata.sources.some(source=>source.kind==='CAD PDF'));
    });
    check(id+' places every visible optical mating plane at its declared port',()=>{
      for(const port of definition.ports){
        const object=model.getObjectByName((port.gender==='male'?'fixed_FC_plug_':'optical_adapter_')+port.id);assert(object,port.id);
        assert.equal(object.userData.portId,port.id);assert.equal(object.userData.connector,port.connector);
        const point=object.localToWorld(new T.Vector3(...object.userData.matingPlane));assert(point.distanceTo(new T.Vector3(...port.pos))<1e-8);
        const axis=new T.Vector3(0,1,0).transformDirection(object.matrixWorld),expected=new T.Vector3(...port.dir).multiplyScalar(port.gender==='male'?-1:1);assert(axis.distanceTo(expected)<1e-8);
      }
    });
    check(id+' uses body-only collision bounds that exclude flexible leads',()=>{
      const expected=new T.Box3();for(const child of model.children)if(!['permanent_fiber_pigtails','visible_wound_fiber','continuous_controller_fiber'].includes(child.name))expected.union(new T.Box3().setFromObject(child));
      assert.deepEqual(model.userData.routingBounds,{min:expected.min.toArray(),max:expected.max.toArray()});
      if(definition.ports.some(port=>port.gender==='male'))assert(expected.getSize(new T.Vector3()).x<new T.Box3().setFromObject(model).getSize(new T.Vector3()).x-10);
    });
    check(id+' keeps per-instance editable materials and honors an explicit housing color',()=>{
      const second=buildProductModel(definition,{color:'#526b87'}),firstMaterials=allMaterials(model),secondMaterials=allMaterials(second);
      assert(secondMaterials.some(material=>material.name==='editable_housing'&&material.color.getHexString()==='526b87'));
      assert(secondMaterials.every(material=>!firstMaterials.includes(material)));
      const fibers=firstMaterials.filter(material=>material.name==='product_fiber_jacket');if(fibers.length)assert(fibers.every(material=>material.userData.connectionColor===true));
      second.traverse(node=>node.geometry?.dispose());secondMaterials.forEach(material=>material.dispose());
    });
  }
  for(const id of ['polarizer','paddle'])check(id+' permanent pigtails end exactly at the visible plug cable exits',()=>{
    const model=models[id];for(const port of PRODUCT_DEFINITIONS[id].ports){
      const plug=model.getObjectByName('fixed_FC_plug_'+port.id),fiber=model.getObjectByName('fixed_pigtail_'+port.id),exit=plug.localToWorld(new T.Vector3(...plug.userData.cableExit));assert(tubeCenter(fiber,true).distanceTo(exit)<1e-4);
    }
  });
  check('DFB13TK has the official red/black enclosure, Enable control and three electrical SMA inputs',()=>{
    const model=models.laser;assert(model.getObjectByName('red_extruded_housing'));assert(model.getObjectByName('enable_pushbutton'));const inputs=model.getObjectByName('electrical_modulation_inputs');assert.equal(inputs.userData.kind,'electrical');assert.equal(inputs.children.filter(node=>node.name==='SMA_female_threaded_barrel').length,3);assert.equal(PRODUCT_DEFINITIONS.laser.ports.length,1);assert(!allMaterials(model).some(material=>/screen|lcd/i.test(material.name)));
  });
  check('ILP1310PM-FC capsule matches the official 35 mm by 5.5 mm package',()=>{
    const capsule=models.polarizer.getObjectByName('inline_polarizer_capsule'),size=new T.Box3().setFromObject(capsule).getSize(new T.Vector3());near(size.x,35);near(size.y,5.5);near(size.z,5.5);
  });
  check('FPC031 retains three independently editable angled paddle groups and the official 4-3-4 fiber loops',()=>{
    const model=models.paddle;[4,3,4].forEach((turns,index)=>{const paddle=model.getObjectByName('paddle_assembly_'+(index+1));assert(paddle);assert.equal(paddle.children.filter(node=>node.name.startsWith('loaded_fiber_turn_')).length,turns);assert(paddle.getObjectByName('square_paddle_backplate'));assert(paddle.getObjectByName('circular_paddle_cover'));});
  });
  check('Self-made wound fiber has an analytic helix, a removable mandrel and continuous visible leads',()=>{
    const model=models.qwp,geometry=model.userData.windingGeometry,coil=model.getObjectByName('helical_fiber_sample'),curve=coil.geometry.parameters.path;
    near(geometry.turns,137/Math.hypot(2*Math.PI*10.45,42.2));near(geometry.axialLengthMM,geometry.turns*42.2);
    let length=0,previous=curve.getPoint(0);for(let index=1;index<=20000;index++){const point=curve.getPoint(index/20000);length+=point.distanceTo(previous);previous=point;}near(length,137,1e-4);
    assert(model.getObjectByName('removable_winding_mandrel').userData.editable);assert.equal(model.userData.metadata.manufacturer,'');assert.equal(model.userData.metadata.model,'');assert.equal(geometry.referenceOnly,true);
    const input=model.getObjectByName('sample_input_lead'),output=model.getObjectByName('sample_output_lead');assert(tubeCenter(input,true).distanceTo(curve.getPoint(0))<1e-4);assert(tubeCenter(output,false).distanceTo(curve.getPoint(1))<1e-4);
    for(const [id,lead,end] of [['in',input,false],['out',output,true]]){const plug=model.getObjectByName('fixed_FC_plug_'+id),exit=plug.localToWorld(new T.Vector3(...plug.userData.cableExit));assert(tubeCenter(lead,end).distanceTo(exit)<1e-4);}
    return {...geometry,numericalHelixLengthMM:length};
  });
  check('PAX input uses the named SM1M10, KAD12F and F240FC-C coaxial assembly',()=>{
    const model=models.polarimeter;for(const name of ['SM1M10_lens_tube','KAD12F_tilt_adapter','F240FC_C_collimator_body','collimator_lens_face'])assert(model.getObjectByName(name));
    const adapter=model.getObjectByName('optical_adapter_in');near(adapter.position.x,0);near(adapter.position.y,25);near(adapter.position.z,78);
  });
}finally{
  for(const model of Object.values(models)){model.traverse(node=>node.geometry?.dispose());allMaterials(model).forEach(material=>material.dispose());}
  if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
}
const report={checkedAt:new Date().toISOString(),allPassed:tests.every(test=>test.passed),checks:tests.length,scope:'Real Three.js product meshes, instance materials, analytic coil and connector frames. Canvas is a label-call stub. Browser pixels, native GLB round-trip and optical performance require their separate validation.',tests};
fs.writeFileSync(path.join(root,'qa/product_models_qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({allPassed:report.allPassed,checks:report.checks,failures:tests.filter(test=>!test.passed)}));if(!report.allPassed)process.exitCode=1;
