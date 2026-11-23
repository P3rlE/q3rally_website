import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assets = resolve(root, process.argv[2] ?? 'public/quakerally');
const catalogue = JSON.parse(await readFile(resolve(root, 'src/data/quakerally.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'src/data/quakerally-assets.json'), 'utf8'));
const expected = new Map(manifest.map(file => [file.path, file]));
let checked = 0;
for (const file of manifest) {
  const absolute = resolve(assets, file.path);
  const rel = relative(assets, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Invalid archive path: ${file.path}`);
  const bytes = await readFile(absolute);
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(`Archive asset differs: ${file.path}`);
  }
  checked++;
}
const ids = new Set();
for (const entry of catalogue.entries) {
  if (ids.has(entry.id)) throw new Error(`Duplicate entry: ${entry.id}`);
  ids.add(entry.id);
  if (!catalogue.categories[entry.category]) throw new Error(`Unknown category: ${entry.category}`);
  for (const path of [entry.download, entry.originalDownload, ...entry.readmes.map(readme => readme.url)].filter(Boolean)) {
    if (!expected.has(path)) throw new Error(`Missing manifest entry: ${path}`);
  }
  const download = expected.get(entry.download);
  if (download.sha256 !== (entry.downloadSha256 ?? entry.sha256) || download.bytes !== (entry.downloadBytes ?? entry.bytes)) {
    throw new Error(`Download metadata differs: ${entry.id}`);
  }
}
for (const image of catalogue.images) {
  if (!expected.has(image.url)) throw new Error(`Missing image: ${image.url}`);
}
console.log(`Verified ${checked} archive assets, ${catalogue.entries.length} catalogue entries and ${catalogue.images.length} images.`);
