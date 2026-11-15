import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = readFileSync(new URL('../src/pages/ladder.astro', import.meta.url), 'utf8');
const script = page.match(/<script define:vars[^>]*>([\s\S]*?)<\/script>/)[1].split('const ladderReady = init();')[0];
function client() {
  const elements = new Map();
  const make = () => ({
    innerHTML: '', textContent: '', hidden: false, style: {}, children: [],
    classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {},
    querySelectorAll() { return []; }, appendChild(child) { this.children.push(child); },
  });
  const element = id => {
    if (!elements.has(id)) elements.set(id, make());
    return elements.get(id);
  };
  const ctx = vm.createContext({ API_BASE: 'https://example.test', IMG_BASE: '',
    document: { body: {style: {}}, addEventListener() {}, querySelectorAll: () => [],
      querySelector: element, getElementById: element, createElement: make },
  });
  vm.runInContext(script, ctx);
  return { run: code => vm.runInContext(code, ctx), element, ctx,
    matches(value) { ctx.records = value; vm.runInContext("allMatches = records; activeMode = 'GT_DRAG'; activeMap = 'q3r_dragstrip';", ctx); },
  };
}
function player(name, id, reactionMs = 200, elapsedMs = 13000, extra = {}) {
  return {name, playerId: id, dragStatus: 'finished', reactionMs, elapsedMs,
    totalRaceMs: reactionMs + elapsedMs, trapSpeedKph: 151.2, score: 0, vehicle: 'cobra', ...extra};
}
function match(players, extra = {}) {
  return {matchId: 'drag-1', mode: 'GT_DRAG', map: 'q3r_dragstrip', source: 'offline',
    weather: 'dry', startTime: '2026-11-15T20:38:00Z', players, ...extra};
}

test('Drag is a time mode with a named label and numeric mode 9', () => {
  const c = client();
  for (const mode of ['GT_DRAG', 'drag', 'Drag Race', '9', 9]) {
    assert.equal(c.run(`canonMode(${JSON.stringify(mode)})`), 'GT_DRAG');
  }
  assert.equal(c.run("modeLabel('GT_DRAG')"), 'Drag Race');
});

test('the website leaderboard ranks TOTAL ascending and shows the matching RT / ET / speed', () => {
  const c = client();
  c.matches([match([
    player('Quicker ET', 'a', 1000, 12500, {score: 9999, bestLapMs: 1}),
    player('Quicker TOTAL', 'b', 0, 13000, {score: 0}),
    player('False start', 'c', 0, 0, {dragStatus: 'false_start', totalRaceMs: 0}),
    player('DNF', 'd', 0, 0, {dragStatus: 'dnf', totalRaceMs: 0}),
    player('Broken total', 'e', 100, 10000, {totalRaceMs: 1}),
  ])]);
  c.run('renderLeaderboard()');
  const html = c.element('lb-body').innerHTML;
  assert.ok(html.indexOf('Quicker TOTAL') < html.indexOf('Quicker ET'));
  assert.ok(html.includes('13.000') && html.includes('13.500'));
  assert.ok(html.includes('0.000') && html.includes('151.2'));
  assert.ok(!html.includes('False start') && !html.includes('DNF') && !html.includes('Broken total'));
  assert.match(c.element('lb-col3').textContent, /TOTAL/);
  for (const id of ['lb-drag-reaction', 'lb-drag-elapsed', 'lb-drag-trap']) assert.equal(c.element(id).hidden, false);
});

test('fastest attempt stays intact, renamed drivers merge by UUID and ties share rank', () => {
  const c = client();
  c.matches([
    match([player('Old name', 'a', 0, 14000, {trapSpeedKph: 160})]),
    match([player('New name', 'a', 300, 12700, {trapSpeedKph: 150})]),
    match([player('New name', 'b', 400, 12600, {trapSpeedKph: 149})]),
  ]);
  c.run('renderLeaderboard()');
  const html = c.element('lb-body').innerHTML;
  assert.equal((html.match(/class="td-rank">1</g) || []).length, 2);
  assert.ok(!html.includes('Old name'));
  assert.ok(html.includes('0.300') && html.includes('12.700') && html.includes('150.0'));
  assert.ok(!html.includes('160.0') && !html.includes('14.000'));
  assert.ok(html.includes('data-player-id="a"') && html.includes('data-player-id="b"'));
});

