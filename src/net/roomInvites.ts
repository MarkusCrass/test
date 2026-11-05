/* Cross-platform room invites. Only a validated server-issued four-character
 * code may be used to join a lobby or placed in a shareable URL/SDK payload. */
export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

export function roomCodeFromParams(params: unknown): string | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  return normalizeRoomCode((params as Record<string, unknown>).roomCode);
}

export function roomCodeFromWebUrl(href: string): string | null {
  try { return normalizeRoomCode(new URL(href).searchParams.get('room')); }
  catch { return null; }
}

/** The standalone site shares its own public URL, not a relay or iframe URL. */
export function webRoomInviteUrl(href: string, roomCode: string): string | null {
  const code = normalizeRoomCode(roomCode);
  if (!code) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.searchParams.set('room', code);
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

/** Yandex passes ?payload=... from its GAME page into the iframe via the SDK. */
export function roomCodeFromYandexPayload(payload: unknown): string | null {
  return typeof payload === 'string' && payload.startsWith('room:')
    ? normalizeRoomCode(payload.slice('room:'.length))
    : null;
}

export function yandexRoomInviteUrl(appId: unknown, roomCode: string): string | null {
  const code = normalizeRoomCode(roomCode);
  // Never share a preview/iframe origin or fabricate an app ID before the SDK
  // identifies the published game. The player can still copy the room code.
  if (!code || typeof appId !== 'string' || !/^\d{1,16}$/.test(appId)) return null;
  const url = new URL(`https://yandex.ru/games/app/${appId}`);
  url.searchParams.set('payload', `room:${code}`);
  return url.toString();
}
