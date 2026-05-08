<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once 'config.php';

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitize($str) {
    return htmlspecialchars(strip_tags(trim($str)), ENT_QUOTES, 'UTF-8');
}

function generateUID() {
    return 'UID-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
}

function generateKeyId() {
    return 'KEY-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
}

function generateKeyValue() {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    $gen = function($len) use ($chars) {
        $out = '';
        for ($i = 0; $i < $len; $i++) $out .= $chars[random_int(0, 61)];
        return $out;
    };
    return $gen(16) . '-' . $gen(8) . '-' . $gen(4);
}

function generateReferralCode() {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $a = ''; $b = '';
    for ($i = 0; $i < 6; $i++) { $a .= $chars[random_int(0, 35)]; $b .= $chars[random_int(0, 35)]; }
    return 'REF-' . $a . '-' . $b;
}

function getBalanceByRole($role) {
    return ['Reseller' => 1000, 'Admin' => 10000, 'Owner' => 9999999][$role] ?? 0;
}

$action = $_GET['action'] ?? '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'GET') {
    $input = $_SERVER['REQUEST_METHOD'] === 'POST' ? json_decode(file_get_contents('php://input'), true) ?? [] : [];
    $body = array_merge($_GET, $input);
} else {
    $body = [];
}

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
    );
} catch (PDOException $e) {
    jsonResponse(['success' => false, 'error' => 'Database connection failed'], 500);
}

// ─── LOGIN ───
if ($action === 'login' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = sanitize($body['username'] ?? '');
    $password = $body['password'] ?? '';

    if (empty($username) || empty($password)) {
        jsonResponse(['success' => false, 'error' => 'Fill all fields'], 400);
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user) {
        jsonResponse(['success' => false, 'error' => 'Account does not exist'], 404);
    }
    if ($user['banned']) {
        jsonResponse(['success' => false, 'error' => 'Account does not exist'], 403);
    }
    if (!password_verify($password, $user['password_hash'])) {
        jsonResponse(['success' => false, 'error' => 'Invalid credentials'], 401);
    }

    unset($user['password_hash']);
    jsonResponse(['success' => true, 'user' => $user]);
}

// ─── REGISTER ───
if ($action === 'register' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = sanitize($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $referralCode = strtoupper(sanitize($body['referralCode'] ?? ''));

    if (empty($username) || empty($password) || empty($referralCode)) {
        jsonResponse(['success' => false, 'error' => 'Fill all fields'], 400);
    }
    if (strlen($username) < 3 || strlen($username) > 30) {
        jsonResponse(['success' => false, 'error' => 'Username must be 3-30 chars'], 400);
    }
    if (strlen($password) < 4) {
        jsonResponse(['success' => false, 'error' => 'Password too short'], 400);
    }

    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->execute([$username]);
    if ($stmt->fetch()) {
        jsonResponse(['success' => false, 'error' => 'Username already exists'], 409);
    }

    $stmt = $pdo->prepare("SELECT * FROM referrals WHERE code = ? AND used = 0");
    $stmt->execute([$referralCode]);
    $ref = $stmt->fetch();

    if (!$ref) {
        jsonResponse(['success' => false, 'error' => 'Invalid referral code'], 400);
    }

    $uid = generateUID();
    $balance = getBalanceByRole($ref['role']);
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $pdo->prepare("INSERT INTO users (uid, username, password_hash, role, balance, referral_code) VALUES (?, ?, ?, ?, ?, ?)")
        ->execute([$uid, $username, $hash, $ref['role'], $balance, $referralCode]);

    $pdo->prepare("UPDATE referrals SET used = 1, used_by = ?, used_at = NOW() WHERE code = ?")
        ->execute([$username, $referralCode]);

    $user = [
        'uid' => $uid,
        'username' => $username,
        'role' => $ref['role'],
        'balance' => $balance,
        'banned' => false
    ];
    jsonResponse(['success' => true, 'user' => $user]);
}

// ─── DB (GET ALL) ───
if ($action === 'db' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $users = $pdo->query("SELECT id, uid, username, password_hash, role, balance, referral_code, banned, created_at FROM users")->fetchAll();
    foreach ($users as &$u) { unset($u['password_hash']); }
    unset($u);

    $keys = $pdo->query("SELECT * FROM keys")->fetchAll();
    $refs = $pdo->query("SELECT * FROM referrals")->fetchAll();

    jsonResponse([
        'users' => $users,
        'keys' => $keys,
        'referrals' => $refs
    ]);
}

// ─── REFERRALS ───
if ($action === 'referrals') {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $refs = $pdo->query("SELECT * FROM referrals")->fetchAll();
        jsonResponse($refs);
    }
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $code = sanitize($body['code'] ?? '');
        $role = sanitize($body['role'] ?? '');
        $ownerUid = sanitize($body['ownerUid'] ?? '');

        $pdo->prepare("INSERT INTO referrals (code, role, owner_uid) VALUES (?, ?, ?)")
            ->execute([$code, $role, $ownerUid]);
        jsonResponse(['success' => true]);
    }
}

