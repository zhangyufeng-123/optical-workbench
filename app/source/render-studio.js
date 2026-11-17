import {annotationAppearance} from './render-appearance.js';
import {normalizeTypography} from './typography.js';
import {TABLE_OPTIONS} from './table-settings.js';
import {normalizeSurfaceQuality} from './surface-quality.js';
import {normalizeReferenceStyle} from './reference-render-style.js';
import {createJournalStudio,publicationSVG,validateComposition} from './publication.js';
import {createRenderComposition} from './render-layout.js';
import {renderCompositionPNG,makeRenderZIP} from './render-export.js';
import {createRenderLabelEditor} from './render-label-editor.js';
import {applyRenderLabelEdits,collectRenderLabelEdits,normalizeRenderLabelEdits} from './render-label-state.js';
const RENDER_VIEWS=['auto','editor','iso','top','front'];
const validateView=view=>{if(!RENDER_VIEWS.includes(view))throw new Error('未知渲染视角：'+String(view));return view;};

const RENDER_STYLES={paper:{label:'论文白底',description:'纯净背景 · 柔和投影',color:'#ffffff'},reference:{label:'灰色实验台',description:'灰色实体台面 · 清晰光束',color:'#d7d9dc'},dark:{label:'深色光路',description:'深色台面 · 冷调轮廓光',color:'#18212b'},warm:{label:'暖灰演示',description:'暖灰台面 · 柔和质感',color:'#eee9e2'}};

// Layout accepts only white/transparent. Fill the padded panel raster for a
// coloured style rather than sending a style name into that background enum.
async function styleComposition(composition,capture,selected){
  composition.renderStyle=selected.style;
  for(const panel of composition.panels){
    panel.renderStyle=selected.style;
    if(capture.backgroundColor!=='#ffffff'&&selected.background!=='transparent'){
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('无法读取风格渲染图'));img.src=panel.image;});
      const canvas=document.createElement('canvas');canvas.width=panel.width;canvas.height=panel.height;
      const context=canvas.getContext('2d');if(!context)throw new Error('无法创建风格图版');
      context.fillStyle=capture.backgroundColor||RENDER_STYLES[selected.style].color;context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
      panel.image=canvas.toDataURL('image/png');
    }
    // Transparent artwork is intended for a light paper background. A light
    // halo makes the dark text readable where a dark table lies beneath it.
    for(const annotation of panel.annotations){
      Object.assign(annotation,annotationAppearance(selected.background==='transparent'?'#ffffff':capture.backgroundColor,selected.table,capture.tableColor));
    }
  }
  return composition;
}

