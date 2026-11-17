const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const desktopRoot = path.dirname(__dirname);
const packaged = process.argv.includes('--packaged');
const mode = packaged ? 'packaged' : 'native';
const runtimeRoot = packaged ? path.join(desktopRoot, 'dist', 'win-unpacked', 'resources', 'app.asar') : desktopRoot;
const output = path.join(__dirname, 'products-' + mode);
const profile = path.join(output, 'profile-' + Date.now());
fs.mkdirSync(output, { recursive: true });
app.commandLine.appendSwitch('user-data-dir', profile);
const reportPath = path.join(output, 'products-checks.json');
const report = {
  checkedAt: new Date().toISOString(), mode, profile, checks: [], products: [], routes: [],
  downloads: [], imports: [], renders: [], rendererErrors: [], httpRequests: [], aiCreateCalls: 0,
  runtime: {
    version: JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8')).version,
    mainSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(runtimeRoot, 'main.cjs'))).digest('hex'),
    bundleSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(runtimeRoot, 'web', 'app.js'))).digest('hex')
  }
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function persist() { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
function check(name, condition) {
  assert.ok(condition, name);
  report.checks.push(name);
  console.log('PASS', name);
  persist();
}
async function bounded(promise, name, milliseconds = 180000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out ' + name)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
async function waitFor(test, name, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await test()) return;
    await sleep(180);
  }
  throw new Error('Timed out waiting for ' + name);
}
function parseGLB(filename) {
  const bytes = fs.readFileSync(filename);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8').trim());
  return { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), json };
}
function colorMetrics(png, colors) {
  const image = nativeImage.createFromBuffer(png), size = image.getSize(), pixels = image.toBitmap();
  const targets = colors.map(color => [color, [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))]);
  const counts = Object.fromEntries(colors.map(color => [color, 0]));
  let white = 0, transparent = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const rgb = [pixels[offset + 2], pixels[offset + 1], pixels[offset]], alpha = pixels[offset + 3];
    if (alpha < 250) transparent++;
    if (alpha === 255 && rgb.every(value => value >= 250)) white++;
    if (alpha >= 250) for (const [color, target] of targets) {
      if (rgb.every((value, index) => Math.abs(value - target[index]) <= 6)) counts[color]++;
    }
  }
  return { ...size, colorPixels: counts, whiteFraction: white / (pixels.length / 4), transparentFraction: transparent / (pixels.length / 4) };
}
function pixelDifference(first, second) {
  const a = nativeImage.createFromBuffer(first).toBitmap(), b = nativeImage.createFromBuffer(second).toBitmap();
  assert.equal(a.length, b.length);
  let changed = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    if (Math.abs(a[offset] - b[offset]) + Math.abs(a[offset + 1] - b[offset + 1]) + Math.abs(a[offset + 2] - b[offset + 2]) > 25) changed++;
  }
  return changed;
}
function inside(point, obstacle, margin = 0) {
  return point.every((value, axis) => value > obstacle.min[axis] - margin && value < obstacle.max[axis] + margin);
}
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const onLineSegment = (point, a, b) => Math.abs(distance(a, point) + distance(point, b) - distance(a, b)) < 1e-4;
const endpointShape = port => ({ id: port.id, connector: port.connector, gender: port.gender || 'female', pigtailEnd: port.pigtailEnd === true, kind: port.kind, role: port.role });

const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => originalHandle(channel, (...args) => {
  if (channel === 'optical-ai:createJob') report.aiCreateCalls++;
  return listener(...args);
});
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', event => { if (event.level === 'error') report.rendererErrors.push(event.message); });
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    report.httpRequests.push({ url: details.url, resourceType: details.resourceType });
    callback({ cancel: true });
  });
});
require(path.join(runtimeRoot, 'main.cjs'));

