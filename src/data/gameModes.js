// Editorial summaries of https://github.com/Q3Rally-Team/q3rally/wiki/Game-Modes
// Keep numeric IDs aligned with g_gametype (v0.7c and newer).
export const gameModes = [
  {gametype: 0, name: 'Racing', category: 'race', description: 'Classic lap racing without weapons. Race progress is everything; frags do not affect the result.', objective: 'Finish the race in the best time.'},
  {gametype: 1, name: 'Racing DM', category: 'race', description: 'Lap racing with weapons. Every frag takes 500 milliseconds off your recorded finish time.', objective: 'Win with the best adjusted finish time.'},
  {gametype: 2, name: 'Single Player', category: 'race', description: 'A solo time trial with the lap count set by g_timeTrialLaps. Local play only; unavailable on dedicated servers.', objective: 'Set your best time.'},
  {gametype: 5, name: 'Elimination', category: 'race', description: 'Each lap, the last driver still on that lap is eliminated once everyone else has completed it. Weapons are off unless g_eliminationWeapons is enabled.', objective: 'Be the last driver remaining.'},
  {gametype: 7, name: 'Sprint', category: 'race', description: 'A single point-to-point race from start to finish. Requires a sprint map with rally_start and rally_finish.', objective: 'Reach the finish first.'},
  {gametype: 8, name: 'Ghost Race', category: 'race', development: true, description: 'Race against a ghost without AI drivers. Cars do not collide with each other.', objective: 'Beat the ghost and improve your lap times.'},
  {gametype: 3, name: 'Demolition Derby', category: 'combat', description: 'Ram opponents and survive the arena. No weapons: the last car still running wins.', objective: 'Be the last car alive.', note: 'Development build: ramming replenishes fuel. Without a hit for 45 seconds your car explodes, with a warning 10 seconds beforehand.'},
  {gametype: 4, name: 'Last Car Standing', category: 'combat', description: 'Survival without respawns. The round ends as soon as only one car remains.', objective: 'Outlast every opponent.'},
  {gametype: 6, name: 'Deathmatch', category: 'combat', description: 'Free-for-all vehicle combat. Kills score +1 and suicides −1. Play ends at the frag or time limit.', objective: 'Score the most frags.'},
  {gametype: 16, name: 'Team Deathmatch', category: 'team', description: 'Deathmatch with team scoring. Each team’s score is the sum of its players’ frags.', objective: 'Earn the highest team frag score.'},
  {gametype: 17, name: 'Team Racing', category: 'team', description: 'Pure racing with teams ranked by their combined finish times. Frags do not count.', objective: 'Achieve the best combined team time.'},
  {gametype: 18, name: 'Team Racing DM', category: 'team', description: 'Team racing with weapons. Each frag earns a 500-millisecond time bonus.', objective: 'Win with the best adjusted team time.'},
  {gametype: 19, name: 'Capture the Flag', category: 'team', description: 'Two teams compete for flags. A capture scores +5, returning a flag +1 and killing the enemy flag carrier +2.', objective: 'Capture the enemy flag and defend your own.'},
  {gametype: 20, name: 'CTF4', category: 'team', description: 'Four-team Capture the Flag with red, blue, green and yellow teams, coloured HUD messages and team-specific announcer cues.', objective: 'Outscore three rival teams in flag captures.'},
  {gametype: 21, name: 'Domination', category: 'team', description: 'Capture and hold control points called sigils. Each held point scores at g_dominationScoreInterval, every 10 seconds by default.', objective: 'Control the map to build your team’s score.'},
  {gametype: 22, name: 'King of the Hill', category: 'team', description: 'Hold the hill uncontested for points. Captures and retaking control award bonuses; players respawn in waves. Tied matches can enter overtime.', objective: 'Reach the score limit by controlling the hill.'},
  {gametype: 23, name: 'Autoball', category: 'team', development: true, description: 'Car football with turbo, high-speed demolitions and golden goal on a tie. Weapons are off by default. Mutators can change ball count, size and gravity.', objective: 'Drive the ball into the other team’s goal.'},
];

// After the one-time import, published Sanity documents are the source of truth.
// Missing/deleted documents must not be recreated from the editorial seed above.
export function mergeGameModes(documents = []) {
  const modes = new Map();
  for (const document of documents) {
    if (!Number.isInteger(document.gametype) || document.gametype < 0
      || typeof document.name !== 'string' || !document.name.trim()
      || !['race', 'combat', 'team'].includes(document.category)) continue;
    modes.set(document.gametype, {
      ...document,
      description: document.description ?? '',
      objective: document.objective ?? '',
      note: document.note ?? '',
      image: document.image ?? null,
      development: document.development === true,
      orderRank: Number.isFinite(document.orderRank) ? document.orderRank : document.gametype,
    });
  }
  return Array.from(modes.values()).sort((a, b) => a.orderRank - b.orderRank);
}
