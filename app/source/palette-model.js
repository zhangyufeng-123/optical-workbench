// Pure color planning. No geometry, optical topology or imported materials change.
const HEX = /^#[0-9a-f]{6}$/i;
export const FIBER_DEFAULTS = {SM:'#d28b25', PM:'#247cb4', MM:'#92558f'};
export const PALETTES = [
  {id:'journal',name:'论文蓝橙',description:'蓝灰器件，橙红主光路',body:'#3c5365',accent:'#668698',sample:'#7d8b91',detector:'#405a71',beams:['#d65338','#167e99','#9870b2','#c59828'],fibers:{SM:'#bd8b3e',PM:'#387fab',MM:'#8663a4'},background:'#edf1f4',floor:'#e4eaee',table:'#b3bdc5'},
  {id:'graphite',name:'石墨红光',description:'深灰金属，红光与青绿支路',body:'#37464f',accent:'#607781',sample:'#7f898d',detector:'#425763',beams:['#e0384c','#209e8c','#557cbb','#c6923e'],fibers:{SM:'#bd923e',PM:'#3a83b4',MM:'#94699d'},background:'#e8ecef',floor:'#dfe5e9',table:'#a5afb7'},
  {id:'marine',name:'海蓝铜金',description:'海蓝外壳，铜金与湖蓝光束',body:'#2d526b',accent:'#7198aa',sample:'#8a9698',detector:'#3e6177',beams:['#db713a','#2782ac','#b39a37','#8e6cb3'],fibers:{SM:'#bb9046',PM:'#3086aa',MM:'#8d73ac'},background:'#edf4f5',floor:'#dce9ec',table:'#a4bac2'},
  {id:'mineral',name:'矿物绿紫',description:'矿物灰绿，紫色主光路',body:'#425d59',accent:'#7a9187',sample:'#9c9c89',detector:'#4d6a69',beams:['#9c53b5','#df7046','#2a8ca8','#b39430'],fibers:{SM:'#b5934d',PM:'#3b8a97',MM:'#9570a8'},background:'#f0f2ee',floor:'#e3e8e1',table:'#b4c0b7'},
  {id:'accessible',name:'色觉友好',description:'蓝、橙、绿、紫的清晰分支',body:'#465561',accent:'#738899',sample:'#8f979a',detector:'#526b7e',beams:['#d55e00','#0072b2','#009e73','#cc79a7'],fibers:{SM:'#c89513',PM:'#0072b2',MM:'#a86690'},background:'#f3f5f6',floor:'#e5e9ec',table:'#bcc5cb'},
  {id:'darkfield',name:'暗场荧光',description:'深色实验桌，明亮红青光束',body:'#354c61',accent:'#6a8a9f',sample:'#91a2ae',detector:'#426179',beams:['#ff6b6b','#62d4c9','#ffd166','#b49bff'],fibers:{SM:'#e3b761',PM:'#63add4',MM:'#bd94cd'},background:'#1d2833',floor:'#17222c',table:'#435563'}
];
export const DEFAULT_PALETTE_OPTIONS = {
  paletteId:'journal',scope:'all',edgeScope:'internal',deviceMode:'category',connectionMode:'paths',
  applyDevices:true,applyConnections:true,applyAppearance:true,includeHidden:false,
  preserveLocks:true,applyBeamStyle:false,beamDiameter:3.6,beamGlow:.55,
  applyFiberStyle:false,fiberDiameter:2.3
};
const clone = value => structuredClone(value);
const asHex = (value,name) => {
  if(typeof value!=='string'||!HEX.test(value))throw new Error(name+'须为六位十六进制颜色');
  return value.toLowerCase();
};
function validatePalette(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('配色内容不完整');
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>60)throw new Error('配色名称须为1–60个字符');
  if(!Array.isArray(value.beams)||value.beams.length<2||value.beams.length>6)throw new Error('光束配色需要2–6种颜色');
  const palette={id:typeof value.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)?value.id:'custom',name:value.name.trim(),description:typeof value.description==='string'?value.description.slice(0,160):'自定义配色',renderStyle:['paper','reference','dark','warm'].includes(value.renderStyle)?value.renderStyle:value.id==='darkfield'?'dark':'reference'};
  for(const name of ['body','accent','sample','detector','background','floor','table'])palette[name]=asHex(value[name],name);
  palette.beams=value.beams.map((color,index)=>asHex(color,'光束 '+(index+1)));
  palette.fibers={};for(const name of ['SM','PM','MM'])palette.fibers[name]=asHex(value.fibers?.[name],name);
  return palette;
}
export function getPalette(id='journal'){
  const value=PALETTES.find(p=>p.id===id);if(!value)throw new Error('未知配色方案');return clone(value);
}
export function validatePaletteDocument(document){
  if(document?.format!=='optics-color-palette'||document.version!==1)throw new Error('不是兼容的配色文件');
  return {format:'optics-color-palette',version:1,palette:validatePalette(document.palette)};
}
export function paletteDocument(palette){
  return {format:'optics-color-palette',version:1,palette:validatePalette(palette)};
}
function normalizeOptions(options){
  const result={...DEFAULT_PALETTE_OPTIONS,...options};
  for(const [key,values] of Object.entries({scope:['all','selection'],edgeScope:['internal','touching'],deviceMode:['category','uniform'],connectionMode:['paths','media','single']}))if(!values.includes(result[key]))throw new Error('无效选项：'+key);
  for(const key of ['applyDevices','applyConnections','applyAppearance','includeHidden','preserveLocks','applyBeamStyle','applyFiberStyle'])if(typeof result[key]!=='boolean')throw new Error('无效开关：'+key);
  for(const [key,min,max] of [['beamDiameter',.6,20],['beamGlow',0,1],['fiberDiameter',.6,10]])if(!Number.isFinite(result[key])||result[key]<min||result[key]>max)throw new Error(key+'超出允许范围');
  return result;
}

