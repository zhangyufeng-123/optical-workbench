const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const packageConfig = require('./package.json');
const expectedVersion = 'V' + packageConfig.version.split('.').slice(0, 2).join('.');

const directory = path.join(__dirname, 'qa');
const executable = path.join(__dirname, 'dist', packageConfig.build.win.artifactName);
const profile = path.join(directory, 'portable-' + packageConfig.version + '-profile-' + Date.now());
const port = 19453;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const results = [];
async function waitFor(test, name, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await test()) return;
    await delay(150);
  }
  throw new Error('Timed out ' + name);
}

async function launch() {
  const process = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
    windowsHide: true,
    stdio: 'ignore'
  });
  let endpoint;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      endpoint = pages.find(page => page.type === 'page' && page.url.includes('.html'));
      if (endpoint) break;
    } catch {}
    await delay(300);
  }
  assert.ok(endpoint, 'Portable EXE exposes running application page');
  const socket = new WebSocket(endpoint.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timed out ' + method));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await command('Network.enable');
  await command('Network.setBlockedURLs', { urls: ['http://*', 'https://*'] });
  while (Date.now() < deadline) {
    if (await evaluate('window.lab?.ready === true')) break;
    await delay(200);
  }
  assert.ok(await evaluate('lab.ready'), 'Portable app ready');
  return {
    evaluate,
    command,
    async close() {
      await evaluate('setTimeout(() => window.close(), 100); true');
      socket.close();
      if (process.exitCode === null) {
        await Promise.race([
          new Promise(resolve => process.once('exit', resolve)),
          delay(20000).then(() => { throw new Error('Portable process did not exit'); })
        ]);
      }
      await delay(500);
    }
  };
}

