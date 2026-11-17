import {fiberExitDistance} from './fiber-routing.js';

const EPSILON=1e-6;
const round=value=>Math.round(value*1e6)/1e6;
const clamp=(value,minimum,maximum)=>Math.max(minimum,Math.min(maximum,value));

function copyScene(scene){
  const {assets,...rest}=scene;
  return {...structuredClone(rest),...(assets?{assets:{...assets}}:{})};
}

function emptyRect(){return {left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};}
function includePoint(rect,x,z){rect.left=Math.min(rect.left,x);rect.right=Math.max(rect.right,x);rect.top=Math.min(rect.top,z);rect.bottom=Math.max(rect.bottom,z);}
function includeRect(rect,other){includePoint(rect,other.left,other.top);includePoint(rect,other.right,other.bottom);}
function width(rect){return rect.right-rect.left;}
function depth(rect){return rect.bottom-rect.top;}
function intersects(a,b){return a.left<b.right-EPSILON&&a.right>b.left+EPSILON&&a.top<b.bottom-EPSILON&&a.bottom>b.top+EPSILON;}
function contains(a,b){return a.left<=b.left+EPSILON&&a.right>=b.right-EPSILON&&a.top<=b.top+EPSILON&&a.bottom>=b.bottom-EPSILON;}
function padded(rect,padding){return {left:rect.left-padding,top:rect.top-padding,right:rect.right+padding,bottom:rect.bottom+padding};}

function worldPoint(item,point){
  const angle=(item.rotation||0)*Math.PI/180,cosine=Math.cos(angle),sine=Math.sin(angle),scale=item.scale||1;
  return [item.x+scale*(point[0]*cosine+point[2]*sine),item.z+scale*(point[2]*cosine-point[0]*sine)];
}

function itemRect(item,definition,bounds){
  const rect=emptyRect(),supplied=bounds?.get?.(item.id)||bounds?.[item.id];
  if(supplied&&[supplied.min,supplied.max].every(values=>Array.isArray(values)&&values.length===3&&values.every(Number.isFinite))){
    includePoint(rect,supplied.min[0],supplied.min[2]);includePoint(rect,supplied.max[0],supplied.max[2]);
  }else{
    const size=definition.size;
    if(!Array.isArray(size)||size.length!==3||!size.every(value=>Number.isFinite(value)&&value>0))throw new Error('器件尺寸无效：'+item.label);
    for(const x of [-size[0]/2,size[0]/2])for(const z of [-size[2]/2,size[2]/2])includePoint(rect,...worldPoint(item,[x,0,z]));
    if(item.support)for(const x of [-item.support.baseWidth/2,item.support.baseWidth/2])for(const z of [-item.support.baseWidth/2,item.support.baseWidth/2])includePoint(rect,...worldPoint(item,[x,0,z]));
  }
  // Reserve each connector and its straight cable exit in addition to the body.
  for(const port of item.ports||definition.ports||[]){
    if(!Array.isArray(port.pos)||!Array.isArray(port.dir))continue;
    const length=Math.hypot(...port.dir),exit=port.kind==='free-space'?0:fiberExitDistance(port)+12;
    if(!length)continue;
    const end=port.pos.map((value,index)=>value+port.dir[index]/length*exit);
    includePoint(rect,...worldPoint(item,port.pos));includePoint(rect,...worldPoint(item,end));
  }
  if(!Object.values(rect).every(Number.isFinite))throw new Error('器件包围尺寸无效：'+item.label);
  return rect;
}

