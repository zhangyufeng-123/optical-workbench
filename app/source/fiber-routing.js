const CONNECTOR_DIMENSIONS={
  couplingRadius:4.6,couplingLength:11,rearRadius:3.25,rearLength:5,
  bootBaseRadius:3.4,bootTipRadius:1.65,bootLength:17,collarLength:2,
  ferruleRadius:1.25,ferruleLength:2.5,adapterRadius:4.05,adapterLength:8,
  threadPitch:1,sleeveLength:12
};
const PC_COLOR='#245ba1',APC_COLOR='#15905e';
const isPigtail=port=>/^(尾纤熔接|pigtail|bare[- ]?fiber)$/i.test(port?.connector||'');
const isFreeSpace=port=>port?.kind==='free-space'||port?.connector==='Free space';
const isFC=connector=>/^FC\/(PC|UPC|SPC|APC)$/i.test(connector||'');

export function supportedFiberConnectorPair(a,b){
  const left=typeof a==='string'?a:a?.connector,right=typeof b==='string'?b:b?.connector;
  return typeof left==='string'&&typeof right==='string'&&(left===right||isFC(left)&&isFC(right));
}

function dimensions(options={}){
  const result={...CONNECTOR_DIMENSIONS,...options.dimensions};
  for(const [key,value] of Object.entries(result))if(!Number.isFinite(value)||value<=0||value>200)throw new Error('连接器尺寸无效 '+key);
  return result;
}

export function fiberExitDistance(port,options={}){
  if(isFreeSpace(port))return 0;
  if(isPigtail(port))return 14;
  const size=dimensions(options),sleeve=port?.gender==='male'?size.sleeveLength:0;
  return sleeve+size.couplingLength+size.rearLength+size.bootLength+size.collarLength;
}

function vector(T,value,name){
  if(!value?.isVector3&&(!Array.isArray(value)||value.length!==3))throw new Error(name+'须为三维有限坐标');
  const result=value?.isVector3?value.clone():new T.Vector3(...(Array.isArray(value)?value:[]));
  if(![result.x,result.y,result.z].every(Number.isFinite))throw new Error(name+'须为三维有限坐标');
  return result;
}

function endpoint(T,value){
  if(!value)return null;
  const pos=vector(T,value.pos,'端口位置'),dir=vector(T,value.dir,'端口方向');
  if(dir.lengthSq()<1e-12)throw new Error('端口方向不可为零向量');
  return {...value,pos,dir:dir.normalize(),p:value.p||value};
}

function addMesh(T,group,geometry,material,y,name){
  const mesh=new T.Mesh(geometry,material);mesh.position.y=y;mesh.name=name;
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}

function metalMaterial(T){
  const material=new T.MeshStandardMaterial({color:'#c4cbd0',metalness:.82,roughness:.28});
  material.userData.surfaceRole='metal';return material;
}

function coloredMaterial(T,color){
  const material=new T.MeshStandardMaterial({color,metalness:.02,roughness:.68});
  material.userData={connectionColor:true,surfaceRole:'rubber'};return material;
}

function thread(T,group,radius,start,length,pitch,material,name){
  const points=[],turns=length/pitch,segments=Math.max(48,Math.ceil(turns*20));
  for(let index=0;index<=segments;index++){
    const fraction=index/segments,angle=fraction*turns*Math.PI*2;
    points.push(new T.Vector3(Math.cos(angle)*radius,start+fraction*length,Math.sin(angle)*radius));
  }
  addMesh(T,group,new T.TubeGeometry(new T.CatmullRomCurve3(points),segments,.14,5,false),material,0,name);
}

function orient(T,group,position,direction){
  group.position.copy(position);group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.clone().normalize());return group;
}

