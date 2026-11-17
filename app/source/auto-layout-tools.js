export function installAutoLayoutTools(api) {
  const launch = document.createElement('button');
  launch.id = 'autoLayout';
  launch.textContent = '一键排版';
  launch.title = '按连接关系整理器件位置与光纤走线';
  const logic = document.createElement('button');
  logic.id = 'connectionLogic';
  logic.textContent = '输入连接关系…';
  document.querySelector('.workspace-tabs').append(launch, logic);

  const dialog = document.createElement('dialog');
  dialog.id = 'connectionLogicDialog';
  dialog.className = 'auto-layout-dialog';
  dialog.setAttribute('aria-labelledby', 'connectionLogicTitle');
  dialog.innerHTML = `<header><h2 id="connectionLogicTitle">连接关系与自动排版</h2><button id="closeConnectionLogic" type="button">返回搭建台</button></header>
    <label class="connection-logic-label" for="connectionLogicText">连接关系</label>
    <textarea id="connectionLogicText" rows="7" maxlength="30000" spellcheck="false" placeholder="光源 → 起偏器 → 偏振控制器 → 绕制光纤 → 偏振分析仪"></textarea>
    <p class="auto-layout-hint">每行写一条连接链。已有器件会复用，缺少的器件会从器件库添加。分支可写成多行，并指定端口。</p>
    <div class="auto-layout-examples"><button type="button" data-layout-example="chain">填入绕纤链路</button><button type="button" data-layout-example="branch">填入分光链路</button></div>
    <details><summary>名称、重复器件与端口写法</summary><p>同类器件可先声明别名，例如“探测1 = photodiode”。连接时使用“分光器.a → 探测1.in”。再次使用相同别名会复用该器件。</p><pre>光源 = laser
分光器 = splitter
探测1 = photodiode
探测2 = photodiode
光源 → 分光器.in
分光器.a → 探测1.in
分光器.b → 探测2.in</pre></details>
    <details><summary>当前场景器件与端口</summary><div class="auto-layout-inventory" data-layout-inventory></div></details>
    <label class="auto-layout-option"><input id="layoutExpandBoard" type="checkbox">空间不足时自动扩展台面</label>
    <div class="auto-layout-actions"><button id="layoutExistingConnections" type="button">按现有连接排版</button><button id="applyConnectionLogic" class="primary" type="button">生成并排版</button></div>
    <p id="connectionLogicStatus" class="auto-layout-status" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const text = dialog.querySelector('#connectionLogicText');
  const status = dialog.querySelector('#connectionLogicStatus');
  let busy = false, previousFocus = null;

  function refreshInventory() {
    const inventory = dialog.querySelector('[data-layout-inventory]');
    inventory.replaceChildren();
    const scene = api.getState();
    if (!scene.items.length) {
      inventory.textContent = '场景为空，输入连接关系即可添加器件。';
      return;
    }
    for (const item of scene.items) {
      const row = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.label;
      const ports = document.createElement('span');
      ports.textContent = (item.ports || api.definition(item.type).ports).map(port => `${port.id}（${port.label || port.role}）`).join(' · ');
      const reference = document.createElement('code');
      reference.textContent = item.id;
      row.append(title, ports, reference);
      inventory.append(row);
    }
  }
  function open() {
    if (busy) return;
    previousFocus = document.activeElement;
    refreshInventory();
    if (!dialog.open) dialog.showModal();
    text.focus();
  }
  function close() {
    if (busy) return;
    dialog.close();
    previousFocus?.focus?.();
  }
  function describe(result) {
    const parts = [];
    if (result.logic?.addedItems) parts.push(`添加 ${result.logic.addedItems} 个器件`);
    if (result.logic?.addedConnections) parts.push(`建立 ${result.logic.addedConnections} 条连接`);
    parts.push(result.layout.changed ? `已排版 ${result.layout.movedItems} 个器件` : '当前布局已整理');
    if (result.layout.boardChanged) parts.push(`台面 ${result.layout.board.width} × ${result.layout.board.depth} mm`);
    return parts.join('，');
  }
  async function run(connectionText) {
    if (busy) return;
    busy = true;
    launch.disabled = logic.disabled = true;
    dialog.querySelectorAll('button,input,textarea').forEach(element => element.disabled = true);
    status.textContent = '正在按连接关系排版…';
    try {
      const result = await api.apply(connectionText, { expandBoard: dialog.querySelector('#layoutExpandBoard').checked });
      status.textContent = describe(result);
      api.toast(status.textContent);
      refreshInventory();
      if (dialog.open) dialog.close();
      return result;
    } catch (error) {
      status.textContent = error.message;
      api.toast(error.message);
      if (!dialog.open) {
        previousFocus = launch;
        refreshInventory();
        dialog.showModal();
      }
      return { error: error.message };
    } finally {
      busy = false;
      launch.disabled = logic.disabled = false;
      dialog.querySelectorAll('button,input,textarea').forEach(element => element.disabled = false);
    }
  }
  launch.onclick = () => api.getState().items.length ? run(null) : open();
  logic.onclick = open;
  dialog.querySelector('#closeConnectionLogic').onclick = close;
  dialog.querySelector('#layoutExistingConnections').onclick = () => run(null);
  dialog.querySelector('#applyConnectionLogic').onclick = () => run(text.value);
  dialog.querySelector('[data-layout-example="chain"]').onclick = () => {
    text.value = '光源 → 起偏器 → 偏振控制器 → 绕制光纤 → 偏振分析仪';
    text.focus();
  };
  dialog.querySelector('[data-layout-example="branch"]').onclick = () => {
    text.value = '光源 = laser\n分光器 = splitter\n探测1 = photodiode\n探测2 = photodiode\n光源 → 分光器.in\n分光器.a → 探测1.in\n分光器.b → 探测2.in';
    text.focus();
  };
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      run(text.value);
    }
  });
  return { open, close, apply: () => run(text.value), arrange: () => run(null), isBusy: () => busy, getStatus: () => status.textContent };
}
