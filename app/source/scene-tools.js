const clone=value=>structuredClone(value);
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)&&!['__proto__','prototype','constructor'].includes(value);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Read-only normalization for project loading. Deleted members are removed,
 * while empty sets remain identifiable and can never become an implicit select-all. */
export function normalizeSelectionSets(value,validIds){
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>20)throw new Error('选择集须为列表，最多 20 组');
  const known=validIds instanceof Set?validIds:new Set(validIds||[]),seen=new Set();
  return value.map(set=>{
    if(!set||typeof set!=='object'||Array.isArray(set)||!safeId(set.id)||seen.has(set.id)||typeof set.name!=='string'||!set.name.trim()||set.name.trim().length>40||!Array.isArray(set.items)||set.items.length>250||set.items.some(id=>!safeId(id)))throw new Error('选择集名称、标识或成员无效');
    seen.add(set.id);
    return {id:set.id,name:set.name.trim(),items:[...new Set(set.items)].filter(id=>known.has(id))};
  });
}

export function sanitizeSelectionSets(scene){
  return normalizeSelectionSets(scene.selectionSets,new Set((scene.items||[]).map(item=>item.id)));
}

/** Undirected connectivity through explicit saved links, not ray tracing.
 * Hidden devices are excluded and do not bridge visible branches by default. */
export function connectedItemIds(scene,seedIds,{includeHidden=false}={}){
  if(!Array.isArray(scene?.items)||!Array.isArray(scene?.connections))throw new Error('场景不完整');
  const items=new Map(scene.items.filter(item=>includeHidden||!item.hidden).map(item=>[item.id,item]));
  const seeds=[...new Set(seedIds||[])].filter(id=>items.has(id));
  if(!seeds.length)return [];
  const neighbors=new Map([...items.keys()].map(id=>[id,new Set()]));
  for(const edge of scene.connections){const a=edge.a?.item,b=edge.b?.item;if(!items.has(a)||!items.has(b))continue;neighbors.get(a).add(b);neighbors.get(b).add(a);}
  const visited=new Set(seeds),queue=[...seeds];
  for(let i=0;i<queue.length;i++)for(const id of neighbors.get(queue[i]))if(!visited.has(id)){visited.add(id);queue.push(id);}
  return scene.items.filter(item=>visited.has(item.id)).map(item=>item.id);
}

export function filterSceneItems(scene,{query='',filter='all'}={},definition=()=>null){
  if(!['all','visible','hidden','locked'].includes(filter))throw new Error('未知对象筛选条件');
  const terms=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return scene.items.filter(item=>{
    if(filter==='visible'&&item.hidden||filter==='hidden'&&!item.hidden||filter==='locked'&&!item.locked)return false;
    const d=definition(item.type)||{},haystack=[item.label,item.figureLabel,item.type,d.name,d.category].filter(Boolean).join(' ').toLocaleLowerCase();
    return terms.every(term=>haystack.includes(term));
  });
}