/** Local +Y points from the mating plane towards the cable jacket. */
export function createFCPlug(T,options={}){
  const size=dimensions(options),connector=options.connector||'FC/PC',apc=/APC/i.test(connector),group=new T.Group();
  const metal=metalMaterial(T),boot=coloredMaterial(T,options.bootColor||(apc?APC_COLOR:PC_COLOR)),jacket=coloredMaterial(T,options.collarColor||options.color||'#d28b25');
  const rubber=new T.MeshStandardMaterial({color:'#252b30',roughness:.82,metalness:0});rubber.userData.surfaceRole='rubber';
  const ferrule=new T.MeshStandardMaterial({color:'#e9e7de',roughness:.29,metalness:0});
  const fc=isFC(connector),rectangular=/^(SC|LC)\//i.test(connector);
  if(rectangular){
    const width=/^LC/i.test(connector)?5.3:8.4;
    addMesh(T,group,new T.BoxGeometry(width,size.couplingLength,width*.86),boot,size.couplingLength/2,'connector_keyed_housing');
    const key=addMesh(T,group,new T.BoxGeometry(width*.36,size.couplingLength*.65,1.1),rubber,size.couplingLength*.58,'connector_latch');key.position.z=width*.48;
  }else{
    addMesh(T,group,new T.CylinderGeometry(size.couplingRadius,size.couplingRadius,size.couplingLength,32),metal,size.couplingLength/2,'fc_coupling_nut');
    const knurlGeometry=new T.BoxGeometry(.34,size.couplingLength*.72,.4),knurl=new T.InstancedMesh(knurlGeometry,metal,32),matrix=new T.Matrix4(),rotation=new T.Quaternion();
    for(let index=0;index<32;index++){
      const angle=index*Math.PI/16;rotation.setFromAxisAngle(new T.Vector3(0,1,0),-angle);
      matrix.compose(new T.Vector3(Math.cos(angle)*(size.couplingRadius+.12),size.couplingLength*.52,Math.sin(angle)*(size.couplingRadius+.12)),rotation,new T.Vector3(1,1,1));knurl.setMatrixAt(index,matrix);
    }
    knurl.name='fc_coupling_knurl';knurl.castShadow=true;knurl.receiveShadow=true;knurl.computeBoundingBox();group.add(knurl);
    thread(T,group,size.couplingRadius+.06,.15,Math.min(1.4,size.couplingLength*.18),size.threadPitch,metal,'fc_coupling_thread_lip');
  }
  const ferruleGeometry=new T.CylinderGeometry(size.ferruleRadius,size.ferruleRadius,size.ferruleLength,24);
  if(apc){const positions=ferruleGeometry.attributes.position;for(let index=0;index<positions.count;index++)if(positions.getY(index)<0)positions.setY(index,positions.getY(index)+positions.getX(index)*Math.tan(8*Math.PI/180));ferruleGeometry.computeVertexNormals();}
  addMesh(T,group,ferruleGeometry,ferrule,-size.ferruleLength*.42,apc?'fc_apc_8deg_ferrule':'fc_pc_ferrule');
  addMesh(T,group,new T.CylinderGeometry(size.rearRadius,size.rearRadius,size.rearLength,24),metal,size.couplingLength+size.rearLength/2,'connector_rear_crimp');
  addMesh(T,group,new T.CylinderGeometry(size.rearRadius+.12,size.rearRadius+.12,.8,24),boot,size.couplingLength+.5,'connector_polish_color_ring');
  const bootStart=size.couplingLength+size.rearLength,bootTip=Math.max(size.bootTipRadius,(options.radius||1.15)*1.04);
  addMesh(T,group,new T.CylinderGeometry(bootTip,size.bootBaseRadius,size.bootLength,24),boot,bootStart+size.bootLength/2,'connector_strain_relief_boot');
  for(let index=0;index<6;index++){
    const fraction=.12+index*.12,radius=size.bootBaseRadius+(bootTip-size.bootBaseRadius)*fraction;
    const ring=addMesh(T,group,new T.TorusGeometry(radius+.04,.16,6,32),boot,bootStart+fraction*size.bootLength,'connector_boot_rib');ring.rotation.x=Math.PI/2;
  }
  const exit=bootStart+size.bootLength+size.collarLength;
  addMesh(T,group,new T.CylinderGeometry(options.radius||1.15,bootTip,size.collarLength,20),jacket,exit-size.collarLength/2,'connector_jacket_transition');
  group.name='fiber_connector';group.userData={connector,isCable:true,source:'parametric_connector_visualization',matingPlane:[0,0,0],cableExit:[0,exit,0],polish:apc?'APC':'PC',fc};
  return group;
}

