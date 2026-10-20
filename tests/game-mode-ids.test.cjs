const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {migrateGameModeIds}=require('../sanity/scripts/migrate-game-mode-ids.cjs');
function client(initial,{references=[],conflict=false,stale=false}={}) {
 let documents=structuredClone(initial),commits=0;
 return {get documents(){return documents},get commits(){return commits},config:()=>({projectId:'zvnub2e0',dataset:'production'}),async fetch(query,{ids}={}) {
  if(query.includes('references('))return references;
  if(query.includes('_id in'))return conflict?[{_id:ids[0]}]:documents.filter(d=>ids.includes(d._id));
  return structuredClone(documents);
 },transaction(){const ops=[];const tx={patch(id,data){ops.push({patch:id,data});return tx},create(doc){ops.push({create:doc});return tx},delete(id){ops.push({delete:id});return tx},async commit(){
  const next=structuredClone(documents);
  for(const op of ops){if(op.patch){const doc=next.find(d=>d._id===op.patch);if(stale||doc._rev!==op.data.ifRevisionID)throw Error('Revision conflict')}
  if(op.create){if(next.some(d=>d._id===op.create._id))throw Error('Already exists');next.push({...op.create,_rev:'new'})}
  if(op.delete)next.splice(next.findIndex(d=>d._id===op.delete),1)}
  documents=next;commits++;
 }};return tx}};
}
const docs=[{_id:'q3rally.gameMode.20',_type:'gameMode',_rev:'r1',gametype:20,name:'Four Team CTF',category:'team',description:'My edited text',image:{asset:{_ref:'image-123'}}},{_id:'drafts.q3rally.gameMode.20',_type:'gameMode',_rev:'r2',gametype:20,name:'Unpublished new name',category:'team'}];
async function run(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'q3-mode-id-'));try{await fn({log:()=>{},backupDirectory:dir},dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
test('preserves edited published and draft content; never recreates deleted modes',()=>run(async(options)=>{
 const c=client(docs);const result=await migrateGameModeIds(c,options);assert.equal(result.migrated,2);assert.equal(c.documents.length,2);assert.ok(c.documents.every(d=>d.gametype===20));assert.equal(c.documents[0].name,'Four Team CTF');assert.deepEqual(c.documents[0].image,docs[0].image);assert.equal(c.documents[1]._id,'drafts.q3rally-game-mode-20');assert.equal(c.documents[1].name,'Unpublished new name');assert.deepEqual(JSON.parse(fs.readFileSync(result.backup)).existing,docs);
 assert.equal((await migrateGameModeIds(c,options)).migrated,0);assert.equal(c.commits,1);
}));
test('conflicting destinations and external references block all mutations',()=>run(async options=>{
 for(const setting of [{conflict:true},{references:[{_id:'referencing-document'}]}]){const c=client(docs,setting);await assert.rejects(migrateGameModeIds(c,options));assert.deepEqual(c.documents,docs);assert.equal(c.commits,0)}
}));
test('concurrent edits abort the atomic transaction and preserve the backup',()=>run(async(options,dir)=>{
 const c=client(docs,{stale:true});await assert.rejects(migrateGameModeIds(c,options),/Revision conflict/);assert.deepEqual(c.documents,docs);assert.equal(fs.readdirSync(dir).length,1);
}));
test('dry run does not write',()=>run(async(options,dir)=>{const c=client(docs);await migrateGameModeIds(c,{...options,dryRun:true});assert.equal(c.commits,0);assert.equal(fs.readdirSync(dir).length,0)}));
test('published CMS list controls removal, renaming and home count',async()=>{
 const {mergeGameModes}=await import('../src/data/gameModes.js');
 const published=[{gametype:20,name:'Four Team CTF',category:'team',description:'Edited',orderRank:1}];const modes=mergeGameModes(published);assert.equal(modes.length,1);assert.equal(modes[0].name,'Four Team CTF');assert.ok(!modes.some(m=>m.gametype===2));assert.deepEqual(mergeGameModes([]),[]);
});
