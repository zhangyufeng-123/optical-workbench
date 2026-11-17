import {normalizeTypography,fontFamily,DEFAULT_TYPOGRAPHY,fontOptions,fontAvailabilityMessage,CHINESE_FONTS,LATIN_FONTS} from './typography.js';

const copy=value=>structuredClone(value);
export function installTypographyStudio(api){
  let launcher=document.getElementById('typographyStudio');
  if(!launcher){launcher=document.createElement('button');launcher.id='typographyStudio';launcher.type='button';launcher.textContent='字体与字号';launcher.title='选择中英文字体、字号和粗细';(document.querySelector('.workspace-tabs')||document.body).append(launcher);}
  const dialog=document.createElement('dialog');dialog.id='typographyDialog';dialog.className='typography-dialog';dialog.setAttribute('aria-label','字体与字号');
  dialog.innerHTML=`<header class="typography-head"><div><h2>字体与字号</h2><p>${CHINESE_FONTS.length} 种中文字体 · ${LATIN_FONTS.length} 种英文字体</p></div><button type="button" data-typography="close">返回搭建台</button></header>
  <div class="typography-body"><div class="typography-fields"><label>中文字体<select data-typography-field="chinese">${fontOptions('chinese')}</select></label><label>英文字体<select data-typography-field="latin">${fontOptions('latin')}</select></label><label>画布字号 / px<input type="number" data-typography-field="screenPx" min="10" max="32" step="1" value="14"></label><label>论文字号 / pt<input type="number" data-typography-field="fontPt" min="5" max="20" step="0.5" value="8"></label></div>
  <div class="typography-flags"><label><input type="checkbox" data-typography-field="bold">加粗</label><label><input type="checkbox" data-typography="showLabels">显示器件名称</label></div>
  <section class="typography-preview" aria-label="字体效果预览"><p class="typography-preview-title">效果预览</p><div data-typography="sample">自制光纤波片 · 偏振测试<br>PANDA fiber · HWP / QWP · λ = 1550 nm</div><p data-typography="paperSample">论文标注：光纤波片 / Fiber waveplate</p></section>
  <p class="typography-note" data-typography="visibility"></p><p class="typography-note" data-typography="availability"></p><p class="typography-note">中文与英文分别设置。列表标记未检测到的字体，导出保留字体选择。</p></div>
  <footer class="typography-footer"><p data-typography="status" role="status" aria-live="polite">选择字体后应用到工程。</p><div><button type="button" data-typography="reset">宋体 + Times 默认</button><button type="button" class="primary" data-typography="apply">应用字体</button></div></footer>`;
  document.body.append(dialog);
  const action=name=>dialog.querySelector(`[data-typography="${name}"]`),field=name=>dialog.querySelector(`[data-typography-field="${name}"]`);
  let busy=false,lastSignature='';
  const current=()=>normalizeTypography(api.getState().presentation?.typography);
  const signature=()=>JSON.stringify(current());
  const status=text=>{action('status').textContent=text;};
  function values(){return normalizeTypography({chinese:field('chinese').value,latin:field('latin').value,screenPx:Number(field('screenPx').value),fontPt:Number(field('fontPt').value),bold:field('bold').checked});}
  function syncVisibility(){const visible=api.getState().presentation?.showLabels===true;action('showLabels').checked=visible;action('visibility').textContent=visible?'器件名称已显示，应用后同步更新画布。':'器件名称当前隐藏；预览仍可查看，应用字体不会自动显示名称。';}
  function preview(value){const type=normalizeTypography(value),family=fontFamily(type),weight=type.bold?'700':'400';Object.assign(action('sample').style,{fontFamily:family,fontSize:type.screenPx+'px',fontWeight:weight});Object.assign(action('paperSample').style,{fontFamily:family,fontSize:type.fontPt+'pt',fontWeight:weight});action('availability').textContent=fontAvailabilityMessage(type);}
  function write(value){const type=normalizeTypography(value);for(const name of ['chinese','latin','screenPx','fontPt'])field(name).value=String(type[name]);field('bold').checked=type.bold;preview(type);syncVisibility();return type;}
  function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const element of dialog.querySelectorAll('button,input,select'))element.disabled=value;launcher.disabled=value;}
  function apply(input){
    if(busy)return null;
    const next=normalizeTypography(input===undefined?values():input),state=api.getState();
    if(JSON.stringify(current())===JSON.stringify(next)){api.refresh?.({typographyChanged:false});write(next);status('字体已应用到当前图。');return {changed:false,typography:next};}
    const before=state.presentation===undefined?undefined:copy(state.presentation);setBusy(true);
    try{api.checkpoint();state.presentation={...state.presentation,typography:copy(next)};api.persist();api.refresh?.({typographyChanged:true});write(next);lastSignature=signature();status('字体已应用。Ctrl+Z 可撤销。');api.toast?.('字体与字号已应用');return {changed:true,typography:next};}
    catch(error){if(before===undefined)delete state.presentation;else state.presentation=before;try{api.persist();api.refresh?.({typographyChanged:true});}catch{}write(current());lastSignature=signature();status('未应用字体：'+error.message);throw error;}
    finally{setBusy(false);}
  }
  function reset(){return apply(DEFAULT_TYPOGRAPHY);}
  function refresh(){if(!dialog.open||busy)return;const next=signature();if(next!==lastSignature){write(current());lastSignature=next;status('已同步当前工程的字体。');}else syncVisibility();}
  function open(){write(current());lastSignature=signature();status('先查看效果，再应用到工程。');if(!dialog.open)dialog.showModal();}
  function close(){if(!busy)dialog.close();}
  const report=error=>{status('字体未应用：'+error.message);api.toast?.(error.message);};
  launcher.onclick=open;action('close').onclick=close;
  action('apply').onclick=()=>{try{apply();}catch(error){report(error);}};
  action('reset').onclick=()=>{try{reset();}catch(error){report(error);}};
  action('showLabels').onchange=()=>{try{api.setTextVisibility?.('showLabels',action('showLabels').checked);syncVisibility();}catch(error){syncVisibility();report(error);}};
  for(const name of ['chinese','latin','screenPx','fontPt','bold'])field(name).addEventListener('input',()=>{try{preview(values());status('预览已更新，点击“应用字体”保存。');}catch(error){status(error.message);}});
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('keydown',event=>event.stopPropagation());write(current());lastSignature=signature();
  return {open,close,apply,reset,refresh,getSettings:values,isBusy:()=>busy,destroy:()=>{launcher.remove();dialog.remove();}};
}