function createUnits(scene,definition,bounds){
  const indices=new Map(scene.items.map((item,index)=>[item.id,index])),parents=scene.items.map((_,index)=>index);
  const root=index=>{while(parents[index]!==index){parents[index]=parents[parents[index]];index=parents[index];}return index;};
  const join=(a,b)=>{const left=root(a),right=root(b);parents[Math.max(left,right)]=Math.min(left,right);};
  const assemblies=new Map();
  for(const [index,item] of scene.items.entries())if(item.assemblyId){
    if(assemblies.has(item.assemblyId))join(index,assemblies.get(item.assemblyId));else assemblies.set(item.assemblyId,index);
  }
  for(const edge of scene.connections)if(edge.kind==='beam'&&indices.has(edge.a.item)&&indices.has(edge.b.item))join(indices.get(edge.a.item),indices.get(edge.b.item));
  const groups=new Map();
  for(const [index,item] of scene.items.entries()){
    const key=root(index);
    if(!groups.has(key))groups.set(key,{id:item.id,index,items:[],rect:emptyRect(),fixed:false,hidden:true});
    const unit=groups.get(key),device=definition(item.type);
    if(!device)throw new Error('找不到器件定义：'+item.type);
    unit.items.push(item);unit.fixed||=!!item.locked||!!item.hidden;unit.hidden&&=!!item.hidden;
    includeRect(unit.rect,itemRect(item,device,bounds));
  }
  const units=[...groups.values()],byItem=new Map();
  for(const unit of units){
    // Quantize local extents to keep a repeated layout stable after a WebGL rebuild.
    const anchor=unit.items[0];
    for(const key of ['left','right'])unit.rect[key]=anchor.x+round(unit.rect[key]-anchor.x);
    for(const key of ['top','bottom'])unit.rect[key]=anchor.z+round(unit.rect[key]-anchor.z);
    unit.width=width(unit.rect);unit.depth=depth(unit.rect);
    for(const item of unit.items)byItem.set(item.id,unit);
  }
  return {units,byItem};
}

function buildGraph(scene,units,byItem,definition){
  const visible=units.filter(unit=>!unit.hidden),outgoing=new Map(visible.map(unit=>[unit.id,new Set()])),incoming=new Map(visible.map(unit=>[unit.id,new Set()]));
  const items=new Map(scene.items.map(item=>[item.id,item]));
  const port=end=>{const item=items.get(end.item);return (item.ports||definition(item.type).ports).find(value=>value.id===end.port);};
  for(const edge of scene.connections){
    let from=byItem.get(edge.a.item),to=byItem.get(edge.b.item);
    if(!from||!to||from===to||from.hidden||to.hidden)continue;
    const a=port(edge.a),b=port(edge.b);
    if(a?.role==='in'&&b?.role!=='in'||b?.role==='out'&&a?.role!=='out')[from,to]=[to,from];
    outgoing.get(from.id).add(to.id);incoming.get(to.id).add(from.id);
  }
  const byId=new Map(visible.map(unit=>[unit.id,unit])),components=[],visited=new Set();
  for(const unit of visible){
    if(visited.has(unit.id))continue;
    const component=[],queue=[unit.id];visited.add(unit.id);
    for(let index=0;index<queue.length;index++){
      const id=queue[index];component.push(byId.get(id));
      for(const next of [...outgoing.get(id),...incoming.get(id)])if(!visited.has(next)){visited.add(next);queue.push(next);}
    }
    components.push(component.sort((a,b)=>a.index-b.index));
  }
  return {components,outgoing,incoming,byId};
}

function orderedLayers(component,graph){
  const members=new Set(component.map(unit=>unit.id)),indices=new Map(),low=new Map(),stack=[],stacked=new Set(),cycles=[];
  let serial=0;
  function visit(id){
    indices.set(id,serial);low.set(id,serial++);stack.push(id);stacked.add(id);
    for(const next of graph.outgoing.get(id))if(members.has(next)){
      if(!indices.has(next)){visit(next);low.set(id,Math.min(low.get(id),low.get(next)));}
      else if(stacked.has(next))low.set(id,Math.min(low.get(id),indices.get(next)));
    }
    if(low.get(id)!==indices.get(id))return;
    const cycle=[];let next;
    do{next=stack.pop();stacked.delete(next);cycle.push(graph.byId.get(next));}while(next!==id);
    cycle.sort((a,b)=>a.index-b.index);cycles.push(cycle);
  }
  for(const unit of component)if(!indices.has(unit.id))visit(unit.id);
  cycles.sort((a,b)=>a[0].index-b[0].index);
  const cycleOf=new Map(),edges=cycles.map(()=>new Set()),indegree=cycles.map(()=>0),ranks=cycles.map(()=>0);
  cycles.forEach((cycle,index)=>cycle.forEach(unit=>cycleOf.set(unit.id,index)));
  for(const unit of component)for(const next of graph.outgoing.get(unit.id)){
    const from=cycleOf.get(unit.id),to=cycleOf.get(next);
    if(from===to||edges[from].has(to))continue;
    edges[from].add(to);indegree[to]++;
  }
  const queue=cycles.map((_,index)=>index).filter(index=>!indegree[index]);
  for(let index=0;index<queue.length;index++){
    const current=queue[index];
    for(const next of edges[current]){
      ranks[next]=Math.max(ranks[next],ranks[current]+cycles[current].length);
      if(--indegree[next]===0)queue.push(next);
    }
  }
  const layers=[];
  cycles.forEach((cycle,index)=>cycle.forEach((unit,offset)=>{const rank=ranks[index]+offset;(layers[rank]??=[]).push(unit);}));
  const ordered=layers.filter(Boolean),positions=new Map();
  ordered.forEach(layer=>layer.sort((a,b)=>a.index-b.index).forEach((unit,index)=>positions.set(unit.id,index)));
  // Barycentres reduce crossings between neighbouring branch layers.
  for(let pass=0;pass<4;pass++){
    const sweep=pass%2?[...ordered].reverse():ordered,neighbors=pass%2?graph.outgoing:graph.incoming;
    for(const layer of sweep){
      const score=unit=>{const related=[...neighbors.get(unit.id)].filter(id=>positions.has(id));return related.length?related.reduce((sum,id)=>sum+positions.get(id),0)/related.length:positions.get(unit.id);};
      const scores=new Map(layer.map(unit=>[unit.id,score(unit)]));
      layer.sort((a,b)=>scores.get(a.id)-scores.get(b.id)||a.index-b.index);
      layer.forEach((unit,index)=>positions.set(unit.id,index));
    }
  }
  return ordered;
}

