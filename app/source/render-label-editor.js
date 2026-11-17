import {publicationSVG,publicationLayout,validateComposition} from './publication.js';
import {fontOptions,normalizeTypography,fontAvailabilityMessage} from './typography.js';

const SVG_NS='http://www.w3.org/2000/svg';
const copy=value=>structuredClone(value);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
let nextLabelId=0;

export function moveTextAnnotation(annotation,dx,dy){
  if(![dx,dy].every(Number.isFinite))throw new Error('文字位置无效');
  const next={...annotation,x:annotation.x+dx,y:annotation.y+dy};
  if(Number.isFinite(annotation.leaderStartX))next.leaderStartX=annotation.leaderStartX+dx;
  if(Number.isFinite(annotation.leaderStartY))next.leaderStartY=annotation.leaderStartY+dy;
  return next;
}

function editSnapshot(composition){
  return {typography:copy(composition.typography),fontPt:composition.fontPt,
    panels:composition.panels.map(panel=>({id:panel.id,annotations:copy(panel.annotations)}))};
}

/** Edit the vector labels over the same embedded image used by publication exports. */
export function createRenderLabelEditor({container,onChange,onError}={}){
  if(!container)throw new Error('文字编辑器需要图面容器');
  const element=document.createElement('section');
  element.className='render-label-editor';
  element.setAttribute('aria-label','论文图文字编辑器');
  element.innerHTML=`<div class="render-label-toolbar">
    <span>单击文字编辑，拖动调整位置</span>
    <div><button type="button" data-label-action="undo" title="撤销文字修改 · Ctrl+Z">撤销</button><button type="button" data-label-action="redo" title="重做文字修改 · Ctrl+Y">重做</button><button type="button" data-label-action="add">添加文字</button></div>
  </div>
  <div class="render-label-workspace"><div class="render-label-scroll"><div class="render-label-sheet" data-label-sheet tabindex="0" aria-label="可编辑论文图，方向键微调所选文字"></div></div>
  <aside class="render-label-inspector" aria-label="所选文字属性">
    <h3>文字与字体</h3><label>选择标注<select data-label-selection aria-label="选择标注"></select></label>
    <div data-label-empty>点击图中文字，或添加一条文字。</div>
    <div data-label-fields>
      <label>文字内容<textarea data-label-field="text" rows="3" maxlength="1000" spellcheck="false"></textarea></label>
      <label>中文字体<select data-label-field="fontChinese"><option value="">跟随图版</option>${fontOptions('chinese').replace(/ selected/g,'')}</select></label>
      <label>英文字体<select data-label-field="fontLatin"><option value="">跟随图版</option>${fontOptions('latin').replace(/ selected/g,'')}</select></label>
      <div class="render-label-pair"><label>字号 / pt<input data-label-field="fontPt" type="number" min="5" max="20" step=".5"></label><label>文字颜色<input data-label-field="color" type="color"></label></div>
      <label>字重<select data-label-field="bold"><option value="inherit">跟随图版</option><option value="normal">常规</option><option value="bold">加粗</option></select></label>
      <p class="render-label-font-status" data-label-font-status></p>
      <label class="render-label-checkbox"><input data-label-field="leader" type="checkbox">显示器件引线</label>
      <button type="button" data-label-action="apply-all">将字体样式应用到全部文字</button>
      <button type="button" data-label-action="delete">删除所选文字</button>
    </div>
    <p class="render-label-status" data-label-status role="status" aria-live="polite"></p>
  </aside></div>`;
  container.append(element);
  const query=selector=>element.querySelector(selector);
  const action=name=>query(`[data-label-action="${name}"]`);
  const field=name=>query(`[data-label-field="${name}"]`);
  const sheet=query('[data-label-sheet]'),selection=query('[data-label-selection]');
  const status=message=>{query('[data-label-status]').textContent=message;};
  let composition=null,selectedPanel=null,selectedId=null,disabled=false,drag=null,draft=null;
  let history=[],future=[],destroyed=false;

  const panel=()=>composition?.panels.find(value=>value.id===selectedPanel);
  const selected=()=>panel()?.annotations.find(value=>value.id===selectedId&&value.type==='text');
  const report=error=>{status(error.message);onError?.(error);};
  function restore(snapshot){
    composition.typography=copy(snapshot.typography);composition.fontPt=snapshot.fontPt;
    for(const target of composition.panels){
      const saved=snapshot.panels.find(value=>value.id===target.id);
      if(saved)target.annotations=copy(saved.annotations);
    }
  }
  function pushHistory(snapshot){
    history.push(snapshot);if(history.length>40)history.shift();future=[];
  }
  function commit(before,message){
    if(JSON.stringify(before)===JSON.stringify(editSnapshot(composition)))return false;
    try{
      composition=validateComposition(composition);
      onChange?.(copy(composition));
      pushHistory(before);render();status(message);return true;
    }catch(error){restore(before);render();report(error);return false;}
  }
  function labelEntries(){
    return composition?.panels.flatMap(value=>value.annotations.filter(annotation=>annotation.type==='text').map(annotation=>({panel:value,annotation})))||[];
  }
  function updateControls(){
    const annotation=selected(),entries=labelEntries();
    selection.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='选择图中文字';selection.append(placeholder);
    for(const entry of entries){
      const option=document.createElement('option');option.value=entry.annotation.id;
      option.textContent=entry.annotation.text?.replace(/\s+/g,' ').slice(0,70)||'空文字';
      selection.append(option);
    }
    selection.value=annotation?.id||'';
    query('[data-label-fields]').hidden=!annotation;query('[data-label-empty]').hidden=!!annotation;
    if(annotation){
      field('text').value=annotation.text||'';
      field('fontChinese').value=annotation.fontChinese||'';field('fontLatin').value=annotation.fontLatin||'';
      field('fontPt').value=String(annotation.fontPt||composition.fontPt);
      field('color').value=annotation.color||'#263743';
      field('bold').value=annotation.bold===undefined?'inherit':annotation.bold?'bold':'normal';
      field('leader').checked=annotation.leader===true;
      query('[data-label-font-status]').textContent=fontAvailabilityMessage({...composition.typography,
        ...(annotation.fontChinese?{chinese:annotation.fontChinese}:{}),...(annotation.fontLatin?{latin:annotation.fontLatin}:{})});
    }
    element.querySelectorAll('button,input,textarea,select').forEach(control=>{control.disabled=disabled||!composition;});
    action('undo').disabled=disabled||!history.length;action('redo').disabled=disabled||!future.length;
    action('delete').disabled=disabled||!annotation;
    action('apply-all').disabled=disabled||!annotation||!entries.length;
    action('add').disabled=disabled||!composition?.panels.length||!composition.panels.some(value=>value.annotations.length<240);
    element.setAttribute('aria-busy',String(disabled));
  }
  function draw(){
    if(!composition){sheet.replaceChildren();return;}
    sheet.innerHTML=publicationSVG(composition);
    const svg=sheet.querySelector('svg');
    svg.setAttribute('role','img');svg.setAttribute('aria-label','论文图，可拖动文字标注');
    for(const node of svg.querySelectorAll('text[data-j-ann]')){
      node.setAttribute('role','button');
      node.setAttribute('aria-label','编辑 '+node.textContent);
      node.classList.toggle('render-label-selected',node.dataset.jAnn===selectedId);
      // Chromium does not hit-test the gap between text tspans consistently,
      // even with pointer-events:bounding-box. Give the whole label a hit area.
      const box=node.getBBox(),hit=document.createElementNS(SVG_NS,'rect');
      const fontSize=Number(node.getAttribute('font-size'))||12;
      const left=box.width?box.x:Number(node.getAttribute('x'));
      const top=box.height?box.y:Number(node.getAttribute('y'))-fontSize;
      for(const [key,value] of Object.entries({x:left-3,y:top-3,width:Math.max(6,box.width+6),height:Math.max(fontSize,box.height)+6}))hit.setAttribute(key,String(value));
      hit.dataset.labelHit=node.dataset.jAnn;
      hit.setAttribute('class','render-label-hit');hit.setAttribute('aria-hidden','true');
      node.before(hit);
    }
    const text=[...svg.querySelectorAll('text[data-j-ann]')].find(node=>node.dataset.jAnn===selectedId);
    if(text){
      const box=text.getBBox(),outline=document.createElementNS(SVG_NS,'rect');
      for(const [key,value] of Object.entries({x:box.x-3,y:box.y-3,width:Math.max(6,box.width+6),height:Math.max(6,box.height+6)}))outline.setAttribute(key,String(value));
      outline.setAttribute('class','render-label-outline');outline.setAttribute('pointer-events','none');
      svg.append(outline);
    }
  }
  function render(){updateControls();draw();}
  function finishDraft(){
    if(!draft)return;
    const before=draft;draft=null;
    commit(before,'文字已更新，可直接拖动位置。');
  }
  function choose(id){
    finishDraft();
    const entry=labelEntries().find(value=>value.annotation.id===id);
    selectedPanel=entry?.panel.id||composition?.panels[0]?.id||null;
    selectedId=entry?.annotation.id||null;render();
  }
  function localPoint(event,panelId){
    const svg=sheet.querySelector('svg'),matrix=svg?.getScreenCTM();
    const position=composition&&publicationLayout(composition).panels.find(value=>value.panel.id===panelId);
    if(!svg||!matrix||!position)return null;
    const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    const transformed=point.matrixTransform(matrix.inverse());
    return {x:(transformed.x-position.x)/position.width,y:(transformed.y-position.y)/position.height};
  }
  function boundedDelta(annotation,dx,dy,bounds){
    const layout=publicationLayout(composition),position=layout.panels.find(value=>value.panel.id===selectedPanel);
    if(bounds&&position){
      dx=clamp(dx,(2-bounds.x)/position.width,(layout.width-2-bounds.x-bounds.width)/position.width);
      dy=clamp(dy,(2-bounds.y)/position.height,(layout.height-2-bounds.y-bounds.height)/position.height);
    }
    return {dx:clamp(annotation.x+dx,-.2,1.2)-annotation.x,dy:clamp(annotation.y+dy,-.2,1.2)-annotation.y};
  }
  function currentTextBounds(){
    const text=[...sheet.querySelectorAll('text[data-j-ann]')].find(node=>node.dataset.jAnn===selectedId);
    if(!text)return null;
    const {x,y,width,height}=text.getBBox();return {x,y,width,height};
  }
  function replaceSelected(value){
    const target=panel(),index=target?.annotations.findIndex(annotation=>annotation.id===selectedId);
    if(index>=0)target.annotations[index]=value;
  }
  function releasePointer(pointerId){
    if(sheet.hasPointerCapture?.(pointerId))sheet.releasePointerCapture(pointerId);
  }
  function endDrag(cancelled=false){
    if(!drag)return;
    const completed=drag;drag=null;releasePointer(completed.pointerId);
    if(cancelled){restore(completed.before);render();status('已取消文字移动。');}
    else commit(completed.before,'文字位置已更新，器件引线跟随。');
  }
  function targetLabel(event){
    const node=event.target.closest('text[data-j-ann],[data-label-hit]');
    return node?.dataset.jAnn||node?.dataset.labelHit;
  }
  sheet.addEventListener('pointerdown',event=>{
    if(disabled||event.button!==0||!composition)return;
    const id=targetLabel(event);if(!id)return;
    event.preventDefault();choose(id);sheet.focus({preventScroll:true});
    const point=localPoint(event,selectedPanel),annotation=selected();
    if(!point||!annotation)return;
    drag={pointerId:event.pointerId,start:point,original:copy(annotation),before:editSnapshot(composition),bounds:currentTextBounds()};
    sheet.setPointerCapture(event.pointerId);
  });
  sheet.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const point=localPoint(event,selectedPanel);if(!point)return;
    event.preventDefault();
    const delta=boundedDelta(drag.original,point.x-drag.start.x,point.y-drag.start.y,drag.bounds);
    replaceSelected(moveTextAnnotation(drag.original,delta.dx,delta.dy));draw();
  });
  sheet.addEventListener('pointerup',event=>{if(drag?.pointerId===event.pointerId)endDrag();});
  sheet.addEventListener('pointercancel',event=>{if(drag?.pointerId===event.pointerId)endDrag(true);});
  sheet.addEventListener('lostpointercapture',event=>{if(drag?.pointerId===event.pointerId)endDrag(true);});
  sheet.addEventListener('dblclick',event=>{
    const id=targetLabel(event);if(disabled||!id)return;
    choose(id);field('text').focus();field('text').select();
  });
  selection.addEventListener('change',()=>{if(!disabled)choose(selection.value);});

  field('text').addEventListener('input',()=>{
    const annotation=selected();if(disabled||!annotation)return;
    const text=field('text').value.slice(0,1000);if(annotation.text===text)return;
    draft??=editSnapshot(composition);annotation.text=text;
    delete annotation.leaderStartX;delete annotation.leaderStartY;draw();
  });
  field('text').addEventListener('change',finishDraft);
  field('text').addEventListener('blur',finishDraft);
  for(const name of ['fontChinese','fontLatin','fontPt','color','bold','leader'])field(name).addEventListener('change',()=>{
    if(disabled||!selected())return;
    const fieldValue=field(name).value,fieldChecked=field(name).checked;
    finishDraft();const before=editSnapshot(composition),annotation=selected();
    try{
      if(name==='fontChinese'||name==='fontLatin'){
        const value=fieldValue;
        if(value){normalizeTypography({...composition.typography,[name==='fontChinese'?'chinese':'latin']:value});annotation[name]=value;}else delete annotation[name];
      }else if(name==='fontPt'){
        const value=Number(fieldValue);normalizeTypography({...composition.typography,fontPt:value});annotation.fontPt=value;
      }else if(name==='bold'){
        if(fieldValue==='inherit')delete annotation.bold;else annotation.bold=fieldValue==='bold';
      }else if(name==='leader'){
        annotation.leader=fieldChecked;annotation.anchorX??=annotation.x;annotation.anchorY??=annotation.y;
      }else annotation.color=fieldValue;
      if(['fontChinese','fontLatin','fontPt','bold'].includes(name)){delete annotation.leaderStartX;delete annotation.leaderStartY;}
      commit(before,'所选文字已更新。');
    }catch(error){restore(before);render();report(error);}
  });

  function undo(){
    if(disabled||!composition)return;
    finishDraft();if(!history.length)return;
    const before=editSnapshot(composition),previous=history.pop();future.push(before);restore(previous);
    if(!selected())selectedId=null;render();onChange?.(copy(composition));status('已撤销文字修改。');
  }
  function redo(){
    if(disabled||!composition)return;
    finishDraft();if(!future.length)return;
    history.push(editSnapshot(composition));restore(future.pop());
    if(!selected())selectedId=null;render();onChange?.(copy(composition));status('已重做文字修改。');
  }
  function remove(){
    if(disabled||!selected())return;
    finishDraft();const before=editSnapshot(composition);
    panel().annotations=panel().annotations.filter(annotation=>annotation.id!==selectedId);
    selectedId=null;commit(before,'已删除所选文字。');
  }
  action('undo').onclick=undo;action('redo').onclick=redo;action('delete').onclick=remove;
  action('add').onclick=()=>{
    if(disabled||!composition)return;
    finishDraft();const before=editSnapshot(composition),target=panel()||composition.panels[0];
    if(!target||target.annotations.length>=240){report(new Error('每幅图最多支持 240 条标注'));return;}
    const id='render_text_'+Date.now().toString(36)+'_'+(++nextLabelId);
    target.annotations.push({id,type:'text',text:'标注文字',x:.5,y:.15,fontPt:composition.fontPt,color:'#263743',align:'middle',halo:false,leader:false});
    selectedPanel=target.id;selectedId=id;commit(before,'已添加文字，可修改内容并拖动。');field('text').focus();field('text').select();
  };
  action('apply-all').onclick=()=>{
    if(disabled||!selected())return;
    finishDraft();const before=editSnapshot(composition),source=copy(selected());
    for(const {annotation} of labelEntries()){
      for(const name of ['fontChinese','fontLatin','fontPt','bold','color']){
        if(source[name]===undefined)delete annotation[name];else annotation[name]=source[name];
      }
      delete annotation.leaderStartX;delete annotation.leaderStartY;
    }
    commit(before,'字体、字号、粗细和颜色已应用到全部文字。');
  };
  element.addEventListener('keydown',event=>{
    if(disabled)return;
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();endDrag(true);return;}
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||event.target.isContentEditable)return;
    const command=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(command&&(key==='z'||key==='y')){event.preventDefault();event.stopPropagation();key==='y'||event.shiftKey?redo():undo();return;}
    if(event.key==='Delete'&&selected()){event.preventDefault();event.stopPropagation();remove();return;}
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const direction=directions[event.key];if(!direction||!selected())return;
    event.preventDefault();event.stopPropagation();finishDraft();
    const before=editSnapshot(composition),position=publicationLayout(composition).panels.find(value=>value.panel.id===selectedPanel),step=event.shiftKey?10:1;
    const delta=boundedDelta(selected(),direction[0]*step/position.width,direction[1]*step/position.height,currentTextBounds());
    replaceSelected(moveTextAnnotation(selected(),delta.dx,delta.dy));commit(before,'文字位置已微调。');
  });
  render();
  return {
    element,
    setComposition(value,{resetHistory=true}={}){
      if(destroyed)return;
      if(drag)endDrag(true);draft=null;
      composition=value?validateComposition(value):null;
      if(resetHistory){history=[];future=[];selectedId=null;selectedPanel=composition?.panels[0]?.id||null;}
      if(!selected())selectedId=null;
      render();status(composition?'单击或双击文字后编辑，方向键可微调位置。':'');
    },
    getComposition(){finishDraft();return composition?copy(composition):null;},
    setDisabled(value){if(value&&drag)endDrag(true);if(value)finishDraft();disabled=!!value;updateControls();},
    focus(){if(!selected()){const first=labelEntries()[0];if(first)choose(first.annotation.id);}sheet.focus({preventScroll:true});},
    getSelection:()=>({panelId:selectedPanel,annotationId:selectedId}),
    isDragging:()=>!!drag,
    undo,redo,
    destroy(){destroyed=true;const pointerId=drag?.pointerId;drag=null;draft=null;if(pointerId!==undefined)releasePointer(pointerId);element.remove();}
  };
}
