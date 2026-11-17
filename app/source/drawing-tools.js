import {remapAssembly} from './assembly-state.js';
const clone = value => structuredClone(value);
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) && !['__proto__','prototype','constructor'].includes(value);
const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const MAX_ITEMS = 250, MAX_CONNECTIONS = 600;

function checkModule(module) {
  if (!module || module.format !== 'optical-subassembly' || module.version !== 1 || module.units !== 'mm') throw new Error('这不是兼容的子装配文件');
  if (typeof module.title !== 'string' || !module.title.trim() || module.title.length > 150) throw new Error('子装配名称无效');
  if (!Array.isArray(module.items) || !module.items.length || module.items.length > MAX_ITEMS || !Array.isArray(module.connections) || module.connections.length > MAX_CONNECTIONS) throw new Error('子装配需要 1–250 个器件，连接最多 600 条');
  if (!Array.isArray(module.custom || []) || typeof (module.assets || {}) !== 'object' || Array.isArray(module.assets)) throw new Error('子装配模型资源无效');
  const ids = new Set(), edges = new Set(), types = new Set();
  for (const item of module.items) {
    if (!safeId(item.id) || ids.has(item.id) || !safeId(item.type)) throw new Error('子装配器件标识重复或无效');
    if (![item.x,item.z,item.rotation,item.scale].every(Number.isFinite) || (item.y !== undefined && !Number.isFinite(item.y))) throw new Error('子装配坐标无效');
    ids.add(item.id); types.add(item.type);
  }
  for (const edge of module.connections) {
    if (!safeId(edge.id) || edges.has(edge.id) || ![edge.a,edge.b].every(end => end && ids.has(end.item) && safeId(end.port))) throw new Error('子装配包含无效或外部连接');
    if (edge.waypoints && (!Array.isArray(edge.waypoints) || edge.waypoints.length > 20 || edge.waypoints.some(point => ![point.x,point.y,point.z].every(Number.isFinite)))) throw new Error('子装配布线控制点无效');
    edges.add(edge.id);
  }
  const customIds = new Set();
  for (const definition of module.custom || []) {
    if (!safeId(definition.id) || customIds.has(definition.id) || !types.has(definition.id) || definition.shape !== 'import') throw new Error('子装配自有器件定义无效或未被使用');
    if (!own(module.assets || {}, definition.id) || typeof module.assets[definition.id] !== 'string') throw new Error('子装配缺少自有模型资源');
    customIds.add(definition.id);
  }
  return module;
}

/** Extract a centered, self-contained group. Boundary connections are excluded. */
export function extractModule(scene, selection, title = '光路子装配') {
  const ids = new Set(selection || []);
  const items = scene.items.filter(item => ids.has(item.id)).map(clone);
  if (!items.length) throw new Error('请先选择要保存的器件；Shift + 点击可以多选');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 150) throw new Error('子装配名称须为 1–150 个字符');
  const included = new Set(items.map(item => item.id));
  const connections = scene.connections.filter(edge => included.has(edge.a.item) && included.has(edge.b.item)).map(clone);
  const originX = (Math.min(...items.map(item => item.x)) + Math.max(...items.map(item => item.x))) / 2;
  const originZ = (Math.min(...items.map(item => item.z)) + Math.max(...items.map(item => item.z))) / 2;
  for (const item of items) { item.x -= originX; item.z -= originZ; }
  for (const edge of connections) for (const point of edge.waypoints || []) { point.x -= originX; point.z -= originZ; }
  const types = new Set(items.map(item => item.type));
  const custom = (scene.custom || []).filter(definition => types.has(definition.id)).map(clone);
  const assets = {};
  for (const definition of custom) {
    if (!safeId(definition.id)) throw new Error('选中的自有器件标识无效');
    if (!own(scene.assets || {}, definition.id)) throw new Error('选中的自有器件缺少 GLB 资源');
    assets[definition.id] = scene.assets[definition.id];
  }
  return checkModule({format:'optical-subassembly',version:1,units:'mm',title:title.trim(),origin:{x:originX,z:originZ},items,connections,custom,assets});
}

