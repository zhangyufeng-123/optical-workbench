/* Object-aware, editable label layout for a rendered scientific apparatus.
 * Does not move, rotate, rescale, hide, or relabel any 3D device.
 * Coordinates supplied by capture are image pixels. Returned annotations are
 * normalized to the padded embedded image and use physical point sizes.
 */

import {normalizeTypography,fontFamily,canvasFont} from './typography.js';
const PAPER_MARGIN=15;
const EPSILON=.05;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,fallback)=>Number.isFinite(n)?n:fallback;
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const shifted=(r,dx,dy)=>rect(r.left+dx,r.top+dy,r.width,r.height);
const expanded=(r,p)=>rect(r.left-p,r.top-p,r.width+2*p,r.height+2*p);
const intersects=(a,b,gap=0)=>a.left<b.right+gap-EPSILON&&a.right>b.left-gap+EPSILON&&a.top<b.bottom+gap-EPSILON&&a.bottom>b.top-gap+EPSILON;
const midpoint=r=>({x:(r.left+r.right)/2,y:(r.top+r.bottom)/2});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function optionsOf(options={}){
  const typography=normalizeTypography(options.typography);
  const o={title:'全光纤光路',widthMM:183,dpi:600,fontPt:typography.fontPt,labels:true,background:'white',...options,typography};
  if(!Number.isFinite(o.widthMM)||o.widthMM<50||o.widthMM>400)throw new Error('论文宽度须为 50–400 mm');
  if(![150,300,600].includes(o.dpi))throw new Error('DPI 须为 150、300 或 600');
  if(!Number.isFinite(o.fontPt)||o.fontPt<5||o.fontPt>20)throw new Error('论文标签字号须为 5–20 pt');
  if(!['white','transparent'].includes(o.background))throw new Error('背景须为 white 或 transparent');
  o.title=String(o.title||'全光纤光路');
  return o;
}

function dimensionsOf(capture){
  const width=Number(capture?.width),height=Number(capture?.height);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>=20000||height>=20000)throw new Error('渲染图尺寸无效');
  return {width:Math.round(width),height:Math.round(height)};
}

function boxOf(label,width,height){
  const b=label.box;
  if(b&&[b.left,b.top,b.right,b.bottom].every(Number.isFinite)){
    const left=clamp(Math.min(b.left,b.right),0,width),right=clamp(Math.max(b.left,b.right),0,width);
    const top=clamp(Math.min(b.top,b.bottom),0,height),bottom=clamp(Math.max(b.top,b.bottom),0,height);
    if(right-left>EPSILON&&bottom-top>EPSILON)return {box:rect(left,top,right-left,bottom-top),approximate:false};
  }
  // Older captures have only a proposed label point. Preserve all their labels,
  // while explicitly identifying the point-only fallback in QA metadata.
  const x=clamp(finite(label.anchorX,finite(label.x,width/2)),0,width);
  const y=clamp(finite(label.anchorY,finite(label.y,height/2)),0,height);
  return {box:rect(x-1,y-1,2,2),approximate:true};
}

function textMeasurement(text,fontPx,measure){
  const m=measure(String(text),fontPx);
  const width=typeof m==='number'?m:Math.max(finite(m?.width,0),finite(m?.actualBoundingBoxLeft,0)+finite(m?.actualBoundingBoxRight,0));
  return {width:Math.max(0,width),ascent:finite(m?.actualBoundingBoxAscent,fontPx*.86),descent:finite(m?.actualBoundingBoxDescent,fontPx*.24)};
}

function wrapWithoutEllipsis(text,maxWidth,fontPx,measure){
  const lines=[];
  // A line that physically cannot fit at the requested paper size is wrapped,
  // never truncated or silently reduced in font size.
  for(const explicitLine of String(text).replace(/\r\n?/g,'\n').split('\n')){
    if(textMeasurement(explicitLine,fontPx,measure).width<=maxWidth){lines.push(explicitLine);continue;}
    const graphemes=typeof Intl?.Segmenter==='function'?[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(explicitLine)].map(x=>x.segment):Array.from(explicitLine);
    let current='';
    for(const glyph of graphemes){
      if(current&&textMeasurement(current+glyph,fontPx,measure).width>maxWidth){lines.push(current);current=glyph;}
      else current+=glyph;
    }
    if(current||!explicitLine)lines.push(current);
  }
  return lines.length?lines:[''];
}

