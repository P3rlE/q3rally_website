'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const seeds = require('./game-modes.seed.json');

async function importGameModes(client, options = {}) {
  const log = options.log || console.log;
  const config = client.config();
  if (config.projectId !== 'zvnub2e0' || config.dataset !== 'production') {
    throw new Error('Unexpected project/dataset. This import only targets Q3Rally (zvnub2e0/production).');
  }
  const ids = seeds.flatMap(doc => [doc._id, `drafts.${doc._id}`]);
  const existing = await client.fetch('*[_type == "gameMode" || _id in $ids]', {ids});
  if (!Array.isArray(existing)) throw new Error('Unexpected dataset response; nothing imported.');
  for (const seed of seeds) {
    for (const document of existing.filter(doc => doc._id === seed._id || doc._id === `drafts.${seed._id}`)) {
      if (document._type !== 'gameMode' || document.gametype !== seed.gametype) {
        throw new Error(`Document ID conflict: ${document._id}. Nothing imported.`);
      }
    }
  }
  const present = new Set(existing.filter(doc => doc._type === 'gameMode').map(doc => doc.gametype));
  const missing = seeds.filter(doc => !present.has(doc.gametype));
  log(`Found ${present.size} existing mode IDs (published documents and drafts included).`);
  for (const seed of seeds) log(`${present.has(seed.gametype) ? 'KEEP' : 'CREATE'} ${seed.gametype}: ${seed.name}`);
  if (options.dryRun) {
    log(`Dry run: ${missing.length} modes would be created. No changes made.`);
    return {created: 0, planned: missing.length};
  }
  if (!missing.length) {
    log('All 17 modes already exist. Nothing changed.');
    return {created: 0, planned: 0};
  }
  const backupDirectory = options.backupDirectory || path.join(os.homedir(), 'q3rally-sanity-backups');
  fs.mkdirSync(backupDirectory, {recursive: true, mode: 0o700});
  const backup = path.join(backupDirectory, `game-modes-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}.json`);
  fs.writeFileSync(backup, JSON.stringify({projectId: config.projectId, dataset: config.dataset, existing, planned: missing}, null, 2)+'\n', {flag:'wx', mode:0o600});
  log(`Backup / import record: ${backup}`);

  // Never patch or replace existing documents. Repeating this import preserves edits.
  // Recheck immediately before commit to avoid duplicating a mode created meanwhile.
  const latest = await client.fetch('*[_type == "gameMode"]{_id, gametype}');
  const latestTypes = new Set(latest.map(doc => doc.gametype));
  const create = missing.filter(doc => !latestTypes.has(doc.gametype));
  if (!create.length) { log('Modes were created meanwhile. Nothing changed.'); return {created:0, planned:0, backup}; }
  let transaction = client.transaction();
  for (const document of create) transaction = transaction.createIfNotExists(document);
  await transaction.commit({visibility: 'sync'});
  const after = await client.fetch('*[_type == "gameMode"]{_id, gametype}');
  for (const seed of seeds) {
    if (!after.some(doc => doc.gametype === seed.gametype)) throw new Error(`Verification failed for g_gametype ${seed.gametype}. Inspect Studio before retrying.`);
  }
  log(`Import complete: ${create.length} modes submitted; all 17 mode IDs verified in the dataset.`);
  log('Existing documents and drafts were not modified or published. Reload Game Modes in Studio.');
  return {created: create.length, planned: create.length, backup};
}
module.exports = {importGameModes};

if (require.main === module) {
  (async () => {
    const {getCliClient} = require('sanity/cli');
    const client = getCliClient({apiVersion: '2024-01-01'}).withConfig({useCdn:false, perspective:'raw'});
    if (!client.config().token) throw new Error('Run with: npx sanity exec scripts/import-game-modes.cjs --with-user-token');
    await importGameModes(client, {dryRun: process.argv.includes('--dry-run')});
  })().catch(error => {console.error(`Import stopped: ${error.message}`); process.exitCode = 1;});
}
