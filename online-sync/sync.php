<?php
/**
 * SmartDay Desktop 2.x synchronization endpoint.
 * Install in the root of the online SmartDay PHP application.
 * Configure SMARTDAY_SYNC_TOKEN as a server environment variable (32+ random characters).
 */
declare(strict_types=1);
require_once __DIR__ . '/app/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

function sync_fail(string $message, int $status): void {
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function sync_authorized(): bool {
    $expected = (string)(getenv('SMARTDAY_SYNC_TOKEN') ?: '');
    $header = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if ($expected === '' || strlen($expected) < 32) return false;
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $m)) return false;
    return hash_equals($expected, trim($m[1]));
}
function sync_timestamp(array $item): int {
    foreach (['_deleted_at', 'updated_at', 'updatedAt', 'created_at', 'createdAt'] as $key) {
        if (!empty($item[$key])) {
            if (is_numeric($item[$key])) return (int)$item[$key];
            $stamp = strtotime((string)$item[$key]);
            if ($stamp !== false) return $stamp;
        }
    }
    return 0;
}
function sync_merge(array $local, array $incoming): array {
    $map = [];
    foreach ($local as $item) if (is_array($item) && !empty($item['id'])) $map[(string)$item['id']] = $item;
    foreach ($incoming as $item) {
        if (!is_array($item) || empty($item['id'])) continue;
        $id = (string)$item['id'];
        if (!isset($map[$id]) || sync_timestamp($item) >= sync_timestamp($map[$id])) $map[$id] = $item;
    }
    return array_values($map);
}
function sync_public_state(array $state): array {
    $allowed = ['projects','tasks','projectItems','reminders','notes','events','habits','habit_logs','activity','ideas','websites','contacts','goals','accounts','transactions','habitLogs','moods'];
    $out = ['schemaVersion' => 2];
    foreach ($allowed as $key) $out[$key] = isset($state[$key]) && is_array($state[$key]) ? $state[$key] : [];
    return $out;
}

if (!sync_authorized()) sync_fail('توکن همگام‌سازی نامعتبر است یا در سرور تنظیم نشده است.', 401);
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    try {
        ensure_storage();
        $snapshot = with_store(function(array &$state) { return sync_public_state($state); }, false);
        echo json_encode(['ok' => true, 'version' => 2, 'state' => $snapshot], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    } catch (Throwable $e) { sync_fail('خواندن داده‌های همگام‌سازی ناموفق بود.', 500); }
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') sync_fail('متد درخواست پشتیبانی نمی‌شود.', 405);
$contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 20 * 1024 * 1024) sync_fail('حجم داده ارسالی بیش از حد مجاز است.', 413);
$raw = file_get_contents('php://input');
$body = json_decode((string)$raw, true);
if (!is_array($body) || !isset($body['state']) || !is_array($body['state'])) sync_fail('ساختار داده ارسالی معتبر نیست.', 400);
$incoming = $body['state'];
$allowed = ['projects','tasks','projectItems','reminders','notes','events','habits','habit_logs','activity','ideas','websites','contacts','goals','accounts','transactions','habitLogs','moods'];
try {
    ensure_storage();
    $result = with_store(function(array &$state) use ($incoming, $allowed) {
        foreach ($allowed as $key) {
            if (!isset($state[$key]) || !is_array($state[$key])) $state[$key] = [];
            if (isset($incoming[$key]) && is_array($incoming[$key])) $state[$key] = sync_merge($state[$key], $incoming[$key]);
        }
        $state['sync_schema_version'] = 2;
        return sync_public_state($state);
    }, true);
    echo json_encode(['ok' => true, 'version' => 2, 'state' => $result, 'synced_at' => date('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
} catch (Throwable $e) { sync_fail('ذخیره داده‌های همگام‌سازی ناموفق بود.', 500); }