test('Drag obeys source and weather filters, ordinary racing retains BEST LAP', () => {
  const c = client();
  c.matches([
    match([player('Dry offline', 'a')]),
    match([player('Wet online', 'b', 0, 9000)], {weather: 'wet', source: 'online'}),
  ]);
  c.run("activeSrc = 'offline'; activeWeather = 'dry'; renderLeaderboard()");
  assert.ok(c.element('lb-body').innerHTML.includes('Dry offline'));
  assert.ok(!c.element('lb-body').innerHTML.includes('Wet online'));
  c.matches([match([player('Lap driver', 'a', 0, 13000, {bestLapMs: 90000})], {mode: 'GT_RACING'})]);
  c.run("activeMode = 'GT_RACING'; renderLeaderboard()");
  assert.equal(c.element('lb-col3').textContent, 'BEST LAP');
  for (const id of ['lb-drag-reaction', 'lb-drag-elapsed', 'lb-drag-trap']) assert.equal(c.element(id).hidden, true);
});

test('an invalid-only Drag map clears previous rows instead of showing score zero', () => {
  const c = client();
  c.matches([match([player('Earlier valid finish', 'a')])]);
  c.run('renderLeaderboard()');
  assert.ok(c.element('lb-body').innerHTML.includes('Earlier valid finish'));
  c.matches([match([player('Invalid', 'a', 0, 0, {dragStatus: 'dnf', totalRaceMs: 0})])]);
  c.run('renderLeaderboard()');
  assert.equal(c.element('lb-table').hidden, true);
  assert.equal(c.element('lb-body').innerHTML, '');
  assert.match(c.element('lb-status').textContent, /No valid finishes/);
});

test('solo, ties and invalid Drag results never invent wins or pollute lap records', () => {
  const c = client();
  const solo = match([player('Solo', 'a')], {winner: 'Solo'});
  const tie = match([player('Tied A', 'b'), player('Tied B', 'c')], {winner: 'Tied A'});
  const invalid = match([player('Invalid', 'd', 0, 0, {dragStatus: 'dnf', totalRaceMs: 0})]);
  for (const value of [solo, tie, invalid]) {
    c.ctx.record = value;
    assert.equal(c.run('getWinner(record)'), null);
  }
  c.matches([solo, tie, invalid]);
  assert.equal(c.run('buildPlayerStats().reduce((n,p) => n+p.wins,0)'), 0);
  assert.equal(c.run('buildPlayerStats().reduce((n,p) => n+p.bestLapMs,0)'), 0);
  c.matches([match([player('Wins by total', 'a', 200, 13000), player('Loses despite ET', 'b', 1000, 12500)])]);
  assert.equal(c.run('getWinner(allMatches[0])'), 'Wins by total');
  assert.equal(c.run("buildPlayerStats().find(p => p.playerId === 'a').wins"), 1);
});

test('Drag match details show result times and status instead of score / combat stats', async () => {
  const c = client();
  const value = match([player('Finished', 'a', 0, 13000),
    player('Faulted', 'b', 0, 0, {dragStatus: 'false_start', totalRaceMs: 0})]);
  c.ctx.fetch = async () => ({ok: true, json: async () => value});
  await c.run("openMatch('drag-1')");
  const html = c.element('match-content').innerHTML;
  assert.match(html, /TOTAL/);
  assert.ok(html.includes('RT') && html.includes('ET') && html.includes('0.000') && html.includes('13.000'));
  assert.match(html, /false.?start/i);
  assert.ok(!html.includes('<th>SCORE</th>') && !html.includes('<th>K</th>'));
  assert.ok(html.indexOf('Finished') < html.indexOf('Faulted'));
});

test('flat Drag profile fields retain a perfect reaction and a separate best TOTAL', () => {
  const c = client();
  const html = c.run('buildProfileHTML({dragWins: 1, dragCompleted: 2, dragBestMs: 13000, dragBestReactionMs: 0, dragBestElapsedMs: 12800})');
  assert.ok(html.includes('Drag Race') && html.includes('Best TOTAL'));
  assert.ok(html.includes('13.000') && html.includes('0.000') && html.includes('12.800'));
});
