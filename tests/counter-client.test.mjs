import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/scripts/counter.ts', import.meta.url), 'utf8'));
function client({ blocked = false, fail = false } = {}) {
  const events = {}, requests = [], storage = new Map(), elements = new Map();
  for (const name of ['online', 'visitors', 'pageviews', 'downloads', 'today']) elements.set(`stat-${name}`, { textContent: '—' });
  class Element { closest() { return this.link; } }
  let interval;
  const context = {
    Element, Uint8Array, console,
    crypto: { getRandomValues: a => a.fill(1) },
    sessionStorage: {
      getItem: k => { if (blocked) throw Error('blocked'); return storage.get(k); },
      setItem: (k, v) => storage.set(k, v),
    },
    document: { visibilityState: 'visible', getElementById: id => elements.get(id), addEventListener: (name, callback) => events[name] = callback },
    setInterval: callback => { interval = callback; },
    fetch: async (url, options = {}) => {
      requests.push({url, ...options});
      if (fail) throw Error('offline');
      return {ok: true, json: async () => ({ online: 0, visitors: 1234, pageviews: 0, downloads: 0, today: 0 })};
    },
  };
  vm.runInNewContext(source, context);
  return { context, events, requests, elements, interval: () => interval(), Element };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('renders zeros, tracks one view, heartbeats do not count views', async () => {
  const c = client(); await settle();
  assert.equal(c.elements.get('stat-online').textContent, '0');
  assert.equal(c.elements.get('stat-visitors').textContent, '1.234');
  assert.equal(JSON.parse(c.requests[0].body).event, 'view');
  c.interval(); await settle();
  assert.equal(JSON.parse(c.requests[1].body).event, 'heartbeat');
  c.context.document.visibilityState = 'hidden'; c.interval();
  assert.equal(c.requests.length, 2);
});
test('download click uses keepalive without stopping navigation', async () => {
  const c = client(); await settle();
  const target = new c.Element(); target.link = {getAttribute: () => '/files/game.zip'};
  c.events.click({target}); await settle();
  assert.equal(JSON.parse(c.requests[1].body).event, 'download');
  assert.equal(c.requests[1].keepalive, true);
});
test('storage unavailable reads totals without generating sessions', async () => {
  const c = client({blocked: true}); await settle();
  assert.equal(c.requests[0].method, undefined);
  assert.equal(c.elements.get('stat-downloads').textContent, '0');
});
test('network failures leave unavailable figures as dashes', async () => {
  const c = client({fail: true}); await settle();
  assert.equal(c.elements.get('stat-online').textContent, '—');
});