// ─── KEYS ───
if ($action === 'keys') {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $pdo->prepare("INSERT INTO keys (key_id, key_value, key_name, duration, max_activations, price, owner_uid, owner_username) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            ->execute([
                $body['id'] ?? generateKeyId(),
                $body['value'] ?? generateKeyValue(),
                $body['name'] ?? 'Key',
                (int)($body['duration'] ?? 30),
                (int)($body['maxActivations'] ?? 1),
                (int)($body['price'] ?? 0),
                $body['ownerUid'] ?? '',
                $body['ownerUsername'] ?? ''
            ]);
        jsonResponse(['success' => true]);
    }
}

if ($action === 'keys/delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = sanitize($body['id'] ?? '');
    $pdo->prepare("DELETE FROM keys WHERE key_id = ?")->execute([$id]);
    jsonResponse(['success' => true]);
}

if ($action === 'keys/update' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = sanitize($body['id'] ?? '');
    unset($body['id']);

    $allowed = ['key_name', 'frozen', 'hwid', 'active', 'activated_by', 'activated_at', 'expires_at', 'duration', 'max_activations', 'current_activations'];
    $sets = [];
    $vals = [];
    foreach ($body as $k => $v) {
        if (in_array($k, $allowed)) {
            $sets[] = "`$k` = ?";
            $vals[] = $v;
        }
    }
    if ($sets) {
        $vals[] = $id;
        $pdo->prepare("UPDATE keys SET " . implode(', ', $sets) . " WHERE key_id = ?")->execute($vals);
    }
    jsonResponse(['success' => true]);
}

// ─── CONNECT (активация ключа) ───
if ($action === 'connect' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $keyValue = sanitize($body['key'] ?? '');
    $hwid = sanitize($body['hwid'] ?? '');
    $username = sanitize($body['username'] ?? 'Unknown');

    if (empty($keyValue) || empty($hwid)) {
        jsonResponse(['success' => false, 'error' => 'Missing key or hwid'], 400);
    }

    $stmt = $pdo->prepare("SELECT * FROM keys WHERE key_value = ?");
    $stmt->execute([$keyValue]);
    $key = $stmt->fetch();

    if (!$key) {
        jsonResponse(['success' => false, 'error' => 'Key not found'], 404);
    }

    if ($key['frozen']) {
        jsonResponse(['success' => false, 'error' => 'Key is frozen'], 403);
    }

    if ($key['expires_at'] && strtotime($key['expires_at']) < time()) {
        jsonResponse(['success' => false, 'error' => 'Key has expired'], 403);
    }

    if ($key['current_activations'] >= $key['max_activations']) {
        jsonResponse(['success' => false, 'error' => 'Max activations reached (' . $key['max_activations'] . ')'], 403);
    }

    if (!empty($key['hwid']) && $key['hwid'] !== $hwid) {
        jsonResponse(['success' => false, 'error' => 'Key already activated on: ' . $key['hwid']], 403);
    }

    $duration = (int)($key['duration'] ?: 30);
    $expiresAt = date('Y-m-d H:i:s', strtotime("+{$duration} days"));
    $newActivations = (int)$key['current_activations'] + 1;

    $pdo->prepare("UPDATE keys SET hwid = ?, active = 1, activated_by = ?, activated_at = NOW(), expires_at = ?, current_activations = ? WHERE key_id = ?")
        ->execute([$hwid, $username, $expiresAt, $newActivations, $key['key_id']]);

    jsonResponse([
        'success' => true,
        'key' => $key['key_name'],
        'duration' => $duration,
        'expiresAt' => $expiresAt
    ]);
}

