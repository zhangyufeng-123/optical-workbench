const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const desktopRoot = path.dirname(__dirname);
const packaged = process.argv.includes('--packaged');
const mode = packaged ? 'packaged' : 'native';
const runtimeRoot = packaged ? path.join(desktopRoot, 'dist/win-unpacked/resources/app.asar') : desktopRoot;
const output = path.join(__dirname, 'auto-layout-' + mode);
fs.mkdirSync(output, { recursive: true });
app.commandLine.appendSwitch('user-data-dir', path.join(output, 'profile-' + Date.now()));
const report = {
  checkedAt: new Date().toISOString(), mode, checks: [], downloads: [], rendererErrors: [], httpRequests: [],
  version: JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8')).version,
  bundleSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(runtimeRoot, 'web/app.js'))).digest('hex')
};
const reportPath = path.join(output, 'auto-layout-checks.json');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
function check(name, condition) {
  assert.ok(condition, name);
  report.checks.push(name);
  console.log('PASS', name);
  save();
}
async function bounded(promise, name, timeout = 120000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out ' + name)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}
async function waitFor(test, name, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await test()) return;
    await pause(150);
  }
  throw new Error('Timed out waiting for ' + name);
}
function core(state) { return { board: state.board, items: state.items, connections: state.connections }; }
function connectionIdentity(state) {
  return state.connections.map(edge => ({ id: edge.id, a: edge.a, b: edge.b, kind: edge.kind, color: edge.color, radius: edge.radius, fiber: edge.fiber }));
}
function positionSignature(state) {
  return state.items.map(item => [item.id, item.x, item.y, item.z, item.rotation, item.scale]);
}
function rigidSignature(state, ids = state.items.map(item => item.id)) {
  const items = state.items.filter(item => ids.includes(item.id)), anchor = items[0];
  return items.map(item => [item.id, item.x - anchor.x, item.y - anchor.y, item.z - anchor.z, item.rotation, item.scale]);
}
function same(first, second) {
  const serialize = value => JSON.stringify(value, (_key, entry) => typeof entry === 'number' ? Math.round(entry * 1e8) / 1e8 : entry);
  return serialize(first) === serialize(second);
}
function worldBounds(record) {
  const angle = record.item.rotation * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  const bounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] };
  for (const x of [record.bounds.min[0], record.bounds.max[0]]) for (const z of [record.bounds.min[2], record.bounds.max[2]]) {
    const point = [record.item.x + x * cosine + z * sine, record.item.z - x * sine + z * cosine];
    point.forEach((value, axis) => { bounds.min[axis] = Math.min(bounds.min[axis], value); bounds.max[axis] = Math.max(bounds.max[axis], value); });
  }
  return { ...bounds, id: record.item.id, assemblyId: record.item.assemblyId };
}
function overlaps(first, second) {
  return [0, 1].every(axis => first.min[axis] < second.max[axis] - .01 && first.max[axis] > second.min[axis] + .01);
}
function layoutBounds(records, board) {
  const boxes = records.filter(record => !record.item.hidden).map(worldBounds), collisions = [];
  for (let first = 0; first < boxes.length; first++) for (let second = first + 1; second < boxes.length; second++) {
    if (boxes[first].assemblyId && boxes[first].assemblyId === boxes[second].assemblyId) continue;
    if (overlaps(boxes[first], boxes[second])) collisions.push([boxes[first].id, boxes[second].id]);
  }
  const offTable = boxes.filter(box => box.min[0] < -board.width / 2 - .01 || box.max[0] > board.width / 2 + .01 || box.min[1] < -board.depth / 2 - .01 || box.max[1] > board.depth / 2 + .01);
  return { boxes, collisions, offTable };
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', event => { if (event.level === 'error') report.rendererErrors.push(event.message); });
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    report.httpRequests.push(details.url);
    callback({ cancel: true });
  });
});
require(path.join(runtimeRoot, 'main.cjs'));

