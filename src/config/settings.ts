export type GraphicsQuality = 'ultra' | 'high' | 'low';

export interface GameSettings {
  mouseSensitivity: number; // 0.2 .. 2.5 (default 1.0)
  masterVolume: number; // 0.0 .. 1.0 (default 0.7)
  debugHitboxes: boolean; // F3 toggle or settings checkbox
  pixelScale: 1 | 2 | 3; // 1 = crisp HD Stylized 3D (default), 2/3 = edge-aware 3D pixel art
  graphicsQuality: GraphicsQuality; // default 'ultra'
}

const STORAGE_KEY = 'knights_last_standing_settings_v2';

export const DEFAULT_SETTINGS: GameSettings = {
  mouseSensitivity: 1.0,
  masterVolume: 0.7,
  debugHitboxes: false,
  pixelScale: 1,
  graphicsQuality: 'ultra',
};

export function loadSettings(): GameSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const q = parsed.graphicsQuality;
    return {
      mouseSensitivity: clamp(
        typeof parsed.mouseSensitivity === 'number' ? parsed.mouseSensitivity : 1.0,
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
        parsed.pixelScale === 2 || parsed.pixelScale === 3 ? parsed.pixelScale : 1,
      graphicsQuality:
        q === 'ultra' || q === 'high' || q === 'low' ? q : 'ultra',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Ignore storage errors in restricted environments
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
