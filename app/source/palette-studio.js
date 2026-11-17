import {PALETTES,DEFAULT_PALETTE_OPTIONS,getPalette,planPalette,applyPalettePlan,validatePaletteDocument,paletteDocument} from './palette-model.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=[['body','器件主色'],['accent','光源强调色'],['beam0','主光束'],['beam1','支路光束'],['background','背景'],['table','实验桌']];
const extraFields=[['detector','探测器'],['sample','偏振 / 样品'],['beam2','第三路光束'],['beam3','第四路光束'],['SM','SM 光纤'],['PM','PM 光纤'],['MM','MM 光纤'],['floor','地板']];
function paletteValue(palette,key){if(key.startsWith('beam'))return palette.beams[+key.slice(4)]||palette.beams[0];if(['SM','PM','MM'].includes(key))return palette.fibers[key];return palette[key];}
function setPaletteValue(palette,key,value){if(key.startsWith('beam')){const index=+key.slice(4);while(palette.beams.length<=index)palette.beams.push(palette.beams[0]);palette.beams[index]=value;}else if(['SM','PM','MM'].includes(key))palette.fibers[key]=value;else palette[key]=value;}
function swatches(palette){return [palette.body,palette.accent,...palette.beams.slice(0,3),palette.background].map(color=>`<i style="background:${color}"></i>`).join('');}

