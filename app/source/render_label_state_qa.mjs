import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyRenderLabelEdits,collectRenderLabelEdits,normalizeRenderLabelEdits} from './render-label-state.js';

const base={panels:[{id:'panel',annotations:[
  {id:'label_a',sourceId:'device_a',type:'text',text:'光源 Laser',x:.2,y:.25,anchorX:.2,anchorY:.5,fontPt:8,color:'#263743',leader:true},
  {id:'label_b',sourceId:'device_b',type:'text',text:'探测器',x:.8,y:.25,anchorX:.8,anchorY:.5,fontPt:8,color:'#263743',leader:true}
]}]};
const tests=[];
function check(name,run){run();tests.push({name,passed:true});}
check('Edited text, local fonts and position survive JSON save and a newly captured device anchor',()=>{
  const edited=structuredClone(base),annotation=edited.panels[0].annotations[0];
  Object.assign(annotation,{text:'自定义光源 <A> & Laser',x:.3,y:.15,fontChinese:'KaiTi',fontLatin:'Arial',fontPt:11,bold:true});
  const edits=JSON.parse(JSON.stringify(collectRenderLabelEdits(base,edited)));
  const recaptured=structuredClone(base);recaptured.panels[0].annotations[0].anchorX=.4;
  const restored=applyRenderLabelEdits(recaptured,edits).panels[0].annotations[0];
  for(const key of ['text','x','y','fontChinese','fontLatin','fontPt','bold'])assert.equal(restored[key],annotation[key]);
  assert.equal(restored.anchorX,.4);assert.equal(base.panels[0].annotations[0].text,'光源 Laser');
});
check('Deleting one automatic label persists without removing its device or neighboring label',()=>{
  const edited=structuredClone(base);edited.panels[0].annotations.shift();
  const restored=applyRenderLabelEdits(base,collectRenderLabelEdits(base,edited));
  assert.deepEqual(restored.panels[0].annotations.map(annotation=>annotation.sourceId),['device_b']);
  assert.equal(base.panels[0].annotations.length,2);
});
check('A regenerated leader starts at the edited label unless a new endpoint was explicitly saved',()=>{
  const captured=structuredClone(base);
  Object.assign(captured.panels[0].annotations[0],{leaderStartX:.2,leaderStartY:.3});
  const edits={version:1,overrides:[{sourceId:'device_a',properties:{x:.45,y:.6,text:'移动后文字'}}],added:[]};
  const restored=applyRenderLabelEdits(captured,edits).panels[0].annotations[0];
  assert.equal(restored.x,.45);assert.equal(restored.y,.6);
  assert.equal(restored.leaderStartX,undefined);assert.equal(restored.leaderStartY,undefined);
  assert.equal(restored.anchorX,.2);assert.equal(restored.anchorY,.5);
  Object.assign(edits.overrides[0].properties,{leaderStartX:.5,leaderStartY:.65});
  const explicit=applyRenderLabelEdits(captured,edits).panels[0].annotations[0];
  assert.equal(explicit.leaderStartX,.5);assert.equal(explicit.leaderStartY,.65);
});
check('Added and intentionally blank text persist exactly once',()=>{
  const edited=structuredClone(base);edited.panels[0].annotations[0].text='';
  edited.panels[0].annotations.push({id:'custom_text',type:'text',text:'新增文字',x:.5,y:.8,fontPt:10,color:'#334455'});
  const edits=collectRenderLabelEdits(base,edited),first=applyRenderLabelEdits(base,edits),second=applyRenderLabelEdits(first,edits);
  assert.equal(first.panels[0].annotations[0].text,'');assert.equal(second.panels[0].annotations.length,3);
  assert.equal(second.panels[0].annotations[2].text,'新增文字');
});
check('Temporarily absent devices retain their saved label edits for the next render',()=>{
  const previous={version:1,overrides:[{sourceId:'temporarily_hidden',properties:{text:'保留的标注'}}],added:[]};
  const edits=collectRenderLabelEdits(base,base,previous);
  assert.deepEqual(edits,previous);
});
check('Other paper panels cannot overwrite device labels or move their text into the next scene render',()=>{
  const edited=structuredClone(base);
  edited.panels[0].annotations[0].text='主图文字';
  edited.panels[0].annotations.push({id:'primary_note',type:'text',text:'主图说明',x:.4,y:.7});
  edited.panels.push({id:'second_panel',annotations:[
    {...base.panels[0].annotations[0],id:'second_label',text:'第二幅同器件文字'},
    {id:'second_note',type:'text',text:'第二幅说明',x:.5,y:.6}
  ]});
  const restored=applyRenderLabelEdits(base,collectRenderLabelEdits(base,edited));
  assert.equal(restored.panels[0].annotations[0].text,'主图文字');
  assert.deepEqual(restored.panels[0].annotations.filter(annotation=>!annotation.sourceId).map(annotation=>annotation.id),['primary_note']);
});
check('Removing the original panel from a paper layout leaves saved project labels intact',()=>{
  const previous={version:1,overrides:[{sourceId:'device_a',properties:{text:'已保存的主图标注'}}],added:[{id:'saved_note',type:'text',text:'已保存说明',x:.3,y:.6}]};
  const unrelated={panels:[{id:'replacement_panel',annotations:[]}]};
  assert.deepEqual(collectRenderLabelEdits(base,unrelated,previous),previous);
});
check('Malformed font, coordinate, duplicate and excessive text records are rejected',()=>{
  for(const properties of [{fontChinese:'unknown'},{fontLatin:'Arial" onload="x'},{x:Infinity},{y:2},{text:'x'.repeat(1001)},{color:'red'},{bold:'yes'}]){
    assert.throws(()=>normalizeRenderLabelEdits({version:1,overrides:[{sourceId:'device_a',properties}],added:[]}));
  }
  assert.throws(()=>normalizeRenderLabelEdits({version:1,overrides:[{sourceId:'a',properties:{}},{sourceId:'a',properties:{}}],added:[]}));
});
const report={allPassed:true,checks:tests.length,tests};
fs.writeFileSync(new URL('../qa/render_label_state_qa.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({allPassed:true,checks:tests.length}));
