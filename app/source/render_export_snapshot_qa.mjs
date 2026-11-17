import assert from 'node:assert/strict';
import fs from 'node:fs';
import {makeRenderZIP} from './render-export.js';

let finishPNG;
const waitPNG=new Promise(resolve=>{finishPNG=resolve;});
const result={png:{arrayBuffer:()=>waitPNG},svg:'<svg>original</svg>',composition:{text:'original'},sourceScene:{title:'original'},settings:{fontPt:8},width:100,height:50,dpi:300,widthMM:89};
const pending=makeRenderZIP(result);
result.svg='<svg>later edit</svg>';
result.composition.text='later edit';
result.sourceScene.title='later edit';
result.settings.fontPt=12;
result.width=200;
finishPNG(new Uint8Array([137,80,78,71]).buffer);
const bytes=Buffer.from(await (await pending).arrayBuffer()),entries=new Map();
let offset=0;
while(bytes.readUInt32LE(offset)===0x04034b50){
  const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
  const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8'),start=offset+30+nameLength+extraLength;
  entries.set(name,bytes.subarray(start,start+size));offset=start+size;
}
assert.deepEqual([...entries.get('论文光路.png')],[137,80,78,71]);
assert.equal(entries.get('论文光路.svg').toString(),'<svg>original</svg>');
assert.equal(JSON.parse(entries.get('论文光路_论文排版.json')).text,'original');
assert.equal(JSON.parse(entries.get('三维场景_工程.json')).title,'original');
assert.equal(JSON.parse(entries.get('渲染参数.json')).settings.fontPt,8);
assert.equal(JSON.parse(entries.get('渲染参数.json')).width,100);
const report={allPassed:true,checks:6,description:'ZIP keeps a coherent snapshot when text, project and settings change while reading PNG bytes'};
fs.writeFileSync(new URL('../qa/render_export_snapshot_qa.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
