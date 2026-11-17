import * as T from '../vendor/package/build/three.module.js';
import {GLTFLoader} from '../vendor/package/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from '../vendor/package/examples/jsm/controls/OrbitControls.js';

function disposeModel(root){
  const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set();
  root?.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    if(object.skeleton)skeletons.add(object.skeleton);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material)continue;materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  for(const texture of textures){texture.dispose();texture.source?.data?.close?.();}
  for(const material of materials)material.dispose();
  for(const geometry of geometries)geometry.dispose();
  for(const skeleton of skeletons)skeleton.dispose();
}

export function createAIModelPreview(mount){
  const renderer=new T.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor('#edf2f5');
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
  renderer.domElement.setAttribute('aria-label','AI 生成器件三维预览，可拖动旋转和滚轮缩放');renderer.domElement.setAttribute('role','img');mount.append(renderer.domElement);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.01,100000),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=false;controls.screenSpacePanning=true;
  scene.add(new T.HemisphereLight(0xf5f9ff,0x667380,2.2));
  const key=new T.DirectionalLight(0xffffff,2.5);key.position.set(-3,5,6);scene.add(key);
  const fill=new T.DirectionalLight(0xdceafa,1.3);fill.position.set(4,2,-3);scene.add(fill);
  const holder=new T.Group();scene.add(holder);
  let model=null,nativeLongest=1,generation=0,destroyed=false,metrics=null,frame=null;
  function render(){if(!destroyed)renderer.render(scene,camera);}
  function resize(){
    if(destroyed)return;
    const width=Math.max(1,Math.round(mount.clientWidth||320)),height=Math.max(1,Math.round(mount.clientHeight||230));
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();render();
  }
  function fit(){
    if(!model)return;
    holder.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(holder),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    const radius=Math.max(size.length()*.5,.01),distance=radius/Math.sin(T.MathUtils.degToRad(camera.fov*.5))*1.25;
    camera.near=Math.max(.001,distance/10000);camera.far=Math.max(1000,distance*30);camera.position.copy(center).add(new T.Vector3(.8,.55,1).normalize().multiplyScalar(distance));
    controls.target.copy(center);controls.minDistance=radius*.15;controls.maxDistance=distance*10;camera.updateProjectionMatrix();controls.update();render();
  }
  function calibrate({longestMM=160,rotation=0}={},refit=false){
    if(!model)return null;
    holder.scale.setScalar(longestMM/nativeLongest);holder.rotation.y=T.MathUtils.degToRad(rotation);holder.updateMatrixWorld(true);
    if(refit)fit();else render();return metrics;
  }
  function clear(){
    generation++;if(model){holder.remove(model);disposeModel(model);model=null;}metrics=null;holder.scale.setScalar(1);holder.rotation.set(0,0,0);render();
  }
  async function load(buffer,calibration={}){
    clear();const request=generation,gltf=await new GLTFLoader().parseAsync(buffer,'');
    if(destroyed||request!==generation){disposeModel(gltf.scene);return null;}
    const candidate=gltf.scene;candidate.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(candidate),size=bounds.getSize(new T.Vector3());
    nativeLongest=Math.max(size.x,size.y,size.z);
    if(!Number.isFinite(nativeLongest)||nativeLongest<=0){disposeModel(candidate);throw new Error('生成的 GLB 没有可预览的几何');}
    candidate.position.sub(bounds.getCenter(new T.Vector3()));model=candidate;holder.add(model);
    const textures=new Set();let triangles=0;
    model.traverse(object=>{
      if(object.isMesh&&object.geometry)triangles+=(object.geometry.index?.count||object.geometry.attributes.position?.count||0)/3*(object.isInstancedMesh?object.count:1);
      for(const material of Array.isArray(object.material)?object.material:[object.material])for(const value of Object.values(material||{}))if(value?.isTexture)textures.add(value);
    });
    const units=candidate.userData.opticalWorkbenchUnits,importLongestMM=units==='m'?nativeLongest*1000:units==='mm'?nativeLongest:160;
    metrics={nativeSize:size.toArray(),importLongestMM,triangles:Math.round(triangles),textures:textures.size};calibrate(calibration,true);resize();return metrics;
  }
  controls.addEventListener('change',render);const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
    if(frame!==null)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=null;resize();});
  }):null;observer?.observe(mount);resize();
  return {load,calibrate,clear,resize,fit,destroy(){
    if(destroyed)return;clear();destroyed=true;generation++;observer?.disconnect();if(frame!==null)cancelAnimationFrame(frame);controls.removeEventListener('change',render);controls.dispose();
    renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
  }};
}
