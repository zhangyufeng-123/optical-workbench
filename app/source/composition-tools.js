// Display composition only. Scores approximate screen overlap with bounding
// boxes; they are not optical ray tracing, clearance or alignment analysis.
const clone=value=>structuredClone(value);
const safeNumber=(value,min,max,name)=>{if(!Number.isFinite(value)||value<min||value>max)throw new Error(name+'超出允许范围');return value;};
const corners=(T,box)=>{const result=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])result.push(new T.Vector3(x,y,z));return result;};
const finiteVector=vector=>[vector.x,vector.y,vector.z].every(Number.isFinite);

export function compositionGeometry({T,state,roots,cableCurve}){
  const objects=[],paths=[],bounds=new T.Box3(),visible=new Set();
  for(const item of state.items){
    const root=roots.get(item.id);if(item.hidden||!root||!root.visible)continue;
    root.updateWorldMatrix?.(true,true);const box=new T.Box3().setFromObject(root);
    if(box.isEmpty()||![...box.min,...box.max].every(Number.isFinite))continue;
    visible.add(item.id);objects.push({id:item.id,box,points:corners(T,box)});bounds.union(box);
  }
  if(!objects.length)throw new Error('请先显示至少一个器件');
  for(const edge of state.connections){
    if(!visible.has(edge.a.item)||!visible.has(edge.b.item))continue;
    const curve=cableCurve?.(edge);if(!curve?.getPoints)continue;
    const points=curve.getPoints(edge.kind==='beam'?1:64).filter(finiteVector);if(points.length<2)continue;
    const box=new T.Box3().setFromPoints(points);box.expandByScalar(Math.max(2,(edge.radius||1)*5));bounds.union(box);paths.push({id:edge.id,points});
  }
  return {objects,paths,bounds,points:corners(T,bounds),center:bounds.getCenter(new T.Vector3())};
}

function orientation(T,azimuth,elevation){
  safeNumber(azimuth,-180,180,'方位角');safeNumber(elevation,3,89.9,'俯角');
  const az=azimuth*Math.PI/180,el=elevation*Math.PI/180,dir=new T.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
  const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),dir).normalize(),up=new T.Vector3().crossVectors(dir,right).normalize();
  return {dir,right,up};
}
function screenRect(points,center,right,up){
  let left=Infinity,rightEdge=-Infinity,bottom=Infinity,top=-Infinity;
  for(const point of points){const offset=point.clone().sub(center),x=offset.dot(right),y=offset.dot(up);left=Math.min(left,x);rightEdge=Math.max(rightEdge,x);bottom=Math.min(bottom,y);top=Math.max(top,y);}
  return {left,right:rightEdge,bottom,top,width:rightEdge-left,height:top-bottom};
}

/** Fit the perspective camera to the complete box, including connection paths. */
export function fitComposition(T,geometry,{azimuth=45,elevation=35.264,aspect=1.8,fov=38,zoom=1,padding=1.13}={}){
  safeNumber(aspect,.05,20,'画幅比例');safeNumber(fov,5,120,'相机视场');safeNumber(zoom,.1,10,'相机缩放');safeNumber(padding,1.02,1.8,'构图留白');
  const {dir}=orientation(T,azimuth,elevation),target=geometry.center.clone(),basis=orientation(T,azimuth,elevation),tanVertical=Math.tan(fov*Math.PI/360)/zoom,tanHorizontal=tanVertical*aspect;
  let distance=150;
  for(const point of geometry.points){const offset=point.clone().sub(target),depth=offset.dot(dir);distance=Math.max(distance,depth+Math.abs(offset.dot(basis.right))*padding/tanHorizontal,depth+Math.abs(offset.dot(basis.up))*padding/tanVertical);}
  const diagonal=geometry.bounds.getSize(new T.Vector3()).length();distance+=Math.max(10,diagonal*.025);
  const position=target.clone().addScaledVector(dir,distance),depths=geometry.points.map(point=>distance-point.clone().sub(target).dot(dir)),closest=Math.min(...depths),farthest=Math.max(...depths);
  return {position:position.toArray(),target:target.toArray(),up:[0,1,0],near:Math.max(.1,Math.min(10,closest*.1)),far:Math.max(2000,farthest+diagonal*.5),fov,zoom,aspect,azimuth,elevation,distance};
}