/** Return a validated new scene, leaving both inputs untouched. */
export function mergeModule(scene, module, {offsetX = 150, offsetZ = 150, uid, validate} = {}) {
  checkModule(module);
  if (typeof validate !== 'function') throw new Error('缺少工程校验接口，未导入子装配');
  if (![offsetX,offsetZ].every(value => Number.isFinite(value) && Math.abs(value) <= 10000)) throw new Error('放置中心须在 ±10000 mm 内');
  if (scene.items.length + module.items.length > MAX_ITEMS || scene.connections.length + module.connections.length > MAX_CONNECTIONS) throw new Error('导入后超过 250 个器件或 600 条连接，请减少数量');
  const merged = clone(scene); merged.custom ??= []; merged.assets ??= {};
  const used = new Set([...merged.items.map(item => item.id),...merged.items.map(item => item.type),...merged.connections.map(edge => edge.id),...merged.custom.map(definition => definition.id)]);
  let serial = 0;
  const generate = prefix => {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const id = uid ? uid(prefix) : `${prefix}_${Date.now().toString(36)}_${++serial}`;
      if (safeId(id) && !used.has(id)) { used.add(id); return id; }
    }
    throw new Error('无法分配唯一器件标识，导入未更改工程');
  };
  const itemMap = new Map(), typeMap = new Map(), assemblyMap = new Map();
  for (const definition of module.custom || []) {
    const id = generate('module_custom'); typeMap.set(definition.id,id);
    merged.custom.push({...clone(definition),id}); merged.assets[id] = module.assets[definition.id];
  }
  for (const original of module.items) {
    const item = clone(original); remapAssembly(item,assemblyMap,generate); item.id = generate('module_obj'); itemMap.set(original.id,item.id);
    item.type = typeMap.get(original.type) || original.type;
    item.x += offsetX; item.z += offsetZ;
    merged.items.push(item);
  }
  for (const original of module.connections) {
    const edge = clone(original); edge.id = generate(original.kind === 'beam' ? 'module_beam' : 'module_fiber');
    edge.a.item = itemMap.get(original.a.item); edge.b.item = itemMap.get(original.b.item);
    for (const point of edge.waypoints || []) { point.x += offsetX; point.z += offsetZ; }
    merged.connections.push(edge);
  }
  if (new TextEncoder().encode(JSON.stringify(merged,null,2)).byteLength > 100e6) throw new Error('追加后工程超过 100 MB，请减少自有模型资源');
  return {scene:validate(merged),ids:[...itemMap.values()],stats:{items:module.items.length,connections:module.connections.length,custom:(module.custom || []).length}};
}

