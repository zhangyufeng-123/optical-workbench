const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const suites = [
  'auto_layout_qa.mjs',
  'connection_logic_qa.mjs',
  'render_label_state_qa.mjs',
  'typography_exports_qa.mjs',
  'render_export_snapshot_qa.mjs',
  'product_models_qa.mjs',
  'fiber_routing_qa.mjs',
  'table_resize_qa.mjs'
];
fs.mkdirSync(path.join(root, 'app/qa'), { recursive: true });
const summary = { allPassed: false, suites: [] };
for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(root, 'app/source', suite)], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
  });
  summary.suites.push({ name: suite, passed: !result.error && result.status === 0 });
  fs.writeFileSync(path.join(root, 'app/qa/logic-suite-summary.json'), JSON.stringify(summary, null, 2));
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
summary.allPassed = true;
fs.writeFileSync(path.join(root, 'app/qa/logic-suite-summary.json'), JSON.stringify(summary, null, 2));
console.log(`All ${suites.length} logic suites passed.`);