function frameFor(text,fontPx,maxWidth,measure){
  const lines=wrapWithoutEllipsis(text,maxWidth,fontPx,measure);
  const metrics=lines.map(line=>textMeasurement(line,fontPx,measure));
  const ascent=Math.max(fontPx*.76,...metrics.map(m=>m.ascent));
  const descent=Math.max(fontPx*.20,...metrics.map(m=>m.descent));
  const padX=fontPx*.24,padY=fontPx*.18,lineHeight=fontPx*1.2;
  const contentWidth=Math.max(fontPx*.2,...metrics.map(m=>m.width));
  return {text:lines.join('\n'),width:contentWidth+2*padX,height:ascent+descent+(lines.length-1)*lineHeight+2*padY,ascent,descent,padX,padY,lineHeight,lineCount:lines.length,wrapped:lines.join('\n')!==String(text)};
}

function leaderStart(r,anchor){
  const c=midpoint(r),dx=anchor.x-c.x,dy=anchor.y-c.y;
  if(Math.abs(dx)+Math.abs(dy)<EPSILON)return {x:c.x,y:r.bottom};
  const factor=1/Math.max(Math.abs(dx)/(r.width/2),Math.abs(dy)/(r.height/2));
  return {x:c.x+dx*factor,y:c.y+dy*factor};
}

