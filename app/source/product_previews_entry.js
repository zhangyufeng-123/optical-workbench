import * as T from '../vendor/package/build/three.module.js';
import {GLTFLoader} from '../vendor/package/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from '../vendor/package/examples/jsm/environments/RoomEnvironment.js';
import {embeddedOpticalPorts} from './imported-ports.js';

const renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setSize(1800,1200);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
document.body.style.margin='0';document.body.append(renderer.domElement);
const environment=new T.PMREMGenerator(renderer).fromScene(new RoomEnvironment(),.04).texture;

window.renderProductGLB=async(base64,closeup=false)=>{
  const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer,'');
  const model=gltf.scene,units=model.userData.opticalWorkbenchUnits;
  if(units!=='m')throw new Error('Expected standard metre GLB scene');
  const nativeBounds=new T.Box3().setFromObject(model),nativeSize=nativeBounds.getSize(new T.Vector3());
  model.scale.multiplyScalar(1000);model.updateMatrixWorld(true);
  const ports=embeddedOpticalPorts(T,model),bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());
  const offset=new T.Vector3(bounds.getCenter(new T.Vector3()).x,bounds.min.y,bounds.getCenter(new T.Vector3()).z);model.position.sub(offset);model.updateMatrixWorld(true);
  model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
  const scene=new T.Scene();scene.background=new T.Color('#ffffff');scene.environment=environment;scene.environmentIntensity=1.15;scene.add(model);
  const key=new T.DirectionalLight('#ffffff',3.2);key.position.set(-180,360,240);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.normalBias=.15;key.shadow.bias=-.00008;key.shadow.camera.left=-400;key.shadow.camera.right=400;key.shadow.camera.top=400;key.shadow.camera.bottom=-400;key.shadow.camera.near=1;key.shadow.camera.far=1500;key.shadow.radius=3;scene.add(key);
  const fill=new T.DirectionalLight('#dfe9f0',1.35);fill.position.set(220,170,-220);scene.add(fill);
  const ground=new T.Mesh(new T.PlaneGeometry(2000,2000),new T.ShadowMaterial({opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.5;ground.receiveShadow=true;scene.add(ground);
  const camera=new T.PerspectiveCamera(34,1.5,.1,5000);
  let framing=new T.Box3().setFromObject(model),direction=new T.Vector3(1,.8,1.7).normalize();
  if(closeup){
    const coil=model.getObjectByName('helical_fiber_sample');if(!coil)throw new Error('Missing helical fiber mesh');
    framing=new T.Box3().setFromObject(coil).expandByScalar(14);direction=new T.Vector3(.4,.8,1.8).normalize();
  }
  const target=framing.getCenter(new T.Vector3()),span=framing.getSize(new T.Vector3()),distance=Math.max(span.y,span.x/camera.aspect,span.z*.8)/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.6;
  camera.position.copy(target).addScaledVector(direction,distance);camera.lookAt(target);camera.updateMatrixWorld(true);
  renderer.render(scene,camera);renderer.render(scene,camera);
  const png=renderer.domElement.toDataURL('image/png'),metadata=[];let meshes=0,triangles=0;
  model.traverse(node=>{if(node.userData.metadata)metadata.push(node.userData.metadata);if(node.isMesh){meshes++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;}});
  const report={units,nativeSizeM:nativeSize.toArray(),sizeMM:size.toArray(),ports,metadata,meshes,triangles,closeup};
  model.traverse(node=>{node.geometry?.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)material.dispose();});ground.geometry.dispose();ground.material.dispose();
  return {png,report};
};
