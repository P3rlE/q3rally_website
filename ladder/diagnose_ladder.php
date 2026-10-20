<?php
/**
 * Q3Rally Ladder – Diagnose Script
 * diagnose_ladder.php
 *
 *   php diagnose_ladder.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(403); exit('CLI only.'); }

define('DATA_DIR',     __DIR__ . '/data');
define('PROFILES_DIR', __DIR__ . '/data/profiles');
define('INDEX_FILE',   __DIR__ . '/data/match_index.json');

echo "\n=== Q3Rally Ladder Diagnose ===\n\n";

// ── 1. Match-Index ────────────────────────────────────────────────────────
echo "── 1. MATCH INDEX ──────────────────────────────────\n";
if (!file_exists(INDEX_FILE)) {
    echo "  ERROR: match_index.json fehlt!\n";
} else {
    $raw = file_get_contents(INDEX_FILE);
    $idx = json_decode($raw ?: '', true);
    if (!is_array($idx)) {
        echo "  ERROR: match_index.json ist kein gültiges JSON\n";
    } else {
        echo "  Einträge: " . count($idx) . "\n";
        if (count($idx) > 0) {
            $last = end($idx);
            echo "  Letzter Match: " . ($last['matchId'] ?? '?') . "\n";
            echo "  Datum:         " . ($last['startTime'] ?? '?') . "\n";
            echo "  Mode:          " . ($last['mode'] ?? '?') . "\n";
            echo "  Spieler:       " . implode(', ', array_column($last['players'] ?? [], 'name')) . "\n";
        }
    }
}
echo "\n";

// ── 2. Rohe Match-Dateien ─────────────────────────────────────────────────
echo "── 2. MATCH DATEIEN (data/*.json) ──────────────────\n";
$skip = ['match_index.json','version.json','server_keys.json'];
$matchFiles = array_filter(
    glob(DATA_DIR . '/*.json') ?: [],
    fn($f) => !in_array(basename($f), $skip, true) && strncmp(basename($f), 'rl_', 3) !== 0
);
echo "  Anzahl: " . count($matchFiles) . "\n";
if (count($matchFiles) > 0) {
    // Show newest 3
    usort($matchFiles, fn($a,$b) => filemtime($b) <=> filemtime($a));
    echo "  Neueste:\n";
    foreach (array_slice($matchFiles, 0, 3) as $f) {
        $d = json_decode(file_get_contents($f) ?: '', true);
        $players = array_column(array_filter($d['players'] ?? [], fn($p) => empty($p['isBot'])), 'cleanName');
        echo "    " . basename($f) . "  mode=" . ($d['mode'] ?? '?') . "  players=[" . implode(',', $players) . "]\n";
        // Check if profile snapshot is present and valid
        foreach ($d['players'] ?? [] as $p) {
            if (!empty($p['isBot'])) continue;
            $hasSnap = isset($p['profile']) && is_array($p['profile']);
            $validSnap = $hasSnap && !empty($p['profile']['valid']);
            $playerId = $p['playerId'] ?? '';
            $isUuid = (bool)preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $playerId);
            echo "      player=" . ($p['cleanName'] ?? $p['name'] ?? '?')
                . "  playerId=" . ($playerId ?: '(leer)')
                . "  uuid=" . ($isUuid ? 'JA' : 'NEIN')
                . "  snapshot=" . ($hasSnap ? 'vorhanden' : 'fehlt')
                . "  valid=" . ($validSnap ? 'JA' : 'NEIN')
                . "\n";
        }
    }
}
echo "\n";

// ── 3. Profile-Dateien ────────────────────────────────────────────────────
echo "── 3. PROFILE DATEIEN (data/profiles/) ─────────────\n";
$profileFiles = glob(PROFILES_DIR . '/*.json') ?: [];
echo "  Anzahl: " . count($profileFiles) . "\n";
foreach ($profileFiles as $f) {
    $p = json_decode(file_get_contents($f) ?: '', true);
    if (!is_array($p)) { echo "  UNGÜLTIG: " . basename($f) . "\n"; continue; }
    echo "  " . ($p['cleanName'] ?? '?')
        . "  score=" . ($p['playerScore'] ?? '?')
        . "  rank=" . ($p['currentRank'] ?? '?')
        . "  wins=" . ($p['wins'] ?? '?')
        . "  games=" . ($p['gamesPlayed'] ?? '?')
        . "  kills=" . ($p['kills'] ?? '?')
        . "  dist=" . ($p['distanceKm'] ?? '?')
        . "  speed=" . ($p['topSpeedKph'] ?? '?')
        . "\n";
}
echo "\n";

// ── 4. API-Schlüssel ──────────────────────────────────────────────────────
echo "── 4. SERVER KEYS ───────────────────────────────────\n";
$keysFile = DATA_DIR . '/server_keys.json';
if (file_exists($keysFile)) {
    $keys = json_decode(file_get_contents($keysFile) ?: '', true);
    echo "  Anzahl Schlüssel: " . count((array)$keys) . "\n";
} else {
    echo "  server_keys.json nicht gefunden\n";
}
echo "\n";

echo "=== Ende ===\n\n";
