import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = readFileSync(new URL('../src/pages/ladder.astro', import.meta.url), 'utf8');
const script = page.match(/<script define:vars[^>]*>([\s\S]*?)<\/script>/)[1].split('const ladderReady = init();')[0];
function client(matches) {
  const elements = new Map();
  const make = () => ({
    innerHTML: '', textContent: '', hidden: false, style: {}, dataset: {}, children: [], handlers: {},
    classList: { add() {}, remove() {} }, setAttribute() {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
    querySelectorAll() { return []; }, appendChild(child) { this.children.push(child); },
  });
  const element = id => {
    if (!elements.has(id)) elements.set(id, make());
    return elements.get(id);
  };
  const ctx = vm.createContext({ API_BASE: 'https://example.test', IMG_BASE: '', records: matches,
    document: { body: {style: {}}, addEventListener() {}, querySelectorAll: () => [],
      querySelector: element, getElementById: element, createElement: make },
  });
  vm.runInContext(script, ctx);
  vm.runInContext("allMatches = records; activeMode = records[0]?.mode || '';", ctx);
  return { run: code => vm.runInContext(code, ctx), element, ctx,
    toggle(checked) { element('hide-bots').handlers.change({target: {checked}}); },
  };
}
const match = (players, extra = {}) => ({
  matchId: 'mixed', mode: 'GT_RACING', map: 'q3r_sundown', weather: 'dry',
  source: 'online', startTime: '2026-11-22T12:00:00Z', players, ...extra,
});
const human = {name: 'Human', bestLapMs: 90000, score: 10};
const bot = {name: 'Bot', isBot: true, bestLapMs: 10000, score: 100};

test('checkbox filters before best-record selection, top ten and header aggregation', () => {
  assert.match(page, /<input id="hide-bots" type="checkbox"\s*\/> Hide bots/);
  const c = client([
    match([{...bot, name: 'Shared'}, {...human, name: 'Shared'}, human,
      ...Array.from({length: 12}, (_, i) => ({...bot, name: `Bot ${i}`}))]),
    match([bot], {matchId: 'bots-only'}),
  ]);
  c.run('buildModeTabs(); renderLeaderboard();');
  assert.ok(c.element('lb-body').innerHTML.includes('bot-badge'));
  const original = c.run('JSON.stringify(allMatches)');
  c.toggle(true);
  const html = c.element('lb-body').innerHTML;
  assert.ok(html.includes('Shared') && html.includes('Human'));
  assert.ok(!html.includes('bot-badge'));
  assert.equal((html.match(/<tr /g) || []).length, 2);
  assert.equal(c.element('hs-matches').textContent, '1');
  assert.equal(c.element('hs-players').textContent, '2');
  assert.equal(c.run('JSON.stringify(allMatches)'), original);
  c.toggle(false);
  assert.ok(c.element('lb-body').innerHTML.includes('bot-badge'));
  assert.equal(c.element('hs-matches').textContent, '2');
});

test('source and weather combine with bot filtering and survive toggling', () => {
  const c = client([
    match([human]), match([bot], {weather:'wet'}),
    match([{...human, name:'Wet online'}], {weather:{condition:'wet'}}),
    match([{...human, name:'Wet offline'}], {weather:'wet', source:'offline'}),
  ]);
  c.run("activeSrc = 'online'; activeWeather = 'wet';");
  c.toggle(true);
  assert.equal(c.run('getFiltered().length'), 1);
  assert.ok(c.element('lb-body').innerHTML.includes('Wet online'));
  c.run("activeSrc = 'offline'; renderLeaderboard();");
  assert.ok(c.element('lb-body').innerHTML.includes('Wet offline'));
  c.toggle(false);
  assert.equal(c.run('getFiltered().length'), 1);
  assert.equal(c.run('activeSrc'), 'offline');
  assert.equal(c.run('activeWeather'), 'wet');
});

test('all leaderboard modes filter bots, preserving the human score or time', () => {
  const modes = ['GT_RACING','GT_RACING_DM','GT_SPRINT','GT_TEAM_RACING','GT_TEAM_RACING_DM',
    'GT_DEATHMATCH','GT_TEAM','GT_DERBY','GT_ELIMINATION','GT_LCS','GT_CTF','GT_CTF4',
    'GT_DOMINATION','GT_KOTH','GT_AUTOBALL','GT_GHOST','GT_SINGLE_PLAYER'];
  for (const mode of modes) {
    const c = client([match([bot, human], {mode})]);
    c.toggle(true);
    assert.ok(c.element('lb-body').innerHTML.includes('Human'), mode);
    assert.ok(!c.element('lb-body').innerHTML.includes('bot-badge'), mode);
  }
});

test('player rankings keep the actual winner calculation from the full roster', () => {
  const c = client([
    match([bot, human], {mode:'GT_DEATHMATCH'}),
    match([{...human, name:'Team human', team:1}, {...bot, team:2}],
      {mode:'GT_TEAM', winnerTeam:2}),
  ]);
  c.toggle(true);
  assert.equal(c.run('buildPlayerStats().length'), 2);
  assert.equal(c.run('buildPlayerStats().reduce((sum,p) => sum+p.wins,0)'), 0);
  assert.ok(!c.element('rankings-body').innerHTML.includes('bot-badge'));
  c.toggle(false);
  assert.ok(c.element('rankings-body').innerHTML.includes('bot-badge'));
});

test('bot-only history clears obsolete modes, maps, rows and activity; turning off restores them', () => {
  const c = client([match([bot])]);
  c.run('buildModeTabs(); renderLeaderboard();');
  assert.equal(c.element('lb-table').hidden, false);
  c.toggle(true);
  assert.equal(c.run('activeMode'), '');
  assert.equal(c.run('activeMap'), '');
  assert.equal(c.element('lb-table').hidden, true);
  for (const id of ['lb-body','map-select','map-levelshot']) assert.equal(c.element(id).innerHTML, '');
  assert.equal(c.element('hs-matches').textContent, '0');
  assert.ok(c.element('activity-feed').innerHTML.includes('No matches yet.'));
  c.toggle(false);
  assert.equal(c.run('activeMode'), 'GT_RACING');
  assert.equal(c.element('lb-table').hidden, false);
  assert.ok(c.element('activity-feed').innerHTML.includes('data-match-id="mixed"'));
});

test('legacy bot flags recognize false and zero as humans', () => {
  const c = client([]);
  for (const value of [false, 0, 'false', '0', 'human', 'off']) {
    c.ctx.flag = value;
    assert.equal(c.run('isBot({isBot:flag})'), false);
  }
  for (const value of [true, 1, 'true', '1', 'bot', 'yes']) {
    c.ctx.flag = value;
    assert.equal(c.run('isBot({isBot:flag})'), true);
  }
  assert.equal(c.run('isBot({stats:{is_bot:"1"}})'), true);
  assert.equal(c.run('isBot({})'), false);
});

test('Drag keeps its human-only records when toggling, match details keep bots', async () => {
  const finished = {name:'Drag human', isBot:'false', dragStatus:'finished',
    reactionMs:200, elapsedMs:10000, totalRaceMs:10200, trapSpeedKph:150};
  const c = client([match([finished, {...finished, name:'Drag bot', isBot:true}], {mode:'GT_DRAG'})]);
  for (const checked of [true, false]) {
    c.toggle(checked);
    assert.ok(c.element('lb-body').innerHTML.includes('Drag human'));
    assert.ok(!c.element('lb-body').innerHTML.includes('Drag bot'));
  }
  c.toggle(true);
  c.ctx.fetch = async () => ({ok:true, json: async () => match([human, bot])});
  await c.run("openMatch('mixed')");
  assert.ok(c.element('match-content').innerHTML.includes('Human'));
  assert.ok(c.element('match-content').innerHTML.includes('Bot'));
});
