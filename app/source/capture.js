import {preserveConnectionColors} from './connection-colors.js';
import {publicationAppearance,editorCaptureBackground} from './render-appearance.js';
import {resolveTable} from './table-settings.js';
import {normalizeSurfaceQuality} from './surface-quality.js';
import {projectedRenderFraming,frameRenderLabels} from './render-framing.js';
import {normalizeReferenceStyle} from './reference-render-style.js';
export async function captureScene(api,options={}){
if(options.preset==='nature')return captureNature(api,options);
const {T,renderer,scene,modelGroup,fiberGroup,helperGroup,portTargets,board,floor,camera,controls,state,roots}=api;
const width=Math.round(Math.max(300,Math.min(8192,options.preset==='journal'?Math.max(options.width||2200,4400):options.width||2200)));let height=Math.round(Math.max(200,Math.min(8192,options.height||1100))),aspect=width/height;
const transparent=options.transparent!==false,hideBoard=options.hideBoard!==false;
const quality=normalizeSurfaceQuality(options.quality??state.presentation?.quality);
const before={size:renderer.getSize(new T.Vector2()),pixelRatio:renderer.getPixelRatio(),background:scene.background,clearColor:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),board:board.visible,floor:floor.visible,helpers:helperGroup.visible,ports:portTargets.map(p=>p.visible),exposure:renderer.toneMappingExposure};
let shadowPlane,restoreConnectionColors=()=>{};
try{
if(options.preserveConnectionColors!==false){
  const restorers=[];restoreConnectionColors=()=>{for(const restore of restorers.reverse())restore();};
  restorers.push(preserveConnectionColors(T,modelGroup));restorers.push(preserveConnectionColors(T,fiberGroup));
}
board.visible=!hideBoard;floor.visible=false;helperGroup.visible=false;portTargets.forEach(p=>p.visible=false);const backgroundColor=editorCaptureBackground(state.presentation);scene.background=transparent?null:new T.Color(backgroundColor);renderer.setClearColor(backgroundColor,transparent?0:1);
const bounds=new T.Box3();for(const it of state.items){const r=roots.get(it.id);if(r?.visible)bounds.union(new T.Box3().setFromObject(r));}if(!hideBoard)bounds.union(new T.Box3().setFromObject(board));for(const child of fiberGroup.children)if(child.visible)bounds.union(new T.Box3().setFromObject(child));if(bounds.isEmpty())bounds.set(new T.Vector3(-300,0,-150),new T.Vector3(300,100,150));
const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());const preset=options.view||state.presentation?.view||'editor';let dir=new T.Vector3(.18,.58,1).normalize();if(preset==='editor')dir.copy(camera.position).sub(controls.target).normalize();if(preset==='front')dir.set(.06,.22,1).normalize();if(preset==='top')dir.set(0,1,.001).normalize();if(preset==='iso')dir.set(.35,.7,1).normalize();
const right=new T.Vector3().crossVectors(new T.Vector3(0,1,0),dir).normalize(),up=new T.Vector3().crossVectors(dir,right).normalize();let halfX=0,halfY=0;
for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new T.Vector3(x,y,z).sub(center);halfX=Math.max(halfX,Math.abs(p.dot(right)));halfY=Math.max(halfY,Math.abs(p.dot(up)));}
// Leave space above objects for editable figure labels, and around all sides for trim.
halfX=Math.max(halfX*1.12,50);halfY=Math.max(halfY*1.25+20,50);if(options.preset==='journal'){height=Math.round(T.MathUtils.clamp(width*halfY/halfX,width/4.4,width*1.25));aspect=width/height;}let halfH=Math.max(halfY,halfX/aspect),halfW=halfH*aspect;const distance=Math.max(size.length()*3,1000);let cam;
if(options.projection==='perspective'){cam=new T.PerspectiveCamera(32,aspect,1,40000);const dist=halfH/Math.tan(T.MathUtils.degToRad(16))+size.length()*.4;cam.position.copy(center).addScaledVector(dir,dist);}else{cam=new T.OrthographicCamera(-halfW,halfW,halfH,-halfH,1,40000);cam.position.copy(center).addScaledVector(dir,distance);}cam.up.copy(up);cam.lookAt(center);cam.updateMatrixWorld(true);cam.updateProjectionMatrix();
if(hideBoard){shadowPlane=new T.Mesh(new T.PlaneGeometry(Math.max(size.x*4,5000),Math.max(size.z*4,5000)),new T.ShadowMaterial({color:0x62717d,opacity:.16}));shadowPlane.rotation.x=-Math.PI/2;shadowPlane.position.set(center.x,bounds.min.y-1,center.z);shadowPlane.receiveShadow=true;scene.add(shadowPlane);}
renderer.toneMappingExposure=1.06*quality.exposure/.95;renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,cam);
const dataUrl=renderer.domElement.toDataURL('image/png');const labels=[];
for(const it of state.items){
const r=roots.get(it.id);if(!r?.visible||it.showLabel===false)continue;
const b=new T.Box3().setFromObject(r),p=b.getCenter(new T.Vector3()).project(cam);
let screenTop=height,screenLeft=width,screenRight=0,screenBottom=0;
// A world-space top-centre point can still project onto a sloping instrument lid.
// Place editable labels above the complete projected bounding box instead.
for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
const v=new T.Vector3(x,y,z).project(cam);
screenTop=Math.min(screenTop,(-v.y*.5+.5)*height);
screenBottom=Math.max(screenBottom,(-v.y*.5+.5)*height);
screenLeft=Math.min(screenLeft,(v.x*.5+.5)*width);screenRight=Math.max(screenRight,(v.x*.5+.5)*width);
}
if(p.z<1)labels.push({id:it.id,text:it.figureLabel||it.label,x:T.MathUtils.clamp((screenLeft+screenRight)/2,width*.04,width*.96),y:T.MathUtils.clamp(screenTop-width*.009,height*.055,height*.94),box:{left:screenLeft,top:screenTop,right:screenRight,bottom:screenBottom},anchorX:(screenLeft+screenRight)/2,anchorY:screenTop});
}

