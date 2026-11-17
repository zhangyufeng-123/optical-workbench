import {expandAssemblies,movableAssemblyItems,remapAssembly} from './assembly-state.js';
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)&&!['__proto__','prototype','constructor'].includes(value);
const clone=value=>structuredClone(value);
export const PRECISION_DEFAULTS={mode:'transform',dx:0,dy:0,dz:0,rotation:0,copies:3};

function settings(options={}){
  const result={...PRECISION_DEFAULTS,...options};
  if(!['transform','array'].includes(result.mode))throw new Error('请选择平移旋转或阵列复制');
  for(const key of ['dx','dy','dz'])if(!Number.isFinite(result[key])||Math.abs(result[key])>8000)throw new Error('位移须为 ±8000 mm 内的有效数字');
  if(!Number.isFinite(result.rotation)||Math.abs(result.rotation)>3600)throw new Error('旋转角度须在 ±3600° 内');
  if(!Number.isInteger(result.copies)||result.copies<1||result.copies>20)throw new Error('额外副本数须为 1–20 的整数');
  return result;
}

/** Rotation follows Three.js positive Y: x'=cos*x+sin*z, z'=-sin*x+cos*z. */
function movePoint(point,pivot,options,step=1){
  const angle=options.rotation*step*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=point.x-pivot.x,z=point.z-pivot.z;
  return {x:pivot.x+x*c+z*s+options.dx*step,y:(point.y||0)+options.dy*step,z:pivot.z-x*s+z*c+options.dz*step};
}

function prepareTransform(scene,selection,options={}){
  if(!Array.isArray(scene?.items)||!Array.isArray(scene?.connections))throw new Error('当前工程不完整');
  const config=settings(options),selected=new Set(expandAssemblies(scene,selection||[])),chosen=scene.items.filter(item=>selected.has(item.id));
  if(!chosen.length)throw new Error('请先选择器件；Shift + 点击可多选');
  const targets=movableAssemblyItems(scene,[...selected]),targetIds=new Set(targets.map(item=>item.id));
  if(!targets.length)throw new Error('所选器件均已锁定，请先解锁');
  const internal=scene.connections.filter(edge=>targetIds.has(edge.a.item)&&targetIds.has(edge.b.item));
  const boundary=scene.connections.filter(edge=>targetIds.has(edge.a.item)!==targetIds.has(edge.b.item));
  const pivot={x:targets.reduce((sum,item)=>sum+item.x,0)/targets.length,z:targets.reduce((sum,item)=>sum+item.z,0)/targets.length};
  const zero=config.dx===0&&config.dy===0&&config.dz===0&&config.rotation===0;
  if(config.mode==='array'&&zero)throw new Error('请设置阵列间距或步进角度，避免副本完全重合');
  const summary={mode:config.mode,selected:chosen.length,targets:targets.length,skippedLocked:chosen.length-targets.length,internalConnections:internal.length,boundaryConnections:boundary.length,boundaryWaypoints:boundary.filter(edge=>edge.waypoints?.length).length,pivot,addedItems:config.mode==='array'?targets.length*config.copies:0,addedConnections:config.mode==='array'?internal.length*config.copies:0,changed:!zero};
  if(scene.items.length+summary.addedItems>250||scene.connections.length+summary.addedConnections>600)throw new Error('复制后超过 250 个器件或 600 条连接，请减少副本数或选择范围');
  for(let step=1;step<=(config.mode==='array'?config.copies:1);step++){
    for(const original of targets){const point=movePoint(original,pivot,config,step);if(Math.abs(point.x)>10000||Math.abs(point.z)>10000||Math.abs(point.y)>2000)throw new Error('变换后的器件超出可编辑范围：X/Z 为 ±10000 mm，Y 为 ±2000 mm');}
    for(const edge of internal)for(const original of edge.waypoints||[]){const point=movePoint(original,pivot,config,step);if([point.x,point.y,point.z].some(value=>!Number.isFinite(value)||Math.abs(value)>=20000))throw new Error('变换后的手动走线控制点超出 ±20000 mm');}
  }
  return {config,targets,targetIds,internal,pivot,zero,summary};
}

/** Lightweight preview: never copies GLB resources or assigns IDs. */
export function describeTransform(scene,selection,options={}){return clone(prepareTransform(scene,selection,options).summary);}