// Continue a color across serial components. At a splitter, in -> out stays on
// the main path while ref/other branches receive their own color. Media remain
// separate at a fiber collimator. This is visual grouping, not ray tracing.
export function connectionPathGroups(state,definition=()=>null){
  const edges=state.connections||[],parent=new Map(edges.map(e=>[e.id,e.id])),byItem=new Map(),items=new Map((state.items||[]).map(it=>[it.id,it]));
  const portRole=(itemId,portId)=>{const item=items.get(itemId),ports=item&&(item.ports||definition(item.type)?.ports);return ports?.find(port=>port.id===portId)?.role||(['in','out'].includes(portId)?portId:null);};
  const find=id=>{let root=id;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,root);id=next;}return root;};
  const join=(a,b)=>{if((a.kind==='beam')===(b.kind==='beam'))parent.set(find(b.id),find(a.id));};
  for(const edge of edges)for(const end of [edge.a,edge.b]){if(!byItem.has(end.item))byItem.set(end.item,[]);byItem.get(end.item).push({edge,port:end.port});}
  for(const [itemId,attached] of byItem){
    if(attached.length===2){const a=portRole(itemId,attached[0].port),b=portRole(itemId,attached[1].port);if(!(a===b&&['in','out'].includes(a)))join(attached[0].edge,attached[1].edge);}
    else{const input=attached.find(e=>e.port==='in'),output=attached.find(e=>e.port==='out');if(input&&output)join(input.edge,output.edge);}
  }
  const groupIndex=new Map(),result=new Map(),counts={beam:0,fiber:0};
  for(const edge of edges){const medium=edge.kind==='beam'?'beam':'fiber',root=medium+':'+find(edge.id);if(!groupIndex.has(root))groupIndex.set(root,counts[medium]++);result.set(edge.id,groupIndex.get(root));}
  return result;
}

