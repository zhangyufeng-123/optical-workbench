const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const desktopRoot = path.dirname(__dirname);
const packaged = process.argv.includes('--packaged');
const mode = packaged ? 'packaged' : 'native';
const output = path.join(__dirname, 'table-paper-' + mode);
const profile = path.join(output, 'profile-' + Date.now());
fs.mkdirSync(output, { recursive: true });
app.commandLine.appendSwitch('user-data-dir', profile);
const report = {
  checkedAt: new Date().toISOString(), mode, profile, checks: [], dimensions: [], renders: [], references: [], downloads: [],
  rendererErrors: [], httpRequests: [], mainHttpRequests: [], aiCreateCalls: 0
};
const reportPath = path.join(output, 'table-paper-checks.json');
function persistReport() { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
function check(name, condition) {
  assert.ok(condition, name); report.checks.push(name); console.log('PASS', name); persistReport();
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function bounded(promise, name, milliseconds = 180000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Timed out ' + name)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function waitFor(test, name, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await test()) return; await sleep(180); }
  throw new Error('Timed out waiting for ' + name);
}

// Observe the real preload IPC handler without changing its result.
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => handle(channel, (...args) => {
  if (channel === 'optical-ai:createJob') report.aiCreateCalls++;
  return listener(...args);
});
const originalFetch = globalThis.fetch;
if (originalFetch) globalThis.fetch = (input, ...args) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (/^https?:/i.test(url)) report.mainHttpRequests.push(url);
  return originalFetch(input, ...args);
};
app.on('web-contents-created', (_event, contents) => {
  contents.on('console-message', event => { if (event.level === 'error') report.rendererErrors.push(event.message); });
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    report.httpRequests.push({ url: details.url, resourceType: details.resourceType });
    callback({ cancel: true });
  });
});
require(path.join(packaged ? path.join(desktopRoot, 'dist', 'win-unpacked', 'resources', 'app.asar') : desktopRoot, 'main.cjs'));

function rasterMetrics(png, colors = []) {
  const image = nativeImage.createFromBuffer(png);
  const size = image.getSize(), pixels = image.toBitmap();
  assert(size.width > 0 && size.height > 0, 'PNG has real raster pixels');
  let white = 0, transparent = 0;
  const colorPixels = Object.fromEntries(colors.map(color => [color, 0]));
  const rgb = colors.map(color => [color, [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16))]);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const blue = pixels[offset], green = pixels[offset + 1], red = pixels[offset + 2], alpha = pixels[offset + 3];
    if (alpha < 250) transparent++;
    if (alpha === 255 && red >= 250 && green >= 250 && blue >= 250) white++;
    if (alpha >= 250) for (const [color, target] of rgb) if (Math.max(Math.abs(red - target[0]), Math.abs(green - target[1]), Math.abs(blue - target[2])) <= 6) colorPixels[color]++;
  }
  const sample = (x, y) => { const offset = (y * size.width + x) * 4; return [pixels[offset + 2], pixels[offset + 1], pixels[offset], pixels[offset + 3]]; };
  return { ...size, whiteFraction: white / (pixels.length / 4), transparentFraction: transparent / (pixels.length / 4), colorPixels,
    corners: [[1, 1], [size.width - 2, 1], [1, size.height - 2], [size.width - 2, size.height - 2]].map(([x, y]) => sample(x, y)) };
}
function rasterDifference(firstFile, secondFile) {
  const first = nativeImage.createFromPath(firstFile).resize({ width: 512, height: 256 }).toBitmap();
  const second = nativeImage.createFromPath(secondFile).resize({ width: 512, height: 256 }).toBitmap();
  let changed = 0;
  for (let offset = 0; offset < first.length; offset += 4) if (Math.abs(first[offset] - second[offset]) + Math.abs(first[offset + 1] - second[offset + 1]) + Math.abs(first[offset + 2] - second[offset + 2]) > 36) changed++;
  return changed / (first.length / 4);
}