return {dataUrl,width,height,labels,quality,source:'当前参数化三维模型；无光学数据生成'};
}finally{restoreConnectionColors();if(shadowPlane){scene.remove(shadowPlane);shadowPlane.geometry.dispose();shadowPlane.material.dispose();}scene.background=before.background;renderer.setClearColor(before.clearColor,before.alpha);renderer.toneMappingExposure=before.exposure;board.visible=before.board;floor.visible=before.floor;helperGroup.visible=before.helpers;portTargets.forEach((p,i)=>p.visible=before.ports[i]);renderer.setPixelRatio(before.pixelRatio);renderer.setSize(before.size.x,before.size.y,false);renderer.render(scene,camera);}
}

function boxCorners(T,box){
const points=[];
for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new T.Vector3(x,y,z));
return points;
}

function isVisible(object){
for(let node=object;node;node=node.parent)if(!node.visible)return false;
return true;
}

// Hidden port hit targets are editor aids and must not expand a scientific figure.
function visibleBounds(T,root){
const result=new T.Box3();
root.traverse(object=>{
if(!object.geometry||!isVisible(object))return;
let local;
if(object.isSkinnedMesh||object.isInstancedMesh){
if(object.computeBoundingBox)object.computeBoundingBox();
local=object.boundingBox;
}
if(!local){if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();local=object.geometry.boundingBox;}
if(local&&!local.isEmpty())result.union(local.clone().applyMatrix4(object.matrixWorld));
});
return result;
}

function projectedBox(T,box,camera,width,height){
let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
for(const point of boxCorners(T,box)){
point.project(camera);
const x=(point.x*.5+.5)*width,y=(-point.y*.5+.5)*height;
left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
}
return {left,top,right,bottom};
}

function halton(index,base){
let fraction=1,result=0;
while(index>0){fraction/=base;result+=fraction*(index%base);index=Math.floor(index/base);}
return result;
}