function segmentHitsBox(a,b,r){
  let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
  for(const [p,q] of [[-dx,a.x-r.left],[dx,r.right-a.x],[-dy,a.y-r.top],[dy,r.bottom-a.y]]){
    if(Math.abs(p)<EPSILON){if(q<0)return false;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(lo>hi)return false;
  }
  return hi>=0&&lo<=1;
}

function placement(item,box,name){return {item,box,placement:name,anchor:item.anchor};}

/**
 * Layout-only entry point. With an injected measure(text,fontPx) function this
 * routine is deterministic and does not access the DOM or alter an image.
 */
export function planRenderLabels(capture,options={},measure){
  const o=optionsOf(options),{width:imageWidth,height:imageHeight}=dimensionsOf(capture);
  if(typeof measure!=='function')throw new Error('需要字体测量函数');
  const rawLabels=o.labels?(Array.isArray(capture.labels)?capture.labels:[]):[];
  if(!rawLabels.length)return {imageWidth,imageHeight,width:imageWidth,height:imageHeight,fontPx:0,padding:{left:0,right:0,top:0,bottom:0},placements:[],warnings:[],labelOverlapPairs:[],objectOverlapPairs:[],leaderTextIntersections:[]};

  const sidePadding=Math.ceil(imageWidth*.025),width=imageWidth+2*sidePadding;
  // publication.js places one panel inside a 1000-unit page with this margin.
  // Convert the final physical point size into embedded-image pixel units.
  const panelUnits=1000-2*PAPER_MARGIN;
  const fontPx=o.fontPt/72*25.4/o.widthMM*1000*width/panelUnits;
  const outerGap=Math.max(8,fontPx*.16),objectGap=Math.max(7,fontPx*.30),labelGap=Math.max(7,fontPx*.30);
  const gutter=Math.max(sidePadding*.35,fontPx*.36);
  const maxTextWidth=width-2*gutter-fontPx*.48;
  const warnings=[];
  const items=rawLabels.map((label,index)=>{
    const originalText=String(label.text??'');
    const source=boxOf(label,imageWidth,imageHeight),box=shifted(source.box,sidePadding,0),c=midpoint(box);
    const anchor={x:clamp(finite(label.anchorX,c.x-sidePadding),0,imageWidth)+sidePadding,y:clamp(finite(label.anchorY,c.y),0,imageHeight)};
    return {index,sourceId:String(label.id??index),originalText,box,anchor,approximate:source.approximate,frame:frameFor(originalText,fontPx,maxTextWidth,measure),desiredX:clamp(finite(label.x,c.x-sidePadding)+sidePadding,gutter,width-gutter)};
  });
  if(items.some(i=>i.approximate))warnings.push('部分画面没有物体投影边界，已按提供的锚点布局；这些标签需人工复核。');
  if(items.some(i=>i.frame.wrapped))warnings.push('有标签超出当前纸宽下的单行容量，已保持字号并折行，未省略文字。');

  const placed=[],unplaced=[];
  const sorted=[...items].sort((a,b)=>a.box.top-b.box.top||a.anchor.x-b.anchor.x||a.index-b.index);
  for(const it of sorted){
    const f=it.frame,b=it.box,c=midpoint(b);
    const xChoices=[it.desiredX,c.x,b.left+f.width/2,b.right-f.width/2,c.x-f.width*.4,c.x+f.width*.4];
    const candidates=[];
    for(const x of xChoices){
      const left=clamp(x-f.width/2,gutter,width-gutter-f.width);
      candidates.push({box:rect(left,b.top-objectGap-f.height,f.width,f.height),name:'above',preference:0});
      candidates.push({box:rect(left,b.bottom+objectGap,f.width,f.height),name:'below',preference:fontPx*.45});
    }
    for(const y of [it.anchor.y-f.height/2,c.y-f.height/2]){
      candidates.push({box:rect(b.left-objectGap-f.width,y,f.width,f.height),name:'left',preference:fontPx*.75});
      candidates.push({box:rect(b.right+objectGap,y,f.width,f.height),name:'right',preference:fontPx*.75});
    }
    let best=null;
    for(const candidate of candidates){
      const r=candidate.box;
      if(r.left<gutter||r.right>width-gutter||r.top<outerGap||r.bottom>imageHeight-outerGap)continue;
      if(items.some(other=>intersects(r,expanded(other.box,objectGap*.3))))continue;
      if(placed.some(other=>intersects(r,other.box,labelGap)))continue;
      const start=leaderStart(r,it.anchor);
      const textCrossings=placed.filter(other=>segmentHitsBox(start,it.anchor,expanded(other.box,2))||segmentHitsBox(leaderStart(other.box,other.anchor),other.anchor,expanded(r,2))).length;
      const objectCrossings=items.filter(other=>other!==it&&segmentHitsBox(start,it.anchor,other.box)).length;
      const score=distance(start,it.anchor)+Math.abs(midpoint(r).x-it.desiredX)*.15+candidate.preference+textCrossings*fontPx*80+objectCrossings*fontPx*8;
      if(!best||score<best.score)best={...candidate,score,textCrossings};
    }
    // Keep long leaders from being mistaken for a neighboring apparatus.
    if(best&&best.textCrossings===0&&distance(leaderStart(best.box,it.anchor),it.anchor)<Math.max(imageWidth*.20,it.frame.width*1.5))placed.push(placement(it,best.box,best.name));
    else unplaced.push(it);
  }

  // Rows extend into new transparent space; every remaining label gets a seat.
  // Within a row, labels follow the horizontal order of their device anchors.
  const bands={top:[],bottom:[]};
  const routeSide=it=>(it.box.top<=imageHeight-it.box.bottom?'top':'bottom');
  const pending=[...unplaced].sort((a,b)=>routeSide(a).localeCompare(routeSide(b))||a.anchor.x-b.anchor.x||a.index-b.index);
  const rowY=(side,rows,index,height)=>{
    const preceding=rows.slice(0,index).reduce((sum,r)=>sum+r.height+labelGap,0);
    return side==='top'?-objectGap-preceding-height:imageHeight+objectGap+preceding;
  };
  function freePositions(row,item){
    const intervals=[...row.entries].map(p=>({left:p.box.left-labelGap,right:p.box.right+labelGap})).sort((a,b)=>a.left-b.left);
    const free=[];let x=gutter;
    for(const interval of intervals){if(interval.left>x)free.push([x,interval.left]);x=Math.max(x,interval.right);}
    if(x<width-gutter)free.push([x,width-gutter]);
    const choices=[];
    for(const [a,b] of free.filter(([a,b])=>b-a>=item.frame.width-EPSILON)){
      const ideal=clamp(item.desiredX-item.frame.width/2,a,b-item.frame.width);
      for(const x of [ideal,ideal-item.frame.width*.55,ideal+item.frame.width*.55,a,b-item.frame.width]){
        const left=clamp(x,a,b-item.frame.width);
        if(!choices.some(v=>Math.abs(v-left)<1))choices.push(left);
      }
    }
    return choices;
  }
  for(const it of pending){
    const preferred=routeSide(it);let best=null;
    for(const side of [preferred,preferred==='top'?'bottom':'top']){
      const rows=bands[side];
      for(let ri=0;ri<=rows.length;ri++){
        const row=rows[ri]||{height:it.frame.height,entries:[]};
        const h=Math.max(row.height,it.frame.height),y=rowY(side,rows,ri,h);
        const choices=freePositions(row,it);
        for(const left of choices){
          const r=rect(left,y,it.frame.width,it.frame.height),start=leaderStart(r,it.anchor);
          const existing=[...placed,...bands.top.flatMap(r=>r.entries),...bands.bottom.flatMap(r=>r.entries)];
          const textHits=existing.filter(p=>segmentHitsBox(start,it.anchor,expanded(p.box,2))||segmentHitsBox(leaderStart(p.box,p.anchor),p.anchor,expanded(r,2))).length;
          const distToBand=side==='top'?it.anchor.y:imageHeight-it.anchor.y;
          const score=Math.abs(midpoint(r).x-it.desiredX)+ri*(it.frame.height+labelGap)*1.1+distToBand*.10+(side===preferred?0:fontPx*1.3)+textHits*fontPx*20;
          if(!best||score<best.score)best={side,row:ri,box:r,height:h,score};
        }
      }
    }
    if(!best)throw new Error('标签无法安排在图幅内，请检查文字或输出尺寸');
    const rows=bands[best.side];
    if(!rows[best.row])rows.push({height:it.frame.height,entries:[]});
    rows[best.row].height=Math.max(rows[best.row].height,it.frame.height);
    rows[best.row].entries.push(placement(it,best.box,'band-'+best.side));
  }
  const bandHeight=rows=>rows.length?objectGap+rows.reduce((n,r)=>n+r.height,0)+(rows.length-1)*labelGap+outerGap:0;
  const topPadding=Math.ceil(bandHeight(bands.top)),bottomPadding=Math.ceil(bandHeight(bands.bottom));
  for(const side of ['top','bottom']){
    const rows=bands[side];
    rows.forEach((row,ri)=>{
      const y=rowY(side,rows,ri,row.height);
      for(const p of row.entries){p.box=rect(p.box.left,y+(row.height-p.item.frame.height)/2,p.box.width,p.box.height);placed.push(p);}
    });
  }
  const height=imageHeight+topPadding+bottomPadding;
  for(const p of placed){
    p.box=shifted(p.box,0,topPadding);
    p.anchor={x:p.item.anchor.x,y:p.item.anchor.y+topPadding};
    p.objectBox=shifted(p.item.box,0,topPadding);
    p.leaderStart=leaderStart(p.box,p.anchor);
    p.baseline={x:(p.box.left+p.box.right)/2,y:p.box.top+p.item.frame.padY+p.item.frame.ascent};
  }
  placed.sort((a,b)=>a.item.index-b.item.index);
  const labelOverlapPairs=[],objectOverlapPairs=[],leaderTextIntersections=[];
  for(let i=0;i<placed.length;i++){
    const p=placed[i];
    for(let j=i+1;j<placed.length;j++)if(intersects(p.box,placed[j].box))labelOverlapPairs.push([p.item.sourceId,placed[j].item.sourceId]);
    for(const other of placed){
      if(intersects(p.box,other.objectBox))objectOverlapPairs.push([p.item.sourceId,other.item.sourceId]);
      if(p!==other&&segmentHitsBox(p.leaderStart,p.anchor,other.box))leaderTextIntersections.push([p.item.sourceId,other.item.sourceId]);
    }
  }
  if(labelOverlapPairs.length||objectOverlapPairs.length)throw new Error('自动标签碰撞检查未通过，请使用较宽图幅');
  if(leaderTextIntersections.length)warnings.push('密集布局中有引线经过其他标签区域；所有文字均已保留，可在论文图版中拖动标签精修。');
  return {imageWidth,imageHeight,width,height,fontPx,padding:{left:sidePadding,right:sidePadding,top:topPadding,bottom:bottomPadding},placements:placed,warnings,labelOverlapPairs,objectOverlapPairs,leaderTextIntersections};
}

function loadImage(dataUrl){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('无法读取三维渲染图'));image.src=dataUrl;});}
function scaledPoint(p,s){return {x:p.x*s,y:p.y*s};}
function scaledRect(r,s){return {left:r.left*s,top:r.top*s,right:r.right*s,bottom:r.bottom*s};}

