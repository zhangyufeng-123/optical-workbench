const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const desktopRoot = path.dirname(__dirname);
const packaged = process.argv.includes('--packaged');
const mode = packaged ? 'packaged' : 'native';
const runtimeRoot = packaged ? path.join(desktopRoot, 'dist/win-unpacked/resources/app.asar') : desktopRoot;
const output = path.join(__dirname, 'label-editor-' + mode);
fs.mkdirSync(output, { recursive: true });
app.commandLine.appendSwitch('user-data-dir', path.join(output, 'profile-' + Date.now()));
const report = {
  checkedAt: new Date().toISOString(), mode, checks: [], downloads: [], rendererErrors: [], httpRequests: [],
  version: JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8')).version,
  bundleSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(runtimeRoot, 'web/app.js'))).digest('hex')
};
const reportPath = path.join(output, 'label-editor-checks.json');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function check(name, condition) {
  assert.ok(condition, name);
  report.checks.push(name);
  console.log('PASS', name);
  save();
}
async function bounded(promise, name, timeout = 180000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out ' + name)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}
async function waitFor(test, name, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await test()) return;
    await pause(120);
  }
  throw new Error('Timed out waiting for ' + name);
}
function readStoredZIP(filename) {
  const bytes = fs.readFileSync(filename), entries = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0, 'ZIP uses the normal uncompressed offline exporter');
    const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, bytes.subarray(start, start + size));
    offset = start + size;
  }
  return entries;
}
function pixelDifference(left, right) {
  const a = nativeImage.createFromBuffer(left), b = nativeImage.createFromBuffer(right);
  assert.deepEqual(a.getSize(), b.getSize());
  const first = a.toBitmap(), second = b.toBitmap();
  let changed = 0;
  for (let index = 0; index < first.length; index += 4) {
    if ([0, 1, 2, 3].some(channel => first[index + channel] !== second[index + channel])) changed++;
  }
  return changed;
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
    window.setContentSize(1580, 1040);
    const evaluate = script => bounded(contents.executeJavaScript(script, true), script.slice(0, 120));
    const frames = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const flush = async () => { await evaluate('lab.getRenderStudio().flushEdits()'); await frames(); };
    const composition = () => evaluate('lab.getRenderStudio().getResult().composition');
    const current = id => evaluate('lab.getRenderStudio().getResult().composition.panels.flatMap(panel=>panel.annotations).find(annotation=>annotation.id===' + JSON.stringify(id) + ')');
    const screenshot = async name => {
      await frames();
      fs.writeFileSync(path.join(output, name), (await bounded(contents.capturePage(), name, 20000)).toPNG());
    };
    const field = async (name, value) => {
      await evaluate(`(()=>{const element=document.querySelector('[data-label-field="${name}"]');if(!element)throw new Error('Missing ${name} field');element.focus();if(element.type==='checkbox')element.checked=${JSON.stringify(value)};else element.value=${JSON.stringify(value)};element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));element.blur();})()`);
      await frames();
    };
    const point = async selector => {
      const rect = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw new Error('Missing clickable ${selector}');element.scrollIntoView({block:'nearest',inline:'nearest'});const box=element.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height};})()`);
      return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    };
    const click = async selector => {
      const at = await point(selector);
      contents.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
      contents.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
      await frames();
    };
    let nextName;
    contents.session.on('will-download', (_event, item) => {
      const filename = path.join(output, nextName || path.basename(item.getFilename()));
      nextName = null;
      item.setSavePath(filename);
      item.once('done', (_done, status) => { report.downloads.push({ filename, status }); save(); });
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
    await evaluate("lab.preset('waveplate')");
    await evaluate("lab.setTextVisibility('showLabels',true);document.getElementById('renderNow').click()");
    await waitFor(() => evaluate('!lab.getRenderStudio().isBusy()&&!!lab.getRenderStudio().getResult()'), 'paper rendering');
    check('Rendered labels are selectable SVG text in the normal paper preview', await evaluate("document.querySelectorAll('[data-label-sheet] svg [data-j-ann]').length===5&&typeof lab.getRenderStudio().getLabelEditor==='function'"));
    const initial = await composition(), first = initial.panels[0].annotations[0], second = initial.panels[0].annotations[1];
    const originalRaster = initial.panels[0].image;
    const selector = '[data-label-sheet] [data-j-ann="' + first.id + '"]';
    await click(selector);
    check('Clicking existing text exposes its editable contents and per-label font controls', await evaluate("document.querySelector('[data-label-field=text]').value.includes('DFB13TK')&&!!document.querySelector('[data-label-field=fontChinese]')&&!!document.querySelector('[data-label-field=fontLatin]')"));
    const choices = await evaluate("({chinese:[...document.querySelector('[data-label-field=fontChinese]').options].map(option=>option.value),latin:[...document.querySelector('[data-label-field=fontLatin]').options].map(option=>option.value)})");
    report.fontChoices = choices;
    check('Common Chinese and English typefaces are directly selectable', ['SimSun', 'SimHei', 'Microsoft YaHei', 'KaiTi', 'FangSong', 'DengXian'].every(value => choices.chinese.includes(value)) && ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Courier New'].every(value => choices.latin.includes(value)));
    const editedText = '激光输入 & 样品 <A>\nLaser input 1310 nm';
    await field('text', editedText);
    await field('fontPt', '12');
    await field('color', '#4b238c');
    await field('bold', 'bold');
    await flush();
    const textEdited = await current(first.id);
    check('Text content, point size, bold weight and color update the selected annotation', textEdited.text === editedText && textEdited.fontPt === 12 && textEdited.bold === true && textEdited.color === '#4b238c');
    const secondAfterEdit = await current(second.id);
    check('Text edits preserve other annotations and the original 3D image', ['text', 'x', 'y', 'fontPt', 'color', 'anchorX', 'anchorY'].every(key => secondAfterEdit[key] === second[key]) && (await composition()).panels[0].image === originalRaster);
    const beforeFontFile = await download('font-before.png', "document.querySelector('[data-render=png]').click()");
    await field('fontChinese', 'KaiTi');
    await field('fontLatin', 'Arial');
    await flush();
    const fontEdited = await current(first.id);
    const afterFontFile = await download('font-after.png', "document.querySelector('[data-render=png]').click()");
    report.fontPixelDifference = pixelDifference(fs.readFileSync(beforeFontFile), fs.readFileSync(afterFontFile));
    check('Selected KaiTi and Arial fonts reach the exported annotation and visibly change its pixels', fontEdited.fontChinese === 'KaiTi' && fontEdited.fontLatin === 'Arial' && report.fontPixelDifference > 100);
    check('Editable SVG escapes literal angle brackets and ampersands in user text', await evaluate("(()=>{const svg=lab.getRenderStudio().getResult().svg;return svg.includes('&amp;')&&svg.includes('&lt;A&gt;')&&!svg.includes('<A>');})()"));
    await screenshot('label-font-editing.png');

    await click(selector);
    const beforeDrag = await current(first.id), at = await point(selector);
    report.dragHit = await evaluate(`(()=>{window.__labelPointerEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,event=>window.__labelPointerEvents.push({type,x:event.clientX,y:event.clientY,button:event.button,buttons:event.buttons,pointerId:event.pointerId,target:event.target.tagName,annotation:event.target.closest?.('[data-j-ann]')?.dataset.jAnn,dragging:lab.getRenderStudio().getLabelEditor().isDragging()}),true);const target=document.elementFromPoint(${at.x},${at.y});const node=document.querySelector(${JSON.stringify(selector)});return {at:${JSON.stringify(at)},target:target?.outerHTML.slice(0,500),bounds:node.getBoundingClientRect().toJSON(),pointerEvents:getComputedStyle(node).pointerEvents};})()`);
    contents.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
    await pause(30);
    report.dragAfterDown = await evaluate("({dragging:lab.getRenderStudio().getLabelEditor().isDragging(),events:window.__labelPointerEvents.slice()})");
    check('Pointer down in the center between two text lines starts a label drag', report.dragAfterDown.dragging);
    for (let step = 1; step <= 6; step++) {
      contents.sendInputEvent({ type: 'mouseMove', x: at.x + step * 9, y: at.y + step * 4, modifiers: ['leftButtonDown'] });
      await pause(25);
    }
    contents.sendInputEvent({ type: 'mouseUp', x: at.x + 54, y: at.y + 24, button: 'left', clickCount: 1 });
    await flush();
    const afterDrag = await current(first.id);
    report.dragEvents = await evaluate('window.__labelPointerEvents');
    report.drag = { before: beforeDrag, after: afterDrag };
    save();
    check('Real pointer dragging moves the selected label in both image axes', Math.abs(afterDrag.x - beforeDrag.x) > .005 && Math.abs(afterDrag.y - beforeDrag.y) > .005);
    check('Dragging keeps the leader attached to its original device anchor', afterDrag.anchorX === beforeDrag.anchorX && afterDrag.anchorY === beforeDrag.anchorY);
    await evaluate("document.querySelector('[data-label-action=undo]').click()");
    await flush();
    check('One label undo restores the pre-drag coordinates', equal(await current(first.id), beforeDrag));
    await evaluate("document.querySelector('[data-label-action=redo]').click()");
    await flush();
    check('One label redo restores the moved coordinates and style', equal(await current(first.id), afterDrag));
    await screenshot('label-dragged.png');

    await click(selector);
    await evaluate("document.querySelector('[data-label-action=apply-all]').click()");
    await flush();
    const allStyled = await composition();
    check('Apply-to-all changes all label typography while preserving each text and position', allStyled.panels[0].annotations.every(annotation => annotation.fontChinese === 'KaiTi' && annotation.fontLatin === 'Arial' && annotation.fontPt === 12 && annotation.bold === true) && allStyled.panels[0].annotations[1].text === second.text && allStyled.panels[0].annotations[1].x === second.x);

    const svgFile = await download('edited-labels.svg', "document.querySelector('[data-render=svg]').click()");
    const pngFile = await download('edited-labels.png', "document.querySelector('[data-render=png]').click()");
    const zipFile = await download('edited-labels.zip', "document.querySelector('[data-render=zip]').click()");
    const svg = fs.readFileSync(svgFile, 'utf8'), zip = readStoredZIP(zipFile);
    const zippedComposition = JSON.parse(zip.get('论文光路_论文排版.json').toString('utf8'));
    check('Normal SVG download contains editable updated text and selected fonts', svg.includes('Laser input 1310 nm') && svg.includes('KaiTi') && svg.includes('Arial') && svg.includes('&lt;A&gt;'));
    check('Normal PNG and ZIP contain the same current artwork and composition', fs.readFileSync(pngFile).equals(zip.get('论文光路.png')) && svg === zip.get('论文光路.svg').toString('utf8') && equal(zippedComposition, await composition()));
    check('Font editing preserves the original optical colors and 3D raster', (await composition()).panels[0].image === originalRaster && await evaluate('lab.getRenderStudio().getResult().settings.preserveConnectionColors===true'));

    const beforeRerender = await current(first.id);
    await evaluate("document.querySelector('[data-render=rerun]').click()");
    await waitFor(() => evaluate('!lab.getRenderStudio().isBusy()'), 'rerender');
    await flush();
    const afterRerender = await current(first.id);
    check('Rerendering preserves edited text, typeface, size and normalized position', ['text', 'fontChinese', 'fontLatin', 'fontPt', 'bold', 'color', 'x', 'y'].every(key => afterRerender[key] === beforeRerender[key]));

    await evaluate("document.querySelector('[data-render=typography]').click()");
    await waitFor(() => evaluate("document.getElementById('typographyDialog').open"), 'global typography dialog');
    await evaluate("(()=>{for(const [name,value]of [['chinese','SimHei'],['latin','Georgia'],['fontPt','10']]){const element=document.querySelector('[data-typography-field='+name+']');element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('[data-typography=apply]').click();})()");
    await evaluate("document.querySelector('[data-typography=close]').click()");
    await waitFor(() => evaluate("document.getElementById('renderDialog').open&&!document.getElementById('typographyDialog').open"), 'return to existing render after typography apply');
    await flush();
    const afterGlobal = await composition();
    check('Global font action immediately refreshes the existing rendered artwork', afterGlobal.typography.chinese === 'SimHei' && afterGlobal.typography.latin === 'Georgia' && afterGlobal.fontPt === 10 && await evaluate("document.querySelector('[data-label-sheet] svg').textContent.includes('Laser input 1310 nm')"));
    check('Global font application overrides per-label font families, point size and bold weight', afterGlobal.panels[0].annotations.every(annotation => !annotation.fontChinese && !annotation.fontLatin && (annotation.fontPt ?? afterGlobal.fontPt) === 10 && annotation.bold === undefined) && await evaluate(`(()=>{const text=document.querySelector(${JSON.stringify(selector)});return getComputedStyle(text).fontFamily.includes('Georgia')&&text.getAttribute('font-weight')==='400'&&Math.abs(Number(text.getAttribute('font-size'))*${afterGlobal.widthMM}/1000/25.4*72-10)<.001;})()`));
    check('Global font application preserves edited text and moved label coordinates', afterGlobal.panels[0].annotations[0].text === editedText && afterGlobal.panels[0].annotations[0].x === afterRerender.x && afterGlobal.panels[0].annotations[0].y === afterRerender.y);

    await click(selector);
    await field('fontLatin', 'Arial');
    await flush();
    const beforeSameApply = await evaluate('lab.getState().presentation.renderLabels');
    await evaluate("document.querySelector('[data-render=typography]').click()");
    await waitFor(() => evaluate("document.getElementById('typographyDialog').open"), 'global typography dialog for unchanged settings');
    await evaluate("document.querySelector('[data-typography=apply]').click();document.querySelector('[data-typography=close]').click()");
    await flush();
    const sameApplied = await current(first.id), afterSameApply = await evaluate('lab.getState().presentation.renderLabels');
    check('Applying unchanged global font settings still replaces a subsequent local font override', sameApplied.fontLatin === undefined && sameApplied.text === editedText && sameApplied.x === afterRerender.x && await evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).fontFamily.includes('Georgia')`));
    await evaluate("lab.getRenderStudio().close();document.getElementById('undo').click()");
    await waitFor(async () => equal(await evaluate('lab.getState().presentation.renderLabels'), beforeSameApply), 'undo of unchanged global font apply');
    check('Unchanged global font application has one main undo checkpoint restoring the local font', equal(await evaluate('lab.getState().presentation.renderLabels'), beforeSameApply));
    await evaluate("document.getElementById('redo').click()");
    await waitFor(async () => equal(await evaluate('lab.getState().presentation.renderLabels'), afterSameApply), 'redo of unchanged global font apply');
    check('Main redo reapplies the global font cleanup without losing label content or position', equal(await evaluate('lab.getState().presentation.renderLabels'), afterSameApply));
    await evaluate('lab.getRenderStudio().open()');

    await evaluate("document.querySelector('[data-render=edit]').click()");
    await waitFor(() => evaluate("!!document.querySelector('.journal-dialog[open]')"), 'journal editor');
    await evaluate("(()=>{const dialog=document.querySelector('.journal-dialog[open]');dialog.querySelector('[data-j-select-ann]').click();const input=dialog.querySelector('[data-j-prop=text]');input.value='图版回写 · Journal edit';input.dispatchEvent(new Event('change',{bubbles:true}));dialog.querySelector('[data-j-action=close]').click();})()");
    await waitFor(() => evaluate("document.getElementById('renderDialog').open"), 'return from journal');
    await flush();
    check('Continue-annotation editor writes its changed text back to the render preview and exports', (await current(first.id)).text === '图版回写 · Journal edit' && await evaluate("lab.getRenderStudio().getResult().svg.includes('Journal edit')"));

    await evaluate("document.querySelector('[data-render=edit]').click()");
    await waitFor(() => evaluate("!!document.querySelector('.journal-dialog[open]')"), 'journal layout import');
    await evaluate(`(()=>{const figure=structuredClone(lab.getRenderStudio().getResult().composition);figure.layout='row';figure.panelLetters=true;figure.margin=21;figure.gap=47;figure.panels.push({...structuredClone(figure.panels[0]),id:'qa_imported_panel',name:'Imported panel',kind:'import',annotations:[{...structuredClone(figure.panels[0].annotations[0]),id:'qa_panel_2_label',text:'第二图独立标注 · Second panel',x:.5,y:.2},{id:'qa_layout_arrow',type:'arrow',x:.15,y:.7,x2:.7,y2:.6,color:'#b33020',stroke:2.1}]});const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(figure)],'two-panel-qa.json',{type:'application/json'}));const input=document.querySelector('.journal-dialog[open] [data-j-ref=projectInput]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(() => evaluate("document.querySelectorAll('.journal-dialog[open] [data-j-select-panel]').length===2"), 'imported two-panel layout');
    await evaluate("document.querySelector('.journal-dialog[open] [data-j-action=close]').click()");
    await waitFor(() => evaluate("document.getElementById('renderDialog').open"), 'return from two-panel journal');
    await flush();
    const beforeMultiFont = await composition();
    check('Imported publication layout reaches the paper preview with both panels and a vector arrow', beforeMultiFont.panels.length === 2 && beforeMultiFont.panels[1].annotations.some(annotation=>annotation.type==='arrow'));
    await evaluate("document.querySelector('[data-render=typography]').click()");
    await waitFor(() => evaluate("document.getElementById('typographyDialog').open"), 'font dialog over two-panel layout');
    await evaluate("document.querySelector('[data-typography-field=latin]').value='Cambria';document.querySelector('[data-typography=apply]').click();document.querySelector('[data-typography=close]').click()");
    await flush();
    const afterMultiFont = await composition();
    const labelGeometry = annotation => Object.fromEntries(['id','sourceId','type','text','x','y','color','align','halo','leader','anchorX','anchorY','stroke','fill'].map(key=>[key,annotation[key]]));
    check('Global font application preserves multiple panels, ordering, layout and vector arrows', afterMultiFont.panels.length === 2 && afterMultiFont.typography.latin === 'Cambria' && ['layout','panelLetters','margin','gap','widthMM','dpi'].every(key=>afterMultiFont[key]===beforeMultiFont[key]) && afterMultiFont.panels.every((panel,index)=>panel.id===beforeMultiFont.panels[index].id && panel.image===beforeMultiFont.panels[index].image && equal(panel.annotations.filter(annotation=>annotation.type!=='text'),beforeMultiFont.panels[index].annotations.filter(annotation=>annotation.type!=='text')) && equal(panel.annotations.filter(annotation=>annotation.type==='text').map(labelGeometry),beforeMultiFont.panels[index].annotations.filter(annotation=>annotation.type==='text').map(labelGeometry))));
    check('Text in every panel follows the new global typeface', afterMultiFont.panels.flatMap(panel=>panel.annotations).filter(annotation=>annotation.type==='text').every(annotation=>!annotation.fontLatin) && await evaluate("[...document.querySelectorAll('[data-label-sheet] text[data-j-ann]')].every(text=>getComputedStyle(text).fontFamily.includes('Cambria'))"));
    await screenshot('label-multi-panel-font.png');

    const savedState = await evaluate('lab.getState()');
    fs.writeFileSync(path.join(output, 'edited-labels-project.json'), JSON.stringify(savedState, null, 2));
    const persistedText = (await current(first.id)).text;
    await evaluate("lab.getRenderStudio().close();lab.preset('empty')");
    await evaluate('lab.load(' + JSON.stringify(savedState) + ')');
    await evaluate("document.getElementById('renderNow').click()");
    await waitFor(() => evaluate('!lab.getRenderStudio().isBusy()&&!!lab.getRenderStudio().getResult()'), 'reloaded project render');
    await flush();
    const reloaded = (await composition()).panels[0].annotations.find(annotation => annotation.sourceId === first.sourceId);
    check('Saving and reloading the 3D project retains edited labels for the next paper render', reloaded?.text === persistedText && reloaded.x === afterRerender.x && reloaded.y === afterRerender.y);
    check('Secondary panel labels with the same source device do not overwrite the main rendered label on reload', reloaded.text !== '第二图独立标注 · Second panel');
    check('Reloaded edited label has no stale generated leader start', !Number.isFinite(reloaded.leaderStartX) && !Number.isFinite(reloaded.leaderStartY));
    check('Reloaded moved text keeps the visible leader start at the updated label', await evaluate(`(()=>{const text=document.querySelector(${JSON.stringify(selector)});let line=text.previousElementSibling;while(line&&line.tagName.toLowerCase()!=='line')line=line.previousElementSibling;return !!line&&Math.abs(Number(line.getAttribute('x1'))-Number(text.getAttribute('x')))<.001&&Math.abs(Number(line.getAttribute('y1'))-Number(text.getAttribute('y'))-Number(text.getAttribute('font-size'))*.25)<.001;})()`));
    await screenshot('label-editor-final.png');
    check('Label editing and export complete offline without renderer errors', report.rendererErrors.length === 0 && report.httpRequests.length === 0);
    report.allPassed = true;
  } catch (error) {
    report.allPassed = false;
    report.failure = error.stack;
    console.error(error);
    if (contents && !contents.isDestroyed()) {
      try { fs.writeFileSync(path.join(output, 'failure.png'), (await bounded(contents.capturePage(), 'failure screenshot', 20000)).toPNG()); } catch {}
      try { report.failureDOM = await contents.executeJavaScript('({text:document.body.innerText.slice(-12000),state:window.lab?.getState?.(),render:window.lab?.getRenderStudio?.().getResult?.()?.composition})'); } catch {}
    }
  } finally {
    save();
    console.log('QA report written to ' + reportPath);
    app.exit(report.allPassed ? 0 : 1);
  }
});
