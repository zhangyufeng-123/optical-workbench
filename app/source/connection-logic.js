import {searchDevices} from './device-search.js';
import {supportedFiberConnectorPair} from './fiber-routing.js';

const COMMON_NAMES = new Map([
  ['光源', 'laser'], ['光纤光源', 'laser'], ['激光光源', 'laser'],
  ['起偏器', 'polarizer'], ['在线起偏器', 'polarizer'],
  ['偏振控制器', 'paddle'], ['三环偏振控制器', 'paddle'], ['三桨偏振控制器', 'paddle'],
  ['绕制光纤', 'qwp'], ['绕制光纤波片', 'qwp'], ['自制绕制光纤', 'qwp'],
  ['偏振分析仪', 'polarimeter'], ['功率计', 'powermeter'], ['光功率计', 'powermeter'],
  ['分束器', 'splitter'], ['分光器', 'splitter'], ['隔离器', 'isolator'],
  ['探测器', 'photodiode'], ['光电探测器', 'photodiode'], ['光谱仪', 'osa'],
  ['空间激光器', 'fs_cwlaser'], ['空间光源', 'fs_cwlaser'],
  ['转向镜', 'fs_turnmirror'], ['凸透镜', 'fs_lens_convex'], ['相机', 'fs_cmos']
]);
const normalize = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
const cloneScene = scene => {
  const {assets, ...rest} = scene;
  return {...structuredClone(rest), assets: {...assets}};
};
const endpointKey = endpoint => endpoint.item + '|' + endpoint.port;
const sameEndpoint = (left, right) => left.item === right.item && left.port === right.port;

function fail(line, message) {
  throw new Error(`第 ${line} 行，${message}`);
}

function uniqueMatch(matches, name, line, noun) {
  if (matches.length > 1) fail(line, `“${name}”对应多个${noun}，请使用完整型号、器件 ID 或不同的实例别名。`);
  return matches[0];
}

function resolveDefinition(name, definitions, line) {
  const key = normalize(name);
  const exact = definitions.filter(definition => [definition.id, definition.name, definition.code, definition.product?.model].some(value => value && normalize(value) === key));
  if (exact.length) return uniqueMatch(exact, name, line, '器件类型');
  const common = definitions.find(definition => definition.id === COMMON_NAMES.get(key));
  if (common) return common;
  const matches = searchDevices(definitions, name);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) fail(line, `“${name}”有多个匹配，请使用型号或类型 ID，例如 ${matches.slice(0, 4).map(definition => definition.id).join('、')}。`);
  fail(line, `找不到器件“${name}”，请使用器件库名称、型号或类型 ID。`);
}

function parseText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入连接关系，例如 光源 → 起偏器 → 偏振分析仪。');
  if (text.trim().length > 30000) throw new Error('连接关系最多 30000 字符，请分次补充。');
  const declarations = [], chains = [];
  for (const [index, raw] of text.replace(/\r/g, '').split('\n').entries()) {
    const value = raw.trim(), line = index + 1;
    if (!value || value.startsWith('#') || value.startsWith('//')) continue;
    if (/->|→|=>/.test(value)) {
      const names = value.split(/\s*(?:->|→|=>)\s*/).map(name => name.trim());
      if (names.some(name => !name)) fail(line, '箭头两侧都需要器件名称。');
      chains.push({line, names});
    } else if (value.includes('=')) {
      const parts = value.split('=');
      if (parts.length !== 2 || parts.some(part => !part.trim())) fail(line, '实例声明请写为 名称=器件类型。');
      const [name, type] = parts.map(part => part.trim());
      if (/[.]/.test(name) || name.length > 150) fail(line, '实例名称最多 150 字，点号用于指定端口。');
      declarations.push({name, type, line});
    } else fail(line, '请使用箭头连接器件，或写为 名称=器件类型。');
  }
  if (!declarations.length && !chains.length) throw new Error('连接关系中没有器件或连接。');
  return {declarations, chains};
}