/** The port position is the front mating plane and its direction points outwards. */
export function createFCAdapter(T,port,options={}){
  if(!port||isFreeSpace(port)||isPigtail(port)||port.gender==='male')return null;
  const size=dimensions(options),group=new T.Group(),metal=metalMaterial(T),apc=/APC/i.test(port.connector||'');
  const center=new T.MeshStandardMaterial({color:'#171d21',roughness:.8}),ceramic=new T.MeshStandardMaterial({color:'#e5e5dd',roughness:.34});
  const fc=isFC(port.connector||'FC/PC');
  if(fc){
    addMesh(T,group,new T.CylinderGeometry(size.adapterRadius,size.adapterRadius,size.adapterLength,32),metal,-size.adapterLength/2,'fc_adapter_threaded_barrel');
    thread(T,group,size.adapterRadius+.08,-size.adapterLength+.6,size.adapterLength-1.2,size.threadPitch,metal,'fc_adapter_external_thread');
    addMesh(T,group,new T.CylinderGeometry(size.adapterRadius+1,size.adapterRadius+1,2.2,6),metal,-size.adapterLength-.7,'fc_adapter_panel_nut');
    const key=addMesh(T,group,new T.BoxGeometry(.8,2.8,1.1),metal,-1,'fc_adapter_alignment_key');key.position.z=size.adapterRadius;
  }else addMesh(T,group,new T.BoxGeometry(8.6,size.adapterLength,8),coloredMaterial(T,apc?APC_COLOR:PC_COLOR),-size.adapterLength/2,'keyed_optical_adapter');
  addMesh(T,group,new T.CylinderGeometry(2.3,2.3,.35,32),center,.05,'adapter_socket_opening');
  const ring=addMesh(T,group,new T.RingGeometry(1.32,1.65,24),ceramic,.25,'adapter_ceramic_alignment_sleeve');ring.rotation.x=-Math.PI/2;
  group.name='connector_'+(port.id||'fc');group.userData={connector:port.connector||'FC/PC',gender:'female',matingPlane:[0,0,0],source:'parametric_connector_visualization'};
  const end=endpoint(T,{pos:port.pos,dir:port.dir,p:port});return orient(T,group,end.pos,end.dir);
}

export function createFiberPlug(T,value,edge={},options={}){
  const end=endpoint(T,value);if(!end||edge.kind==='beam'||isFreeSpace(end.p)||isPigtail(end.p))return null;
  const group=new T.Group(),size=dimensions(options),plug=createFCPlug(T,{...options,connector:end.p.connector,color:edge.color,radius:edge.radius});
  if(end.p.gender==='male'){
    const metal=metalMaterial(T),sleeve=addMesh(T,group,new T.CylinderGeometry(size.adapterRadius+1.2,size.adapterRadius+1.2,size.sleeveLength,32),metal,size.sleeveLength/2,'fc_inline_mating_sleeve');
    sleeve.userData.connector='FC mating sleeve';
    for(const y of [1.4,size.sleeveLength-1.4])addMesh(T,group,new T.CylinderGeometry(size.adapterRadius+1.45,size.adapterRadius+1.45,1.4,6),metal,y,'fc_mating_sleeve_grip');
    plug.position.y=size.sleeveLength;
  }
  group.add(plug);group.name='fiber_connector';group.userData={edgeId:edge.id,isCable:true,connector:end.p.connector,gender:end.p.gender||'female',cableExit:[0,fiberExitDistance(end.p,options),0]};
  group.traverse(object=>{object.userData.edgeId=edge.id;object.userData.isCable=true;});
  return orient(T,group,end.pos,end.dir);
}

function segmentHitsBox(a,b,box){
  let near=0,far=1;
  for(const axis of ['x','y','z']){
    const delta=b[axis]-a[axis],min=box.min[axis]+1e-7,max=box.max[axis]-1e-7;
    if(Math.abs(delta)<1e-12){if(a[axis]<=min||a[axis]>=max)return false;continue;}
    let enter=(min-a[axis])/delta,leave=(max-a[axis])/delta;
    if(enter>leave)[enter,leave]=[leave,enter];near=Math.max(near,enter);far=Math.min(far,leave);if(near>far)return false;
  }
  return far>1e-8&&near<1-1e-8;
}

function rayExit(point,direction,box){
  let exit=Infinity;
  for(const axis of ['x','y','z'])if(Math.abs(direction[axis])>1e-10)exit=Math.min(exit,((direction[axis]>0?box.max[axis]:box.min[axis])-point[axis])/direction[axis]);
  return Number.isFinite(exit)?Math.max(0,exit):0;
}

