export function expandAssemblies(scene, ids) {
  const selected = new Set(ids), groups = new Set(scene.items.filter(item => selected.has(item.id)).map(item => item.assemblyId).filter(Boolean));
  return scene.items.filter(item => selected.has(item.id) || groups.has(item.assemblyId)).map(item => item.id);
}

export function movableAssemblyItems(scene, ids) {
  const selected = new Set(expandAssemblies(scene, ids));
  const lockedGroups = new Set(scene.items.filter(item => item.locked && item.assemblyId).map(item => item.assemblyId));
  return scene.items.filter(item => selected.has(item.id) && !item.locked && !lockedGroups.has(item.assemblyId));
}

export function remapAssembly(item, groups, generate) {
  if (!item.assemblyId) return;
  if (!groups.has(item.assemblyId)) groups.set(item.assemblyId, generate('assembly'));
  item.assemblyId = groups.get(item.assemblyId);
}

export function validateAssemblyItem(item) {
  if (item.assemblyId !== undefined && (typeof item.assemblyId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.assemblyId))) throw new Error('组合器件标识无效');
  if (item.assemblyName !== undefined && (typeof item.assemblyName !== 'string' || item.assemblyName.length > 100)) throw new Error('组合器件名称无效');
  if (item.support !== undefined && (!item.support || !['height', 'radius', 'baseWidth'].every(key => Number.isFinite(item.support[key]) && item.support[key] > 0 && item.support[key] <= 40000))) throw new Error('立杆尺寸无效');
}

export function transformAssembly(scene, id, before, after) {
  const anchor = scene.items.find(item => item.id === id);
  const members = anchor.assemblyId ? scene.items.filter(item => item.assemblyId === anchor.assemblyId) : [anchor];
  if (members.some(item => item.locked)) throw new Error('组合包含已锁定器件，请先解锁');
  const ids = new Set(members.map(item => item.id)), angle = (after.rotation - before.rotation) * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle), ratio = after.scale / before.scale;
  const move = point => {
    const x = (point.x - before.x) * ratio, z = (point.z - before.z) * ratio;
    return { x: after.x + x * cosine + z * sine, y: after.y + ((point.y || 0) - before.y) * ratio, z: after.z - x * sine + z * cosine };
  };
  const changes = members.map(item => {
    const source = item.id === id ? before : item;
    const change = { ...move(source), rotation: source.rotation + after.rotation - before.rotation, scale: source.scale * ratio };
    if (Math.abs(change.x) > 10000 || Math.abs(change.z) > 10000 || Math.abs(change.y) > 2000 || change.scale < .05 || change.scale > 10) throw new Error('组合变换超出可编辑范围');
    return { item, change };
  });
  const routes = scene.connections.filter(edge => ids.has(edge.a.item) && ids.has(edge.b.item)).map(edge => ({ edge, points: (edge.waypoints || []).map(move) }));
  if (routes.some(route => route.points.some(point => Object.values(point).some(value => Math.abs(value) >= 20000)))) throw new Error('组合走线超出可编辑范围');
  for (const { item, change } of changes) Object.assign(item, change);
  for (const { edge, points } of routes) if (edge.waypoints) edge.waypoints = points;
}

export function buildPostSupport(T, root, support) {
  const group = new T.Group(); group.name = 'device_post_support'; root.add(group);
  const { height, radius, baseWidth } = support;
  const steel = new T.MeshStandardMaterial({ color: '#aab4bc', roughness: .27, metalness: .82 });
  const dark = new T.MeshStandardMaterial({ color: '#34434b', roughness: .45, metalness: .55 });
  const plate = Math.min(6, height * .15);
  const parts = [
    [new T.CylinderGeometry(baseWidth * .5, baseWidth * .5, plate, 32), dark, [0, -height + plate * .5, 0], 'support_base'],
    [new T.CylinderGeometry(radius, radius, height - plate * 2, 32), steel, [0, -height * .5, 0], 'support_post'],
    [new T.BoxGeometry(baseWidth * .65, plate, baseWidth * .65), dark, [0, -plate * .5, 0], 'support_top']
  ];
  for (const [geometry, material, position, name] of parts) {
    const mesh = new T.Mesh(geometry, material); mesh.position.fromArray(position); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
}

export function alignAssemblyUnits(scene, ids, axis, distribute = false) {
  const units = new Map();
  for (const item of movableAssemblyItems(scene, ids)) {
    const key = item.assemblyId || item.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(item);
  }
  const entries = [...units.values()].map(items => ({ items, center: items.reduce((sum, item) => sum + item[axis], 0) / items.length }));
  if (entries.length < (distribute ? 3 : 2)) throw new Error(distribute ? '请选择至少三个器件或组合' : '请选择至少两个器件或组合');
  entries.sort((left, right) => left.center - right.center);
  const mean = entries.reduce((sum, entry) => sum + entry.center, 0) / entries.length;
  const minimum = entries[0].center, maximum = entries.at(-1).center;
  entries.forEach((entry, index) => {
    const target = distribute ? minimum + (maximum - minimum) * index / (entries.length - 1) : Math.round(mean);
    const delta = target - entry.center, members = new Set(entry.items.map(item => item.id));
    for (const item of entry.items) item[axis] += delta;
    for (const edge of scene.connections) if (members.has(edge.a.item) && members.has(edge.b.item)) for (const point of edge.waypoints || []) point[axis] += delta;
  });
}