const PUBLICATION_STYLES={
paper:{background:0xffffff,surface:null,environment:.5,sky:0xffffff,ground:0x68727b,ambient:.65,key:0xffffff,keyPower:2.25,fill:0xffffff,fillPower:.78,rim:0xffffff,rimPower:.45,exposure:.98,shadowOpacity:.14,lightSpread:.035},
reference:{background:0xd7d9dc,surface:0x999da2,environment:.52,sky:0xf6f7fa,ground:0x656a73,ambient:.62,key:0xfffaf4,keyPower:2.5,fill:0xe7edf4,fillPower:.78,rim:0xffffff,rimPower:1.1,exposure:1.0},
dark:{background:0x18212b,surface:0x283642,environment:.28,sky:0xddeafa,ground:0x111a24,ambient:.4,key:0xf3f7ff,keyPower:2.75,fill:0xa9c9ed,fillPower:.75,rim:0xe0edff,rimPower:1.8,exposure:.94},
warm:{background:0xeee9e2,surface:0xd4ccbf,environment:.5,sky:0xfff8ef,ground:0x81766b,ambient:.6,key:0xffeddb,keyPower:2.45,fill:0xe4ecf5,fillPower:.72,rim:0xfffcf5,rimPower:.95,exposure:1.02}
};

// A beam may be marked on a parent Group rather than on each core/halo mesh.
// Its emissive, additive and transparent materials must survive capture intact.
function isBeamObject(object){
for(let node=object;node;node=node.parent)if(node.userData?.isBeam)return true;
return false;
}

function preserveReferenceMaterial(object,material){
if(material.userData?.imported||material.userData?.isImported||material.userData?.connectionColor||material.userData?.isBeam)return true;
if(material.transparent||material.transmission>0||Object.values(material).some(value=>value?.isTexture))return true;
const roles=[material.userData?.surfaceRole,object.userData?.surfaceRole];
if(roles.some(role=>/^(glass|coatedGlass|filterGlass|mirror|label|screen|board)$/i.test(role||'')))return true;
return /glass|lens|filter|waveplate|polariz|mirror|reflective_surface|parabolic_surface|grating|label|screen|display|schematic_pixel_array|board|steel_top|25mm_hole_pattern/i.test((object.name||'')+' '+(material.name||''));
}

function layoutAxis(T,centers,bounds){
if(centers.length<2){const size=bounds.getSize(new T.Vector3());return size.z>size.x*1.4?new T.Vector3(0,0,1):new T.Vector3(1,0,0);}
const mean=new T.Vector3();for(const point of centers)mean.add(point);mean.divideScalar(centers.length);
let xx=0,zz=0,xz=0;
for(const point of centers){const x=point.x-mean.x,z=point.z-mean.z;xx+=x*x;zz+=z*z;xz+=x*z;}
const anisotropy=Math.sqrt((xx-zz)**2+4*xz*xz)/Math.max(xx+zz,1e-9);
if(anisotropy<.15)return new T.Vector3(1,0,0);
const angle=.5*Math.atan2(2*xz,xx-zz),axis=new T.Vector3(Math.cos(angle),0,Math.sin(angle));
if(axis.x<-.001||(Math.abs(axis.x)<.001&&axis.z<0))axis.negate();
return axis;
}