export function installPaletteStudio(api){
  let launcher=document.getElementById('openPaletteStudio');
  if(!launcher){launcher=document.createElement('button');launcher.id='openPaletteStudio';launcher.type='button';launcher.textContent='一键配色';launcher.title='协调器件、光束与实验桌的配色';(document.querySelector('.workspace-tabs')||document.querySelector('.viewbar .tools')).append(launcher);}
  const dialog=document.createElement('dialog');dialog.id='paletteDialog';dialog.className='palette-dialog';dialog.setAttribute('aria-label','一键配色');
  dialog.innerHTML=`<header class="palette-head"><div><h2>一键配色</h2><p>让器件、光束和实验桌使用同一套颜色</p></div><button data-palette-action="close" aria-label="关闭配色窗口">返回搭建台</button></header>
  <div class="palette-body"><section class="palette-preset-section"><h3>选择配色</h3><div class="palette-presets">${PALETTES.map(p=>`<button type="button" data-palette-id="${p.id}" aria-pressed="false"><span class="palette-swatches">${swatches(p)}</span><b>${escape(p.name)}</b><small>${escape(p.description)}</small></button>`).join('')}</div>
  <div class="palette-preview" data-palette-preview aria-label="配色示意"></div><p class="palette-caption">配色示意；器件位置、连接关系与光纤类型保持原样。</p>
  <div class="palette-custom-head"><h3>微调颜色</h3><span data-palette-name></span></div><div class="palette-color-grid">${fields.map(([key,name])=>`<label>${name}<input type="color" data-palette-color="${key}" aria-label="${name}"></label>`).join('')}</div>
  <details class="palette-extra-colors"><summary>更多器件、支路与光纤颜色</summary><div class="palette-color-grid">${extraFields.map(([key,name])=>`<label>${name}<input type="color" data-palette-color="${key}" aria-label="${name}"></label>`).join('')}</div></details>
  <div class="palette-file-tools"><button data-palette-action="export">导出配色</button><button data-palette-action="import">导入配色</button><input type="file" data-palette-file accept=".json,application/json" hidden></div></section>
  <section class="palette-options"><h3>应用到哪里</h3><label class="palette-setting">范围<select data-palette-field="scope"><option value="all">整个场景</option><option value="selection">当前选择</option></select></label><p data-palette-selection class="palette-note"></p>
  <label class="palette-setting">所选器件的连接<select data-palette-field="edgeScope"><option value="internal">仅所选器件之间的连接</option><option value="touching">所有相接的连接</option></select></label>
  <div class="palette-switches"><label><input type="checkbox" data-palette-field="applyDevices" checked><span><b>器件颜色</b><small>修改可编辑外壳，自有 GLB 保留原材质</small></span></label><label><input type="checkbox" data-palette-field="applyConnections" checked><span><b>光束与光纤颜色</b><small>按分支区分，串联光段保持连续色</small></span></label><label><input type="checkbox" data-palette-field="applyAppearance" checked><span><b>同步背景与实验桌</b><small>作用于全局，并返回有桌面的实验搭建视图</small></span></label></div>
  <label class="palette-setting">器件着色<select data-palette-field="deviceMode"><option value="category">按光源 / 样品 / 探测器协调</option><option value="uniform">全部使用器件主色</option></select></label><label class="palette-setting">连接着色<select data-palette-field="connectionMode"><option value="paths">光束按路径分支，光纤按纤型</option><option value="media">光束统一主色，光纤按纤型</option><option value="single">所有连接统一主色</option></select></label>
  <div class="palette-minor-options"><label><input type="checkbox" data-palette-field="preserveLocks" checked>保留锁定器件和锁定颜色</label><label><input type="checkbox" data-palette-field="includeHidden">包含已隐藏的器件与连接</label></div>
  <details class="palette-line-settings"><summary>批量调整线径与光晕</summary><label class="palette-inline-check"><input type="checkbox" data-palette-field="applyBeamStyle">同时调整激光显示样式</label><div class="palette-numeric-grid"><label>光束直径 / mm<input type="number" data-palette-field="beamDiameter" min="0.6" max="20" step="0.2" value="3.6"></label><label>光晕强度<input type="number" data-palette-field="beamGlow" min="0" max="1" step="0.05" value="0.55"></label></div><label class="palette-inline-check"><input type="checkbox" data-palette-field="applyFiberStyle">同时调整光纤显示线径</label><label class="palette-setting">光纤直径 / mm<input type="number" data-palette-field="fiberDiameter" min="0.6" max="10" step="0.1" value="2.3"></label><p class="palette-note">这里的直径和颜色仅用于绘图，不代表实测束腰或波长。</p></details>
  <div class="palette-lock-tools"><button data-palette-action="lock">锁住所选器件颜色</button><button data-palette-action="unlock">解锁所选器件颜色</button></div><p class="palette-note">应用或恢复颜色都可用 Ctrl+Z 撤销。锁定只保护配色，不改变器件位置。</p>
  </section></div>
  <footer class="palette-footer"><div><strong data-palette-count></strong><p data-palette-status role="status" aria-live="polite">选择一套配色，检查范围后应用。</p></div><div><button data-palette-action="reset">恢复默认颜色</button><button data-palette-action="apply" class="primary">应用配色</button></div></footer>`;
  document.body.append(dialog);
  const q=selector=>dialog.querySelector(selector),field=key=>q(`[data-palette-field="${key}"]`),action=key=>q(`[data-palette-action="${key}"]`);
  let palette=getPalette(),busy=false,lastPlan=null;
  function settings(){const values={};for(const [key,value] of Object.entries(DEFAULT_PALETTE_OPTIONS)){if(key==='paletteId'){values[key]=palette.id;continue;}const el=field(key);values[key]=typeof value==='boolean'?el.checked:typeof value==='number'?Number(el.value):el.value;}return values;}
  function context(){const selectedEdge=api.getSelectedEdge?.();return {palette,selection:api.getSelection?.()||[],selectedEdges:selectedEdge?[selectedEdge]:[],definition:api.definition};}
  function setStatus(message){q('[data-palette-status]').textContent=message;}
  function setBusy(value){busy=value;dialog.setAttribute('aria-busy',String(value));for(const el of dialog.querySelectorAll('button,input,select'))el.disabled=value;if(!value)updatePlan();}
  function preview(){
    const beam=palette.beams[0],branch=palette.beams[1],text=palette.id==='darkfield'?'#eef4f7':'#263e4c';
    q('[data-palette-preview]').innerHTML=`<svg viewBox="0 0 500 160" role="img" aria-label="器件、两路光束与实验桌配色示意"><rect width="500" height="160" fill="${palette.background}"/><path d="M29 44H446L479 139H55Z" fill="${palette.table}"/><path d="M115 79H403M262 79V119H371" fill="none" stroke="${beam}" stroke-width="7" opacity=".17"/><path d="M115 79H403" fill="none" stroke="${beam}" stroke-width="3"/><path d="M262 79V119H371" fill="none" stroke="${branch}" stroke-width="3"/><g stroke="#93a7b2" stroke-width="1"><rect x="60" y="54" width="72" height="47" rx="3" fill="${palette.accent}"/><path d="M60 54L72 44H145L132 54Z" fill="${palette.body}"/><path d="M132 54L145 44V90L132 101Z" fill="${palette.body}"/><rect x="247" y="62" width="30" height="32" rx="2" fill="${palette.sample}"/><rect x="389" y="54" width="56" height="45" rx="3" fill="${palette.detector}"/><rect x="358" y="105" width="49" height="31" rx="2" fill="${palette.detector}"/></g><ellipse cx="189" cy="78" rx="7" ry="20" fill="${palette.accent}" stroke="${palette.body}" stroke-width="4"/><text x="96" y="33" text-anchor="middle" fill="${text}" font-family="'Times New Roman',SimSun,serif" font-size="12">Source</text><text x="265" y="48" text-anchor="middle" fill="${text}" font-family="'Times New Roman',SimSun,serif" font-size="12">PBS</text><text x="418" y="42" text-anchor="middle" fill="${text}" font-family="'Times New Roman',SimSun,serif" font-size="12">Detector</text></svg>`;
    q('[data-palette-name]').textContent=palette.name;
    for(const el of dialog.querySelectorAll('[data-palette-color]'))el.value=paletteValue(palette,el.dataset.paletteColor);
    for(const el of dialog.querySelectorAll('[data-palette-id]'))el.setAttribute('aria-pressed',String(el.dataset.paletteId===palette.id));
  }
  function updatePlan(){
    const selected=context(),count=selected.selection.length,edgeCount=selected.selectedEdges.length;
    q('[data-palette-selection]').textContent=`当前选择：${count} 个器件${edgeCount?'、1 条连接':''}。`;
    field('edgeScope').disabled=busy||field('scope').value!=='selection';
    action('lock').disabled=action('unlock').disabled=busy||!count;
    try{
      lastPlan=planPalette(api.getState(),settings(),selected);const s=lastPlan.summary;
      q('[data-palette-count]').textContent=`将修改 ${s.devices} 个器件、${s.connections} 条连接${s.appearance?'，并协调背景与桌面':''}`;
      const skipped=[s.locked?`${s.locked} 项锁定`:null,s.imported?`${s.imported} 个自有模型`:null,s.hidden?`${s.hidden} 项隐藏`:null].filter(Boolean);
      setStatus(s.totalChanges?(skipped.length?'保留：'+skipped.join('、')+'。':'颜色将写入工程，保存后可继续编辑。'):'当前范围没有需要修改的颜色；可选择其他配色或调整范围。');
      action('apply').disabled=busy||!s.totalChanges;
      action('reset').disabled=busy;
    }catch(error){lastPlan=null;q('[data-palette-count]').textContent='请检查设置';setStatus(error.message);action('apply').disabled=action('reset').disabled=true;}
  }
  async function apply(options={}){
    if(busy)return null;
    let selectedPalette,state,plan;
    try{selectedPalette=options.palette?validatePaletteDocument(paletteDocument(options.palette)).palette:options.paletteId?getPalette(options.paletteId):palette;const values={...settings(),...options,paletteId:selectedPalette.id},selectedContext={...context(),palette:selectedPalette};state=api.getState();plan=planPalette(state,values,selectedContext);}
    catch(error){setStatus('配色未完成：'+error.message);api.toast?.('配色未完成：'+error.message);throw error;}
    if(!plan.summary.totalChanges){api.toast?.('当前范围已经使用这些颜色');return plan.summary;}
    const oldPresentation=structuredClone(state.presentation),oldItems=plan.items.map(c=>({id:c.id,values:Object.fromEntries(Object.keys(c.patch).map(k=>[k,state.items.find(it=>it.id===c.id)[k]]))})),oldEdges=plan.connections.map(c=>({id:c.id,values:Object.fromEntries(Object.keys(c.patch).map(k=>[k,state.connections.find(e=>e.id===c.id)[k]]))}));
    setBusy(true);setStatus('正在应用配色…');
    let errorMessage=null;
    try{
      api.checkpoint();applyPalettePlan(state,plan);await api.rebuild();api.refreshPresentation?.();api.persist();
      const text=`${options.restoreDefaults?'已恢复默认颜色':'已应用 '+selectedPalette.name}：${plan.summary.devices} 个器件、${plan.summary.connections} 条连接${plan.summary.appearance?'，背景与桌面已同步':''}。Ctrl+Z 可撤销。`;
      api.toast?.(text);setStatus(text);return plan.summary;
    }catch(error){
      const restore=(array,records)=>{for(const r of records){const item=array.find(it=>it.id===r.id);if(item)for(const [key,value] of Object.entries(r.values)){if(value===undefined)delete item[key];else item[key]=value;}}};
      restore(state.items,oldItems);restore(state.connections,oldEdges);if(oldPresentation===undefined)delete state.presentation;else state.presentation=oldPresentation;
      try{await api.rebuild();api.refreshPresentation?.();api.persist();}catch{}
      errorMessage='配色未完成：'+error.message;setStatus(errorMessage);api.toast?.(errorMessage);throw error;
    }finally{setBusy(false);if(errorMessage)setStatus(errorMessage);}
  }
  async function reset(options={}){return apply({...options,restoreDefaults:true,applyBeamStyle:false,applyFiberStyle:false});}
  async function lockSelection(value){
    const selection=new Set(api.getSelection?.()||[]),targets=api.getState().items.filter(it=>selection.has(it.id)&&api.definition(it.type)?.shape!=='import'&&!!it.colorLocked!==value);
    if(!targets.length){api.toast?.('所选器件的颜色锁定状态无需改变');return;}
    api.checkpoint();targets.forEach(it=>it.colorLocked=value);api.persist();updatePlan();api.toast?.((value?'已锁定':'已解锁')+targets.length+' 个器件颜色');
  }
  function open(){
    const saved=api.getState().presentation?.palette?.colors;
    if(saved){try{palette=validatePaletteDocument(paletteDocument(saved)).palette;}catch{}}
    preview();updatePlan();if(!dialog.open)dialog.showModal();
  }
  function close(){if(!busy)dialog.close();}
  launcher.onclick=open;
  for(const el of dialog.querySelectorAll('[data-palette-id]'))el.onclick=()=>{palette=getPalette(el.dataset.paletteId);preview();updatePlan();};
  for(const el of dialog.querySelectorAll('[data-palette-color]'))el.addEventListener('input',()=>{const oldName=palette.name.replace(/^自定义 · /,'');setPaletteValue(palette,el.dataset.paletteColor,el.value);palette.id='custom';palette.name=('自定义 · '+oldName).slice(0,60);preview();updatePlan();});
  for(const el of dialog.querySelectorAll('[data-palette-field]'))el.addEventListener('change',()=>{if(el.dataset.paletteField==='scope'&&el.value==='selection')field('applyAppearance').checked=false;updatePlan();});
  action('close').onclick=close;
  action('apply').onclick=()=>apply().then(()=>close()).catch(()=>{});
  action('reset').onclick=()=>reset().then(()=>close()).catch(()=>{});
  action('lock').onclick=()=>lockSelection(true);action('unlock').onclick=()=>lockSelection(false);
  action('export').onclick=()=>{try{const document=paletteDocument(palette);api.download(JSON.stringify(document,null,2),palette.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'_配色.json','application/json');setStatus('配色已导出；可在其他工程中导入使用。');}catch(error){setStatus(error.message);}};
  action('import').onclick=()=>q('[data-palette-file]').click();
  q('[data-palette-file]').onchange=async()=>{const file=q('[data-palette-file]').files[0];if(!file)return;try{if(file.size>20000)throw new Error('配色文件请控制在20KB内');palette=validatePaletteDocument(JSON.parse(await file.text())).palette;preview();updatePlan();setStatus('配色已载入；点击“应用配色”后写入当前场景。');}catch(error){setStatus('导入失败：'+error.message);}finally{q('[data-palette-file]').value='';}};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  preview();updatePlan();
  return {open,close,apply,reset,getSettings:()=>({...settings(),palette:structuredClone(palette)}),getPlan:()=>lastPlan?structuredClone(lastPlan):null,refresh:()=>{if(dialog.open)updatePlan();},isBusy:()=>busy,destroy:()=>dialog.remove()};
}
