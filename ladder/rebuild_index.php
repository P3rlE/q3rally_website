<?php
/**
 * Q3Rally Ladder – Index Rebuild Script
 * rebuild_index.php
 *
 * Run ONCE from the command line to build match_index.json
 * from all existing individual match files:
 *
 *   php rebuild_index.php
 *
 * This only needs to be run once after uploading the new index.php.
 * After that, the index is maintained automatically on every upload.
 *
 * Progress is printed to stdout. Safe to re-run – rebuilds from scratch.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Run from command line only.');
}

define('DATA_DIR',          __DIR__ . '/data');
define('PROFILES_DIR',      __DIR__ . '/data/profiles');
define('INDEX_FILE',        __DIR__ . '/data/match_index.json');
define('LADDER_RATE_FILE_PREFIX', 'rl_');

// ── Team-score winner helper (mirrors profile_pick_winner_team_by_scores) ────────
function pick_winner_team_rb(array $teamScores): ?string
{
    $top = null; $topScore = null; $isTie = false;
    foreach ($teamScores as $team => $score) {
        if ($topScore === null || $score > $topScore) {
            $topScore = $score; $top = $team; $isTie = false;
        } elseif ($score === $topScore) {
            $isTie = true;
        }
    }
    return ($top === null || $isTie) ? null : $top;
}

function normalize_team_label_rb($team): string
{
    if ($team === null) return '';
    $map = [1 => 'red', 2 => 'blue', 3 => 'yellow', 4 => 'green',
            'red' => 'red', 'blue' => 'blue', 'yellow' => 'yellow', 'green' => 'green'];
    $k = is_int($team) ? $team : strtolower((string)$team);
    return $map[$k] ?? '';
}

// ── Winner detection (mirrors index_derive_winner in index.php) ──────────────
function derive_winner_rb(array $payload, string $mode): array
{
    $teamModes = ['GT_TEAM', 'GT_TEAM_RACING', 'GT_TEAM_RACING_DM',
                  'GT_CTF', 'GT_CTF4', 'GT_DOMINATION', 'GT_KOTH'];
    $isTeamMode = in_array($mode, $teamModes, true);

    $winnerClientNum = -1; $hasWinnerClientNum = false;
    foreach ([$payload, $payload['settings'] ?? []] as $src) {
        if (!is_array($src)) continue;
        if (array_key_exists('winnerClientNum', $src) && is_numeric($src['winnerClientNum'])) {
            $winnerClientNum = (int)$src['winnerClientNum'];
            $hasWinnerClientNum = $winnerClientNum >= 0;
            break;
        }
    }

    $clientToName = []; $clientToTeam = [];
    foreach ((array)($payload['players'] ?? []) as $cp) {
        if (!is_array($cp)) continue;
        $cn = (int)($cp['clientNum'] ?? -1);
        if ($cn >= 0) {
            $clientToName[$cn] = (string)($cp['cleanName'] ?? $cp['name'] ?? '');
            $clientToTeam[$cn] = (int)($cp['team'] ?? 0);
        }
    }

    if (!$isTeamMode) {
        if (!$hasWinnerClientNum) {
            foreach ((array)($payload['players'] ?? []) as $cp) {
                if (!is_array($cp) || !empty($cp['isBot'])) continue;
                if ((int)($cp['position'] ?? 0) === 1) {
                    $winnerClientNum = (int)($cp['clientNum'] ?? -1);
                    $hasWinnerClientNum = $winnerClientNum >= 0;
                    break;
                }
            }
        }
        $name = ($hasWinnerClientNum && isset($clientToName[$winnerClientNum]))
            ? $clientToName[$winnerClientNum] : '';
        return ['winner' => $name, 'winnerTeam' => 0];
    }

    $teamScores = [];
    if (isset($payload['teamScores']) && is_array($payload['teamScores'])) {
        foreach ($payload['teamScores'] as $k => $v) {
            if (is_numeric($v)) { $tl = normalize_team_label_rb($k); if ($tl !== '') $teamScores[$tl] = (float)$v; }
        }
    }
    foreach (['red','blue','green','yellow'] as $t) {
        if (isset($payload[$t.'Score']) && is_numeric($payload[$t.'Score'])) $teamScores[$t] = (float)$payload[$t.'Score'];
    }

    $winnerTeamInt = 0;
    if ($hasWinnerClientNum && isset($clientToTeam[$winnerClientNum])) {
        $winnerTeamInt = $clientToTeam[$winnerClientNum];
    } elseif ($teamScores) {
        $wt = pick_winner_team_rb($teamScores);
        if ($wt !== null) {
            foreach ((array)($payload['players'] ?? []) as $cp) {
                if (!is_array($cp)) continue;
                if (normalize_team_label_rb($cp['team'] ?? null) === $wt) {
                    $winnerTeamInt = (int)($cp['team'] ?? 0); break;
                }
            }
        }
    }
    return ['winner' => '', 'winnerTeam' => $winnerTeamInt];
}

// ── Profile helpers (same logic as index.php) ─────────────────────────────────
function profile_path_rb(string $playerId): string
{
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $playerId);
    return PROFILES_DIR . '/' . $safe . '.json';
}

function profile_load_rb(string $playerId): ?array
{
    $path = profile_path_rb($playerId);
    if (!is_file($path)) return null;
    $raw = file_get_contents($path);
    if ($raw === false) return null;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

// ── Player extraction (mirrors index_extract_entry in index.php) ──────────────
function extract_player_rb(array $p): array
{
    $playerId = (string)($p['playerId'] ?? '');
    $stored   = ($playerId !== '') ? profile_load_rb($playerId) : null;

    // vehicle: match field → model → inline profile → stored profile
    $vehicle = (string)($p['vehicle'] ?? $p['car'] ?? $p['vehicleModel'] ?? '');
    if ($vehicle === '') {
        $model = (string)($p['model'] ?? '');
        if ($model !== '') $vehicle = explode('/', $model)[0];
    }
    if ($vehicle === '') $vehicle = (string)($p['profile']['mostUsedVehicle'] ?? '');
    if ($vehicle === '' && $stored)
        $vehicle = (string)($stored['vehicle'] ?? $stored['mostUsedVehicle'] ?? '');

    // achievementTiers: inline profile → stored profile
    $tiers = [];
    if (isset($p['profile']['achievementTiers']) && is_array($p['profile']['achievementTiers'])) {
        $tiers = array_map('intval', $p['profile']['achievementTiers']);
    } elseif ($stored && isset($stored['achievementTiers']) && is_array($stored['achievementTiers'])) {
        $tiers = array_map('intval', $stored['achievementTiers']);
    }

    // playerScore: inline profile → stored profile
    $playerScore = 0;
    if (isset($p['profile']['playerScore'])) {
        $playerScore = (int)$p['profile']['playerScore'];
    } elseif ($stored && isset($stored['playerScore'])) {
        $playerScore = (int)$stored['playerScore'];
    }

    return [
        'name'             => (string)($p['cleanName'] ?? $p['name'] ?? $p['displayName'] ?? ''),
        'playerId'         => (string)($p['playerId'] ?? ''),
        'score'            => (int)($p['score'] ?? $p['rawScore'] ?? 0),
        'playerScore'      => $playerScore,
        'vehicle'          => $vehicle,
        'achievementTiers' => $tiers,
        'bestLapMs'        => (int)($p['bestLapMs'] ?? 0),
        'totalRaceMs'      => (int)($p['totalRaceMs'] ?? 0),
        'kills'            => (int)($p['kills'] ?? 0),
        'deaths'           => (int)($p['deaths'] ?? 0),
        'position'         => (int)($p['position'] ?? 0),
        'isBot'            => (bool)($p['isBot'] ?? false),
        'team'             => (int)($p['team'] ?? 0),
        'captures'         => (int)($p['captures'] ?? 0),
        'damageDealt'      => (int)($p['damageDealt'] ?? 0),
    ];
}

// ── Main ──────────────────────────────────────────────────────────────────────
$files = glob(DATA_DIR . '/*.json');
if (!is_array($files)) {
    echo "ERROR: Could not read data directory.\n";
    exit(1);
}

$skip = ['match_index.json', 'version.json', 'server_keys.json'];

$total   = 0;
$skipped = 0;
$errors  = 0;
$entries = [];
$start   = microtime(true);

echo "Q3Rally Ladder – Index Rebuild\n";
echo str_repeat('─', 50) . "\n";
echo "Data dir: " . DATA_DIR . "\n";
echo "Files found: " . count($files) . "\n\n";

foreach ($files as $file) {
    $basename = basename($file);

    if (in_array($basename, $skip, true)) { $skipped++; continue; }
    if (strncmp($basename, LADDER_RATE_FILE_PREFIX, strlen(LADDER_RATE_FILE_PREFIX)) === 0) { $skipped++; continue; }

    $raw = file_get_contents($file);
    if ($raw === false) { echo "  SKIP (unreadable): $basename\n"; $errors++; continue; }

    $payload = json_decode($raw, true);
    if (!is_array($payload)) { echo "  SKIP (invalid JSON): $basename\n"; $errors++; continue; }

    $dedicated = $payload['server']['dedicated'] ?? null;
    $source    = ($dedicated === true || $dedicated === 1 || $dedicated === '1')
        ? 'online' : ($payload['source'] ?? 'offline');
    $mode = strtoupper(trim((string)($payload['mode'] ?? '')));
    if ($mode !== '' && strpos($mode, 'GT_') !== 0) $mode = 'GT_' . $mode;

    $winnerInfo = derive_winner_rb($payload, $mode);

    $players = [];
    foreach ((array)($payload['players'] ?? []) as $p) {
        if (!is_array($p)) continue;
        $players[] = extract_player_rb($p);
    }

    $entries[] = [
        'matchId'     => (string)($payload['matchId'] ?? ''),
        'mode'        => $mode ?: (string)($payload['mode'] ?? ''),
        'gametype'    => (int)($payload['gametype'] ?? 0),
        'map'         => (string)($payload['map'] ?? ''),
        'startTime'   => (string)($payload['startTime'] ?? $payload['startTimeIso'] ?? ''),
        'source'      => $source,
        'serverName'  => (string)($payload['server']['name'] ?? ''),
        'playerCount' => (int)($payload['playerCount'] ?? count($players)),
        'winner'      => $winnerInfo['winner'],
        'winnerTeam'  => $winnerInfo['winnerTeam'],
        'players'     => $players,
    ];

    $total++;

    if ($total % 1000 === 0) {
        $elapsed = round(microtime(true) - $start, 1);
        echo "  Processed: $total ({$elapsed}s)...\n";
    }
}

echo "\nWriting index... ";
$json = json_encode($entries, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if ($json === false || file_put_contents(INDEX_FILE, $json, LOCK_EX) === false) {
    echo "ERROR: Could not write index file.\n";
    exit(1);
}

$elapsed = round(microtime(true) - $start, 2);
$sizeMb  = round(filesize(INDEX_FILE) / 1024 / 1024, 2);

echo "done.\n\n";
echo str_repeat('─', 50) . "\n";
echo "Matches indexed : $total\n";
echo "Skipped         : $skipped\n";
echo "Errors          : $errors\n";
echo "Index size      : {$sizeMb} MB\n";
echo "Time            : {$elapsed}s\n";
echo str_repeat('─', 50) . "\n";
echo "Index written to: " . INDEX_FILE . "\n\n";
echo "Done! The index will be maintained automatically from now on.\n";
