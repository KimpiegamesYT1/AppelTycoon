// Cache-buster: geeft elk bestand een versie (?v=hash) zodat browsers na een update meteen de
// nieuwe code laden. index.html wordt bij herladen altijd opnieuw opgehaald; de import map daarin
// verwijst naar de nieuwe versies van alle modules.
// Gebruik: node tools/bump-version.mjs   (draai dit vóór elke commit die code verandert)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('..', import.meta.url).pathname;
const modules = [
  ...readdirSync(root + 'js').filter((f) => f.endsWith('.js')).sort().map((f) => 'js/' + f),
  'vendor/three.module.min.js',
];
const assets = ['css/style.css', 'assets/audio/factory-flow.mp3'];

const hash = createHash('sha1');
for (const f of [...modules, ...assets]) hash.update(f).update(readFileSync(root + f));
const v = hash.digest('hex').slice(0, 10);

const map = { imports: Object.fromEntries(modules.map((m) => [`./${m}`, `./${m}?v=${v}`])) };
const block = `<!-- versie:start (gegenereerd door tools/bump-version.mjs) -->
  <script type="importmap">
${JSON.stringify(map, null, 2).split('\n').map((l) => '  ' + l).join('\n')}
  </script>
  <script>window.APP_VERSION = '${v}';</script>
  <!-- versie:end -->`;

let html = readFileSync(root + 'index.html', 'utf8');
if (html.includes('<!-- versie:start')) {
  html = html.replace(/<!-- versie:start[\s\S]*?<!-- versie:end -->/, block);
} else {
  html = html.replace('<link rel="stylesheet" href="css/style.css', `${block}\n  <link rel="stylesheet" href="css/style.css`);
}
html = html.replace(/href="css\/style\.css(\?v=[^"]*)?"/, `href="css/style.css?v=${v}"`);
html = html.replace(/src="js\/main\.js(\?v=[^"]*)?"/, `src="js/main.js?v=${v}"`);
writeFileSync(root + 'index.html', html);
console.log('versie', v);
