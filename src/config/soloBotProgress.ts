/**
 * Four assistance levels for LOCAL matches only. Level 0 preserves the original
 * tactical bot behavior; the other levels give a struggling player breathing
 * room without changing health, damage, standings or coin rewards.
 */
import { GAME_DATA_KEYS, getStorageGeneration, isCrazyDataActive, readGameItem, writeGameItem } from './gameStorage';

export type SoloAssistTier = 0 | 1 | 2 | 3;

export interface SoloBotProgress {
  lossStreak: number;
  assistTier: SoloAssistTier;
}

export const DEFAULT_SOLO_BOT_PROGRESS: SoloBotProgress = {
  lossStreak: 0,
  assistTier: 0,
};

export const SOLO_BOT_ASSIST = [
  { targetPenalty: 0, hesitationChance: 0, hesitationSeconds: 0, reactionSeconds: 0, missedDefenseChance: 0 },
  { targetPenalty: 9, hesitationChance: 0.16, hesitationSeconds: 0.34, reactionSeconds: 0.04, missedDefenseChance: 0.08 },
  { targetPenalty: 17, hesitationChance: 0.3, hesitationSeconds: 0.46, reactionSeconds: 0.08, missedDefenseChance: 0.16 },
  { targetPenalty: 24, hesitationChance: 0.45, hesitationSeconds: 0.6, reactionSeconds: 0.12, missedDefenseChance: 0.25 },
] as const;

const STORAGE_KEY = GAME_DATA_KEYS.soloBots;
const CLOUD_OWNER_KEY = 'kls_cloud_profile_owner_v1';
let volatileProgress: SoloBotProgress | null = null;
let volatileKey: string | null = null;
let volatileGeneration = -1;
let storageFailed = false;

function progressStorageKey(): string {
  // CrazyGames Data already scopes progress to the active account. Only Yandex
  // uses the local cloud-owner suffix to separate accounts in one browser.
  if (isCrazyDataActive() || import.meta.env.VITE_PLATFORM === 'crazygames') return STORAGE_KEY;
  const owner = localStorage.getItem(CLOUD_OWNER_KEY);
  return owner ? `${STORAGE_KEY}_${encodeURIComponent(owner)}` : STORAGE_KEY;
}

/** Two consecutive losses unlock level 1, three level 2, four level 3. */
export function advanceSoloBotProgress(progress: SoloBotProgress, place: number): SoloBotProgress {
  if (place === 1) {
    return {
      lossStreak: 0,
      assistTier: Math.max(0, progress.assistTier - 1) as SoloAssistTier,
    };
  }
  const lossStreak = Math.min(4, progress.lossStreak + 1);
  return {
    lossStreak,
    assistTier: Math.max(progress.assistTier, lossStreak - 1) as SoloAssistTier,
  };
}

function validProgress(value: unknown): value is SoloBotProgress {
  if (!value || typeof value !== 'object') return false;
  const progress = value as Partial<SoloBotProgress>;
  return typeof progress.lossStreak === 'number' &&
    Number.isInteger(progress.lossStreak) && progress.lossStreak >= 0 && progress.lossStreak <= 4 &&
    typeof progress.assistTier === 'number' &&
    Number.isInteger(progress.assistTier) && progress.assistTier >= 0 && progress.assistTier <= 3;
}

export function loadSoloBotProgress(): SoloBotProgress {
  const recent = volatileGeneration === getStorageGeneration() ? volatileProgress : null;
  let raw: string | null;
  let key: string;
  try {
    key = progressStorageKey();
    raw = readGameItem(key);
  } catch {
    return recent ? { ...recent } : { ...DEFAULT_SOLO_BOT_PROGRESS };
  }
  if (!raw) {
    return storageFailed && volatileKey === key && recent
      ? { ...recent }
      : { ...DEFAULT_SOLO_BOT_PROGRESS };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return validProgress(parsed)
      ? { lossStreak: parsed.lossStreak, assistTier: parsed.assistTier }
      : { ...DEFAULT_SOLO_BOT_PROGRESS };
  } catch {
    return { ...DEFAULT_SOLO_BOT_PROGRESS };
  }
}

/** Persistence is intentionally separate from the coin/cloud profile schema. */
export function recordSoloBotOutcome(place: number): SoloBotProgress {
  const next = advanceSoloBotProgress(loadSoloBotProgress(), place);
  volatileProgress = next;
  volatileGeneration = getStorageGeneration();
  try {
    const key = progressStorageKey();
    volatileKey = key;
    writeGameItem(key, JSON.stringify(next));
    storageFailed = false;
  } catch {
    storageFailed = true;
  }
  return next;
}
