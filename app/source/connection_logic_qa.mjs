import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CATALOG, T} from './models.js';
import {planConnectionLogic} from './connection-logic.js';

const tests = [];
function check(name, run) {
  try { run(); tests.push({name, passed: true}); }
  catch (error) { tests.push({name, passed: false, error: error.stack}); }
}
const blank = () => ({format: 'fiber-workbench', version: 2, units: 'mm', title: '连接逻辑测试', board: {width: 2400, depth: 1000}, items: [], connections: [], custom: [], assets: {}});
const plan = (scene, text, options = {}) => planConnectionLogic(scene, text, {catalog: CATALOG, ...options});
const chain = '光源 → 起偏器 → 偏振控制器 → 绕制光纤 → 偏振分析仪';
const split = '光源=laser\n分光器=splitter\n探测1=photodiode\n探测2=photodiode\n光源 -> 分光器\n分光器.a -> 探测1\n分光器.b -> 探测2';
function beamFrame(scene, endpoint) {
  const item = scene.items.find(item => item.id === endpoint.item), definition = CATALOG.find(definition => definition.id === item.type);
  const port = (item.ports || definition.ports).find(port => port.id === endpoint.port);
  const transform = new T.Matrix4().compose(new T.Vector3(item.x, item.y, item.z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), item.rotation * Math.PI / 180), new T.Vector3().setScalar(item.scale));
  return {position: new T.Vector3(...port.pos).applyMatrix4(transform), direction: new T.Vector3(...port.dir).transformDirection(transform)};
}
function checkBeamAlignment(scene) {
  for (const edge of scene.connections.filter(edge => edge.kind === 'beam')) {
    const a = beamFrame(scene, edge.a), b = beamFrame(scene, edge.b), direction = b.position.clone().sub(a.position).normalize();
    assert(direction.dot(a.direction) > 1 - 1e-7);
    assert(direction.dot(b.direction) < -1 + 1e-7);
  }
}

