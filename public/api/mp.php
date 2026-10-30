<?php
/**
 * KNIGHTS: LAST STANDING — Universal Beget / Shared Hosting Multiplayer Relay
 * Compatible with PHP 5.6, 7.x, and 8.x (zero PHP 7+ only syntax constructs so
 * default Beget subdomain PHP configs never throw ParseError).
 * Uses shared account directory storage (__DIR__ . '/_runtime/mp_state.json')
 * with flock() so all Apache/PHP workers see the exact same rooms & sessions.
 */
@ini_set('display_errors', '0');
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$reqMethod = isset($_SERVER['REQUEST_METHOD']) ? strtoupper((string)$_SERVER['REQUEST_METHOD']) : 'GET';
if ($reqMethod === 'OPTIONS') {
    if (function_exists('http_response_code')) {
        http_response_code(204);
    } else {
        header('HTTP/1.1 204 No Content');
    }
    exit;
}

$action = isset($_GET['action']) ? trim((string)$_GET['action']) : '';
if ($action === '') {
    $rawUri = isset($_SERVER['REQUEST_URI']) ? (string)$_SERVER['REQUEST_URI'] : '/';
    $uriPath = parse_url($rawUri, PHP_URL_PATH);
    $uriStr = is_string($uriPath) ? $uriPath : '/';
    if (preg_match('#/api/mp/(connect|sync|disconnect|health)$#', $uriStr, $m)) {
        $action = $m[1];
    } elseif (preg_match('#/api/rooms$#', $uriStr)) {
        $action = 'rooms';
    } elseif (preg_match('#/api/client-(ready|error)$#', $uriStr)) {
        $action = 'noop';
    }
}

if ($action === 'noop') {
    if (function_exists('http_response_code')) {
        http_response_code(204);
    } else {
        header('HTTP/1.1 204 No Content');
    }
    exit;
}