function placeNewItems(items, created, definition) {
  const pending = items.filter(item => created.has(item.id));
  if (!pending.length) return;
  const columns = Math.ceil(Math.sqrt(pending.length));
  const widths = Array(columns).fill(0), depths = [];
  pending.forEach((item, index) => {
    const size = definition(item.type).size, row = Math.floor(index / columns);
    widths[index % columns] = Math.max(widths[index % columns], size[0] * item.scale + 160);
    depths[row] = Math.max(depths[row] || 0, size[2] * item.scale + 160);
  });
  const width = widths.reduce((sum, value) => sum + value, 0), depth = depths.reduce((sum, value) => sum + value, 0);
  pending.forEach((item, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    item.x = -width / 2 + widths.slice(0, column).reduce((sum, value) => sum + value, 0) + widths[column] / 2;
    item.z = -depth / 2 + depths.slice(0, row).reduce((sum, value) => sum + value, 0) + depths[row] / 2;
  });
}

function rotateY(vector, degrees) {
  const angle = degrees * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  return [vector[0] * cosine + vector[2] * sine, vector[1], -vector[0] * sine + vector[2] * cosine];
}

function portFrame(item, port) {
  const local = rotateY(port.pos, item.rotation), direction = rotateY(port.dir, item.rotation);
  const length = Math.hypot(...direction);
  return {
    position: [item.x + local[0] * item.scale, (item.y || 0) + local[1] * item.scale, item.z + local[2] * item.scale],
    direction: direction.map(value => value / length)
  };
}

function alignNewBeamItems(scene, additions, created, definition) {
  const beamEdges = additions.filter(entry => entry.edge.kind === 'beam');
  const anchored = new Set(scene.items.filter(item => !created.has(item.id)).map(item => item.id));
  const items = new Map(scene.items.map(item => [item.id, item])), adjusted = new Set();
  const getPort = endpoint => {
    const item = items.get(endpoint.item);
    return (item.ports || definition(item.type).ports).find(port => port.id === endpoint.port);
  };
  const place = (fixedEnd, movingEnd, line) => {
    const fixed = items.get(fixedEnd.item), moving = items.get(movingEnd.item);
    const target = portFrame(fixed, getPort(fixedEnd)), port = getPort(movingEnd);
    const normalLength = Math.hypot(...port.dir), localY = port.dir[1] / normalLength;
    if (Math.abs(localY + target.direction[1]) > 1e-5) fail(line, '空间光端口的竖直方向无法通过平面旋转对齐，请调整端口方向。');
    const desired = target.direction.map(value => -value);
    moving.rotation = (Math.atan2(port.dir[2], port.dir[0]) - Math.atan2(desired[2], desired[0])) * 180 / Math.PI;
    const fixedSize = definition(fixed.type).size, movingSize = definition(moving.type).size;
    const distance = Math.max(160, (Math.max(fixedSize[0], fixedSize[2]) * fixed.scale + Math.max(movingSize[0], movingSize[2]) * moving.scale) / 2 + 80);
    const local = rotateY(port.pos, moving.rotation);
    const position = target.position.map((value, index) => value + target.direction[index] * distance - local[index] * moving.scale);
    [moving.x, moving.y, moving.z] = position;
    anchored.add(moving.id);
    adjusted.add(moving.id);
  };
  const pending = [...beamEdges];
  while (pending.length) {
    let index = pending.findIndex(({edge}) => anchored.has(edge.a.item) || anchored.has(edge.b.item));
    if (index < 0) { index = 0; anchored.add(pending[0].edge.a.item); }
    const {edge, line} = pending.splice(index, 1)[0];
    if (!anchored.has(edge.b.item)) place(edge.a, edge.b, line);
    else if (!anchored.has(edge.a.item)) place(edge.b, edge.a, line);
    const left = portFrame(items.get(edge.a.item), getPort(edge.a)), right = portFrame(items.get(edge.b.item), getPort(edge.b));
    const delta = right.position.map((value, axis) => value - left.position[axis]), length = Math.hypot(...delta);
    const forward = delta.reduce((sum, value, axis) => sum + value * left.direction[axis], 0) / length;
    const backward = delta.reduce((sum, value, axis) => sum - value * right.direction[axis], 0) / length;
    if (!(length > 1e-4 && forward > 1 - 1e-6 && backward > 1 - 1e-6)) {
      fail(line, `“${items.get(edge.a.item).label}”与“${items.get(edge.b.item).label}”的空间光轴无法同时满足当前位置和连接，请调整已有器件或拆开闭环后再连接。`);
    }
  }
  return adjusted.size;
}