let contents;
app.whenReady().then(async () => {
  try {
    const window = BrowserWindow.getAllWindows()[0];
    contents = window.webContents;
    contents.setBackgroundThrottling(false);
    window.setContentSize(1500, 960);
    const evaluate = script => bounded(contents.executeJavaScript(script, true), script.slice(0, 120));
    const state = () => evaluate('lab.getState()');
    const frame = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const idle = () => waitFor(() => evaluate("!lab.getConnectionLogicTools().isBusy()&&!document.getElementById('autoLayout').disabled"), 'layout controls idle');
    const layout = async () => {
      await evaluate("document.getElementById('autoLayout').click()");
      await idle();
      return state();
    };
    const geometry = () => evaluate('lab.getState().items.map(item=>({item,bounds:lab.getItemGeometryBounds(item.id)}))');
    const load = project => evaluate('lab.load(' + JSON.stringify(project) + ')');
    const screenshot = async name => {
      await frame();
      fs.writeFileSync(path.join(output, name), (await bounded(contents.capturePage(), name, 20000)).toPNG());
    };
    const enterLogic = async (text, expand = false) => {
      await evaluate("document.getElementById('connectionLogic').click()");
      await evaluate("document.getElementById('connectionLogicText').value=" + JSON.stringify(text) + ";document.getElementById('connectionLogicText').dispatchEvent(new Event('input'));document.getElementById('layoutExpandBoard').checked=" + JSON.stringify(expand));
      await evaluate("document.getElementById('applyConnectionLogic').click()");
      await idle();
      return state();
    };
    const closeLogic = () => evaluate("document.getElementById('closeConnectionLogic').click()");
    let nextName;
    contents.session.on('will-download', (_event, download) => {
      const filename = path.join(output, nextName || path.basename(download.getFilename()));
      nextName = null;
      download.setSavePath(filename);
      download.once('done', (_done, status) => { report.downloads.push({ filename, status }); save(); });
    });
    async function download(name, action) {
      const before = report.downloads.length;
      nextName = name;
      await evaluate(action);
      await waitFor(() => report.downloads.length > before, name);
      assert.equal(report.downloads[before].status, 'completed');
      return report.downloads[before].filename;
    }

    await waitFor(() => evaluate('window.lab?.ready===true'), 'workbench');
    check('One-click layout and connection-logic entry points are present in the sandboxed desktop', await evaluate("typeof require==='undefined'&&typeof lab.autoLayout==='function'&&!!document.getElementById('autoLayout')&&!!document.getElementById('connectionLogic')"));
    await evaluate("lab.preset('waveplate')");
    const baseline = await state();
    const scrambled = structuredClone(baseline);
    scrambled.items.forEach((item, index) => { item.x = [640, -500, 80, -750, 390][index]; item.z = [220, -190, 100, -70, -250][index]; });
    scrambled.items[1].y = 25;
    scrambled.connections[0].waypoints = [{ x: -50, y: 5, z: 350 }];
    await load(scrambled);
    const before = await state();
    const arranged = await layout();
    report.chain = { before: core(before), after: core(arranged), bounds: layoutBounds(await geometry(), arranged.board) };
    check('Normal one-click button arranges a scrambled five-device connected chain', !same(positionSignature(before), positionSignature(arranged)));
    check('Chain reads left to right according to its directed optical connections', arranged.items.every((item, index) => index === 0 || item.x > arranged.items[index - 1].x));
    check('Layout preserves connection identifiers, endpoints, original colors and fiber types', same(connectionIdentity(before), connectionIdentity(arranged)));
    check('Layout preserves device heights, rotations, scales and custom table dimensions', same(before.items.map(item => [item.id, item.y, item.rotation, item.scale]), arranged.items.map(item => [item.id, item.y, item.rotation, item.scale])) && same(before.board, arranged.board));
    check('Arranged product geometry has no pairwise overlap and stays inside the current tabletop', report.chain.bounds.collisions.length === 0 && report.chain.bounds.offTable.length === 0);
    check('Moved external manual routing is recomputed from its current endpoints', !arranged.connections[0].waypoints?.length);
    await screenshot('chain-auto-layout.png');
    await evaluate("document.getElementById('undo').onclick()");
    check('One undo restores the full pre-layout geometry and manual route', same(core(await state()), core(before)));
    await evaluate("document.getElementById('redo').onclick()");
    check('One redo restores the complete generated layout', same(core(await state()), core(arranged)));
    const repeated = await layout();
    check('Repeating one-click layout is stable', same(core(repeated), core(arranged)));

    await evaluate("lab.preset('split')");
    const branch = await state();
    branch.items.forEach((item, index) => { item.x = (index % 2) * 300; item.z = index * 35 - 100; });
    branch.board = { width: 2400, depth: 1200 };
    await load(branch);
    const branched = await layout();
    const branchBounds = layoutBounds(await geometry(), branched.board);
    report.branch = { scene: core(branched), bounds: branchBounds };
    const splitter = branched.items.find(item => item.type === 'splitter'), sample = branched.items.find(item => item.type === 'sample'), power = branched.items.find(item => item.type === 'powermeter');
    check('Branch layout follows the splitter outputs and separates branches', sample.x > splitter.x && power.x > splitter.x && Math.abs(sample.z - power.z) > 40);
    check('Branch layout avoids geometry overlap and preserves every logical connection', branchBounds.collisions.length === 0 && branchBounds.offTable.length === 0 && same(connectionIdentity(branch), connectionIdentity(branched)));
    await screenshot('branch-auto-layout.png');

    const grouped = structuredClone(baseline);
    grouped.board = { width: 3200, depth: 1600 };
    grouped.items[1].assemblyId = grouped.items[2].assemblyId = 'assembly_native_qa';
    grouped.items[1].assemblyName = grouped.items[2].assemblyName = 'Grouped devices';
    grouped.items[1].x = -160; grouped.items[1].z = -270;
    grouped.items[2].x = 210; grouped.items[2].z = -270;
    grouped.items[0].locked = true;
    grouped.items[4].hidden = true;
    grouped.connections[1].waypoints = [{ x: 10, y: 12, z: -200 }];
    await load(grouped);
    const groupedAfter = await layout(), groupIds = grouped.items.slice(1, 3).map(item => item.id);
    check('Locked device position and identity remain fixed', same(grouped.items[0], groupedAfter.items[0]));
    check('Hidden device position and identity remain fixed', same(grouped.items[4], groupedAfter.items[4]));
    check('Grouped devices translate rigidly with relative position, height and orientation preserved', same(rigidSignature(grouped, groupIds), rigidSignature(groupedAfter, groupIds)));
    const groupDelta = groupedAfter.items[1].x - grouped.items[1].x, groupDeltaZ = groupedAfter.items[1].z - grouped.items[1].z;
    check('Internal group manual route follows the same rigid translation', same(groupedAfter.connections[1].waypoints, grouped.connections[1].waypoints.map(point => ({ ...point, x: point.x + groupDelta, z: point.z + groupDeltaZ }))));

    await evaluate("lab.preset('beam_split')");
    const beamBefore = await state();
    const beamAfter = await layout();
    check('Space-light branch remains a rigid aligned assembly during auto layout', same(rigidSignature(beamBefore), rigidSignature(beamAfter)) && same(beamBefore.connections, beamAfter.connections));
    const beamDiagnostics = await evaluate("lab.getState().connections.map(edge=>{const a=lab.worldPort(edge.a),b=lab.worldPort(edge.b);return {id:edge.id,a:a.pos.toArray(),b:b.pos.toArray(),ad:a.dir.toArray(),bd:b.dir.toArray()};})");
    report.beams = beamDiagnostics;
    check('Beam endpoint direction vectors remain finite unit vectors', beamDiagnostics.every(edge => [...edge.a, ...edge.b, ...edge.ad, ...edge.bd].every(Number.isFinite) && Math.abs(Math.hypot(...edge.ad) - 1) < 1e-8 && Math.abs(Math.hypot(...edge.bd) - 1) < 1e-8));

    await evaluate("lab.preset('empty')");
    const blank = await state(); blank.board = { width: 2400, depth: 1200 }; await load(blank);
    const chainText = '光源=laser\n起偏器=polarizer\n控制器=paddle\n绕纤=qwp\n分析仪=polarimeter\n光源 -> 起偏器 -> 控制器 -> 绕纤 -> 分析仪';
    const textScene = await enterLogic(chainText);
    check('Connection text builds missing devices and all four links through the normal dialog', textScene.items.length === 5 && textScene.connections.length === 4 && same(textScene.items.map(item => item.type).sort(), ['laser', 'polarizer', 'paddle', 'qwp', 'polarimeter'].sort()));
    check('Connection text applies a complete layout within the chosen custom table', same(textScene.board, blank.board) && layoutBounds(await geometry(), textScene.board).collisions.length === 0);
    report.textScene = core(textScene);
    await closeLogic();
    await screenshot('connection-text-layout.png');
    await evaluate("document.getElementById('undo').onclick()");
    check('Text creation and layout undo together as one user action', same(core(await state()), core(blank)));
    await evaluate("document.getElementById('redo').onclick()");
    check('Text-generated chain and connections redo together', same(core(await state()), core(textScene)));
    const duplicateText = await enterLogic(chainText);
    check('Resubmitting the same connection logic reuses existing devices and links', duplicateText.items.length === 5 && duplicateText.connections.length === 4 && same(connectionIdentity(duplicateText), connectionIdentity(textScene)));
    check('Text-generated layout coordinates stay stable when the same logic is applied again', same(positionSignature(duplicateText), positionSignature(textScene)));
    await closeLogic();

    const invalidBefore = await state();
    await enterLogic('光源 -> 根本不存在的器件_qa');
    check('Invalid connection text leaves the whole scene unchanged', same(core(await state()), core(invalidBefore)));
    check('Invalid connection text provides a visible explanation', await evaluate("document.getElementById('connectionLogicDialog').open&&lab.getConnectionLogicTools().getStatus().length>8"));
    await screenshot('connection-text-validation.png');
    await closeLogic();

    await evaluate("lab.preset('empty')");
    const branchBlank = await state(); branchBlank.board = { width: 2200, depth: 1300 }; await load(branchBlank);
    const branchedText = await enterLogic('光源=laser\n分光器=splitter\n探测1=photodiode\n探测2=photodiode\n光源 -> 分光器\n分光器.a -> 探测1.in\n分光器.b -> 探测2.in');
    check('Explicit branch ports and repeated device types produce four distinct devices and three links', branchedText.items.length === 4 && branchedText.connections.length === 3 && branchedText.items.filter(item => item.type === 'photodiode').length === 2);
    check('Branch text consumes each splitter output exactly once', new Set(branchedText.connections.filter(edge => edge.a.item === branchedText.items.find(item => item.type === 'splitter').id).map(edge => edge.a.port)).size === 2);
    await closeLogic();
    await screenshot('connection-text-branch.png');

    await evaluate("lab.preset('empty')");
    const ringBlank = await state(); ringBlank.board = { width: 2400, depth: 1300 }; await load(ringBlank);
    const ringScene = await enterLogic('样品1=sample\n样品2=sample\n样品3=sample\n样品1.out -> 样品2.in\n样品2.out -> 样品3.in\n样品3.out -> 样品1.in');
    check('Closed connection cycle generates and arranges without recursive failure or lost edges', ringScene.items.length === 3 && ringScene.connections.length === 3 && layoutBounds(await geometry(), ringScene.board).collisions.length === 0);
    await closeLogic();

    const smallTable = structuredClone(baseline); smallTable.board = { width: 300, depth: 300 }; await load(smallTable);
    const smallBefore = await state(); await layout();
    check('Insufficient tabletop space rejects a default layout atomically', same(core(await state()), core(smallBefore)));
    await closeLogic();
    await evaluate('lab.autoLayout({expandBoard:true})');
    const expanded = await state();
    check('Explicit expansion creates a large enough tabletop and a non-overlapping layout', (expanded.board.width > 300 || expanded.board.depth > 300) && layoutBounds(await geometry(), expanded.board).collisions.length === 0 && layoutBounds(await geometry(), expanded.board).offTable.length === 0);

    await load(textScene);
    await layout();
    const finalScene = await state();
    fs.writeFileSync(path.join(output, 'auto-layout-project.json'), JSON.stringify(finalScene, null, 2));
    const glbPath = await download('auto-layout-scene.glb', "document.getElementById('export').click();document.getElementById('exportAll').click()");
    const bytes = fs.readFileSync(glbPath);
    check('Automatically arranged scene exports real GLB geometry through the ordinary export dialog', bytes.readUInt32LE(0) === 0x46546c67 && bytes.length > 100000);
    await evaluate("document.getElementById('renderNow').click()");
    await waitFor(() => evaluate('!lab.getRenderStudio().isBusy()&&!!lab.getRenderStudio().getResult()'), 'paper rendering');
    const paper = await evaluate('(()=>{const result=lab.getRenderStudio().getResult();return {settings:result.settings,projection:result.projection};})()');
    const pngPath = await download('auto-layout-paper.png', "document.querySelector('[data-render=png]').click()");
    check('Arranged scene renders a perspective paper PNG with original connection colors', fs.statSync(pngPath).size > 10000 && paper.projection.type === 'perspective' && paper.settings.preserveConnectionColors === true);
    check('Layout, text generation and native exports make no HTTP requests and have no renderer errors', report.httpRequests.length === 0 && report.rendererErrors.length === 0);
    report.allPassed = true;
  } catch (error) {
    report.allPassed = false;
    report.failure = error.stack;
    console.error(error);
    if (contents && !contents.isDestroyed()) {
      try { fs.writeFileSync(path.join(output, 'failure.png'), (await bounded(contents.capturePage(), 'failure screenshot', 20000)).toPNG()); } catch {}
      try { report.failureDOM = await contents.executeJavaScript('({text:document.body.innerText.slice(-7000),state:window.lab?.getState?.()})'); } catch {}
    }
  } finally {
    save();
    console.log('QA report written to ' + reportPath);
    app.exit(report.allPassed ? 0 : 1);
  }
});
