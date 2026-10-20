const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {importGameModes} = require('../sanity/scripts/import-game-modes.cjs');
const seeds = require('../sanity/scripts/game-modes.seed.json');
function fixture(initial=[], fail=false) {
  const documents=structuredClone(initial); let commits=0;
  return {documents, get commits(){return commits}, config:()=>({projectId:'zvnub2e0',dataset:'production'}), fetch:async()=>structuredClone(documents), transaction(){
    const pending=[]; const transaction={createIfNotExists(doc){pending.push(structuredClone(doc));return transaction},async commit(){
      if(fail)throw Error('Simulated access failure');
      commits++;for(const doc of pending)if(!documents.some(d=>d._id===doc._id))documents.push(doc);
    }};return transaction;
  }};
}
async function withBackup(run) {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'q3-mode-import-'));
  try {await run({backupDirectory:directory, log:()=>{}},directory)} finally {fs.rmSync(directory,{recursive:true,force:true})}
}
test('creates the 17 published documents with exact website texts and a private import record',()=>withBackup(async(options,directory)=>{
  const client=fixture();const result=await importGameModes(client,options);
  assert.equal(result.created,17);assert.deepEqual(client.documents,seeds);
  const record=JSON.parse(fs.readFileSync(result.backup,'utf8'));assert.equal(record.existing.length,0);assert.equal(record.planned.length,17);
  assert.equal(fs.statSync(result.backup).mode&0o777,0o600);
}));
test('preserves published edits and draft-only modes, regardless of document ID',()=>withBackup(async options=>{
  const original=[{_id:'custom-racing',_type:'gameMode',gametype:0,name:'Edited Racing',description:'Keep me'}, {_id:'drafts.custom-ghost',_type:'gameMode',gametype:8,name:'Unpublished work'}];
  const client=fixture(original);const result=await importGameModes(client,options);
  assert.equal(result.created,15);assert.deepEqual(client.documents.slice(0,2),original);
  assert.equal(client.documents.filter(doc=>doc.gametype===8).length,1);
}));
test('rerun creates no duplicates and never resets later edits',()=>withBackup(async options=>{
  const client=fixture();await importGameModes(client,options);client.documents[0].name='Updated in Studio';
  assert.equal((await importGameModes(client,options)).created,0);assert.equal(client.commits,1);assert.equal(client.documents[0].name,'Updated in Studio');
}));
test('dry run performs no write and creates no backup',()=>withBackup(async(options,directory)=>{
  const client=fixture();const result=await importGameModes(client,{...options,dryRun:true});
  assert.equal(result.planned,17);assert.equal(client.commits,0);assert.equal(fs.readdirSync(directory).length,0);
}));
test('wrong project and conflicting IDs stop before mutations',()=>withBackup(async options=>{
  const wrong=fixture();wrong.config=()=>({projectId:'other',dataset:'production'});await assert.rejects(importGameModes(wrong,options),/Unexpected project/);assert.equal(wrong.commits,0);
  const conflict=fixture([{_id:seeds[0]._id,_type:'car',gametype:0}]);await assert.rejects(importGameModes(conflict,options),/ID conflict/);assert.equal(conflict.commits,0);
}));
test('commit failure preserves existing content and retains the backup',()=>withBackup(async(options,directory)=>{
  const original=[{_id:'custom',_type:'gameMode',gametype:0,name:'Keep'}];const client=fixture(original,true);
  await assert.rejects(importGameModes(client,options),/Simulated access/);assert.deepEqual(client.documents,original);assert.equal(fs.readdirSync(directory).length,1);
}));
