import type { Lang } from './locales';
import { detectLanguage, isLanguage } from './locales';

export type GraphicsQuality = 'ultra' | 'high' | 'low';

export type ArenaThemeId =
  | 'oak_tournament'
  | 'sandstone_colosseum'
  | 'azure_marble'
  | 'obsidian_citadel';

export interface ArenaThemeMeta {
  id: ArenaThemeId;
  name: string;
  shortName: string;
  subtitle: string;
  swatchPrimary: string;
  swatchSecondary: string;
  masonryTintHex: number;
  masonryRoughness: number;
  sunColorHex: number;
  hemiGroundHex: number;
}

export const ARENA_THEMES: readonly ArenaThemeMeta[] = [
  {
    id: 'oak_tournament',
    name: 'Дубовый помост',
    shortName: 'Дерево',
    subtitle: 'Тёплый настил из светлого и мореного дуба + светлый известняк',
    swatchPrimary: '#b87a3d',
    swatchSecondary: '#6b4223',
    masonryTintHex: 0xffefd6,
    masonryRoughness: 0.72,
    sunColorHex: 0xffebd0,
    hemiGroundHex: 0x7a5938,
  },
  {
    id: 'sandstone_colosseum',
    name: 'Золотой песчаник',
    shortName: 'Песчаник',
    subtitle: 'Турнирный песок ристалища и солнечные золотистые бастионы',
    swatchPrimary: '#dfae67',
    swatchSecondary: '#a66e38',
    masonryTintHex: 0xf7d69e,
    masonryRoughness: 0.78,
    sunColorHex: 0xffe2b0,
    hemiGroundHex: 0x876238,
  },
  {
    id: 'azure_marble',
    name: 'Сапфировый мрамор',
    shortName: 'Мрамор',
    subtitle: 'Светлый королевский камень с контрастным мореным дубом',
    swatchPrimary: '#8eb8e8',
    swatchSecondary: '#475b78',
    masonryTintHex: 0xd8ebff,
    masonryRoughness: 0.62,
    sunColorHex: 0xeaf4ff,
    hemiGroundHex: 0x4c5d75,
  },
  {
    id: 'obsidian_citadel',
    name: 'Тёмная цитадель',
    shortName: 'Базальт',
    subtitle: 'Суровый тёмный базальт и мореный дуб в отблесках огня',
    swatchPrimary: '#5d6778',
    swatchSecondary: '#2d333f',
    masonryTintHex: 0x8d97ab,
    masonryRoughness: 0.8,
    sunColorHex: 0xffe4be,
    hemiGroundHex: 0x3b404c,
  },
] as const;

export function getArenaThemeMeta(id: ArenaThemeId): ArenaThemeMeta {
  return ARENA_THEMES.find((t) => t.id === id) ?? ARENA_THEMES[0];
}

export interface GameSettings {
  mouseSensitivity: number; // 0.2 .. 2.5 (default 1.0)
  masterVolume: number; // 0.0 .. 1.0 (default 0.7)
  debugHitboxes: boolean; // F3 toggle or settings checkbox
  pixelScale: 1 | 2 | 3; // 1 = crisp HD Stylized 3D (default), 2/3 = edge-aware 3D pixel art
  graphicsQuality: GraphicsQuality; // default 'ultra'
  arenaTheme: ArenaThemeId; // default 'oak_tournament' (3D Wood & Warm Limestone)
  language: Lang; // default 'ru'
}

const STORAGE_KEY = 'knights_last_standing_settings_v2';

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.0,
  masterVolume: 0.7,
  debugHitboxes: false,
  pixelScale: 1,
  graphicsQuality: 'ultra',
  arenaTheme: 'oak_tournament',
  language: 'ru',
};

export function isValidArenaTheme(v: unknown): v is ArenaThemeId {
  return (
    v === 'oak_tournament' ||
    v === 'sandstone_colosseum' ||
    v === 'azure_marble' ||
    v === 'obsidian_citadel'
  );
}

export function loadSettings(): GameSettings {
  const crazyDefault = import.meta.env.VITE_PLATFORM === 'crazygames';
  const defaultLanguage = crazyDefault ? 'en' : detectLanguage(typeof navigator === 'undefined' ? undefined : navigator.language);
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_SETTINGS, language: defaultLanguage };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, language: defaultLanguage };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const q = parsed.graphicsQuality;
    return {
      mouseSensitivity: clamp(
        typeof parsed.mouseSensitivity === 'number'
          ? parsed.mouseSensitivity
          : 1.0,
        0.2,
        2.5
      ),
      masterVolume: clamp(
        typeof parsed.masterVolume === 'number' ? parsed.masterVolume : 0.7,
        0,
        1
      ),
      debugHitboxes: Boolean(parsed.debugHitboxes),
      pixelScale:
        parsed.pixelScale === 2 || parsed.pixelScale === 3
          ? parsed.pixelScale
          : 1,
      graphicsQuality:
        q === 'ultra' || q === 'high' || q === 'low' ? q : 'ultra',
      arenaTheme: isValidArenaTheme(parsed.arenaTheme)
        ? parsed.arenaTheme
        : 'oak_tournament',
      language: crazyDefault && !hasSavedLanguage() ? 'en' : isLanguage(parsed.language) ? parsed.language : defaultLanguage,
    };
  } catch {
    return { ...DEFAULT_SETTINGS, language: defaultLanguage };
  }
}

/** Whether the player has explicitly stored a language preference. */
export function hasSavedLanguage(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const mode = localStorage.getItem('kls_language_preference_manual');
    if (mode === 'auto') return false;
    const value = localStorage.getItem(STORAGE_KEY);
    return value !== null && isLanguage((JSON.parse(value) as Partial<GameSettings>).language);
  } catch {
    return false;
  }
}

/** Only the language selector, not other settings, opts out of platform detection. */
export function markLanguageSelected(): void {
  try { localStorage.setItem('kls_language_preference_manual', 'manual'); } catch { /* storage unavailable */ }
}

export function saveSettings(settings: GameSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      if (localStorage.getItem('kls_language_preference_manual') === null && localStorage.getItem(STORAGE_KEY) === null) {
        localStorage.setItem('kls_language_preference_manual', 'auto');
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
