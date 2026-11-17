// Organize the existing editor controls without replacing their handlers.
// This module stores interface preferences only; project geometry is untouched.
const KEY='fiberWorkbench.ui.v5';
const DEFAULTS={density:'comfortable',catalog:'list',inspector:'properties',connectionsOpen:false};
export function normalizeShellPreferences(value={}){
  return {density:value?.density==='compact'?'compact':'comfortable',catalog:value?.catalog==='cards'?'cards':'list',inspector:['properties','objects','settings','references','ai'].includes(value?.inspector)?value.inspector:'properties',connectionsOpen:value?.connectionsOpen===true};
}
const ICONS={
  file:'M4 3h10l4 4v14H4z M14 3v5h5 M8 12h7 M8 16h7',
  undo:'M8 5 3 10l5 5 M3 10h10a6 6 0 0 1 6 6',
  redo:'m16 5 5 5-5 5 M21 10H11a6 6 0 0 0-6 6',
  search:'M16 16 21 21 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  view:'M3 6h18v13H3z M8 6v13 M3 10h18',
  layout:'M3 5h18 M3 12h18 M3 19h18 M7 2v20 M17 2v20',
  tools:'m4 20 8-8 M14 3a6 6 0 0 0 7 7l-4-4 2-3 M12 12l-5-5-3 1-1 3 5 5',
  focus:'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',
  library:'M4 3h6v18H4z M14 3h6v18h-6z M4 8h6 M14 8h6',
  panel:'M3 4h18v16H3z M14 4v16',
  list:'M8 5h13 M8 12h13 M8 19h13 M3 5h1 M3 12h1 M3 19h1',
  cards:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  restore:'M4 4v6h6 M4 10a8 8 0 1 1 1 9',
  chevron:'m8 9 4 4 4-4'
};
const svg=key=>`<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false"><path d="${ICONS[key]||ICONS.tools}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const propertyLayouts=new WeakMap();
/** Fold verbose descriptions while retaining all real form nodes and handlers. */
export function organizePropertyPanel(property,selectionKey=''){
  if(!property)return;
  const previous=propertyLayouts.get(property)||{},sameSelection=previous.selectionKey===selectionKey;
  const currentExtra=property.querySelector('#extraProperties');
  const device=!!property.querySelector('#itemName'),edge=!!property.querySelector('#edgeColor');
  const heading=[...property.children].find(node=>node.tagName==='H3');if(heading&&property.children[0]!==heading)property.prepend(heading);
  if(!device&&!edge){propertyLayouts.delete(property);return;}
  const ensure=(id,title,old,parent=property)=>{
    let details=property.querySelector('#'+id);if(details)return details;
    details=document.createElement('details');details.id=id;details.className='shell-property-fold';details.open=sameSelection&&!!old?.open;
    const summary=document.createElement('summary');summary.textContent=title;details.append(summary);parent.append(details);return details;
  };
  const verbose=[...property.children].filter(node=>node.classList.contains('note')||(device&&node.classList.contains('tag')));
  let info=property.querySelector('#shellPropertyInfo');
  if(verbose.length){info=ensure('shellPropertyInfo',device?'器件说明与来源':'连接说明',previous.info);for(const node of verbose)info.append(node);}
  let labels=property.querySelector('#shellPropertyLabels'),colorLock=null;
  if(device){
    const heightInput=currentExtra?.querySelector('#heightY'),position=property.querySelector('#posX')?.closest('label');
    const height=heightInput?.closest('label');
    // Keep height inside its original owner: removal/recreation of extraProperties
    // must remove every old height input before the next set of handlers is bound.
    if(currentExtra&&position){if(position.nextSibling!==currentExtra)property.insertBefore(currentExtra,position.nextSibling);currentExtra.classList.add('shell-managed-extra');}
    colorLock=property.querySelector('#itemColorLock')?.closest('label')||(sameSelection?previous.colorLock:null);
    if(currentExtra){
      labels=ensure('shellPropertyLabels','标签与锁定',previous.labels,currentExtra);
      if(labels.parentNode!==currentExtra)currentExtra.append(labels);
      for(const node of [...currentExtra.children])if(node!==height&&node!==labels)labels.append(node);
      if(colorLock&&colorLock.parentNode!==labels)labels.append(colorLock);
    }else if(colorLock&&colorLock.parentNode){labels=ensure('shellPropertyLabels','标签与锁定',previous.labels);if(colorLock.parentNode!==labels)labels.append(colorLock);}
  }
  propertyLayouts.set(property,{selectionKey,extra:currentExtra,colorLock,info,labels});
}
function unfoldPropertyPanel(property){
  if(!property)return;for(const id of ['shellPropertyLabels','shellPropertyInfo']){const details=property.querySelector('#'+id);if(!details)continue;for(const child of [...details.children])if(child.tagName!=='SUMMARY')details.parentNode.insertBefore(child,details);details.remove();}property.querySelector('#extraProperties')?.classList.remove('shell-managed-extra');propertyLayouts.delete(property);
}

export function installWorkbenchShell(api={}){
  const $=id=>document.getElementById(id),q=selector=>document.querySelector(selector);
  const body=document.body,header=q('body > header'),main=q('main'),library=q('.library'),inspector=q('.inspector'),viewbar=q('.viewbar');
  if(!header||!main||!library||!inspector||!viewbar)throw new Error('工作区缺少必要面板');
  let stored={};try{stored=JSON.parse(localStorage.getItem(KEY)||'{}');}catch{}
  let preferences=normalizeShellPreferences(stored),focusMode=false,lastSelection='',destroyed=false;
  const moved=[],created=[],listeners=[],menus=[],changed=[];
  const remember=node=>{if(node&&!moved.some(entry=>entry.node===node))moved.push({node,parent:node.parentNode,next:node.nextSibling});return node;};
  const move=(node,parent)=>{if(node&&parent){remember(node);parent.append(node);}return node;};
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
  const own=node=>{created.push(node);return node;};
  const on=(node,type,handler)=>{node.addEventListener(type,handler);listeners.push([node,type,handler]);};
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{}};
  const resized=()=>api.resize?.();
  const rememberAttribute=(node,name)=>{changed.push({node,name,value:node.getAttribute(name)});};
  function decorateButton(node,label,icon,{iconOnly=false,title=label}={}){
    if(!node)return;changed.push({node,html:node.innerHTML});rememberAttribute(node,'aria-label');rememberAttribute(node,'title');
    node.innerHTML=(icon?svg(icon):'')+(iconOnly?'':`<span>${label}</span>`);node.setAttribute('aria-label',label);node.title=title;
    if(iconOnly){rememberAttribute(node,'class');node.classList.add('shell-icon-button');}
  }
  function button(id,label,handler,icon,iconOnly=false){const node=el('button','shell-button');node.type='button';if(id)node.id=id;node.innerHTML=(icon?svg(icon):'')+(iconOnly?'':`<span>${label}</span>`);node.title=label;node.setAttribute('aria-label',label);if(iconOnly)node.classList.add('shell-icon-button');if(handler)on(node,'click',handler);return node;}
  function menu(id,label,icon){
    const details=own(el('details','shell-menu'));details.id=id;const summary=el('summary');summary.innerHTML=svg(icon)+`<span>${label}</span>`+svg('chevron');summary.setAttribute('aria-label',label);
    const content=el('div','shell-menu-content');details.append(summary,content);menus.push(details);
    on(details,'toggle',()=>{if(details.open)for(const other of menus)if(other!==details)other.open=false;});
    on(content,'click',event=>{if(event.target.closest?.('button'))details.open=false;});
    on(details,'keydown',event=>{if(event.key==='Escape'){details.open=false;summary.focus();event.stopPropagation();}});
    return {node:details,content};
  }
  function menuLabel(parent,text){parent.append(el('div','shell-menu-label',text));}
  const brand=q('.brand'),oldHeaderTools=header.querySelector('.tools');
  if(brand){changed.push({node:brand,html:brand.innerHTML});brand.innerHTML='<b>光路设计台</b><span>实验搭建与论文绘图</span>';}
  if(oldHeaderTools){rememberAttribute(oldHeaderTools,'hidden');oldHeaderTools.hidden=true;}
  const headerActions=own(el('nav','shell-header-actions'));headerActions.setAttribute('aria-label','工程操作');header.append(headerActions);
  const fileMenu=menu('shellFileMenu','文件','file');headerActions.append(fileMenu.node);
  menuLabel(fileMenu.content,'工程');for(const id of ['save','load','renameScene'])move($(id),fileMenu.content);
  const templateButton=button('openSceneSettings','场景模板与台面',()=>showInspector('settings'));fileMenu.content.append(templateButton);
  menuLabel(fileMenu.content,'输出');for(const id of ['journalMode','image','export','bomExport'])move($(id),fileMenu.content);
  menuLabel(fileMenu.content,'帮助');move($('help'),fileMenu.content);
  const history=el('div','shell-history');headerActions.append(history);for(const [id,label,icon] of [['undo','撤销','undo'],['redo','重做','redo']]){const node=move($(id),history);decorateButton(node,label,icon,{iconOnly:true,title:label+(id==='undo'?' · Ctrl+Z':' · Ctrl+Y')});}
  const commandButton=button('openCommands','搜索命令',()=>api.openCommands?.(),'search');commandButton.append(el('kbd','','Ctrl K'));headerActions.append(commandButton);
  const primary=el('div','shell-primary');headerActions.append(primary);for(const id of ['autoLayout','openPaletteStudio','renderNow'])move($(id),primary);
  if($('renderNow'))decorateButton($('renderNow'),'论文渲染',null,{title:'一键生成论文图：光照、构图与标签'});
  const modeTools=viewbar.querySelector('.tools');
  const viewControls=own(el('div','shell-view-controls'));viewbar.append(viewControls);
  const boardSizeButton=button('editBoardSize','台面尺寸',()=>{showInspector('settings');q('.scene-options')?.scrollIntoView?.({block:'start'});const width=$('boardW');width?.focus?.();width?.select?.();});
  viewControls.append(boardSizeButton);
  const viewMenu=menu('shellViewMenu','视图','view');viewControls.append(viewMenu.node);
  menuLabel(viewMenu.content,'观察方向');for(const id of ['openComposition','view3d','top','fit'])move($(id),viewMenu.content);
  menuLabel(viewMenu.content,'画面');for(const id of ['benchMode','studioMode'])move($(id),viewMenu.content);
  const viewOptions=q('.view-options');if(viewOptions){menuLabel(viewMenu.content,'显示');move(viewOptions,viewMenu.content);}
  menuLabel(viewMenu.content,'工作区');
  const focusButton=button('focusCanvas','专注画布',()=>setFocusMode(!focusMode),'focus');viewMenu.content.append(focusButton);
  for(const [id,label,icon] of [['toggleLibrary','显示 / 隐藏器件库','library'],['toggleInspector','显示 / 隐藏属性栏','panel']]){const node=move($(id),viewMenu.content);decorateButton(node,label,icon);if(node)on(node,'click',()=>{if(focusMode)setFocusMode(false);if(id==='toggleInspector'&&window.innerWidth<=980){const visible=!body.classList.contains('show-inspector');body.classList.toggle('show-inspector',visible);body.classList.toggle('inspector-collapsed',!visible);}if(id==='toggleLibrary'&&window.innerWidth<=680){const visible=!body.classList.contains('shell-library-open');body.classList.toggle('shell-library-open',visible);body.classList.toggle('library-collapsed',!visible);}resized();});}
  move($('expandBoard'),viewMenu.content);
  const layoutMenu=menu('shellLayoutMenu','布局','layout');viewControls.append(layoutMenu.node);
  for(const id of ['connectionLogic','selectAll','alignX','alignZ','distributeX','distributeZ','layoutCheck'])move($(id),layoutMenu.content);
  const toolsMenu=menu('shellToolsMenu','工具','tools');viewControls.append(toolsMenu.node);
  const workspaceTabs=q('.workspace-tabs');if(workspaceTabs){move(workspaceTabs,toolsMenu.content);workspaceTabs.classList.add('shell-tool-list');}
  const toolTarget=workspaceTabs||toolsMenu.content;
  const reset=move($('resetAppearance'),viewControls);decorateButton(reset,'恢复实验台','restore',{title:'恢复灰背景和孔阵列实验桌，保留器件与光束配色'});
  const proToolbar=q('.pro-toolbar');if(proToolbar){rememberAttribute(proToolbar,'hidden');proToolbar.hidden=true;}
  // Empty original view groups may remain for rollback; CSS removes their gap.
  if(modeTools)modeTools.classList.add('shell-mode-tools');
  const focusExit=own(button('exitCanvasFocus','退出专注',()=>setFocusMode(false),'panel'));focusExit.classList.add('shell-focus-exit');move(focusExit,$('viewport'));

  const inspectorTabs=own(el('div','shell-inspector-tabs'));inspectorTabs.setAttribute('role','tablist');inspectorTabs.setAttribute('aria-label','场景面板');inspector.prepend(inspectorTabs);
  const panelData=[['properties','属性','shellPropertiesPanel'],['objects','对象','shellObjectsPanel'],['settings','设置','shellSettingsPanel']],panels={},tabButtons={};
  function createInspectorPanel(key,label,id,beforeKey){
    const tab=button('shellTab_'+key,label,()=>showInspector(key));tab.setAttribute('role','tab');tab.setAttribute('aria-controls',id);
    tab.setAttribute('aria-selected',String(preferences.inspector===key));tab.tabIndex=preferences.inspector===key?0:-1;
    if(beforeKey&&tabButtons[beforeKey])inspectorTabs.insertBefore(tab,tabButtons[beforeKey]);else inspectorTabs.append(tab);
    tabButtons[key]=tab;
    const panel=own(el('section','shell-inspector-panel'));panel.id=id;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);inspector.append(panel);panels[key]=panel;
    on(tab,'keydown',event=>{const index=panelData.findIndex(([name])=>name===key),count=panelData.length;const next=event.key==='ArrowRight'?(index+1)%count:event.key==='ArrowLeft'?(index+count-1)%count:event.key==='Home'?0:event.key==='End'?count-1:null;if(next!==null){event.preventDefault();event.stopPropagation();const target=panelData[next][0];showInspector(target);tabButtons[target].focus();}});
    inspectorTabs.setAttribute('style','--shell-tab-count:'+panelData.length);
    return panel;
  }
  for(const [key,label,id] of panelData)createInspectorPanel(key,label,id);
  function registerPanel(key,label,{before='settings'}={}){
    if(panels[key])return panels[key];
    if(!/^[a-z][a-z0-9-]*$/.test(key))throw new Error('面板标识无效');
    const id='shellPanel_'+key,index=panelData.findIndex(([name])=>name===before);
    panelData.splice(index<0?panelData.length:index,0,[key,label,id]);
    const panel=createInspectorPanel(key,label,id,before);
    panel.hidden=preferences.inspector!==key;
    if(requestedInspector===key)showInspector(key,{reveal:false});
    return panel;
  }
  const closeInspector=button('closeInspectorMobile','关闭属性栏',()=>{body.classList.remove('show-inspector');body.classList.add('inspector-collapsed');resized();},'panel',true);closeInspector.classList.add('shell-inspector-close');inspectorTabs.append(closeInspector);
  move($('property'),panels.properties);move($('sceneList'),panels.objects);
  for(const node of [q('.presets'),q('.scene-options'),q('.advanced-section')])move(node,panels.settings);
  const uiSection=el('section','shell-ui-settings');uiSection.append(el('h3','','界面显示'));
  const densityLabel=el('label','shell-setting','界面密度'),density=el('select');density.id='interfaceDensity';density.setAttribute('aria-label','界面密度');
  for(const [value,label] of [['comfortable','舒适'],['compact','紧凑']]){const option=el('option','',label);option.value=value;density.append(option);}densityLabel.append(density);uiSection.append(densityLabel);panels.settings.append(uiSection);
  on(density,'change',()=>{preferences.density=density.value==='compact'?'compact':'comfortable';applyPreferences();save();});

  const categories=$('categories'),catalog=$('catalog');
  const libraryControls=own(el('div','shell-library-controls'));const categorySelect=el('select');categorySelect.id='libraryCategory';categorySelect.setAttribute('aria-label','器件类别');libraryControls.append(categorySelect);
  const catalogSwitch=el('div','shell-catalog-switch');catalogSwitch.setAttribute('role','group');catalogSwitch.setAttribute('aria-label','器件库显示');
  const listButton=button('libraryListView','列表',()=>setCatalog('list'),'list',true),cardsButton=button('libraryCardsView','图卡',()=>setCatalog('cards'),'cards',true);catalogSwitch.append(listButton,cardsButton);libraryControls.append(catalogSwitch);
  if(categories)categories.before(libraryControls);else library.prepend(libraryControls);
  const closeLibrary=own(button('closeLibraryMobile','关闭器件库',()=>{body.classList.remove('shell-library-open');body.classList.add('library-collapsed');resized();},'library',true));closeLibrary.classList.add('shell-library-close');library.append(closeLibrary);
  function syncCategories(){
    const buttons=categories?[...categories.querySelectorAll('button')]:[];const values=buttons.map((node,index)=>({value:String(index),text:node.textContent,active:node.classList.contains('active')}));
    if(categorySelect.dataset.signature!==JSON.stringify(values)){
      categorySelect.replaceChildren();for(const value of values){const option=el('option','',value.text);option.value=value.value;option.selected=value.active;categorySelect.append(option);}categorySelect.dataset.signature=JSON.stringify(values);
    }
    const active=values.find(value=>value.active);if(active)categorySelect.value=active.value;
  }
  on(categorySelect,'change',()=>{categories?.querySelectorAll('button')[Number(categorySelect.value)]?.click();syncCategories();});
  let observer=null;if(categories&&typeof MutationObserver!=='undefined'){observer=new MutationObserver(syncCategories);observer.observe(categories,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});}
  const connections=$('connections'),toggleConnections=$('toggleConnections');
  if(connections){rememberAttribute(connections,'class');connections.classList.toggle('hidden',!preferences.connectionsOpen);}
  if(toggleConnections)on(toggleConnections,'click',()=>{preferences.connectionsOpen=!connections?.classList.contains('hidden');save();updateConnectionToggle();});
  function updateConnectionToggle(){toggleConnections?.setAttribute('aria-expanded',String(!connections?.classList.contains('hidden')));toggleConnections?.setAttribute('aria-controls','connections');}
  function setCatalog(value){preferences.catalog=value==='cards'?'cards':'list';applyPreferences();save();}
  function applyPreferences(){
    body.dataset.interfaceDensity=preferences.density;body.dataset.catalogView=preferences.catalog;
    density.value=preferences.density;listButton.setAttribute('aria-pressed',String(preferences.catalog==='list'));cardsButton.setAttribute('aria-pressed',String(preferences.catalog==='cards'));resized();
  }
  function showInspector(key,{reveal=true}={}){
    if(!panels[key])return;preferences.inspector=key;
    for(const [name,panel] of Object.entries(panels)){const active=name===key;panel.hidden=!active;tabButtons[name].setAttribute('aria-selected',String(active));tabButtons[name].tabIndex=active?0:-1;}
    if(reveal){if(focusMode)setFocusMode(false);body.classList.remove('inspector-collapsed');if(window.innerWidth<=980)body.classList.add('show-inspector');}
    save();resized();
  }
  function setFocusMode(value=!focusMode){focusMode=!!value;body.classList.toggle('shell-focus',focusMode);focusExit.hidden=!focusMode;focusButton.setAttribute('aria-pressed',String(focusMode));focusButton.querySelector('span').textContent=focusMode?'退出专注画布':'专注画布';resized();return focusMode;}
  function adoptTools(){for(const id of ['drawingTools','precisionTools','sceneTools']){const node=$(id);if(node&&node.parentNode!==toolTarget)move(node,toolTarget);}}
  function refresh(){
    if(destroyed)return;adoptTools();syncCategories();updateConnectionToggle();
    const selected=api.getSelection?.()||[],edge=api.getSelectedEdge?.()||'',signature=JSON.stringify([selected.slice().sort(),edge]);
    organizePropertyPanel($('property'),signature);
    if(signature!==lastSelection){const wasEmpty=lastSelection==='';lastSelection=signature;if(!wasEmpty&&(selected.length||edge))showInspector('properties',{reveal:false});}
    const count=$('libcount');if(count)count.title='当前可用器件类型';
  }
  const outside=event=>{for(const details of menus)if(details.open&&!details.contains(event.target))details.open=false;};on(document,'pointerdown',outside);
  const requestedInspector=preferences.inspector;body.classList.add('workbench-v5');applyPreferences();showInspector(panels[preferences.inspector]?preferences.inspector:'properties',{reveal:false});setFocusMode(false);refresh();
  return {refresh,showInspector,registerPanel,setFocusMode,getPreferences:()=>({...preferences,focusMode}),destroy(){
    if(destroyed)return;destroyed=true;observer?.disconnect();for(const [node,type,handler] of listeners)node.removeEventListener(type,handler);unfoldPropertyPanel($('property'));
    for(const entry of [...moved].reverse()){if(entry.parent){if(entry.next?.parentNode===entry.parent)entry.parent.insertBefore(entry.node,entry.next);else entry.parent.append(entry.node);}}
    for(const node of created)node.remove();
    for(const entry of [...changed].reverse()){if('html' in entry)entry.node.innerHTML=entry.html;else if(entry.value===null)entry.node.removeAttribute(entry.name);else entry.node.setAttribute(entry.name,entry.value);}
    workspaceTabs?.classList.remove('shell-tool-list');modeTools?.classList.remove('shell-mode-tools');body.classList.remove('workbench-v5','shell-focus','shell-library-open');delete body.dataset.interfaceDensity;delete body.dataset.catalogView;resized();
  }};
}
