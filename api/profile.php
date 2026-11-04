<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_THROW_ON_ERROR);
    exit;
}

function query(PDO $db, string $sql, array $args = []): PDOStatement
{
    $statement = $db->prepare($sql);
    $statement->execute($args);
    return $statement;
}

function throttle(PDO $db, string $bucket, int $max, int $now): void
{
    query($db, 'DELETE FROM request_limits WHERE expires_at <= ?', [$now]);
    $attempts = query($db, 'INSERT INTO request_limits VALUES (?, 1, ?)
        ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1 RETURNING attempts',
        [$bucket, $now + 900])->fetchColumn();
    if ($attempts > $max) {
        reply(429, ['error' => 'Too many attempts. Try again in 15 minutes.']);
    }
}

function sendVerification(string $email, string $token, string $origin): void
{
    $config = getenv('Q3RALLY_SMTP_CONFIG') ?: '/etc/q3rally-profile/msmtprc';
    $link = $origin . '/garage/#verify=' . $token;
    $transport = getenv('Q3RALLY_SMTP_BINARY') ?: '/usr/bin/msmtp';
    $sink = PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
    $process = proc_open([$transport, '--file=' . $config, '--account=q3rally', '--', $email],
        [0 => ['pipe', 'r'], 1 => ['file', $sink, 'w'], 2 => ['file', $sink, 'w']], $pipes);
    if (!is_resource($process)) {
        throw new RuntimeException('Could not start the profile mail transport');
    }
    fwrite($pipes[0], "From: accounts@q3rally.com\r\nTo: $email\r\nSubject: Confirm your Q3Rally account\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n\r\nConfirm your account within 24 hours:\r\n$link\r\n");
    fclose($pipes[0]);
    if (proc_close($process) !== 0) {
        throw new RuntimeException('Profile mail transport failed');
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$origin = getenv('Q3RALLY_PROFILE_ORIGIN') ?: 'https://www.q3rally.com';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    reply(405, ['error' => 'Method not allowed']);
}

$input = [];
if ($method === 'POST') {
    if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $origin) {
        reply(403, ['error' => 'Same-origin requests only']);
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        reply(415, ['error' => 'JSON required']);
    }
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if ($raw === false || strlen($raw) > 4096) {
        reply(413, ['error' => 'Request too large']);
    }
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        reply(400, ['error' => 'Invalid request']);
    }
}

