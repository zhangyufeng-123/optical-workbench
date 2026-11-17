import {T,CATALOG,categories,getDef,buildModel,buildBoard} from './models.js';
import {createJournalStudio} from './publication.js';
import {installEnhancements} from './enhancements.js';
import {installPaletteStudio} from './palette-studio.js';
import {installDrawingTools} from './drawing-tools.js';
import {installPrecisionTools,planTransform} from './precision-tools.js';
import {installSceneTools,normalizeSelectionSets} from './scene-tools.js';
import {installCommandPalette} from './command-palette.js';
import {installWorkbenchShell} from './workbench-shell.js';
import {normalizeSurfaceQuality} from './surface-quality.js';
import {installQualityStudio} from './quality-studio.js';
import {installCompositionTools} from './composition-tools.js';
import {normalizeTypography,fontFamily,canvasFont} from './typography.js';
import {installTypographyStudio} from './typography-studio.js';
import {normalizeRenderLabelEdits} from './render-label-state.js';
import {embeddedOpticalPorts} from './imported-ports.js';
import {searchDevices} from './device-search.js';
import {expandAssemblies,movableAssemblyItems,remapAssembly,validateAssemblyItem,transformAssembly,buildPostSupport} from './assembly-state.js';
import {installAssemblyTools} from './assembly-tools.js';
import {planAutoLayout} from './auto-layout.js';
import {planConnectionLogic} from './connection-logic.js';
import {installAutoLayoutTools} from './auto-layout-tools.js';
import {installAIStudio} from './ai-studio.js';
import {installNatureReferences} from './nature-references.js';
import natureLibrary from '../nature-references/library.json';
import natureRenderPresets from '../nature-references/render-presets.json';
import presentationReference from '../示例工程/V5.1_推荐构图_五种视角.json';
import {buildBeam} from './beams.js';
import {createFiberCurve,createFiberPlug,supportedFiberConnectorPair} from './fiber-routing.js';
import {captureScene} from './capture.js';
import {createRenderStudio} from './render-studio.js';
import {OrbitControls} from '../vendor/package/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from '../vendor/package/examples/jsm/loaders/GLTFLoader.js';
import {GLTFExporter} from '../vendor/package/examples/jsm/exporters/GLTFExporter.js';
import {RoomEnvironment} from '../vendor/package/examples/jsm/environments/RoomEnvironment.js';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=x=>{if(x?.format==='fiber-workbench'){const {assets,...rest}=x;return {...structuredClone(rest),assets:{...assets}};}return structuredClone(x)};let serial=0;const uid=p=>p+'_'+Date.now().toString(36)+'_'+(++serial);
const fiberColors={SM:'#d28b25',PM:'#247cb4',MM:'#92558f'};
let state,selected=null,selectedEdge=null,pending=null,mode='move',history=[],future=[],loading=false,buildId=0;
let extras,journal,renderStudio,paletteStudio,drawingTools,precisionTools,sceneTools,commandPalette,workbenchShell,qualityStudio,compositionTools,typographyStudio,assemblyTools,autoLayoutTools,aiStudio,natureReferences;const selection=new Set();
let autoLayoutBusy=false;
let workbenchRefreshPending=false;function scheduleWorkbenchRefresh(){if(workbenchRefreshPending)return;workbenchRefreshPending=true;queueMicrotask(()=>{workbenchRefreshPending=false;workbenchShell?.refresh();sceneTools?.refresh();commandPalette?.refresh();typographyStudio?.refresh();assemblyTools?.refresh();});}
const roots=new Map(),portTargets=[],labelEls=new Map(),assetCache=new Map();
let board,selectionBox,routingObstacles=[];const viewport=$('viewport'),scene=new T.Scene(),modelGroup=new T.Group(),fiberGroup=new T.Group(),helperGroup=new T.Group();
scene.background=new T.Color('#e8ecef');scene.add(modelGroup,fiberGroup,helperGroup);
const renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.outputColorSpace=T.SRGBColorSpace;viewport.prepend(renderer.domElement);
const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;
scene.environmentIntensity=.65;scene.add(new T.HemisphereLight(0xeef5ff,0x75818b,.8));const sun=new T.DirectionalLight(0xfffaf1,2.6);sun.position.set(-600,1400,800);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-1450,right:1450,top:1300,bottom:-1300,near:10,far:4000});sun.shadow.normalBias=.45;scene.add(sun);const fill=new T.DirectionalLight(0xdde9f5,.55);fill.position.set(1000,600,-700);scene.add(fill);
const floor=new T.Mesh(new T.PlaneGeometry(12000,12000),new T.MeshStandardMaterial({color:0xe8ecef,roughness:.85,metalness:0}));floor.rotation.x=-Math.PI/2;floor.position.y=-66;floor.receiveShadow=true;scene.add(floor);
const camera=new T.PerspectiveCamera(38,1,2,18000);camera.position.set(900,1250,1450);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.target.set(0,20,0);controls.minDistance=140;controls.maxDistance=8500;controls.maxPolarAngle=Math.PI*.485;
const raycaster=new T.Raycaster(),pointer=new T.Vector2(),groundPlane=new T.Plane(new T.Vector3(0,1,0),0),point=new T.Vector3();
function resize(){const w=viewport.clientWidth,h=viewport.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(viewport);
function toast(s){$('toast').textContent=s;$('toast').style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').style.display='none',3300);$('status').textContent=s;}
function definition(type){return getDef(type)||state?.custom?.find(d=>d.id===type);}
function item(id){return state.items.find(x=>x.id===id);}
function itemPorts(it){return it.ports||definition(it.type).ports;}
function snapshotCamera(){return {position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray(),near:camera.near,far:camera.far,fov:camera.fov,zoom:camera.zoom,aspect:camera.aspect};}
function checkpoint(){if(loading)return;state.camera=snapshotCamera();history.push(clone(state));if(history.length>40)history.shift();future=[];updateHistory();}
function updateHistory(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function syncTextVisibility(){const typography=normalizeTypography(state?.presentation?.typography);for(const element of labelEls.values()){element.style.fontFamily=fontFamily(typography);element.style.fontSize=typography.screenPx+'px';element.style.fontWeight=typography.bold?'700':'400';}const visible=state?.presentation?.showLabels===true,markings=state?.presentation?.showMarkings===true;$('showLabels').checked=visible;$('showMarkings').checked=markings;if(renderStudio&&syncTextVisibility.renderLabels!==visible){renderStudio.setLabels(visible);syncTextVisibility.renderLabels=visible;}for(const root of roots.values())if(!root.userData.imported)root.traverse(object=>{if(object.userData.bodyMarking===true||object.name.startsWith('panel_label_'))object.visible=markings;});}
function setTextVisibility(key,visible){if(!['showLabels','showMarkings'].includes(key)||typeof visible!=='boolean')throw new Error('文字显示设置无效');if(state.presentation?.[key]===visible){syncTextVisibility();return;}checkpoint();state.presentation={...state.presentation,[key]:visible};persist();toast((visible?'已显示':'已隐藏')+(key==='showLabels'?'器件名称':'机身文字'));}
function saveRenderLabelEdits(value,{undo=true}={}){
  const edits=normalizeRenderLabelEdits(value);
  if(JSON.stringify(state.presentation?.renderLabels)===JSON.stringify(edits))return;
  if(undo)checkpoint();
  state.presentation={...state.presentation,renderLabels:edits};persist();
}
function persist(){if(!state)return;syncTextVisibility();state.camera=snapshotCamera();try{localStorage.setItem('fiberWorkbench.v2',JSON.stringify(state));$('autosave').textContent='已在本机暂存';}catch(e){$('autosave').textContent='请下载工程备份';}updateHistory();scheduleWorkbenchRefresh();}
function blank(){return {format:'fiber-workbench',version:2,units:'mm',title:'全光纤波片测试',board:{width:1600,depth:800},items:[],connections:[],assets:{},custom:[]};}
function makeItem(type,x,z,label,providedDefinition){const d=providedDefinition||definition(type);return {id:uid('obj'),type,label:label||d.name,x,y:0,z,rotation:0,scale:1,color:d.color,note:d.note,locked:false,hidden:false,showLabel:true};}
function preset(name){if(name==='presentation_reference')return clone(presentationReference);const p=blank();state=p;const add=(type,x,z,label)=>{const v=makeItem(type,x,z,label);p.items.push(v);return v;};const edge=(a,ap,b,bp,fiber='SM',side=1,slack=80)=>p.connections.push({id:uid('fiber'),a:{item:a.id,port:ap},b:{item:b.id,port:bp},fiber,color:fiberColors[fiber],side,slack,radius:1.15});
const beam=(a,ap,b,bp,color='#ed283c')=>p.connections.push({id:uid('beam'),kind:'beam',a:{item:a.id,port:ap},b:{item:b.id,port:bp},color,radius:1.8,glow:.65});
if(name==='laser_bench'){p.title='空间激光 · 折叠光路';p.board={width:1850,depth:1050};const a=add('fs_cwlaser',-620,-200,'CW laser'),b=add('fs_hwp',-230,-200,'HWP'),c=add('fs_turnmirror',160,-200,'M1'),d=add('fs_lens_convex',160,40,'Lens'),e=add('fs_turnmirror',160,290,'M2'),f=add('fs_cmos',-360,290,'CMOS');d.rotation=e.rotation=-90;f.rotation=180;beam(a,'out',b,'in');beam(b,'out',c,'in');beam(c,'out',d,'in');beam(d,'out',e,'in');beam(e,'out',f,'in');}
if(name==='beam_split'){p.title='空间分束 · 双路探测';p.board={width:1900,depth:1050};const a=add('fs_fslaser',-640,-200,'Pulsed laser'),b=add('fs_hwp',-300,-200,'HWP'),c=add('fs_pbs',-80,-200,'PBS'),d=add('fs_lens_convex',240,-200,'Lens'),e=add('fs_cmos',570,-200,'CMOS 1'),f=add('fs_qwp',-80,40,'QWP'),g=add('fs_ccd',-80,310,'CCD');f.rotation=g.rotation=-90;beam(a,'out',b,'in');beam(b,'out',c,'in');beam(c,'out',d,'in');beam(d,'out',e,'in');beam(c,'ref',f,'in','#25ae85');beam(f,'out',g,'in','#25ae85');}
if(name==='hybrid'){p.title='光纤—空间光 · 混合链路';p.board={width:1900,depth:850};const a=add('laser',-680,0,'Fiber laser'),b=add('isolator',-390,0,'Isolator'),c=add('fs_fiber_collimator',-90,0,'Collimator'),d=add('fs_lens_convex',200,0,'Lens'),e=add('fs_cmos',550,0,'CMOS');edge(a,'out',b,'in','PM');edge(b,'out',c,'in');beam(c,'out',d,'in');beam(d,'out',e,'in');}
if(name==='waveplate'){p.board={width:2400,depth:1000};let a=add('laser',-900,-20),b=add('polarizer',-500,35),c=add('paddle',-50,0),d=add('qwp',420,25),e=add('polarimeter',880,-20);edge(a,'out',b,'in','PM',1,85);edge(b,'out',c,'in','SM',1,60);edge(c,'out',d,'in','SM',1,65);edge(d,'out',e,'in','SM',1,100);}
if(name==='split'){p.title='分光与功率监测';let a=add('laser',-580,0),b=add('isolator',-305,30),c=add('splitter',-70,0),d=add('sample',230,-155),e=add('polarimeter',560,-150),f=add('powermeter',300,190);edge(a,'out',b,'in','SM',1,100);edge(b,'out',c,'in','SM',1,75);edge(c,'a',d,'in','SM',-1,80);edge(d,'out',e,'in','SM',1,80);edge(c,'b',f,'in','SM',1,100);}
if(name==='catalog'){p.title='光纤器件陈列台';const rows=Math.ceil(CATALOG.length/8);p.board={width:2800,depth:Math.max(1450,rows*245+130)};CATALOG.forEach((d,i)=>add(d.id,(-3.5+i%8)*325,(-(rows-1)/2+Math.floor(i/8))*245));}
if(name==='interferometer'){p.title='全光纤双臂干涉布局';p.board={width:1800,depth:950};const a=add('laser',-700,0),b=add('coupler22',-400,0),c=add('sample',-60,-150),d=add('spool',-60,180),e=add('coupler22',300,0),f=add('photodiode',650,-90),g=add('powermeter',650,180);edge(a,'out',b,'a');edge(b,'c',c,'in','SM',-1,70);edge(b,'d',d,'a','SM',1,70);edge(c,'out',e,'a','SM',-1,60);edge(d,'b',e,'b','SM',1,60);edge(e,'c',f,'in');edge(e,'d',g,'in');}
if(name==='empty'){p.title='未命名光纤实验台';}return p;}
function disposeGeometry(g){const mats=new Set(),textures=new Set();g.traverse(o=>{if(o.geometry)o.geometry.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(!m||m.userData.shared)continue;mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});textures.forEach(t=>t.dispose());mats.forEach(m=>m.dispose());}
async function prepareImportedAsset(d,assets){const raw=atob(assets[d.id]);if(raw.length>30e6)throw new Error('导入模型超过30MB');const buf=Uint8Array.from(raw,c=>c.charCodeAt(0));const gltf=await new GLTFLoader().parseAsync(buf.buffer,'');const model=gltf.scene;const b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3());if(!Number.isFinite(size.length())||size.length()===0)throw new Error('GLB没有有效几何');model.scale.multiplyScalar(model.userData.opticalWorkbenchUnits==='m'?1000:model.userData.opticalWorkbenchUnits==='mm'?1:160/Math.max(size.x,size.y,size.z));model.updateMatrixWorld(true);const bb=new T.Box3().setFromObject(model),center=bb.getCenter(new T.Vector3());model.position.sub(new T.Vector3(center.x,bb.min.y,center.z));const wrapper=new T.Group();wrapper.add(model);wrapper.updateMatrixWorld(true);wrapper.userData.importedPorts=embeddedOpticalPorts(T,model);wrapper.traverse(o=>{if(o.material){for(const m of (Array.isArray(o.material)?o.material:[o.material]))m.userData.shared=true;}});return wrapper;}
async function importedModel(d){let cached=assetCache.get(d.id);if(!cached){cached=await prepareImportedAsset(d,state.assets);assetCache.set(d.id,cached);}return cached.clone(true);}
async function rebuild(fit=false){const token=++buildId;loading=true;for(const r of modelGroup.children){if(!r.userData.imported)disposeGeometry(r);else{const support=r.getObjectByName('device_post_support');if(support)disposeGeometry(support);}}modelGroup.clear();helperGroup.clear();disposeGeometry(fiberGroup);fiberGroup.clear();roots.clear();portTargets.length=0;labelEls.clear();$('labels').innerHTML='';if(board){scene.remove(board);disposeGeometry(board);}board=buildBoard(state.board.width,state.board.depth,state.presentation?.quality);scene.add(board);
for(const it of state.items){const d=definition(it.type);const root=new T.Group();root.name=it.label;root.userData.itemId=it.id;root.userData.imported=d.shape==='import';let m=d.shape==='import'?await importedModel(d):buildModel(d,{...it,surfaceQuality:state.presentation?.quality});if(token!==buildId)return;root.add(m);if(it.support)buildPostSupport(T,root,it.support);root.position.set(it.x,it.y||0,it.z);root.visible=!it.hidden;root.rotation.y=it.rotation*Math.PI/180;root.scale.setScalar(it.scale);root.traverse(o=>{o.userData.itemId=it.id;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});modelGroup.add(root);roots.set(it.id,root);
const label=document.createElement('div');label.className='obj-label';label.textContent=it.label;$('labels').append(label);labelEls.set(it.id,label);
for(const p of itemPorts(it)){const dot=new T.Mesh(new T.SphereGeometry(5,12,8),new T.MeshBasicMaterial({color:'#317fa5',transparent:true,opacity:.85,depthTest:true}));dot.position.fromArray(p.pos).addScaledVector(new T.Vector3(...p.dir),4);dot.userData={itemId:it.id,portId:p.id,isPort:true};root.add(dot);portTargets.push(dot);}
}modelGroup.updateMatrixWorld(true);rebuildFibers();loading=false;applyEditorQuality();refreshAll();if(fit)fitView();persist();$('loading').style.display='none';}
function applyEditorQuality(){const quality=normalizeSurfaceQuality(state.presentation?.quality),look=quality.preset==='technical'?{environment:.65,key:2.6,fill:.55,shadow:1.5}:quality.preset==='cinematic'?{environment:.38,key:2.35,fill:.38,shadow:4}:{environment:.50,key:2.2,fill:.55,shadow:3};renderer.toneMappingExposure=quality.exposure;scene.environmentIntensity=look.environment;sun.intensity=look.key;fill.intensity=look.fill;sun.shadow.radius=look.shadow;}
function portWorld(end){const it=item(end.item),p=it&&itemPorts(it).find(x=>x.id===end.port),r=roots.get(end.item);if(!p||!r)return null;const pos=new T.Vector3(...p.pos).applyMatrix4(r.matrixWorld);const dir=new T.Vector3(...p.dir).transformDirection(r.matrixWorld);return {pos,dir,p,it};}
function collectRoutingObstacles(){
  const obstacles=[];
  for(const it of state.items){
    const root=roots.get(it.id);if(!root?.visible)continue;
    const model=root.children[0];let source=model,definitionBounds=null;
    model.traverse(object=>{
      const bounds=object.userData?.routingBounds;
      if(!definitionBounds&&bounds&&[bounds.min,bounds.max].every(point=>Array.isArray(point)&&point.length===3&&point.every(Number.isFinite))){source=object;definitionBounds=bounds;}
    });
    const size=definition(it.type).product?.bodySize||definition(it.type).size;
    let box;
    if(definitionBounds){
      box=new T.Box3(new T.Vector3(...definitionBounds.min),new T.Vector3(...definitionBounds.max)).applyMatrix4(source.matrixWorld);
    }else if(Array.isArray(size)&&size.length===3&&size.every(value=>Number.isFinite(value)&&value>0)){
      box=new T.Box3(new T.Vector3(-size[0]/2,0,-size[2]/2),new T.Vector3(size[0]/2,size[1],size[2]/2)).applyMatrix4(source.matrixWorld);
    }else box=new T.Box3().setFromObject(model);
    if(!box.isEmpty())obstacles.push({id:it.id,box});
  }
  return obstacles;
}
function cableCurve(edge){
  return createFiberCurve(T,edge,portWorld(edge.a),portWorld(edge.b),{tableY:0,obstacles:routingObstacles});
}
function plug(end,edge){
  const object=createFiberPlug(T,portWorld(end),edge);
  if(object){object.userData.endpoint={...end};fiberGroup.add(object);}
}
function rebuildFibers(){
  disposeGeometry(fiberGroup);fiberGroup.clear();modelGroup.updateMatrixWorld(true);routingObstacles=collectRoutingObstacles();
  for(const edge of state.connections){
    if(item(edge.a.item)?.hidden||item(edge.b.item)?.hidden)continue;
    const curve=cableCurve(edge);if(!curve)continue;
    if(edge.kind==='beam'){fiberGroup.add(buildBeam(T,edge,curve,state.presentation?.quality));continue;}
    const segments=Math.min(260,Math.max(90,curve.curves.length*18));
    const material=new T.MeshStandardMaterial({color:edge.color||fiberColors[edge.fiber],roughness:.58,metalness:.02});material.userData.connectionColor=true;
    const mesh=new T.Mesh(new T.TubeGeometry(curve,segments,edge.radius||1.15,12,false),material);
    mesh.name='fiber_'+edge.id;mesh.userData={edgeId:edge.id,isCable:true,routing:clone(curve.userData?.routing||{})};mesh.castShadow=true;fiberGroup.add(mesh);
    plug(edge.a,edge);plug(edge.b,edge);
  }
  updatePortAppearance();renderConnections();
}

function busy(end){return state.connections.some(e=>[e.a,e.b].some(p=>p.item===end.item&&p.port===end.port));}
function updatePortAppearance(){for(const o of portTargets){const b=busy({item:o.userData.itemId,port:o.userData.portId});const p=pending?.item===o.userData.itemId&&pending?.port===o.userData.portId;const show=($('showPorts').checked||mode==='connect')&&!item(o.userData.itemId)?.hidden;o.visible=show;o.material.color.set(p?'#e6a627':b?'#91a09d':'#267eac');o.scale.setScalar(mode==='connect'?1.5:1);}}
function connectionError(a,b){if(a.item===b.item)return '请选择另一个器件的端口';if(busy(a)||busy(b))return '端口已经占用，请先删除原连接';const pa=portWorld(a)?.p,pb=portWorld(b)?.p;if(!pa||!pb)return '端口不存在';if(!['optical','free-space'].includes(pa.kind)||pa.kind!==pb.kind)return '光纤与空间光端口不能直接相连，请使用光纤准直器转换';if(pa.role===pb.role&&['in','out'].includes(pa.role))return '输入端不能连接输入端，输出端不能连接输出端';if(!supportedFiberConnectorPair(pa,pb))return '两端接口不同，请使用匹配接口或转接器';return null;}
function clickPort(end){if(mode!=='connect')setMode('connect');if(busy(end)){toast('这个端口已连接；可在连接列表删除连线。');return;}if(!pending){pending=end;toast('已选起点，再选择另一器件的端口');select(end.item,true);updatePortAppearance();renderProperty();return;}if(pending.item===end.item&&pending.port===end.port){pending=null;updatePortAppearance();renderProperty();return;}const error=connectionError(pending,end);if(error){toast(error);return;}const isBeam=portWorld(pending).p.kind==='free-space',choice=$('fiberType').value;if(choice==='beam'&&!isBeam){toast('激光束需要两个空间光端口；光纤端口请选 SM / PM / MM');return;}checkpoint();const fiber=fiberColors[choice]?choice:'SM';state.connections.push(isBeam?{id:uid('beam'),kind:'beam',a:pending,b:end,color:'#ed283c',radius:1.8,glow:.65}:{id:uid('fiber'),a:pending,b:end,fiber,color:fiberColors[fiber],side:1,slack:85,radius:1.15});pending=null;rebuildFibers();persist();renderProperty();toast(isBeam?'已连接直线激光束；可在连接属性修改颜色、直径与光晕。':'已连接；移动器件时光纤会自动跟随。');}
function setMode(value){mode=value;pending=null;$('move').classList.toggle('active',mode==='move');$('connect').classList.toggle('active',mode==='connect');renderer.domElement.style.cursor=mode==='connect'?'crosshair':'default';$('cancelConnection').hidden=mode!=='connect';updatePortAppearance();renderProperty();}
function select(id,keepPending=mode==='connect',additive=false){
const members=id?expandAssemblies(state,[id]):[];
const remove=additive&&selection.has(id);if(!additive)selection.clear();
for(const member of members){if(remove)selection.delete(member);else selection.add(member);}
selected=selection.has(id)?id:([...selection].at(-1)||null);selectedEdge=null;
if(!keepPending)pending=null;refreshSelection();renderProperty();renderSceneList();renderConnections();
document.body.classList.toggle('show-inspector',!!selected);
}
function selectMany(ids,keepPending=false){
selection.clear();for(const id of expandAssemblies(state,ids||[]))selection.add(id);
selected=[...selection].at(-1)||null;selectedEdge=null;if(!keepPending)pending=null;
refreshSelection();renderProperty();renderSceneList();renderConnections();document.body.classList.toggle('show-inspector',!!selected);return [...selection];
}
function refreshSelection(){for(const id of [...selection])if(!item(id))selection.delete(id);if(selected&&!selection.has(selected))selection.add(selected);disposeGeometry(helperGroup);helperGroup.clear();selectionBox=null;const box=new T.Box3();for(const id of selection){const r=roots.get(id);if(r?.visible)box.union(new T.Box3().setFromObject(r));}if(!box.isEmpty()){selectionBox=new T.Box3Helper(box,0x377b9c);selectionBox.material.transparent=true;selectionBox.material.opacity=.65;helperGroup.add(selectionBox);}labelEls.forEach((el,id)=>el.classList.toggle('selected',selection.has(id)));updatePortAppearance();}
function renderSceneList(){$('sceneList').innerHTML='<h3>场景器件 · '+state.items.length+'</h3>'+state.items.map(it=>`<div class="scene-row"><button data-item="${esc(it.id)}" class="${selection.has(it.id)?'active':''}" title="Shift + 点击可多选">${it.locked?'▣ ':''}${it.hidden?'◌ ':''}${esc(it.label)}</button><button class="scene-icon" data-visible="${esc(it.id)}" title="显示 / 隐藏">${it.hidden?'○':'●'}</button><button class="scene-icon" data-lock="${esc(it.id)}" title="锁定 / 解锁">${it.locked?'▣':'□'}</button></div>`).join('');$('sceneList').querySelectorAll('[data-item]').forEach(b=>b.onclick=e=>select(b.dataset.item,mode==='connect',e.shiftKey||e.ctrlKey));$('sceneList').querySelectorAll('[data-visible]').forEach(b=>b.onclick=async()=>{checkpoint();const it=item(b.dataset.visible);it.hidden=!it.hidden;await rebuild();});$('sceneList').querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>{checkpoint();const it=item(b.dataset.lock);it.locked=!it.locked;renderProperty();renderSceneList();persist();});}
function endpointText(end){const it=item(end.item);return `${it?.label||'?'} / ${it&&itemPorts(it).find(p=>p.id===end.port)?.label||'?'}`;}
function renderConnections(){$('connectionCount').textContent=state.connections.length;const html=state.connections.map((e,i)=>`<div class="connection-row ${e.id===selectedEdge?'selected':''}" data-edge="${e.id}"><span class="swatch" style="background:${e.color}"></span><span>${esc(endpointText(e.a))} ⇄ ${esc(endpointText(e.b))}</span><span>${e.kind==='beam'?'激光':e.fiber}</span><span>${e.kind==='beam'?'光段':'布线'} ${Math.round(cableCurve(e)?.getLength()||0)} mm</span><button data-remove="${e.id}" aria-label="删除第 ${i+1} 条连接">×</button></div>`).join('');$('connections').innerHTML=html||'<div class="empty">切换“连接光路”，依次点击两个器件的端口。</div>';$('connections').querySelectorAll('[data-edge]').forEach(b=>b.onclick=()=>{selectedEdge=b.dataset.edge;selected=null;selection.clear();refreshSelection();renderProperty();renderConnections();document.body.classList.add('show-inspector');});$('connections').querySelectorAll('[data-remove]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteConnection(b.dataset.remove);});}
function refreshAll(){$('sceneTitle').textContent=state.title;$('boardW').value=state.board.width;$('boardD').value=state.board.depth;refreshSelection();renderProperty();renderSceneList();renderConnections();renderCatalog();extras?.refresh();}
function numField(id,label,value,min,max,step=1){return `<label class="field">${label}<input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;}
function inputNumber(id,cb,min,max){$(id).onchange=()=>{const v=Number($(id).value);if(!Number.isFinite(v)||v<min||v>max){toast(`请输入 ${min} 到 ${max} 之间的数值`);renderProperty();return;}checkpoint();cb(v);persist();};}
function transformChanged(){
const it=item(selected),root=roots.get(selected);
const before={x:root.position.x,y:root.position.y,z:root.position.z,rotation:root.rotation.y*180/Math.PI,scale:root.scale.x};
try{transformAssembly(state,selected,before,{x:it.x,y:it.y||0,z:it.z,rotation:it.rotation,scale:it.scale});}
catch(error){Object.assign(it,before);toast(error.message);renderProperty();return;}
for(const member of state.items){const object=roots.get(member.id);if(!object)continue;object.position.set(member.x,member.y||0,member.z);object.rotation.y=member.rotation*Math.PI/180;object.scale.setScalar(member.scale);object.updateMatrixWorld(true);}
refreshSelection();rebuildFibers();renderProperty();
}
function cancelConnection(){setMode('move');controls.enabled=true;toast('已取消本次连接');}
function deleteConnection(id=selectedEdge){
if(!state.connections.some(edge=>edge.id===id))return;
checkpoint();state.connections=state.connections.filter(edge=>edge.id!==id);selectedEdge=null;pending=null;
rebuildFibers();renderProperty();persist();toast('已删除连接，可撤销恢复');
}
function renderProperty(){_renderProperty();extras?.refreshProperties();if(selected&&item(selected)){const target=item(selected);const mechanical=document.createElement('div');mechanical.className='mechanical-actions';const manage=document.createElement('button');manage.id='itemAssemblyTools';manage.textContent=target.support?'调整立杆与组合':'添加立杆 / 组合';manage.onclick=()=>assemblyTools.open();mechanical.append(manage);$('property').append(mechanical);if(target.assemblyName){const group=document.createElement('p');group.className='assembly-name';group.textContent='组合 '+target.assemblyName;mechanical.prepend(group);}const label=document.createElement('label');label.className='field';label.innerHTML='<span><input id="itemColorLock" type="checkbox">锁定此器件配色</span>';document.getElementById('property').append(label);document.getElementById('itemColorLock').checked=!!target.colorLocked;document.getElementById('itemColorLock').onchange=()=>{checkpoint();target.colorLocked=document.getElementById('itemColorLock').checked;persist();};}if(selectedEdge){const edge=state.connections.find(e=>e.id===selectedEdge);if(edge){const remove=document.createElement('button');remove.id='deleteConnection';remove.textContent='删除此连接';remove.onclick=()=>deleteConnection(edge.id);$('property').append(remove);const label=document.createElement('label');label.className='field';label.innerHTML=`<span><input id="edgeColorLock" type="checkbox" ${edge.colorLocked?'checked':''}>锁定此连接配色</span>`;$('property').append(label);$('edgeColorLock').onchange=()=>{checkpoint();edge.colorLocked=$('edgeColorLock').checked;persist();};}}scheduleWorkbenchRefresh();}
function _renderProperty(){const box=$('property');if(selectedEdge){const e=state.connections.find(x=>x.id===selectedEdge);if(!e){selectedEdge=null;return renderProperty();}if(e.kind==='beam'){box.innerHTML=`<h3>激光光束</h3><span class="tag">${esc(endpointText(e.a))}<br>→ ${esc(endpointText(e.b))}</span><label class="field">光束颜色<input id="edgeColor" type="color" value="${e.color}"></label>${numField('edgeDiameter','显示直径 / mm',e.radius*2,.6,20,.2)}${numField('edgeGlow','光晕强度',e.glow??.65,0,1,.05)}<p class="note">光束为两个端口之间的直线。转向请添加反射镜，分支请使用分束器的独立输出端口。颜色与直径用于图示，不代表实际波长、束腰或可见性。</p>`;const change=()=>{rebuildFibers();persist();};$('edgeColor').onchange=()=>{checkpoint();e.color=$('edgeColor').value;change();};inputNumber('edgeDiameter',v=>{e.radius=v/2;change();},.6,20);inputNumber('edgeGlow',v=>{e.glow=v;change();},0,1);return;}box.innerHTML=`<h3>光纤连接</h3><span class="tag">${esc(endpointText(e.a))}<br>⇄ ${esc(endpointText(e.b))}</span><label class="field">光纤类型<select id="edgeFiber">${Object.keys(fiberColors).map(k=>`<option ${e.fiber===k?'selected':''}>${k}</option>`).join('')}</select></label><label class="field">护套颜色<input id="edgeColor" type="color" value="${e.color}"></label>${numField('edgeSlack','布线松弛量 / mm',e.slack,10,600,5)}${numField('edgeRadius','显示半径 / mm',e.radius,.3,5,.1)}<button id="flip">换到另一侧走线</button><p class="note">布线长度为三维曲线估计，不是下单长度。弯曲半径与应力需按真实光纤检查。</p>`;
const change=()=>{rebuildFibers();persist();};$('edgeFiber').onchange=()=>{checkpoint();e.fiber=$('edgeFiber').value;e.color=fiberColors[e.fiber];change();renderProperty();};$('edgeColor').onchange=()=>{checkpoint();e.color=$('edgeColor').value;change();};inputNumber('edgeSlack',v=>{e.slack=v;change();},10,600);inputNumber('edgeRadius',v=>{e.radius=v;change();},.3,5);$('flip').onclick=()=>{checkpoint();e.side*=-1;change();};return;}
const it=item(selected);if(!it){box.innerHTML='<h3>选择一个器件</h3><p class="note">从左侧点选添加，或点击台面上的器件。<br>右侧可修改名称、位置和端口。<br><br>连线：点击两个端口；拖动器件即可调整布局。</p>';return;}
const d=definition(it.type);box.innerHTML=`<h3>${esc(d.name)}</h3><span class="tag">${esc(d.source)}</span><label class="field">器件名称<input id="itemName" value="${esc(it.label)}" maxlength="60"></label><label class="field">位置 X / Z（mm）<div class="pair"><input id="posX" aria-label="器件 X 坐标" type="number" value="${Math.round(it.x*10)/10}" step="25"><input id="posZ" aria-label="器件 Z 坐标" type="number" value="${Math.round(it.z*10)/10}" step="25"></div></label>${numField('rotation','平面旋转 / °',it.rotation,-3600,3600,15)}${numField('scale','整体缩放',it.scale,.05,10,.05)}<label class="field">外壳颜色<input id="bodyColor" type="color" value="${it.color}"></label><label class="field">型号 / 参数 / 备注<input id="note" value="${esc(it.note)}" maxlength="500"></label><div class="actions"><button id="duplicate">复制器件</button><button id="delete">删除</button><button id="focus">放大查看</button></div><h4>光学端口 · 点选连接</h4><div id="portList">${itemPorts(it).map(p=>`<button class="port-button ${busy({item:it.id,port:p.id})?'busy':''} ${pending?.item===it.id&&pending?.port===p.id?'pending':''}" data-port="${p.id}"><span>${esc(p.label)}</span><small>${esc(p.connector)} ${busy({item:it.id,port:p.id})?'已连接':'○'}</small></button>`).join('')||'<p class="note">无光学端口；可在下方添加。</p>'}</div><details id="portDetails"><summary>编辑端口位置 / 添加端口</summary><p class="note">位置为器件局部坐标（缩放前），Y 向上。删除端口同时移除其连线。</p><div id="portEditor"></div><div class="pair"><button id="addPort">＋ 光纤端口</button><button id="addBeamPort">＋ 空间光端口</button></div></details><p class="note">${esc(d.note)}</p>`;
$('itemName').onchange=()=>{checkpoint();it.label=$('itemName').value.trim()||d.name;roots.get(it.id).name=it.label;labelEls.get(it.id).textContent=it.label;renderSceneList();renderConnections();persist();};$('note').onchange=()=>{checkpoint();it.note=$('note').value;persist();};inputNumber('posX',v=>{it.x=v;transformChanged();},-10000,10000);inputNumber('posZ',v=>{it.z=v;transformChanged();},-10000,10000);inputNumber('rotation',v=>{it.rotation=v;transformChanged();},-3600,3600);inputNumber('scale',v=>{it.scale=v;transformChanged();},.05,10);if(d.shape==='import'){$('bodyColor').disabled=true;$('bodyColor').title='导入模型保留原始材质；在三维软件中修改';}$('bodyColor').onchange=()=>{checkpoint();it.color=$('bodyColor').value;roots.get(it.id).traverse(o=>{if(o.material?.name==='editable_housing')o.material.color.set(it.color);});persist();};$('duplicate').onclick=duplicate;$('delete').onclick=removeSelected;$('focus').onclick=focusSelected;$('portList').querySelectorAll('button').forEach(b=>b.onclick=()=>clickPort({item:it.id,port:b.dataset.port}));
let edit=$('portEditor');itemPorts(it).forEach((p,i)=>{const el=document.createElement('div');el.innerHTML=`<label class="field">端口名称<input data-f="label" value="${esc(p.label)}"></label><div class="triple">${p.pos.map((v,j)=>`<input data-axis="${j}" type="number" value="${v}" aria-label="端口 ${esc(p.label)} 的 ${['X','Y','Z'][j]}" step="1">`).join('')}</div><label class="field">出线方向<select data-f="direction">${[['-1,0,0','−X'],['1,0,0','+X'],['0,0,1','+Z'],['0,0,-1','−Z'],['0,1,0','+Y']].map(([v,t])=>`<option value="${v}" ${p.dir.join(',')===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="field">接口<select data-f="connector">${['FC/PC','FC/APC','SC/PC','SC/APC','LC/PC','LC/APC','尾纤熔接','Free space'].map(c=>`<option ${c===p.connector?'selected':''}>${c}</option>`).join('')}</select></label><label class="field">用途<select data-f="role">${[['io','双向'],['in','输入'],['out','输出']].map(([v,t])=>`<option value="${v}" ${p.role===v?'selected':''}>${t}</option>`).join('')}</select></label><button data-delete-port="${p.id}">移除此端口</button>`;edit.append(el);
el.querySelectorAll('input,select').forEach(inp=>inp.onchange=async()=>{if(inp.dataset.axis!==undefined&&(!Number.isFinite(+inp.value)||Math.abs(+inp.value)>4000)){toast('端口坐标须在 ±4000 mm 内');return;}checkpoint();it.ports=clone(itemPorts(it));let pp=it.ports[i];if(inp.dataset.axis!==undefined)pp.pos[+inp.dataset.axis]=+inp.value;else if(inp.dataset.f==='direction')pp.dir=inp.value.split(',').map(Number);else pp[inp.dataset.f]=inp.value;
if(inp.dataset.f==='connector')pp.kind=pp.connector==='Free space'?'free-space':'optical';if(['connector','role'].includes(inp.dataset.f)){const linked=state.connections.some(e=>[e.a,e.b].some(v=>v.item===it.id&&v.port===p.id));if(linked){state.connections=state.connections.filter(e=>![e.a,e.b].some(v=>v.item===it.id&&v.port===p.id));toast('接口属性改变，已解除该端口连接；请重新连接。');}}await rebuild();$('portDetails').open=true;});el.querySelector('button').onclick=async()=>{checkpoint();it.ports=clone(itemPorts(it)).filter(pp=>pp.id!==p.id);state.connections=state.connections.filter(e=>![e.a,e.b].some(v=>v.item===it.id&&v.port===p.id));await rebuild();$('portDetails').open=true;};});
$('addBeamPort').onclick=async()=>{checkpoint();it.ports=clone(itemPorts(it));it.ports.push({id:uid('port'),label:'空间光端口 '+(it.ports.length+1),pos:[0,80,0],dir:[1,0,0],role:'io',connector:'Free space',kind:'free-space'});await rebuild();$('portDetails').open=true;};$('addPort').onclick=async()=>{checkpoint();it.ports=clone(itemPorts(it));it.ports.push({id:uid('port'),label:'光纤端口 '+(it.ports.length+1),pos:[0,25,50],dir:[0,0,1],role:'io',connector:'FC/PC',kind:'optical'});await rebuild();$('portDetails').open=true;};}
let activeCategory='全部',thumbs={};function renderCatalog(){const q=$('search').value.toLowerCase();const defs=[...CATALOG,...state.custom];const shown=searchDevices(defs,q,activeCategory);$('libcount').textContent=defs.length+' 类';$('catalog').innerHTML=shown.length?shown.map(d=>`<button class="part-card" data-type="${d.id}" title="添加 ${esc(d.name)}"><span class="plus">＋</span>${thumbs[d.id]?`<img src="${thumbs[d.id]}" alt="">`:'<div style="height:66px;display:grid;place-items:center;color:#8193a0">GLB</div>'}<b>${esc(d.name)}</b><small>${d.ports.length} 个光学端口</small></button>`).join(''):'<p class="catalog-empty">没有找到器件。可尝试部分名称、英文缩写，或切换到全部类别。</p>';$('catalog').querySelectorAll('button').forEach(b=>b.onclick=()=>addItem(b.dataset.type));}
function buildTabs(){$('categories').innerHTML=categories.map(c=>`<button class="${c===activeCategory?'active':''}">${c}</button>`).join('');$('categories').querySelectorAll('button').forEach(b=>b.onclick=()=>{activeCategory=b.textContent;buildTabs();renderCatalog();});}
function findSpot(){const w=state.board.width,d=state.board.depth;for(let z=180;z<d/2-80;z+=175)for(let x=-w/2+180;x<w/2-150;x+=260)if(state.items.every(it=>Math.abs(it.x-x)>230||Math.abs(it.z-z)>150))return [x,z];for(let z=-d/2+120;z<180;z+=175)for(let x=-w/2+180;x<w/2-150;x+=260)if(state.items.every(it=>Math.abs(it.x-x)>230||Math.abs(it.z-z)>150))return [x,z];return [0,0];}
async function addItem(type){checkpoint();let pos=findSpot();const it=makeItem(type,...pos);state.items.push(it);selected=it.id;selection.clear();selection.add(it.id);selectedEdge=null;await rebuild();toast('已添加 '+it.label+'，可拖动摆放。');document.body.classList.add('show-inspector');}
async function duplicate(){
const ids=expandAssemblies(state,[...selection].length?[...selection]:selected?[selected]:[]);if(!ids.length)return;
const next=clone(state),map=new Map(),groups=new Map();
for(const id of ids){const original=item(id),copy=clone(original);copy.id=uid('obj');remapAssembly(copy,groups,uid);copy.label=(copy.label+' 副本').slice(0,150);copy.x+=65;copy.z+=100;copy.locked=false;next.items.push(copy);map.set(id,copy.id);}
for(const edge of state.connections)if(map.has(edge.a.item)&&map.has(edge.b.item)){const copy=clone(edge);copy.id=uid('fiber');copy.a.item=map.get(edge.a.item);copy.b.item=map.get(edge.b.item);for(const point of copy.waypoints||[]){point.x+=65;point.z+=100;}next.connections.push(copy);}
try{await loadState(next,true);selectMany([...map.values()]);}catch(error){toast('复制未完成：'+error.message);}
}
async function removeSelected(){const ids=new Set(movableAssemblyItems(state,[...selection]).map(it=>it.id));if(selected&&!selection.size&&!item(selected)?.locked)ids.add(selected);if(!ids.size&&!selectedEdge){toast('已锁定器件，请先解锁');return;}checkpoint();state.items=state.items.filter(x=>!ids.has(x.id));state.connections=state.connections.filter(e=>!ids.has(e.a.item)&&!ids.has(e.b.item)&&e.id!==selectedEdge);selected=selectedEdge=pending=null;selection.clear();await rebuild();}
function fitView(top=false){const w=state.board.width,d=state.board.depth,aspect=viewport.clientWidth/viewport.clientHeight;const dist=Math.max(w/aspect,d)*1.55;controls.target.set(0,25,0);camera.up.set(0,1,0);if(top){camera.position.set(0,dist*1.48,.01);}else{camera.position.set(w*.25,dist*.74,dist*1.02);}camera.far=Math.max(18000,camera.position.length()+Math.max(w,d)*3);controls.maxDistance=Math.max(8500,camera.position.length()*1.5);camera.updateProjectionMatrix();controls.update();}
function focusSelected(){if(!selected)return;const b=new T.Box3().setFromObject(roots.get(selected)),center=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),dist=Math.max(size.x,size.y,size.z)*2.6;controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(dist*.6,dist*.6,dist));controls.update();}
let drag=null;function setRay(e){const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);}
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||loading)return;setRay(e);if(mode==='connect'){const hits=raycaster.intersectObjects(portTargets.filter(o=>o.visible));if(hits.length){const h=hits[0].object;controls.enabled=false;clickPort({item:h.userData.itemId,port:h.userData.portId});return;}}
const hits=raycaster.intersectObjects(modelGroup.children,true).filter(h=>!h.object.userData.isPort&&!item(h.object.userData.itemId)?.hidden);if(hits.length){const id=hits[0].object.userData.itemId;if(e.shiftKey)select(id,mode==='connect',true);else if(!selection.has(id))select(id,mode==='connect');if(!movableAssemblyItems(state,[id]).length){toast('器件或组合已锁定，右侧解锁后可移动');return;}if(mode==='move'&&raycaster.ray.intersectPlane(groundPlane,point)){const it=item(id);drag={id,start:point.clone(),x:it.x,z:it.z,moved:false,items:movableAssemblyItems(state,[...selection]).map(it=>({id:it.id,x:it.x,z:it.z})),routes:state.connections.filter(edge=>selection.has(edge.a.item)&&selection.has(edge.b.item)).map(edge=>({id:edge.id,points:clone(edge.waypoints||[])}))};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}}else if(mode==='move'){select(null);}},true);
renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;setRay(e);if(!raycaster.ray.intersectPlane(groundPlane,point))return;let dx=point.x-drag.start.x,dz=point.z-drag.start.z;if(Math.hypot(dx,dz)<2&&!drag.moved)return;if(!drag.moved){checkpoint();drag.moved=true;}const snap=$('snap').checked?25:1;const mx=Math.round((drag.x+dx)/snap)*snap-drag.x,mz=Math.round((drag.z+dz)/snap)*snap-drag.z;if(drag.items.some(initial=>Math.abs(initial.x+mx)>10000||Math.abs(initial.z+mz)>10000)||drag.routes.some(route=>route.points.some(p=>Math.abs(p.x+mx)>=20000||Math.abs(p.z+mz)>=20000)))return;for(const initial of drag.items){const it=item(initial.id);it.x=initial.x+mx;it.z=initial.z+mz;const root=roots.get(it.id);root.position.set(it.x,it.y||0,it.z);root.updateMatrixWorld(true);}for(const route of drag.routes){const edge=state.connections.find(edge=>edge.id===route.id);if(edge.waypoints)edge.waypoints=route.points.map(p=>({...p,x:p.x+mx,z:p.z+mz}));}refreshSelection();rebuildFibers();});
function stopDrag(){if(drag?.moved){persist();renderProperty();}drag=null;controls.enabled=true;}renderer.domElement.addEventListener('pointerup',stopDrag);renderer.domElement.addEventListener('pointercancel',stopDrag);renderer.domElement.addEventListener('lostpointercapture',stopDrag);
function download(data,name,type='application/octet-stream'){const blob=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function save(){persist();download(JSON.stringify(state,null,2),state.title+'_工程.json','application/json');toast('工程已下载，包含所有器件、连线及导入模型。');}
function legacyValidate(p){if(p.format!=='fiber-workbench'||![1,2].includes(p.version)||p.units!=='mm')throw new Error('不是兼容的光纤搭建台工程');if(!Array.isArray(p.items)||p.items.length>250||!Array.isArray(p.connections)||p.connections.length>600)throw new Error('器件或连线数超出上限');if(!p.board||![p.board.width,p.board.depth].every(v=>Number.isFinite(v)&&v>=300&&v<=10000))throw new Error('台面尺寸不正确');p.custom??=[];p.assets??={};const defs=[...CATALOG,...p.custom],ids=new Set(),used=new Set();for(const it of p.items){if(!defs.some(d=>d.id===it.type)||ids.has(it.id))throw new Error('未知器件或重复标识');ids.add(it.id);if(![it.x,it.z,it.rotation,it.scale].every(Number.isFinite)||it.scale<=0||it.scale>10||Math.abs(it.x)>10000||Math.abs(it.z)>10000)throw new Error('器件坐标或缩放不正确');if(!/^#[0-9a-f]{6}$/i.test(it.color))throw new Error('颜色格式不正确');const d=defs.find(d=>d.id===it.type);if(d.shape==='import'&&!p.assets[it.type])throw new Error('缺少导入的模型');const ps=it.ports||d.ports,pi=new Set();if(ps.length>32)throw new Error('端口数量过多');for(const pt of ps){if(!['optical','free-space'].includes(pt.kind)||!['in','out','io'].includes(pt.role)||(pt.kind==='free-space')!==(pt.connector==='Free space'))throw new Error('端口介质或接口不一致');if(pt.gender!==undefined&&!['male','female'].includes(pt.gender)||pt.pigtailEnd!==undefined&&typeof pt.pigtailEnd!=='boolean')throw new Error('端口公母或尾纤字段无效');if(pi.has(pt.id))throw new Error('重复端口标识');pi.add(pt.id);if(!Array.isArray(pt.pos)||pt.pos.length!==3||!pt.pos.every(v=>Number.isFinite(v)&&Math.abs(v)<=4000)||!Array.isArray(pt.dir)||pt.dir.length!==3||!pt.dir.every(Number.isFinite)||Math.hypot(...pt.dir)<.5)throw new Error('端口坐标错误');}}
const edgeIds=new Set();for(const e of p.connections){if(edgeIds.has(e.id))throw new Error('重复连线标识');edgeIds.add(e.id);if(!/^#[0-9a-f]{6}$/i.test(e.color)||!Number.isFinite(e.radius)||e.radius<.3||e.radius>(e.kind==='beam'?10:5))throw new Error('连线显示参数不正确');if(e.kind==='beam'){if(!Number.isFinite(e.glow)||e.glow<0||e.glow>1||e.waypoints?.length)throw new Error('激光光束参数不正确');}else if(!fiberColors[e.fiber]||!/^#[0-9a-f]{6}$/i.test(e.color)||!Number.isFinite(e.slack)||e.slack<10||e.slack>600||!Number.isFinite(e.radius)||e.radius<.3||e.radius>5||![1,-1].includes(e.side))throw new Error('光纤参数不正确');const pts=[];for(const end of [e.a,e.b]){const it=p.items.find(i=>i.id===end.item),d=it&&defs.find(d=>d.id===it.type),pt=it&&(it.ports||d.ports).find(x=>x.id===end.port);if(!pt)throw new Error('连线端点不存在');const key=end.item+'|'+end.port;if(used.has(key))throw new Error('一个端口不能接两条光纤');used.add(key);pts.push(pt);}if(e.a.item===e.b.item||!supportedFiberConnectorPair(pts[0],pts[1])||pts.some(pt=>pt.kind!==(e.kind==='beam'?'free-space':'optical'))||pts[0].role===pts[1].role&&['in','out'].includes(pts[0].role))throw new Error('连线接口或方向不兼容');}return p;}
function validate(data){const p=clone(data);const safeId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);if(!p||!Array.isArray(p.items)||!Array.isArray(p.connections)||typeof p.title!=='string'||p.title.length>150)throw new Error('工程字段不完整');if(!Array.isArray(p.custom||[]))throw new Error('器件定义不正确');const built=new Set(CATALOG.map(d=>d.id));for(const d of p.custom||[]){if(!safeId(d.id)||built.has(d.id)||d.shape!=='import'||typeof d.name!=='string'||d.name.length>100||!Array.isArray(d.size)||d.size.length!==3||!d.size.every(v=>Number.isFinite(v)&&v>0&&v<10000)||!Array.isArray(d.ports))throw new Error('导入器件定义无效');built.add(d.id);if(typeof p.assets?.[d.id]!=='string'||p.assets[d.id].length>42e6||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.assets[d.id]))throw new Error('GLB资源编码无效');}for(const it of p.items){if(!safeId(it.id)||!safeId(it.type)||typeof it.label!=='string'||it.label.length>150)throw new Error('器件标识或名称无效');validateAssemblyItem(it);if(it.y!==undefined&&(!Number.isFinite(it.y)||Math.abs(it.y)>2000))throw new Error('高度无效');for(const pt of it.ports||[]){if(!safeId(pt.id)||typeof pt.label!=='string'||pt.label.length>80||!['in','out','io'].includes(pt.role)||typeof pt.connector!=='string'||pt.connector.length>32)throw new Error('端口定义无效');}}for(const d of p.custom||[])for(const pt of d.ports)if(!safeId(pt.id))throw new Error('端口标识无效');for(const e of p.connections){if(e.kind!==undefined&&!['beam','fiber'].includes(e.kind))throw new Error('未知连接类型');if(e.kind==='beam')e.glow??=.65;if(!safeId(e.id)||![e.a,e.b].every(q=>q&&safeId(q.item)&&safeId(q.port)))throw new Error('连线标识无效');if(e.waypoints&&(!Array.isArray(e.waypoints)||e.waypoints.length>20||!e.waypoints.every(q=>[q.x,q.y,q.z].every(v=>Number.isFinite(v)&&Math.abs(v)<20000))))throw new Error('布线控制点无效');}if(p.presentation?.appearance){if(typeof p.presentation.appearance!=='object'||Array.isArray(p.presentation.appearance)||!Object.entries(p.presentation.appearance).every(([key,value])=>['background','floor','table'].includes(key)&&/^#[0-9a-f]{6}$/i.test(value)))throw new Error('场景配色无效');}for(const key of ['showLabels','showMarkings'])if(p.presentation?.[key]!==undefined&&typeof p.presentation[key]!=='boolean')throw new Error('文字显示设置无效');if(p.presentation?.typography!==undefined)p.presentation.typography=normalizeTypography(p.presentation.typography);if(p.presentation?.renderLabels!==undefined)p.presentation.renderLabels=normalizeRenderLabelEdits(p.presentation.renderLabels);const result=legacyValidate(p);result.version=2;result.items.forEach(it=>{it.y??=0;it.locked=!!it.locked;it.hidden=!!it.hidden;it.showLabel=it.showLabel!==false;});if(result.views&&!Array.isArray(result.views))throw new Error('视角列表无效');result.selectionSets=normalizeSelectionSets(result.selectionSets,new Set(result.items.map(it=>it.id)));if(result.presentation?.quality!==undefined)result.presentation.quality=normalizeSurfaceQuality(result.presentation.quality);return result;}
function restoreCamera(view){
if(!view||![view.position,view.target].every(a=>Array.isArray(a)&&a.length===3&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<100000)))return;
const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
camera.position.fromArray(view.position);controls.target.fromArray(view.target);camera.up.set(0,1,0);
const savedDistance=camera.position.distanceTo(controls.target);
if(Number.isFinite(view.aspect)&&view.aspect>0&&camera.aspect>0&&camera.aspect<view.aspect)camera.position.sub(controls.target).multiplyScalar(view.aspect/camera.aspect).add(controls.target);
if(Array.isArray(view.up)&&view.up.length===3&&view.up.every(Number.isFinite)&&Math.hypot(...view.up)>.01)camera.up.fromArray(view.up).normalize();
camera.zoom=Number.isFinite(view.zoom)&&view.zoom>0&&view.zoom<100?view.zoom:1;
camera.fov=Number.isFinite(view.fov)&&view.fov>=10&&view.fov<=100?view.fov:38;
camera.near=Number.isFinite(view.near)&&view.near>0&&view.near<100?view.near:2;
camera.far=Number.isFinite(view.far)&&view.far>camera.near&&view.far<=100000?view.far:18000;
const distance=camera.position.distanceTo(controls.target);camera.far+=Math.max(0,distance-savedDistance);controls.maxDistance=Math.max(8500,distance*1.1);controls.minDistance=Math.min(140,Math.max(.1,distance*.5));
camera.updateProjectionMatrix();controls.update();controls.enableDamping=damping;
}
async function loadState(data,undo=true,prepared=new Map()){
  const project=validate(data),staged=new Map();
  for(const definition of project.custom){
    const cached=prepared.get(definition.id)||(project.assets[definition.id]===state?.assets?.[definition.id]?assetCache.get(definition.id):null);
    staged.set(definition.id,cached||await prepareImportedAsset(definition,project.assets));
  }
  const previous={state,camera:snapshotCamera(),cache:new Map(assetCache),selected,selectedEdge,pending,selection:[...selection],history:history.slice(),future:future.slice(),view:renderStudio?.getSettings().view};
  const view=clone(project.camera);
  if(undo)checkpoint();
  try{
    state=project;selected=selectedEdge=pending=null;selection.clear();
    assetCache.clear();staged.forEach((value,key)=>assetCache.set(key,value));
    await rebuild(true);restoreCamera(view);renderStudio?.setView(project.presentation?.view||'auto');persist();toast('工程已恢复');
  }catch(error){
    state=previous.state;selected=previous.selected;selectedEdge=previous.selectedEdge;pending=previous.pending;
    selection.clear();previous.selection.forEach(id=>selection.add(id));
    history=previous.history;future=previous.future;
    assetCache.clear();previous.cache.forEach((value,key)=>assetCache.set(key,value));
    loading=false;
    await rebuild();restoreCamera(previous.camera);
    if(previous.view)renderStudio?.setView(previous.view);
    updateHistory();persist();
    throw error;
  }
}
function layoutGeometryBounds(project){
  const bounds=new Map();
  for(const it of project.items){
    const existing=item(it.id),d=getDef(it.type)||project.custom?.find(entry=>entry.id===it.type);
    let root=roots.get(it.id),temporary=false;
    if(!root||!existing||['x','y','z','rotation','scale'].some(key=>it[key]!==existing[key])){
      if(!d||d.shape==='import')continue;
      root=new T.Group();temporary=true;
      root.add(buildModel(d,{...it,surfaceQuality:project.presentation?.quality}));
      if(it.support)buildPostSupport(T,root,it.support);
      root.position.set(it.x,it.y||0,it.z);root.rotation.y=it.rotation*Math.PI/180;root.scale.setScalar(it.scale);
    }
    try{
      root.updateWorldMatrix(true,true);
      const box=new T.Box3();
      for(const child of root.children)if(!child.userData.isPort)box.expandByObject(child,true);
      if(!box.isEmpty())bounds.set(it.id,{min:box.min.toArray(),max:box.max.toArray()});
    }finally{if(temporary)disposeGeometry(root);}
  }
  return bounds;
}
async function applyAutomaticLayout(connectionText=null,options={}){
  if(loading||autoLayoutBusy)throw new Error('场景正在更新，请稍后排版');
  autoLayoutBusy=true;
  try{
    const selectedIds=[...selection],original=state;
    const logic=connectionText===null?null:planConnectionLogic(state,connectionText,{catalog:[...CATALOG,...state.custom],uid,validate});
    const source=logic?.scene||state;
    const layout=planAutoLayout(source,options,{definition:type=>getDef(type)||source.custom?.find(entry=>entry.id===type),bounds:layoutGeometryBounds(source)});
    const result={logic:logic?.summary||null,layout:layout.summary};
    if(!layout.summary.changed&&!logic?.summary.changed)return result;
    if(state!==original||loading)throw new Error('场景已更新，请再次点击排版');
    delete layout.scene.camera;
    layout.scene.presentation={...layout.scene.presentation,view:'editor'};
    await loadState(layout.scene,true);
    setMode('move');
    selectMany(selectedIds.filter(id=>state.items.some(it=>it.id===id)));
    persist();
    return result;
  }finally{autoLayoutBusy=false;}
}
async function loadFile(file){try{if(file.size>100e6)throw new Error('工程超过100MB');await loadState(JSON.parse(await file.text()));}catch(e){toast('打开失败：'+e.message);}}
async function importModel(file,options={}){
if(!file)return null;
try{
if(file.size>30e6)throw new Error('单个模型请控制在30MB内');
const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
const id=uid('custom'),name=(options.label||file.name.replace(/\.glb$/i,'')).trim().slice(0,100)||'自定义器件';
const d={id,name,category:'连接与机械',shape:'import',size:[160,100,120],ports:[],code:options.aiSource?'AI GLB':'CUSTOM GLB',note:'自有模型；请校准尺寸并添加端口。',source:options.aiSource?'AI生成GLB；尺寸与接口由用户校准':'用户导入GLB；最长边已归一为160mm',color:'#34434b'};
const model=await prepareImportedAsset(d,{[id]:data});d.size=new T.Box3().setFromObject(model).getSize(new T.Vector3()).toArray();d.ports=clone(model.userData.importedPorts||[]);
if(d.ports.length)d.note='含模型内置光学端口，位置已与三维模型同步；可在属性栏调整。';
const requestedScale=options.longestMM===undefined?1:Number(options.longestMM)/Math.max(...d.size),rotation=Number(options.rotation||0);
if(!Number.isFinite(requestedScale)||requestedScale<.05-1e-9||requestedScale>10+1e-9||!Number.isFinite(rotation)||Math.abs(rotation)>3600)throw new Error('导入尺寸或朝向超出支持范围，请调整最长边尺寸');
const scale=T.MathUtils.clamp(requestedScale,.05,10);
const next=clone(state),it=makeItem(id,...findSpot(),name,d);it.scale=scale;it.rotation=rotation;if(options.aiSource)it.aiSource=clone(options.aiSource);
next.custom.push(d);next.assets[id]=data;next.items.push(it);
await loadState(next,true,new Map([[id,model]]));select(it.id);
toast(d.ports.length?'模型已导入，已识别 '+d.ports.length+' 个光学端口，可直接连接。':'模型已导入，可在属性中设置光学端口。');
return it.id;
}catch(error){toast('模型导入失败：'+error.message);return null;}
}
async function exportGLB(onlySelected=false,doDownload=true){
  if(onlySelected&&!selected){toast('请先选择一个器件');return;}
  const out=new T.Scene(),root=new T.Group(),components=[];
  out.userData.opticalWorkbenchUnits='m';root.scale.setScalar(.001);out.add(root);
  const hidden=portTargets.map(object=>object.visible);portTargets.forEach(object=>object.visible=false);
  try{
    if(onlySelected){
      const ids=expandAssemblies(state,[selected]);
      if(ids.length===1){
        const model=roots.get(selected).clone(true);model.position.set(0,0,0);model.rotation.set(0,0,0);root.add(model);components.push(model);
      }else{
        const included=new Set(ids),center=new T.Vector3();for(const id of ids)center.add(roots.get(id).position);center.divideScalar(ids.length);
        for(const id of ids){const model=roots.get(id).clone(true);model.position.sub(center);root.add(model);components.push(model);}
        const edges=new Set(state.connections.filter(edge=>included.has(edge.a.item)&&included.has(edge.b.item)).map(edge=>edge.id));
        for(const object of fiberGroup.children)if(edges.has(object.userData.edgeId)){const copy=object.clone(true);copy.position.sub(center);root.add(copy);}
      }
    }else{
      const models=modelGroup.clone(true);root.add(board.clone(true),models,fiberGroup.clone(true));components.push(...models.children);
    }
    const portCount=components.reduce((total,component)=>total+itemPorts(item(component.userData.itemId)).length,0);let portIndex=0;
    for(const component of components){
      component.traverse(object=>{delete object.userData.opticalPorts;});
      if(portCount<=32){
        component.userData.opticalPorts=clone(itemPorts(item(component.userData.itemId))).map(port=>({...port,id:components.length===1?port.id:('p'+(++portIndex)+'_'+port.id).slice(0,100)}));
      }
    }
    if(portCount>32)out.userData.opticalPortCount=portCount;
    root.updateMatrixWorld(true);
    const data=await new GLTFExporter().parseAsync(out,{binary:true,onlyVisible:true,trs:true,maxTextureSize:2048});
    if(doDownload)download(data,onlySelected?item(selected).label+'.glb':state.title+'_三维光路.glb','model/gltf-binary');return data;
  }finally{portTargets.forEach((object,index)=>object.visible=hidden[index]);}
}
async function capturePublication(options={}){const visible=typeof options.labels==='boolean'?options.labels:state.presentation?.showLabels===true;const captured=await captureScene({T,renderer,scene,modelGroup,fiberGroup,helperGroup,portTargets,board,floor,camera,controls,state,roots},options);return {...captured,typography:normalizeTypography(state.presentation?.typography),labels:visible?captured.labels:[]};}
async function exportPNG(doDownload=true){const out=await capturePublication({width:2400,height:1200,transparent:false,hideBoard:state.presentation?.showTable===false,view:'editor'}),im=new Image();await new Promise((r,j)=>{im.onload=r;im.onerror=j;im.src=out.dataUrl;});const canvas=document.createElement('canvas');canvas.width=out.width;canvas.height=out.height;const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);if($('showLabels').checked){await document.fonts?.ready;const typography=normalizeTypography(state.presentation?.typography);ctx.font=canvasFont(typography,typography.screenPx*25/14);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#203743';for(const l of out.labels)ctx.fillText(l.text,l.x,l.y);}const result=canvas.toDataURL('image/png');if(doDownload)download(await new Promise(r=>canvas.toBlob(r,'image/png')),state.title+'_三维图.png');return result;}
async function thumbnails(){const r=new T.WebGLRenderer({antialias:true,alpha:true});r.setSize(210,145);r.setPixelRatio(1);r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.3;const sc=new T.Scene();sc.environment=new T.PMREMGenerator(r).fromScene(new RoomEnvironment(),.04).texture;sc.add(new T.HemisphereLight(0xffffff,0x667788,2));const light=new T.DirectionalLight(0xffffff,3);light.position.set(-200,400,300);sc.add(light);const cam=new T.PerspectiveCamera(33,210/145,1,4000);for(const d of CATALOG){const m=buildModel(d);sc.add(m);const b=new T.Box3().setFromObject(m),c=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3());const dist=Math.max(size.x*.9,size.y,size.z)*2.1;cam.position.copy(c).add(new T.Vector3(dist*.65,dist*.65,dist));cam.lookAt(c);r.render(sc,cam);thumbs[d.id]=r.domElement.toDataURL('image/png');sc.remove(m);disposeGeometry(m);await new Promise(resolve=>setTimeout(resolve,0));}r.dispose();renderCatalog();extras?.refresh();}
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);const w=viewport.clientWidth,h=viewport.clientHeight;for(const it of state?.items||[]){const root=roots.get(it.id),el=labelEls.get(it.id);if(!root||!el)continue;const d=definition(it.type),v=new T.Vector3(0,(d.size[1]+20)*it.scale,0).add(root.position).project(camera);el.style.display=!it.hidden&&it.showLabel!==false&&$('showLabels').checked&&v.z<1&&Math.abs(v.x)<1.2&&Math.abs(v.y)<1.2?'block':'none';el.style.left=(v.x*.5+.5)*w+'px';el.style.top=(-v.y*.5+.5)*h+'px';}}
for(const key of ['showLabels','showMarkings'])$(key).onchange=()=>setTextVisibility(key,$(key).checked);$('cancelConnection').onclick=cancelConnection;$('expandBoard').onclick=()=>{ $('boardW').value=Math.min(10000,Math.ceil(state.board.width*1.25/100)*100);$('boardD').value=Math.min(10000,Math.ceil(state.board.depth*1.25/100)*100);$('resize').click();};$('search').oninput=renderCatalog;$('move').onclick=()=>setMode('move');$('connect').onclick=()=>{setMode('connect');toast('依次点击两个端口，或使用右侧端口按钮。');};$('showPorts').onchange=updatePortAppearance;$('view3d').onclick=()=>fitView();$('top').onclick=()=>fitView(true);$('fit').onclick=()=>fitView();$('toggleConnections').onclick=()=>{$('connections').classList.toggle('hidden');resize();};$('save').onclick=save;$('load').onclick=()=>$('loadFile').click();$('loadFile').onchange=()=>{if($('loadFile').files[0])loadFile($('loadFile').files[0]);$('loadFile').value='';};$('import').onclick=()=>$('modelFile').click();$('modelFile').onchange=()=>{importModel($('modelFile').files[0]);$('modelFile').value='';};$('symbols').onclick=()=>window.open('光纤符号库.html','_blank');$('help').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('export').onclick=()=>$('exportDialog').showModal();$('closeExport').onclick=()=>$('exportDialog').close();$('exportAll').onclick=async()=>{try{toast('正在导出三维模型…');await exportGLB();$('exportDialog').close();toast('三维场景已导出');}catch(e){toast('导出失败：'+e.message);}};$('exportOne').onclick=async()=>{await exportGLB(true);$('exportDialog').close();};$('image').onclick=()=>exportPNG();
$('applyPreset').onclick=async()=>{checkpoint();state=preset($('preset').value);const view=clone(state.camera);selected=selectedEdge=pending=null;selection.clear();await rebuild(true);restoreCamera(view);renderStudio?.setView(state.presentation?.view||'auto');persist();toast('已载入模板，撤销可恢复先前场景。');};async function resizeBoard(width,depth){
  if(loading){toast('正在更新场景，请稍后调整台面');return false;}
  if(!Number.isFinite(width)||!Number.isFinite(depth)||width<300||width>10000||depth<300||depth>10000){
    toast('台面宽度和深度均为 300–10000 mm');return false;
  }
  if(width===state.board.width&&depth===state.board.depth)return true;
  const previous={board:state.board,camera:snapshotCamera(),history:history.slice(),future:future.slice()};
  checkpoint();state.board={width,depth};
  try{
    await rebuild(true);toast('台面已调整为 '+width+' × '+depth+' mm');return true;
  }catch(error){
    state.board=previous.board;history=previous.history;future=previous.future;loading=false;
    await rebuild();restoreCamera(previous.camera);updateHistory();persist();
    toast('调整台面失败：'+error.message);return false;
  }
}
$('resize').onclick=()=>resizeBoard(+$('boardW').value,+$('boardD').value);
async function restoreHistory(from,to){if(!from.length||loading)return;state.camera=snapshotCamera();to.push(clone(state));state=from.pop();const view=clone(state.camera);selected=selectedEdge=pending=null;selection.clear();await rebuild();restoreCamera(view);renderStudio?.setView(state.presentation?.view||'auto');persist();}
$('undo').onclick=()=>restoreHistory(history,future);$('redo').onclick=()=>restoreHistory(future,history);
function applySelectionTransform(options){
if(loading)return;
try{const plan=planTransform(state,[...selection],options,{validate,uid});checkpoint();state=plan.scene;rebuild().catch(error=>toast(error.message));}catch(error){toast(error.message);}
}
document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.target.closest?.('dialog'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save();return;}if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable)return;const controlFocus=document.activeElement.closest?.('button,summary,a,[role="tab"],[role="menuitem"]');if(controlFocus&&!e.ctrlKey&&!e.metaKey&&e.key!=='Escape')return;if((e.ctrlKey||e.metaKey)&&e.shiftKey&&['c','v'].includes(e.key.toLowerCase())){e.preventDefault();try{const operation=e.key.toLowerCase()==='c'?drawingTools?.copyStyle():drawingTools?.pasteStyle();Promise.resolve(operation).catch(error=>toast(error.message));}catch(error){toast(error.message);}return;}if(e.ctrlKey||e.metaKey){if(['s','z','y','d'].includes(e.key.toLowerCase())){e.preventDefault();if(e.key==='s')save();if(e.key==='z')$('undo').click();if(e.key==='y')$('redo').click();if(e.key==='d')duplicate();}}else if(e.key==='Delete')removeSelected();else if(e.key==='Escape'){pending=null;setMode('move');document.body.classList.remove('show-inspector');}else if(e.key.toLowerCase()==='r'&&selected)applySelectionTransform({rotation:15});else if(e.key.toLowerCase()==='f')focusSelected();else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selection.size){e.preventDefault();const step=e.shiftKey?1:25;applySelectionTransform({dx:e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dz:e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0});}});
window.addEventListener('error',e=>{console.error(e.error);toast('运行异常：'+e.message);});
// Public project API: same validation and geometry paths used by the UI.
window.lab={getState:()=>clone(state),getCatalog:()=>clone(CATALOG),load:loadState,add:addItem,select,selectMany,clickPort,connectionError,exportGLB,exportPNG,validate,fitView,focusSelected,getSelected:()=>selected,getSelection:()=>[...selection],getJournal:()=>journal,getRenderStudio:()=>renderStudio,getTools:()=>extras,getPaletteStudio:()=>paletteStudio,getDrawingTools:()=>drawingTools,getPrecisionTools:()=>precisionTools,getSceneTools:()=>sceneTools,getCommandPalette:()=>commandPalette,getWorkbenchShell:()=>workbenchShell,getQualityStudio:()=>qualityStudio,getCompositionTools:()=>compositionTools,getTypographyStudio:()=>typographyStudio,getAssemblyTools:()=>assemblyTools,getConnectionLogicTools:()=>autoLayoutTools,autoLayout:options=>applyAutomaticLayout(null,options),getAIStudio:()=>aiStudio,getNatureReferences:()=>natureReferences,getReferenceRenderProfiles:()=>clone(natureRenderPresets.profiles),
getConnectionRouting:id=>{const edge=state.connections.find(value=>value.id===id);return edge?clone(cableCurve(edge)?.userData?.routing||null):null;},
getRoutingObstacles:()=>routingObstacles.map(({id,box})=>({id,min:box.min.toArray(),max:box.max.toArray()})),
getItemGeometryBounds:id=>{const root=roots.get(id);if(!root)return null;const model=root.children[0].clone(true);model.scale.multiplyScalar(root.scale.x);model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model);return {min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new T.Vector3()).toArray(),units:'mm'};},
getFiberConnectorDetails:id=>fiberGroup.children.filter(object=>object.name==='fiber_connector'&&object.userData.edgeId===id).map(object=>({...clone(object.userData),polish:object.userData.connector?.includes('APC')?'APC':'PC',matingSleeve:!!object.getObjectByName('fc_inline_mating_sleeve'),position:object.position.toArray(),axis:new T.Vector3(0,1,0).applyQuaternion(object.quaternion).toArray()})),
getPortDiagnostics:()=>portTargets.map(object=>({itemId:object.userData.itemId,portId:object.userData.portId,visible:object.visible,position:object.getWorldPosition(new T.Vector3()).toArray()})),
importModel,cancelConnection,deleteConnection,getMode:()=>mode,getPending:()=>clone(pending),getSelectedEdge:()=>selectedEdge,setTextVisibility,capturePublication,preset:async n=>{checkpoint();state=preset(n);const view=clone(state.camera);selected=selectedEdge=pending=null;selection.clear();await rebuild(true);restoreCamera(view);renderStudio?.setView(state.presentation?.view||'auto');persist();},connectionPoints:(id,segments=8)=>{const e=state.connections.find(v=>v.id===id);return e?cableCurve(e)?.getPoints(segments).map(v=>v.toArray()):null;},getThumbs:()=>thumbs,worldPort:portWorld,projectPort:(end)=>{const p=portWorld(end);if(!p)return null;const v=p.pos.clone().project(camera);return {x:(v.x*.5+.5)*viewport.clientWidth,y:(-v.y*.5+.5)*viewport.clientHeight};},ready:false};
function installResearchPanels(){
  const aiMount=workbenchShell.registerPanel('ai','AI建模');
  aiStudio=installAIStudio({
    mount:aiMount,
    showPanel:()=>workbenchShell.showInspector('ai'),
    importModel,download,toast
  });
  const referenceMount=workbenchShell.registerPanel('references','参考');
  natureReferences=installNatureReferences({
    mount:referenceMount,
    library:natureLibrary,
    showPanel:()=>workbenchShell.showInspector('references'),
    applyStyle:()=>renderStudio.run({settings:{style:'paper',background:'white',table:'none',tightFrame:true,preserveConnectionColors:true,useSceneColors:false,reference:null,referenceStyle:null}}),
    renderReference:paper=>{
      const profile=natureRenderPresets.profiles.find(entry=>entry.doi===paper.doi);
      if(!profile)throw new Error('这篇文献的渲染预设尚未载入');
      return renderStudio.run({settings:{
        style:'paper',background:'white',table:'none',view:'auto',tightFrame:true,preserveConnectionColors:true,useSceneColors:false,
        referenceStyle:profile.parameters,
        reference:{doi:paper.doi,title:paper.title,journal:paper.journal,year:paper.year,figure_label:paper.figure_label,figure_url:paper.figure_url,thumbnail_path:paper.thumbnail_path,styleLabel:profile.styleLabel}
      }});
    },
    draftAI:prompt=>{aiStudio.setPrompt(prompt);aiStudio.open();}
  });
}
async function init(){state=preset('waveplate');try{const saved=localStorage.getItem('fiberWorkbench.v2');if(saved)state=validate(JSON.parse(saved));}catch(e){console.warn('暂存未恢复',e.message);}buildTabs();resize();const savedCamera=clone(state.camera);await rebuild(true);restoreCamera(savedCamera);extras=installEnhancements({T,getState:()=>state,getSelection:()=>[...selection],getSelected:()=>selected,getSelectedEdge:()=>selectedEdge,getRoots:()=>roots,definition,itemPorts,checkpoint,persist,rebuild,renderProperty,renderSceneList,select,selectMany,transformChanged,toast,download,camera,controls,snapshotCamera,restoreCamera,onViewChanged:()=>renderStudio?.setView('editor'),board:()=>board,floor,scene,removeSelected,duplicate,cableCurve,showJournal:()=>journal.open(),showRender:()=>renderStudio.run().catch(()=>{}),capture:capturePublication});journal=createJournalStudio({capture:capturePublication,getState:()=>state,download},document.body);renderStudio=createRenderStudio({capture:capturePublication,getState:()=>clone(state),download,toast,saveLabelEdits:saveRenderLabelEdits,resetAppearance:()=>extras.resetAppearance(),showQuality:()=>qualityStudio.open(),showTypography:()=>typographyStudio.open()});paletteStudio=installPaletteStudio({T,getState:()=>state,getSelection:()=>[...selection],getSelectedEdge:()=>selectedEdge,definition,checkpoint,persist,rebuild,toast,download,refreshPresentation:()=>extras.refreshPresentation()});drawingTools=installDrawingTools({getState:()=>state,getSelection:()=>[...selection],getSelectedEdge:()=>selectedEdge,definition,checkpoint,persist,rebuild,toast,download,validate,uid,select,selectMany,loadState});precisionTools=installPrecisionTools({getState:()=>state,getSelection:()=>[...selection],validate,uid,loadState,select,selectMany,toast});sceneTools=installSceneTools({getState:()=>state,getSelection:()=>[...selection],getSelectedEdge:()=>selectedEdge,definition,select,selectMany,checkpoint,persist,rebuild,toast,focusSelected});qualityStudio=installQualityStudio({getState:()=>state,checkpoint,persist,rebuild,toast});typographyStudio=installTypographyStudio({getState:()=>state,checkpoint,persist,toast,setTextVisibility,refresh:({typographyChanged=true}={})=>{syncTextVisibility();renderStudio?.refreshTypography({undo:!typographyChanged});}});compositionTools=installCompositionTools({T,getState:()=>state,getRoots:()=>roots,camera,controls,cableCurve,checkpoint,persist,rebuild,toast,getViewportSize:()=>({width:viewport.clientWidth,height:viewport.clientHeight}),refresh:()=>{extras.refresh();renderStudio.setView('editor');scheduleWorkbenchRefresh();}});commandPalette=installCommandPalette({getState:()=>state,getSelection:()=>[...selection],getSelectedEdge:()=>selectedEdge,getCatalog:()=>[...CATALOG,...state.custom],getSceneTools:()=>sceneTools,getShell:()=>workbenchShell,focusSelected,add:addItem,toast});assemblyTools=installAssemblyTools({getState:()=>state,getSelection:()=>[...selection],loadState,selectMany,findSpot,validate,uid,toast,download});autoLayoutTools=installAutoLayoutTools({getState:()=>state,definition,apply:applyAutomaticLayout,toast});workbenchShell=installWorkbenchShell({getState:()=>state,getSelection:()=>[...selection],getSelectedEdge:()=>selectedEdge,openCommands:()=>commandPalette.open(),resize,toast});installResearchPanels();extras.refresh();scheduleWorkbenchRefresh();animate();await thumbnails();window.lab.ready=true;toast('器件库已就绪。点选添加，拖动布局。');}init().catch(e=>{$('loading').textContent='启动失败：'+e.message;console.error(e);});