export function recommendComposition(T,geometry,{aspect=1.8,fov=38,zoom=1}={}){
  const azimuths=[-30,30,-45,45,-15,15,-60,60,-120,120,-150,150,0,180],elevations=[28,35,42],ranked=[];
  for(const azimuth of azimuths)for(const elevation of elevations){
    const basis=orientation(T,azimuth,elevation),rects=geometry.objects.map(object=>screenRect(object.points,geometry.center,basis.right,basis.up));
    const totalArea=rects.reduce((sum,rect)=>sum+Math.max(1,rect.width*rect.height),0);let overlap=0;
    for(let a=0;a<rects.length;a++)for(let b=a+1;b<rects.length;b++){const x=Math.min(rects[a].right,rects[b].right)-Math.max(rects[a].left,rects[b].left),y=Math.min(rects[a].top,rects[b].top)-Math.max(rects[a].bottom,rects[b].bottom);if(x>0&&y>0)overlap+=x*y;}
    let worldLength=0,screenLength=0;for(const path of geometry.paths)for(let i=1;i<path.points.length;i++){const difference=path.points[i].clone().sub(path.points[i-1]);worldLength+=difference.length();screenLength+=Math.hypot(difference.dot(basis.right),difference.dot(basis.up));}
    const box=screenRect(geometry.points,geometry.center,basis.right,basis.up),targetAspect=Math.max(1.4,Math.min(2.4,aspect)),shapePenalty=Math.abs(Math.log(Math.max(.01,box.width/Math.max(1,box.height))/targetAspect));
    const overlapRatio=overlap/Math.max(1,totalArea),pathRatio=worldLength?screenLength/worldLength:1;
    // Prefer readable paths, less overlap and a balanced horizontal figure.
    // A small front-facing bias avoids needless back views when scores tie.
    const score=overlapRatio*2.4+shapePenalty*.32+(1-pathRatio)*.65+Math.max(0,-Math.cos(azimuth*Math.PI/180))*.12;
    ranked.push({azimuth,elevation,score,overlapRatio,pathRatio});
  }
  ranked.sort((a,b)=>a.score-b.score);const best=ranked[0];
  return {...fitComposition(T,geometry,{...best,aspect,fov,zoom}),score:best.score,overlapRatio:best.overlapRatio,pathRatio:best.pathRatio,candidates:ranked.length,objects:geometry.objects.length,paths:geometry.paths.length};
}

export function cameraSnapshot(camera,controls){return {position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray(),near:camera.near,far:camera.far,fov:camera.fov,zoom:camera.zoom,aspect:camera.aspect};}
function applyCamera(T,camera,controls,view){
  const damping=controls.enableDamping,autoRotate=controls.autoRotate;controls.enableDamping=false;controls.autoRotate=false;
  try{
    controls.update?.(); // Drain pending pan/rotation before writing the new view.
    camera.position.fromArray(view.position);controls.target.fromArray(view.target);camera.up.fromArray(view.up||[0,1,0]);
    for(const key of ['near','far','fov','zoom','aspect'])if(Number.isFinite(view[key]))camera[key]=view[key];
    const distance=camera.position.distanceTo(controls.target);
    if(Number.isFinite(controls.maxDistance))controls.maxDistance=Math.max(controls.maxDistance,distance*1.1);
    if(Number.isFinite(controls.minDistance))controls.minDistance=Math.min(controls.minDistance,Math.max(.1,distance*.5));
    camera.updateProjectionMatrix();camera.lookAt(controls.target);camera.updateMatrixWorld(true);controls.update?.();camera.updateMatrixWorld(true);
  }finally{controls.enableDamping=damping;controls.autoRotate=autoRotate;}
}

