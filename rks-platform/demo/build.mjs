// Bouwt de browserdemo: één HTML-bestand met de echte platformcode, SQLite (sql.js) en de opmaak.
//
//   npm run demo:build   ->  demo/dist/rks-platform-demo.html  (inhoud voor een Claude-artifact)
//                            demo/dist/preview.html            (zelfde, als los te openen pagina)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(root + p);
const dataUri = (p, type) => `data:${type};base64,${read(p).toString('base64')}`;

const SHIMS = {
  'node:sqlite': 'sqlite.js',
  'node:crypto': 'crypto.js',
  'node:fs': 'fs.js',
  'node:path': 'path.js',
  'node:url': 'url.js',
  express: 'express.js',
};

// Nieuwe schema- of demodata? Dan beginnen bezoekers met een schone database.
const buildId = createHash('sha256').update(read('src/schema.sql')).update(read('scripts/seed.js')).digest('hex').slice(0, 10);

const js = await build({
  entryPoints: [root + 'demo/main.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: ['es2022', 'safari15.4'],
  minify: true,
  legalComments: 'none',
  loader: { '.sql': 'text' },
  inject: [root + 'demo/shim/globals.js'],
  define: {
    'import.meta.url': '"file:///rks-platform/src/demo.js"',
    __BUILD_ID__: JSON.stringify(buildId),
    __LOGO__: JSON.stringify(dataUri('public/img/logo.svg', 'image/svg+xml')),
  },
  plugins: [{
    name: 'node-shims',
    setup(b) {
      b.onResolve({ filter: /^(node:(sqlite|crypto|fs|path|url)|express)$/ }, (args) => ({ path: `${root}demo/shim/${SHIMS[args.path]}` }));
      // sql.js vraagt deze alleen op als hij onder Node draait.
      b.onResolve({ filter: /^(fs|path|crypto)$/ }, (args) => ({ path: args.path, external: true }));
    },
  }],
});
const bundle = js.outputFiles[0].text;
if (/<\/script/i.test(bundle)) throw new Error('De bundel bevat </script>');

let css = read('public/css/app.css').toString();
css += `\n${read('demo/demo.css')}`;

const page = read('demo/shell.html').toString().split('/*CSS*/').join(css).split('/*JS*/').join(bundle);
mkdirSync(root + 'demo/dist', { recursive: true });
writeFileSync(root + 'demo/dist/rks-platform-demo.html', page);
writeFileSync(root + 'demo/dist/preview.html',
  `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${page}\n</body></html>`);
console.log(`demo/dist/rks-platform-demo.html  ${(page.length / 1024).toFixed(0)} kB  (build ${buildId})`);