function routeNodes(T,start,end,boxes,floorY){
  const nodes=[start,end];
  for(const {box} of boxes)for(const x of [box.min.x-1,box.max.x+1])for(const z of [box.min.z-1,box.max.z+1])for(const y of [floorY,Math.max(floorY,box.max.y+1)]){
    const node=new T.Vector3(x,y,z);if(!boxes.some(other=>other.box.containsPoint(node)))nodes.push(node);
  }
  const costs=Array(nodes.length).fill(Infinity),previous=Array(nodes.length).fill(-1),done=new Set(),visibility=new Map();costs[0]=0;
  for(let step=0;step<nodes.length;step++){
    let current=-1,best=Infinity;
    for(let index=0;index<nodes.length;index++)if(!done.has(index)&&costs[index]<best){best=costs[index];current=index;}
    if(current<0)break;if(current===1){const route=[];for(let index=1;index>=0;index=previous[index])route.push(nodes[index]);return route.reverse();}
    done.add(current);
    for(let next=0;next<nodes.length;next++){
      if(done.has(next))continue;
      const distance=nodes[current].distanceTo(nodes[next]);if(distance<1e-8||costs[current]+distance>=costs[next])continue;
      const key=Math.min(current,next)+':'+Math.max(current,next);
      if(!visibility.has(key))visibility.set(key,!boxes.some(({box})=>segmentHitsBox(nodes[current],nodes[next],box)));
      if(!visibility.get(key))continue;
      const height=Math.max(0,(nodes[current].y+nodes[next].y)/2-floorY),cost=distance*(1+height*.0007);
      if(costs[current]+cost<costs[next]){costs[next]=costs[current]+cost;previous[next]=current;}
    }
  }
  return null;
}

function avoidBoxes(T,start,end,boxes,floorY){
  const blockers=new Set(boxes.filter(({box})=>segmentHitsBox(start,end,box)));
  if(!blockers.size)return [start,end];
  for(let pass=0;pass<=boxes.length;pass++){
    const route=routeNodes(T,start,end,[...blockers],floorY);if(!route)return [start,end];
    const extra=boxes.filter(record=>!blockers.has(record)&&route.slice(1).some((point,index)=>segmentHitsBox(route[index],point,record.box)));
    if(!extra.length)return route;for(const record of extra)blockers.add(record);
  }
  return [start,end];
}

function safeFloorPoint(point,direction,boxes){
  for(let pass=0;pass<=boxes.length;pass++){
    const containing=boxes.filter(({box})=>box.containsPoint(point));if(!containing.length)break;
    point.addScaledVector(direction,Math.max(...containing.map(({box})=>rayExit(point,direction,box)))+2);
  }
  return point;
}

function cubicHitsBoxes(T,points,boxes){
  const stack=[{points,depth:0}];
  while(stack.length){
    const current=stack.pop(),hull=new T.Box3().setFromPoints(current.points);
    if(!boxes.some(({box})=>box.intersectsBox(hull)))continue;
    if(current.depth>=9)return true;
    const [a,b,c,d]=current.points,ab=a.clone().lerp(b,.5),bc=b.clone().lerp(c,.5),cd=c.clone().lerp(d,.5),abc=ab.clone().lerp(bc,.5),bcd=bc.clone().lerp(cd,.5),mid=abc.clone().lerp(bcd,.5);
    stack.push({points:[a,ab,abc,mid],depth:current.depth+1},{points:[mid,bcd,cd,d],depth:current.depth+1});
  }
  return false;
}

function smoothRoute(T,points,startDirection,endDirection,boxes,floorY){
  const unique=points.filter((point,index)=>index===0||point.distanceToSquared(points[index-1])>1e-10),tangents=[];
  for(let index=0;index<unique.length;index++){
    const tangent=index===0?startDirection.clone():index===unique.length-1?endDirection.clone():unique[index+1].clone().sub(unique[index-1]);
    if(index>0&&index<unique.length-1&&unique[index].y<=floorY+1e-7)tangent.y=0;
    if(tangent.lengthSq()<1e-12)tangent.copy(unique[Math.min(index+1,unique.length-1)]).sub(unique[Math.max(0,index-1)]);
    tangents.push(tangent.normalize());
  }
  const curves=[];
  for(let index=0;index<unique.length-1;index++){
    const a=unique[index],b=unique[index+1],distance=a.distanceTo(b),previous=index?unique[index-1].distanceTo(a):distance,next=index+2<unique.length?b.distanceTo(unique[index+2]):distance;
    let leadA=Math.min(distance,previous)*.26,leadB=Math.min(distance,next)*.26;
    if(tangents[index].y<0&&a.y>=floorY)leadA=Math.min(leadA,(a.y-floorY)/-tangents[index].y);
    if(tangents[index+1].y>0&&b.y>=floorY)leadB=Math.min(leadB,(b.y-floorY)/tangents[index+1].y);
    let controls;
    for(let attempt=0;attempt<10;attempt++){
      controls=[a,a.clone().addScaledVector(tangents[index],leadA),b.clone().addScaledVector(tangents[index+1],-leadB),b];
      if(!cubicHitsBoxes(T,controls,boxes))break;leadA*=.5;leadB*=.5;
    }
    if(cubicHitsBoxes(T,controls,boxes))curves.push(new T.LineCurve3(a,b));else curves.push(new T.CubicBezierCurve3(...controls));
  }
  return curves;
}