define('MP_MAX_PLAYERS', 5);
define('MP_SESSION_TIMEOUT', 35.0);
define('MP_MAX_OUTBOX', 28);
define('MP_CODE_ALPHABET', 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');

function mp_json_flags() {
    $flags = 0;
    if (defined('JSON_UNESCAPED_UNICODE')) {
        $flags |= JSON_UNESCAPED_UNICODE;
    }
    if (defined('JSON_UNESCAPED_SLASHES')) {
        $flags |= JSON_UNESCAPED_SLASHES;
    }
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    return $flags;
}

function mp_send_json($status, $payload) {
    $code = (int)$status;
    if (function_exists('http_response_code')) {
        http_response_code($code);
    } else {
        header('HTTP/1.1 ' . $code);
    }
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode($payload, mp_json_flags());
    echo is_string($json) ? $json : '{"ok":false}';
    exit;
}

function mp_rand_int($min, $max) {
    if (function_exists('random_int')) {
        try {
            return random_int((int)$min, (int)$max);
        } catch (Exception $e) {
            return mt_rand((int)$min, (int)$max);
        }
    }
    return mt_rand((int)$min, (int)$max);
}

function mp_sanitize_name($raw, $fallbackNum) {
    $num = (int)$fallbackNum;
    if (!is_string($raw)) {
        return 'Рыцарь #' . $num;
    }
    $clean = preg_replace('/[\r\n\t<>]/u', '', $raw);
    if (!is_string($clean)) {
        $clean = str_replace(array("\r", "\n", "\t", '<', '>'), '', $raw);
    }
    $clean = trim($clean);
    if (function_exists('mb_substr') && function_exists('mb_strlen')) {
        $clean = mb_substr($clean, 0, 18, 'UTF-8');
        return mb_strlen($clean, 'UTF-8') >= 2 ? $clean : ('Рыцарь #' . $num);
    }
    $clean = substr($clean, 0, 36);
    return strlen($clean) >= 2 ? $clean : ('Рыцарь #' . $num);
}

function mp_sanitize_class($raw) {
    static $valid = array(
        'sword',
        'dual',
        'spear',
        'hammer',
        'barbarian',
        'duelist',
        'skeleton_knight',
        'skeleton_reaper',
        'skeleton_berserker'
    );
    if (is_string($raw) && in_array($raw, $valid, true)) {
        return $raw;
    }
    return 'sword';
}

function mp_enqueue(&$state, $clientId, $msg) {
    if (!isset($state['clients'][$clientId])) {
        return;
    }
    $outbox = &$state['clients'][$clientId]['outbox'];
    $type = isset($msg['type']) ? $msg['type'] : '';

    // Coalesce pure position-only snapshots so slower clients never build backlog lag
    if (
        $type === 'snapshot' &&
        empty($msg['events']) &&
        empty($msg['jumps']) &&
        empty($msg['dodges']) &&
        empty($msg['landings']) &&
        empty($msg['enteredFinalPhase'])
    ) {
        for ($i = count($outbox) - 1; $i >= 0; $i--) {
            $prev = $outbox[$i];
            $prevType = isset($prev['type']) ? $prev['type'] : '';
            if (
                $prevType === 'snapshot' &&
                empty($prev['events']) &&
                empty($prev['jumps']) &&
                empty($prev['dodges']) &&
                empty($prev['landings']) &&
                empty($prev['enteredFinalPhase'])
            ) {
                $outbox[$i] = $msg;
                return;
            }
        }
    }

    // Coalesce unsent guest input for the same fighterId
    if ($type === 'relay_guest_input') {
        $fid = isset($msg['fighterId']) ? $msg['fighterId'] : '';
        for ($i = count($outbox) - 1; $i >= 0; $i--) {
            $prev = $outbox[$i];
            $prevType = isset($prev['type']) ? $prev['type'] : '';
            $prevFid = isset($prev['fighterId']) ? $prev['fighterId'] : '';
            if ($prevType === 'relay_guest_input' && $prevFid === $fid) {
                $outbox[$i] = $msg;
                return;
            }
        }
    }

    if (count($outbox) >= MP_MAX_OUTBOX) {
        array_shift($outbox);
    }
    $outbox[] = $msg;
}

function mp_public_rooms(&$state) {
    $list = array();
    foreach ($state['rooms'] as $r) {
        if (empty($r['isPublic'])) {
            continue;
        }
        $hostName = 'Рыцарь';
        foreach ($r['players'] as $cid) {
            if ($cid === $r['hostClientId'] && isset($state['clients'][$cid])) {
                $hostName = $state['clients'][$cid]['name'];
                break;
            }
        }
        $list[] = array(
            'roomCode' => $r['roomCode'],
            'hostName' => $hostName,
            'playerCount' => count($r['players']),
            'maxPlayers' => MP_MAX_PLAYERS,
            'fillBots' => (bool)$r['fillBots'],
            'phase' => $r['phase'],
        );
    }
    return $list;
}

function mp_serialize_room(&$state, &$room) {
    $players = array();
    foreach ($room['players'] as $cid) {
        if (!isset($state['clients'][$cid])) {
            continue;
        }
        $c = $state['clients'][$cid];
        $players[] = array(
            'clientId' => $c['clientId'],
            'fighterId' => $c['fighterId'],
            'name' => $c['name'],
            'classId' => $c['classId'],
            'ready' => (bool)$c['ready'],
            'isHost' => ($c['clientId'] === $room['hostClientId']),
            'pingMs' => (int)$c['pingMs'],
        );
    }
    return array(
        'roomCode' => $room['roomCode'],
        'hostClientId' => $room['hostClientId'],
        'isPublic' => (bool)$room['isPublic'],
        'fillBots' => (bool)$room['fillBots'],
        'phase' => $room['phase'],
        'players' => $players,
    );
}

function mp_broadcast_room(&$state, $roomCode, $excludeCid = null) {
    if (!isset($state['rooms'][$roomCode])) {
        return;
    }
    $room = &$state['rooms'][$roomCode];
    $payload = array(
        'type' => 'room_updated',
        'room' => mp_serialize_room($state, $room),
    );
    foreach ($room['players'] as $cid) {
        if ($excludeCid !== null && $cid === $excludeCid) {
            continue;
        }
        mp_enqueue($state, $cid, $payload);
    }
}

function mp_broadcast_public_rooms(&$state) {
    $rooms = mp_public_rooms($state);
    $payload = array('type' => 'rooms_list', 'rooms' => $rooms);
    foreach ($state['clients'] as $cid => $c) {
        if (empty($c['roomCode'])) {
            mp_enqueue($state, $cid, $payload);
        }
    }
}

function mp_generate_code(&$state) {
    $alpha = MP_CODE_ALPHABET;
    $alphaLen = strlen($alpha);
    for ($attempt = 0; $attempt < 200; $attempt++) {
        $code = '';
        for ($i = 0; $i < 4; $i++) {
            $code .= $alpha[mp_rand_int(0, $alphaLen - 1)];
        }
        if (!isset($state['rooms'][$code])) {
            return $code;
        }
    }
    return 'R' . mp_rand_int(100, 999);
}

function mp_create_room(&$state, $hostCid, $isPublic, $fillBots) {
    $code = mp_generate_code($state);
    $state['clients'][$hostCid]['roomCode'] = $code;
    $state['rooms'][$code] = array(
        'roomCode' => $code,
        'hostClientId' => $hostCid,
        'isPublic' => (bool)$isPublic,
        'fillBots' => (bool)$fillBots,
        'phase' => 'lobby',
        'matchGeneration' => 0,
        'players' => array($hostCid),
    );
    return $code;
}

function mp_leave_room(&$state, $cid, $notifyCaller) {
    if (!isset($state['clients'][$cid])) {
        return;
    }
    $code = isset($state['clients'][$cid]['roomCode']) ? $state['clients'][$cid]['roomCode'] : null;
    if (!$code) {
        return;
    }
    $fighterId = $state['clients'][$cid]['fighterId'];
    $state['clients'][$cid]['roomCode'] = null;

    if ($notifyCaller) {
        mp_enqueue($state, $cid, array('type' => 'room_left'));
        mp_enqueue($state, $cid, array('type' => 'rooms_list', 'rooms' => mp_public_rooms($state)));
    }

    if (!isset($state['rooms'][$code])) {
        return;
    }
    $room = &$state['rooms'][$code];
    $remaining = array();
    foreach ($room['players'] as $p) {
        if ($p !== $cid) {
            $remaining[] = $p;
        }
    }
    $room['players'] = $remaining;

    if (count($room['players']) === 0) {
        unset($state['rooms'][$code]);
        mp_broadcast_public_rooms($state);
        return;
    }

    $wasHost = ($room['hostClientId'] === $cid);
    if ($wasHost) {
        $newHost = $room['players'][0];
        $room['hostClientId'] = $newHost;
        if (isset($state['clients'][$newHost])) {
            $state['clients'][$newHost]['ready'] = true;
        }
        if ($room['phase'] === 'in_match') {
            $room['phase'] = 'lobby';
            $lobby = mp_serialize_room($state, $room);
            foreach ($room['players'] as $pCid) {
                mp_enqueue($state, $pCid, array('type' => 'returned_to_lobby', 'room' => $lobby));
            }
            mp_broadcast_public_rooms($state);
            return;
        }
    } elseif ($room['phase'] === 'in_match') {
        mp_enqueue($state, $room['hostClientId'], array(
            'type' => 'relay_guest_left',
            'fighterId' => $fighterId,
        ));
    }

    mp_broadcast_room($state, $code);
    mp_broadcast_public_rooms($state);
}

function mp_launch_match(&$state, $code) {
    if (!isset($state['rooms'][$code])) {
        return;
    }
    $room = &$state['rooms'][$code];
    $room['phase'] = 'in_match';
    $room['matchGeneration'] = (int)$room['matchGeneration'] + 1;

    $roster = array();
    foreach ($room['players'] as $pCid) {
        if (!isset($state['clients'][$pCid])) {
            continue;
        }
        $p = $state['clients'][$pCid];
        $roster[] = array(
            'fighterId' => $p['fighterId'],
            'name' => $p['name'],
            'classId' => $p['classId'],
        );
    }

    $hostCid = $room['hostClientId'];
    if (isset($state['clients'][$hostCid])) {
        mp_enqueue($state, $hostCid, array(
            'type' => 'host_bootstrap_sim',
            'matchGeneration' => $room['matchGeneration'],
            'roomCode' => $room['roomCode'],
            'yourFighterId' => $state['clients'][$hostCid]['fighterId'],
            'fillBots' => (bool)$room['fillBots'],
            'roster' => $roster,
        ));
    }
    mp_broadcast_public_rooms($state);
}

function mp_handle_msg(&$state, $cid, $msg) {
    if (!isset($state['clients'][$cid])) {
        return;
    }
    $digits = preg_replace('/\D+/', '', $cid);
    $num = (is_string($digits) && $digits !== '') ? (int)$digits : 1;
    $type = isset($msg['type']) ? (string)$msg['type'] : '';

    switch ($type) {
        case 'ping': {
            if (isset($msg['lastPingMs']) && is_numeric($msg['lastPingMs']) && (float)$msg['lastPingMs'] > 0) {
                $state['clients'][$cid]['pingMs'] = min(999, max(1, (int)round((float)$msg['lastPingMs'])));
            }
            mp_enqueue($state, $cid, array(
                'type' => 'pong',
                'clientTime' => isset($msg['clientTime']) ? (float)$msg['clientTime'] : 0.0,
                'serverTime' => (int)round(microtime(true) * 1000),
            ));
            break;
        }

        case 'list_rooms': {
            mp_enqueue($state, $cid, array(
                'type' => 'rooms_list',
                'rooms' => mp_public_rooms($state),
            ));
            break;
        }

        case 'create_room': {
            mp_leave_room($state, $cid, false);
            $state['clients'][$cid]['name'] = mp_sanitize_name(
                isset($msg['playerName']) ? $msg['playerName'] : null,
                $num
            );
            $state['clients'][$cid]['classId'] = mp_sanitize_class(
                isset($msg['classId']) ? $msg['classId'] : null
            );
            $state['clients'][$cid]['ready'] = true;

            $code = mp_create_room(
                $state,
                $cid,
                !empty($msg['isPublic']),
                !empty($msg['fillBots'])
            );
            $room = &$state['rooms'][$code];
            mp_enqueue($state, $cid, array(
                'type' => 'room_joined',
                'room' => mp_serialize_room($state, $room),
                'yourFighterId' => $state['clients'][$cid]['fighterId'],
            ));
            mp_broadcast_public_rooms($state);
            break;
        }

        case 'join_room': {
            $rawCode = isset($msg['roomCode']) ? (string)$msg['roomCode'] : '';
            $code = strtoupper(trim($rawCode));
            if (!isset($state['rooms'][$code])) {
                mp_enqueue($state, $cid, array(
                    'type' => 'error',
                    'message' => 'Комната «' . ($code !== '' ? $code : '—') . '» не найдена.',
                ));
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['phase'] !== 'lobby') {
                mp_enqueue($state, $cid, array(
                    'type' => 'error',
                    'message' => 'Бой в этой комнате уже начался. Дождитесь завершения раунда.',
                ));
                return;
            }
            if (count($room['players']) >= MP_MAX_PLAYERS) {
                mp_enqueue($state, $cid, array(
                    'type' => 'error',
                    'message' => 'Комната заполнена (' . MP_MAX_PLAYERS . '/' . MP_MAX_PLAYERS . ').',
                ));
                return;
            }

            mp_leave_room($state, $cid, false);
            $state['clients'][$cid]['name'] = mp_sanitize_name(
                isset($msg['playerName']) ? $msg['playerName'] : null,
                $num
            );
            $state['clients'][$cid]['classId'] = mp_sanitize_class(
                isset($msg['classId']) ? $msg['classId'] : null
            );
            $state['clients'][$cid]['ready'] = true;
            $state['clients'][$cid]['roomCode'] = $code;
            $state['rooms'][$code]['players'][] = $cid;

            $roomRef = &$state['rooms'][$code];
            mp_enqueue($state, $cid, array(
                'type' => 'room_joined',
                'room' => mp_serialize_room($state, $roomRef),
                'yourFighterId' => $state['clients'][$cid]['fighterId'],
            ));
            mp_broadcast_room($state, $code, $cid);
            mp_broadcast_public_rooms($state);
            break;
        }

        case 'quick_join': {
            mp_leave_room($state, $cid, false);
            $state['clients'][$cid]['name'] = mp_sanitize_name(
                isset($msg['playerName']) ? $msg['playerName'] : null,
                $num
            );
            $state['clients'][$cid]['classId'] = mp_sanitize_class(
                isset($msg['classId']) ? $msg['classId'] : null
            );
            $state['clients'][$cid]['ready'] = true;

            $targetCode = null;
            foreach ($state['rooms'] as $rCode => $r) {
                if (!empty($r['isPublic']) && $r['phase'] === 'lobby' && count($r['players']) < MP_MAX_PLAYERS) {
                    $targetCode = $rCode;
                    break;
                }
            }

            if ($targetCode === null) {
                $targetCode = mp_create_room($state, $cid, true, true);
                $roomRef = &$state['rooms'][$targetCode];
                mp_enqueue($state, $cid, array(
                    'type' => 'room_joined',
                    'room' => mp_serialize_room($state, $roomRef),
                    'yourFighterId' => $state['clients'][$cid]['fighterId'],
                ));
            } else {
                $state['clients'][$cid]['roomCode'] = $targetCode;
                $state['rooms'][$targetCode]['players'][] = $cid;
                $roomRef = &$state['rooms'][$targetCode];
                mp_enqueue($state, $cid, array(
                    'type' => 'room_joined',
                    'room' => mp_serialize_room($state, $roomRef),
                    'yourFighterId' => $state['clients'][$cid]['fighterId'],
                ));
                mp_broadcast_room($state, $targetCode, $cid);
            }
            mp_broadcast_public_rooms($state);
            break;
        }

        case 'leave_room': {
            mp_leave_room($state, $cid, true);
            break;
        }

        case 'select_class': {
            $state['clients'][$cid]['classId'] = mp_sanitize_class(
                isset($msg['classId']) ? $msg['classId'] : null
            );
            $code = $state['clients'][$cid]['roomCode'];
            if ($code && isset($state['rooms'][$code]) && $state['rooms'][$code]['phase'] === 'lobby') {
                mp_broadcast_room($state, $code);
            }
            break;
        }

        case 'set_name': {
            $state['clients'][$cid]['name'] = mp_sanitize_name(
                isset($msg['playerName']) ? $msg['playerName'] : null,
                $num
            );
            $code = $state['clients'][$cid]['roomCode'];
            if ($code && isset($state['rooms'][$code]) && $state['rooms'][$code]['phase'] === 'lobby') {
                mp_broadcast_room($state, $code);
                mp_broadcast_public_rooms($state);
            }
            break;
        }

        case 'set_ready': {
            $state['clients'][$cid]['ready'] = !empty($msg['ready']);
            $code = $state['clients'][$cid]['roomCode'];
            if ($code && isset($state['rooms'][$code]) && $state['rooms'][$code]['phase'] === 'lobby') {
                mp_broadcast_room($state, $code);
            }
            break;
        }

        case 'set_room_options': {
            $code = $state['clients'][$cid]['roomCode'];
            if (!$code || !isset($state['rooms'][$code])) {
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['hostClientId'] !== $cid || $room['phase'] !== 'lobby') {
                return;
            }
            $room['fillBots'] = !empty($msg['fillBots']);
            $room['isPublic'] = !empty($msg['isPublic']);
            mp_broadcast_room($state, $code);
            mp_broadcast_public_rooms($state);
            break;
        }

        case 'start_match': {
            $code = $state['clients'][$cid]['roomCode'];
            if (!$code || !isset($state['rooms'][$code])) {
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['phase'] !== 'lobby') {
                return;
            }
            if ($room['hostClientId'] !== $cid) {
                mp_enqueue($state, $cid, array(
                    'type' => 'error',
                    'message' => 'Только глава комнаты может начать поединок.',
                ));
                return;
            }
            if (empty($room['fillBots']) && count($room['players']) < 2) {
                mp_enqueue($state, $cid, array(
                    'type' => 'error',
                    'message' => 'Нужно минимум 2 игрока (или включите «Дополнить ботами до 5»).',
                ));
                return;
            }
            mp_launch_match($state, $code);
            break;
        }

        case 'rematch': {
            $code = $state['clients'][$cid]['roomCode'];
            if (!$code || !isset($state['rooms'][$code])) {
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['hostClientId'] === $cid) {
                mp_launch_match($state, $code);
            } else {
                $state['clients'][$cid]['ready'] = true;
                if ($room['phase'] === 'lobby') {
                    mp_broadcast_room($state, $code);
                }
            }
            break;
        }

        case 'return_to_lobby': {
            $code = $state['clients'][$cid]['roomCode'];
            if (!$code || !isset($state['rooms'][$code])) {
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['hostClientId'] === $cid) {
                $room['phase'] = 'lobby';
                foreach ($room['players'] as $pCid) {
                    if (isset($state['clients'][$pCid])) {
                        $state['clients'][$pCid]['ready'] = true;
                    }
                }
                $lobby = mp_serialize_room($state, $room);
                foreach ($room['players'] as $pCid) {
                    mp_enqueue($state, $pCid, array(
                        'type' => 'returned_to_lobby',
                        'room' => $lobby,
                    ));
                }
                mp_broadcast_public_rooms($state);
            }
            break;
        }

        case 'host_match_init': {
            $code = $state['clients'][$cid]['roomCode'];
            if (!$code || !isset($state['rooms'][$code])) {
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['hostClientId'] !== $cid || empty($msg['snapshot'])) {
                return;
            }
            $gen = isset($msg['matchGeneration']) ? (int)$msg['matchGeneration'] : (int)$room['matchGeneration'];
            foreach ($room['players'] as $pCid) {
                if ($pCid === $cid || !isset($state['clients'][$pCid])) {
                    continue;
                }
                mp_enqueue($state, $pCid, array(
                    'type' => 'match_started',
                    'matchGeneration' => $gen,
                    'roomCode' => $room['roomCode'],
                    'yourFighterId' => $state['clients'][$pCid]['fighterId'],
                    'snapshot' => $msg['snapshot'],
                ));
            }
            break;
        }

        case 'host_snapshot': {
            $code = $state['clients'][$cid]['roomCode'];
            if (!$code || !isset($state['rooms'][$code])) {
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['hostClientId'] !== $cid || $room['phase'] !== 'in_match' || empty($msg['snapshot'])) {
                return;
            }
            $snapMsg = array(
                'type' => 'snapshot',
                'snapshot' => $msg['snapshot'],
                'events' => (isset($msg['events']) && is_array($msg['events'])) ? $msg['events'] : array(),
                'footsteps' => (isset($msg['footsteps']) && is_array($msg['footsteps'])) ? $msg['footsteps'] : array(),
                'jumps' => (isset($msg['jumps']) && is_array($msg['jumps'])) ? $msg['jumps'] : array(),
                'dodges' => (isset($msg['dodges']) && is_array($msg['dodges'])) ? $msg['dodges'] : array(),
                'landings' => (isset($msg['landings']) && is_array($msg['landings'])) ? $msg['landings'] : array(),
                'enteredFinalPhase' => !empty($msg['enteredFinalPhase']),
            );
            foreach ($room['players'] as $pCid) {
                if ($pCid === $cid) {
                    continue;
                }
                mp_enqueue($state, $pCid, $snapMsg);
            }
            break;
        }

        case 'input': {
            $code = $state['clients'][$cid]['roomCode'];
            if (!$code || !isset($state['rooms'][$code])) {
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['phase'] !== 'in_match' || $room['hostClientId'] === $cid) {
                return;
            }
            $inData = array(
                'moveX' => isset($msg['moveX']) ? (float)$msg['moveX'] : 0.0,
                'moveZ' => isset($msg['moveZ']) ? (float)$msg['moveZ'] : 0.0,
                'aimYaw' => isset($msg['aimYaw']) ? (float)$msg['aimYaw'] : 0.0,
                'sprint' => !empty($msg['sprint']),
                'attackHeld' => !empty($msg['attackHeld']),
                'attackSeq' => isset($msg['attackSeq']) ? (int)$msg['attackSeq'] : 0,
                'blockHeld' => !empty($msg['blockHeld']),
                'jumpSeq' => isset($msg['jumpSeq']) ? (int)$msg['jumpSeq'] : 0,
                'dodgeSeq' => isset($msg['dodgeSeq']) ? (int)$msg['dodgeSeq'] : 0,
                'ability1Seq' => isset($msg['ability1Seq']) ? (int)$msg['ability1Seq'] : 0,
                'ability2Seq' => isset($msg['ability2Seq']) ? (int)$msg['ability2Seq'] : 0,
                'ability3Seq' => isset($msg['ability3Seq']) ? (int)$msg['ability3Seq'] : 0,
            );
            if (isset($msg['pose']) && is_array($msg['pose'])) {
                $p = $msg['pose'];
                $inData['pose'] = array(
                    'x' => isset($p['x']) ? (float)$p['x'] : 0.0,
                    'y' => isset($p['y']) ? (float)$p['y'] : 0.0,
                    'z' => isset($p['z']) ? (float)$p['z'] : 0.0,
                    'vx' => isset($p['vx']) ? (float)$p['vx'] : 0.0,
                    'vy' => isset($p['vy']) ? (float)$p['vy'] : 0.0,
                    'vz' => isset($p['vz']) ? (float)$p['vz'] : 0.0,
                    'yaw' => isset($p['yaw']) ? (float)$p['yaw'] : 0.0,
                    'isGrounded' => !empty($p['isGrounded']),
                    'supportFloorY' => isset($p['supportFloorY']) ? (float)$p['supportFloorY'] : 0.0,
                );
            }
            mp_enqueue($state, $room['hostClientId'], array(
                'type' => 'relay_guest_input',
                'fighterId' => $state['clients'][$cid]['fighterId'],
                'input' => $inData,
            ));
            break;
        }
    }
}

// 1. Primary shared storage inside account directory (__DIR__/_runtime) so all
//    Beget Apache/PHP workers share state without PrivateTmp split-brain or open_basedir errors.
$storageMode = 'local';
$runtimeDir = __DIR__ . '/_runtime';
if (!is_dir($runtimeDir)) {
    @mkdir($runtimeDir, 0755, true);
}
if (is_dir($runtimeDir)) {
    $htFile = $runtimeDir . '/.htaccess';
    if (!is_file($htFile)) {
        @file_put_contents(
            $htFile,
            "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n"
        );
    }
    $idxFile = $runtimeDir . '/index.html';
    if (!is_file($idxFile)) {
        @file_put_contents($idxFile, '');
    }
}

$statePath = $runtimeDir . '/mp_state.json';
$fp = @fopen($statePath, 'c+');
if (!$fp) {
    $storageMode = 'temp';
    $statePath = rtrim(sys_get_temp_dir(), '/\\') . '/knights_mp_hub_' . substr(md5(__FILE__), 0, 10) . '.json';
    $fp = @fopen($statePath, 'c+');
}
if (!$fp) {
    $storageMode = 'inline';
    $statePath = __DIR__ . '/.mp_state.json';
    $fp = @fopen($statePath, 'c+');
}
if (!$fp) {
    mp_send_json(500, array('error' => 'storage_unavailable'));
}

flock($fp, LOCK_EX);
clearstatcache(true, $statePath);
rewind($fp);
$rawState = stream_get_contents($fp);
$state = (is_string($rawState) && $rawState !== '') ? json_decode($rawState, true) : null;
if (!is_array($state) || !isset($state['clients']) || !isset($state['rooms']) || !isset($state['nextId'])) {
    $state = array(
        'nextId' => 1,
        'clients' => array(),
        'rooms' => array(),
    );
}

$now = microtime(true);

// Prune stale sessions
$staleIds = array();
foreach ($state['clients'] as $cid => $c) {
    $seen = isset($c['lastSeen']) ? (float)$c['lastSeen'] : 0.0;
    if (($now - $seen) > MP_SESSION_TIMEOUT) {
        $staleIds[] = $cid;
    }
}
foreach ($staleIds as $staleCid) {
    mp_leave_room($state, $staleCid, false);
    unset($state['clients'][$staleCid]);
}

// Parse incoming request payload from form-urlencoded $_POST['payload'], raw JSON body, or $_GET['payload']
$body = null;
if (isset($_POST['payload']) && is_string($_POST['payload']) && $_POST['payload'] !== '') {
    $body = json_decode($_POST['payload'], true);
}
if (!is_array($body)) {
    $rawInput = @file_get_contents('php://input');
    if (is_string($rawInput) && $rawInput !== '') {
        if (strpos($rawInput, 'payload=') === 0) {
            $parsedForm = array();
            parse_str($rawInput, $parsedForm);
            if (isset($parsedForm['payload']) && is_string($parsedForm['payload'])) {
                $body = json_decode($parsedForm['payload'], true);
            }
        } else {
            $body = json_decode($rawInput, true);
        }
    }
}
if (!is_array($body) && isset($_GET['payload']) && is_string($_GET['payload']) && $_GET['payload'] !== '') {
    $body = json_decode($_GET['payload'], true);
}
if (!is_array($body)) {
    $body = array();
}

$responseCode = 200;
$responseData = array('ok' => true);
$dirty = false;

if (count($staleIds) > 0) {
    $dirty = true;
}

if ($action === 'health') {
    $responseData = array(
        'ok' => true,
        'php' => PHP_VERSION,
        'storage' => $storageMode,
        'relayMode' => 'host_sim',
        'onlinePlayers' => count($state['clients']),
        'activeRooms' => count($state['rooms']),
    );
} elseif ($action === 'rooms') {
    $responseData = array(
        'status' => 'ok',
        'onlinePlayers' => count($state['clients']),
        'rooms' => mp_public_rooms($state),
    );
} elseif ($action === 'connect') {
    $num = (int)$state['nextId'];
    $state['nextId'] = $num + 1;
    $cid = 'c_' . $num;
    $state['clients'][$cid] = array(
        'clientId' => $cid,
        'fighterId' => 'human_' . $num,
        'name' => 'Рыцарь #' . $num,
        'classId' => 'sword',
        'ready' => true,
        'pingMs' => 18,
        'roomCode' => null,
        'lastSeen' => $now,
        'outbox' => array(),
    );
    mp_enqueue($state, $cid, array(
        'type' => 'welcome',
        'clientId' => $cid,
        'rooms' => mp_public_rooms($state),
        'relayMode' => 'host_sim',
    ));
    $out = $state['clients'][$cid]['outbox'];
    $state['clients'][$cid]['outbox'] = array();
    $dirty = true;
    $responseData = array(
        'clientId' => $cid,
        'relayMode' => 'host_sim',
        'messages' => $out,
    );
} elseif ($action === 'sync') {
    $cid = (isset($body['clientId']) && is_string($body['clientId'])) ? $body['clientId'] : '';
    if ($cid === '' || !isset($state['clients'][$cid])) {
        $responseCode = 410;
        $responseData = array('error' => 'session_expired');
    } else {
        $state['clients'][$cid]['lastSeen'] = $now;
        if (isset($body['messages']) && is_array($body['messages'])) {
            foreach ($body['messages'] as $m) {
                if (is_array($m) && isset($m['type'])) {
                    mp_handle_msg($state, $cid, $m);
                }
            }
        }
        $out = $state['clients'][$cid]['outbox'];
        $state['clients'][$cid]['outbox'] = array();
        $dirty = true;
        $responseData = array('messages' => $out);
    }
} elseif ($action === 'disconnect') {
    $cid = (isset($body['clientId']) && is_string($body['clientId'])) ? $body['clientId'] : '';
    if ($cid !== '' && isset($state['clients'][$cid])) {
        mp_leave_room($state, $cid, false);
        unset($state['clients'][$cid]);
        $dirty = true;
    }
    $responseData = array('ok' => true);
} else {
    $responseCode = 404;
    $responseData = array('error' => 'unknown_action');
}

if ($dirty) {
    $encoded = json_encode($state, mp_json_flags());
    if (is_string($encoded) && $encoded !== '') {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $encoded);
        fflush($fp);
    }
}

flock($fp, LOCK_UN);
fclose($fp);

mp_send_json($responseCode, $responseData);
