const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: ['app/source/app.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'eof',
  alias: { three: path.join(root, 'app/vendor/package/build/three.module.js') },
  outfile: path.join(root, 'app/app.js'),
  logLevel: 'info'
});
