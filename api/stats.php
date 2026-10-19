<?php
// stats.php — Umami Cloud API Proxy
// Liegt auf dem Server unter: /var/www/html/api/stats.php
// Aufgerufen von: index.astro → fetch('/api/stats.php')

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=60'); // 60s Browser-Cache

require_once __DIR__ . '/config.php';

$apiKey    = UMAMI_API_KEY;
$websiteId = UMAMI_WEBSITE_ID;

if (!$apiKey || $apiKey === 'DEIN_API_KEY_HIER_EINTRAGEN') {
    http_response_code(503);
    echo json_encode(['error' => 'API key not configured']);
    exit;
}

/**
 * GET-Request gegen die Umami Cloud API
 */
function umami_get(string $path, string $apiKey): ?array {
    $ctx = stream_context_create(['http' => [
        'method'  => 'GET',
        'header'  => "Authorization: Bearer {$apiKey}\r\nAccept: application/json\r\n",
        'timeout' => 5,
        'ignore_errors' => true,
    ]]);
    $resp = @file_get_contents("https://api.umami.is/v1{$path}", false, $ctx);
    return $resp ? json_decode($resp, true) : null;
}

$nowMs       = (int)(microtime(true) * 1000);
$epochMs     = 1577836800000; // 2020-01-01 — Startpunkt für "alle Zeit"
$todayMs     = strtotime('today') * 1000;

// Alle-Zeit-Stats (Gesamt-Besucher)
$allTime = umami_get("/websites/{$websiteId}/stats?startAt={$epochMs}&endAt={$nowMs}", $apiKey);

// Heutige Stats
$today   = umami_get("/websites/{$websiteId}/stats?startAt={$todayMs}&endAt={$nowMs}", $apiKey);

// Aktive Besucher (letzte 5 Minuten)
$active  = umami_get("/websites/{$websiteId}/active", $apiKey);

$visitors  = $allTime['visitors']  ?? null;
$pageviews = $allTime['pageviews'] ?? null;

// Download-Events via /metrics?type=event — gibt [{x: eventName, y: count}, ...]
$metrics   = umami_get("/websites/{$websiteId}/metrics?startAt={$epochMs}&endAt={$nowMs}&type=event", $apiKey);
$downloads = null;
if ($metrics && is_array($metrics)) {
    foreach ($metrics as $m) {
        if (($m['x'] ?? '') === 'download') {
            $downloads = (int)($m['y'] ?? 0);
            break;
        }
    }
}

echo json_encode([
    'online'    => $active['visitors']  ?? null,
    'visitors'  => $visitors  !== null ? $visitors  + VISITORS_OFFSET : null,
    'pageviews' => $pageviews ?? null,
    'downloads' => $downloads,
    'today'     => $today['visitors']   ?? null,
]);
