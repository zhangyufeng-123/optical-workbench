// opticalPorts in glTF node extras use that node's local coordinates.
export function embeddedOpticalPorts(T, scene) {
  const ports = [], ids = new Set();
  scene.updateMatrixWorld(true);
  scene.traverse(node => {
    const definitions = node.userData?.opticalPorts;
    if (definitions === undefined) return;
    if (!Array.isArray(definitions) || definitions.length + ports.length > 32) throw new Error('模型内置光学端口数量无效');
    for (const definition of definitions) {
      if (!definition || typeof definition.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(definition.id) || ids.has(definition.id) || !Array.isArray(definition.pos) || definition.pos.length !== 3 || !definition.pos.every(Number.isFinite) || !Array.isArray(definition.dir) || definition.dir.length !== 3 || !definition.dir.every(Number.isFinite) || Math.hypot(...definition.dir) < .5) throw new Error('模型内置光学端口坐标无效');
      const pos = new T.Vector3(...definition.pos).applyMatrix4(node.matrixWorld).toArray();
      const dir = new T.Vector3(...definition.dir).transformDirection(node.matrixWorld).toArray();
      const connector = definition.connector || 'FC/PC', kind = definition.kind || 'optical', role = definition.role || 'io';
      const label = definition.label || definition.id;
      if (pos.some(value => !Number.isFinite(value) || Math.abs(value) > 4000) || typeof label !== 'string' || label.length > 80 || typeof connector !== 'string' || connector.length > 32 || !['in', 'out', 'io'].includes(role) || !['optical', 'free-space'].includes(kind) || (kind === 'free-space') !== (connector === 'Free space')) throw new Error('模型内置光学端口定义无效');
      if(definition.gender!==undefined&&!['male','female'].includes(definition.gender))throw new Error('模型内置端口公母类型无效');
      if(definition.pigtailEnd!==undefined&&typeof definition.pigtailEnd!=='boolean')throw new Error('模型内置尾纤类型无效');
      ports.push({ id: definition.id, label, kind, role, connector, pos, dir,
        ...(definition.gender?{gender:definition.gender}:{}),...(definition.pigtailEnd!==undefined?{pigtailEnd:definition.pigtailEnd}:{})
      }); ids.add(definition.id);
    }
  });
  return ports;
}
