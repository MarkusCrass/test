<?php
/**
 * KNIGHTS: LAST STANDING — Beget / Shared Hosting Multiplayer Relay (PHP 7.4+ / 8.x)
 * Coordinates 5-player rooms, matchmaking, room codes, and relays Host-Authoritative
 * 60 Hz snapshots & guest inputs with atomic flock() state storage.
 */
@ini_set('display_errors', '0');
error_reporting(0);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = isset($_GET['action']) ? (string)$_GET['action'] : '';
if ($action === '') {
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if (preg_match('#/api/mp/(connect|sync|disconnect)$#', (string)$uri, $m)) {
        $action = $m[1];
    } elseif (preg_match('#/api/rooms$#', (string)$uri)) {
        $action = 'rooms';
    } elseif (preg_match('#/api/client-(ready|error)$#', (string)$uri)) {
        $action = 'noop';
    }
}

if ($action === 'noop') {
    http_response_code(204);
    exit;
}

const MP_MAX_PLAYERS = 5;
const MP_SESSION_TIMEOUT = 18.0;
const MP_MAX_OUTBOX = 48;
const MP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MP_VALID_CLASSES = ['sword', 'dual', 'spear', 'hammer'];

function mp_send_json(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function mp_sanitize_name($raw, int $fallbackNum): string {
    if (!is_string($raw)) {
        return "Рыцарь #{$fallbackNum}";
    }
    $clean = preg_replace('/[\r\n\t<>]/u', '', $raw);
    $clean = trim((string)$clean);
    if (function_exists('mb_substr') && function_exists('mb_strlen')) {
        $clean = mb_substr($clean, 0, 18, 'UTF-8');
        return mb_strlen($clean, 'UTF-8') >= 2 ? $clean : "Рыцарь #{$fallbackNum}";
    }
    $clean = substr($clean, 0, 36);
    return strlen($clean) >= 2 ? $clean : "Рыцарь #{$fallbackNum}";
}

function mp_sanitize_class($raw): string {
    if (is_string($raw) && in_array($raw, MP_VALID_CLASSES, true)) {
        return $raw;
    }
    return 'sword';
}

function mp_enqueue(array &$state, string $clientId, array $msg): void {
    if (!isset($state['clients'][$clientId])) {
        return;
    }
    $outbox = &$state['clients'][$clientId]['outbox'];
    $type = $msg['type'] ?? '';

    // Coalesce pure position-only snapshots
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
            if (
                ($prev['type'] ?? '') === 'snapshot' &&
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
        $fid = $msg['fighterId'] ?? '';
        for ($i = count($outbox) - 1; $i >= 0; $i--) {
            if (($outbox[$i]['type'] ?? '') === 'relay_guest_input' && ($outbox[$i]['fighterId'] ?? '') === $fid) {
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

function mp_public_rooms(array &$state): array {
    $list = [];
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
        $list[] = [
            'roomCode' => $r['roomCode'],
            'hostName' => $hostName,
            'playerCount' => count($r['players']),
            'maxPlayers' => MP_MAX_PLAYERS,
            'fillBots' => (bool)$r['fillBots'],
            'phase' => $r['phase'],
        ];
    }
    return $list;
}

function mp_serialize_room(array &$state, array &$room): array {
    $players = [];
    foreach ($room['players'] as $cid) {
        if (!isset($state['clients'][$cid])) {
            continue;
        }
        $c = $state['clients'][$cid];
        $players[] = [
            'clientId' => $c['clientId'],
            'fighterId' => $c['fighterId'],
            'name' => $c['name'],
            'classId' => $c['classId'],
            'ready' => (bool)$c['ready'],
            'isHost' => ($c['clientId'] === $room['hostClientId']),
            'pingMs' => (int)$c['pingMs'],
        ];
    }
    return [
        'roomCode' => $room['roomCode'],
        'hostClientId' => $room['hostClientId'],
        'isPublic' => (bool)$room['isPublic'],
        'fillBots' => (bool)$room['fillBots'],
        'phase' => $room['phase'],
        'players' => $players,
    ];
}

function mp_broadcast_room(array &$state, string $roomCode, ?string $excludeCid = null): void {
    if (!isset($state['rooms'][$roomCode])) {
        return;
    }
    $room = &$state['rooms'][$roomCode];
    $payload = [
        'type' => 'room_updated',
        'room' => mp_serialize_room($state, $room),
    ];
    foreach ($room['players'] as $cid) {
        if ($cid === $excludeCid) {
            continue;
        }
        mp_enqueue($state, $cid, $payload);
    }
}

function mp_broadcast_public_rooms(array &$state): void {
    $rooms = mp_public_rooms($state);
    $payload = ['type' => 'rooms_list', 'rooms' => $rooms];
    foreach ($state['clients'] as $cid => $c) {
        if (empty($c['roomCode'])) {
            mp_enqueue($state, $cid, $payload);
        }
    }
}

function mp_generate_code(array &$state): string {
    $alphaLen = strlen(MP_CODE_ALPHABET);
    for ($attempt = 0; $attempt < 200; $attempt++) {
        $code = '';
        for ($i = 0; $i < 4; $i++) {
            $code .= MP_CODE_ALPHABET[random_int(0, $alphaLen - 1)];
        }
        if (!isset($state['rooms'][$code])) {
            return $code;
        }
    }
    return 'R' . random_int(100, 999);
}

function mp_create_room(array &$state, string $hostCid, bool $isPublic, bool $fillBots): string {
    $code = mp_generate_code($state);
    $state['clients'][$hostCid]['roomCode'] = $code;
    $state['rooms'][$code] = [
        'roomCode' => $code,
        'hostClientId' => $hostCid,
        'isPublic' => $isPublic,
        'fillBots' => $fillBots,
        'phase' => 'lobby',
        'matchGeneration' => 0,
        'players' => [$hostCid],
    ];
    return $code;
}

function mp_leave_room(array &$state, string $cid, bool $notifyCaller): void {
    if (!isset($state['clients'][$cid])) {
        return;
    }
    $code = $state['clients'][$cid]['roomCode'] ?? null;
    if (!$code) {
        return;
    }
    $fighterId = $state['clients'][$cid]['fighterId'];
    $state['clients'][$cid]['roomCode'] = null;

    if ($notifyCaller) {
        mp_enqueue($state, $cid, ['type' => 'room_left']);
        mp_enqueue($state, $cid, ['type' => 'rooms_list', 'rooms' => mp_public_rooms($state)]);
    }

    if (!isset($state['rooms'][$code])) {
        return;
    }
    $room = &$state['rooms'][$code];
    $room['players'] = array_values(array_filter(
        $room['players'],
        static function ($p) use ($cid) { return $p !== $cid; }
    ));

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
                mp_enqueue($state, $pCid, ['type' => 'returned_to_lobby', 'room' => $lobby]);
            }
            mp_broadcast_public_rooms($state);
            return;
        }
    } elseif ($room['phase'] === 'in_match') {
        mp_enqueue($state, $room['hostClientId'], [
            'type' => 'relay_guest_left',
            'fighterId' => $fighterId,
        ]);
    }

    mp_broadcast_room($state, $code);
    mp_broadcast_public_rooms($state);
}

function mp_launch_match(array &$state, string $code): void {
    if (!isset($state['rooms'][$code])) {
        return;
    }
    $room = &$state['rooms'][$code];
    $room['phase'] = 'in_match';
    $room['matchGeneration'] = (int)$room['matchGeneration'] + 1;

    $roster = [];
    foreach ($room['players'] as $pCid) {
        if (!isset($state['clients'][$pCid])) {
            continue;
        }
        $p = $state['clients'][$pCid];
        $roster[] = [
            'fighterId' => $p['fighterId'],
            'name' => $p['name'],
            'classId' => $p['classId'],
        ];
    }

    $hostCid = $room['hostClientId'];
    if (isset($state['clients'][$hostCid])) {
        mp_enqueue($state, $hostCid, [
            'type' => 'host_bootstrap_sim',
            'matchGeneration' => $room['matchGeneration'],
            'roomCode' => $room['roomCode'],
            'yourFighterId' => $state['clients'][$hostCid]['fighterId'],
            'fillBots' => (bool)$room['fillBots'],
            'roster' => $roster,
        ]);
    }
    mp_broadcast_public_rooms($state);
}

function mp_handle_msg(array &$state, string $cid, array $msg): void {
    if (!isset($state['clients'][$cid])) {
        return;
    }
    $num = (int)preg_replace('/\D+/', '', $cid) ?: 1;
    $type = $msg['type'] ?? '';

    switch ($type) {
        case 'ping': {
            if (isset($msg['lastPingMs']) && is_numeric($msg['lastPingMs']) && $msg['lastPingMs'] > 0) {
                $state['clients'][$cid]['pingMs'] = min(999, max(1, (int)round((float)$msg['lastPingMs'])));
            }
            mp_enqueue($state, $cid, [
                'type' => 'pong',
                'clientTime' => (float)($msg['clientTime'] ?? 0),
                'serverTime' => (int)round(microtime(true) * 1000),
            ]);
            break;
        }

        case 'list_rooms': {
            mp_enqueue($state, $cid, [
                'type' => 'rooms_list',
                'rooms' => mp_public_rooms($state),
            ]);
            break;
        }

        case 'create_room': {
            mp_leave_room($state, $cid, false);
            $state['clients'][$cid]['name'] = mp_sanitize_name($msg['playerName'] ?? null, $num);
            $state['clients'][$cid]['classId'] = mp_sanitize_class($msg['classId'] ?? null);
            $state['clients'][$cid]['ready'] = true;

            $code = mp_create_room(
                $state,
                $cid,
                !empty($msg['isPublic']),
                !empty($msg['fillBots'])
            );
            $room = &$state['rooms'][$code];
            mp_enqueue($state, $cid, [
                'type' => 'room_joined',
                'room' => mp_serialize_room($state, $room),
                'yourFighterId' => $state['clients'][$cid]['fighterId'],
            ]);
            mp_broadcast_public_rooms($state);
            break;
        }

        case 'join_room': {
            $code = strtoupper(trim((string)($msg['roomCode'] ?? '')));
            if (!isset($state['rooms'][$code])) {
                mp_enqueue($state, $cid, [
                    'type' => 'error',
                    'message' => 'Комната «' . ($code !== '' ? $code : '????') . '» не найдена.',
                ]);
                return;
            }
            $room = &$state['rooms'][$code];
            if ($room['phase'] !== 'lobby') {
                mp_enqueue($state, $cid, [
                    'type' => 'error',
                    'message' => 'Бой в этой комнате уже начался. Дождитесь завершения раунда.',
                ]);
                return;
            }
            if (count($room['players']) >= MP_MAX_PLAYERS) {
                mp_enqueue($state, $cid, [
                    'type' => 'error',
                    'message' => 'Комната заполнена (' . MP_MAX_PLAYERS . '/' . MP_MAX_PLAYERS . ').',
                ]);
                return;
            }

            mp_leave_room($state, $cid, false);
            $state['clients'][$cid]['name'] = mp_sanitize_name($msg['playerName'] ?? null, $num);
            $state['clients'][$cid]['classId'] = mp_sanitize_class($msg['classId'] ?? null);
            $state['clients'][$cid]['ready'] = true;
            $state['clients'][$cid]['roomCode'] = $code;
            $state['rooms'][$code]['players'][] = $cid;

            $roomRef = &$state['rooms'][$code];
            mp_enqueue($state, $cid, [
                'type' => 'room_joined',
                'room' => mp_serialize_room($state, $roomRef),
                'yourFighterId' => $state['clients'][$cid]['fighterId'],
            ]);
            mp_broadcast_room($state, $code, $cid);
            mp_broadcast_public_rooms($state);
            break;
        }

        case 'quick_join': {
            mp_leave_room($state, $cid, false);
            $state['clients'][$cid]['name'] = mp_sanitize_name($msg['playerName'] ?? null, $num);
            $state['clients'][$cid]['classId'] = mp_sanitize_class($msg['classId'] ?? null);
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
                mp_enqueue($state, $cid, [
                    'type' => 'room_joined',
                    'room' => mp_serialize_room($state, $roomRef),
                    'yourFighterId' => $state['clients'][$cid]['fighterId'],
                ]);
            } else {
                $state['clients'][$cid]['roomCode'] = $targetCode;
                $state['rooms'][$targetCode]['players'][] = $cid;
                $roomRef = &$state['rooms'][$targetCode];
                mp_enqueue($state, $cid, [
                    'type' => 'room_joined',
                    'room' => mp_serialize_room($state, $roomRef),
                    'yourFighterId' => $state['clients'][$cid]['fighterId'],
                ]);
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
            $state['clients'][$cid]['classId'] = mp_sanitize_class($msg['classId'] ?? null);
            $code = $state['clients'][$cid]['roomCode'];
            if ($code && isset($state['rooms'][$code]) && $state['rooms'][$code]['phase'] === 'lobby') {
                mp_broadcast_room($state, $code);
            }
            break;
        }

        case 'set_name': {
            $state['clients'][$cid]['name'] = mp_sanitize_name($msg['playerName'] ?? null, $num);
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
                mp_enqueue($state, $cid, [
                    'type' => 'error',
                    'message' => 'Только глава комнаты может начать поединок.',
                ]);
                return;
            }
            if (empty($room['fillBots']) && count($room['players']) < 2) {
                mp_enqueue($state, $cid, [
                    'type' => 'error',
                    'message' => 'Нужно минимум 2 игрока (или включите «Дополнить ботами до 5»).',
                ]);
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
                    mp_enqueue($state, $pCid, [
                        'type' => 'returned_to_lobby',
                        'room' => $lobby,
                    ]);
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
            $gen = (int)($msg['matchGeneration'] ?? $room['matchGeneration']);
            foreach ($room['players'] as $pCid) {
                if ($pCid === $cid || !isset($state['clients'][$pCid])) {
                    continue;
                }
                mp_enqueue($state, $pCid, [
                    'type' => 'match_started',
                    'matchGeneration' => $gen,
                    'roomCode' => $room['roomCode'],
                    'yourFighterId' => $state['clients'][$pCid]['fighterId'],
                    'snapshot' => $msg['snapshot'],
                ]);
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
            $snapMsg = [
                'type' => 'snapshot',
                'snapshot' => $msg['snapshot'],
                'events' => isset($msg['events']) && is_array($msg['events']) ? $msg['events'] : [],
                'footsteps' => isset($msg['footsteps']) && is_array($msg['footsteps']) ? $msg['footsteps'] : [],
                'jumps' => isset($msg['jumps']) && is_array($msg['jumps']) ? $msg['jumps'] : [],
                'dodges' => isset($msg['dodges']) && is_array($msg['dodges']) ? $msg['dodges'] : [],
                'landings' => isset($msg['landings']) && is_array($msg['landings']) ? $msg['landings'] : [],
                'enteredFinalPhase' => !empty($msg['enteredFinalPhase']),
            ];
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
            mp_enqueue($state, $room['hostClientId'], [
                'type' => 'relay_guest_input',
                'fighterId' => $state['clients'][$cid]['fighterId'],
                'input' => [
                    'moveX' => (float)($msg['moveX'] ?? 0),
                    'moveZ' => (float)($msg['moveZ'] ?? 0),
                    'aimYaw' => (float)($msg['aimYaw'] ?? 0),
                    'sprint' => !empty($msg['sprint']),
                    'attackHeld' => !empty($msg['attackHeld']),
                    'blockHeld' => !empty($msg['blockHeld']),
                    'jumpSeq' => (int)($msg['jumpSeq'] ?? 0),
                    'dodgeSeq' => (int)($msg['dodgeSeq'] ?? 0),
                    'ability1Seq' => (int)($msg['ability1Seq'] ?? 0),
                    'ability2Seq' => (int)($msg['ability2Seq'] ?? 0),
                ],
            ]);
            break;
        }
    }
}

$statePath = rtrim(sys_get_temp_dir(), '/\\') . '/knights_mp_hub_' . substr(md5(__FILE__), 0, 10) . '.json';
$fp = @fopen($statePath, 'c+');
if (!$fp) {
    // Fallback to local api directory if sys_get_temp_dir is restricted
    $statePath = __DIR__ . '/.mp_state.json';
    $fp = @fopen($statePath, 'c+');
}
if (!$fp) {
    mp_send_json(500, ['error' => 'storage_unavailable']);
}

flock($fp, LOCK_EX);
rewind($fp);
$rawState = stream_get_contents($fp);
$state = is_string($rawState) && $rawState !== '' ? json_decode($rawState, true) : null;
if (!is_array($state) || !isset($state['clients'], $state['rooms'], $state['nextId'])) {
    $state = [
        'nextId' => 1,
        'clients' => [],
        'rooms' => [],
    ];
}

$now = microtime(true);

// Prune stale sessions
$staleIds = [];
foreach ($state['clients'] as $cid => $c) {
    if (($now - (float)($c['lastSeen'] ?? 0)) > MP_SESSION_TIMEOUT) {
        $staleIds[] = $cid;
    }
}
foreach ($staleIds as $staleCid) {
    mp_leave_room($state, $staleCid, false);
    unset($state['clients'][$staleCid]);
}

$rawInput = file_get_contents('php://input');
$body = is_string($rawInput) && $rawInput !== '' ? json_decode($rawInput, true) : [];
if (!is_array($body)) {
    $body = [];
}

$responseCode = 200;
$responseData = ['ok' => true];

if ($action === 'rooms') {
    $responseData = [
        'status' => 'ok',
        'onlinePlayers' => count($state['clients']),
        'rooms' => mp_public_rooms($state),
    ];
} elseif ($action === 'connect') {
    $num = (int)$state['nextId'];
    $state['nextId'] = $num + 1;
    $cid = "c_{$num}";
    $state['clients'][$cid] = [
        'clientId' => $cid,
        'fighterId' => "human_{$num}",
        'name' => "Рыцарь #{$num}",
        'classId' => 'sword',
        'ready' => true,
        'pingMs' => 18,
        'roomCode' => null,
        'lastSeen' => $now,
        'outbox' => [],
    ];
    mp_enqueue($state, $cid, [
        'type' => 'welcome',
        'clientId' => $cid,
        'rooms' => mp_public_rooms($state),
        'relayMode' => 'host_sim',
    ]);
    $out = $state['clients'][$cid]['outbox'];
    $state['clients'][$cid]['outbox'] = [];
    $responseData = [
        'clientId' => $cid,
        'messages' => $out,
    ];
} elseif ($action === 'sync') {
    $cid = isset($body['clientId']) && is_string($body['clientId']) ? $body['clientId'] : '';
    if ($cid === '' || !isset($state['clients'][$cid])) {
        $responseCode = 410;
        $responseData = ['error' => 'session_expired'];
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
        $state['clients'][$cid]['outbox'] = [];
        $responseData = ['messages' => $out];
    }
} elseif ($action === 'disconnect') {
    $cid = isset($body['clientId']) && is_string($body['clientId']) ? $body['clientId'] : '';
    if ($cid !== '' && isset($state['clients'][$cid])) {
        mp_leave_room($state, $cid, false);
        unset($state['clients'][$cid]);
    }
    $responseData = ['ok' => true];
} else {
    $responseCode = 404;
    $responseData = ['error' => 'unknown_action'];
}

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

mp_send_json($responseCode, $responseData);
