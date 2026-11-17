import {publicationSVG,publicationLayout,addPNGResolution} from './publication.js';

export async function renderCompositionPNG(composition){
  await document.fonts.ready;
  const layout=publicationLayout(composition),width=Math.round(composition.widthMM/25.4*composition.dpi),height=Math.round(width*layout.height/1000);
  if(width>14000||height>14000||width*height>60000000)throw new Error('图幅过大，请选300 dpi或减少同一场景中的器件。');
  const svg=publicationSVG(composition),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    const im=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('渲染图无法编码，请重试。'));image.src=url;});
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(im,0,0,width,height);
    const raw=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!raw)throw new Error('PNG生成失败。');
    const png=new Blob([addPNGResolution(new Uint8Array(await raw.arrayBuffer()),composition.dpi)],{type:'image/png'});
    canvas.width=canvas.height=1;
    return {svg,png,width,height};
  }finally{URL.revokeObjectURL(url);}
}

function crc32(bytes){let crc=-1;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^-1)>>>0;}

// Uncompressed ZIP keeps this offline exporter dependency-free and preserves exact data.
export async function makeRenderZIP(result){
  const enc=new TextEncoder(),json=x=>enc.encode(JSON.stringify(x,null,2)),png=result.png;
  // Snapshot every editable value before awaiting the immutable PNG Blob.
  // Later edits must not mix a new SVG/project with the exported image.
  const entries=[
    ['论文光路.svg',enc.encode(result.svg)],
    ['论文光路_论文排版.json',json(result.composition)],
    ['三维场景_工程.json',json(result.sourceScene)],
    ['渲染参数.json',json({createdAt:result.createdAt,width:result.width,height:result.height,dpi:result.dpi,widthMM:result.widthMM,projection:result.projection,settings:result.settings})],
    ['编辑说明.txt',enc.encode('论文光路.png：含实际600/300 dpi信息的高清图片。\n论文光路.svg：三维画面内嵌，文字和引线独立可编辑。\n论文光路_论文排版.json：在平台“论文排图→载入排版”中编辑。\n三维场景_工程.json：在平台“打开工程”中继续修改器件与光纤。\n通用器件外形用于布局示意；真实几何可用自己的GLB替换。\n')]
  ];
  entries.unshift(['论文光路.png',new Uint8Array(await png.arrayBuffer())]);
  const local=[],central=[];let offset=0,centralSize=0;const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),date=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const [filename,bytes] of entries){
    const name=enc.encode(filename),crc=crc32(bytes),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(10,time,true);v.setUint16(12,date,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);header.set(name,30);local.push(header,bytes);
    const ch=new Uint8Array(46+name.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(12,time,true);cv.setUint16(14,date,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);ch.set(name,46);central.push(ch);centralSize+=ch.length;offset+=header.length+bytes.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