// This function intentionally has no await: the application's animation loop
// cannot render an editor frame between the accumulation samples.
function captureNature(api,options){
const {T,renderer,scene,modelGroup,fiberGroup,helperGroup,portTargets,board,floor,camera,controls,state,roots}=api;
const referenceStyle=normalizeReferenceStyle(options.referenceStyle),requestedStyle=options.style||'paper';
if(!Object.prototype.hasOwnProperty.call(PUBLICATION_STYLES,requestedStyle))throw new Error('未知渲染风格：'+requestedStyle);
const style=referenceStyle?'paper':requestedStyle;
const baseLook=referenceStyle?{...PUBLICATION_STYLES.paper,...referenceStyle.lighting,background:parseInt(referenceStyle.background.slice(1),16),shadowOpacity:referenceStyle.shadow.opacity,lightSpread:referenceStyle.shadow.spread}:PUBLICATION_STYLES[style];
const look=publicationAppearance(baseLook,referenceStyle?{...options,useSceneColors:false}:options,state.presentation);const table=resolveTable(options,PUBLICATION_STYLES[style].surface!==null),surfaceColor=look.surface??0xd8dde2;
const quality=normalizeSurfaceQuality(options.quality??state.presentation?.quality);
const width=Math.round(T.MathUtils.clamp(Number(options.width)||4400,4400,8192));
const samples=Math.round(T.MathUtils.clamp(Number(options.samples)||({technical:4,studio:8,cinematic:12}[quality.preset]),1,12));
let height=Math.round(T.MathUtils.clamp(Number(options.height)||2200,200,8192));
const transparent=options.background==='transparent'||(options.background!=='white'&&options.transparent!==false),hideBoard=table!=='board';
const before={
size:renderer.getSize(new T.Vector2()),pixelRatio:renderer.getPixelRatio(),
background:scene.background,environmentIntensity:scene.environmentIntensity,
clearColor:renderer.getClearColor(new T.Color()),alpha:renderer.getClearAlpha(),
target:renderer.getRenderTarget(),cubeFace:renderer.getActiveCubeFace?.()||0,mipmap:renderer.getActiveMipmapLevel?.()||0,
viewport:renderer.getViewport(new T.Vector4()),scissor:renderer.getScissor(new T.Vector4()),scissorTest:renderer.getScissorTest(),
exposure:renderer.toneMappingExposure,toneMapping:renderer.toneMapping,colorSpace:renderer.outputColorSpace,
autoClear:renderer.autoClear,autoClearColor:renderer.autoClearColor,autoClearDepth:renderer.autoClearDepth,autoClearStencil:renderer.autoClearStencil,
shadow:{enabled:renderer.shadowMap.enabled,type:renderer.shadowMap.type,autoUpdate:renderer.shadowMap.autoUpdate,needsUpdate:renderer.shadowMap.needsUpdate},
board:board.visible,floor:floor.visible,helpers:helperGroup.visible,ports:portTargets.map(p=>p.visible)
};
const changedMaterials=[],clones=new Map(),oldLights=[];
let shadowPlane,lights,captureCamera,accumulationCanvas,cropCanvas,restoreConnectionColors=()=>{};
try{
if(options.preserveConnectionColors!==false){
  const restorers=[];restoreConnectionColors=()=>{for(const restore of restorers.reverse())restore();};
  restorers.push(preserveConnectionColors(T,modelGroup));restorers.push(preserveConnectionColors(T,fiberGroup));
}
board.visible=!hideBoard;floor.visible=false;helperGroup.visible=false;portTargets.forEach(p=>p.visible=false);
scene.background=transparent?null:new T.Color(look.background);scene.environmentIntensity=look.environment;
renderer.setRenderTarget(null);renderer.setClearColor(look.background,transparent?0:1);
scene.updateMatrixWorld(true);
const bounds=new T.Box3(),itemBounds=new Map(),centers=[],points=[];
const include=box=>{if(box.isEmpty())return;bounds.union(box);points.push(...boxCorners(T,box));};
for(const item of state.items){
const root=roots.get(item.id);if(!root||!isVisible(root))continue;
const box=visibleBounds(T,root);if(box.isEmpty())continue;
itemBounds.set(item.id,box);centers.push(box.getCenter(new T.Vector3()));include(box);
}
for(const child of fiberGroup.children)if(isVisible(child))include(visibleBounds(T,child));
if(!hideBoard)include(visibleBounds(T,board));
if(bounds.isEmpty())include(new T.Box3(new T.Vector3(-300,0,-150),new T.Vector3(300,100,150)));
// The coloured table is real scene geometry and receives instrument shadows.
// Keep it finite so transparent exports retain an alpha region around the table.
let surfaceBox=null;
if(table==='surface'){
const apparatusSize=bounds.getSize(new T.Vector3()),padding=Math.max(Math.max(apparatusSize.x,apparatusSize.z)*.07,45),surfaceY=bounds.min.y-.65;
surfaceBox=new T.Box3(new T.Vector3(bounds.min.x-padding,surfaceY-6,bounds.min.z-padding),new T.Vector3(bounds.max.x+padding,surfaceY,bounds.max.z+padding));
include(surfaceBox);
}
const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
const span=Math.max(size.x,size.y,size.z,150),worldUp=new T.Vector3(0,1,0),major=layoutAxis(T,centers,bounds);
const view=options.view||'auto';
const paperAutoView=style==='paper'&&view==='auto';
const alongAxis=referenceStyle&&view==='auto'?referenceStyle.camera.alongAxis:paperAutoView ? .28 : .10;
const direction=new T.Vector3().crossVectors(major,worldUp).addScaledVector(major,alongAxis);
direction.y=referenceStyle&&view==='auto'?direction.length()*Math.tan(T.MathUtils.degToRad(referenceStyle.camera.elevationDeg)):paperAutoView ? .6 : .47;direction.normalize();
if(view==='editor')direction.copy(camera.position).sub(controls.target).normalize();
if(view==='front')direction.set(.06,.22,1).normalize();
if(view==='top')direction.set(0,1,.001).normalize();
if(view==='iso')direction.set(.35,.7,1).normalize();
if(direction.lengthSq()<.9)direction.set(.1,.47,1).normalize();
const right=new T.Vector3().crossVectors(worldUp,direction);
if(right.lengthSq()<1e-10)right.set(1,0,0);else right.normalize();
const up=new T.Vector3().crossVectors(direction,right).normalize();
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
for(const point of points){const relative=point.clone().sub(center),x=relative.dot(right),y=relative.dot(up);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
const target=center.clone().addScaledVector(right,(minX+maxX)/2).addScaledVector(up,(minY+maxY)/2);
const halfX=Math.max((maxX-minX)*.5*1.10,50),halfY=Math.max((maxY-minY)*.5*1.16+span*.014,45);
if(options.autoHeight!==false)height=Math.round(T.MathUtils.clamp(width*halfY/halfX,width/4.8,Math.min(8192,width*1.25)));
const aspect=width/height,halfH=Math.max(halfY,halfX/aspect),halfW=halfH*aspect;
let distance=Math.max(size.length()*3,1000);
if(options.projection==='perspective'){
captureCamera=new T.PerspectiveCamera(40,aspect,1,Math.max(40000,span*20));
const tanVertical=Math.tan(T.MathUtils.degToRad(captureCamera.fov*.5)),tanHorizontal=tanVertical*aspect;
// Fit each point at its own depth so the nearer geometry remains inside the frame.
distance=150;
for(const point of points){
const relative=point.clone().sub(target),depth=relative.dot(direction);
distance=Math.max(distance,depth+Math.abs(relative.dot(right))*1.10/tanHorizontal,depth+(Math.abs(relative.dot(up))*1.16+span*.014)/tanVertical);
}
distance+=Math.max(10,span*.025);
}else captureCamera=new T.OrthographicCamera(-halfW,halfW,halfH,-halfH,1,Math.max(40000,span*20));
captureCamera.position.copy(target).addScaledVector(direction,distance);captureCamera.up.copy(up);captureCamera.lookAt(target);captureCamera.updateMatrixWorld(true);captureCamera.updateProjectionMatrix();

// Generic assets can receive presentation-only finish changes. Imported GLB
// materials are excluded, even when a material happens to be shared elsewhere.
const protectedMaterials=new Set();
const customTypes=new Set(Array.isArray(state.custom)?state.custom.map(entry=>entry.id||entry.type):Object.keys(state.custom||{}));
for(const item of state.items){const root=roots.get(item.id);if(root&&(root.userData.imported||root.userData.isImported||customTypes.has(item.type)))root.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)protectedMaterials.add(material);});}
if(referenceStyle)modelGroup.traverse(object=>{if(object.userData?.imported||object.userData?.isImported)object.traverse(child=>{for(const material of Array.isArray(child.material)?child.material:[child.material])if(material)protectedMaterials.add(material);});});
const enhance=(root,isFiber)=>root?.traverse(object=>{
if(!object.isMesh||!object.material||isBeamObject(object))return;
const originals=Array.isArray(object.material)?object.material:[object.material];
const replacements=originals.map(material=>{
if(protectedMaterials.has(material)||(!material.isMeshStandardMaterial&&!material.isMeshPhysicalMaterial))return material;
if(referenceStyle&&preserveReferenceMaterial(object,material))return material;
const key=`${material.uuid}:${isFiber?'fiber':'model'}`;
if(!clones.has(key)){
const replacement=material.clone();
// Surface-quality settings are already baked into generic materials. Preserve
// their finish and all glass transmission/opacity/depth settings in capture.
if(referenceStyle){replacement.roughness=Math.max(replacement.roughness,referenceStyle.material.roughnessFloor);replacement.metalness=Math.min(replacement.metalness,referenceStyle.material.metalnessCeiling);if(replacement.clearcoat!==undefined)replacement.clearcoat=Math.min(replacement.clearcoat,referenceStyle.material.clearcoatCeiling);}
else if(material.userData?.surfaceQuality||(material.isMeshPhysicalMaterial&&(material.transmission>0||material.transparent&&material.opacity<1))){}
else if(isFiber){replacement.roughness=.5;replacement.metalness=Math.min(replacement.metalness,.05);}
else if(material.name==='editable_housing'){replacement.roughness=T.MathUtils.clamp(replacement.roughness,.32,.46);replacement.metalness=Math.min(replacement.metalness,.55);}
else if(!material.map&&replacement.metalness>.25)replacement.roughness=T.MathUtils.clamp(replacement.roughness,.24,.4);
clones.set(key,replacement);
}
return clones.get(key);
});
if(replacements.some((material,index)=>material!==originals[index])){changedMaterials.push([object,object.material]);object.material=Array.isArray(object.material)?replacements:replacements[0];}
});
enhance(modelGroup,false);enhance(fiberGroup,true);
if(!hideBoard){board.traverse(object=>{if(!['breadboard_body','steel_top','25mm_hole_pattern'].includes(object.name)||!object.material?.color)return;const original=object.material,replacement=original.clone();const base={breadboard_body:0xaeb6bd,steel_top:0xc2c9cd,'25mm_hole_pattern':0xffffff};replacement.color.set(look.tableColor||base[object.name]);changedMaterials.push([object,original]);clones.set('table:'+object.uuid,replacement);object.material=replacement;});}

