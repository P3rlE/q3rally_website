<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

if ($argc !== 2 || !is_dir($argv[1]) || !is_writable($argv[1])) {
    fwrite(STDERR, "Usage: php init-db.php <existing writable private directory>\n");
    exit(1);
}

$path = rtrim($argv[1], DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'profiles.sqlite';
umask(0077);
$db = new PDO('sqlite:' . $path, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('PRAGMA busy_timeout = 5000');
$db->exec('PRAGMA foreign_keys = ON');
$db->exec('BEGIN IMMEDIATE');

try {
    $version = (int) $db->query('PRAGMA user_version')->fetchColumn();
    if ($version === 0) {
        $schema = file_get_contents(__DIR__ . '/schema.sql');
        if ($schema === false) {
            throw new RuntimeException('Could not read schema.sql');
        }
        $db->exec($schema);
        $db->exec('PRAGMA user_version = 1');
        $version = 1;
    }
    if ($version === 1) {
        $db->exec(file_get_contents(__DIR__ . '/schema-v2.sql'));
        $db->exec('PRAGMA user_version = 2');
        $version = 2;
    }
    if ($version === 2) {
        $db->exec(file_get_contents(__DIR__ . '/schema-v3.sql'));
        $db->exec('PRAGMA user_version = 3');
    } elseif ($version !== 3) {
        throw new RuntimeException("Unsupported schema version: $version");
    }
    $db->exec('COMMIT');
} catch (Throwable $error) {
    $db->exec('ROLLBACK');
    fwrite(STDERR, $error->getMessage() . PHP_EOL);
    exit(1);
}

echo "Profile database ready.\n";
