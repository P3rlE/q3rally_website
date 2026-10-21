import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = readFileSync(new URL('../src/pages/ladder.astro', import.meta.url), 'utf8');
const script = page.match(/<script define:vars[^>]*>([\s\S]*?)<\/script>/)[1].split('const ladderReady = init();')[0];
function client() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      innerHTML: '', style: {}, classList: { add() {}, remove() {} },
      addEventListener() {}, setAttribute() {}, querySelectorAll() { return []; },
    });
    return elements.get(id);
  };
  const ctx = vm.createContext({
    API_BASE: 'https://example.test', IMG_BASE: '',
    document: { body: {style: {}}, addEventListener() {}, querySelectorAll: () => [], querySelector: element, getElementById: element },
  });
  vm.runInContext(script, ctx);
  return { run: code => vm.runInContext(code, ctx), element, ctx };
}

test('index and payload weather agree, including legacy dry and mixed', () => {
  const c = client();
  for (const condition of ['dry', 'wet', 'snow', 'mixed']) {
    assert.equal(c.run(`matchWeather({weather: '${condition}'})`), condition);
    assert.equal(c.run(`matchWeather({weather: {condition: '${condition}'}})`), condition);
  }
  assert.equal(c.run('matchWeather({})'), 'dry');
  assert.equal(c.run('matchWeather({weather: null})'), 'dry');
  assert.equal(c.run(`weatherLabel({weather: '<img src=x onerror=alert(1)>'})`), 'Dry');
  c.run(`allMatches = [
    {weather: 'dry', source: 'offline'}, {weather: 'wet', source: 'online'},
    {weather: 'snow', source: 'offline'}, {weather: 'mixed', source: 'online'}
  ]; activeWeather = 'wet';`);
  assert.equal(c.run('getFiltered().length'), 1);
  c.run(`activeSrc = 'offline';`);
  assert.equal(c.run('getFiltered().length'), 0);
  c.run(`activeWeather = 'all';`);
  assert.equal(c.run('getFiltered().length'), 2);
});

test('profile ranks derive from current career points even with stale rank fields', () => {
  const c = client();
  for (const [score, name] of [[0, 'Rookie Driver'], [49, 'Rookie Driver'], [50, 'Street Newbie'], [3200, 'Pro Racer'], [40000, 'Q3Rally Icon']]) {
    const html = c.run(`buildProfileHTML({playerScore:${score}, currentRank:0, rankName:'stale'})`);
    assert.ok(html.includes(`<span class="pc-rank-name">${name}</span>`));
    assert.ok(html.includes(`SCORE ${score}</span>`));
    assert.ok(!html.includes('stale'));
  }
  assert.ok(c.run(`buildProfileHTML({careerStats: {playerScore: 3200}, currentRank: 0})`).includes('Pro Racer'));
});

test('newest score supersedes historical peak and players are grouped by UUID', () => {
  const c = client();
  c.run(`allMatches = [
    {startTime: '2026-10-21T10:00:00Z', players:[{name:'New name',playerId:'a', playerScore:49}]},
    {startTime: '2026-10-20T10:00:00Z', players:[{name:'Old name',playerId:'a', playerScore:150}]}
  ];`);
  assert.equal(c.run('buildPlayerStats().length'), 1);
  assert.equal(c.run('buildPlayerStats()[0].playerScore'), 49);
  assert.equal(c.run('buildPlayerStats()[0].name'), 'New name');
});

test('weather renders in recent activity and full match details', async () => {
  const c = client();
  c.run(`allMatches = [{matchId:'wet-match', weather:'wet', players:[]}]; renderActivity();`);
  assert.ok(c.element('activity-feed').innerHTML.includes('Weather: Wet'));
  c.ctx.fetch = async () => ({ok: true, json: async () => ({weather:{condition:'snow'}, players:[]})});
  await c.run(`openMatch('snow-match')`);
  assert.ok(c.element('match-content').innerHTML.includes('Weather: Snow'));
});
