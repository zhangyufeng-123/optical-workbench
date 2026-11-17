import * as T from '../vendor/package/build/three.module.js';
import {RoundedBoxGeometry} from '../vendor/package/examples/jsm/geometries/RoundedBoxGeometry.js';
import {createFCAdapter,createFCPlug} from './fiber-routing.js';

const UP=new T.Vector3(0,1,0),FRONT=new T.Vector3(0,0,1);
const group=(parent,name)=>{const object=new T.Group();object.name=name;parent?.add(object);return object;};
function material(name,color,role,metalness=0,roughness=.5){
  const result=role==='glass'?new T.MeshPhysicalMaterial({color,metalness,roughness,transmission:.85,thickness:1,ior:1.46}):new T.MeshStandardMaterial({color,metalness,roughness});result.name=name;result.userData.surfaceRole=role;return result;
}
function materials(definition,options){
  const product=definition.product,original=product.bodyColor||definition.color||'#c9ced0';
  const changed=options.color&&options.color.toLowerCase()!==String(definition.color||original).toLowerCase();
  return {
    housing:material('editable_housing',changed?options.color:original,'housing',.35,.5),
    face:material('product_front_panel',product.frontColor||'#c6cbd0','anodized',.4,.48),
    black:material('product_black_anodized','#20262b','anodized',.35,.45),
    metal:material('product_brushed_metal','#bfc7cc','metal',.85,.29),
    darkMetal:material('product_dark_metal','#626d74','metal',.75,.35),
    rubber:material('product_rubber','#15191c','rubber',0,.85),
    recess:material('product_recess','#101619','paint',0,.84),
    glass:material('product_collimator_lens','#a7c6d1','glass',0,.06),
    fiber:material('product_fiber_jacket',product.fiberColor||'#d7a436','paint',0,.48),
    white:material('product_ceramic','#e4e7e7','paint',0,.48),
    gold:material('product_gold_contact','#c8a253','metal',.82,.3)
  };
}
function mesh(parent,name,geometry,finish,position=[0,0,0]){
  const object=new T.Mesh(geometry,finish);object.name=name;object.position.fromArray(position);object.castShadow=true;object.receiveShadow=true;parent.add(object);return object;
}
function box(parent,name,size,position,finish,radius=.7){
  return mesh(parent,name,new RoundedBoxGeometry(...size,3,Math.min(radius,Math.min(...size)*.45)),finish,position);
}
function cylinder(parent,name,radius,length,position,finish,axis=UP,segments=40){
  const object=mesh(parent,name,new T.CylinderGeometry(radius,radius,length,segments),finish,position);object.quaternion.setFromUnitVectors(UP,axis);return object;
}
function ring(parent,name,radius,tube,position,finish,normal=FRONT){
  const object=mesh(parent,name,new T.TorusGeometry(radius,tube,10,64),finish,position);object.quaternion.setFromUnitVectors(FRONT,normal);return object;
}
function threadedTube(parent,name,outerRadius,innerRadius,length,position,normal,finish,pitch=.635){
  const root=group(parent,name);root.position.fromArray(position);root.quaternion.setFromUnitVectors(UP,normal);
  const profile=[[innerRadius,-length/2],[outerRadius,-length/2],[outerRadius,length/2],[innerRadius,length/2],[innerRadius,-length/2]].map(([x,y])=>new T.Vector2(x,y));
  mesh(root,'hollow_tube',new T.LatheGeometry(profile,64),finish);
  const points=[],turns=length/pitch,segments=Math.ceil(turns*16);
  for(let index=0;index<=segments;index++){const t=index/segments,a=t*turns*Math.PI*2;points.push(new T.Vector3((outerRadius+.1)*Math.cos(a),(t-.5)*length,(outerRadius+.1)*Math.sin(a)));}
  mesh(root,'external_thread',new T.TubeGeometry(new T.CatmullRomCurve3(points),segments,.12,5,false),finish);return root;
}
function screw(parent,name,position,normal,finish){
  const root=group(parent,name);root.position.fromArray(position);root.quaternion.setFromUnitVectors(UP,normal);
  cylinder(root,'screw_head',1.9,.9,[0,0,0],finish.metal,UP,24);cylinder(root,'hex_socket',.8,.92,[0,.03,0],finish.recess,UP,6);return root;
}
function label(parent,name,text,size,position,normal,background='#c6cbd0',ink='#263640'){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.max(64,Math.round(1024*size[1]/size[0]));
  const context=canvas.getContext('2d');if(!context)throw new Error('无法绘制产品铭牌');
  context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);context.fillStyle=ink;context.textAlign='center';context.textBaseline='middle';context.font=`600 ${Math.round(canvas.height*.56)}px Arial, sans-serif`;context.fillText(text,canvas.width/2,canvas.height/2,canvas.width*.94);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  const finish=new T.MeshBasicMaterial({map:texture,toneMapped:false});finish.name='product_nameplate';finish.userData.surfaceRole='label';
  const object=mesh(parent,name,new T.PlaneGeometry(...size),finish,position);object.userData.bodyMarking=true;object.quaternion.setFromUnitVectors(FRONT,normal);return object;
}
function tube(parent,name,points,radius,finish,segments=100){
  const curve=new T.CatmullRomCurve3(points.map(point=>point.isVector3?point:new T.Vector3(...point)),false,'centripetal');
  return mesh(parent,name,new T.TubeGeometry(curve,segments,radius,8,false),finish);
}
function knob(parent,name,position,radius,depth,finish){
  const root=group(parent,name);root.position.fromArray(position);
  cylinder(root,'knob_body',radius,depth,[0,0,0],finish.black,FRONT,56);
  cylinder(root,'knob_face',radius*.9,.7,[0,0,depth/2+.2],finish.darkMetal,FRONT,56);
  for(let index=0;index<24;index++){
    const angle=index*Math.PI/12;
    box(root,'knurl_'+index,[.7,2.3,depth*.75],[Math.cos(angle)*radius,Math.sin(angle)*radius,0],finish.rubber,.15).rotation.z=angle;
  }
  box(root,'knob_index',[1,radius*.38,.2],[0,radius*.48,depth/2+.66],finish.white,.05);return root;
}
function addAdapters(root,ports){
  const interfaces=group(root,'optical_interfaces');
  for(const port of ports){
    if(port.gender==='male'||port.pigtailEnd||port.connector==='尾纤熔接')continue;
    const adapter=createFCAdapter(T,port);if(adapter){adapter.name='optical_adapter_'+port.id;adapter.userData.portId=port.id;interfaces.add(adapter);}
  }
}
function terminalPlug(parent,port,product,radius=.45,connectorDimensions){
  const direction=new T.Vector3(...port.dir).normalize(),plug=createFCPlug(T,{connector:port.connector,color:product.fiberColor||'#d7a436',radius,bootColor:product.pigtailBootColor,dimensions:connectorDimensions});
  plug.name='fixed_FC_plug_'+port.id;plug.position.fromArray(port.pos);plug.quaternion.setFromUnitVectors(UP,direction.clone().negate());plug.userData.portId=port.id;parent.add(plug);
  const exitDistance=plug.userData.cableExit?.[1]??35;
  return {direction,tailPoint:new T.Vector3(...port.pos).addScaledVector(direction,-exitDistance)};
}
function addPigtails(root,definition,finish){
  const tails=group(root,'permanent_fiber_pigtails');
  for(const specification of definition.product.pigtails||[]){
    const port=definition.ports.find(entry=>entry.id===specification.portId);if(!port)throw new Error('永久尾纤缺少对应端口 '+specification.portId);
    const {direction,tailPoint:end}=terminalPlug(tails,port,definition.product,specification.radius??.45,specification.connectorDimensions);
    const exit=new T.Vector3(...specification.exit),exitDirection=new T.Vector3(...specification.exitDirection).normalize();
    const points=[exit,exit.clone().addScaledVector(exitDirection,10),...(specification.points||[]).map(point=>new T.Vector3(...point)),end.clone().addScaledVector(direction,-12),end];
    tube(tails,'fixed_pigtail_'+port.id,points,specification.radius??.45,finish.fiber,140);
    cylinder(tails,'pigtail_strain_relief_'+port.id,1.3,7,exit.clone().addScaledVector(exitDirection,1.5).toArray(),finish.rubber,exitDirection,24);
  }
}
function laser(root,definition,finish){
  const product=definition.product,[plateWidth,totalHeight]=product.bodySize,[width,height,depth]=product.chassisSize||[193.9,69.2,135],plateHeight=product.baseThickness??5.4,plateDepth=product.baseDepth??120.7,frontZ=depth/2+1.4;
  const chassis=group(root,'DFB13TK_enclosure');
  box(chassis,'mounting_plate',[plateWidth,plateHeight,plateDepth],[0,plateHeight/2,0],finish.black,2.4);
  box(chassis,'red_extruded_housing',[width,height-1.1,depth-2],[0,plateHeight+(height-1.1)/2,0],finish.housing,3);
  for(const side of [-1,1])for(let index=0;index<13;index++)box(chassis,'side_heat_sink_rib',[1.1,1.2,depth-7],[side*(width/2-.8),plateHeight+6+index*4.2,0],finish.housing,.32);
  box(chassis,'front_panel',[width,height,2.6],[0,plateHeight+height/2,depth/2],finish.black,2.3);
  box(chassis,'rear_panel',[width,height,2.2],[0,plateHeight+height/2,-depth/2],finish.black,2.3);
  for(const x of [-width/2+5.5,width/2-5.5])for(const y of [plateHeight+5.5,totalHeight-5.5])screw(chassis,'panel_fastener',[x,y,frontZ+.2],FRONT,finish);
  for(const x of [-114.3,114.3])for(const z of [-38.1,38.1]){
    cylinder(chassis,'mounting_clearance_recess',3.4,.3,[x,plateHeight+.1,z],finish.recess,UP,32);
    ring(chassis,'mounting_hole_rim',3.7,.3,[x,plateHeight+.15,z],finish.darkMetal,UP);
  }
  const controls=group(root,'front_controls');
  label(controls,'manufacturer_nameplate',product.manufacturer.toUpperCase(),[39,6],[-71,66.5,frontZ+.2],FRONT,'#20262b','#f4f4f1');
  label(controls,'function_nameplate','LOW NOISE DFB LASER',[103,6],[2,66.5,frontZ+.2],FRONT,'#20262b','#f4f4f1');
  label(controls,'model_nameplate',product.model,[34,6],[76,66.5,frontZ+.2],FRONT,'#20262b','#f4f4f1');
  box(controls,'nameplate_rule',[181,.6,.15],[0,61.7,frontZ+.35],finish.white,.05);
  cylinder(controls,'enable_pushbutton',5.4,2.6,[-9.5,42.3,frontZ+1.3],finish.metal,FRONT);
  ring(controls,'enable_button_bezel',5.7,.6,[-9.5,42.3,frontZ+1.1],finish.darkMetal,FRONT);
  label(controls,'enable_label','ENABLE',[19,3],[-9.5,52,frontZ+.2],FRONT,'#20262b','#e5e9e9');
  const modulation=group(controls,'electrical_modulation_inputs');modulation.userData.kind='electrical';
  for(const [index,name] of ['AC CURRENT','DC CURRENT','TEMP'].entries()){
    const x=17+index*19;
    cylinder(modulation,'SMA_hex_base',4.1,2.2,[x,42.3,frontZ+1.1],finish.gold,FRONT,6);
    cylinder(modulation,'SMA_female_threaded_barrel',2.9,5.6,[x,42.3,frontZ+4.2],finish.gold,FRONT,40);
    for(let thread=0;thread<5;thread++)ring(modulation,'SMA_thread',2.96,.14,[x,42.3,frontZ+2.5+thread*.8],finish.gold);
    cylinder(modulation,'SMA_dielectric',1.85,.3,[x,42.3,frontZ+7.1],finish.white,FRONT);
    cylinder(modulation,'SMA_female_contact',.5,.35,[x,42.3,frontZ+7.3],finish.recess,FRONT);
    label(modulation,'SMA_label_'+index,name,[18,3],[x,53,frontZ+.2],FRONT,'#20262b','#dbe3e4');
  }
  for(const [index,name] of ['POWER','EMISSION','FAULT'].entries()){
    cylinder(controls,'status_indicator',1.3,.7,[-66,40-index*6,frontZ+.4],finish.recess,FRONT);
    label(controls,'indicator_label_'+index,name,[22,2.8],[-51,40-index*6,frontZ+.2],FRONT,'#20262b','#e4e8e8');
  }
  label(controls,'optical_output_label','PM FC/APC',[25,4],[-35.3,55,frontZ+.2],FRONT,'#205546','#e8eee7');
  label(controls,'laser_aperture_mark','LASER APERTURE',[45,6],[-10,18,frontZ+.2],FRONT,'#d6bd49','#282b21');
  const rear=group(root,'rear_electrical_connections');
  box(rear,'RS485_DB9_flange',[18,10,2.8],[-63,39,-depth/2-2],finish.metal,1.1);
  box(rear,'RS485_DB9_insert',[13,6.5,.5],[-63,39,-depth/2-3.6],finish.recess,.8);
  for(let index=0;index<9;index++)cylinder(rear,'DB9_electrical_pin',.38,.8,[-68+(index%5)*2.4,37.5+Math.floor(index/5)*2.4,-depth/2-4],finish.gold,new T.Vector3(0,0,-1),12);
  box(rear,'USB_micro_socket',[7,4,2],[-23,35,-depth/2-1.8],finish.metal,.5);box(rear,'USB_micro_recess',[5.4,2.5,.3],[-23,35,-depth/2-3],finish.recess,.2);
  cylinder(rear,'remote_interlock_socket',2.6,2.5,[0,35,-depth/2-1.8],finish.metal,new T.Vector3(0,0,-1));
  box(rear,'power_rocker',[12,8,1.8],[48,39,-depth/2-1.8],finish.recess,.8);
  cylinder(rear,'M8_power_input',4.4,4.5,[75,35,-depth/2-2.2],finish.metal,new T.Vector3(0,0,-1),40);
  addAdapters(root,definition.ports);
}
function polarizer(root,definition,finish){
  const product=definition.product,[length,diameter]=product.capsuleSize||product.bodySize;
  const axisHeight=product.axisHeight??diameter/2,capsule=group(root,'inline_polarizer_capsule');
  cylinder(capsule,'polarizer_cylindrical_package',diameter/2,length,[0,axisHeight,0],finish.housing,new T.Vector3(1,0,0),56);
  for(const sign of [-1,1])cylinder(capsule,'package_endcap',diameter*.46,2,[sign*(length/2-1),axisHeight,0],finish.darkMetal,new T.Vector3(1,0,0));
  if(product.mount){
    const mount=group(root,'illustrative_mount');mount.userData.basis='示意夹持支撑，非产品本体机械尺寸';
    const [w,h,d]=product.mount;
    box(mount,'mount_base',[w,2,d],[0,1,0],finish.black,.5);
    for(const x of [-length*.3,length*.3]){box(mount,'retaining_clip',[5,h-2,d*.5],[x,(h+2)/2,0],finish.black,.6);screw(mount,'clip_fastener',[x,h+.3,d*.18],UP,finish);}
  }
  addPigtails(root,definition,finish);addAdapters(root,definition.ports);
}
function paddle(root,definition,finish){
  const product=definition.product,[width,,depth]=product.bodySize,baseHeight=product.baseHeight??9.5,paddleDiameter=product.paddleDiameter??27,coverDiameter=product.coverDiameter??31.8,axisHeight=product.axisHeight??31.1;
  const base=group(root,'controller_base');box(base,'base_plate',[width,baseHeight,depth],[0,baseHeight/2,0],finish.housing,.9);
  for(const x of [-width/2+6.35,width/2-6.35]){
    box(base,'slotted_mount_recess',[6.4,.25,14],[x,baseHeight+.1,0],finish.recess,2.9);
    for(const z of [-7,7])ring(base,'mounting_slot_end',2.9,.35,[x,baseHeight+.2,z],finish.darkMetal,UP);
  }
  label(base,'manufacturer_nameplate',product.manufacturer.toUpperCase(),[34,4],[-width*.35,4.8,depth/2+.04],FRONT,'#20262b','#e6eaeb');
  label(base,'model_nameplate',product.model,[24,4],[width*.38,4.8,depth/2+.04],FRONT,'#20262b','#e6eaeb');
  for(const x of [-width/2+21,width/2-21]){
    const clamp=group(root,'end_fiber_clamp');
    box(clamp,'clamping_block',[18,28,19.1],[x,baseHeight+14,0],finish.housing,.7);
    box(clamp,'clamping_cap',[18,4,19.1],[x,baseHeight+26.3,0],finish.housing,.5);
    for(const z of [-5,5])screw(clamp,'clamping_cap_screw',[x,baseHeight+28.5,z],UP,finish);
    screw(clamp,'front_clamp_fastener',[x,23,10.2],FRONT,finish);
  }
  const pivots=product.paddlePositions||[57.2-width/2,108-width/2,158.8-width/2],angles=product.paddleAngles||[-16,8,24];
  for(const [index,x] of pivots.entries()){
    const holder=group(root,'paddle_assembly_'+(index+1));holder.position.set(x,axisHeight,0);holder.rotation.x=T.MathUtils.degToRad(angles[index]);
    const radius=paddleDiameter/2,coverRadius=coverDiameter/2,centerY=coverRadius;
    box(holder,'square_paddle_backplate',[36,31.8,3.2],[0,centerY,-1.6],finish.housing,.7);
    cylinder(holder,'circular_paddle_cover',coverRadius,3.2,[0,centerY,1.6],finish.housing,FRONT,72);
    ring(holder,'paddle_fiber_groove',radius+.6,.5,[0,centerY,-3.5],finish.recess);
    const loops=product.paddleLoops?.[index]||[4,3,4][index];
    for(let turn=0;turn<loops;turn++)ring(holder,'loaded_fiber_turn_'+(turn+1),radius,.28,[0,centerY,-3.45-turn*.57],finish.fiber);
    knob(holder,'paddle_cover_thumbscrew',[0,centerY,5],4.2,3.8,finish);
    cylinder(holder,'rotation_pivot',3.1,15,[0,0,0],finish.darkMetal,new T.Vector3(1,0,0));
    box(base,'pivot_support_stem',[14,axisHeight-baseHeight-2,12],[x,(axisHeight+baseHeight)/2-1,0],finish.housing,.8);
    screw(base,'pivot_front_screw',[x,axisHeight-6,6.6],FRONT,finish);
  }
  const internals=group(root,'continuous_controller_fiber');
  for(let index=0;index<2;index++)tube(internals,'inter_paddle_fiber_'+index,[[pivots[index]+3,axisHeight,0],[pivots[index]+12,axisHeight,1],[pivots[index+1]-12,axisHeight,-1],[pivots[index+1]-3,axisHeight,0]],.45,finish.fiber,48);
  tube(internals,'left_clamped_fiber',[[-width/2,axisHeight,0],[pivots[0]-4,axisHeight,0]],.45,finish.fiber,32);
  tube(internals,'right_clamped_fiber',[[pivots[2]+4,axisHeight,0],[width/2,axisHeight,0]],.45,finish.fiber,32);
  addPigtails(root,definition,finish);addAdapters(root,definition.ports);
}
function analyzer(root,definition,finish){
  const product=definition.product,[width,height]=product.bodySize,depth=product.chassisDepth??53,frontZ=depth/2+.5,front=group(root,'PAX1000_front');
  box(root,'red_anodized_housing',[width,height,depth-2],[0,height/2,0],finish.housing,5.7);
  box(front,'black_front_panel',[width,height,2],[0,height/2,depth/2-.5],finish.black,5.5);
  box(root,'rear_panel',[width-1,height-1,1.3],[0,height/2,-depth/2+.1],finish.black,4.8);
  for(const side of [-1,1])for(let row=0;row<13;row++)box(root,'side_cooling_slot',[.2,.65,38],[side*(width/2+.02),11+row*2.5,-.5],finish.recess,.28);
  for(const x of [-15,15])for(const y of [10,40])cylinder(front,'cage_mounting_hole',1.4,.3,[x,y,frontZ+.15],finish.recess,FRONT,24);
  for(const x of [-19.6,19.6])screw(front,'front_case_screw',[x,6,frontZ+.4],FRONT,finish);
  label(root,'manufacturer_top_label',product.manufacturer.toUpperCase(),[34,5],[0,height+.04,-8],UP,'#20262b','#e4e7e8');
  label(root,'model_top_label',product.model,[34,5],[0,height+.04,-2],UP,'#20262b','#e4e7e8');
  for(const port of definition.ports){
    const normal=new T.Vector3(...port.dir).normalize(),assembly=group(front,'SM1M10_KAD12F_F240FC_C_input');assembly.userData.basis='FC/PC 准直器、支架与镜筒组合，轴线按模块输入孔中心布置';
    const tubeLength=product.inputAssembly?.tubeLength??25.4,adapterLength=product.inputAssembly?.adapterLength??19.7,center=new T.Vector3(port.pos[0],port.pos[1],frontZ+2+tubeLength/2);
    threadedTube(assembly,'SM1_external_boss',13.15,6.8,2,[port.pos[0],port.pos[1],frontZ+1],normal,finish.black);
    threadedTube(assembly,'SM1M10_lens_tube',15.25,12.7,tubeLength,center.toArray(),normal,finish.black);
    const holderCenter=new T.Vector3(...port.pos).addScaledVector(normal,-17.3-adapterLength/2+4);
    threadedTube(assembly,'KAD12F_tilt_adapter',15.3,6,adapterLength,holderCenter.toArray(),normal,finish.black);
    ring(assembly,'KAD12F_locking_ring',15.45,.45,holderCenter.clone().addScaledVector(normal,adapterLength/2-.8).toArray(),finish.darkMetal,normal);
    const barrelCenter=new T.Vector3(...port.pos).addScaledVector(normal,-8.65);
    cylinder(assembly,'F240FC_C_collimator_body',5.6,17.3,barrelCenter.toArray(),finish.metal,normal,56);
    ring(assembly,'collimator_focus_lock',5.9,.4,barrelCenter.clone().addScaledVector(normal,-6.5).toArray(),finish.darkMetal,normal);
    cylinder(assembly,'collimator_lens_face',3.4,.35,barrelCenter.clone().addScaledVector(normal,-8.5).toArray(),finish.glass,normal,48);
  }
  const rear=group(root,'rear_electrical_connections');
  box(rear,'USB_housing',[12,8,3],[width*.18,height*.35,-depth/2-1.5],finish.metal,.5);box(rear,'USB_recess',[8,4,.4],[width*.18,height*.35,-depth/2-3.1],finish.recess,.2);
  cylinder(rear,'power_socket',3.5,2.5,[-width*.2,height*.35,-depth/2-1.2],finish.black,new T.Vector3(0,0,-1));
  addAdapters(root,definition.ports);
}
class WoundFiberCurve extends T.Curve{
  constructor(radius,pitch,arcLength,height){super();this.radius=radius;this.pitch=pitch;this.arcLength=arcLength;this.height=height;this.turns=arcLength/Math.hypot(2*Math.PI*radius,pitch);this.axialLength=this.turns*pitch;}
  getPoint(t,target=new T.Vector3()){const angle=t*this.turns*Math.PI*2;return target.set((t-.5)*this.axialLength,this.height+this.radius*Math.sin(angle),this.radius*Math.cos(angle));}
}
function woundFiber(root,definition,finish){
  const product=definition.product,[width,,depth]=product.bodySize,radius=product.coilRadius??10.45,pitch=product.coilPitch??42.2,arcLength=product.coilArcLength??137,axisHeight=product.axisHeight??28;
  const curve=new WoundFiberCurve(radius,pitch,arcLength,axisHeight),support=group(root,'editable_winding_support');support.userData.basis='自制绕纤夹持与芯轴示意，支撑尺寸待实物校准';
  box(support,'support_base',[width,5,depth],[0,2.5,0],finish.housing,1.2);
  const mandrel=cylinder(support,'removable_winding_mandrel',Math.max(1,radius-.65),curve.axialLength+8,[0,axisHeight,0],finish.white,new T.Vector3(1,0,0),72);mandrel.userData.editable=true;
  for(const x of [-curve.axialLength/2-8,curve.axialLength/2+8]){
    box(support,'mandrel_support_post',[9,axisHeight-5,14],[x,(axisHeight+5)/2,0],finish.darkMetal,1);cylinder(support,'mandrel_end_bearing',radius*.75,10,[x,axisHeight,0],finish.black,new T.Vector3(1,0,0));screw(support,'support_fastener',[x,6,depth*.3],UP,finish);
  }
  const fiber=group(root,'visible_wound_fiber');mesh(fiber,'helical_fiber_sample',new T.TubeGeometry(curve,420,product.displayFiberRadius??.4,9,false),finish.fiber);
  const start=curve.getPoint(0),end=curve.getPoint(1),startTangent=curve.getTangent(0),endTangent=curve.getTangent(1);
  const input=definition.ports.find(port=>port.id==='in')||definition.ports[0],output=definition.ports.find(port=>port.id==='out')||definition.ports[1];
  const inputPoint=input?.gender==='male'?terminalPlug(fiber,input,product,product.displayFiberRadius??.4).tailPoint:input&&new T.Vector3(...input.pos),outputPoint=output?.gender==='male'?terminalPlug(fiber,output,product,product.displayFiberRadius??.4).tailPoint:output&&new T.Vector3(...output.pos);
  if(input)tube(fiber,'sample_input_lead',[inputPoint,inputPoint.clone().add(new T.Vector3(15,0,0)),start.clone().addScaledVector(startTangent,-10),start],product.displayFiberRadius??.4,finish.fiber,90);
  if(output)tube(fiber,'sample_output_lead',[end,end.clone().addScaledVector(endTangent,10),outputPoint.clone().add(new T.Vector3(-15,0,0)),outputPoint],product.displayFiberRadius??.4,finish.fiber,90);
  root.userData.windingGeometry={radiusMM:radius,pitchMM:pitch,arcLengthMM:arcLength,turns:curve.turns,axialLengthMM:curve.axialLength,referenceOnly:true,displayFiberRadiusMM:product.displayFiberRadius??.4};
  root.userData.metadata.geometryNotes.push('R、外绕螺距与弧长沿用既有参考几何，未赋予已标定的四分之一波光学性能。','绕制轨迹的显示管径为可视化尺寸，支撑和端部引纤按实验示意布局。');
  addAdapters(root,definition.ports);
}

