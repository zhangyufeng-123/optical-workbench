import {normalizeTypography} from './typography.js';

const FIELDS=['text','x','y','fontPt','fontChinese','fontLatin','bold','color','leader','halo','align','leaderStartX','leaderStartY'];
const POSITION_FIELDS=new Set(['x','y','leaderStartX','leaderStartY']);
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const copy=value=>structuredClone(value);

function propertiesOf(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('文字编辑属性无效');
  const result={};
  for(const [key,entry] of Object.entries(value)){
    if(!FIELDS.includes(key))throw new Error('未知文字编辑属性');
    if(entry===null){result[key]=null;continue;}
    if(POSITION_FIELDS.has(key)&&(!Number.isFinite(entry)||entry<-.2||entry>1.2))throw new Error('文字位置超出图幅范围');
    if(key==='text'&&(typeof entry!=='string'||entry.length>1000))throw new Error('文字最多为 1000 个字符');
    if(key==='fontPt'&&(!Number.isFinite(entry)||entry<5||entry>20))throw new Error('文字字号须为 5–20 pt');
    if(['bold','leader','halo'].includes(key)&&typeof entry!=='boolean')throw new Error('文字显示设置无效');
    if(key==='color'&&(typeof entry!=='string'||!/^#[0-9a-f]{6}$/i.test(entry)))throw new Error('文字颜色无效');
    if(key==='align'&&!['start','middle','end'].includes(entry))throw new Error('文字对齐方式无效');
    if(key==='fontChinese')normalizeTypography({chinese:entry});
    if(key==='fontLatin')normalizeTypography({latin:entry});
    result[key]=entry;
  }
  return result;
}

export function normalizeRenderLabelEdits(value){
  if(value===undefined)return {version:1,overrides:[],added:[]};
  if(!value||value.version!==1||!Array.isArray(value.overrides)||!Array.isArray(value.added)||value.overrides.length>250||value.added.length>240)throw new Error('文字编辑记录无效');
  const seen=new Set();
  const overrides=value.overrides.map(entry=>{
    if(!entry||!safeId(entry.sourceId)||seen.has(entry.sourceId)||entry.deleted!==undefined&&typeof entry.deleted!=='boolean')throw new Error('器件文字编辑标识无效');
    seen.add(entry.sourceId);
    return {sourceId:entry.sourceId,...(entry.deleted?{deleted:true}:{}),properties:propertiesOf(entry.properties||{})};
  });
  const added=value.added.map(entry=>{
    if(!entry||!safeId(entry.id)||seen.has(entry.id)||entry.type!=='text')throw new Error('新增文字标识无效');
    seen.add(entry.id);
    const properties=Object.fromEntries(FIELDS.filter(key=>entry[key]!==undefined).map(key=>[key,entry[key]]));
    const validated=propertiesOf(properties);
    if(!Number.isFinite(validated.x)||!Number.isFinite(validated.y))throw new Error('新增文字位置无效');
    return {id:entry.id,type:'text',...validated,...(Number.isFinite(entry.anchorX)&&Number.isFinite(entry.anchorY)?{anchorX:Math.max(-.2,Math.min(1.2,entry.anchorX)),anchorY:Math.max(-.2,Math.min(1.2,entry.anchorY))}:{})};
  });
  return {version:1,overrides,added};
}

export function applyRenderLabelEdits(composition,value){
  const edits=normalizeRenderLabelEdits(value),result=copy(composition),overrides=new Map(edits.overrides.map(entry=>[entry.sourceId,entry]));
  for(const panel of result.panels){
    panel.annotations=panel.annotations.filter(annotation=>!overrides.get(annotation.sourceId)?.deleted);
    for(const annotation of panel.annotations){
      const properties=overrides.get(annotation.sourceId)?.properties||{};
      for(const [key,entry] of Object.entries(properties)){
        if(entry===null)delete annotation[key];else annotation[key]=entry;
      }
      if(['text','x','y','fontPt','fontChinese','fontLatin','bold'].some(key=>Object.hasOwn(properties,key))){
        for(const key of ['leaderStartX','leaderStartY'])if(!Object.hasOwn(properties,key))delete annotation[key];
      }
    }
  }
  if(result.panels[0]){
    const ids=new Set(result.panels.flatMap(panel=>panel.annotations.map(annotation=>annotation.id)));
    for(const annotation of edits.added)if(!ids.has(annotation.id)){result.panels[0].annotations.push(copy(annotation));ids.add(annotation.id);}
  }
  return result;
}

export function collectRenderLabelEdits(base,edited,previous){
  // Only the original captured panel owns project-level labels. Other panels
  // belong to the full paper composition and are saved in its own JSON.
  const basePanelIds=new Set(base.panels.map(panel=>panel.id));
  const editedPanels=edited.panels.filter(panel=>basePanelIds.has(panel.id));
  if(!editedPanels.length)return normalizeRenderLabelEdits(previous);
  const baseline=new Map(base.panels.flatMap(panel=>panel.annotations.filter(annotation=>annotation.sourceId).map(annotation=>[annotation.sourceId,annotation])));
  const current=new Map(editedPanels.flatMap(panel=>panel.annotations.filter(annotation=>annotation.sourceId).map(annotation=>[annotation.sourceId,annotation])));
  const overrides=normalizeRenderLabelEdits(previous).overrides.filter(entry=>!baseline.has(entry.sourceId));
  for(const [sourceId,annotation] of baseline){
    const changed=current.get(sourceId);
    if(!changed){overrides.push({sourceId,deleted:true,properties:{}});continue;}
    const properties={};
    for(const key of FIELDS)if(changed[key]!==annotation[key])properties[key]=changed[key]??null;
    if(Object.keys(properties).length)overrides.push({sourceId,properties});
  }
  const added=editedPanels.flatMap(panel=>panel.annotations.filter(annotation=>annotation.type==='text'&&!annotation.sourceId));
  return normalizeRenderLabelEdits({version:1,overrides,added});
}
