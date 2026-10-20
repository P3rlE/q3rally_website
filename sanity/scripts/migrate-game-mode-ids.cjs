'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function newId(id) {
  const match = /^(drafts\.)?q3rally\.gameMode\.(\d+)$/.exec(id);
  return match ? `${match[1] || ''}q3rally-game-mode-${match[2]}` : id;
}
async function migrateGameModeIds(client, options = {}) {
  const log = options.log || console.log;
  const config = client.config();
  if (config.projectId !== 'zvnub2e0' || config.dataset !== 'production') throw Error('Wrong project/dataset. Nothing changed.');
  const existing = await client.fetch('*[_type == "gameMode"]');
  const migrate = existing.filter(doc => newId(doc._id) !== doc._id);
  if (!migrate.length) { log('No old game-mode IDs found. Nothing changed.'); return {migrated:0}; }
  const destinations = migrate.map(doc => newId(doc._id));
  const conflicts = await client.fetch('*[_id in $ids]{_id}', {ids:destinations});
  if (conflicts.length) throw Error('Destination IDs already exist. Nothing changed: ' + conflicts.map(doc=>doc._id).join(', '));
  const references = await client.fetch('*[references($ids)]{_id}', {ids:migrate.map(doc=>doc._id)});
  if (references.length) throw Error('Other documents reference the old IDs. Nothing changed; references need migration first.');
  for (const doc of migrate) {
    if (!doc._rev) throw Error('Missing document revision. Nothing changed.');
    log(`MOVE ${doc._id} → ${newId(doc._id)} (${doc.name})`);
  }
  if (options.dryRun) { log(`Dry run: ${migrate.length} documents would move. No changes made.`); return {migrated:0,planned:migrate.length}; }
  const directory=options.backupDirectory || path.join(os.homedir(),'q3rally-sanity-backups');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const backup=path.join(directory,`game-mode-ids-${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}.json`);
  fs.writeFileSync(backup,JSON.stringify({projectId:config.projectId,dataset:config.dataset,existing},null,2)+'\n',{flag:'wx',mode:0o600});
  log(`Private backup: ${backup}`);
  let tx=client.transaction();
  for (const document of migrate) {
    const copy={...document,_id:newId(document._id)};
    for (const field of ['_rev','_createdAt','_updatedAt','_system']) delete copy[field];
    // Revision guards prevent deletion of edits made since this snapshot.
    tx=tx.patch(document._id,{ifRevisionID:document._rev,set:{gametype:document.gametype}});
    tx=tx.create(copy).delete(document._id);
  }
  await tx.commit({visibility:'sync'});
  const after=await client.fetch('*[_type == "gameMode"]');
  for (const document of migrate) {
    if (after.some(doc=>doc._id===document._id) || !after.some(doc=>doc._id===newId(document._id))) throw Error('Post-migration verification failed. Check Studio before retrying.');
  }
  log(`Migration complete: ${migrate.length} documents moved, current content preserved. No missing mode was recreated.`);
  return {migrated:migrate.length,backup};
}
module.exports={migrateGameModeIds,newId};
if (require.main===module) {
  (async()=>{
    const {getCliClient}=require('sanity/cli');
    const client=getCliClient({apiVersion:'2024-01-01'}).withConfig({useCdn:false,perspective:'raw'});
    if(!client.config().token)throw Error('Run with sanity exec scripts/migrate-game-mode-ids.cjs --with-user-token');
    const dryRun=process.argv.includes('--dry-run');
    await migrateGameModeIds(client,{dryRun});
    if (!dryRun) {
      const published=(await client.fetch('*[_type == "gameMode"]{_id, gametype}')).filter(doc=>!doc._id.startsWith('drafts.'));
      const publicClient=client.withConfig({token:undefined,perspective:'published'});
      const readable=await publicClient.fetch('*[_type == "gameMode"]{_id, name}');
      for (const document of published) if(!readable.some(doc=>doc._id===document._id)) throw Error('Public visibility verification failed for '+document._id);
      console.log(`Public website access verified: ${readable.length} published game modes.`);
    }
  })().catch(error=>{console.error('Migration stopped: '+error.message);process.exitCode=1;});
}