(async () => {
  let instance;
  try {
    instance = await launch();
    assert.equal(await instance.evaluate('lab.getCatalog().length'), 100);
    assert.ok(await instance.evaluate(`document.title.includes(${JSON.stringify(expectedVersion)}) && typeof lab.getAssemblyTools==='function' && document.getElementById('cancelConnection') && document.getElementById('editBoardSize') && document.getElementById('boardW').max==='10000'`));
    assert.ok(await instance.evaluate(`(()=>{const settings=lab.getRenderStudio().getSettings();return settings.style==='paper' && settings.background==='white' && settings.table==='none' && settings.useSceneColors===false && settings.preserveConnectionColors===true;})()`));
    results.push('Actual single-file portable EXE launches offline');
    results.push(expectedVersion + ' assembly, connection cancellation and native board-size entry points are present');
    results.push('White paper artwork, hidden board and original optical colors are the native render defaults');
    assert.equal(await instance.evaluate('lab.getNatureReferences().getCount()'), 100);
    assert.ok(await instance.evaluate(`typeof lab.getReferenceRenderProfiles==='function'`));
    assert.ok(await instance.evaluate(`(()=>{const profiles=lab.getReferenceRenderProfiles(),papers=[...document.querySelectorAll('.nature-reference-card')].map(card=>card.dataset.doi),dois=new Set(profiles.map(profile=>profile.doi));return profiles.length===100 && dois.size===100 && papers.length===100 && papers.every(doi=>dois.has(doi)) && profiles.every(profile=>profile.parameters?.version===1 && profile.evidence?.source?.doi===profile.doi);})()`));
    assert.ok(await instance.evaluate("typeof window.opticalAI?.createJob==='function' && typeof lab.getAIStudio?.().open==='function'"));
    assert.equal(await instance.evaluate('lab.getRenderStudio().getSettings().tightFrame'), true);
    await instance.evaluate("document.getElementById('shellTab_ai').click()");
    assert.equal(await instance.evaluate("document.getElementById('shellPanel_ai').hidden"), false);
    results.push('100 Nature references, native AI bridge and AI panel ship in the EXE');
    results.push('100 native reference-render profiles match the packaged paper DOIs and source evidence');
    results.push('Tight framing is enabled by default in the EXE');

    await instance.evaluate(`lab.preset('waveplate')`);
    assert.ok(await instance.evaluate(`(()=>{const state=lab.getState(),catalog=lab.getCatalog();return state.items.length===5&&state.connections.length===4&&state.items.every(item=>!!catalog.find(definition=>definition.id===item.type)?.product)&&typeof lab.getConnectionRouting==='function'&&typeof lab.getFiberConnectorDetails==='function';})()`));
    results.push('Five product models, four fiber connections and connector-routing diagnostics are present in the EXE');
    assert.ok(await instance.evaluate(`typeof lab.autoLayout==='function' && typeof lab.getConnectionLogicTools==='function' && document.getElementById('autoLayout') && document.getElementById('connectionLogic')`));
    await instance.evaluate(`(()=>{const project=lab.getState();project.items.forEach((item,index)=>{item.x=[640,-500,80,-750,390][index];item.z=[220,-190,100,-70,-250][index];});return lab.load(project);})()`);
    const originalConnections = await instance.evaluate('JSON.stringify(lab.getState().connections)');
    await instance.evaluate(`document.getElementById('autoLayout').click()`);
    while (await instance.evaluate('lab.getConnectionLogicTools().isBusy()')) await delay(150);
    assert.ok(await instance.evaluate(`(()=>{const items=lab.getState().items;return items.every((item,index)=>index===0||item.x>items[index-1].x);})()`));
    assert.equal(await instance.evaluate('JSON.stringify(lab.getState().connections)'), originalConnections);
    await instance.evaluate(`document.getElementById('connectionLogic').click()`);
    assert.ok(await instance.evaluate(`document.getElementById('connectionLogicDialog').open && !!document.getElementById('connectionLogicText') && !document.getElementById('layoutExpandBoard').checked`));
    await instance.evaluate(`document.getElementById('closeConnectionLogic').click()`);
    results.push('Actual portable one-click layout arranges the chain with connections intact and exposes the connection-text dialog');
    await instance.evaluate(`lab.selectMany(lab.getState().items.slice(0,2).map(item=>item.id))`);
    await instance.evaluate(`document.getElementById('editBoardSize').click()`);
    const boardSelection = await instance.evaluate('lab.getSelection().slice().sort()');
    const boardConnections = await instance.evaluate('JSON.stringify(lab.getState().connections)');
    assert.ok(await instance.evaluate(`!document.getElementById('shellSettingsPanel').hidden && document.activeElement.id==='boardW'`));
    assert.ok(await instance.evaluate(`['boardW','boardD'].every(id=>{const input=document.getElementById(id);return input.type==='number' && input.min==='300' && input.max==='10000' && input.step==='any';})`));
    await instance.evaluate(`document.getElementById('boardW').value='1375.5'; document.getElementById('boardD').value='865.25'`);
    assert.ok(await instance.evaluate(`document.getElementById('boardW').checkValidity() && document.getElementById('boardD').checkValidity()`));
    await instance.evaluate(`document.getElementById('resize').onclick()`);
    assert.deepEqual(await instance.evaluate('lab.getState().board'), { width: 1375.5, depth: 865.25 });
    assert.deepEqual(await instance.evaluate('lab.getSelection().slice().sort()'), boardSelection);
    assert.equal(await instance.evaluate('JSON.stringify(lab.getState().connections)'), boardConnections);
    results.push('Normal board-size controls accept custom 1375.5 by 865.25 mm dimensions and preserve selection and optical connections');
    await instance.evaluate(`document.getElementById('boardW').value='299.5'`);
    assert.equal(await instance.evaluate(`document.getElementById('boardW').checkValidity()`), false);
    await instance.evaluate(`document.getElementById('resize').onclick()`);
    assert.deepEqual(await instance.evaluate('lab.getState().board'), { width: 1375.5, depth: 865.25 });
    assert.equal(await instance.evaluate('JSON.stringify(lab.getState().connections)'), boardConnections);
    await instance.evaluate(`document.getElementById('boardW').value='1375.5'; document.getElementById('boardD').value='865.25'; document.getElementById('shellTab_properties').click()`);
    results.push('Out-of-range native inputs are rejected without changing board dimensions or connections');

    const count = await instance.evaluate('lab.getState().items.length');
    await instance.evaluate(`lab.add(lab.getCatalog()[0].id)`);
    await instance.evaluate(`lab.getTypographyStudio().apply({chinese:'SimHei',latin:'Arial',screenPx:16,fontPt:9,bold:true})`);
    assert.equal(await instance.evaluate('lab.getState().items.length'), count + 1);
    const finalCoordinates = await instance.evaluate('lab.getState().items.map(item=>[item.id,item.x,item.y,item.z,item.rotation,item.scale])');
    await instance.evaluate("lab.setTextVisibility('showLabels',true);document.getElementById('renderNow').click()");
    await waitFor(() => instance.evaluate('!lab.getRenderStudio().isBusy()&&!!lab.getRenderStudio().getResult()'), 'portable label render');
    assert.ok(await instance.evaluate("!!document.querySelector('[data-label-sheet] svg [data-j-ann]')&&typeof lab.getRenderStudio().flushEdits==='function'"));
    const savedLabelSourceId = await instance.evaluate('lab.getRenderStudio().getResult().composition.panels[0].annotations[0].sourceId');
    const labelPoint = await instance.evaluate("(()=>{const box=document.querySelector('[data-label-sheet] [data-j-ann]').getBoundingClientRect();return {x:box.x+box.width/2,y:box.y+box.height/2};})()");
    await instance.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...labelPoint, button: 'left', clickCount: 1 });
    await instance.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...labelPoint, button: 'left', clickCount: 1 });
    await instance.evaluate("(()=>{const input=document.querySelector('[data-label-field=text]');input.value='EXE 保存验证 · Editable label';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();})()");
    await instance.evaluate('lab.getRenderStudio().flushEdits()');
    assert.equal(await instance.evaluate('lab.getRenderStudio().getResult().composition.panels[0].annotations[0].text'), 'EXE 保存验证 · Editable label');
    assert.ok(await instance.evaluate('!!lab.getState().presentation.renderLabels'));
    results.push('Actual portable render preview supports text editing and persists label metadata');
    const screenshot = await instance.command('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(directory, 'portable-preview.png'), Buffer.from(screenshot.data, 'base64'));
    await instance.close();
    instance = await launch();
    assert.equal(await instance.evaluate('lab.getState().items.length'), count + 1);
    assert.deepEqual(await instance.evaluate('lab.getState().items.map(item=>[item.id,item.x,item.y,item.z,item.rotation,item.scale])'), finalCoordinates);
    assert.equal(await instance.evaluate('lab.getState().presentation.typography.chinese'), 'SimHei');
    assert.deepEqual(await instance.evaluate('lab.getState().board'), { width: 1375.5, depth: 865.25 });
    assert.equal(await instance.evaluate('JSON.stringify(lab.getState().connections)'), boardConnections);
    await instance.evaluate("document.getElementById('renderNow').click()");
    await waitFor(() => instance.evaluate('!lab.getRenderStudio().isBusy()&&!!lab.getRenderStudio().getResult()'), 'reopened portable label render');
    assert.equal(await instance.evaluate('lab.getRenderStudio().getResult().composition.panels[0].annotations.find(annotation=>annotation.sourceId===' + JSON.stringify(savedLabelSourceId) + ').text'), 'EXE 保存验证 · Editable label');
    assert.ok(await instance.evaluate(`(()=>{const annotation=lab.getRenderStudio().getResult().composition.panels[0].annotations.find(value=>value.sourceId===${JSON.stringify(savedLabelSourceId)});const text=document.querySelector('[data-label-sheet] text[data-j-ann="'+annotation.id+'"]');let leader=text.previousElementSibling;while(leader&&leader.tagName.toLowerCase()!=='line')leader=leader.previousElementSibling;return !Number.isFinite(annotation.leaderStartX)&&!Number.isFinite(annotation.leaderStartY)&&!!leader&&Math.abs(Number(leader.getAttribute('x1'))-Number(text.getAttribute('x')))<.001&&Math.abs(Number(leader.getAttribute('y1'))-Number(text.getAttribute('y'))-Number(text.getAttribute('font-size'))*.25)<.001;})()`));
    results.push('Edited paper labels survive closing and reopening the actual single-file EXE');
    results.push('Reopened edited label leader starts at its current text instead of the old generated position');
    results.push('Project geometry and font selection persist after closing and reopening portable EXE');
    results.push('Custom decimal board dimensions and optical connections persist after closing and reopening portable EXE');
    results.push('Automatically arranged device coordinates persist after closing and reopening portable EXE');
    await instance.close();
    instance = null;
    fs.writeFileSync(path.join(directory, 'portable-checks.json'), JSON.stringify({ allPassed: true, checks: results }, null, 2));
    console.log(results.join('\n'));
  } catch (error) {
    console.error(error);
    if (instance) await instance.close().catch(() => {});
    fs.writeFileSync(path.join(directory, 'portable-checks.json'), JSON.stringify({ allPassed: false, checks: results, error: error.stack }, null, 2));
    process.exitCode = 1;
  }
})();