let contents;
app.whenReady().then(async () => {
  let nextDownloadName = null;
  try {
    const window = BrowserWindow.getAllWindows()[0];
    assert(window, 'Actual desktop BrowserWindow exists'); contents = window.webContents;
    contents.setBackgroundThrottling(false);
    const evaluate = script => bounded(contents.executeJavaScript(script, true), script.slice(0, 160));
    const action = script => evaluate('(async()=>{' + script + '})()');
    contents.session.on('will-download', (_event, item) => {
      const filename = path.join(output, nextDownloadName || path.basename(item.getFilename())); nextDownloadName = null;
      item.setSavePath(filename);
      item.once('done', (_done, state) => { report.downloads.push({ filename, state }); persistReport(); });
    });
    async function download(name, script) {
      const before = report.downloads.length; nextDownloadName = name; await evaluate(script);
      await waitFor(() => report.downloads.length > before, 'download ' + name);
      const result = report.downloads[before]; assert.equal(result.state, 'completed'); return result.filename;
    }
    const screenshot = async name => {
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      fs.writeFileSync(path.join(output, name), (await bounded(contents.capturePage(), name, 15000)).toPNG());
    };
    await waitFor(() => evaluate('window.lab?.ready===true && !!lab.getAIStudio()'), 'native workbench');
    await evaluate('lab.getAIStudio().ready');
    report.aiBefore = await action('const r=await opticalAI.listJobs();if(!r.ok)throw new Error(r.error.message);return r.data;');
    const config = await action('const r=await opticalAI.getConfig();if(!r.ok)throw new Error(r.error.message);return r.data;');
    check('Independent profile starts with an unconfigured service and zero AI jobs', !config.baseUrl && !config.hasToken && report.aiBefore.length === 0);
    check('Native Electron sandbox keeps Node isolated', await evaluate("typeof require==='undefined' && typeof process==='undefined' && typeof opticalAI.listJobs==='function'"));

    await evaluate("lab.preset('hybrid')");
    await evaluate('lab.select(lab.getState().items[0].id)');
    const baseline = await evaluate('({items:lab.getState().items,connections:lab.getState().connections,selection:lab.getSelection(),selected:lab.getSelected(),edge:lab.getSelectedEdge()})');
    const unchanged = () => evaluate('JSON.stringify({items:lab.getState().items,connections:lab.getState().connections,selection:lab.getSelection(),selected:lab.getSelected(),edge:lab.getSelectedEdge()})===' + JSON.stringify(JSON.stringify(baseline)));
    check('Table-size toolbar button is visible', await evaluate("(()=>{const b=document.getElementById('editBoardSize'),r=b.getBoundingClientRect(),s=getComputedStyle(b);return r.width>20&&r.height>15&&s.display!=='none'&&s.visibility!=='hidden';})()"));
    await evaluate("document.getElementById('editBoardSize').click()");
    check('Click opens settings and focuses the existing custom-width input', await evaluate("!document.getElementById('shellSettingsPanel').hidden && document.activeElement.id==='boardW'"));

    async function resize(width, depth, inputScreenshot) {
      await evaluate("document.getElementById('editBoardSize').click();document.getElementById('boardW').value=" + width + ";document.getElementById('boardD').value=" + depth + ';');
      if (inputScreenshot) await screenshot(inputScreenshot);
      const result = await action("return await document.getElementById('resize').onclick();");
      assert.equal(result, true);
      await waitFor(() => evaluate('lab.getState().board.width===' + width + '&&lab.getState().board.depth===' + depth + "&&Number(document.getElementById('boardW').value)===" + width), 'table dimensions');
      check('Custom table ' + width + ' × ' + depth + ' preserves devices, labels, selection and links', await unchanged());
      const board = await evaluate('lab.getState().board'); report.dimensions.push(board); return board;
    }
    await resize(2200, 1200); await screenshot('table-2200x1200.png');
    const savedFile = await download('custom-table-project.json', "document.getElementById('save').click()");
    const savedProject = JSON.parse(fs.readFileSync(savedFile, 'utf8'));
    check('Normal project export contains the custom table and complete optical path', savedProject.board.width === 2200 && savedProject.board.depth === 1200 && JSON.stringify(savedProject.items) === JSON.stringify(baseline.items) && JSON.stringify(savedProject.connections) === JSON.stringify(baseline.connections));
    await resize(1375, 865, 'table-custom-1375x865-input.png'); await screenshot('table-custom-1375x865-applied.png');
    await resize(1375.5, 865.25, 'table-custom-decimal-input.png');
    check('Arbitrary decimal dimensions pass the native number-input constraints', await evaluate("document.getElementById('boardW').checkValidity()&&document.getElementById('boardD').checkValidity()&&document.getElementById('boardW').step==='any'&&document.getElementById('boardD').step==='any'"));
    await screenshot('table-custom-decimal-applied.png');
    await resize(500, 400); await resize(300, 300); await screenshot('table-custom-300x300.png');
    await evaluate("document.getElementById('undo').click()"); await waitFor(() => evaluate('lab.getState().board.width===500&&lab.getState().board.depth===400'), 'table undo');
    check('Undo restores the previous table with the same devices and links', await evaluate('JSON.stringify(lab.getState().items)===' + JSON.stringify(JSON.stringify(baseline.items)) + '&&JSON.stringify(lab.getState().connections)===' + JSON.stringify(JSON.stringify(baseline.connections))));
    await evaluate("document.getElementById('redo').click()"); await waitFor(() => evaluate('lab.getState().board.width===300&&lab.getState().board.depth===300'), 'table redo');
    check('Redo restores the 300 × 300 custom table', true);
    await evaluate("lab.preset('empty')");
    await evaluate("(()=>{const transfer=new DataTransfer();transfer.items.add(new File([" + JSON.stringify(JSON.stringify(savedProject)) + "],'custom-table-project.json',{type:'application/json'}));const input=document.getElementById('loadFile');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()");
    await waitFor(() => evaluate('lab.getState().board.width===2200&&lab.getState().items.length===' + baseline.items.length), 'normal project-file restore');
    check('Exported custom table restores through the ordinary project file input', await evaluate('JSON.stringify(lab.getState().connections)===' + JSON.stringify(JSON.stringify(baseline.connections)) + '&&lab.getState().board.depth===1200'));

    for (const width of [1500, 1280, 1050]) {
      window.setContentSize(width, 900); await sleep(350);
      await evaluate("document.getElementById('editBoardSize').click()");
      const layout = await evaluate("(()=>{const nodes=[document.documentElement,document.body,document.getElementById('app'),document.querySelector('body>header'),document.querySelector('.viewbar'),document.querySelector('.shell-inspector-tabs')];const overflow=nodes.map(el=>({node:el.id||el.className||el.tagName,scroll:el.scrollWidth,client:el.clientWidth})).filter(r=>r.scroll>r.client+1);const b=document.getElementById('editBoardSize').getBoundingClientRect();return {innerWidth,overflow,button:{left:b.left,right:b.right,width:b.width},focused:document.activeElement.id};})()");
      report.dimensions.push({ viewport: width, layout });
      check('Viewport ' + width + ' has no horizontal overflow and keeps custom dimensions reachable', Math.abs(layout.innerWidth - width) <= 2 && layout.overflow.length === 0 && layout.button.left >= 0 && layout.button.right <= layout.innerWidth + 1 && layout.focused === 'boardW');
      await screenshot('layout-' + width + '.png');
    }
    window.setContentSize(1500, 960); await sleep(300);

    for (const [preset, labels] of [['hybrid', true], ['laser_bench', false]]) {
      await action("await lab.preset('" + preset + "');const scene=lab.getState();scene.presentation={...scene.presentation,showLabels:" + labels + ",appearance:{background:'#18212b',floor:'#111a24',table:'#283642'}};await lab.load(scene);window.paperBefore=JSON.stringify(lab.getState());");
      const expected = await evaluate('({labels:lab.getState().presentation.showLabels,annotationCount:lab.getState().items.filter(item=>!item.hidden&&item.showLabel!==false).length,colors:[...new Set(lab.getState().connections.map(edge=>edge.color))]})');
      const rendered = await action("const studio=lab.getRenderStudio();const result=await studio.run();const panel=result.composition.panels[0];return {settings:result.settings,projection:result.projection,width:result.width,height:result.height,svg:result.svg,raster:panel.image,annotations:panel.annotations.map(a=>({sourceId:a.sourceId,text:a.text})),sourceUnchanged:JSON.stringify(lab.getState())===window.paperBefore,sourceSceneUnchanged:JSON.stringify(result.sourceScene)===window.paperBefore};");
      const pngFile = await download(preset + '-native-paper.png', "lab.getRenderStudio().save('png')");
      const svgFile = await download(preset + '-native-paper.svg', "lab.getRenderStudio().save('svg')");
      const png = fs.readFileSync(pngFile), svg = fs.readFileSync(svgFile, 'utf8');
      const pngMetrics = rasterMetrics(png, expected.colors), rasterMetricsResult = rasterMetrics(Buffer.from(rendered.raster.split(',')[1], 'base64'), expected.colors);
      fs.writeFileSync(path.join(output, preset + '-native-raster.png'), Buffer.from(rendered.raster.split(',')[1], 'base64'));
      report.renders.push({ preset, settings: rendered.settings, projection: rendered.projection, width: rendered.width, height: rendered.height, annotations: rendered.annotations, sourceUnchanged: rendered.sourceUnchanged, sourceSceneUnchanged: rendered.sourceSceneUnchanged, pngMetrics, rasterMetrics: rasterMetricsResult, pngFile, svgFile });
      check(preset + ' defaults to native paper, white background and no table despite a dark project', rendered.settings.style === 'paper' && rendered.settings.background === 'white' && rendered.settings.table === 'none' && rendered.settings.useSceneColors === false && rendered.settings.preserveConnectionColors === true && rendered.settings.tightFrame === true);
      check(preset + ' uses actual 40-degree perspective with recorded compact framing', rendered.projection.type === 'perspective' && rendered.projection.fov === 40 && rendered.projection.framing?.enabled === true);
      check(preset + ' produces real opaque white PNG pixels and self-contained SVG', png.subarray(1, 4).toString() === 'PNG' && pngMetrics.width === rendered.width && pngMetrics.height === rendered.height && rasterMetricsResult.whiteFraction > .5 && pngMetrics.transparentFraction < .001 && svg.includes('data:image/png;base64,') && !/<image[^>]+(?:href|xlink:href)="https?:/i.test(svg));
      check(preset + ' output keeps original connection color cores', Object.values(rasterMetricsResult.colorPixels).every(count => count > 5));
      check(preset + ' respects project label visibility and preserves the entire source scene', rendered.annotations.length === (labels ? expected.annotationCount : 0) && rendered.sourceUnchanged && rendered.sourceSceneUnchanged);
      await screenshot(preset + '-native-paper-preview.png');
      await evaluate('lab.getRenderStudio().close()');
    }

    await action("await lab.preset('hybrid');const scene=lab.getState();scene.presentation={...scene.presentation,showLabels:false,appearance:{background:'#18212b',floor:'#111a24',table:'#283642'}};await lab.load(scene);window.referenceBefore=JSON.stringify(lab.getState());");
    const profiles = await evaluate('lab.getReferenceRenderProfiles()');
    check('Every verified paper has a corresponding native render profile', profiles.length === 100 && new Set(profiles.map(profile => profile.doi)).size === 100);
    const sortedProfiles = [...profiles].sort((a, b) => a.parameters.camera.elevationDeg - b.parameters.camera.elevationDeg);
    const chosenProfiles = [sortedProfiles[0], sortedProfiles[sortedProfiles.length - 1]];
    check('The reference proof selects visibly different 3D and flat-view camera profiles', chosenProfiles[1].parameters.camera.elevationDeg - chosenProfiles[0].parameters.camera.elevationDeg >= 20);
    for (const [index, profile] of chosenProfiles.entries()) {
      await evaluate("(()=>{lab.getNatureReferences().open();const search=document.querySelector('.nature-reference-panel>input');search.value=" + JSON.stringify(profile.doi) + ";search.dispatchEvent(new Event('input'));})()");
      await waitFor(() => evaluate("document.querySelector('.nature-reference-card img')?.naturalWidth>0 && document.querySelector('.nature-reference-render')?.dataset.referenceRender===" + JSON.stringify(profile.doi)), 'offline reference card ' + profile.doi);
      await evaluate("document.querySelector('.nature-reference-render').click()");
      await waitFor(async () => {
        const state = await evaluate('lab.getNatureReferences().getState()');
        if (state.records[profile.doi]?.status === 'failed') throw new Error(state.records[profile.doi].message);
        return !state.busy && state.records[profile.doi]?.status === 'ready' && await evaluate('lab.getRenderStudio().getResult()?.settings.reference?.doi===' + JSON.stringify(profile.doi));
      }, 'native render for ' + profile.doi);
      const result = await evaluate("(()=>{const r=lab.getRenderStudio().getResult();return {settings:r.settings,projection:r.projection,annotations:r.composition.panels[0].annotations.length,sourceUnchanged:JSON.stringify(lab.getState())===window.referenceBefore,sourceSceneUnchanged:JSON.stringify(r.sourceScene)===window.referenceBefore,title:document.querySelector('[data-render=reference-title]').textContent,meta:document.querySelector('[data-render=reference-meta]').textContent,thumbnailLoaded:document.querySelector('[data-render=reference-thumbnail]').naturalWidth>0};})()");
      const pngFile = await download('reference-' + (index + 1) + '-native.png', "lab.getRenderStudio().save('png')");
      const svgFile = await download('reference-' + (index + 1) + '-native.svg', "lab.getRenderStudio().save('svg')");
      const png = fs.readFileSync(pngFile), sha256 = crypto.createHash('sha256').update(png).digest('hex');
      report.references.push({ profile, result, pngFile, svgFile, sha256, metrics: rasterMetrics(png) });
      check('Reference ' + (index + 1) + ' native result records the selected DOI and exact camera parameters', result.settings.reference.doi === profile.doi && result.settings.referenceStyle.camera.elevationDeg === profile.parameters.camera.elevationDeg && result.settings.referenceStyle.camera.alongAxis === profile.parameters.camera.alongAxis && result.projection.type === 'perspective' && result.projection.fov === 40);
      check('Reference ' + (index + 1) + ' shows its real title, DOI and offline thumbnail beside the output', result.title === result.settings.reference.title && result.meta.includes(profile.doi) && result.thumbnailLoaded);
      check('Reference ' + (index + 1) + ' keeps source devices, labels, links and geometry parameters intact', result.sourceUnchanged && result.sourceSceneUnchanged && result.annotations === 0 && result.settings.preserveConnectionColors === true);
      await screenshot('reference-' + (index + 1) + '-native-preview.png');
      await evaluate('lab.getRenderStudio().close();lab.getNatureReferences().open()');
      check('Reference ' + (index + 1) + ' card marks the chosen DOI and completed render', await evaluate('lab.getNatureReferences().getSelectedReference()?.doi===' + JSON.stringify(profile.doi) + "&&document.querySelector('.nature-reference-card').getAttribute('aria-current')==='true'&&document.querySelector('.nature-reference-state').dataset.status==='ready'"));
      await screenshot('reference-' + (index + 1) + '-selected-card.png');
    }
    report.referencePixelDifference = rasterDifference(report.references[0].pngFile, report.references[1].pngFile);
    check('Switching between selected reference profiles changes actual output pixels', report.references[0].sha256 !== report.references[1].sha256 && report.referencePixelDifference > .005 && JSON.stringify(report.references[0].result.projection.cameraPosition) !== JSON.stringify(report.references[1].result.projection.cameraPosition));
    report.aiAfter = await action('const r=await opticalAI.listJobs();if(!r.ok)throw new Error(r.error.message);return r.data;');
    check('Native paper rendering creates zero AI tasks', report.aiCreateCalls === 0 && JSON.stringify(report.aiAfter) === JSON.stringify(report.aiBefore));
    check('Native paper rendering performs zero HTTP network requests', report.httpRequests.length === 0 && report.mainHttpRequests.length === 0);
    check('Native table and rendering workflows have no renderer errors', report.rendererErrors.length === 0);
    report.allPassed = true;
  } catch (error) {
    report.allPassed = false; report.failure = error.stack; console.error(error);
    if (contents && !contents.isDestroyed()) {
      try { fs.writeFileSync(path.join(output, 'failure.png'), (await bounded(contents.capturePage(), 'failure screenshot', 15000)).toPNG()); } catch {}
      try { report.failureDOM = await bounded(contents.executeJavaScript("({title:document.title,bodyText:document.body.innerText.slice(-7000)})"), 'failure DOM', 10000); } catch {}
    }
  } finally {
    persistReport(); console.log('QA report written to ' + reportPath); app.exit(report.allPassed ? 0 : 1);
  }
});
