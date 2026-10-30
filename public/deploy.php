<?php
/**
 * KNIGHTS: LAST STANDING — 1-Click Beget Auto-Deployer & Updater for igra.ezekie6n.beget.tech
 * Compatible with PHP 5.6, 7.x, and 8.x.
 * Откройте http://igra.ezekie6n.beget.tech/deploy.php в браузере в любой момент,
 * чтобы за 3 секунды скачать и установить самую свежую сборку с GitHub (beget-latest)!
 */
@set_time_limit(180);
@ini_set('memory_limit', '256M');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$ts = time();
$zipUrl = 'https://github.com/MarkusCrass/test/releases/download/beget-latest/knights-beget-public_html.zip?t=' . $ts;
$targetDir = __DIR__;
$tmpZip = $targetDir . '/_knights_release_tmp.zip';

function fail_msg($msg) {
    if (function_exists('http_response_code')) {
        http_response_code(500);
    } else {
        header('HTTP/1.1 500 Internal Server Error');
    }
    echo '<!doctype html><meta charset="utf-8"><body style="background:#090d16;color:#93c5fd;font-family:sans-serif;padding:32px">';
    echo '<h2>Ошибка установки</h2><p>' . htmlspecialchars((string)$msg, ENT_QUOTES, 'UTF-8') . '</p></body>';
    exit;
}

function clean_dir_files($dirPath) {
    if (!is_dir($dirPath)) {
        return;
    }
    $items = @scandir($dirPath);
    if (!is_array($items)) {
        return;
    }
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        $full = $dirPath . '/' . $item;
        if (is_file($full)) {
            @unlink($full);
        }
    }
}

if (!class_exists('ZipArchive')) {
    fail_msg('Расширение PHP ZipArchive недоступно. Используйте команду для Терминала Beget или распакуйте архив через Файловый менеджер.');
}

$zipData = false;
if (function_exists('curl_init')) {
    $ch = curl_init($zipUrl);
    curl_setopt_array($ch, array(
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 6,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_USERAGENT      => 'Knights-Beget-Installer/1.2',
        CURLOPT_SSL_VERIFYPEER => true,
    ));
    $zipData = curl_exec($ch);
    $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($zipData === false || $httpCode !== 200) {
        fail_msg('Не удалось скачать архив релиза с GitHub (HTTP ' . $httpCode . '): ' . $err);
    }
} else {
    $ctx = stream_context_create(array(
        'http' => array(
            'follow_location' => 1,
            'timeout' => 120,
            'header' => "User-Agent: Knights-Beget-Installer/1.2\r\n",
        ),
    ));
    $zipData = @file_get_contents($zipUrl, false, $ctx);
    if ($zipData === false) {
        fail_msg('Не удалось скачать архив с GitHub через file_get_contents.');
    }
}

if (@file_put_contents($tmpZip, $zipData) === false) {
    fail_msg('Нет прав на запись в текущую папку public_html.');
}

$zip = new ZipArchive();
if ($zip->open($tmpZip) !== true) {
    @unlink($tmpZip);
    fail_msg('Скачанный архив повреждён.');
}

// Удаляем стандартную заглушку Beget index.php и старые хешированные ассеты перед распаковкой
if (is_file($targetDir . '/index.php') && basename(__FILE__) !== 'index.php') {
    @unlink($targetDir . '/index.php');
}
clean_dir_files($targetDir . '/assets');

if (!$zip->extractTo($targetDir)) {
    $zip->close();
    @unlink($tmpZip);
    fail_msg('Не удалось распаковать файлы в public_html.');
}
$zip->close();
@unlink($tmpZip);

$redirectUrl = './?v=' . $ts;
header('Location: ' . $redirectUrl);
echo '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="1;url=' . htmlspecialchars($redirectUrl, ENT_QUOTES, 'UTF-8') . '">';
echo '<body style="background:#090d16;color:#f8fafc;font-family:sans-serif;padding:40px;text-align:center">';
echo '<h2 style="color:#38bdf8">KNIGHTS: LAST STANDING успешно обновлена на Beget!</h2>';
echo '<p>9 героев ближнего боя · 27 навыков [1][2][3] · 95 анимаций готовы к игре.</p>';
echo '<p><a href="' . htmlspecialchars($redirectUrl, ENT_QUOTES, 'UTF-8') . '" style="color:#60a5fa;font-weight:bold">Открыть игру →</a></p></body>';
