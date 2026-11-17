import { extractModule, mergeModule } from './drawing-tools.js';
import { movableAssemblyItems } from './assembly-state.js';

export function installAssemblyTools(api) {
  const launcher = document.createElement('button');
  launcher.id = 'assemblyTools'; launcher.textContent = '组合器件与立杆';
  document.querySelector('.workspace-tabs').append(launcher);
  const dialog = document.createElement('dialog');
  dialog.className = 'assembly-dialog'; dialog.id = 'assemblyDialog';
  dialog.setAttribute('aria-label', '组合器件与立杆');
  dialog.innerHTML = `<header><h2>组合器件与立杆</h2><button data-assembly="close">返回搭建台</button></header>
    <p data-assembly="selection"></p>
    <section><h3>自定义组合</h3><label>组合名称<input data-assembly="name" maxlength="100" value="自定义组合器件"></label>
      <div class="assembly-actions"><button data-assembly="group">组合所选器件</button><button data-assembly="ungroup">拆开组合</button></div>
      <p>Shift 多选器件后组合。选择组合中的任一器件，可整体移动、旋转和复制。</p>
      <div class="assembly-actions"><button data-assembly="export">保存组合文件</button><button data-assembly="import">添加组合文件</button></div>
      <input data-assembly="file" type="file" accept=".json,application/json" hidden>
    </section>
    <section><h3>立杆支撑</h3><div class="assembly-fields"><label>立杆高度 / mm<input data-assembly="height" type="number" min="20" max="1500" step="5" value="100"></label>
      <label>杆径 / mm<input data-assembly="diameter" type="number" min="6" max="80" step="1" value="12"></label>
      <label>底座直径 / mm<input data-assembly="baseWidth" type="number" min="20" max="400" step="5" value="60"></label></div>
      <div class="assembly-actions"><button class="primary" data-assembly="support">添加或调整立杆</button><button data-assembly="removeSupport">移除立杆</button></div>
      <p>立杆与器件一起移动。调整立杆高度时，底座位置保持固定，器件和端口同步升降。</p>
    </section><footer><span data-assembly="status" role="status">所有修改可撤销，组合与立杆随工程保存。</span></footer>`;
  document.body.append(dialog);
  const control = name => dialog.querySelector(`[data-assembly="${name}"]`);
  let busy = false;
  const selection = () => api.getSelection();
  const chosen = () => api.getState().items.filter(item => selection().includes(item.id));
  function refresh() {
    const items = chosen(), groups = new Set(items.map(item => item.assemblyId).filter(Boolean));
    control('selection').textContent = `已选 ${items.length} 个器件，${groups.size} 个组合`;
  }
  function name() {
    const value = control('name').value.trim();
    if (!value || value.length > 100) throw new Error('请填写 1–100 个字符的组合名称');
    return value;
  }
  function editable(next) {
    const items = movableAssemblyItems(next, selection());
    if (!items.length) throw new Error('请先选择未锁定的器件');
    if (items.length !== chosen().length) throw new Error('所选组合包含已锁定器件，请先解锁');
    return items;
  }
  async function commit(next, ids, message) {
    await api.loadState(next, true); api.selectMany(ids); refresh();
    control('status').textContent = message; api.toast(message);
  }
  async function group() {
    const next = structuredClone(api.getState()), items = editable(next);
    if (items.length < 2) throw new Error('Shift 多选至少两个器件后组合');
    const assemblyId = api.uid('assembly'), assemblyName = name();
    for (const item of items) Object.assign(item, { assemblyId, assemblyName });
    await commit(next, items.map(item => item.id), '已创建组合，可整体移动和旋转');
  }
  async function ungroup() {
    const next = structuredClone(api.getState()), items = editable(next);
    for (const item of items) { delete item.assemblyId; delete item.assemblyName; }
    await commit(next, items.map(item => item.id), '已拆开组合，各器件可独立编辑');
  }
  async function applySupport(values) {
    const dimensions = values || Object.fromEntries(['height', 'diameter', 'baseWidth'].map(key => [key, Number(control(key).value)]));
    if (!Number.isFinite(dimensions.height) || dimensions.height < 20 || dimensions.height > 1500 || !Number.isFinite(dimensions.diameter) || dimensions.diameter < 6 || dimensions.diameter > 80 || !Number.isFinite(dimensions.baseWidth) || dimensions.baseWidth < dimensions.diameter || dimensions.baseWidth < 20 || dimensions.baseWidth > 400) throw new Error('立杆高度须为 20–1500 mm，杆径为 6–80 mm，底座为 20–400 mm 且不小于杆径');
    const next = structuredClone(api.getState()), items = editable(next);
    for (const item of items) {
      const previous = (item.support?.height || 0) * item.scale;
      item.y = (item.y || 0) + dimensions.height - previous;
      item.support = { height: dimensions.height / item.scale, radius: dimensions.diameter / 2 / item.scale, baseWidth: dimensions.baseWidth / item.scale };
    }
    await commit(next, items.map(item => item.id), '立杆已更新，器件和光学端口已同步升降');
  }
  async function removeSupport() {
    const next = structuredClone(api.getState()), items = editable(next);
    for (const item of items) {
      item.y = (item.y || 0) - (item.support?.height || 0) * item.scale;
      delete item.support;
    }
    await commit(next, items.map(item => item.id), '已移除立杆，器件回到原底座高度');
  }
  function exportAssembly() {
    const module = extractModule(api.getState(), selection(), name()), assemblyId = api.uid('assembly');
    for (const item of module.items) Object.assign(item, { assemblyId, assemblyName: module.title });
    const content = JSON.stringify(module, null, 2);
    if (new Blob([content]).size > 50 * 1024 * 1024) throw new Error('组合文件超过 50 MB，请减少导入模型');
    api.download(content, module.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '_组合器件.json', 'application/json');
    return module;
  }
  async function importAssembly(module) {
    const [offsetX, offsetZ] = api.findSpot();
    const result = mergeModule(api.getState(), module, { offsetX, offsetZ, uid: api.uid, validate: api.validate });
    await commit(result.scene, result.ids, '已添加组合器件');
    return result.ids;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    dialog.querySelectorAll('button,input').forEach(element => element.disabled = true);
    try { return await action(); }
    catch (error) { control('status').textContent = error.message; api.toast(error.message); }
    finally { busy = false; dialog.querySelectorAll('button,input').forEach(element => element.disabled = false); refresh(); }
  }
  function open() {
    refresh(); const item = chosen()[0];
    control('name').value = item?.assemblyName || '自定义组合器件';
    if (item?.support) {
      control('height').value = String(item.support.height * item.scale);
      control('diameter').value = String(item.support.radius * 2 * item.scale);
      control('baseWidth').value = String(item.support.baseWidth * item.scale);
    }
    if (!dialog.open) dialog.showModal();
  }
  const close = () => { if (!busy) dialog.close(); };
  launcher.onclick = open; control('close').onclick = close;
  for (const [button, action] of [['group', group], ['ungroup', ungroup], ['support', () => applySupport()], ['removeSupport', removeSupport], ['export', exportAssembly]]) control(button).onclick = () => run(action);
  control('import').onclick = () => control('file').click();
  control('file').onchange = () => {
    const file = control('file').files[0]; control('file').value = '';
    if (file) run(async () => { if (file.size > 50 * 1024 * 1024) throw new Error('组合文件超过 50 MB'); await importAssembly(JSON.parse(await file.text())); });
  };
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  return { open, close, refresh, group, ungroup, applySupport, removeSupport, exportAssembly, importAssembly };
}