check('Chinese five-device chain resolves current products and all four unique optical links', () => {
  const scene = blank(), before = structuredClone(scene), result = plan(scene, chain);
  assert.deepEqual(scene, before);
  assert.deepEqual(result.scene.items.map(item => item.type), ['laser', 'polarizer', 'paddle', 'qwp', 'polarimeter']);
  assert.equal(result.scene.connections.length, 4);
  assert.deepEqual(result.summary, {addedItems: 5, addedConnections: 4, reusedItems: 0, duplicateConnections: 0, beamAlignedItems: 0, changed: true});
});
check('Repeated chain reuses items and links without changing existing project metadata', () => {
  const original = plan(blank(), chain).scene;
  original.connections[0].color = '#123456'; original.connections[0].waypoints = [{x: 10, y: 5, z: 20}];
  original.items[1].y = 25; original.items[1].locked = true; original.items[1].note = 'user detail';
  const result = plan(original, chain);
  assert.deepEqual(result.scene, original);
  assert.equal(result.summary.reusedItems, 5); assert.equal(result.summary.duplicateConnections, 4); assert.equal(result.summary.changed, false);
});
check('Instance declarations build explicit splitter branches and rerun without duplicates', () => {
  const result = plan(blank(), split);
  assert.equal(result.scene.items.length, 4); assert.equal(result.scene.connections.length, 3);
  const splitter = result.scene.items.find(item => item.type === 'splitter');
  assert.deepEqual(result.scene.connections.filter(edge => edge.a.item === splitter.id).map(edge => edge.a.port), ['a', 'b']);
  assert.deepEqual(plan(result.scene, split).scene, result.scene);
});
check('Ambiguous splitter output requires an explicit port and leaves the caller scene untouched', () => {
  const scene = blank(), before = structuredClone(scene);
  assert.throws(() => plan(scene, '光源 -> 分光器 -> 功率计'), /多个兼容端口/);
  assert.deepEqual(scene, before);
});
check('Multiple same-type existing devices require instance labels or IDs', () => {
  const scene = plan(blank(), 'A=photodiode\nB=photodiode\n光源=laser').scene;
  assert.throws(() => plan(scene, '光源 -> photodiode'), /多个已有器件/);
  const target = scene.items.find(item => item.label === 'B');
  const result = plan(scene, `光源 -> ${target.id}`);
  assert.equal(result.scene.connections[0].b.item, target.id);
});
check('Port occupancy rejects a conflicting link atomically after an earlier valid line', () => {
  const scene = plan(blank(), '光源 -> 起偏器').scene, before = structuredClone(scene);
  assert.throws(() => plan(scene, '起偏器 -> 偏振控制器\n光源 -> 功率计'), /已被其他连接占用/);
  assert.deepEqual(scene, before);
});
check('Unknown products, wrong direction, missing ports, empty arrows and duplicate aliases fail clearly', () => {
  for (const [text, message] of [
    ['光源 -> unknown_product_123', /找不到器件/],
    ['功率计 -> 起偏器', /输出/],
    ['光源.missing -> 起偏器', /没有端口/],
    ['光源 -> ', /箭头两侧/],
    ['A=laser\nA=laser', /重复声明/],
    ['光源 -> 光源', /输出|输入|不同器件/]
  ]) assert.throws(() => plan(blank(), text), message);
});
check('Original label declarations enforce the existing device type', () => {
  const scene = plan(blank(), 'A=laser').scene;
  assert.throws(() => plan(scene, 'A=photodiode'), /类型与声明不一致/);
});
check('Model numbers, alternate arrows and comment lines resolve unique actual catalog definitions', () => {
  const result = plan(blank(), '# chain\nDFB13TK => ILP1310PM-FC\n// continued\nILP1310PM-FC -> FPC031 -> qwp -> PAX1000IR2/M');
  assert.equal(result.scene.items.length, 5); assert.equal(result.scene.connections.length, 4);
});
check('Custom imported definitions, asset bytes and edited port positions survive generation', () => {
  const scene = blank();
  scene.custom = [{id: 'custom_sensor', name: '自有传感器', shape: 'import', size: [100, 50, 60], color: '#334455', ports: [{id: 'opt', label: '输入', pos: [0, 15, 35], dir: [0, 0, 1], role: 'in', kind: 'optical', connector: 'FC/PC', gender: 'female'}]}];
  scene.assets.custom_sensor = 'AQIDBA==';
  const result = plan(scene, '光源 -> 自有传感器.opt');
  assert.equal(result.scene.assets.custom_sensor, scene.assets.custom_sensor); assert.deepEqual(result.scene.custom, scene.custom);
  assert.equal(result.scene.connections[0].b.port, 'opt');
});
check('Free-space straight, turned and branching new chains align every endpoint with real Three transforms', () => {
  for (const text of [
    'fs_cwlaser -> fs_hwp -> fs_lens_convex -> fs_cmos',
    'fs_cwlaser -> fs_turnmirror -> fs_lens_convex -> fs_cmos',
    'L=fs_cwlaser\nB=fs_pbs\nC1=fs_cmos\nC2=fs_cmos\nL -> B\nB.out -> C1\nB.ref -> C2'
  ]) {
    const result = plan(blank(), text); checkBeamAlignment(result.scene); assert(result.summary.beamAlignedItems >= 3);
  }
});
check('New beam components align to an existing rotated and raised optical source', () => {
  const scene = plan(blank(), 'L=fs_cwlaser').scene;
  Object.assign(scene.items[0], {x: 430, y: 160, z: -300, rotation: -45, scale: 1.3, locked: true});
  const original = structuredClone(scene.items[0]), result = plan(scene, 'L -> fs_hwp -> fs_cmos');
  assert.deepEqual(result.scene.items[0], original); checkBeamAlignment(result.scene);
});
check('New beam source can align backwards from an existing detector', () => {
  const scene = plan(blank(), 'C=fs_cmos').scene;
  Object.assign(scene.items[0], {x: 300, y: 40, z: 200, rotation: -90});
  const result = plan(scene, 'fs_cwlaser -> fs_hwp -> C');
  checkBeamAlignment(result.scene); assert.deepEqual(result.scene.items[0], scene.items[0]);
});
check('Contradictory existing beam alignment fails without moving the caller geometry', () => {
  const scene = plan(blank(), 'L=fs_cwlaser\nC=fs_cmos').scene;
  scene.items[1].z += 500;
  const before = structuredClone(scene);
  assert.throws(() => plan(scene, 'L -> C'), /空间光轴无法/); assert.deepEqual(scene, before);
});
check('Mixed fiber-to-collimator chain distinguishes flexible links from aligned beam links', () => {
  const result = plan(blank(), 'laser -> fs_fiber_collimator -> fs_lens_convex -> fs_cmos');
  assert.equal(result.scene.connections.filter(edge => edge.kind === 'beam').length, 2);
  assert.equal(result.scene.connections.filter(edge => edge.kind !== 'beam').length, 1); checkBeamAlignment(result.scene);
});
check('Validation runs on the complete candidate and a rejection never changes the input', () => {
  const scene = blank(), before = structuredClone(scene);
  assert.throws(() => plan(scene, chain, {validate: candidate => {assert.equal(candidate.connections.length, 4); throw new Error('validation rejection');}}), /validation rejection/);
  assert.deepEqual(scene, before);
});
check('External ID generation collisions fail before any project commit', () => {
  const scene = blank(); assert.throws(() => plan(scene, chain, {uid: () => 'same_id'}), /唯一/); assert.equal(scene.items.length, 0);
});
const report = {allPassed: tests.every(test => test.passed), checks: tests.length, tests};
fs.writeFileSync(new URL('../qa/connection_logic_qa.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.allPassed) process.exitCode = 1;