function componentTargets(layers,availableWidth,availableDepth,gap){
  const columns=[];
  for(const layer of layers){
    let column={units:[],width:0,depth:0};
    for(const unit of layer){
      if(column.units.length&&column.depth+gap+unit.depth>availableDepth+EPSILON){columns.push(column);column={units:[],width:0,depth:0};}
      if(column.units.length)column.depth+=gap;
      column.units.push(unit);column.width=Math.max(column.width,unit.width);column.depth+=unit.depth;
    }
    if(column.units.length)columns.push(column);
  }
  const rows=[];let row={columns:[],width:0,depth:0};
  for(const column of columns){
    if(row.columns.length&&row.width+gap+column.width>availableWidth+EPSILON){rows.push(row);row={columns:[],width:0,depth:0};}
    if(row.columns.length)row.width+=gap;
    row.columns.push(column);row.width+=column.width;row.depth=Math.max(row.depth,column.depth);
  }
  if(row.columns.length)rows.push(row);
  const targets=new Map();let top=0,totalWidth=0;
  for(const [rowIndex,current] of rows.entries()){
    let left=0;
    for(const column of current.columns){
      let z=top+(current.depth-column.depth)/2;
      for(const unit of column.units){
        const x=rowIndex%2?current.width-left-column.width:left;
        targets.set(unit.id,{x:x+column.width/2,z:z+unit.depth/2});z+=unit.depth+gap;
      }
      left+=column.width+gap;
    }
    totalWidth=Math.max(totalWidth,current.width);top+=current.depth+gap;
  }
  return {targets,width:totalWidth,depth:Math.max(0,top-gap),rows:rows.length};
}

function preferredTargets(graph,board,gap,margin){
  const availableWidth=board.width-2*margin,availableDepth=board.depth-2*margin,targets=new Map(),order=[];
  let left=0,top=0,rowDepth=0,totalWidth=0,totalDepth=0,wrappedRows=0;
  for(const component of graph.components){
    const layers=orderedLayers(component,graph),block=componentTargets(layers,availableWidth,availableDepth,gap);
    if(left&&left+block.width>availableWidth+EPSILON){left=0;top+=rowDepth+gap;rowDepth=0;}
    for(const [id,point] of block.targets)targets.set(id,{x:point.x+left,z:point.z+top});
    for(const layer of layers)order.push(...layer);
    totalWidth=Math.max(totalWidth,left+block.width);totalDepth=Math.max(totalDepth,top+block.depth);
    left+=block.width+gap;rowDepth=Math.max(rowDepth,block.depth);wrappedRows+=Math.max(0,block.rows-1);
  }
  const scaleX=Math.min(1,availableWidth/Math.max(totalWidth,1)),scaleZ=Math.min(1,availableDepth/Math.max(totalDepth,1));
  for(const [id,point] of targets)targets.set(id,{x:(point.x-totalWidth/2)*scaleX,z:(point.z-totalDepth/2)*scaleZ});
  return {targets,order,wrappedRows};
}

