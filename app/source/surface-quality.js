import * as T from '../vendor/package/build/three.module.js';

// These settings tune illustration materials, not measured optical constants.
export const SURFACE_PRESETS=Object.freeze({
  technical:Object.freeze({preset:'technical',glassClarity:.72,metalRoughness:.46,beamSoftness:.25,exposure:.92}),
  studio:Object.freeze({preset:'studio',glassClarity:.88,metalRoughness:.34,beamSoftness:.6,exposure:.95}),
  cinematic:Object.freeze({preset:'cinematic',glassClarity:.94,metalRoughness:.28,beamSoftness:.8,exposure:1.03})
});
const LIMITS={glassClarity:[0,1],metalRoughness:[.15,.8],beamSoftness:[0,1],exposure:[.5,1.5]};
export function normalizeSurfaceQuality(value){
  if(value==null)return {...SURFACE_PRESETS.studio};
  if(typeof value!=='object'||Array.isArray(value))throw new Error('材质设置须为对象');
  const preset=value.preset??'studio';
  if(!Object.hasOwn(SURFACE_PRESETS,preset))throw new Error('未知材质预设');
  if(Object.keys(value).some(key=>key!=='preset'&&!Object.hasOwn(LIMITS,key)))throw new Error('材质设置包含未知字段');
  const result={...SURFACE_PRESETS[preset],...value,preset};
  for(const [name,[min,max]] of Object.entries(LIMITS))if(!Number.isFinite(result[name])||result[name]<min||result[name]>max)throw new Error(name+'超出允许范围');
  return result;
}
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const BASE_FIELDS=['roughness','metalness','opacity','transparent','depthWrite','transmission','thickness','ior','envMapIntensity'];
function baseProperties(material){
  if(material.userData?.surfaceBase)return {...material.userData.surfaceBase};
  return Object.fromEntries(BASE_FIELDS.filter(name=>material[name]!==undefined).map(name=>[name,material[name]]));
}
function materialRole(material,object){
  if(material.name==='editable_housing')return 'housing';
  if(['breadboard_body','steel_top','25mm_hole_pattern'].includes(object.name))return 'board';
  if(object.name?.startsWith('panel_label_'))return 'label';
  if(object.name?.endsWith('_schematic_pixel_array'))return 'screen';
  if(material.userData?.surfaceRole)return material.userData.surfaceRole;
  if(/reflective_surface|parabolic_surface|return_mirror|grating_substrate/.test(object.name||''))return 'mirror';
  if(material.transmission>0||material.transparent&&material.opacity<1)return 'glass';
  if(material.map)return 'label';
  return material.metalness>=.6?'metal':'paint';
}
function physicalClone(material,physical){
  if(!physical||material.isMeshPhysicalMaterial)return material.clone();
  const result=new T.MeshPhysicalMaterial();
  // MeshPhysicalMaterial.copy expects a physical source. Copy only the common
  // standard fields when upgrading a standard material, retaining PBR defaults.
  T.MeshStandardMaterial.prototype.copy.call(result,material);
  result.defines={STANDARD:'',PHYSICAL:''};
  return result;
}
function finishMaterial(original,role,settings){
  const rich=settings.preset!=='technical',isGlass=['glass','coatedGlass','filterGlass'].includes(role);
  const material=physicalClone(original,rich&&['housing','anodized','metal','mirror','board',...['glass','coatedGlass','filterGlass']].includes(role));
  const base=baseProperties(original),quality={...settings};
  material.userData={...material.userData,shared:false,surfaceRole:role,surfaceQuality:quality,surfaceBase:base};
  material.name=original.name;
  material.depthTest=true;
  if(isGlass){
    material.metalness=0;
    material.roughness=.035+(1-settings.glassClarity)*.17+(role==='filterGlass'?.045:0);
    material.ior=Number.isFinite(base.ior)&&base.ior>=1?base.ior:1.46;
    material.thickness=Number.isFinite(base.thickness)&&base.thickness>0?base.thickness:4;
    material.envMapIntensity=rich?1.08:.8;
    if(rich){
      material.transmission=clamp((role==='filterGlass'?.24:role==='coatedGlass'?.58:.68)+settings.glassClarity*(role==='filterGlass'?.36:role==='coatedGlass'?.28:.29),0,.98);
      // Transmission is already the transparency mechanism. Alpha must remain
      // one to avoid a second washout and incorrect opaque-surface blending.
      material.opacity=1;material.transparent=false;material.depthWrite=true;
      material.clearcoat=role==='coatedGlass'?.2:.08;material.clearcoatRoughness=.08;material.specularIntensity=1;
    }else{
      material.transmission=0;material.opacity=clamp((role==='filterGlass'?.66:.35)+(1-settings.glassClarity)*.25,.3,.92);
      material.transparent=true;material.depthWrite=false;
      if(material.isMeshPhysicalMaterial){material.clearcoat=0;material.iridescence=0;material.anisotropy=0;}
    }
    material.side=T.DoubleSide;
  }else if(role==='mirror'){
    material.metalness=.98;material.roughness=clamp(settings.metalRoughness*.2,.035,.13);material.envMapIntensity=rich?1.16:1;
    material.opacity=1;material.transparent=false;material.depthWrite=true;
    if(material.isMeshPhysicalMaterial){material.clearcoat=.1;material.clearcoatRoughness=.045;material.anisotropy=0;}
  }else if(role==='metal'||role==='board'){
    material.metalness=role==='board'?clamp(base.metalness??.65,.45,.8):clamp(base.metalness??.85,.72,.94);
    material.roughness=clamp(settings.metalRoughness+(role==='board'?.14:0),.15,.8);material.envMapIntensity=role==='board'?.72:.95;
    material.opacity=1;material.transparent=false;material.depthWrite=true;
    if(material.isMeshPhysicalMaterial){material.clearcoat=0;material.anisotropy=role==='board'?.08:settings.preset==='cinematic'?.34:.18;material.anisotropyRotation=0;}
  }else if(role==='housing'||role==='anodized'){
    material.metalness=role==='housing'?.4:.46;material.roughness=clamp(settings.metalRoughness+.12,.31,.78);material.envMapIntensity=.72;
    material.opacity=1;material.transparent=false;material.depthWrite=true;
    if(material.isMeshPhysicalMaterial){material.clearcoat=rich?.1:0;material.clearcoatRoughness=.34;material.anisotropy=0;}
  }else if(role==='rubber'){
    material.metalness=0;material.roughness=.84;material.envMapIntensity=.5;
  }else if(role==='screen'){
    material.roughness=.22;material.metalness=.3;material.envMapIntensity=.72;
  }else if(role==='label'){
    material.roughness=.66;material.metalness=0;material.envMapIntensity=.6;
  }else{
    material.roughness=clamp(base.roughness??.5,.42,.8);material.metalness=Math.min(base.metalness??0,.15);
  }
  material.needsUpdate=true;
  return material;
}

/** Clone finishes per model/role. Geometry, texture maps and semantic colors stay unchanged. */
export function qualityMaterials(root,value){
  const settings=normalizeSurfaceQuality(value),cache=new Map(),retired=new Set();
  const walk=object=>{
    if(object.userData?.imported||object.userData?.isImported||object.userData?.isBeam)return;
    if(object.isMesh&&object.material){
      const convert=original=>{
        if(!original?.isMeshStandardMaterial||original.userData?.imported||original.userData?.isBeam)return original;
        const role=materialRole(original,object);let roles=cache.get(original);if(!roles){roles=new Map();cache.set(original,roles);}
        if(!roles.has(role))roles.set(role,finishMaterial(original,role,settings));
        if(!original.userData?.shared)retired.add(original);
        return roles.get(role);
      };
      object.material=Array.isArray(object.material)?object.material.map(convert):convert(object.material);
    }
    for(const child of object.children||[])walk(child);
  };
  if(root){
    walk(root);
    // Dispose only superseded, instance-owned material programs. Their texture
    // objects are shared with the replacement and must remain available.
    const inUse=new Set();root.traverse?.(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)inUse.add(material);});
    for(const material of retired)if(!inUse.has(material))material.dispose();
  }
  return root;
}
