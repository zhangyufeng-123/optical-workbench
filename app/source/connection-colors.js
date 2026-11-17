// Preserve the RGB chosen for connection artwork during image capture.
// Instrument surfaces continue to use their normal lighting and materials.
export function preserveConnectionColors(T, root) {
  const changed = [], replacements = new Map();
  let restored = false;
  function restore() {
    if (restored) return;
    restored = true;
    for (const [object, material] of changed) object.material = material;
    for (const material of replacements.values()) material.dispose();
  }
  function replacement(original) {
    if (!original || (!original.userData?.connectionColor && !original.userData?.isBeam)) return original;
    if (!replacements.has(original)) {
      const material = new T.MeshBasicMaterial({
        color: original.color,
        map: original.map,
        alphaMap: original.alphaMap,
        alphaTest: original.alphaTest,
        opacity: original.opacity,
        transparent: original.transparent,
        side: original.side,
        depthTest: original.depthTest,
        depthWrite: original.depthWrite,
        colorWrite: original.colorWrite,
        vertexColors: original.vertexColors,
        visible: original.visible,
        blending: T.NormalBlending,
        toneMapped: false
      });
      material.name = original.name;
      material.userData = { ...original.userData, shared: false };
      replacements.set(original, material);
    }
    return replacements.get(original);
  }
  try {
    root.traverse(object => {
      if (!object.isMesh || !object.material) return;
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      const materials = originals.map(replacement);
      if (materials.some((material, index) => material !== originals[index])) {
        changed.push([object, object.material]);
        object.material = Array.isArray(object.material) ? materials : materials[0];
      }
    });
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}