function subtractSpace(free,occupied){
  const split=[];
  for(const rect of free){
    if(!intersects(rect,occupied)){split.push(rect);continue;}
    if(occupied.left>rect.left+EPSILON)split.push({...rect,right:occupied.left});
    if(occupied.right<rect.right-EPSILON)split.push({...rect,left:occupied.right});
    if(occupied.top>rect.top+EPSILON)split.push({...rect,bottom:occupied.top});
    if(occupied.bottom<rect.bottom-EPSILON)split.push({...rect,top:occupied.bottom});
  }
  return split.filter((rect,index)=>width(rect)>EPSILON&&depth(rect)>EPSILON&&!split.some((other,otherIndex)=>otherIndex!==index&&contains(other,rect)&&(otherIndex<index||!contains(rect,other))));
}

function packUnits(units,preferred,board,gap,margin,order){
  const padding=gap/2,limit={left:-board.width/2+margin-padding,right:board.width/2-margin+padding,top:-board.depth/2+margin-padding,bottom:board.depth/2-margin+padding};
  let free=[limit];const placements=new Map();
  for(const unit of units.filter(unit=>unit.fixed&&!unit.hidden)){
    if(unit.rect.left<-board.width/2-EPSILON||unit.rect.right>board.width/2+EPSILON||unit.rect.top<-board.depth/2-EPSILON||unit.rect.bottom>board.depth/2+EPSILON)return null;
    free=subtractSpace(free,padded(unit.rect,padding));
  }
  for(const unit of order.filter(unit=>!unit.fixed&&!unit.hidden)){
    const point=preferred.get(unit.id),w=unit.width+gap,d=unit.depth+gap,targetLeft=point.x-w/2,targetTop=point.z-d/2;
    let best=null;
    for(const rect of free){
      if(width(rect)+EPSILON<w||depth(rect)+EPSILON<d)continue;
      const left=clamp(targetLeft,rect.left,rect.right-w),top=clamp(targetTop,rect.top,rect.bottom-d);
      const distance=(left-targetLeft)**2+(top-targetTop)**2;
      const score=distance+(width(rect)*depth(rect)-w*d)*1e-7;
      if(!best||score<best.score-EPSILON||Math.abs(score-best.score)<EPSILON&&(top<best.top-EPSILON||Math.abs(top-best.top)<EPSILON&&left<best.left))best={left,top,right:left+w,bottom:top+d,score};
    }
    if(!best)return null;
    placements.set(unit.id,{left:best.left+padding,top:best.top+padding,right:best.right-padding,bottom:best.bottom-padding});
    free=subtractSpace(free,best);
  }
  return placements;
}

function attemptLayout(units,graph,board,gap,margin){
  const preferred=preferredTargets(graph,board,gap,margin),movable=preferred.order.filter(unit=>!unit.fixed&&!unit.hidden);
  const orders=[preferred.order,[...movable].sort((a,b)=>Math.max(b.width,b.depth)-Math.max(a.width,a.depth)||a.index-b.index),[...movable].sort((a,b)=>b.width*b.depth-a.width*a.depth||a.index-b.index)];
  for(const order of orders){const placements=packUnits(units,preferred.targets,board,gap,margin,order);if(placements)return {placements,wrappedRows:preferred.wrappedRows};}
  return null;
}