let contents;
app.whenReady().then(async () => {
  try {
    const window = BrowserWindow.getAllWindows()[0];
    assert(window, 'Desktop BrowserWindow exists');
    contents = window.webContents;
    contents.setBackgroundThrottling(false);
    window.setContentSize(1500, 960);
    const evaluate = script => bounded(contents.executeJavaScript(script, true), script.slice(0, 160));
    const action = script => evaluate('(async()=>{' + script + '})()');
    const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const screenshot = async name => {
      await frames();
      fs.writeFileSync(path.join(output, name), (await bounded(contents.capturePage(), name, 20000)).toPNG());
    };
    let nextName = null;
    contents.session.on('will-download', (_event, item) => {
      const filename = path.join(output, nextName || path.basename(item.getFilename()));
      nextName = null;
      item.setSavePath(filename);
      item.once('done', (_done, state) => { report.downloads.push({ filename, state }); persist(); });
    });
    async function download(name, script) {
      const before = report.downloads.length;
      nextName = name;
      await evaluate(script);
      await waitFor(() => report.downloads.length > before, 'download ' + name);
      const result = report.downloads[before];
      assert.equal(result.state, 'completed');
      assert(fs.statSync(result.filename).size > 100);
      return result.filename;
    }
    async function importFile(filename) {
      const base64 = fs.readFileSync(filename).toString('base64');
      await evaluate("(()=>{const bytes=Uint8Array.from(atob(" + JSON.stringify(base64) + "),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes]," + JSON.stringify(path.basename(filename)) + ",{type:'model/gltf-binary'}));const input=document.getElementById('modelFile');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()");
      await waitFor(() => evaluate('lab.getState().custom.length===1&&lab.getState().items.length===1&&!!lab.getSelected()'), 'normal GLB import ' + path.basename(filename));
      return evaluate('({definition:lab.getState().custom[0],item:lab.getState().items[0]})');
    }

    await waitFor(() => evaluate('window.lab?.ready===true'), 'native product workbench');
    check('Sandboxed desktop exposes the normal workbench API', await evaluate("typeof require==='undefined'&&typeof process==='undefined'&&typeof lab.preset==='function'"));
    await evaluate("document.getElementById('preset').value='waveplate';document.getElementById('applyPreset').click()");
    await waitFor(() => evaluate("lab.getState().items.length===5&&lab.getState().connections.length===4&&lab.getState().items[0].type==='laser'"), 'five-product waveplate template');
    const snapshot = await evaluate("(()=>{const state=lab.getState(),catalog=lab.getCatalog();return {state,products:state.items.map(item=>{const definition=catalog.find(d=>d.id===item.type);return {item,definition,ports:item.ports||definition.ports,bounds:lab.getItemGeometryBounds?.(item.id)||null};})};})()");
    report.products = snapshot.products;
    check('Waveplate template keeps five devices, four links and the existing editable type IDs', JSON.stringify(snapshot.state.items.map(item => item.type)) === JSON.stringify(['laser', 'polarizer', 'paddle', 'qwp', 'polarimeter']) && snapshot.state.connections.length === 4);
    for (const [type, model] of [['laser', 'DFB13TK'], ['polarizer', 'ILP1310PM-FC'], ['paddle', 'FPC031'], ['qwp', 'wound_fiber'], ['polarimeter', 'PAX1000IR2']]) {
      const product = snapshot.products.find(record => record.item.type === type);
      check('Normal ' + type + ' entry contains ' + model + ' product metadata', !!product.definition.product && JSON.stringify(product.definition.product).toLowerCase().includes(model.toLowerCase()));
    }
    const originalProject = snapshot.state;
    fs.writeFileSync(path.join(output, 'five-products-project.json'), JSON.stringify(originalProject, null, 2));
    await screenshot('five-products-editor.png');
    const hybridConnection = originalProject.connections.find(connection => {
      const connectors = [connection.a, connection.b].map(end => snapshot.products.find(record => record.item.id === end.item).ports.find(port => port.id === end.port).connector);
      return connectors.some(connector => /APC/.test(connector)) && connectors.some(connector => /FC\/(PC|UPC|SPC)$/.test(connector));
    });
    assert(hybridConnection, 'Template contains a PC/APC hybrid patch cord');
    await evaluate('document.querySelector(' + JSON.stringify('#connections [data-remove="' + hybridConnection.id + '"]') + ').click()');
    await waitFor(() => evaluate('lab.getState().connections.length===3'), 'normal hybrid deletion');
    await evaluate('lab.clickPort(' + JSON.stringify(hybridConnection.a) + ');lab.clickPort(' + JSON.stringify(hybridConnection.b) + ');lab.cancelConnection()');
    check('Normal port-connection action recreates an FC/APC-to-FC/PC hybrid patch cord', await evaluate('lab.getState().connections.length===4&&!lab.getPending()'));
    await evaluate('lab.load(' + JSON.stringify(originalProject) + ')');

    await evaluate("lab.cancelConnection();document.getElementById('showPorts').checked=true;document.getElementById('showPorts').dispatchEvent(new Event('change'))");
    await frames();
    const visiblePorts = await evaluate('lab.getPortDiagnostics()');
    const portsOn = Buffer.from((await evaluate("document.querySelector('#viewport canvas').toDataURL('image/png')")).split(',')[1], 'base64');
    await evaluate("document.getElementById('showPorts').checked=false;document.getElementById('showPorts').dispatchEvent(new Event('change'))");
    await frames();
    const hiddenPorts = await evaluate('lab.getPortDiagnostics()');
    const portsOff = Buffer.from((await evaluate("document.querySelector('#viewport canvas').toDataURL('image/png')")).split(',')[1], 'base64');
    fs.writeFileSync(path.join(output, 'ports-on.png'), portsOn);fs.writeFileSync(path.join(output, 'ports-off.png'), portsOff);
    report.portPixelDifference = pixelDifference(portsOn, portsOff);
    check('Show-ports control changes actual 3D canvas pixels while preserving all connections', report.portPixelDifference > 5 && await evaluate('lab.getState().connections.length===4'));
    check('Show-ports control changes every actual port target visibility', visiblePorts.length === snapshot.products.flatMap(product => product.ports).length && visiblePorts.every(port => port.visible) && hiddenPorts.every(port => !port.visible));

    check('Geometry-routing diagnostic APIs are available', await evaluate("typeof lab.getConnectionRouting==='function'&&typeof lab.getRoutingObstacles==='function'"));
    const obstacles = await evaluate('lab.getRoutingObstacles()');
    report.obstacles = obstacles;
    for (const connection of originalProject.connections) {
      const route = await evaluate('({routing:lab.getConnectionRouting(' + JSON.stringify(connection.id) + '),points:lab.connectionPoints(' + JSON.stringify(connection.id) + ',500),a:lab.worldPort(' + JSON.stringify(connection.a) + ').pos.toArray(),b:lab.worldPort(' + JSON.stringify(connection.b) + ').pos.toArray(),connectors:lab.getFiberConnectorDetails(' + JSON.stringify(connection.id) + ')})');
      report.routes.push({ id: connection.id, ...route });
      check('Connection ' + connection.id + ' has finite continuous tabletop samples and preserved endpoints', route.points.length > 100 && route.points.every(point => point.every(Number.isFinite)) && distance(route.points[0], route.a) < 1e-5 && distance(route.points.at(-1), route.b) < 1e-5 && route.routing.kind === 'geometric_tabletop_layout');
      const guides = route.routing.guides;
      const intersections = [];
      for (const obstacle of obstacles) for (const point of route.points) {
        const allowedHostLead = obstacle.id === connection.a.item && onLineSegment(point, route.a, guides[0]) || obstacle.id === connection.b.item && onLineSegment(point, route.b, guides.at(-1));
        if (!allowedHostLead && inside(point, obstacle, connection.radius)) intersections.push(obstacle.id);
      }
      check('Connection ' + connection.id + ' avoids all product-body world bounds outside its mating leads', intersections.length === 0 && route.routing.unresolvedObstacles.length === 0);
      for (const end of [connection.a, connection.b]) {
        const expected = snapshot.products.find(product => product.item.id === end.item).ports.find(port => port.id === end.port);
        const actual = route.connectors.find(connector => connector.endpoint.item === end.item && connector.endpoint.port === end.port);
        const world = await evaluate('({position:lab.worldPort(' + JSON.stringify(end) + ').pos.toArray(),axis:lab.worldPort(' + JSON.stringify(end) + ').dir.toArray()})');
        check('Connection ' + connection.id + ' endpoint ' + end.port + ' has the matched coaxial connector and required mating sleeve', !!actual && actual.connector === expected.connector && actual.polish === (/APC/i.test(expected.connector) ? 'APC' : 'PC') && actual.matingSleeve === (expected.gender === 'male') && distance(actual.position, world.position) < 1e-6 && distance(actual.axis, world.axis) < 1e-6 && actual.cableExit[1] === (expected.gender === 'male' ? 47 : 35));
      }
    }

    const wholeFile = await download('five-products-whole-scene.glb', "document.getElementById('export').click();document.getElementById('exportAll').click()");
    const whole = parseGLB(wholeFile);
    report.wholeGLB = { filename: wholeFile, bytes: whole.bytes, sha256: whole.sha256 };
    const nodes = whole.json.nodes || [];
    const markingsOff = Buffer.from((await evaluate("document.querySelector('#viewport canvas').toDataURL('image/png')")).split(',')[1], 'base64');
    await evaluate("document.getElementById('showMarkings').checked=true;document.getElementById('showMarkings').dispatchEvent(new Event('change'))");
    await frames();
    const markingsOn = Buffer.from((await evaluate("document.querySelector('#viewport canvas').toDataURL('image/png')")).split(',')[1], 'base64');
    const markedFile = await download('five-products-whole-scene-markings.glb', "document.getElementById('export').click();document.getElementById('exportAll').click()");
    const marked = parseGLB(markedFile);
    report.markings = { hiddenFile: wholeFile, visibleFile: markedFile, changedCanvasPixels: pixelDifference(markingsOff, markingsOn), products: [] };
    check('Body-marking checkbox changes actual 3D text pixels', report.markings.changedCanvasPixels > 5);
    for (const product of snapshot.products) {
      const hiddenCount = nodes.filter(node => node.extras?.bodyMarking && node.extras.itemId === product.item.id).length;
      const visibleCount = (marked.json.nodes || []).filter(node => node.extras?.bodyMarking && node.extras.itemId === product.item.id).length;
      report.markings.products.push({ type: product.item.type, hiddenCount, visibleCount });
      const expectedLabels = !['polarizer', 'qwp'].includes(product.item.type);
      check(product.item.type + ' body markings follow the checkbox in actual GLB visibility', hiddenCount === 0 && (expectedLabels ? visibleCount > 0 : visibleCount === 0));
    }
    fs.writeFileSync(path.join(output, 'body-markings-hidden.png'), markingsOff);
    fs.writeFileSync(path.join(output, 'body-markings-visible.png'), markingsOn);
    await evaluate("document.getElementById('showMarkings').checked=false;document.getElementById('showMarkings').dispatchEvent(new Event('change'))");
    for (const connection of originalProject.connections) {
      const ends = [connection.a, connection.b].map(end => snapshot.products.find(record => record.item.id === end.item).ports.find(port => port.id === end.port));
      const plugs = nodes.filter(node => node.extras?.edgeId === connection.id && ['PC', 'APC'].includes(node.extras?.polish));
      const expectedPolishes = ends.map(port => /APC/i.test(port.connector) ? 'APC' : 'PC').sort();
      check('Connection ' + connection.id + ' exports an individually matched plug at each endpoint', JSON.stringify(plugs.map(node => node.extras.polish).sort()) === JSON.stringify(expectedPolishes));
      const sleeves = nodes.filter(node => node.extras?.edgeId === connection.id && node.name === 'fc_inline_mating_sleeve');
      check('Connection ' + connection.id + ' exports one mating sleeve per fixed male pigtail endpoint', sleeves.length === ends.filter(port => port.gender === 'male').length);
    }
    check('Five-product path contains a correctly terminated hybrid FC/APC to FC/PC patch cord', originalProject.connections.some(connection => {
      const connectors = [connection.a, connection.b].map(end => snapshot.products.find(record => record.item.id === end.item).ports.find(port => port.id === end.port).connector);
      return connectors.some(connector => /APC/.test(connector)) && connectors.some(connector => /FC\/(PC|UPC|SPC)$/.test(connector));
    }));
    check('Whole-scene GLB contains real meshes, FC knurl geometry and embedded optical ports', whole.json.meshes.length > 30 && nodes.some(node => node.name === 'fc_coupling_knurl') && nodes.some(node => Array.isArray(node.extras?.opticalPorts)));

    const individual = [];
    for (const product of snapshot.products) {
      await evaluate('lab.select(' + JSON.stringify(product.item.id) + ')');
      await evaluate("document.getElementById('showMarkings').checked=true;document.getElementById('showMarkings').dispatchEvent(new Event('change'))");
      const filename = await download(product.item.type + '-selected.glb', "document.getElementById('export').click();document.getElementById('exportOne').click()");
      const parsed = parseGLB(filename);
      individual.push({ product, filename, parsed });
      check(product.item.type + ' exports through the ordinary selected-device GLB action', parsed.bytes > 1000 && parsed.json.meshes?.length > 0);
      await evaluate('lab.focusSelected()');
      await screenshot(product.item.type + '-native-model-closeup.png');
    }
    await evaluate('lab.select(' + JSON.stringify(snapshot.products[1].item.id) + ');lab.focusSelected()');
    await screenshot('product-pigtail-connector-closeup.png');
    await evaluate('lab.fitView()');
    await evaluate("document.getElementById('showMarkings').checked=false;document.getElementById('showMarkings').dispatchEvent(new Event('change'))");

    const colors = [...new Set(originalProject.connections.map(connection => connection.color))];
    const sourceBefore = await evaluate('JSON.stringify(lab.getState())');
    await evaluate("document.getElementById('renderNow').click()");
    await waitFor(() => evaluate('!lab.getRenderStudio().isBusy()&&!!lab.getRenderStudio().getResult()'), 'default paper product render');
    const paper = await evaluate('(()=>{const r=lab.getRenderStudio().getResult();return {settings:r.settings,projection:r.projection,raster:r.composition.panels[0].image};})()');
    const paperFile = await download('five-products-paper.png', "document.querySelector('[data-render=png]').click()");
    const paperRaster = Buffer.from(paper.raster.split(',')[1], 'base64');
    fs.writeFileSync(path.join(output, 'five-products-paper-raster.png'), paperRaster);
    const paperMetrics = colorMetrics(paperRaster, colors);
    report.renders.push({ name: 'paper', filename: paperFile, settings: paper.settings, projection: paper.projection, metrics: paperMetrics });
    check('Normal one-click output uses white paper, compact perspective and original optical colors', paper.settings.style === 'paper' && paper.settings.table === 'none' && paper.settings.useSceneColors === false && paper.settings.preserveConnectionColors === true && paper.projection.type === 'perspective' && paper.projection.fov === 40 && paperMetrics.whiteFraction > .45 && Object.values(paperMetrics.colorPixels).every(count => count > 5));
    check('Paper capture restores the complete editable five-product project', await evaluate('JSON.stringify(lab.getState())') === sourceBefore);
    await screenshot('five-products-paper-preview.png');
    await evaluate('lab.getRenderStudio().close()');

    const profile = await evaluate('lab.getReferenceRenderProfiles().find(profile=>profile.parameters.camera.elevationDeg<50)||lab.getReferenceRenderProfiles()[0]');
    assert(profile, 'Reference profile exists');
    await evaluate("(()=>{lab.getNatureReferences().open();const input=document.querySelector('.nature-reference-panel>input');input.value=" + JSON.stringify(profile.doi) + ";input.dispatchEvent(new Event('input'));})()");
    await waitFor(() => evaluate("document.querySelector('.nature-reference-render')?.dataset.referenceRender===" + JSON.stringify(profile.doi)), 'selected reference card');
    await evaluate("document.querySelector('.nature-reference-render').click()");
    await waitFor(() => evaluate('!lab.getRenderStudio().isBusy()&&lab.getRenderStudio().getResult()?.settings.reference?.doi===' + JSON.stringify(profile.doi)), 'selected reference product render');
    const reference = await evaluate('(()=>{const r=lab.getRenderStudio().getResult();return {settings:r.settings,projection:r.projection,raster:r.composition.panels[0].image};})()');
    const referenceFile = await download('five-products-reference.png', "document.querySelector('[data-render=png]').click()");
    const referenceRaster = Buffer.from(reference.raster.split(',')[1], 'base64');
    fs.writeFileSync(path.join(output, 'five-products-reference-raster.png'), referenceRaster);
    const referenceMetrics = colorMetrics(referenceRaster, colors);
    report.renders.push({ name: 'reference', filename: referenceFile, profile, settings: reference.settings, projection: reference.projection, metrics: referenceMetrics });
    check('Selecting a literature figure applies its recorded profile and retains original connection colors', reference.settings.reference.doi === profile.doi && reference.settings.referenceStyle.camera.elevationDeg === profile.parameters.camera.elevationDeg && reference.settings.preserveConnectionColors === true && Object.values(referenceMetrics.colorPixels).every(count => count > 5));
    check('Reference capture restores the complete editable project', await evaluate('JSON.stringify(lab.getState())') === sourceBefore);
    await screenshot('five-products-reference-preview.png');
    await evaluate('lab.getRenderStudio().close()');

    for (const { product, filename, parsed } of individual) {
      await evaluate("lab.preset('empty')");
      const imported = await importFile(filename);
      report.imports.push({ source: product.item.type, filename, bytes: parsed.bytes, imported });
      const actual = imported.definition.ports;
      check(product.item.type + ' file-input import preserves every port ID, connector, role and pigtail gender', actual.length === product.ports.length && product.ports.every(expected => {
        const restored = actual.find(port => port.id === expected.id);
        return restored && JSON.stringify(endpointShape(restored)) === JSON.stringify(endpointShape(expected));
      }));
      for (let first = 0; first < product.ports.length; first++) for (let second = first + 1; second < product.ports.length; second++) {
        const expected = distance(product.ports[first].pos, product.ports[second].pos), a = actual.find(port => port.id === product.ports[first].id), b = actual.find(port => port.id === product.ports[second].id);
        assert(Math.abs(distance(a.pos, b.pos) - expected) < .15, product.item.type + ' preserves port spacing in millimetres');
      }
      if (product.bounds?.size) check(product.item.type + ' native GLB re-import preserves physical model dimensions in millimetres', imported.item.scale === 1 && imported.definition.size.every((value, axis) => Math.abs(value - product.bounds.size[axis]) < .4));
      else check(product.item.type + ' native GLB metadata retains explicit physical units', [...(parsed.json.nodes || []), ...(parsed.json.scenes || [])].some(node => /\b(m|mm|meter|metre|millimeter|millimetre)\b/i.test(String(node.extras?.opticalWorkbenchUnits || node.extras?.units || node.extras?.modelUnits || ''))) && imported.item.scale === 1);
    }
    await evaluate("lab.preset('empty')");
    const importedWhole = await importFile(wholeFile);
    report.imports.push({ source: 'whole-scene', filename: wholeFile, imported: importedWhole });
    const expectedPorts = snapshot.products.flatMap(product => product.ports), wholePorts = importedWhole.definition.ports;
    check('Whole-scene file-input re-import retains all optical ports with unique IDs and correct gender totals', wholePorts.length === expectedPorts.length && new Set(wholePorts.map(port => port.id)).size === wholePorts.length && wholePorts.filter(port => port.gender === 'male').length === expectedPorts.filter(port => port.gender === 'male').length);
    check('Whole-scene file-input re-import retains metre-to-millimetre scale and the full experimental table', importedWhole.item.scale === 1 && importedWhole.definition.size[0] >= originalProject.board.width - 1 && Math.max(...importedWhole.definition.size) < Math.max(originalProject.board.width, originalProject.board.depth) * 3);
    await screenshot('whole-scene-normal-reimport.png');
    await evaluate('lab.load(' + JSON.stringify(originalProject) + ')');
    check('Five-product verification creates zero external AI jobs or HTTP requests', report.aiCreateCalls === 0 && report.httpRequests.length === 0);
    check('Product rendering, exports and file-input imports complete without renderer errors', report.rendererErrors.length === 0);
    report.allPassed = true;
  } catch (error) {
    report.allPassed = false;
    report.failure = error.stack;
    console.error(error);
    if (contents && !contents.isDestroyed()) {
      try { fs.writeFileSync(path.join(output, 'failure.png'), (await bounded(contents.capturePage(), 'failure screenshot', 20000)).toPNG()); } catch {}
      try { report.failureDOM = await contents.executeJavaScript('({title:document.title,text:document.body.innerText.slice(-6500),state:window.lab?.getState?.()})'); } catch {}
    }
  } finally {
    persist();
    console.log('QA report written to ' + reportPath);
    app.exit(report.allPassed ? 0 : 1);
  }
});