/**
 * Create a publication.js-compatible one-panel composition from captureScene.
 * capture.labels: {id,text,x,y,box:{left,top,right,bottom},anchorX,anchorY}[]
 * The optional leaderStartX/Y annotations are the text-frame boundary nearest
 * the device. Renderers that support them keep bottom/side leaders off glyphs.
 */
export async function createRenderComposition(capture,options={}){
  const o=optionsOf(options),{width:imageWidth,height:imageHeight}=dimensionsOf(capture);
  if(typeof document==='undefined'||typeof Image==='undefined')throw new Error('自动论文图排版需要浏览器 Canvas');
  if(!/^data:image\/(png|jpeg|webp);base64,/i.test(capture?.dataUrl||''))throw new Error('请提供有效的本地 PNG / JPEG / WebP 渲染图');
  await document.fonts?.ready;
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context)throw new Error('当前浏览器不支持 Canvas 字体测量');
  const plan=planRenderLabels(capture,o,(text,fontPx)=>{context.font=canvasFont(o.typography,fontPx);return context.measureText(text);});
  let image=capture.dataUrl,scale=1,width=plan.width,height=plan.height;
  const padding=plan.padding;
  if(padding.left||padding.right||padding.top||padding.bottom){
    const source=await loadImage(capture.dataUrl);
    // Large label sets can add tall bands. Downsample only the embedded image
    // when required by browser memory limits; labels remain physical-size SVG.
    scale=Math.min(1,15000/Math.max(width,height),Math.sqrt(40000000/(width*height)));
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    context.clearRect(0,0,canvas.width,canvas.height);
    context.drawImage(source,padding.left*scale,padding.top*scale,imageWidth*scale,imageHeight*scale);
    image=canvas.toDataURL('image/png');width=canvas.width;height=canvas.height;
  }
  const annotations=plan.placements.map(p=>({
    id:'render_label_'+String(p.item.index+1).padStart(3,'0'),sourceId:p.item.sourceId,
    type:'text',text:p.item.frame.text,x:p.baseline.x/plan.width,y:p.baseline.y/plan.height,
    fontPt:o.fontPt,color:'#1e2c35',align:'middle',halo:false,leader:true,
    anchorX:p.anchor.x/plan.width,anchorY:p.anchor.y/plan.height,
    leaderStartX:p.leaderStart.x/plan.width,leaderStartY:p.leaderStart.y/plan.height
  }));
  const records=plan.placements.map((p,i)=>({
    annotationId:annotations[i].id,sourceId:p.item.sourceId,originalText:p.item.originalText,
    text:p.item.frame.text,wrapped:p.item.frame.wrapped,lineCount:p.item.frame.lineCount,
    approximateObjectBox:p.item.approximate,placement:p.placement,
    boxPx:scaledRect(p.box,scale),objectBoxPx:scaledRect(p.objectBox,scale),
    anchorPx:scaledPoint(p.anchor,scale),leaderStartPx:scaledPoint(p.leaderStart,scale),baselinePx:scaledPoint(p.baseline,scale)
  }));
  return {
    format:'fiber-workbench-publication',version:1,title:o.title,widthMM:o.widthMM,dpi:o.dpi,
    layout:'stack',background:o.background,fontPt:o.fontPt,typography:{...o.typography,fontPt:o.fontPt},panelLetters:false,margin:PAPER_MARGIN,gap:20,
    panels:[{
      id:'render_panel_1',name:o.title,image,width,height,kind:'scene',
      source:capture.source||'当前三维场景渲染；文字与引线自动排版，未生成实验数据',annotations,
      labelLayout:{
        algorithm:'object-aware-labels-v1',coordinateSpace:'embedded-image-pixels',width,height,
        fontPt:o.fontPt,fontPx:plan.fontPx*scale,fontFamily:fontFamily(o.typography),fontWeight:o.typography.bold?700:400,
        originalImage:{width:imageWidth,height:imageHeight},imageBoxPx:{left:padding.left*scale,top:padding.top*scale,right:(padding.left+imageWidth)*scale,bottom:(padding.top+imageHeight)*scale},
        paddingPx:{left:padding.left*scale,right:padding.right*scale,top:padding.top*scale,bottom:padding.bottom*scale},
        rasterScale:scale,records,labelCount:annotations.length,
        labelOverlapPairs:plan.labelOverlapPairs,objectOverlapPairs:plan.objectOverlapPairs,
        leaderTextIntersections:plan.leaderTextIntersections,warnings:plan.warnings
      }
    }]
  };
}
