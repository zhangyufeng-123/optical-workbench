import {normalizeSurfaceQuality,SURFACE_PRESETS} from './surface-quality.js';

const PRESET_LABELS={technical:['技术示意','低反光，清楚表达结构'],studio:['精致材质','通透玻璃，柔和金属'],cinematic:['展示质感','更细腻的高光与光晕']};
const FIELDS=[['glassClarity','玻璃通透',0,1,.01],['metalRoughness','金属粗糙度',.15,.8,.01],['beamSoftness','光束柔光',0,1,.01],['exposure','曝光',.5,1.5,.01]];
const copy=value=>structuredClone(value),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function installQualityStudio(api){
  let launcher=document.getElementById('qualityStudio');
  if(!launcher){launcher=document.createElement('button');launcher.id='qualityStudio';launcher.type='button';launcher.textContent='材质与光照';launcher.title='调整玻璃、金属、光束与曝光';(document.querySelector('.workspace-tabs')||document.body).append(launcher);}
  const dialog=document.createElement('dialog');dialog.id='qualityDialog';dialog.className='quality-dialog';dialog.setAttribute('aria-label','材质与光照');
  dialog.innerHTML=`<header class="quality-head"><div><h2>材质与光照</h2><p>让透明器件、金属和光束具有清晰层次</p></div><button data-quality="close" aria-label="关闭材质窗口">返回搭建台</button></header>
  <div class="quality-body"><div class="quality-presets" role="group" aria-label="材质预设">${Object.entries(PRESET_LABELS).map(([id,[name,note]])=>`<button type="button" data-quality-preset="${id}" aria-pressed="false"><span class="quality-swatch quality-swatch-${id}" aria-hidden="true"><i></i><i></i></span><b>${name}</b><small>${note}</small></button>`).join('')}</div>
  <div class="quality-controls">${FIELDS.map(([id,name,min,max,step])=>`<label class="quality-field"><span>${name}<output data-quality-value="${id}"></output></span><input type="range" data-quality-field="${id}" min="${min}" max="${max}" step="${step}" aria-label="${name}"></label>`).join('')}</div>
  <p class="quality-note">作用于通用库件与实验桌，自有 GLB 保留原材质。光晕与通透度用于绘图表达。</p></div>
  <footer class="quality-footer"><p data-quality="status" role="status" aria-live="polite">选择材质，再应用到当前工程。</p><div><button data-quality="reset">恢复默认</button><button class="primary" data-quality="apply">应用材质</button></div></footer>`;
  document.body.append(dialog);
  const q=selector=>dialog.querySelector(selector),action=name=>q(`[data-quality="${name}"]`),field=name=>q(`[data-quality-field="${name}"]`);
  let preset='studio',busy=false,lastSignature='';
  const current=()=>normalizeSurfaceQuality(api.getState().presentation?.quality);
  function values(){return normalizeSurfaceQuality({preset,...Object.fromEntries(FIELDS.map(([id])=>[id,Number(field(id).value)]))});}
  function status(message){action('status').textContent=message;}
  function renderValues(){
    for(const [id] of FIELDS){const value=Number(field(id).value);q(`[data-quality-value="${id}"]`).textContent=['glassClarity','beamSoftness'].includes(id)?Math.round(value*100)+'%':value.toFixed(2);}
    for(const button of dialog.querySelectorAll('[data-quality-preset]'))button.setAttribute('aria-pressed',String(button.dataset.qualityPreset===preset));
  }
  function write(value){const normalized=normalizeSurfaceQuality(value);preset=normalized.preset;for(const [id] of FIELDS)field(id).value=String(normalized[id]);renderValues();return normalized;}
  function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const control of dialog.querySelectorAll('button,input'))control.disabled=value;launcher.disabled=value;}
  async function commit(input,remove=false){
    if(busy)return null;
    let next,state;
    try{next=normalizeSurfaceQuality(input);state=api.getState();}catch(error){status('材质未应用：'+error.message);api.toast?.('材质未应用：'+error.message);throw error;}
    if(remove?state.presentation?.quality===undefined:same(normalizeSurfaceQuality(state.presentation?.quality),next)){write(next);api.toast?.('当前工程已使用这些材质参数');return {changed:false,quality:next};}
    const before=state.presentation===undefined?undefined:copy(state.presentation);
    setBusy(true);status('正在更新材质…');
    try{
      api.checkpoint();state.presentation??={};if(remove)delete state.presentation.quality;else state.presentation.quality=copy(next);
      await api.rebuild();api.persist();write(next);lastSignature=JSON.stringify(state.presentation?.quality??null);
      const message=remove?'已恢复默认材质。Ctrl+Z 可撤销。':'材质已应用，背景和光路布局保持原样。Ctrl+Z 可撤销。';status(message);api.toast?.(message);return {changed:true,quality:next};
    }catch(error){
      if(before===undefined)delete state.presentation;else state.presentation=before;
      try{await api.rebuild();api.persist();}catch{}
      lastSignature=JSON.stringify(state.presentation?.quality??null);write(state.presentation?.quality);
      status('材质未应用，已恢复原设置：'+error.message);api.toast?.('材质未应用：'+error.message);throw error;
    }finally{setBusy(false);}
  }
  async function apply(settings){let next;try{next=settings===undefined?values():normalizeSurfaceQuality(settings);}catch(error){status('材质未应用：'+error.message);api.toast?.('材质未应用：'+error.message);throw error;}return commit(next);}
  async function reset(){return commit(normalizeSurfaceQuality(),true);}
  function refresh(){const signature=JSON.stringify(api.getState().presentation?.quality??null);if(dialog.open&&!busy&&signature!==lastSignature){write(current());lastSignature=signature;status('已同步当前工程的材质设置。');}}
  function open(){write(current());lastSignature=JSON.stringify(api.getState().presentation?.quality??null);status('选择材质，再应用到当前工程。');if(!dialog.open)dialog.showModal();}
  function close(){if(!busy)dialog.close();}
  launcher.onclick=open;action('close').onclick=close;action('apply').onclick=()=>apply().then(()=>close()).catch(()=>{});action('reset').onclick=()=>reset().catch(()=>{});
  for(const button of dialog.querySelectorAll('[data-quality-preset]'))button.onclick=()=>{write(SURFACE_PRESETS[button.dataset.qualityPreset]);status('已选择 '+PRESET_LABELS[preset][0]+'，点击“应用材质”更新工程。');};
  for(const [id] of FIELDS)field(id).addEventListener('input',()=>{renderValues();status('参数已调整，点击“应用材质”更新工程。');});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('keydown',event=>event.stopPropagation());write(current());
  return {open,close,apply,reset,getSettings:values,refresh,isBusy:()=>busy};
}