export function installCompositionTools(api){
  const {T,camera,controls}=api;
  const dialog=document.createElement('dialog');dialog.id='compositionDialog';dialog.className='composition-dialog';dialog.setAttribute('aria-label','展示构图');
  dialog.innerHTML=`<header class="composition-head"><div><h2>展示构图</h2><p data-composition="summary">为当前光路选择清晰的展示角度</p></div><button type="button" data-composition="close">返回画布</button></header>
  <div class="composition-body"><button type="button" class="composition-recommend primary" data-composition="recommend">推荐主视角</button><div class="composition-views" role="group" aria-label="视角"><button type="button" data-composition="main">主视</button><button type="button" data-composition="top">俯视</button><button type="button" data-composition="side">侧视</button></div><div class="composition-angles"><label>方位角 / °<input type="number" data-composition="azimuth" min="-180" max="180" step="1" value="45"></label><label>俯角 / °<input type="number" data-composition="elevation" min="3" max="89.9" step="0.1" value="35.264"></label><button type="button" data-composition="apply">应用角度</button></div><p class="composition-note">推荐按包围盒遮挡与画幅估算，不改变器件位置。</p><div class="composition-actions"><button type="button" data-composition="save">保存三个视角</button><button type="button" data-composition="center">整组居中摆放</button></div><p class="composition-note">居中仅整体平移，保持器件间距、方向和连线。</p></div><footer><p data-composition="status" role="status" aria-live="polite">修改可用 Ctrl+Z 撤销。</p></footer>`;
  document.body.append(dialog);
  const launcher=document.createElement('button');launcher.id='openComposition';launcher.type='button';launcher.textContent='展示构图';launcher.title='推荐视角、保存构图与整组居中';(document.querySelector('.pro-actions')||document.querySelector('.workspace-tabs')||document.body).append(launcher);
  const q=name=>dialog.querySelector(`[data-composition="${name}"]`);
  let busy=false,lastRecommendation=null;
  const currentGeometry=()=>compositionGeometry({T,state:api.getState(),roots:api.getRoots(),cableCurve:api.cableCurve});
  function cameraOptions(){const size=api.getViewportSize?.(),aspect=size?.width>0&&size?.height>0?size.width/size.height:camera.aspect;return {aspect,fov:camera.fov,zoom:camera.zoom};}
  const say=message=>{q('status').textContent=message;api.toast?.(message);};
  function refresh(){const state=api.getState(),visible=state.items.filter(item=>!item.hidden).length;q('summary').textContent=`${visible} 个可见器件 · ${(state.views||[]).length}/12 个保存视角`;}
  function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const element of dialog.querySelectorAll('button,input'))element.disabled=value;}
  function applyView(view,message){
    const state=api.getState(),before=cameraSnapshot(camera,controls),oldPresentation=clone(state.presentation),oldCamera=clone(state.camera),oldLimits={minDistance:controls.minDistance,maxDistance:controls.maxDistance};
    try{api.checkpoint();applyCamera(T,camera,controls,view);state.presentation={...state.presentation,view:'editor'};api.persist();api.refresh?.();q('azimuth').value=String(Math.round(view.azimuth*10)/10);q('elevation').value=String(Math.round(view.elevation*10)/10);say(message);return view;}
    catch(error){applyCamera(T,camera,controls,before);Object.assign(controls,oldLimits);if(oldPresentation===undefined)delete state.presentation;else state.presentation=oldPresentation;if(oldCamera===undefined)delete state.camera;else state.camera=oldCamera;try{api.persist();api.refresh?.();}catch{}throw error;}
  }
  function recommend(){if(busy)throw new Error('请等待当前操作完成');lastRecommendation=recommendComposition(T,currentGeometry(),cameraOptions());return applyView(lastRecommendation,`已设置推荐主视角：方位 ${lastRecommendation.azimuth}°，俯角 ${lastRecommendation.elevation}°。`);}
  function applyPreset(preset='main'){
    if(busy)throw new Error('请等待当前操作完成');if(preset==='main')return recommend();
    const geometry=currentGeometry(),angles=preset==='top'?{azimuth:0,elevation:89.9}:preset==='side'?{azimuth:90,elevation:12}:preset;
    if(!angles||typeof angles!=='object')throw new Error('未知展示视角');const view=fitComposition(T,geometry,{...cameraOptions(),azimuth:angles.azimuth,elevation:angles.elevation});return applyView(view,'已调整展示角度，器件位置保持原样。');
  }
  function saveViews(){
    if(busy)throw new Error('请等待当前操作完成');const state=api.getState();if((state.views||[]).length>9)throw new Error('保存三视角需要 3 个空位；现有视角已保留，请先整理视角列表。');
    const geometry=currentGeometry(),options=cameraOptions(),main=recommendComposition(T,geometry,options),views=[main,fitComposition(T,geometry,{...options,azimuth:0,elevation:89.9}),fitComposition(T,geometry,{...options,azimuth:90,elevation:12})],names=['展示主视角','展示俯视角','展示侧视角'];
    const used=new Set((state.views||[]).map(view=>view.id));let serial=0;const nextId=()=>{let id;do{id='composition_'+Date.now().toString(36)+'_'+(++serial);}while(used.has(id));used.add(id);return id;};
    const before=clone(state.views),oldPresentation=clone(state.presentation);
    try{api.checkpoint();state.views=[...(state.views||[]),...views.map((view,index)=>({...view,id:nextId(),name:names[index]}))];state.presentation={...state.presentation,view:'editor'};api.persist();api.refresh?.();refresh();say('已保存主视、俯视和侧视；原有视角保留。');return state.views.slice(-3);}
    catch(error){if(before===undefined)delete state.views;else state.views=before;if(oldPresentation===undefined)delete state.presentation;else state.presentation=oldPresentation;try{api.persist();api.refresh?.();}catch{}throw error;}
  }
  async function center(){
    if(busy)throw new Error('请等待当前操作完成');const state=api.getState();if(state.items.some(item=>item.locked))throw new Error('场景中有锁定器件，请先解锁后整体居中。');
    const geometry=currentGeometry(),dx=-geometry.center.x,dz=-geometry.center.z,hidden=state.items.filter(item=>item.hidden).length;
    if(Math.abs(dx)<.001&&Math.abs(dz)<.001){say('当前光路已经居中');return {dx:0,dz:0,hidden,changed:false};}
    for(const item of state.items)if(Math.abs(item.x+dx)>4000||Math.abs(item.z+dz)>4000)throw new Error('居中后有器件超出 ±4000 mm，场景未修改。');
    for(const edge of state.connections)for(const point of edge.waypoints||[])if(Math.abs(point.x+dx)>=6000||Math.abs(point.z+dz)>=6000)throw new Error('居中后有手动走线点超出范围，场景未修改。');
    const coordinates=state.items.map(item=>({item,x:item.x,z:item.z})),routes=state.connections.filter(edge=>edge.waypoints).map(edge=>({edge,waypoints:clone(edge.waypoints)})),before=cameraSnapshot(camera,controls),oldCamera=clone(state.camera),oldPresentation=clone(state.presentation);
    const view={...before,position:[before.position[0]+dx,before.position[1],before.position[2]+dz],target:[before.target[0]+dx,before.target[1],before.target[2]+dz]};
    setBusy(true);
    try{api.checkpoint();for(const item of state.items){item.x+=dx;item.z+=dz;}for(const edge of state.connections)for(const point of edge.waypoints||[]){point.x+=dx;point.z+=dz;}await api.rebuild();applyCamera(T,camera,controls,view);state.presentation={...state.presentation,view:'editor'};api.persist();api.refresh?.();say(`已整体居中${hidden?`，${hidden} 个隐藏器件同步平移`:''}；相对位置与连线保留。`);return {dx,dz,hidden,changed:true};}
    catch(error){for(const record of coordinates){record.item.x=record.x;record.item.z=record.z;}for(const record of routes)record.edge.waypoints=record.waypoints;if(oldPresentation===undefined)delete state.presentation;else state.presentation=oldPresentation;if(oldCamera===undefined)delete state.camera;else state.camera=oldCamera;try{await api.rebuild();}catch{}applyCamera(T,camera,controls,before);try{api.persist();api.refresh?.();}catch{}throw error;}
    finally{setBusy(false);refresh();}
  }
  async function run(operation){try{return await operation();}catch(error){say('未完成：'+error.message);return null;}}
  function open(){refresh();if(!dialog.open)dialog.showModal();}function close(){if(!busy)dialog.close();}
  launcher.onclick=open;q('close').onclick=close;q('recommend').onclick=()=>run(recommend);for(const preset of ['main','top','side'])q(preset).onclick=()=>run(()=>applyPreset(preset));q('apply').onclick=()=>run(()=>applyPreset({azimuth:Number(q('azimuth').value),elevation:Number(q('elevation').value)}));q('save').onclick=()=>run(saveViews);q('center').onclick=()=>run(center);
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('keydown',event=>event.stopPropagation());refresh();
  return {open,close,recommend,applyPreset,center,saveViews,refresh,getRecommendation:()=>lastRecommendation&&clone(lastRecommendation),isBusy:()=>busy,destroy:()=>{launcher.remove();dialog.remove();}};
}