export function planPalette(state,options={},context={}){
  if(!Array.isArray(state?.items)||!Array.isArray(state?.connections))throw new Error('场景不完整');
  const settings=normalizeOptions(options),palette=validatePalette(context.palette||getPalette(settings.paletteId)),selection=new Set(context.selection||[]),selectedEdges=new Set(context.selectedEdges||[]),definitions=context.definition||(()=>null);
  const itemsById=new Map(state.items.map(it=>[it.id,it])),groups=connectionPathGroups(state,definitions);
  if(settings.scope==='selection'&&![...selection].some(id=>itemsById.has(id))&&!state.connections.some(edge=>selectedEdges.has(edge.id)))throw new Error('请先选择器件或连接，再应用到当前选择');
  const plan={items:[],connections:[],appearance:undefined,palette:undefined,settings,summary:{devices:0,connections:0,beams:0,fibers:0,locked:0,imported:0,hidden:0,appearance:false,totalChanges:0}};
  const inScope=it=>settings.scope==='all'||selection.has(it.id);
  const locked=it=>settings.preserveLocks&&(it.locked||it.colorLocked);
  const restore=options.restoreDefaults===true;
  if(settings.applyDevices)for(const item of state.items){
    if(!inScope(item))continue;
    if(item.hidden&&!settings.includeHidden){plan.summary.hidden++;continue;}
    const def=definitions(item.type)||{};
    if(def.shape==='import'){plan.summary.imported++;continue;}
    if(locked(item)){plan.summary.locked++;continue;}
    let color=palette.body;
    if(settings.deviceMode==='category'){
      if(/光源/.test(def.category||''))color=palette.accent;
      else if(/测量|探测/.test(def.category||''))color=palette.detector;
      else if(/样品|传感/.test(def.category||''))color=palette.sample;
    }
    if(restore)color=HEX.test(def.color)?def.color:'#34434b';
    if(item.color?.toLowerCase()!==color.toLowerCase())plan.items.push({id:item.id,patch:{color}});
  }
  if(settings.applyConnections)for(const edge of state.connections){
    const a=itemsById.get(edge.a.item),b=itemsById.get(edge.b.item);
    if(!a||!b)continue;
    if(settings.scope==='selection'&&!selectedEdges.has(edge.id)&&!(settings.edgeScope==='touching'?(selection.has(a.id)||selection.has(b.id)):(selection.has(a.id)&&selection.has(b.id))))continue;
    if(!settings.includeHidden&&(a.hidden||b.hidden)){plan.summary.hidden++;continue;}
    if(locked(edge)||locked(a)||locked(b)){plan.summary.locked++;continue;}
    const beam=edge.kind==='beam',patch={};let color;
    if(restore)color=beam?'#ed283c':FIBER_DEFAULTS[edge.fiber]||FIBER_DEFAULTS.SM;
    else if(settings.connectionMode==='single')color=palette.beams[0];
    else if(!beam)color=palette.fibers[edge.fiber]||palette.fibers.SM;
    else color=palette.beams[settings.connectionMode==='paths'?(groups.get(edge.id)||0)%palette.beams.length:0];
    if(edge.color?.toLowerCase()!==color.toLowerCase())patch.color=color;
    if(!restore&&beam&&settings.applyBeamStyle){if(edge.radius!==settings.beamDiameter/2)patch.radius=settings.beamDiameter/2;if(edge.glow!==settings.beamGlow)patch.glow=settings.beamGlow;}
    if(!restore&&!beam&&settings.applyFiberStyle&&edge.radius!==settings.fiberDiameter/2)patch.radius=settings.fiberDiameter/2;
    if(Object.keys(patch).length){plan.connections.push({id:edge.id,patch});plan.summary[beam?'beams':'fibers']++;}
  }
  if(settings.applyAppearance){
    const appearance=restore?null:{background:palette.background,floor:palette.floor,table:palette.table};
    if(JSON.stringify(state.presentation?.appearance||null)!==JSON.stringify(appearance)||state.presentation?.stage!=='bench'||state.presentation?.showTable!==true){plan.appearance=appearance;plan.summary.appearance=true;}
  }
  plan.palette={id:restore?'default':palette.id,name:restore?'器件默认色':palette.name,colors:restore?null:clone(palette),renderStyle:restore?'reference':palette.renderStyle,deviceMode:settings.deviceMode,connectionMode:settings.connectionMode};
  plan.summary.devices=plan.items.length;plan.summary.connections=plan.connections.length;
  plan.summary.totalChanges=plan.items.length+plan.connections.length+(plan.summary.appearance?1:0);
  return plan;
}

export function applyPalettePlan(state,plan){
  const items=new Map(state.items.map(it=>[it.id,it])),edges=new Map(state.connections.map(e=>[e.id,e]));
  if(plan.items.some(change=>!items.has(change.id))||plan.connections.some(change=>!edges.has(change.id)))throw new Error('场景已改变，请重新选择配色');
  for(const change of plan.items)Object.assign(items.get(change.id),change.patch);
  for(const change of plan.connections)Object.assign(edges.get(change.id),change.patch);
  if(plan.appearance!==undefined){
    state.presentation??={};
    if(plan.appearance===null)delete state.presentation.appearance;else state.presentation.appearance=clone(plan.appearance);
    state.presentation.stage='bench';state.presentation.showTable=true;
  }
  state.presentation??={};state.presentation.palette=clone(plan.palette);
  return clone(plan.summary);
}