/** Build a complete candidate project before the caller commits its undo step. */
export function planConnectionLogic(scene, text, {catalog = [], uid, validate} = {}) {
  if (!Array.isArray(scene?.items) || !Array.isArray(scene?.connections)) throw new Error('当前工程不完整。');
  const {declarations, chains} = parseText(text), next = cloneScene(scene);
  const definitions = [...new Map([...catalog, ...(next.custom || [])].map(definition => [definition.id, definition])).values()];
  const byType = new Map(definitions.map(definition => [definition.id, definition]));
  const definition = type => {
    const result = byType.get(type);
    if (!result) throw new Error(`找不到器件定义“${type}”。`);
    return result;
  };
  const aliases = new Map(), created = new Set(), reused = new Set(), additions = [];
  const occupied = new Set(next.connections.flatMap(edge => [endpointKey(edge.a), endpointKey(edge.b)]));
  const identifiers = new Set([...next.items, ...next.connections, ...definitions].map(value => value.id));
  let serial = 0, duplicates = 0;
  const generate = prefix => {
    let result;
    do { result = uid ? uid(prefix) : `logic_${prefix}_${++serial}`; } while (identifiers.has(result) && !uid);
    if (typeof result !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(result) || identifiers.has(result)) throw new Error('无法生成唯一器件或连接标识。');
    identifiers.add(result);
    return result;
  };
  const create = (type, label, line) => {
    if (next.items.length >= 250) fail(line, '添加后超过 250 个器件，请减少器件数量。');
    const item = {id: generate('obj'), type: type.id, label, x: 0, y: 0, z: 0, rotation: 0, scale: 1, color: type.color, note: type.note || '', locked: false, hidden: false, showLabel: true};
    next.items.push(item);
    created.add(item.id);
    return item;
  };
  const remember = (name, item) => {
    aliases.set(normalize(name), item);
    if (!created.has(item.id)) reused.add(item.id);
    return item;
  };
  for (const entry of declarations) {
    if (aliases.has(normalize(entry.name))) fail(entry.line, `实例名称“${entry.name}”重复声明。`);
    const type = resolveDefinition(entry.type, definitions, entry.line);
    const existing = uniqueMatch(next.items.filter(item => normalize(item.label) === normalize(entry.name) || normalize(item.id) === normalize(entry.name)), entry.name, entry.line, '已有器件');
    if (existing && existing.type !== type.id) fail(entry.line, `已有“${entry.name}”的器件类型与声明不一致，请换一个实例名称。`);
    remember(entry.name, existing || create(type, entry.name, entry.line));
  }
  const resolveItem = (name, line) => {
    const key = normalize(name);
    if (aliases.has(key)) return aliases.get(key);
    const exact = uniqueMatch(next.items.filter(item => normalize(item.id) === key || normalize(item.label) === key), name, line, '已有器件');
    if (exact) return remember(name, exact);
    const type = resolveDefinition(name, definitions, line);
    const existing = uniqueMatch(next.items.filter(item => item.type === type.id), name, line, '已有器件');
    return remember(name, existing || create(type, name, line));
  };
  const resolveEndpoint = (name, line, role) => {
    const key = normalize(name);
    const fullName = aliases.has(key) || next.items.some(item => normalize(item.id) === key || normalize(item.label) === key)
      || definitions.some(type => [type.id, type.name, type.code, type.product?.model].some(value => value && normalize(value) === key));
    const separator = fullName ? -1 : name.lastIndexOf('.');
    const itemName = separator < 0 ? name : name.slice(0, separator).trim();
    const portName = separator < 0 ? null : name.slice(separator + 1).trim();
    if (!itemName || portName === '') fail(line, '端口写法应为 器件名称.端口 ID。');
    const item = resolveItem(itemName, line), ports = item.ports || definition(item.type).ports;
    const selected = portName === null ? ports : ports.filter(port => normalize(port.id) === normalize(portName) || normalize(port.label) === normalize(portName));
    if (!selected.length) fail(line, `“${itemName}”没有${portName ? `端口“${portName}”` : '光学端口'}。`);
    const eligible = selected.filter(port => port.role === role || port.role === 'io');
    if (!eligible.length) fail(line, `“${name}”没有可用的${role === 'out' ? '输出' : '输入'}方向端口。`);
    return {item, ports: eligible, name};
  };
  for (const {line, names} of chains) {
    for (let index = 0; index < names.length - 1; index++) {
      const left = resolveEndpoint(names[index], line, 'out'), right = resolveEndpoint(names[index + 1], line, 'in');
      if (left.item.id === right.item.id) fail(line, '一条连接的两个端点需要属于不同器件。');
      const pairs = [];
      for (const a of left.ports) for (const b of right.ports) {
        if (a.kind !== b.kind || !supportedFiberConnectorPair(a, b)) continue;
        pairs.push({a: {item: left.item.id, port: a.id}, b: {item: right.item.id, port: b.id}, kind: a.kind});
      }
      if (!pairs.length) fail(line, `“${left.name}”和“${right.name}”的介质或接口不兼容，请使用相匹配的端口。`);
      const existing = pairs.filter(pair => next.connections.some(edge => sameEndpoint(edge.a, pair.a) && sameEndpoint(edge.b, pair.b) || sameEndpoint(edge.b, pair.a) && sameEndpoint(edge.a, pair.b)));
      if (existing.length === 1) { duplicates++; continue; }
      if (existing.length > 1) fail(line, '两个器件间已有多条连接，请用 .端口 ID 指定。');
      const available = pairs.filter(pair => !occupied.has(endpointKey(pair.a)) && !occupied.has(endpointKey(pair.b)));
      if (!available.length) fail(line, `“${left.name}”或“${right.name}”的端口已被其他连接占用。`);
      if (available.length > 1) fail(line, `存在多个兼容端口，请明确写出端口，例如 ${left.name}.${available[0].a.port} → ${right.name}.${available[0].b.port}。`);
      if (next.connections.length >= 600) fail(line, '添加后超过 600 条连接，请减少连接数量。');
      const pair = available[0], beam = pair.kind === 'free-space';
      const edge = beam
        ? {id: generate('beam'), kind: 'beam', a: pair.a, b: pair.b, color: '#ed283c', radius: 1.8, glow: .65}
        : {id: generate('fiber'), a: pair.a, b: pair.b, fiber: 'SM', color: '#d28b25', side: 1, slack: 85, radius: 1.15};
      next.connections.push(edge);
      additions.push({edge, line});
      occupied.add(endpointKey(pair.a));
      occupied.add(endpointKey(pair.b));
    }
  }
  placeNewItems(next.items, created, definition);
  const beamAlignedItems = alignNewBeamItems(next, additions, created, definition);
  if (next.items.some(item => ![item.x, item.y || 0, item.z].every(Number.isFinite) || Math.abs(item.x) > 10000 || Math.abs(item.z) > 10000 || Math.abs(item.y || 0) > 2000)) throw new Error('连接生成的位置超出工程坐标范围，请减少单次器件数量或调整空间光链路。');
  const result = validate ? validate(next) : next;
  return {scene: result, summary: {addedItems: created.size, addedConnections: additions.length, reusedItems: reused.size, duplicateConnections: duplicates, beamAlignedItems, changed: created.size > 0 || additions.length > 0}};
}