/** Product-specific illustration geometry in millimetres. Finish is applied by models.js. */
export function buildProductModel(definition,options={}){
  const product=definition?.product;
  if(!product||!Array.isArray(product.bodySize)||product.bodySize.length!==3||!product.bodySize.every(value=>Number.isFinite(value)&&value>0))throw new Error('产品模型缺少有效的毫米外形尺寸');
  const kind=product.kind||definition.id,builders={laser,polarizer,paddle,polarimeter:analyzer,wound_fiber:woundFiber};
  if(!Object.hasOwn(builders,kind))throw new Error('未知产品模型类型 '+kind);
  if(!Array.isArray(definition.ports))throw new Error('产品模型缺少光学端口');
  const root=group(null,definition.name||product.model||'绕制光纤样品');
  root.userData.opticalWorkbenchUnits='mm';root.userData.opticalPorts=structuredClone(definition.ports);
  root.userData.metadata={...structuredClone(product.metadata||{}),manufacturer:product.manufacturer||'',model:product.model||'',kind,bodySizeMM:[...product.bodySize],sources:structuredClone(product.sources||[]),geometryNotes:[...(product.estimatedDetails||[])]};
  if(kind!=='wound_fiber')root.userData.metadata.geometryNotes.push('外形细节按产品照片与给定外形尺寸参数化重建，旋钮、倒角、螺丝与通风孔位置属于外观估计。');
  const finish=materials(definition,options);finish.fiber.userData.connectionColor=true;builders[kind](root,definition,finish);root.updateMatrixWorld(true);
  const routingBounds=new T.Box3();
  for(const child of root.children)if(!['permanent_fiber_pigtails','visible_wound_fiber','continuous_controller_fiber'].includes(child.name))routingBounds.union(new T.Box3().setFromObject(child));
  if(!routingBounds.isEmpty())root.userData.routingBounds={min:routingBounds.min.toArray(),max:routingBounds.max.toArray()};
  return root;
}
