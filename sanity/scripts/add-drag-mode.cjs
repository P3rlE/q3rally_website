'use strict';

const dragMode = {
  _id: 'q3rally-game-mode-9',
  _type: 'gameMode',
  gametype: 9,
  name: 'Drag Race',
  category: 'race',
  development: true,
  orderRank: 9,
  description: 'Head-to-head drag racing with manual gear changes. Time your launch at the green light, stay in your lane and shift for the quickest run. Race a human or a bot, or practise solo.',
  objective: 'Win the majority of heats in a best-of match by reaching the finish first with a valid run.',
  note: 'Tryout development mode. False starts, leaving your lane or resetting forfeit the attempt. Supports best-of 1, 3, 5 or 7 heats and optional 4-, 8- or 16-driver knockout tournaments.',
};

async function addDragMode(client, {dryRun = false, log = console.log} = {}) {
  const {projectId, dataset} = client.config();
  if (projectId !== 'zvnub2e0' || dataset !== 'production') {
    throw new Error('Unexpected project/dataset; expected zvnub2e0/production.');
  }
  const ids = [dragMode._id, `drafts.${dragMode._id}`];
  const existing = await client.fetch('*[_type == "gameMode" || _id in $ids]{_id, _type, gametype, name}', {ids});
  if (!Array.isArray(existing)) throw new Error('Unexpected dataset response; nothing changed.');
  if (existing.some(doc => ids.includes(doc._id) && (doc._type !== 'gameMode' || doc.gametype !== 9))) {
    throw new Error('Drag document ID conflict; nothing changed.');
  }
  const present = existing.filter(doc => doc._type === 'gameMode' && doc.gametype === 9);
  if (present.length) {
    log(`KEEP Drag Race: ${present.map(doc => doc._id).join(', ')}. Existing text and drafts are unchanged.`);
    if (present.every(doc => doc._id.startsWith('drafts.'))) log('Only a draft exists. Publish it in Studio when ready.');
    return {created: false};
  }
  if (dryRun) {
    log('CREATE 9: Drag Race (published development mode). Dry run: nothing changed.');
    return {created: false, planned: true};
  }
  await client.transaction().createIfNotExists(dragMode).commit({visibility: 'sync'});
  const result = await client.fetch('*[_id == $id][0]{_id, _type, gametype}', {id: dragMode._id});
  if (result?._type !== 'gameMode' || result.gametype !== 9) {
    throw new Error('Drag Race verification failed. Inspect Studio before retrying.');
  }
  log('Drag Race added: q3rally-game-mode-9. Reload Game Modes in Studio.');
  return {created: true};
}

module.exports = {addDragMode, dragMode};
if (require.main === module) {
  (async () => {
    const {getCliClient} = require('sanity/cli');
    const client = getCliClient({apiVersion:'2024-01-01'}).withConfig({useCdn:false, perspective:'raw'});
    if (!client.config().token) throw new Error('Run with: npx sanity exec scripts/add-drag-mode.cjs --with-user-token');
    await addDragMode(client, {dryRun:process.argv.includes('--dry-run')});
  })().catch(error => {console.error(`Drag Race import stopped: ${error.message}`); process.exitCode = 1;});
}
