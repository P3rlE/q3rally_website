<?php
// deploy.php — Sanity Webhook Empfänger mit Build-Queue
// Webhook-URL: https://www.q3rally.com/webhook/deploy.php

$log_file    = '/var/log/q3rally-deploy.log';
$pending     = '/tmp/q3rally-build.pending';
$queue_script = '/var/www/q3rally-site/webhook/build-queue.sh';

// Nur POST akzeptieren
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('Method Not Allowed');
}

// ── Sanity Signatur-Prüfung ────────────────────────────────
// Format: t=TIMESTAMP,v1=HMAC-SHA256(TIMESTAMP.BODY, SECRET)
$secret = getenv('SANITY_WEBHOOK_SECRET') ?: '';

if ($secret !== '') {
    $sig_header = $_SERVER['HTTP_SANITY_WEBHOOK_SIGNATURE'] ?? '';
    $body       = file_get_contents('php://input');

    if (!preg_match('/t=(\d+),v1=([a-zA-Z0-9_\-]+)/', $sig_header, $m)) {
        http_response_code(401);
        log_msg('UNAUTHORIZED — Signatur fehlt oder ungültig');
        exit('Unauthorized');
    }

    $ts        = $m[1];
    $received  = $m[2];
    $payload   = $ts . '.' . $body;
    $expected  = hash_hmac('sha256', $payload, $secret);

    // Timestamp darf max. 5 Minuten alt sein
    if (abs(time() - (int)$ts / 1000) > 300) {
        http_response_code(401);
        log_msg('UNAUTHORIZED — Timestamp zu alt');
        exit('Unauthorized');
    }

    if (!hash_equals($expected, $received)) {
        http_response_code(401);
        log_msg('UNAUTHORIZED — Signatur stimmt nicht');
        exit('Unauthorized');
    }
}

// ── Webhook-Request loggen ─────────────────────────────────
$doc_id = $_SERVER['HTTP_SANITY_DOCUMENT_ID'] ?? '?';
$op     = $_SERVER['HTTP_SANITY_OPERATION']   ?? '?';
log_msg("Request — op={$op} doc={$doc_id}");

// ── Queue-Mechanismus ──────────────────────────────────────
// Pending-Flag setzen: "ein Build ist gewünscht"
touch($pending);

// Build-Script im Hintergrund starten (ignoriert falls läuft)
// flock im Script stellt sicher dass nie zwei Builds gleichzeitig laufen
exec("bash {$queue_script} >> {$log_file} 2>&1 &");

// Sofort mit 200 antworten — Sanity wartet nicht auf den Build
// (build-queue.sh läuft als www-data, kein sudo nötig)
http_response_code(200);
echo json_encode(['ok' => true, 'status' => 'queued']);

// ── Helper ─────────────────────────────────────────────────
function log_msg(string $msg): void {
    global $log_file;
    $ts = date('Y-m-d H:i:s');
    file_put_contents($log_file, "[{$ts}] {$msg}\n", FILE_APPEND);
}