/** Plan the complete layout without mutating scene, its assets, or runtime meshes. */
export function planAutoLayout(scene,options={},context={}){
  if(!Array.isArray(scene?.items)||!Array.isArray(scene?.connections)||!scene.board)throw new Error('工程缺少器件、连接或台面');
  if(scene.items.length>250||scene.connections.length>600)throw new Error('排版最多支持 250 个器件和 600 条连接');
  if(![scene.board.width,scene.board.depth].every(value=>Number.isFinite(value)&&value>=300&&value<=10000))throw new Error('台面尺寸须在 300 至 10000 mm 之间');
  const gap=options.gap??90,margin=options.margin??50;
  if(!Number.isFinite(gap)||gap<20||gap>500||!Number.isFinite(margin)||margin<0||margin>500)throw new Error('器件间距或台面边距无效');
  const custom=new Map((scene.custom||[]).map(device=>[device.id,device]));
  const definition=type=>context.definition?.(type)||custom.get(type);
  const {units,byItem}=createUnits(scene,definition,context.bounds),movable=units.filter(unit=>!unit.fixed&&!unit.hidden),next=copyScene(scene);
  const summary={movedItems:0,movableUnits:movable.length,fixedUnits:units.filter(unit=>unit.fixed&&!unit.hidden).length,rigidUnits:units.filter(unit=>unit.items.length>1).length,hiddenItems:scene.items.filter(item=>item.hidden).length,reroutedConnections:0,translatedRoutes:0,boardChanged:false,board:{...scene.board},wrappedRows:0,changed:false,notes:[]};
  if(!movable.length){summary.notes.push(scene.items.length?'全部器件已固定，当前布局已保留。':'添加器件并连接后可一键排版。');return {scene:next,summary};}
  const graph=buildGraph(scene,units,byItem,definition),board={...scene.board};
  let result=attemptLayout(units,graph,board,gap,margin);
  if(!result&&options.expandBoard===true){
    const visible=units.filter(unit=>!unit.hidden);
    const requiredWidth=Math.max(...visible.map(unit=>unit.fixed?2*Math.max(Math.abs(unit.rect.left),Math.abs(unit.rect.right))+2*margin:unit.width+2*margin));
    const requiredDepth=Math.max(...visible.map(unit=>unit.fixed?2*Math.max(Math.abs(unit.rect.top),Math.abs(unit.rect.bottom))+2*margin:unit.depth+2*margin));
    board.width=Math.max(board.width,Math.ceil(requiredWidth/25)*25);board.depth=Math.max(board.depth,Math.ceil(requiredDepth/25)*25);
    if(board.width<=10000&&board.depth<=10000)result=attemptLayout(units,graph,board,gap,margin);
    while(!result&&(board.width<10000||board.depth<10000)){
      board.width=Math.min(10000,Math.ceil(board.width*1.2/25)*25);board.depth=Math.min(10000,Math.ceil(board.depth*1.2/25)*25);
      result=attemptLayout(units,graph,board,gap,margin);
    }
  }
  if(!result)throw new Error(options.expandBoard?'器件与固定组合超出最大 10000 × 10000 mm 台面，请缩小器件或调整固定组合。':'当前台面放不下全部器件和接头间距，请增大台面或启用“按需扩展台面”。');
  const translations=new Map();
  for(const unit of units){
    const target=result.placements.get(unit.id),dx=target?round(target.left-unit.rect.left):0,dz=target?round(target.top-unit.rect.top):0;
    translations.set(unit.id,{dx,dz});
  }
  for(const item of next.items){
    const {dx,dz}=translations.get(byItem.get(item.id).id);
    if(Math.abs(dx)<EPSILON&&Math.abs(dz)<EPSILON)continue;
    item.x=round(item.x+dx);item.z=round(item.z+dz);summary.movedItems++;
    if(Math.abs(item.x)>10000||Math.abs(item.z)>10000)throw new Error('排版后器件坐标超出可编辑范围');
  }
  for(const edge of next.connections){
    const a=byItem.get(edge.a.item),b=byItem.get(edge.b.item);
    if(!a||!b)continue;
    const deltaA=translations.get(a.id),deltaB=translations.get(b.id);
    const movedA=Math.abs(deltaA.dx)>EPSILON||Math.abs(deltaA.dz)>EPSILON,movedB=Math.abs(deltaB.dx)>EPSILON||Math.abs(deltaB.dz)>EPSILON;
    if(!movedA&&!movedB)continue;
    if(a===b){
      if(edge.waypoints?.length){edge.waypoints=edge.waypoints.map(point=>({...point,x:round(point.x+deltaA.dx),z:round(point.z+deltaA.dz)}));summary.translatedRoutes++;}
    }else if(edge.kind!=='beam'){
      if(edge.waypoints)delete edge.waypoints;
      summary.reroutedConnections++;
    }
  }
  summary.boardChanged=board.width!==scene.board.width||board.depth!==scene.board.depth;
  summary.board={...board};summary.wrappedRows=result.wrappedRows;summary.changed=summary.movedItems>0||summary.boardChanged;
  next.board={...board};
  if(summary.fixedUnits)summary.notes.push(`${summary.fixedUnits} 个固定单元保持原位。`);
  if(summary.rigidUnits)summary.notes.push('组合与空间光链整体平移。');
  if(summary.wrappedRows)summary.notes.push('长链已按台面宽度分行排列。');
  return {scene:next,summary};
}
