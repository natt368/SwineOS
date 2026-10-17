// Builds a single self-contained HTML file (CSS and JS inlined) from index.html.
//   node scripts/build-single.mjs [out.html] [--fragment]
// --fragment leaves out <!doctype>/<html>/<head>/<body> (for hosts that add their own skeleton).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find((a) => !a.startsWith('--')) || join(root, 'dist', 'swineos.html');

const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => readFileSync(join(root, m[1]), 'utf8')).join('\n');
const js = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => readFileSync(join(root, m[1]), 'utf8').replace(/<\/script/gi, '<\\/script')).join('\n;\n');
const title = (html.match(/<title>([^<]*)<\/title>/) || [, 'SwineOS'])[1];

const page = `<title>${title}</title>
<style>
${css}
</style>
<div id="app"></div>
<script>
${js}
</script>
`;
const doc = fragment ? page : `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
</head>
<body>
${page}</body>
</html>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, doc);
console.log(`Wrote ${out} (${(doc.length / 1024).toFixed(0)} KB)`);
