<?php
// First-party counters. State must stay outside Apache's DocumentRoot and aliases.
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(int $status, string $message): void {
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    fail(405, 'Method not allowed');
}
$event = null;
$id = null;
if ($method === 'POST') {
    $origin = parse_url($_SERVER['HTTP_ORIGIN'] ?? '');
    $host = parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''));
    if (!$origin || !isset($origin['host']) || !in_array($origin['scheme'] ?? '', ['http', 'https'], true)
        || strtolower($origin['host']) !== strtolower($host['host'] ?? '')
        || ($origin['port'] ?? (($origin['scheme'] ?? '') === 'https' ? 443 : 80))
            !== ($host['port'] ?? (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 443 : 80))) {
        // TLS may terminate at Cloudflare; the public HTTPS origin has no explicit port.
        if (!(($origin['scheme'] ?? '') === 'https' && !isset($origin['port'])
            && strtolower($origin['host'] ?? '') === strtolower($host['host'] ?? '')
            && !isset($host['port']))) {
            fail(403, 'Same-origin requests only');
        }
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        fail(415, 'JSON required');
    }
    $raw = file_get_contents('php://input', false, null, 0, 2049);
    if ($raw === false || strlen($raw) > 2048) fail(413, 'Request too large');
    $input = json_decode($raw, true);
    $event = is_array($input) ? ($input['event'] ?? null) : null;
    $id = is_array($input) ? ($input['session'] ?? null) : null;
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)
        || !in_array($event, ['view', 'heartbeat', 'download'], true)) {
        fail(400, 'Invalid event');
    }
}

$directory = getenv('Q3RALLY_COUNTER_DIR') ?: '/var/lib/q3rally-counter';
if (!is_dir($directory) || !is_writable($directory)) fail(503, 'Counter storage unavailable');
$lock = fopen($directory . '/counter.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) fail(503, 'Counter storage unavailable');
$temp = null;
try {
    $file = $directory . '/counter.json';
    $state = ['version' => 1, 'day' => '', 'visitors' => 0, 'pageviews' => 0, 'downloads' => 0, 'sessions' => []];
    if (file_exists($file)) {
        $saved = json_decode((string)file_get_contents($file), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($saved) || ($saved['version'] ?? null) !== 1
            || !isset($saved['day'], $saved['visitors'], $saved['pageviews'], $saved['downloads'], $saved['sessions'])
            || !is_array($saved['sessions'])) throw new RuntimeException('Invalid counter data');
        $state = $saved;
    }
    $now = time();
    $day = (new DateTimeImmutable('now', new DateTimeZone('Europe/Berlin')))->format('Y-m-d');
    $changed = false;
    if ($state['day'] !== $day) {
        $state['day'] = $day;
        $state['sessions'] = [];
        $changed = true;
    }
    if ($event !== null) {
        // Random tab ID, hashed per day; no IP addresses, URLs or user agents stored.
        $key = hash('sha256', $day . ':' . $id);
        $session = $state['sessions'][$key] ?? null;
        if ($session === null && count($state['sessions']) >= 100000) fail(503, 'Daily capacity reached');
        if ($session === null) {
            $session = ['seen' => $now, 'view' => 0, 'download' => 0];
            $state['visitors']++;
        }
        // Limit duplicate/rapid events from the same tab. This is not fraud-proof analytics.
        if ($event === 'view' && $now - $session['view'] >= 2) {
            $state['pageviews']++;
            $session['view'] = $now;
        }
        if ($event === 'download' && $now - $session['download'] >= 2) {
            $state['downloads']++;
            $session['download'] = $now;
        }
        $session['seen'] = $now;
        $state['sessions'][$key] = $session;
        $changed = true;
    }
    if ($changed) {
        $json = json_encode($state, JSON_THROW_ON_ERROR);
        $temp = tempnam($directory, '.counter-');
        if ($temp === false || file_put_contents($temp, $json) !== strlen($json)
            || !rename($temp, $file)) throw new RuntimeException('Counter write failed');
        $temp = null;
    }
    $online = count(array_filter($state['sessions'], fn($s) => $s['seen'] >= $now - 300));
    echo json_encode([
        'online' => $online,
        'visitors' => $state['visitors'],
        'pageviews' => $state['pageviews'],
        'downloads' => $state['downloads'],
        'today' => count($state['sessions']),
    ], JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    error_log('Q3Rally counter storage failure');
    fail(503, 'Counter storage unavailable');
} finally {
    if ($temp !== null && is_file($temp)) unlink($temp);
    flock($lock, LOCK_UN);
    fclose($lock);
}