scene.traverse(object=>{if(object.isLight&&!isBeamObject(object)){oldLights.push([object,object.visible]);object.visible=false;}});
lights=new T.Group();lights.name='temporary_publication_lighting';scene.add(lights);
lights.add(new T.HemisphereLight(look.sky,look.ground,look.ambient));
const horizontal=direction.clone();horizontal.y=0;horizontal.normalize();
const key=new T.DirectionalLight(look.key,look.keyPower),fill=new T.DirectionalLight(look.fill,look.fillPower),rim=new T.DirectionalLight(look.rim,look.rimPower);
const keyBase=center.clone().addScaledVector(right,-span*.55).addScaledVector(horizontal,span*.66).addScaledVector(worldUp,span*1.18);
key.position.copy(keyBase);fill.position.copy(center).addScaledVector(right,span*.9).addScaledVector(horizontal,span*.25).addScaledVector(worldUp,span*.5);
rim.position.copy(center).addScaledVector(horizontal,-span*.75).addScaledVector(worldUp,span*.95);
for(const light of [key,fill,rim]){light.target.position.copy(center);lights.add(light,light.target);}
key.castShadow=true;const shadowResolution=Math.min(4096,renderer.capabilities.maxTextureSize||4096);key.shadow.mapSize.set(shadowResolution,shadowResolution);key.shadow.bias=-.000035;key.shadow.normalBias=.18;key.shadow.radius=2;
const lightDirection=keyBase.clone().sub(center).normalize(),lightRight=new T.Vector3().crossVectors(worldUp,lightDirection).normalize(),lightUp=new T.Vector3().crossVectors(lightDirection,lightRight).normalize();
let shadowMinX=Infinity,shadowMaxX=-Infinity,shadowMinY=Infinity,shadowMaxY=-Infinity;
for(const point of points){const relative=point.clone().sub(center),x=relative.dot(lightRight),y=relative.dot(lightUp);shadowMinX=Math.min(shadowMinX,x);shadowMaxX=Math.max(shadowMaxX,x);shadowMinY=Math.min(shadowMinY,y);shadowMaxY=Math.max(shadowMaxY,y);}
Object.assign(key.shadow.camera,{left:shadowMinX-span*.075,right:shadowMaxX+span*.075,bottom:shadowMinY-span*.075,top:shadowMaxY+span*.075,near:1,far:span*6});key.shadow.camera.updateProjectionMatrix();
if(hideBoard){
if(surfaceBox){
const surfaceSize=surfaceBox.getSize(new T.Vector3());
shadowPlane=new T.Mesh(new T.BoxGeometry(surfaceSize.x,surfaceSize.y,surfaceSize.z),new T.MeshStandardMaterial({color:surfaceColor,roughness:.82,metalness:.12}));
shadowPlane.position.copy(surfaceBox.getCenter(new T.Vector3()));shadowPlane.name='temporary_publication_surface';
}else{
shadowPlane=new T.Mesh(new T.PlaneGeometry(Math.max(size.x*4,5000),Math.max(size.z*4,5000)),new T.ShadowMaterial({color:0x435361,opacity:look.shadowOpacity??.23}));
shadowPlane.rotation.x=-Math.PI/2;shadowPlane.position.set(center.x,bounds.min.y-.6,center.z);
}
shadowPlane.receiveShadow=true;scene.add(shadowPlane);
}
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=true;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=look.exposure*quality.exposure/.95;renderer.outputColorSpace=T.SRGBColorSpace;
renderer.autoClear=renderer.autoClearColor=renderer.autoClearDepth=renderer.autoClearStencil=true;
renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.setViewport(0,0,width,height);renderer.setScissorTest(false);
const canvas=accumulationCanvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
const context=canvas.getContext('2d');if(!context)throw new Error('无法创建出版图像合成画布');
context.globalCompositeOperation='lighter';context.globalAlpha=1/samples;
const lightDirections=[];
for(let sample=0;sample<samples;sample++){
const angle=sample*2.399963229728653,radius=samples===1?0:Math.sqrt((sample+.5)/samples)*span*(look.lightSpread??.027);
key.position.copy(keyBase).addScaledVector(lightRight,Math.cos(angle)*radius).addScaledVector(lightUp,Math.sin(angle)*radius);
if(options.tightFrame===true)lightDirections.push(center.clone().sub(key.position).normalize());
if(samples>1)captureCamera.setViewOffset(width,height,halton(sample+1,2)-.5,halton(sample+1,3)-.5,width,height);
key.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;renderer.render(scene,captureCamera);
context.drawImage(renderer.domElement,0,0,width,height);
}
captureCamera.clearViewOffset();captureCamera.updateProjectionMatrix();
let labels=[];
for(const item of state.items){
const box=itemBounds.get(item.id);if(!box||item.showLabel===false)continue;
const projected=projectedBox(T,box,captureCamera,width,height),anchorX=(projected.left+projected.right)/2,anchorY=projected.top;
if(box.getCenter(new T.Vector3()).project(captureCamera).z>=1)continue;
labels.push({id:item.id,text:item.figureLabel||item.label,x:T.MathUtils.clamp(anchorX,width*.04,width*.96),y:T.MathUtils.clamp(anchorY-width*.009,height*.055,height*.94),box:projected,anchorX,anchorY});
}
let outputCanvas=canvas,outputWidth=width,outputHeight=height,framing;
if(options.tightFrame===true){
const receiverBounds=surfaceBox||(!hideBoard?visibleBounds(T,board):null);
const receiverY=receiverBounds?receiverBounds.max.y:bounds.min.y-.6;
framing=projectedRenderFraming(T,points,captureCamera,width,height,{shadowReceiver:{y:receiverY,bounds:receiverBounds},lightDirections});
if(framing.applied){
cropCanvas=document.createElement('canvas');cropCanvas.width=framing.width;cropCanvas.height=framing.height;
const cropContext=cropCanvas.getContext('2d');if(!cropContext)throw new Error('无法创建紧凑取景画布');
cropContext.drawImage(canvas,framing.left,framing.top,framing.width,framing.height,0,0,framing.width,framing.height);
outputCanvas=cropCanvas;outputWidth=framing.width;outputHeight=framing.height;labels=frameRenderLabels(labels,framing);
}
}
return {dataUrl:outputCanvas.toDataURL('image/png'),width:outputWidth,height:outputHeight,labels,quality,style,...(referenceStyle?{referenceStyle}:{}),background:transparent?'transparent':'white',backgroundColor:'#'+look.background.toString(16).padStart(6,'0'),table,tableColor:look.tableColor||(table==='board'?'#bfc5ca':'#'+surfaceColor.toString(16).padStart(6,'0')),surface:table==='board'?'optical-breadboard':table==='surface'?'matte-table':'shadow-only',source:'当前参数化三维模型；科学示意渲染；无光学数据生成',bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),units:'mm'},projection:{type:captureCamera.isOrthographicCamera?'orthographic':'perspective',fov:captureCamera.isPerspectiveCamera?captureCamera.fov:null,view,principalAxis:major.toArray(),cameraPosition:captureCamera.position.toArray(),target:target.toArray(),up:up.toArray(),samples,...(framing?{framing}:{})}};
}finally{
if(cropCanvas)cropCanvas.width=cropCanvas.height=1;
if(accumulationCanvas)accumulationCanvas.width=accumulationCanvas.height=1;
restoreConnectionColors();
for(const [object,material] of changedMaterials)object.material=material;
for(const material of clones.values())material.dispose();
if(shadowPlane){scene.remove(shadowPlane);shadowPlane.geometry.dispose();shadowPlane.material.dispose();}
if(lights){scene.remove(lights);lights.traverse(object=>{if(object.isLight)object.dispose?.();});}
for(const [light,visible] of oldLights)light.visible=visible;
scene.background=before.background;scene.environmentIntensity=before.environmentIntensity;
board.visible=before.board;floor.visible=before.floor;helperGroup.visible=before.helpers;portTargets.forEach((port,index)=>port.visible=before.ports[index]);
renderer.setClearColor(before.clearColor,before.alpha);renderer.toneMappingExposure=before.exposure;renderer.toneMapping=before.toneMapping;renderer.outputColorSpace=before.colorSpace;
renderer.autoClear=before.autoClear;renderer.autoClearColor=before.autoClearColor;renderer.autoClearDepth=before.autoClearDepth;renderer.autoClearStencil=before.autoClearStencil;
Object.assign(renderer.shadowMap,before.shadow);
renderer.setPixelRatio(before.pixelRatio);renderer.setSize(before.size.x,before.size.y,false);
renderer.setRenderTarget(before.target,before.cubeFace,before.mipmap);renderer.setViewport(before.viewport);renderer.setScissor(before.scissor);renderer.setScissorTest(before.scissorTest);
// Redraw only the ordinary screen framebuffer, leaving a caller's active
// offscreen render target untouched. Reapply flags altered by the redraw.
if(!before.target)renderer.render(scene,camera);
renderer.shadowMap.needsUpdate=before.shadow.needsUpdate;
}
}