/** Build an atomically validated scene. Input scene and selections stay untouched. */
export function planTransform(scene,selection,options={},context={}){
  if(typeof context.validate!=='function')throw new Error('工程校验接口未接入，未修改场景');
  const {config,targets,targetIds,internal,pivot,zero,summary}=prepareTransform(scene,selection,options),next=clone(scene);
  let ids=[...targetIds];
  if(config.mode==='transform'){
    if(!zero){
      for(const item of next.items)if(targetIds.has(item.id)){Object.assign(item,movePoint(item,pivot,config));item.rotation+=config.rotation;}
      for(const edge of next.connections)if(targetIds.has(edge.a.item)&&targetIds.has(edge.b.item)&&edge.waypoints?.length)edge.waypoints=edge.waypoints.map(point=>movePoint(point,pivot,config));
    }
  }else{
    const used=new Set([...next.items.map(item=>item.id),...next.connections.map(edge=>edge.id),...(next.custom||[]).map(def=>def.id)]);
    let serial=0;
    const generate=prefix=>{for(let attempt=0;attempt<1000;attempt++){const id=context.uid?context.uid(prefix):`${prefix}_${Date.now().toString(36)}_${++serial}`;if(safeId(id)&&!used.has(id)){used.add(id);return id;}}throw new Error('无法分配新标识，阵列未创建');};
    ids=[];
    for(let step=1;step<=config.copies;step++){
      const remap=new Map(),groups=new Map();
      for(const original of targets){
        const item=clone(original);remapAssembly(item,groups,generate);item.id=generate('array_obj');remap.set(original.id,item.id);ids.push(item.id);
        Object.assign(item,movePoint(original,pivot,config,step));item.rotation+=config.rotation*step;
        item.label=(original.label+' ('+step+')').slice(0,150);
        if(original.figureLabel)item.figureLabel=(original.figureLabel+'_'+step).slice(0,150);
        next.items.push(item);
      }
      for(const original of internal){
        const edge=clone(original);edge.id=generate(original.kind==='beam'?'array_beam':'array_fiber');
        edge.a.item=remap.get(original.a.item);edge.b.item=remap.get(original.b.item);
        if(edge.waypoints?.length)edge.waypoints=edge.waypoints.map(point=>movePoint(point,pivot,config,step));
        next.connections.push(edge);
      }
    }
  }
  const validated=context.validate(next);
  if(new TextEncoder().encode(JSON.stringify(validated,null,2)).byteLength>100e6)throw new Error('变换后工程超过 100 MB，请减少模型资源');
  return {scene:validated,ids,summary};
}

