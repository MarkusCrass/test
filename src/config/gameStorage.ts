/*
 * Game-owned save keys. CrazyGames Data is selected only after SDK.init() has
 * loaded the current user's data; Yandex and standalone builds keep localStorage.
 */
export const GAME_DATA_KEYS = {
  profile: 'kls_player_profile_v1',
  soloBots: 'kls_solo_bot_progress_v1',
  settings: 'knights_last_standing_settings_v2',
  languagePreference: 'kls_language_preference_manual',
  multiplayerName: 'kls_mp_player_name_v1',
} as const;

export interface CrazyDataStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Device-wide guard prevents repeating a first-time import into later empty
// accounts on the same browser. Legacy local saves have no owner identifier.
const MIGRATION_KEY = 'kls_crazy_data_imported_v1';
const MIGRATION_ORDER = [
  GAME_DATA_KEYS.soloBots,
  GAME_DATA_KEYS.settings,
  GAME_DATA_KEYS.languagePreference,
  GAME_DATA_KEYS.multiplayerName,
  GAME_DATA_KEYS.profile, // Import last; a failed earlier write remains retryable.
] as const;

let crazyData: CrazyDataStore | null = null;
let storageGeneration = 0;
const saveErrorListeners = new Set<() => void>();

export function onCrazyDataSaveError(listener: () => void): () => void {
  saveErrorListeners.add(listener);
  return () => saveErrorListeners.delete(listener);
}

export function isCrazyDataActive(): boolean {
  return crazyData !== null;
}

/** Volatile fallback saves must not leak from a previous account/storage backend. */
export function getStorageGeneration(): number {
  return storageGeneration;
}

export function readGameItem(key: string): string | null {
  return crazyData ? crazyData.getItem(key) : localStorage.getItem(key);
}

export function writeGameItem(key: string, value: string): void {
  if (!crazyData) {
    localStorage.setItem(key, value);
    return;
  }
  try {
    crazyData.setItem(key, value);
  } catch (error) {
    console.warn('CrazyGames Data save failed; progress may not survive a reload.', error);
    for (const listener of saveErrorListeners) {
      try { listener(); } catch { /* An observer must not mask the storage error. */ }
    }
    throw error; // The game's volatile fallback retains progress for this session.
  }
}

/**
 * Activates the SDK Data module after SDK.init(), before creating the game UI.
 * Import legacy browser-local saves only when the SDK has no profile, and never
 * overwrite an existing Data key. The old local data is kept as a backup.
 * Passing null deactivates it (also useful for isolated tests).
 */
export function configureCrazyData(data: CrazyDataStore | null): boolean {
  if (!data) {
    crazyData = null;
    storageGeneration++;
    return false;
  }

  try {
    const remoteProfile = data.getItem(GAME_DATA_KEYS.profile);
    let alreadyImported = true;
    try { alreadyImported = localStorage.getItem(MIGRATION_KEY) === '1'; }
    catch { /* No localStorage access: use SDK Data without migration. */ }

    let markImported = remoteProfile !== null;
    if (!alreadyImported && remoteProfile === null) {
      for (const key of MIGRATION_ORDER) {
        if (data.getItem(key) !== null) continue;
        let previous: string | null = null;
        try { previous = localStorage.getItem(key); } catch { /* No local save to import. */ }
        if (previous !== null) {
          data.setItem(key, previous);
          markImported = true;
        }
      }
    }
    if (markImported) {
      try { localStorage.setItem(MIGRATION_KEY, '1'); }
      catch { /* Data remains the source of truth even without a local marker. */ }
    }

    crazyData = data;
    storageGeneration++;
    return true;
  } catch (error) {
    // A disabled/missing Data module must not erase pre-existing local saves.
    crazyData = null;
    storageGeneration++;
    console.warn('CrazyGames Data is unavailable; progress is stored only on this device.', error);
    return false;
  }
}