export function installSceneTools(api){
  const dialog=document.createElement('dialog');dialog.id='sceneToolsDialog';dialog.className='scene-tools-dialog';dialog.setAttribute('aria-label','对象管理');
  dialog.innerHTML=`<header class="scene-tools-head"><h2>对象管理</h2><button data-scene="close" aria-label="关闭对象管理">返回画布</button></header>
  <div class="scene-tools-layout"><section class="scene-tools-objects"><div class="scene-tools-search"><input data-scene="search" type="search" placeholder="搜索名称、标签或类别" aria-label="搜索场景对象"><select data-scene="filter" aria-label="筛选场景对象"><option value="all">全部对象</option><option value="visible">可见</option><option value="hidden">已隐藏</option><option value="locked">已锁定</option></select></div>
  <div class="scene-tools-selection"><span data-scene="count"></span><button data-scene="selectFiltered">选中筛选结果</button><button data-scene="clear">清空选择</button></div><div class="scene-tools-list" data-scene="list" aria-label="场景对象列表"></div><p class="scene-tools-hint">Shift + 点击多选；用“聚焦”查看当前选择。</p></section>
  <aside class="scene-tools-actions"><section><h3>当前选择</h3><div class="scene-tools-buttons"><button data-scene="focus">聚焦</button><button data-scene="connected">选择连通链路</button><button data-scene="lock">锁定</button><button data-scene="unlock">解锁</button><button data-scene="hide">隐藏</button><button data-scene="show">显示</button></div><label class="scene-tools-checkbox"><input data-scene="includeHidden" type="checkbox">链路选择包含隐藏对象</label><details><summary>链路选择范围</summary><p>按已有连接选择整个连通部分，包含分束支路；不计算光的传播方向。默认不穿过隐藏对象。</p></details></section>
  <section class="scene-tools-sets"><h3>常用选择集</h3><div class="scene-tools-save"><input data-scene="setName" maxlength="40" placeholder="例如：偏振分析支路" aria-label="选择集名称"><button data-scene="saveSet">保存</button></div><div data-scene="sets"></div><p class="scene-tools-hint">只记录器件选择，随工程保存，最多 20 组。</p></section></aside></div>
  <footer><p data-scene="status" role="status" aria-live="polite">选择对象后可批量操作；修改可用 Ctrl+Z 撤销。</p></footer>`;
  document.body.append(dialog);
  const launcher=document.createElement('button');launcher.id='sceneTools';launcher.type='button';launcher.textContent='对象管理';launcher.title='搜索对象、选择连通链路和保存选择集';
  (document.querySelector('.workspace-tabs')||document.querySelector('header .tools')||document.body).append(launcher);
  const q=name=>dialog.querySelector(`[data-scene="${name}"]`),state=()=>api.getState();
  let busy=false,serial=0;
  const selected=()=>{const ids=new Set(api.getSelection()||[]);return state().items.filter(item=>ids.has(item.id));};
  const say=message=>{q('status').textContent=message;api.toast?.(message);};
  const filtered=()=>filterSceneItems(state(),{query:q('search').value,filter:q('filter').value},api.definition);
  function selectIds(ids){
    const available=new Set(state().items.map(item=>item.id)),valid=[...new Set(ids)].filter(id=>available.has(id));
    if(api.selectMany)api.selectMany(valid);else{api.select(null,false);for(const id of valid)api.select(id,false,true);}refresh();return valid;
  }
  function getSets(){
    const raw=state().selectionSets||[],sets=sanitizeSelectionSets(state());
    return sets.map(set=>({...set,missing:new Set(raw.find(r=>r.id===set.id)?.items||[]).size-set.items.length}));
  }
  function refresh(){
    if(!dialog.open)return;
    const rows=filtered(),ids=new Set(api.getSelection()||[]),count=selected().length;
    q('count').textContent=`${rows.length} / ${state().items.length} 个对象 · 已选 ${count}`;
    q('list').innerHTML=rows.length?rows.map(item=>{const d=api.definition(item.type)||{};return `<button type="button" data-scene-item="${escape(item.id)}" class="scene-tools-item${ids.has(item.id)?' selected':''}" aria-pressed="${ids.has(item.id)}" title="${escape(item.label)}；Shift + 点击多选"><span class="scene-tools-dot" style="background:${/^#[0-9a-f]{6}$/i.test(item.color)?item.color:'#71818c'}"></span><span class="scene-tools-item-text"><b>${escape(item.figureLabel||item.label)}</b><small>${escape(item.figureLabel?item.label:d.category||item.type)}</small></span><span class="scene-tools-flags">${item.hidden?'隐藏 ':''}${item.locked?'锁定':''}</span></button>`;}).join(''):'<p class="scene-tools-empty">没有匹配对象，试试其他名称或筛选条件。</p>';
    for(const button of q('list').querySelectorAll('[data-scene-item]')){
      button.onclick=event=>{if(busy)return;api.select(button.dataset.sceneItem,false,!!(event.shiftKey||event.ctrlKey||event.metaKey));refresh();};
    }
    const sets=getSets();q('sets').innerHTML=sets.length?sets.map(set=>`<div class="scene-tools-set"><button data-scene-set="${escape(set.id)}" title="恢复选择：${escape(set.name)}"><span>${escape(set.name)}</span><small>${set.items.length} 件${set.missing?' · '+set.missing+' 件已删除':''}</small></button><button data-scene-remove="${escape(set.id)}" aria-label="删除选择集 ${escape(set.name)}" title="删除选择集">×</button></div>`).join(''):'<p class="scene-tools-empty">选择几个器件，命名后保存。</p>';
    for(const button of q('sets').querySelectorAll('[data-scene-set]'))button.onclick=()=>run(()=>restoreSet(button.dataset.sceneSet));
    for(const button of q('sets').querySelectorAll('[data-scene-remove]'))button.onclick=()=>run(()=>removeSet(button.dataset.sceneRemove));
    for(const name of ['focus','lock','unlock','hide','show','saveSet'])q(name).disabled=busy||!count;
    q('saveSet').disabled=busy||!count||sets.length>=20;
    q('selectFiltered').disabled=busy||!rows.length;
    q('clear').disabled=busy||!count;
    q('connected').disabled=busy||(!count&&!api.getSelectedEdge?.());
    for(const name of ['search','filter','includeHidden','setName'])q(name).disabled=busy;
    for(const button of dialog.querySelectorAll('[data-scene-item],[data-scene-set],[data-scene-remove]'))button.disabled=busy;
  }
  async function run(fn){try{return await fn();}catch(error){say(error.message);return null;}}
  function selectConnected(options={}){
    const scene=state(),seed=selected().map(item=>item.id),edge=scene.connections.find(edge=>edge.id===api.getSelectedEdge?.());
    if(edge)seed.push(edge.a.item,edge.b.item);
    if(!seed.length)throw new Error('请先选择器件或连接，再选择连通链路');
    const includeHidden=options.includeHidden??q('includeHidden').checked,ids=connectedItemIds(scene,seed,{includeHidden});
    if(!ids.length)throw new Error('所选对象已隐藏或不存在；可勾选包含隐藏对象');
    selectIds(ids);say(`已选择 ${ids.length} 个连通器件${includeHidden?'（含隐藏对象）':''}；分束支路也在选择范围内。`);return ids;
  }
  function saveSet(name=q('setName').value){
    const title=typeof name==='string'?name.trim():'';if(!title||title.length>40)throw new Error('请输入 1–40 个字符的选择集名称');
    const chosen=selected().map(item=>item.id);if(!chosen.length)throw new Error('请先选择要保存的器件');
    const existing=sanitizeSelectionSets(state());if(existing.length>=20)throw new Error('最多保存 20 个选择集，请先删除不再使用的组');
    let id;do{id='selection_'+Date.now().toString(36)+'_'+(++serial);}while(existing.some(set=>set.id===id));
    const set={id,name:title,items:chosen};api.checkpoint();state().selectionSets=[...existing,set];api.persist();q('setName').value='';refresh();say(`已保存“${title}”，共 ${chosen.length} 个器件。`);return clone(set);
  }
  function restoreSet(id){
    const set=getSets().find(set=>set.id===id);if(!set)throw new Error('选择集不存在，请重新打开对象管理');
    if(!set.items.length)throw new Error('这组器件均已删除，未改变当前选择；可删除这个空选择集');
    const ids=selectIds(set.items),hidden=state().items.filter(item=>ids.includes(item.id)&&item.hidden).length;
    say(`已恢复“${set.name}”：${ids.length} 个器件${set.missing?'，跳过 '+set.missing+' 个已删除成员':''}${hidden?'，其中 '+hidden+' 个已隐藏':''}。`);return ids;
  }
  function removeSet(id){
    const sets=sanitizeSelectionSets(state()),target=sets.find(set=>set.id===id);if(!target)throw new Error('选择集不存在');
    api.checkpoint();state().selectionSets=sets.filter(set=>set.id!==id);api.persist();refresh();say(`已删除选择集“${target.name}”；器件保留。`);return target;
  }
  async function setFlags(patch){
    if(busy)return null;
    if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||!Object.entries(patch).every(([key,value])=>['hidden','locked'].includes(key)&&typeof value==='boolean'))throw new Error('对象状态参数无效');
    const choices=selected();if(!choices.length)throw new Error('请先选择器件');
    const targets=choices.filter(item=>Object.entries(patch).some(([key,value])=>!!item[key]!==value));
    if(!targets.length){say('所选器件已处于该状态');return {changed:0};}
    const previous=targets.map(item=>({item,values:Object.fromEntries(Object.keys(patch).map(key=>[key,item[key]]))}));
    busy=true;dialog.setAttribute('aria-busy','true');refresh();
    try{api.checkpoint();for(const item of targets)Object.assign(item,patch);await api.rebuild();api.persist();say(`已${patch.hidden===true?'隐藏':patch.hidden===false?'显示':patch.locked?'锁定':'解锁'} ${targets.length} 个器件。`);return {changed:targets.length};}
    catch(error){for(const {item,values} of previous)for(const [key,value] of Object.entries(values)){if(value===undefined)delete item[key];else item[key]=value;}try{await api.rebuild();api.persist();}catch{}throw error;}
    finally{busy=false;dialog.setAttribute('aria-busy','false');refresh();}
  }
  function open(){if(!dialog.open)dialog.showModal();refresh();q('search').focus();}
  function close(){if(!busy)dialog.close();}
  launcher.onclick=open;q('close').onclick=close;q('search').oninput=refresh;q('filter').onchange=refresh;
  q('selectFiltered').onclick=()=>run(()=>{const ids=filtered().map(item=>item.id);if(!ids.length)throw new Error('没有可选的筛选结果');selectIds(ids);say(`已选择筛选结果中的 ${ids.length} 个器件。`);});
  q('clear').onclick=()=>{selectIds([]);say('已清空选择');};
  q('focus').onclick=()=>run(()=>{if(!selected().length)throw new Error('请先选择器件');if(selected().every(item=>item.hidden))throw new Error('所选器件均已隐藏，请先显示');api.focusSelected();close();});
  q('connected').onclick=()=>run(()=>selectConnected());q('saveSet').onclick=()=>run(()=>saveSet());
  for(const [action,patch] of Object.entries({lock:{locked:true},unlock:{locked:false},hide:{hidden:true},show:{hidden:false}}))q(action).onclick=()=>run(()=>setFlags(patch));
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('keydown',event=>event.stopPropagation());
  return {open,close,refresh,selectConnected,saveSet,restoreSet,removeSet,getSets,setFlags,isBusy:()=>busy,destroy:()=>{dialog.remove();launcher.remove();}};
}