export function installPrecisionTools(api){
  const dialog=document.createElement('dialog');dialog.id='precisionDialog';dialog.className='precision-dialog';dialog.setAttribute('aria-label','精确变换');
  dialog.innerHTML=`<header class="precision-head"><div><h2>精确变换</h2><p data-precision="selection"></p></div><button type="button" data-precision="close">返回画布</button></header>
  <div class="precision-body"><div class="precision-modes" role="group" aria-label="操作模式"><button type="button" data-precision-mode="transform" aria-pressed="true">平移与旋转</button><button type="button" data-precision-mode="array" aria-pressed="false">阵列复制</button></div>
  <fieldset><legend data-precision="translationTitle">整组位移 / mm</legend><div class="precision-axis-grid"><label>X · 左右<input type="number" data-precision="dx" min="-8000" max="8000" step="1" value="0"></label><label>Y · 高度<input type="number" data-precision="dy" min="-8000" max="8000" step="1" value="0"></label><label>Z · 前后<input type="number" data-precision="dz" min="-8000" max="8000" step="1" value="0"></label></div></fieldset>
  <div class="precision-rotation-row"><label><span data-precision="rotationTitle">绕中心旋转 / °</span><input type="number" data-precision="rotation" min="-3600" max="3600" step="1" value="0"></label><label data-precision="copiesRow" hidden>额外副本<input type="number" data-precision="copies" min="1" max="20" step="1" value="3"></label><button type="button" data-precision="reset">数值归零</button></div>
  <p class="precision-pivot" data-precision="pivot"></p><p class="precision-note" data-precision="scopeNote">锁定器件跳过。内部手动走线随组变换；跨组走线的控制点保留原位。</p>
  <div class="precision-plan" data-precision="plan" aria-live="polite"></div></div>
  <footer class="precision-footer"><p data-precision="status" role="status">数值为相对变化，应用后可用 Ctrl+Z 撤销。</p><button type="button" data-precision="apply" class="primary">应用变换</button></footer>`;
  document.body.append(dialog);
  const launcher=document.createElement('button');launcher.id='precisionTools';launcher.type='button';launcher.textContent='精确变换';launcher.title='整组平移、旋转与带内部连线的阵列复制';(document.querySelector('.workspace-tabs')||document.querySelector('.viewbar .tools')||document.body).append(launcher);
  const q=name=>dialog.querySelector(`[data-precision="${name}"]`);
  let mode='transform',busy=false,lastPlan=null;
  const options=()=>({mode,...Object.fromEntries(['dx','dy','dz','rotation','copies'].map(name=>[name,Number(q(name).value)]))});
  const say=message=>{q('status').textContent=message;api.toast?.(message);};
  function refresh(){
    const ids=new Set(api.getSelection()),items=api.getState().items.filter(item=>ids.has(item.id)),locked=items.filter(item=>item.locked).length;
    q('selection').textContent=`已选 ${items.length} 个器件${locked?`，跳过 ${locked} 个锁定项`:''}`;
    q('copiesRow').hidden=mode!=='array';q('translationTitle').textContent=mode==='array'?'每份位移 / mm':'整组位移 / mm';q('rotationTitle').textContent=mode==='array'?'每份旋转 / °':'绕中心旋转 / °';q('apply').textContent=mode==='array'?'创建阵列':'应用变换';
    for(const button of dialog.querySelectorAll('[data-precision-mode]'))button.setAttribute('aria-pressed',String(button.dataset.precisionMode===mode));
    try{
      lastPlan=describeTransform(api.getState(),api.getSelection(),options());
      const s=lastPlan;q('pivot').textContent=`旋转中心 X ${s.pivot.x.toFixed(1)}，Z ${s.pivot.z.toFixed(1)} mm（未锁定器件中心的平均值）`;
      q('plan').textContent=mode==='array'?`新增 ${s.addedItems} 个器件、${s.addedConnections} 条内部连接；原件保留。`:`变换 ${s.targets} 个器件、${s.internalConnections} 条内部连接。`;
      if(s.boundaryWaypoints)q('plan').textContent+=` ${s.boundaryWaypoints} 条跨组手动走线需复核。`;
      else if(s.boundaryConnections&&mode==='array')q('plan').textContent+=` ${s.boundaryConnections} 条外部连接不复制。`;
      q('apply').disabled=busy||!s.changed;
    }catch(error){lastPlan=null;q('pivot').textContent='';q('plan').textContent=error.message;q('apply').disabled=true;}
  }
  async function apply(overrides={}){
    if(busy)return null;
    let result;
    try{
      result=planTransform(api.getState(),api.getSelection(),{...options(),...overrides},{validate:api.validate,uid:api.uid});
      if(!result.summary.changed){say('数值没有变化，场景保持原样');return result.summary;}
      if(typeof api.loadState!=='function')throw new Error('工程加载接口未接入');
      busy=true;dialog.setAttribute('aria-busy','true');for(const element of dialog.querySelectorAll('button,input'))element.disabled=true;
      await api.loadState(result.scene,true);
      if(typeof api.selectMany==='function')api.selectMany(result.ids);
      else{api.select?.(null);for(const id of result.ids)api.select?.(id,false,true);}
      const s=result.summary;let message=s.mode==='array'?`已创建 ${s.addedItems} 个器件、${s.addedConnections} 条内部连接`:`已变换 ${s.targets} 个器件`;
      if(s.boundaryWaypoints)message+=`；${s.boundaryWaypoints} 条跨组手动走线请复核`;
      say(message+'，Ctrl+Z 可撤销。');dialog.close();return s;
    }catch(error){say('未应用：'+error.message);throw error;}
    finally{busy=false;dialog.setAttribute('aria-busy','false');for(const element of dialog.querySelectorAll('button,input'))element.disabled=false;refresh();}
  }
  function open(){refresh();if(!dialog.open)dialog.showModal();}
  function close(){if(!busy)dialog.close();}
  launcher.onclick=open;q('close').onclick=close;q('apply').onclick=()=>apply().catch(()=>{});
  q('reset').onclick=()=>{for(const name of ['dx','dy','dz','rotation'])q(name).value='0';refresh();};
  for(const button of dialog.querySelectorAll('[data-precision-mode]'))button.onclick=()=>{mode=button.dataset.precisionMode;refresh();};
  for(const name of ['dx','dy','dz','rotation','copies'])q(name).addEventListener('input',refresh);
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('keydown',event=>event.stopPropagation());
  refresh();return {open,close,refresh,apply,getSettings:options,getPlan:()=>lastPlan&&clone(lastPlan),isBusy:()=>busy,destroy:()=>{launcher.remove();dialog.remove();}};
}