// ─── ACTIVATE KEY ───
if ($action === 'activate' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $keyValue = sanitize($body['key'] ?? '');
    $hwid = sanitize($body['hwid'] ?? '');
    $username = sanitize($body['username'] ?? 'Unknown');

    $stmt = $pdo->prepare("SELECT * FROM keys WHERE key_value = ?");
    $stmt->execute([$keyValue]);
    $key = $stmt->fetch();

    if (!$key) jsonResponse(['success' => false, 'error' => 'Key not found'], 404);
    if ($key['frozen']) jsonResponse(['success' => false, 'error' => 'Key is frozen'], 403);
    if ($key['expires_at'] && strtotime($key['expires_at']) < time()) jsonResponse(['success' => false, 'error' => 'Key has expired'], 403);
    if ($key['current_activations'] >= $key['max_activations']) jsonResponse(['success' => false, 'error' => 'Max activations reached'], 403);
    if (!empty($key['hwid']) && $key['hwid'] !== $hwid) jsonResponse(['success' => false, 'error' => 'Key already activated on: ' . $key['hwid']], 403);

    $duration = (int)($key['duration'] ?: 30);
    $expiresAt = date('Y-m-d H:i:s', strtotime("+{$duration} days"));

    $pdo->prepare("UPDATE keys SET hwid = ?, active = 1, activated_by = ?, activated_at = NOW(), expires_at = ?, current_activations = current_activations + 1 WHERE key_id = ?")
        ->execute([$hwid, $username, $expiresAt, $key['key_id']]);

    jsonResponse(['success' => true, 'key' => $key['key_name'], 'duration' => $duration, 'expiresAt' => $expiresAt]);
}

if (str_starts_with($action, 'activate/key=') && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $keyValue = str_replace('activate/key=', '', $action);
    $stmt = $pdo->prepare("SELECT * FROM keys WHERE key_value = ?");
    $stmt->execute([$keyValue]);
    $key = $stmt->fetch();

    if (!$key) jsonResponse(['exists' => false]);
    jsonResponse([
        'exists' => true,
        'active' => (bool)$key['active'],
        'frozen' => (bool)$key['frozen'],
        'hwid' => $key['hwid']
    ]);
}

// ─── INIT ───
if ($action === 'init' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $stmt = $pdo->query("SELECT COUNT(*) FROM users");
    if ($stmt->fetchColumn() > 0) {
        jsonResponse(['success' => true, 'message' => 'Already initialized']);
    }

    $hash = password_hash('admin', PASSWORD_DEFAULT);
    $pdo->prepare("INSERT INTO users (uid, username, password_hash, role, balance) VALUES ('UID-ADMIN001', 'admin', ?, 'Owner', 9999999)")
        ->execute([$hash]);
    $pdo->prepare("INSERT INTO referrals (code, role) VALUES ('REF-INIT-OWNER', 'Owner')")->execute();
    $pdo->prepare("INSERT INTO referrals (code, role) VALUES ('REF-INIT-ADMIN', 'Admin')")->execute();
    $pdo->prepare("INSERT INTO referrals (code, role) VALUES ('REF-INIT-RESELLER', 'Reseller')")->execute();

    jsonResponse(['success' => true, 'message' => 'Database initialized']);
}

// ─── CHECK EXPIRY ───
if ($action === 'check-expiry' && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $pdo->query("SELECT key_id FROM keys WHERE active = 1 AND expires_at IS NOT NULL AND expires_at < NOW()");
    $expired = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if ($expired) {
        $pdo->prepare("UPDATE keys SET active = 0 WHERE expires_at < NOW() AND active = 1")->execute();
    }
    jsonResponse(['expired' => $expired]);
}

jsonResponse(['error' => 'Not found'], 404);