/** Geometric tabletop layout in millimetres. No optical propagation or bend-rating model. */
export function createFiberCurve(T,edge,first,second,options={}){
  const a=endpoint(T,first),b=endpoint(T,second);if(!a||!b)return null;
  if(edge.kind==='beam')return new T.LineCurve3(a.pos,b.pos);
  const radius=Number.isFinite(edge.radius)&&edge.radius>0?edge.radius:1.15,tableY=Number.isFinite(options.tableY)?options.tableY:0;
  const clearance=Number.isFinite(options.clearance)?Math.max(0,options.clearance):Math.max(3,radius*2),floorY=tableY+radius+1+Math.max(0,Number.isFinite(edge.lift)?edge.lift:0);
  const boxes=(options.obstacles||[]).filter(record=>record?.box?.isBox3&&!record.box.isEmpty()).map(record=>({id:record.id,box:record.box.clone().expandByScalar(radius+clearance)}));
  const exitA=fiberExitDistance(a.p,options),exitB=fiberExitDistance(b.p,options),straight=Number.isFinite(options.straightLead)?Math.max(0,options.straightLead):12;
  const escape=end=>Math.max(...boxes.filter(({box,id})=>id===end.it?.id||box.containsPoint(end.pos)).map(({box})=>box.containsPoint(end.pos)?rayExit(end.pos,end.dir,box)+2:0),0);
  const leadA=a.pos.clone().addScaledVector(a.dir,Math.max(exitA+straight,escape(a))),leadB=b.pos.clone().addScaledVector(b.dir,Math.max(exitB+straight,escape(b)));
  const manual=Array.isArray(edge.waypoints)&&edge.waypoints.length>0;
  let guides;
  if(manual)guides=[leadA,...edge.waypoints.map(point=>vector(T,[point.x,point.y,point.z],'布线控制点')),leadB];
  else{
    const delta=leadB.clone().sub(leadA);delta.y=0;const length=delta.length();
    if(length<1){delta.copy(a.dir);delta.y=0;if(delta.lengthSq()<1e-10)delta.set(1,0,0);}delta.normalize();
    const side=edge.side===-1?-1:1,normal=new T.Vector3(-delta.z,0,delta.x).multiplyScalar(side);
    const slack=Number.isFinite(edge.slack)?edge.slack:Number.isFinite(edge.bend)?edge.bend:75;
    guides=[leadA];
    for(const [index,fraction] of [.32,.68].entries()){
      const point=leadA.clone().lerp(leadB,fraction);point.y=floorY;point.addScaledVector(normal,slack*Math.sin(Math.PI*fraction));
      if(length<35)point.addScaledVector(delta,index===0?35:-35);
      guides.push(safeFloorPoint(point,normal,boxes));
    }
    guides.push(leadB);
  }
  const routed=[guides[0]];
  for(let index=1;index<guides.length;index++)routed.push(...avoidBoxes(T,guides[index-1],guides[index],boxes,floorY).slice(1));
  const curve=new T.CurvePath();curve.add(new T.LineCurve3(a.pos,leadA));
  for(const segment of smoothRoute(T,routed,a.dir,b.dir.clone().negate(),boxes,floorY))curve.add(segment);
  curve.add(new T.LineCurve3(leadB,b.pos));
  const conflicts=new Set();
  for(const segment of curve.curves)for(const {id,box} of boxes){
    const hostAtStart=id===a.it?.id&&segment===curve.curves[0],hostAtEnd=id===b.it?.id&&segment===curve.curves.at(-1);
    if(hostAtStart||hostAtEnd)continue;
    const points=segment.getPoints(32);if(points.slice(1).some((point,index)=>segmentHitsBox(points[index],point,box)))conflicts.add(id??'obstacle');
  }
  curve.userData={routing:{kind:'geometric_tabletop_layout',manual,tableY,restingHeight:floorY,exitDistances:[exitA,exitB],guides:routed.map(point=>point.toArray()),unresolvedObstacles:[...conflicts]}};
  return curve;
}