try {
    $directory = getenv('Q3RALLY_PROFILE_DIR') ?: '/var/lib/q3rally-profile';
    $database = $directory . '/profiles.sqlite';
    if (!is_file($database)) {
        reply(503, ['error' => 'Profile service unavailable']);
    }
    $db = new PDO('sqlite:' . $database, options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec('PRAGMA foreign_keys = ON');
    if ((int) $db->query('PRAGMA user_version')->fetchColumn() !== 2) {
        reply(503, ['error' => 'Profile service unavailable']);
    }

    session_name('Q3RALLYPROFILE');
    session_start([
        'use_strict_mode' => 1,
        'use_only_cookies' => 1,
        'cookie_secure' => 1,
        'cookie_httponly' => 1,
        'cookie_samesite' => 'Lax',
        'cookie_path' => '/api/profile.php',
    ]);

    $now = time();
    $action = $method === 'GET' ? 'status' : ($input['action'] ?? '');
    $profile = ($_SESSION['expires'] ?? 0) > $now ? ($_SESSION['profile'] ?? null) : null;
    if ($action === 'status') {
        reply(200, ['signedIn' => $profile !== null]);
    }
    if ($action === 'logout') {
        $_SESSION = [];
        session_destroy();
        setcookie(session_name(), '', [
            'expires' => 1, 'path' => '/api/profile.php', 'secure' => true, 'httponly' => true, 'samesite' => 'Lax',
        ]);
        reply(200, ['signedIn' => false]);
    }
    if ($action === 'verify') {
        $token = $input['token'] ?? null;
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
            reply(400, ['error' => 'Invalid or expired confirmation link']);
        }
        $password = $input['password'] ?? null;
        if (!is_string($password) || strlen($password) > 72) {
            reply(400, ['error' => 'Enter the password chosen during registration']);
        }
        throttle($db, 'verify:ip:' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? ''), 25, $now);
        $tokenHash = hash('sha256', $token);
        $hash = query($db, 'SELECT a.password_hash FROM accounts a JOIN email_verifications v
            ON v.account_id = a.id WHERE v.token_hash = ? AND v.expires_at > ?', [$tokenHash, $now])->fetchColumn();
        if (!$hash || !password_verify($password, $hash)) {
            reply(400, ['error' => 'Invalid password or expired confirmation link']);
        }
        $db->beginTransaction();
        $consume = query($db, 'DELETE FROM email_verifications WHERE token_hash = ? AND expires_at > ?
            RETURNING account_id', [$tokenHash, $now]);
        $account = $consume->fetchColumn();
        $consume->closeCursor();
        if (!$account) {
            $db->rollBack();
            reply(400, ['error' => 'Invalid or expired confirmation link']);
        }
        query($db, 'UPDATE accounts SET verified_at = ? WHERE id = ?', [$now, $account]);
        query($db, 'INSERT INTO profiles (id, account_id) VALUES (?, ?)', [bin2hex(random_bytes(16)), $account]);
        $db->commit();
        reply(200, ['verified' => true]);
    }
    if ($action === 'garage') {
        if (!$profile) {
            reply(401, ['error' => 'Sign in to use your web garage']);
        }
        if (array_key_exists('paint', $input) || array_key_exists('wheels', $input)) {
            $paint = $input['paint'] ?? null;
            $wheels = $input['wheels'] ?? null;
            if (!in_array($paint, ['blue', 'green', 'red', 'yellow'], true)
                || !in_array($wheels, ['svt_cobra', 'q3r_rally13', 'q3r_rally13_dark'], true)) {
                reply(400, ['error' => 'Unknown Alpine setup']);
            }
            query($db, "INSERT INTO garage_setups VALUES (?, 'alpine', ?, ?, ?)
                ON CONFLICT(profile_id, vehicle) DO UPDATE SET
                paint = excluded.paint, wheels = excluded.wheels, updated_at = excluded.updated_at",
                [$profile, $paint, $wheels, $now]);
        }
        $setup = query($db, "SELECT paint, wheels FROM garage_setups WHERE profile_id = ? AND vehicle = 'alpine'",
            [$profile])->fetch(PDO::FETCH_ASSOC);
        reply(200, ['setup' => $setup ?: null]);
    }
    if ($action !== 'register' && $action !== 'login') {
        reply(400, ['error' => 'Unknown action']);
    }

    $email = $input['email'] ?? null;
    $password = $input['password'] ?? null;
    if (!is_string($email) || strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)
        || strpbrk($email, "\r\n") !== false || !is_string($password)
        || strlen($password) < 12 || strlen($password) > 72 || str_contains($password, "\0")) {
        reply(400, ['error' => 'Enter a valid email and a password of 12 to 72 bytes']);
    }
    $email = strtolower($email);
    throttle($db, $action . ':ip:' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? ''), $action === 'login' ? 50 : 10, $now);
    throttle($db, $action . ':email:' . hash('sha256', $email), $action === 'login' ? 10 : 3, $now);

    if ($action === 'login') {
        $account = query($db, 'SELECT a.password_hash, p.id AS profile_id
            FROM accounts a LEFT JOIN profiles p ON a.id = p.account_id WHERE a.email = ?', [$email])->fetch(PDO::FETCH_ASSOC);
        $dummyHash = '$2y$12$VlsZT/7smFUVzb8jK7ifKehE0V79MhlEbK2QNC4uPXrnuJG7xTdkq';
        if (!password_verify($password, $account['password_hash'] ?? $dummyHash) || empty($account['profile_id'])) {
            reply(401, ['error' => 'Invalid credentials or email confirmation pending']);
        }
        if (!session_regenerate_id(true)) {
            throw new RuntimeException('Could not renew profile session');
        }
        $_SESSION = ['profile' => $account['profile_id'], 'expires' => $now + 43200];
        reply(200, ['signedIn' => true]);
    }

    $accountId = bin2hex(random_bytes(16));
    $token = bin2hex(random_bytes(32));
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $db->beginTransaction();
    $insert = query($db, 'INSERT INTO accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash
        WHERE accounts.verified_at IS NULL RETURNING id', [$accountId, $email, $hash, $now]);
    $pending = $insert->fetchColumn();
    $insert->closeCursor();
    if ($pending) {
        query($db, 'INSERT INTO email_verifications VALUES (?, ?, ?)
            ON CONFLICT(account_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at',
            [$pending, hash('sha256', $token), $now + 86400]);
    }
    $db->commit();
    if ($pending) {
        try {
            sendVerification($email, $token, $origin);
        } catch (RuntimeException $error) {
            error_log($error->getMessage());
        }
    }
    reply(202, ['message' => 'If registration can proceed, a confirmation link will be sent to your email.']);
} catch (Throwable $error) {
    error_log('Q3Rally profile request failed: ' . get_class($error));
    reply(503, ['error' => 'Profile service unavailable']);
}
