import { CLASS_ORDER, KnightClassId } from './classes';
import { GAME_DATA_KEYS, getStorageGeneration, readGameItem, writeGameItem } from './gameStorage';

export interface PlayerProfileTotals {
  gamesPlayed: number;
  wins: number;
  kills: number;
}

export interface PlayerProfile {
  coins: number;
  unlockedKnights: KnightClassId[];
  activeKnight: KnightClassId;
  totals: PlayerProfileTotals;
}

const STORAGE_KEY = GAME_DATA_KEYS.profile;
const profileListeners = new Set<(profile: PlayerProfile) => void>();
let volatileProfile: PlayerProfile | null = null;
let volatileGeneration = -1;
let storageFailed = false;

export function onProfileSaved(listener: (profile: PlayerProfile) => void): () => void {
  profileListeners.add(listener);
  return () => profileListeners.delete(listener);
}

export const DEFAULT_PROFILE: PlayerProfile = {
  coins: 100,
  unlockedKnights: ['sword', 'dual', 'spear'],
  activeKnight: 'sword',
  totals: { gamesPlayed: 0, wins: 0, kills: 0 },
};

function copyProfile(profile: PlayerProfile): PlayerProfile {
  return { ...profile, unlockedKnights: [...profile.unlockedKnights], totals: { ...profile.totals } };
}

export function loadProfile(): PlayerProfile {
  const recent = volatileGeneration === getStorageGeneration() ? volatileProfile : null;
  try {
    const raw = readGameItem(STORAGE_KEY);
    if (!raw) return storageFailed && recent ? copyProfile(recent) : copyProfile(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const profile: PlayerProfile = {
      coins: typeof parsed.coins === 'number' ? parsed.coins : DEFAULT_PROFILE.coins,
      unlockedKnights: Array.isArray(parsed.unlockedKnights) &&
        parsed.unlockedKnights.every((c) => CLASS_ORDER.includes(c as KnightClassId))
        ? (parsed.unlockedKnights as KnightClassId[])
        : DEFAULT_PROFILE.unlockedKnights,
      activeKnight: CLASS_ORDER.includes(parsed.activeKnight as KnightClassId)
        ? (parsed.activeKnight as KnightClassId)
        : DEFAULT_PROFILE.activeKnight,
      totals: {
        gamesPlayed: typeof parsed.totals?.gamesPlayed === 'number'
          ? parsed.totals.gamesPlayed
          : DEFAULT_PROFILE.totals.gamesPlayed,
        wins: typeof parsed.totals?.wins === 'number'
          ? parsed.totals.wins
          : DEFAULT_PROFILE.totals.wins,
        kills: typeof parsed.totals?.kills === 'number'
          ? parsed.totals.kills
          : DEFAULT_PROFILE.totals.kills,
      },
    };
    // Ensure at least the first 3 classes are always unlocked (backward compat)
    for (const free of ['sword', 'dual', 'spear'] as KnightClassId[]) {
      if (!profile.unlockedKnights.includes(free)) {
        profile.unlockedKnights.push(free);
      }
    }
    if (!profile.unlockedKnights.includes(profile.activeKnight)) {
      profile.activeKnight = 'sword';
    }
    return profile;
  } catch {
    return recent ? copyProfile(recent) : copyProfile(DEFAULT_PROFILE);
  }
}

export function saveProfile(profile: PlayerProfile): void {
  volatileProfile = copyProfile(profile);
  volatileGeneration = getStorageGeneration();
  try {
    writeGameItem(STORAGE_KEY, JSON.stringify(profile));
    storageFailed = false;
  } catch {
    storageFailed = true;
  }
  for (const listener of profileListeners) {
    try { listener(profile); } catch (error) { console.warn('Profile save listener failed:', error); }
  }
}

export function addCoins(profile: PlayerProfile, amount: number): PlayerProfile {
  return { ...profile, coins: profile.coins + amount };
}

export function unlockKnight(
  profile: PlayerProfile,
  classId: KnightClassId
): { profile: PlayerProfile; success: boolean } {
  if (profile.unlockedKnights.includes(classId)) {
    return { profile, success: false };
  }
  return {
    profile: {
      ...profile,
      unlockedKnights: [...profile.unlockedKnights, classId],
    },
    success: true,
  };
}

export function setActiveKnight(
  profile: PlayerProfile,
  classId: KnightClassId
): PlayerProfile {
  if (!profile.unlockedKnights.includes(classId)) {
    return profile;
  }
  return { ...profile, activeKnight: classId };
}

export function isKnightUnlocked(
  profile: PlayerProfile,
  classId: KnightClassId
): boolean {
  return profile.unlockedKnights.includes(classId);
}

export function canAffordKnight(
  profile: PlayerProfile,
  price: number
): boolean {
  return price === 0 || profile.coins >= price;
}
