// Straight, editable illustration geometry. This is not a ray-tracing solver.
import {normalizeSurfaceQuality} from './surface-quality.js';
export function buildBeam(T, edge, curve, quality) {
  const group = new T.Group();
  group.name = 'laser_' + edge.id;
  group.userData = {isBeam: true, edgeId: edge.id};
  const settings = normalizeSurfaceQuality(quality);
  const radius = edge.radius ?? 1.8;
  const glow = edge.glow ?? .65;
  if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(glow)||glow<0||glow>1)throw new Error('光束半径或光晕无效');
  const color = edge.color || '#ed283c';
  const softness = settings.beamSoftness;
  const haloScales = settings.preset==='technical' ? [1.5+softness*.6,2.2+softness*1.4] : [1.22+softness*.16,1.5+softness*.35,1.9+softness*.6,2.4+softness*.9,3+softness*1.3];
  const haloWeights = settings.preset==='technical' ? [.15,.055] : [.16,.105,.064,.035,.016];
  const layers = [[1, 1], ...haloScales.map((scale,index)=>[scale,glow*haloWeights[index]])];
  for (const [index,[scale, opacity]] of layers.entries()) {
    if (!opacity) continue;
    const material = new T.MeshBasicMaterial({color, transparent: scale > 1, opacity, depthWrite: scale === 1, depthTest:true, toneMapped: false, blending:scale===1?T.NormalBlending:T.AdditiveBlending});
    material.userData = {isBeam:true,shared:false,surfaceQuality:{...settings},beamLayer:index};
    const mesh = new T.Mesh(new T.TubeGeometry(curve, 1, radius * scale, settings.preset==='technical'?12:20, false), material);
    mesh.name = scale === 1 ? 'laser_core' : 'laser_halo';
    mesh.userData = {isBeam: true, edgeId: edge.id};
    mesh.renderOrder = scale === 1 ? 1 : 2+index;
    group.add(mesh);
  }
  return group;
}
