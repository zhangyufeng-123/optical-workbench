// Current shell module, executed with a small in-memory DOM. No browser/UI pixels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {installWorkbenchShell,normalizeShellPreferences,organizePropertyPanel} from './workbench-shell.js';
class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.attrs={};this.className='';this.dataset={};this.listeners={};this.text='';this.value='';this.open=false;this.hidden=false;this.classList={contains:name=>this.className.split(/\s+/).includes(name),add:(...names)=>this.className=[...new Set([...this.className.split(/\s+/),...names])].filter(Boolean).join(' '),remove:(...names)=>this.className=this.className.split(/\s+/).filter(name=>!names.includes(name)).join(' '),toggle:(name,force)=>{const active=force===undefined?!this.classList.contains(name):!!force;active?this.classList.add(name):this.classList.remove(name);return active;}};}
  get id(){return this.attrs.id||'';}set id(value){this.attrs.id=value;}
  get nextSibling(){if(!this.parentNode)return null;return this.parentNode.children[this.parentNode.children.indexOf(this)+1]||null;}
  get textContent(){return this.text+this.children.map(child=>child.textContent).join('');}set textContent(value){this.replaceChildren();this.text=String(value);}
  get innerHTML(){return this.text+this.children.map(child=>`<${child.tagName.toLowerCase()}${child.className?' class="'+child.className+'"':''}>${child.innerHTML}</${child.tagName.toLowerCase()}>`).join('');}
  set innerHTML(value){this.replaceChildren();const stack=[this];for(const token of String(value).match(/<[^>]+>|[^<]+/g)||[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const match=token.match(/^<([a-zA-Z0-9-]+)/);if(!match)continue;const node=new Element(match[1]);for(const attr of token.matchAll(/([\w-]+)="([^"]*)"/g))node.setAttribute(attr[1],attr[2]);stack.at(-1).append(node);if(!token.endsWith('/>')&&!['input','br','img'].includes(match[1]))stack.push(node);}else{stack.at(-1).text+=token;}}}
  append(...nodes){for(const node of nodes){node.remove();node.parentNode=this;this.children.push(node);}}
  prepend(...nodes){for(const node of [...nodes].reverse()){node.remove();node.parentNode=this;this.children.unshift(node);}}
  before(node){this.parentNode?.insertBefore(node,this);}
  insertBefore(node,reference){node.remove();const index=this.children.indexOf(reference);node.parentNode=this;this.children.splice(index<0?this.children.length:index,0,node);}
  replaceChildren(...nodes){for(const node of this.children)node.parentNode=null;this.children=[];this.text='';this.append(...nodes);}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}}
  setAttribute(name,value){if(name==='class')this.className=String(value);else if(name==='hidden')this.hidden=true;else this.attrs[name]=String(value);}
  getAttribute(name){if(name==='class')return this.className||null;if(name==='hidden')return this.hidden?'':null;return this.attrs[name]??null;}
  removeAttribute(name){if(name==='class')this.className='';else if(name==='hidden')this.hidden=false;else delete this.attrs[name];}
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
  removeEventListener(type,handler){this.listeners[type]=(this.listeners[type]||[]).filter(fn=>fn!==handler);}
  click(){this.onclick?.({target:this});this.emit('click');}
  emit(type,extra={}){const event={target:this,key:'',preventDefault(){},stopPropagation(){},...extra};for(const handler of this.listeners[type]||[])handler(event);}
  focus(){document.activeElement=this;}
  contains(node){return this===node||this.children.some(child=>child.contains(node));}
  matches(selector){if(selector.startsWith('#'))return this.id===selector.slice(1);if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));return this.tagName.toLowerCase()===selector;}
  closest(selector){return this.matches(selector)?this:this.parentNode?.closest(selector)||null;}
  querySelectorAll(selector){const result=[];const walk=node=>{for(const child of node.children){if(child.matches(selector))result.push(child);walk(child);}};walk(this);return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const body=new Element('body'),doc=new Element('document');doc.append(body);doc.body=body;doc.createElement=tag=>new Element(tag);doc.getElementById=id=>doc.querySelector('#'+id);const query=doc.querySelector.bind(doc);doc.querySelector=selector=>selector==='body > header'?body.children.find(node=>node.tagName==='HEADER'):query(selector);
globalThis.document=doc;globalThis.window={innerWidth:1440};const stored=new Map();globalThis.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
globalThis.MutationObserver=class{constructor(fn){this.callback=fn;}observe(){}disconnect(){}};
const make=(tag,parent,{id,cls,text}={})=>{const node=new Element(tag);if(id)node.id=id;if(cls)node.className=cls;if(text)node.textContent=text;parent?.append(node);return node;};
const header=make('header',body),brand=make('div',header,{cls:'brand'});brand.innerHTML='<b>Original</b><span>Subtitle</span>';
const headerTools=make('div',header,{cls:'tools'}),app=make('div',body,{id:'app'}),library=make('aside',app,{cls:'library'}),main=make('main',app),inspector=make('aside',app,{cls:'inspector'}),viewbar=make('div',main,{cls:'viewbar'}),mode=make('div',viewbar,{cls:'tools'}),views=make('div',viewbar,{cls:'tools'}),viewport=make('div',main,{id:'viewport'}),pro=make('div',main,{cls:'pro-toolbar'}),tabs=make('div',pro,{cls:'workspace-tabs'}),align=make('div',pro,{cls:'pro-actions'});
for(const id of ['save','load','renameScene','image','export','bomExport','help','undo','redo','toggleLibrary','toggleInspector','resetAppearance'])make('button',headerTools,{id,text:id});
for(const id of ['benchMode','studioMode','journalMode','renderNow','openPaletteStudio','drawingTools'])make('button',tabs,{id,text:id});
for(const id of ['selectAll','alignX','alignZ','distributeX','distributeZ','layoutCheck'])make('button',align,{id,text:id});
for(const id of ['move','connect','fiberType'])make(id==='fiberType'?'select':'button',mode,{id,text:id});for(const id of ['view3d','top','fit'])make('button',views,{id,text:id});
make('div',viewport,{cls:'view-options'});make('div',main,{id:'connections'});make('button',main,{id:'toggleConnections'}).onclick=()=>document.getElementById('connections').classList.toggle('hidden');
make('div',inspector,{id:'property'});make('div',inspector,{id:'sceneList'});for(const cls of ['presets','scene-options','advanced-section'])make('div',inspector,{cls});
const categories=make('div',library,{id:'categories'});for(const [i,text]of ['全部','光源','空间光学'].entries()){const node=make('button',categories,{text,cls:i?'':'active'});node.onclick=()=>{categories.children.forEach(child=>child.classList.remove('active'));node.classList.add('active');};}
make('div',library,{id:'catalog'});make('span',library,{id:'libcount'});
document.getElementById('toggleLibrary').onclick=()=>body.classList.toggle('library-collapsed');document.getElementById('toggleInspector').onclick=()=>body.classList.toggle('inspector-collapsed');
const originalButtons=new Map(doc.querySelectorAll('button').map(node=>[node.id,node]));let selected=[],edge=null,commands=0,resizes=0,saved=0;
originalButtons.get('save').onclick=()=>saved++;
const api=installWorkbenchShell({getState:()=>({items:[],connections:[]}),getSelection:()=>selected,getSelectedEdge:()=>edge,openCommands:()=>commands++,resize:()=>resizes++});
const tests=[];function test(name,fn){fn();tests.push({name,passed:true});}
test('preferences reject unknown density, catalog and tab without mutation',()=>{const value={density:'huge',catalog:'broken',inspector:'all'};assert.deepEqual(normalizeShellPreferences(value),{density:'comfortable',catalog:'list',inspector:'properties',connectionsOpen:false});assert.equal(value.density,'huge');});
test('all existing action nodes and original save handler are retained',()=>{for(const [id,node]of originalButtons)if(id)assert.equal(document.getElementById(id),node,id);document.getElementById('save').click();assert.equal(saved,1);assert.equal(document.getElementById('save').parentNode.parentNode.id,'shellFileMenu');});
test('command launcher invokes supplied API',()=>{document.getElementById('openCommands').click();assert.equal(commands,1);});
test('inspector tab hides nonactive panels and stops navigation keys reaching canvas',()=>{api.showInspector('objects');assert.equal(document.getElementById('shellObjectsPanel').hidden,false);assert.equal(document.getElementById('shellPropertiesPanel').hidden,true);let stopped=0;document.getElementById('shellTab_objects').emit('keydown',{key:'ArrowRight',stopPropagation:()=>stopped++});assert.equal(stopped,1);assert.equal(api.getPreferences().inspector,'settings');assert.equal(document.activeElement.id,'shellTab_settings');});
test('new selection opens properties once while unchanged selection preserves settings',()=>{selected=['one'];api.refresh();assert.equal(api.getPreferences().inspector,'properties');api.showInspector('settings');api.refresh();assert.equal(api.getPreferences().inspector,'settings');edge='edge1';api.refresh();assert.equal(api.getPreferences().inspector,'properties');});
test('focus mode restores previous sidebar collapse choices',()=>{body.classList.add('library-collapsed');body.classList.remove('inspector-collapsed');api.setFocusMode(true);assert(body.classList.contains('shell-focus'));assert.equal(document.getElementById('exitCanvasFocus').hidden,false);document.getElementById('exitCanvasFocus').click();assert(!body.classList.contains('shell-focus'));assert(body.classList.contains('library-collapsed'));assert(!body.classList.contains('inspector-collapsed'));});
test('command API toggles focus mode when called without an argument',()=>{assert.equal(api.setFocusMode(),true);assert.equal(api.getPreferences().focusMode,true);assert.equal(api.setFocusMode(),false);assert.equal(api.getPreferences().focusMode,false);});
test('category dropdown invokes original library category handler',()=>{const select=document.getElementById('libraryCategory');select.value='2';select.emit('change');assert(categories.children[2].classList.contains('active'));assert.equal(select.value,'2');});
test('density and library preferences persist independently from project',()=>{const density=document.getElementById('interfaceDensity');density.value='compact';density.emit('change');document.getElementById('libraryCardsView').click();assert.equal(body.dataset.interfaceDensity,'compact');assert.equal(body.dataset.catalogView,'cards');const value=JSON.parse(stored.get('fiberWorkbench.ui.v5'));assert.equal(value.density,'compact');assert.equal(value.catalog,'cards');});
test('late tool launchers move into the retained tools container',()=>{const node=make('button',headerTools,{id:'precisionTools',text:'精确编辑'});api.refresh();assert.equal(node.parentNode,tabs);assert.equal(tabs.parentNode.parentNode.id,'shellToolsMenu');});
test('collapsed connection list reflects original toggle state and persistence',()=>{assert(document.getElementById('connections').classList.contains('hidden'));document.getElementById('toggleConnections').click();assert.equal(document.getElementById('toggleConnections').getAttribute('aria-expanded'),'true');assert.equal(api.getPreferences().connectionsOpen,true);});
test('narrow screen panel actions open on first click and can close',()=>{window.innerWidth=600;body.classList.remove('show-inspector','inspector-collapsed','shell-library-open','library-collapsed');document.getElementById('toggleInspector').click();assert(body.classList.contains('show-inspector'));assert(!body.classList.contains('inspector-collapsed'));document.getElementById('toggleInspector').click();assert(!body.classList.contains('show-inspector'));document.getElementById('toggleLibrary').click();assert(body.classList.contains('shell-library-open'));assert(!body.classList.contains('library-collapsed'));});
test('narrow drawers have independent direct close buttons',()=>{document.getElementById('closeLibraryMobile').click();assert(!body.classList.contains('shell-library-open'));assert(body.classList.contains('library-collapsed'));api.showInspector('objects');assert(body.classList.contains('show-inspector'));document.getElementById('closeInspectorMobile').click();assert(!body.classList.contains('show-inspector'));assert(body.classList.contains('inspector-collapsed'));});
function fillDeviceProperty(property){
  property.replaceChildren();const heading=make('h3',property,{text:'器件标题'}),source=make('span',property,{cls:'tag',text:'长来源'}),nameLabel=make('label',property,{cls:'field'});make('input',nameLabel,{id:'itemName'});
  const position=make('label',property,{cls:'field'});make('input',position,{id:'posX'});make('input',position,{id:'posZ'});
  const portList=make('div',property,{id:'portList'});const portButton=make('button',portList,{text:'端口1'});const note=make('p',property,{cls:'note',text:'器件说明'});
  const extra=make('div',null,{id:'extraProperties',cls:'extra-properties'});property.prepend(extra);const height=make('label',extra,{cls:'field'}),heightInput=make('input',height,{id:'heightY'});let changes=0;heightInput.onchange=()=>changes++;
  make('div',extra,{cls:'selection-summary',text:'已选1件'});make('div',extra,{cls:'flag-row'});const figureLabel=make('label',extra,{cls:'field'});make('input',figureLabel,{id:'figureLabel'});const actions=make('div',extra,{cls:'actions'});make('button',actions,{id:'lockSelection'});
  const colorLabel=make('label',property,{cls:'field'});const colorInput=make('input',colorLabel,{id:'itemColorLock'});colorInput.onchange=()=>changes++;
  return {heading,source,position,portList,portButton,note,extra,height,heightInput,colorLabel,colorInput,changes:()=>changes};
}
const propertyFixture=make('section',body,{id:'propertyFixture'});let form=fillDeviceProperty(propertyFixture);
test('device description and advanced flags fold without moving height outside its owner',()=>{
  organizePropertyPanel(propertyFixture,'one');assert.equal(propertyFixture.children[0],form.heading);assert.equal(form.position.nextSibling,form.extra);assert.equal(form.height.parentNode,form.extra);
  const info=propertyFixture.querySelector('#shellPropertyInfo'),labels=propertyFixture.querySelector('#shellPropertyLabels');assert.equal(info.open,false);assert.equal(labels.open,false);assert.equal(form.source.parentNode,info);assert.equal(form.note.parentNode,info);assert.equal(labels.parentNode,form.extra);assert.equal(form.colorLabel.parentNode,labels);assert.equal(form.portList.parentNode,propertyFixture);assert.equal(form.portButton.parentNode,form.portList);form.heightInput.onchange();form.colorInput.onchange();assert.equal(form.changes(),2);
});
test('property refresh is idempotent and preserves expanded detail state',()=>{
  propertyFixture.querySelector('#shellPropertyInfo').open=true;propertyFixture.querySelector('#shellPropertyLabels').open=true;
  for(let i=0;i<5;i++)organizePropertyPanel(propertyFixture,'one');assert.equal(propertyFixture.querySelectorAll('#heightY').length,1);assert.equal(propertyFixture.querySelectorAll('#itemColorLock').length,1);assert.equal(propertyFixture.querySelectorAll('#shellPropertyLabels').length,1);assert.equal(propertyFixture.querySelector('#shellPropertyInfo').open,true);assert.equal(propertyFixture.querySelector('#shellPropertyLabels').open,true);
});
test('independent extraProperties removal and recreation leaves one height and preserves external color handler',()=>{
  const oldHeight=form.heightInput,color=form.colorInput;form.extra.remove();assert.equal(propertyFixture.querySelector('#heightY'),null);
  const extra=make('div',null,{id:'extraProperties',cls:'extra-properties'});propertyFixture.prepend(extra);const row=make('label',extra,{cls:'field'}),height=make('input',row,{id:'heightY'});make('div',extra,{cls:'flag-row'});
  organizePropertyPanel(propertyFixture,'one');assert.equal(propertyFixture.querySelectorAll('#heightY').length,1);assert.equal(propertyFixture.querySelector('#heightY'),height);assert.equal(row.parentNode,extra);assert.equal(propertyFixture.querySelector('#itemColorLock'),color);assert(!propertyFixture.contains(oldHeight));color.onchange();assert.equal(form.changes(),3);
});
test('full property rebuild uses new controls and new selection starts collapsed',()=>{
  const oldColor=form.colorInput;form=fillDeviceProperty(propertyFixture);organizePropertyPanel(propertyFixture,'two');assert.equal(propertyFixture.querySelectorAll('#itemColorLock').length,1);assert.equal(propertyFixture.querySelector('#itemColorLock'),form.colorInput);assert.notEqual(form.colorInput,oldColor);assert.equal(propertyFixture.querySelector('#shellPropertyInfo').open,false);assert.equal(propertyFixture.querySelector('#shellPropertyLabels').open,false);
});
test('connection endpoints and route controls stay visible while top-level explanation folds',()=>{
  propertyFixture.replaceChildren();const heading=make('h3',propertyFixture,{text:'光纤连接'}),tag=make('span',propertyFixture,{cls:'tag',text:'Source → Detector'}),color=make('input',propertyFixture,{id:'edgeColor'}),note=make('p',propertyFixture,{cls:'note',text:'连接说明'}),extra=make('div',propertyFixture,{id:'extraProperties'}),route=make('input',extra,{id:'routeControl'});
  organizePropertyPanel(propertyFixture,'edge');assert.equal(propertyFixture.children[0],heading);assert.equal(tag.parentNode,propertyFixture);assert.equal(color.parentNode,propertyFixture);assert.equal(route.parentNode,extra);assert.equal(note.parentNode.id,'shellPropertyInfo');assert.equal(propertyFixture.querySelector('#shellPropertyLabels'),null);
});
test('empty selection keeps short getting-started hint visible',()=>{propertyFixture.replaceChildren();make('h3',propertyFixture,{text:'选择一个器件'});const note=make('p',propertyFixture,{cls:'note',text:'点击器件'});organizePropertyPanel(propertyFixture,'empty');assert.equal(note.parentNode,propertyFixture);assert.equal(propertyFixture.querySelector('#shellPropertyInfo'),null);propertyFixture.remove();});
test('destroy restores old controls and disconnects shell actions',()=>{api.destroy();assert(!body.classList.contains('workbench-v5'));assert.equal(document.getElementById('save').parentNode,headerTools);assert.equal(headerTools.hidden,false);assert.equal(pro.hidden,false);assert.equal(document.getElementById('openCommands'),null);assert(resizes>0);});
const source=fileURLToPath(new URL('./workbench-shell.js',import.meta.url)),css=fileURLToPath(new URL('../workbench-shell.css',import.meta.url));
test('responsive CSS declares compact menu labels and a natural two-row narrow toolbar',()=>{const text=fs.readFileSync(css,'utf8');assert.match(text,/@media\(max-width:1120px\).*shell-view-controls.*summary>span.*display:none/);assert.match(text,/@media\(max-width:520px\).*height:auto;flex-wrap:wrap.*shell-mode-tools\{flex:1 1 100%/);assert.match(text,/body\.workbench-v5>header/);});
test('favorite star overrides legacy left anchoring and bounds its hit width',()=>{const text=fs.readFileSync(css,'utf8');assert.match(text,/\.part-card \.favorite-star\{[^}]*left:auto;[^}]*width:18px;[^}]*text-align:center/);});
const hash=path=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
const report={allPassed:true,checks:tests.length,scope:'Current workbench-shell module with in-memory DOM substitutes; verifies action identity, tab selection, prefs and responsive state. No real browser, CSS layout, WebGL pixels or visual acceptance.',sources:{'source/workbench-shell.js':hash(source),'workbench-shell.css':hash(css)},tests};
fs.writeFileSync(new URL('../qa/workbench_shell_qa.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({allPassed:true,checks:tests.length}));
