<?php
/**
 * Q3Rally Ladder – Data Flush Script
 * flush_ladder.php
 *
 * Deletes all match files, all player profiles, and resets match_index.json.
 * API keys and server keys are preserved.
 *
 * Run from command line ONLY:
 *   php flush_ladder.php
 *
 * Add --confirm to skip the interactive prompt:
 *   php flush_ladder.php --confirm
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Run from command line only.');
}

define('DATA_DIR',     __DIR__ . '/data');
define('PROFILES_DIR', __DIR__ . '/data/profiles');
define('INDEX_FILE',   __DIR__ . '/data/match_index.json');

$confirm = in_array('--confirm', $argv ?? [], true);

echo "\n";
echo "╔══════════════════════════════════════════════════╗\n";
echo "║     Q3Rally Ladder – FULL DATA FLUSH             ║\n";
echo "╚══════════════════════════════════════════════════╝\n\n";

// Count what will be deleted
$matchFiles   = glob(DATA_DIR . '/*.json') ?: [];
$skipFiles    = ['match_index.json', 'version.json', 'server_keys.json'];
$matchFiles   = array_filter($matchFiles, fn($f) =>
    !in_array(basename($f), $skipFiles, true) &&
    strncmp(basename($f), 'rl_', 3) !== 0
);
$profileFiles = glob(PROFILES_DIR . '/*.json') ?: [];

echo "Will delete:\n";
echo "  Match files    : " . count($matchFiles) . "\n";
echo "  Profile files  : " . count($profileFiles) . "\n";
echo "  match_index    : yes (reset to [])\n";
echo "\n";
echo "Will preserve:\n";
echo "  server_keys.json, version.json, rate-limit files\n";
echo "\n";

if (!$confirm) {
    echo "Type 'yes' to proceed, anything else to cancel: ";
    $input = trim(fgets(STDIN) ?: '');
    if ($input !== 'yes') {
        echo "Aborted.\n\n";
        exit(0);
    }
}

$deleted = 0;
$errors  = 0;

echo "\nDeleting match files...\n";
foreach ($matchFiles as $file) {
    if (unlink($file)) {
        $deleted++;
    } else {
        echo "  ERROR: could not delete " . basename($file) . "\n";
        $errors++;
    }
}
echo "  Deleted: $deleted match files\n";

echo "\nDeleting profile files...\n";
$profilesDeleted = 0;
foreach ($profileFiles as $file) {
    if (unlink($file)) {
        $profilesDeleted++;
    } else {
        echo "  ERROR: could not delete " . basename($file) . "\n";
        $errors++;
    }
}
echo "  Deleted: $profilesDeleted profile files\n";

echo "\nResetting match_index.json...\n";
if (file_put_contents(INDEX_FILE, '[]', LOCK_EX) !== false) {
    echo "  Done.\n";
} else {
    echo "  ERROR: could not write match_index.json\n";
    $errors++;
}

echo "\n" . str_repeat('─', 50) . "\n";
echo "Match files deleted  : $deleted\n";
echo "Profile files deleted: $profilesDeleted\n";
echo "Errors               : $errors\n";
echo str_repeat('─', 50) . "\n";

if ($errors === 0) {
    echo "\nDone. Ladder is clean. Ready for fresh data.\n\n";
} else {
    echo "\nCompleted with errors. Check permissions.\n\n";
    exit(1);
}
