const {test} = require('node:test');
const assert = require('node:assert/strict');
const {addDragMode, dragMode} = require('../sanity/scripts/add-drag-mode.cjs');

function fixture(initial = []) {
  const documents = structuredClone(initial);
  let commits = 0;
  return {
    documents, get commits() { return commits; },
    config: () => ({projectId:'zvnub2e0', dataset:'production'}),
    async fetch(query, params) {
      return structuredClone(params?.id ? documents.find(doc => doc._id === params.id) : documents);
    },
    transaction() {
      let pending;
      const transaction = {
        createIfNotExists(doc) { pending = structuredClone(doc); return transaction; },
        async commit() { commits++; if (!documents.some(doc => doc._id === pending._id)) documents.push(pending); },
      };
      return transaction;
    },
  };
}
const options = {log:()=>{}};

test('adds only published Drag Race, preserving other modes and deleted modes', async () => {
  const original = {_id:'edited-racing', _type:'gameMode', gametype:0, name:'Keep this text'};
  const client = fixture([original]);
  assert.equal((await addDragMode(client, options)).created, true);
  assert.deepEqual(client.documents, [original, dragMode]);
  assert.equal(dragMode.development, true);
  assert.equal(dragMode.gametype, 9);
  assert.equal((await addDragMode(client, options)).created, false);
  assert.equal(client.commits, 1);
});

test('existing published and draft-only Drag documents retain their text and status', async () => {
  for (const id of ['custom-drag','drafts.custom-drag']) {
    const original = {_id:id, _type:'gameMode', gametype:9, name:'Edited Drag Race'};
    const client = fixture([original]);
    assert.equal((await addDragMode(client, options)).created, false);
    assert.deepEqual(client.documents, [original]);
    assert.equal(client.commits, 0);
  }
});

test('dry run never writes', async () => {
  const client = fixture();
  assert.equal((await addDragMode(client, {...options,dryRun:true})).planned, true);
  assert.equal(client.commits, 0);
  assert.equal(client.documents.length, 0);
});

test('wrong dataset and conflicting IDs stop before writes', async () => {
  const client = fixture();
  client.config = () => ({projectId:'zvnub2e0',dataset:'other'});
  await assert.rejects(addDragMode(client, options), /Unexpected project/);
  assert.equal(client.commits, 0);
  for (const id of [dragMode._id, `drafts.${dragMode._id}`]) {
    const conflict = fixture([{_id:id,_type:'car',gametype:9}]);
    await assert.rejects(addDragMode(conflict, options), /ID conflict/);
    assert.equal(conflict.commits, 0);
  }
});
