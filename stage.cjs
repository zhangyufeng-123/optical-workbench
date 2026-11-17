const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname);
const source = path.join(root, 'app');
const destination = path.join(root, 'web');
if (!fs.existsSync(path.join(source, 'app.js'))) throw new Error('Run npm run build before staging.');
// Only the generated runtime directory inside this repository may be replaced.
if (path.relative(root, path.resolve(destination)) !== 'web') throw new Error('Unsafe staging destination.');
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
const runtimeFiles = fs.readdirSync(source).filter(name =>
  name.endsWith('.css') || ['app.js', '打开光纤实验搭建台.html', '光纤符号库.html', '使用说明.md', '来源与许可.md'].includes(name)
);
for (const name of runtimeFiles) fs.copyFileSync(path.join(source, name), path.join(destination, name));
for (const directory of ['符号库', 'nature-references']) fs.cpSync(path.join(source, directory), path.join(destination, directory), { recursive: true });
fs.copyFileSync(path.join(source, 'vendor/package/LICENSE'), path.join(destination, 'Three-LICENSE.txt'));
console.log(`Staged V${require('./package.json').version} with ${runtimeFiles.length} runtime files.`);