export function createRenderStudio(api){
  const dialog=document.createElement('dialog');dialog.id='renderDialog';dialog.className='render-dialog';dialog.setAttribute('aria-label','一键论文渲染');
  dialog.innerHTML=`<header class="render-head"><div><b>一键论文渲染</b><span>当前三维场景直接出图 · 透视构图 · 可编辑标注</span></div><div><button data-render="typography">字体</button><button data-render="quality">材质与光照</button><button data-render="restore">恢复实验台</button><button data-render="close" aria-label="返回搭建台">返回搭建台</button></div></header>
  <div class="render-style-bar"><div class="render-style-options" role="group" aria-label="渲染风格">${Object.entries(RENDER_STYLES).map(([key,look])=>`<button type="button" data-render-style="${key}" aria-pressed="${key==='paper'}"><i class="render-style-swatch" style="--render-swatch:${look.color}"></i><span><b>${look.label}</b><small>${look.description}</small></span></button>`).join('')}</div><p data-render="style-note">当前三维场景默认生成白底论文插图，光路保留工程原色。</p></div>
  <section class="render-reference" data-render="reference-panel" hidden><img data-render="reference-thumbnail" alt="所选文献图例"><div><strong data-render="reference-title"></strong><p data-render="reference-meta"></p></div><button type="button" data-render="clear-reference">论文默认风格</button></section>
  <div class="render-settings"><label>实验桌<select data-render-field="table">${Object.entries(TABLE_OPTIONS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>视角<select data-render-field="view"><option value="auto">自动透视构图</option><option value="editor">当前视角</option><option value="iso">立体视角</option><option value="top">俯视</option><option value="front">低角度</option></select></label><label>背景<select data-render-field="background"><option value="white">不透明 · 随风格</option><option value="transparent">透明背景</option></select></label><label>幅宽<select data-render-field="widthMM"><option value="183">183 mm 双栏</option><option value="89">89 mm 单栏</option></select></label><label>分辨率<select data-render-field="dpi"><option value="600">600 dpi</option><option value="300">300 dpi</option></select></label><label class="render-label-check"><input type="checkbox" data-render-field="useSceneColors">沿用工程配色</label><label class="render-label-check" title="按工程设置的颜色显示光纤和光束"><input type="checkbox" data-render-field="preserveConnectionColors" checked>保留光路原色</label><label class="render-label-check" title="按器件、光路与实验桌的投影边界缩减空白"><input type="checkbox" data-render-field="tightFrame" checked>紧凑取景</label><label class="render-label-check"><input type="checkbox" data-render-field="labels" checked>自动标注</label><button data-render="rerun" class="primary">重新渲染</button></div>
  <div class="render-preview"><div class="render-empty">从实验台点击“一键论文渲染”生成高清光路。</div><img data-render="preview" alt="当前光纤场景的论文渲染图" hidden><div class="render-working" hidden><b data-render="step">正在准备光路…</b><span>正在处理当前三维器件与光纤连接</span><progress></progress></div></div>
  <footer class="render-footer"><div><strong data-render="dimensions"></strong><p data-render="status" role="status" aria-live="polite">就绪</p></div><div class="render-downloads"><button data-render="png" class="primary">下载 PNG</button><button data-render="svg">可编辑 SVG</button><button data-render="zip">下载全部</button><button data-render="edit">继续标注</button></div></footer>`;
  document.body.append(dialog);const q=s=>dialog.querySelector(s),button=name=>q(`[data-render="${name}"]`),field=name=>q(`[data-render-field="${name}"]`);
  let result=null,busy=false,previewURL=null,editor=null,pending=null,style='paper',styleExplicit=false,reference=null,referenceStyle=null;
  let baseComposition=null,editRevision=0,exportedRevision=0,editExport=null;
  const editablePreview=document.createElement('div');editablePreview.className='render-editable-preview';editablePreview.hidden=true;
  q('.render-preview').append(editablePreview);
  const labelEditor=createRenderLabelEditor({container:editablePreview,onChange:acceptComposition,onError:error=>{status(error.message);api.toast?.(error.message);}});
  field('table').value='none';field('background').value='white';field('useSceneColors').checked=false;
  const savedView=api.getState()?.presentation?.view;field('view').value=RENDER_VIEWS.includes(savedView)?savedView:'auto';field('view').title='当前视角沿用搭建台的观察方向；输出会按器件与桌面自动重新取景，不保留屏幕缩放裁切。';
  field('labels').checked=api.getState()?.presentation?.showLabels===true;
  function setLabels(visible){if(typeof visible!=='boolean')throw new Error('标签显示设置须为布尔值');field('labels').checked=visible;return visible;}
  const settings=()=>({style,reference:reference?structuredClone(reference):null,referenceStyle:referenceStyle?structuredClone(referenceStyle):null,useSceneColors:field('useSceneColors').checked,preserveConnectionColors:field('preserveConnectionColors').checked,tightFrame:field('tightFrame').checked,table:field('table').value,view:field('view').value,background:field('background').value,widthMM:Number(field('widthMM').value),dpi:Number(field('dpi').value),labels:field('labels').checked,typography:normalizeTypography(api.getState()?.presentation?.typography),fontPt:normalizeTypography(api.getState()?.presentation?.typography).fontPt});
  function selectReference(value,parameters){
    if(value==null){reference=null;referenceStyle=null;return;}
    if(typeof value!=='object'||!/^10\.\d{4,9}\/\S+$/i.test(value.doi||'')||typeof value.title!=='string'||!value.title.trim())throw new Error('文献风格缺少有效的DOI或题名');
    const normalized=normalizeReferenceStyle(parameters);
    if(!normalized)throw new Error('文献风格缺少渲染参数');
    if(!/^nature-references\/images\/[a-z0-9_.-]+\.jpg$/i.test(value.thumbnail_path||''))throw new Error('文献缩略图路径无效');
    reference={doi:value.doi,title:value.title,journal:String(value.journal||''),year:value.year,figure_label:String(value.figure_label||''),figure_url:String(value.figure_url||''),thumbnail_path:value.thumbnail_path,styleLabel:String(value.styleLabel||'文献图例')};
    referenceStyle=normalized;
  }
  function updateReference(){
    button('reference-panel').hidden=!reference;
    button('reference-title').textContent=reference?.title||'';
    button('reference-meta').textContent=reference?[reference.journal,reference.year,reference.figure_label,reference.styleLabel,reference.doi].filter(Boolean).join(' · '):'';
    if(reference)button('reference-thumbnail').src=reference.thumbnail_path;else button('reference-thumbnail').removeAttribute('src');
  }
  function updateStyle(){
    updateReference();dialog.dataset.renderStyle=style;
    dialog.querySelectorAll('[data-render-style]').forEach(element=>element.setAttribute('aria-pressed',String(!reference&&element.dataset.renderStyle===style)));
    button('style-note').textContent=reference
      ? '文献风格 · '+reference.styleLabel+'。已载入图例的视角、背景、光照、阴影和哑光参数。'
      : (styleExplicit?'已选 · ':'自动推荐 · ')+RENDER_STYLES[style].label+'。实验桌选项为'+TABLE_OPTIONS[field('table').value]+'。切换风格可更新已有结果。';
  }
  function controls(){for(const el of dialog.querySelectorAll('button,select,input'))el.disabled=busy;field('useSceneColors').disabled=busy||!!reference;for(const n of ['png','svg','zip','edit'])button(n).disabled=busy||!result;button('preview').hidden=true;editablePreview.hidden=!result;labelEditor.setDisabled(busy); q('.render-empty').hidden=!!result||busy;q('.render-working').hidden=!busy;dialog.setAttribute('aria-busy',String(busy));document.getElementById('renderNow')?.toggleAttribute('disabled',busy);}
  function status(text){button('status').textContent=text;}
  function setView(view){const valid=validateView(view);field('view').value=valid;status(result?'视角已调整，点击“重新渲染”更新图片。':'视角已设置，将在下次渲染时使用。');return valid;}
  function show(){if(!dialog.open)dialog.showModal();}
  const pause=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  async function run(options={}){
    if(busy)return pending;
    if(result)labelEditor.getComposition();
    if(Object.hasOwn(options.settings||{},'view'))validateView(options.settings.view);
    if(Object.hasOwn(options.settings||{},'style')&&!Object.hasOwn(RENDER_STYLES,options.settings.style))throw new Error('未知渲染风格：'+String(options.settings.style));
    const nextTable=Object.hasOwn(options.settings||{},'table')?options.settings.table:field('table').value;
    const nextBackground=Object.hasOwn(options.settings||{},'background')?options.settings.background:field('background').value;
    if(!Object.hasOwn(TABLE_OPTIONS,nextTable))throw new Error('未知实验桌设置');
    if(!['white','transparent'].includes(nextBackground))throw new Error('背景须为 white 或 transparent');
    if(Object.hasOwn(options.settings||{},'reference'))selectReference(options.settings.reference,options.settings.referenceStyle);
    else if(Object.hasOwn(options.settings||{},'referenceStyle')){if(options.settings.referenceStyle!==null)throw new Error('请选择对应文献后应用风格');selectReference(null,null);}
    show();
    const sourceScene=api.getState();
    const useSceneColors=Object.hasOwn(options.settings||{},'useSceneColors')?options.settings.useSceneColors===true:field('useSceneColors').checked;
    if(Object.prototype.hasOwnProperty.call(options.settings||{},'style')){if(!Object.prototype.hasOwnProperty.call(RENDER_STYLES,options.settings.style))throw new Error('未知渲染风格：'+options.settings.style);style=options.settings.style;styleExplicit=true;}
    else if(!styleExplicit){const paletteStyle=sourceScene.presentation?.palette?.renderStyle;style=useSceneColors&&Object.hasOwn(RENDER_STYLES,paletteStyle)?paletteStyle:'paper';}
    const typography=normalizeTypography(sourceScene.presentation?.typography);
    const selected={...settings(),...options.settings,style,reference:reference?structuredClone(reference):null,referenceStyle:referenceStyle?structuredClone(referenceStyle):null,typography,fontPt:typography.fontPt,quality:normalizeSurfaceQuality(sourceScene.presentation?.quality)};
    selected.useSceneColors=useSceneColors;
    selected.preserveConnectionColors=selected.preserveConnectionColors!==false;
    selected.tightFrame=selected.tightFrame!==false;
    validateView(selected.view);
    if(!Object.hasOwn(TABLE_OPTIONS,selected.table))throw new Error('未知实验桌设置');if(!['white','transparent'].includes(selected.background))throw new Error('背景须为 white 或 transparent');
    for(const name of ['table','view','background','widthMM','dpi'])field(name).value=String(selected[name]);field('labels').checked=selected.labels;field('useSceneColors').checked=selected.useSceneColors;field('preserveConnectionColors').checked=selected.preserveConnectionColors;field('tightFrame').checked=selected.tightFrame;
    updateStyle();
    if(!sourceScene.items.some(it=>!it.hidden)){
      result=null;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;button('preview').removeAttribute('src');button('dimensions').textContent='';q('.render-empty').textContent='场景为空。先返回搭建台添加器件，再点击一键渲染。';status('请先添加一个可见器件。');controls();return null;
    }
    busy=true;controls();button('step').textContent='正在渲染器件、金属表面与光纤…';status('正在按当前场景生成高清图。');const started=performance.now();
    pending=(async()=>{
      try{
        await pause();
        const capture=await api.capture({preset:'nature',labels:selected.labels,tightFrame:selected.tightFrame,preserveConnectionColors:selected.preserveConnectionColors,useSceneColors:selected.useSceneColors,quality:selected.quality,style:selected.style,background:selected.background,width:4400,height:1800,transparent:selected.background==='transparent',table:selected.table,hideBoard:selected.table!=='board',projection:'perspective',view:selected.view,referenceStyle:selected.referenceStyle});
        button('step').textContent='正在排布标签与细引线…';await pause();
        const generated=await styleComposition(await createRenderComposition(capture,{...selected,title:sourceScene.title||'全光纤光路'}),capture,selected);
        const composition=applyRenderLabelEdits(generated,sourceScene.presentation?.renderLabels);
        button('step').textContent='正在生成高清图片与可编辑图版…';await pause();
        const exported=await renderCompositionPNG(composition);
        result={...exported,composition,projection:capture.projection,sourceScene,settings:selected,dpi:selected.dpi,widthMM:selected.widthMM,createdAt:new Date().toISOString(),elapsedMs:Math.round(performance.now()-started)};
        baseComposition=generated;editRevision++;exportedRevision=editRevision;labelEditor.setComposition(composition);
        if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(result.png);button('preview').src=previewURL;
        button('dimensions').textContent=`${result.width} × ${result.height} px  /  ${result.widthMM} mm  /  ${result.dpi} dpi`;
        const count=composition.panels[0]?.annotations.length||0;status(`已完成 · ${selected.reference?.styleLabel||RENDER_STYLES[selected.style].label} · ${count} 个可编辑标注。下载全部可同时备份图片、排版和三维工程。`);
        if(options.download)api.download(result.png,filename()+'_论文渲染.png','image/png');return result;
      }catch(e){status('渲染未完成：'+e.message);api.toast?.('渲染未完成：'+e.message);throw e;}
      finally{busy=false;controls();pending=null;}
    })();return pending;
  }
  function acceptComposition(composition){
    if(!result||busy)return;
    const next=validateComposition(composition);
    if(JSON.stringify(next)===JSON.stringify(result.composition))return;
    const edits=collectRenderLabelEdits(baseComposition,next,api.getState()?.presentation?.renderLabels);
    api.saveLabelEdits?.(edits);
    result.composition=next;result.svg=publicationSVG(next);editRevision++;
    result.widthMM=next.widthMM;result.dpi=next.dpi;
    result.settings={...result.settings,typography:structuredClone(next.typography),fontPt:next.fontPt};
    result.sourceScene={...result.sourceScene,presentation:{...result.sourceScene.presentation,typography:structuredClone(next.typography),renderLabels:edits}};
    status('文字已更新，可拖动位置或继续修改字体。下载将包含当前修改。');
  }
  async function flushEdits(){
    if(!result)return null;
    if(!busy)labelEditor.getComposition();
    if(busy&&pending)await pending;
    while(result&&exportedRevision!==editRevision){
      if(editExport){await editExport;continue;}
      const target=result,revision=editRevision,composition=structuredClone(result.composition);
      editExport=(async()=>{
        const exported=await renderCompositionPNG(composition);
        if(result!==target||revision!==editRevision)return;
        Object.assign(result,exported);exportedRevision=revision;
        button('dimensions').textContent=`${result.width} × ${result.height} px  /  ${result.widthMM} mm  /  ${result.dpi} dpi`;
      })();
      try{await editExport;}finally{editExport=null;}
    }
    return result;
  }
  function refreshTypography({undo=false}={}){
    if(busy)return;
    const typography=normalizeTypography(api.getState()?.presentation?.typography);
    const edits=normalizeRenderLabelEdits(api.getState()?.presentation?.renderLabels);
    const resetFields=['fontChinese','fontLatin','fontPt','bold','leaderStartX','leaderStartY'];
    for(const entry of edits.overrides)for(const key of resetFields)delete entry.properties[key];
    for(const annotation of edits.added)for(const key of resetFields)delete annotation[key];
    if(api.getState()?.presentation?.renderLabels!==undefined)api.saveLabelEdits?.(edits,{undo});
    if(!result||!baseComposition)return;
    baseComposition.typography=structuredClone(typography);baseComposition.fontPt=typography.fontPt;
    for(const panel of baseComposition.panels)for(const annotation of panel.annotations)if(annotation.type==='text'){
      annotation.fontPt=typography.fontPt;delete annotation.leaderStartX;delete annotation.leaderStartY;
    }
    const composition=structuredClone(result.composition);
    composition.typography=structuredClone(typography);composition.fontPt=typography.fontPt;
    for(const panel of composition.panels)for(const annotation of panel.annotations)if(annotation.type==='text'){
      for(const key of resetFields)delete annotation[key];
    }
    result.composition=composition;result.svg=publicationSVG(composition);editRevision++;
    result.settings={...result.settings,typography:structuredClone(typography),fontPt:typography.fontPt};
    result.sourceScene={...result.sourceScene,presentation:{...result.sourceScene.presentation,typography:structuredClone(typography),renderLabels:edits}};
    labelEditor.setComposition(composition,{resetHistory:false});
    status('字体已同步到当前图，文字位置与内容可继续编辑。');
  }
  const filename=()=>[result?.sourceScene.title||'全光纤光路',result?.settings.reference?.doi?.split('/')[1]].filter(Boolean).join('_').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
  async function save(kind){if(!result)return;await flushEdits();const name=filename();if(kind==='png')api.download(result.png,name+'_论文渲染.png','image/png');if(kind==='svg')api.download(result.svg,name+'_论文渲染.svg','image/svg+xml;charset=utf-8');if(kind==='zip')api.download(await makeRenderZIP(result),name+'_论文渲染完整包.zip','application/zip');}
  button('restore').onclick=()=>{selectReference(null,null);api.resetAppearance?.();style='reference';styleExplicit=true;field('table').value='board';field('useSceneColors').checked=true;updateStyle();dialog.close();api.toast?.('已恢复实验桌和灰背景；器件配色保留。');};button('close').onclick=()=>dialog.close();button('rerun').onclick=()=>run().catch(()=>{});
  button('typography').hidden=typeof api.showTypography!=='function';button('typography').onclick=()=>{if(busy)return;try{api.showTypography?.();}catch(error){status('字体窗口未打开：'+error.message);api.toast?.(error.message);}};
  button('quality').hidden=typeof api.showQuality!=='function';button('quality').onclick=()=>{if(busy)return;dialog.close();try{api.showQuality?.();}catch(error){status('材质窗口未打开：'+error.message);api.toast?.(error.message);}};
  for(const kind of ['png','svg','zip'])button(kind).onclick=()=>save(kind).catch(e=>status('下载失败：'+e.message));
  button('edit').textContent='多图排版';
  button('edit').onclick=()=>{if(!result)return;editor??=createJournalStudio({download:api.download,onChange:composition=>{acceptComposition(composition);labelEditor.setComposition(result.composition,{resetHistory:false});},onClose:composition=>{acceptComposition(composition);labelEditor.setComposition(result.composition,{resetHistory:false});show();}},document.body);editor.load(result.composition);dialog.close();editor.open({captureIfEmpty:false});};
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('keydown',e=>{e.stopPropagation();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(!busy)save('zip').catch(err=>status(err.message));}});
  dialog.querySelectorAll('[data-render-field]').forEach(el=>el.addEventListener('change',()=>{if(el===field('useSceneColors')&&el.checked)styleExplicit=false;updateStyle();status('参数已调整，点击“重新渲染”更新图片。');}));
  dialog.querySelectorAll('[data-render-style]').forEach(el=>el.addEventListener('click',()=>{selectReference(null,null);style=el.dataset.renderStyle;styleExplicit=true;field('useSceneColors').checked=false;updateStyle();controls();if(result)run().catch(()=>{});else status('风格已选择，点击“重新渲染”生成图片。');}));
  button('clear-reference').onclick=()=>{selectReference(null,null);style='paper';styleExplicit=true;field('useSceneColors').checked=false;updateStyle();controls();if(result)run().catch(()=>{});};
  updateStyle();controls();return {run,setView,setLabels,refreshTypography,flushEdits,getLabelEditor:()=>labelEditor,open:show,close:()=>{if(!busy)dialog.close();},getResult:()=>result,getSettings:settings,getZIP:async()=>{await flushEdits();return result?makeRenderZIP(result):null;},isBusy:()=>busy||!!editExport,save,destroy:()=>{if(previewURL)URL.revokeObjectURL(previewURL);editor?.destroy();labelEditor.destroy();dialog.remove();}};
}