export function installDrawingTools(api) {
  const dialog = document.createElement('dialog'); dialog.id = 'drawingToolsDialog'; dialog.className = 'drawing-tools-dialog';
  dialog.setAttribute('aria-label','绘图工具');
  dialog.innerHTML = `<header><div><h2>绘图工具</h2><p data-drawing="selection"></p></div><button data-drawing="close" aria-label="关闭绘图工具">返回搭建台</button></header>
  <div class="drawing-tool-sections">
    <section><h3>样式与颜色锁定</h3><p>复制器件外壳色与选中连接的样式，再粘贴到其他选择。</p><div class="drawing-actions"><button data-drawing="copy">复制样式</button><button data-drawing="paste">粘贴样式</button></div><div class="drawing-style-summary" data-drawing="clipboard">尚未复制样式</div><label class="drawing-check"><input data-drawing="pasteBody" type="checkbox" checked>器件外壳颜色</label><label class="drawing-check"><input data-drawing="pasteEdges" type="checkbox" checked>选中连接或内部连线</label><div class="drawing-actions"><button data-drawing="lock">锁定所选颜色</button><button data-drawing="unlock">解锁所选颜色</button></div><p class="drawing-note">粘贴跳过锁定颜色、锁定器件及自有 GLB 外壳，不改变光纤类型和连接关系。</p></section>
    <section><h3>论文短标签编号</h3><p>按器件 X 坐标、再按 Z 坐标排序，生成整齐的短标签。</p><label>编号前缀<input data-drawing="prefix" value="A" maxlength="12"></label><label>起始编号<input data-drawing="start" type="number" min="1" max="9999" value="1"></label><button data-drawing="number">给所选器件编号</button><p class="drawing-note">例如 A1、A2。只修改图中短标签，器件名称与参数保留；锁定器件不参与。</p></section>
    <section><h3>复用一段光路</h3><p>保存选中器件和内部连接，再追加到其他工程。</p><label>子装配名称<input data-drawing="moduleName" value="光路子装配" maxlength="100"></label><button data-drawing="exportModule">保存所选子装配</button><div class="drawing-pair"><label>放置中心 X / mm<input data-drawing="offsetX" type="number" value="150" min="-10000" max="10000"></label><label>放置中心 Z / mm<input data-drawing="offsetZ" type="number" value="150" min="-10000" max="10000"></label></div><button data-drawing="importModule">导入并追加子装配</button><input data-drawing="moduleFile" type="file" accept=".json,application/json" hidden><p class="drawing-note">最多 50 MB；保留自有 GLB 与端口。追加时自动分配新标识，不覆盖当前光路。</p></section>
  </div><footer><p data-drawing="status" role="status" aria-live="polite">修改可使用 Ctrl+Z 撤销。</p></footer>`;
  document.body.append(dialog);
  const q = name => dialog.querySelector(`[data-drawing="${name}"]`);
  const launcher = document.createElement('button'); launcher.id = 'drawingTools'; launcher.textContent = '绘图工具'; launcher.title = '样式复制、颜色锁定、编号与子装配复用';
  (document.querySelector('.workspace-tabs') || document.querySelector('header .tools') || document.body).append(launcher);
  let clipboard = null, busy = false;
  const state = () => api.getState();
  const chosen = () => { const ids = new Set(api.getSelection()); return state().items.filter(item => ids.has(item.id)); };
  const selectedEdges = () => {
    const ids = new Set(api.getSelection()), selected = api.getSelectedEdge?.();
    return state().connections.filter(edge => edge.id === selected || ids.has(edge.a.item) && ids.has(edge.b.item));
  };
  const say = message => { q('status').textContent = message; api.toast?.(message); };
  function refresh() {
    const items = chosen(); q('selection').textContent = `已选 ${items.length} 个器件、${selectedEdges().length} 条可操作连接`;
    q('paste').disabled = !clipboard || busy;
    q('clipboard').textContent = clipboard ? `已复制：${clipboard.bodyColor ? '外壳色 '+clipboard.bodyColor : ''}${clipboard.bodyColor && clipboard.edge ? '；' : ''}${clipboard.edge ? '连线色 '+clipboard.edge.color : ''}` : '尚未复制样式';
  }
  function copyStyle() {
    const item = chosen()[0], edge = selectedEdges()[0];
    if (!item && !edge) throw new Error('请先选择一个器件或连接');
    const candidate = {bodyColor:item && api.definition(item.type)?.shape !== 'import' ? item.color : null,edge:edge ? {color:edge.color,radius:edge.radius,glow:edge.glow} : null};
    if (!candidate.bodyColor && !candidate.edge) throw new Error('自有 GLB 保留原材质，请选择库内器件或连线复制样式');
    clipboard = candidate;
    refresh(); say('样式已复制；返回搭建台选择目标后粘贴'); return clone(clipboard);
  }
  async function pasteStyle({body = q('pasteBody').checked, edges = q('pasteEdges').checked} = {}) {
    if (!clipboard) throw new Error('请先复制样式');
    const items = body && color(clipboard.bodyColor) ? chosen().filter(item => !item.locked && !item.colorLocked && api.definition(item.type)?.shape !== 'import') : [];
    const targets = edges && clipboard.edge ? selectedEdges().filter(edge => !edge.colorLocked && ![edge.a.item,edge.b.item].some(id => state().items.some(item => item.id === id && (item.locked || item.colorLocked)))) : [];
    if (!items.length && !targets.length) throw new Error('没有可修改的目标；请检查选择、颜色锁定和粘贴范围');
    api.checkpoint();
    items.forEach(item => item.color = clipboard.bodyColor);
    targets.forEach(edge => {
      edge.color = clipboard.edge.color;
      if (Number.isFinite(clipboard.edge.radius)) edge.radius = Math.min(edge.kind === 'beam' ? 10 : 5,Math.max(.3,clipboard.edge.radius));
      if (edge.kind === 'beam' && Number.isFinite(clipboard.edge.glow)) edge.glow = Math.min(1,Math.max(0,clipboard.edge.glow));
    });
    await api.rebuild(); api.persist(); refresh(); say(`已粘贴样式：${items.length} 个器件、${targets.length} 条连接`);
    return {items:items.length,connections:targets.length};
  }
  async function setColorLock(locked) {
    const chosenItems = chosen(), chosenEdges = selectedEdges(), value = !!locked;
    if (!chosenItems.length && !chosenEdges.length) throw new Error('请先选择器件或连接');
    const items = chosenItems.filter(item => !!item.colorLocked !== value);
    const edges = chosenEdges.filter(edge => !!edge.colorLocked !== value);
    if (!items.length && !edges.length) {
      say(`所选器件与连接的颜色已${value ? '锁定' : '解锁'}，无需修改`);
      return {items:0,connections:0};
    }
    api.checkpoint();
    items.forEach(item => item.colorLocked = value); edges.forEach(edge => edge.colorLocked = value);
    await api.rebuild(); api.persist(); refresh();
    say(`已${value ? '锁定' : '解锁'} ${items.length} 个器件、${edges.length} 条连接的颜色`);
    return {items:items.length,connections:edges.length};
  }
  async function numberLabels(prefix = q('prefix').value, start = Number(q('start').value)) {
    if (typeof prefix !== 'string' || prefix.length > 12 || !Number.isInteger(start) || start < 1 || start > 9999) throw new Error('前缀最多 12 个字符，起始编号须为 1–9999 的整数');
    const items = chosen().filter(item => !item.locked).sort((a,b) => a.x-b.x || a.z-b.z || a.id.localeCompare(b.id));
    if (!items.length) throw new Error('请先选择未锁定的器件');
    api.checkpoint(); items.forEach((item,index) => { item.figureLabel = prefix.trim()+(start+index); item.showLabel = true; });
    await api.rebuild(); api.persist(); say(`已生成 ${items.length} 个论文短标签`); return items.map(item => item.figureLabel);
  }
  function exportModule() {
    const module = extractModule(state(),api.getSelection(),q('moduleName').value);
    const name = module.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    const json = JSON.stringify(module,null,2);
    if (new Blob([json]).size > 50*1024*1024) throw new Error('子装配超过 50 MB，请减少自有模型或选中器件数量');
    api.download(json,name+'_子装配.json','application/json');
    say(`已保存 ${module.items.length} 个器件与 ${module.connections.length} 条内部连接`); return module;
  }
  async function importModule(module, {offsetX = Number(q('offsetX').value), offsetZ = Number(q('offsetZ').value)} = {}) {
    if (typeof api.loadState !== 'function') throw new Error('工程加载接口未接入，当前工程未更改');
    const result = mergeModule(state(),module,{offsetX,offsetZ,uid:api.uid,validate:api.validate});
    await api.loadState(result.scene,true);
    if(api.selectMany)api.selectMany(result.ids);else{api.select?.(null); for (const id of result.ids) api.select?.(id,false,true);}
    refresh(); say(`已追加 ${result.stats.items} 个器件、${result.stats.connections} 条连接；可撤销恢复`); return result.stats;
  }
  async function run(action) {
    if (busy) return; busy = true; dialog.querySelectorAll('button,input').forEach(element => element.disabled = true);
    try { return await action(); } catch (error) { say(error.message || '操作未完成'); }
    finally { busy = false; dialog.querySelectorAll('button,input').forEach(element => element.disabled = false); refresh(); }
  }
  const open = () => { refresh(); if (!dialog.open) dialog.showModal(); };
  const close = () => { if (!busy) dialog.close(); };
  launcher.onclick = open; q('close').onclick = close;
  q('copy').onclick = () => run(copyStyle); q('paste').onclick = () => run(() => pasteStyle());
  q('lock').onclick = () => run(() => setColorLock(true)); q('unlock').onclick = () => run(() => setColorLock(false));
  q('number').onclick = () => run(() => numberLabels()); q('exportModule').onclick = () => run(exportModule);
  q('importModule').onclick = () => q('moduleFile').click();
  q('moduleFile').onchange = () => { const file = q('moduleFile').files[0]; q('moduleFile').value = ''; if (!file) return; run(async () => { if (file.size > 50*1024*1024) throw new Error('子装配文件超过 50 MB'); const module = JSON.parse(await file.text()); await importModule(module); }); };
  dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('keydown',event => event.stopPropagation());
  refresh();
  return {open,close,copyStyle,pasteStyle,setColorLock,numberLabels,exportModule,importModule,getClipboard:() => clipboard && clone(clipboard)};
}
