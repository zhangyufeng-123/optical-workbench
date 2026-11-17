// Compute a conservative crop from scene geometry before editable label layout.
// No pixel reads are needed, so opaque and transparent captures share a frame.
export function projectedRenderFraming(T,points,camera,width,height,{shadowReceiver=null,lightDirections=[]}={}){
  const full={enabled:true,method:'projected-geometry',applied:false,left:0,top:0,width,height,sourceWidth:width,sourceHeight:height,geometryPoints:points.length,shadowPoints:0,padding:{x:0,y:0}};
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  const include=point=>{
    const projected=point.clone().project(camera);
    if(![projected.x,projected.y,projected.z].every(Number.isFinite))return false;
    const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    return true;
  };
  for(const point of points){
    const depth=-point.clone().applyMatrix4(camera.matrixWorldInverse).z;
    // A bounding box crossing a clipping plane may still contain visible faces.
    // Preserve the complete framebuffer when those faces cannot be bounded here.
    if(depth<=camera.near||depth>=camera.far||!include(point))return {...full,reason:'camera-clip'};
  }
  if(shadowReceiver){
    for(const lightDirection of lightDirections){
      if(lightDirection.y>=-1e-8)continue;
      for(const point of points){
        const distance=(shadowReceiver.y-point.y)/lightDirection.y;
        if(distance<0)continue;
        const shadow=point.clone().addScaledVector(lightDirection,distance);
        // The finite table itself is already part of the geometry envelope.
        // Clamping also conservatively includes shadows clipped by its edges.
        if(shadowReceiver.bounds){
          shadow.x=T.MathUtils.clamp(shadow.x,shadowReceiver.bounds.min.x,shadowReceiver.bounds.max.x);
          shadow.z=T.MathUtils.clamp(shadow.z,shadowReceiver.bounds.min.z,shadowReceiver.bounds.max.z);
        }
        const depth=-shadow.clone().applyMatrix4(camera.matrixWorldInverse).z;
        if(depth>camera.near&&depth<camera.far&&include(shadow))full.shadowPoints++;
      }
    }
  }
  if(![left,top,right,bottom].every(Number.isFinite))return {...full,reason:'empty-projection'};
  const padding={x:Math.max(8,(right-left)*.025),y:Math.max(8,(bottom-top)*.025)};
  const x=Math.max(0,Math.floor(left-padding.x)),y=Math.max(0,Math.floor(top-padding.y));
  const endX=Math.min(width,Math.ceil(right+padding.x)),endY=Math.min(height,Math.ceil(bottom+padding.y));
  if(endX<=x||endY<=y)return {...full,reason:'outside-frame'};
  const frameWidth=endX-x,frameHeight=endY-y;
  return {...full,applied:x!==0||y!==0||frameWidth!==width||frameHeight!==height,left:x,top:y,width:frameWidth,height:frameHeight,padding};
}

export function frameRenderLabels(labels,framing){
  return labels.map(label=>({...label,
    x:label.x-framing.left,y:label.y-framing.top,
    anchorX:label.anchorX-framing.left,anchorY:label.anchorY-framing.top,
    box:{...label.box,left:label.box.left-framing.left,right:label.box.right-framing.left,top:label.box.top-framing.top,bottom:label.box.bottom-framing.top}
  }));
}
