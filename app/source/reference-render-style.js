const DEFAULTS={
  version:1,
  background:'#ffffff',
  camera:{alongAxis:.28,elevationDeg:30},
  lighting:{environment:.5,ambient:.65,keyPower:2.25,fillPower:.78,rimPower:.45},
  shadow:{opacity:.14,spread:.035},
  material:{roughnessFloor:.42,metalnessCeiling:.55,clearcoatCeiling:.1}
};
const LIMITS={
  camera:{alongAxis:[-1,1],elevationDeg:[5,85]},
  lighting:{environment:[0,2],ambient:[0,2],keyPower:[0,5],fillPower:[0,3],rimPower:[0,3]},
  shadow:{opacity:[0,.5],spread:[0,.08]},
  material:{roughnessFloor:[.15,1],metalnessCeiling:[0,1],clearcoatCeiling:[0,1]}
};

function validateObject(value,allowed,name){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(name+'须为对象');
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)throw new Error(name+'须为普通对象');
  if(Reflect.ownKeys(value).some(key=>typeof key!=='string'||!Object.hasOwn(allowed,key)))throw new Error(name+'包含未知字段');
}

export function normalizeReferenceStyle(value){
  if(value==null)return null;
  validateObject(value,DEFAULTS,'文献渲染参数');
  if(Object.hasOwn(value,'version')&&value.version!==1)throw new Error('未知文献渲染参数版本');
  const background=Object.hasOwn(value,'background')?value.background:DEFAULTS.background;
  if(typeof background!=='string'||!/^#[0-9a-f]{6}$/i.test(background))throw new Error('文献渲染背景须为六位十六进制颜色');
  const result={version:1,background:background.toLowerCase()};
  for(const [group,limits] of Object.entries(LIMITS)){
    const settings=Object.hasOwn(value,group)?value[group]:{};
    validateObject(settings,limits,'文献渲染参数 '+group);
    result[group]={...DEFAULTS[group],...settings};
    for(const [key,[min,max]] of Object.entries(limits)){
      const number=result[group][key];
      if(!Number.isFinite(number)||number<min||number>max)throw new Error('文献渲染参数 '+group+'.'+key+' 超出允许范围');
    }
  }
  return result;
}
