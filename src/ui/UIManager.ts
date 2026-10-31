import { assetUrl } from '../config/assetUrls';
import {
  CLASS_ORDER,
  KNIGHT_CLASSES,
  KnightClassId,
} from '../config/classes';
import {
  Lang,
  LANGS,
  t,
  isRtl,
  classDisplayName,
} from '../config/locales';
import {
  addCoins,
  isKnightUnlocked,
  loadProfile,
  saveProfile,
  unlockKnight,
  PlayerProfile,
} from '../config/playerProfile';
import { botDisplayName } from '../config/botNames';
import { abilityText, heroText } from '../config/heroLocales';
import { AD_COIN_REWARD, KNIGHT_UNLOCK_CONFIG } from '../config/rewards';
import {
  ARENA_THEMES,
  ArenaThemeId,
  GameSettings,
  getArenaThemeMeta,
  markLanguageSelected,
  GraphicsQuality,
} from '../config/settings';
import { Fighter } from '../core/Fighter';
import { MatchManager, MatchMode, MatchState } from '../core/MatchManager';
import { NetConnectionStatus } from '../net/MultiplayerClient';
import {
  MAX_PLAYERS_PER_ROOM,
  RoomLobbyState,
  RoomSummary,
} from '../net/protocol';
import type { ProjectedFighterLabel } from '../render/WorldRenderer';
import {
  buildClassSkillBar,
  getSkillIconUrl,
  SkillSlotDescriptor,
  SkillSlotKey,
} from './skillIcons';

export interface HudReticleViewState {
  normX: number;
  normY: number;
  freeCursorAim: boolean;
  freeLookActive: boolean;
  targetName: string | null;
  targetHpRatio: number;
}

export interface UICallbacks {
  onOpenSelection: () => void;
  onOpenMultiplayer: () => void;
  onStartMatch: (classId: KnightClassId, mode: MatchMode) => void;
  onRestartMatch: () => void;
  onReturnMainMenu: () => void;
  onResumeGame: () => void;
  onCycleSpectator: (delta: 1 | -1) => void;
  onSettingsChanged: (next: GameSettings) => void;
  onWatchRewardedAd?: (reward: () => void, finished: (rewarded: boolean) => void) => boolean;
  onSelectPreviewClass: (
    classId: KnightClassId,
    userInitiated?: boolean
  ) => void;
  onTriggerSkillSlot?: (slotKey: SkillSlotKey) => void;

  // Multiplayer callbacks
  onMpQuickJoin: (playerName: string, classId: KnightClassId) => void;
  onMpCreateRoom: (opts: {
    playerName: string;
    classId: KnightClassId;
    fillBots: boolean;
    isPublic: boolean;
  }) => void;
  onMpJoinRoom: (
    roomCode: string,
    playerName: string,
    classId: KnightClassId
  ) => void;
  onMpRefreshRooms: () => void;
  onMpLeaveRoom: () => void;
  onMpSelectClass: (classId: KnightClassId) => void;
  onMpSetName: (playerName: string) => void;
  onMpToggleReady: (ready: boolean) => void;
  onMpRoomOptions: (opts: { fillBots: boolean; isPublic: boolean }) => void;
  onMpStartMatch: () => void;
  onMpReturnToLobby: () => void;
}

const MP_NAME_STORAGE_KEY = 'kls_mp_player_name_v1';

const CLASS_EMBLEM_ICON: Record<KnightClassId, string> = {
  sword: 'sword_light.svg',
  dual: 'dual_light.svg',
  spear: 'spear_light.svg',
  hammer: 'hammer_light.svg',
  barbarian: 'barbarian_light.svg',
  duelist: 'duelist_light.svg',
  skeleton_knight: 'skeleton_knight_light.svg',
  skeleton_reaper: 'skeleton_reaper_light.svg',
  skeleton_berserker: 'skeleton_berserker_light.svg',
};

/**
 * Crisp modern vector icons (rounded stroke geometry).
 */
const ICONS = {
  play: `<svg class="ui-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11.02-6.86a1 1 0 0 0 0-1.7L9.52 4.29A1 1 0 0 0 8 5.14z"/></svg>`,
  blades: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M9.5 17.5L21 6V3h-3L6.5 14.5"/><path d="M11 19l-6-6"/><path d="M8 16l-4 4"/></svg>`,
  globe: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><ellipse cx="12" cy="12" rx="4.2" ry="9"/></svg>`,
  bolt: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2"/></svg>`,
  shield: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  sliders: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2.2" fill="currentColor"/><circle cx="15" cy="12" r="2.2" fill="currentColor"/><circle cx="10" cy="18" r="2.2" fill="currentColor"/></svg>`,
  gamepad: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="5"/><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="10.5" r="1" fill="currentColor"/><circle cx="17.5" cy="13.5" r="1" fill="currentColor"/></svg>`,
  arrowLeft: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>`,
  arrowRight: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`,
  chevronRight: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>`,
  refresh: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/></svg>`,
  copy: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  bot: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 3v4"/><circle cx="9.5" cy="13" r="1.3" fill="currentColor"/><circle cx="14.5" cy="13" r="1.3" fill="currentColor"/></svg>`,
  user: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  users: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  trophy: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H3.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h2.5a2.5 2.5 0 0 0 0-5H18"/><path d="M6 4h12v6a6 6 0 0 1-12 0V4z"/><path d="M12 16v4"/><path d="M8 20h8"/></svg>`,
  skull: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 3.1 1.7 5.7 4 7v3h8v-3c2.3-1.3 4-3.9 4-7a8 8 0 0 0-8-8z"/><circle cx="9.2" cy="11.5" r="1.3" fill="currentColor"/><circle cx="14.8" cy="11.5" r="1.3" fill="currentColor"/></svg>`,
  clock: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`,
  check: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  close: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  door: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  rotate3d: `<svg class="ui-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 12c0-1.66 4-3 9-3s9 1.34 9 3"/><polyline points="15 17 12 15 15 13"/></svg>`,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadSavedPlayerName(lang: Lang): string {
  try {
    const saved = localStorage.getItem(MP_NAME_STORAGE_KEY);
    if (saved && saved.trim().length >= 2) {
      return saved.trim().slice(0, 18);
    }
  } catch {
    // Ignore storage block
  }
  return lang === 'ru' ? 'Сэр Артур' : lang === 'ar' ? 'السير آرثر' : 'Sir Arthur';
}

function savePlayerName(name: string): void {
  try {
    localStorage.setItem(MP_NAME_STORAGE_KEY, name.trim().slice(0, 18));
  } catch {
    // Ignore
  }
}

interface ActionBarSlotRefs {
  descriptor: SkillSlotDescriptor;
  rootEl: HTMLElement;
  cdVeilEl: HTMLElement;
  cdNumEl: HTMLElement;
}

/**
 * Modern Spatial Glass & Bento Hero Hub UI Manager:
 * - Persistent Floating Top Pill Dock (Арена / Герои / Онлайн + Управление / Настройки)
 * - Live 3D Hero in Main Hub with 1-click hero switching, interactive mode cards & glowing Play CTA
 * - Bento Hero Inspector with dynamic class ambient glow, capsule stat bars & interactive skill dock
 * - Sleek 5-player Online Party Hub & floating rounded glass Combat HUD
 */
export class UIManager {
  private readonly root: HTMLElement;
  private readonly callbacks: UICallbacks;
  private settings: GameSettings;

  // Persistent Hub Top Navigation
  private readonly hubTopDockEl: HTMLElement;
  private readonly navTabArenaEl: HTMLButtonElement;
  private readonly navTabHeroesEl: HTMLButtonElement;
  private readonly navTabOnlineEl: HTMLButtonElement;

  // Screen containers
  private readonly mainMenuEl: HTMLElement;
  private readonly hubHeroStripEl: HTMLElement;
  private readonly hubPlaySubEl: HTMLElement;
  private readonly hubPlayTitleEl: HTMLElement;
  private readonly hubModeFfaCardEl: HTMLElement;
  private readonly hubModeDuelCardEl: HTMLElement;

  private readonly selectionEl: HTMLElement;
  private readonly heroBentoCardEl: HTMLElement;
  private readonly selectionSkillBarEl: HTMLElement;
  private readonly multiplayerEl: HTMLElement;
  private readonly hudEl: HTMLElement;
  private readonly pauseModalEl: HTMLElement;
  private readonly settingsModalEl: HTMLElement;
  private readonly controlsModalEl: HTMLElement;
  private readonly resultsModalEl: HTMLElement;
  private readonly adModalEl: HTMLElement;
  private readonly adCloseBtnEl: HTMLButtonElement;
  private readonly adRewardBtnEl: HTMLButtonElement;
  private readonly btnWatchAdEl: HTMLButtonElement;
  private profile: PlayerProfile;
  private playerNameEdited = false;
  private readonly hubCoinDisplayEl: HTMLElement;

  // Multiplayer elements
  private readonly mpConnPillEl: HTMLElement;
  private readonly mpAlertEl: HTMLElement;
  private readonly mpBrowserViewEl: HTMLElement;
  private readonly mpRoomViewEl: HTMLElement;
  private readonly mpNameInputEl: HTMLInputElement;
  private readonly mpCodeInputEl: HTMLInputElement;
  private readonly mpOptBotsEl: HTMLInputElement;
  private readonly mpOptPublicEl: HTMLInputElement;
  private readonly mpClassTabsEl: HTMLElement;
  private readonly mpRoomsListEl: HTMLElement;
  private readonly mpRoomCodeTextEl: HTMLElement;
  private readonly mpRoomBotsToggleEl: HTMLInputElement;
  private readonly mpRoomPublicToggleEl: HTMLInputElement;
  private readonly mpRoomClassTabsEl: HTMLElement;
  private readonly mpSlotsGridEl: HTMLElement;
  private readonly mpReadyBtnEl: HTMLButtonElement;
  private readonly mpStartBtnEl: HTMLButtonElement;
  private readonly mpCopyCodeBtnEl: HTMLButtonElement;

  // Dynamic HUD sub-elements
  private readonly timerEl: HTMLElement;
  private readonly alivePillEl: HTMLElement;
  private readonly netHudPillEl: HTMLElement;
  private readonly netHudSepEl: HTMLElement;
  private readonly rosterListEl: HTMLElement;
  private readonly killFeedEl: HTMLElement;
  private readonly vitalsBoxEl: HTMLElement;
  private readonly playerClassIconEl: HTMLImageElement;
  private readonly playerClassLabelEl: HTMLElement;
  private readonly playerStatePillEl: HTMLElement;
  private readonly hpFillEl: HTMLElement;
  private readonly hpTextEl: HTMLElement;
  private readonly stamFillEl: HTMLElement;
  private readonly stamTextEl: HTMLElement;
  private readonly activeBuffEl: HTMLElement;
  private readonly actionBarWrapEl: HTMLElement;
  private readonly actionBarSlotsEl: HTMLElement;
  private readonly actionBarHintEl: HTMLElement;
  private readonly reticleEl: HTMLElement;
  private readonly reticleRingEl: HTMLElement;
  private readonly reticleTargetEl: HTMLElement;
  private readonly chargeMeterEl: HTMLElement;
  private readonly chargeFillEl: HTMLElement;
  private readonly pointerPromptEl: HTMLElement;
  private readonly countdownBannerEl: HTMLElement;
  private readonly worldLabelsLayerEl: HTMLElement;
  private readonly spectatorBarEl: HTMLElement;
  private readonly spectatorSubEl: HTMLElement;

  // Modal dynamic buttons
  private readonly pauseRestartBtnEl: HTMLButtonElement;
  private readonly pauseMenuBtnEl: HTMLButtonElement;
  private readonly specRestartBtnEl: HTMLButtonElement;
  private readonly specMenuBtnEl: HTMLButtonElement;
  private readonly resAgainBtnEl: HTMLButtonElement;
  private readonly resClassBtnEl: HTMLButtonElement;
  private readonly resMenuBtnEl: HTMLButtonElement;

  private readonly labelPool = new Map<string, HTMLElement>();
  private renderedActionBarClass: KnightClassId | null = null;
  private renderedVitalsClass: KnightClassId | null = null;
  private actionBarRefs: ActionBarSlotRefs[] = [];
  private lastRenderedState: MatchState | null = null;
  private lastPaused = false;
  private selectedMode: MatchMode = 'ffa5';
  private resultsRenderedKey = '';
  private lastResults: { match: MatchManager; isHost: boolean; rewards: ReturnType<MatchManager['getMatchRewards']> } | null = null;


  // Multiplayer UI state
  private mpStatus: NetConnectionStatus = 'disconnected';
  private mpPingMs = 0;
  private mpRooms: RoomSummary[] = [];
  private mpRoom: RoomLobbyState | null = null;
  private mpMyClientId: string | null = null;
  private mpAlertTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    root: HTMLElement,
    initialSettings: GameSettings,
    callbacks: UICallbacks
  ) {
    this.root = root;
    this.settings = { ...initialSettings };
    this.callbacks = callbacks;
    this.profile = loadProfile();

    const initialName = escapeHtml(loadSavedPlayerName(this.settings.language));

    this.root.innerHTML = `
      <!-- PERSISTENT FLOATING TOP NAVIGATION DOCK -->
      <header id="hub-top-dock" class="hub-top-dock pointer-auto">
        <div class="hub-brand-pill" id="btn-brand-home" title="На главную" data-i18n-title="mpBack">
          <span class="hub-brand-mark">${ICONS.blades}</span>
          <div class="hub-brand-text">
            <strong>Knights</strong>
            <span>Last Standing</span>
          </div>
        </div>

        <nav class="hub-seg-nav" aria-label="${this.tl('navArena')}">
          <button id="nav-tab-arena" class="hub-seg-btn active">
            ${ICONS.bolt}
            <span data-i18n="navArena">${this.tl('navArena')}</span>
          </button>
          <button id="btn-menu-select" class="hub-seg-btn">
            ${ICONS.shield}
            <span data-i18n="navHeroes">${this.tl('navHeroes')}</span>
          </button>
          <button id="btn-menu-multiplayer" class="hub-seg-btn">
            ${ICONS.globe}
            <span data-i18n="navOnline">${this.tl('navOnline')}</span>
          </button>
        </nav>

        <div class="hub-util-pills">
          <button id="btn-open-controls" class="hub-util-btn" title="${this.tl('navControls')}">
            ${ICONS.gamepad}
            <span data-i18n="navControls">${this.tl('navControls')}</span>
          </button>
          <button id="btn-menu-settings" class="hub-util-btn" title="${this.tl('navSettings')}">
            ${ICONS.sliders}
            <span data-i18n="navSettings">${this.tl('navSettings')}</span>
          </button>
          <div class="hub-coin-display">
            ${ICONS.trophy}
            <span id="hub-coin-display">${this.profile.coins}</span>
          </div>
        </div>
      </header>

      <!-- SCREEN 1: MAIN HUB ("АРЕНА") — LIVE 3D HERO + MODE BENTO CARDS + 1-CLICK PLAY -->
      <div id="screen-main-menu" class="hub-screen">
        <aside class="hub-left-stack pointer-auto">
          <div class="hub-coin-balance">
            <span class="hub-coin-icon">${ICONS.trophy}</span>
            <span class="hub-coin-label" data-i18n="coinLabel">${this.tl('coinLabel')}</span>
            <span id="hub-main-coin-display">${this.profile.coins}</span>
          </div>
          <button id="btn-watch-ad" class="hub-ad-btn" title="${this.tl('adSub')}">
            ${ICONS.bolt}
            <span data-i18n="adSub">${this.tl('adSub')}</span>
          </button>
          <div class="hub-stack-header">
            <span class="hub-eyebrow" data-i18n="eyebrowArena">${this.tl('eyebrowArena')}</span>
            <h1 class="hub-headline" data-i18n="headlineReady">${this.tl('headlineReady')}</h1>
          </div>

          <div class="hub-mode-cards">
            <div id="hub-mode-ffa" class="hub-mode-card active" role="button" tabindex="0">
              <div class="hub-mode-orb orb-coral">${ICONS.users}</div>
              <div class="hub-mode-info">
                <div class="hub-mode-top">
                  <span class="hub-mode-name" data-i18n="modeFfaName">Королевская схватка</span>
                  <span class="hub-mode-tag tag-coral" data-i18n="modeFfaTag">5 бойцов</span>
                </div>
                <p class="hub-mode-desc" data-i18n="modeFfaDesc">Каждый сам за себя на двухуровневом мосту цитадели</p>
              </div>
            </div>

            <div id="hub-mode-duel" class="hub-mode-card" role="button" tabindex="0">
              <div class="hub-mode-orb orb-violet">${ICONS.blades}</div>
              <div class="hub-mode-info">
                <div class="hub-mode-top">
                  <span class="hub-mode-name" data-i18n="modeDuelName">Дуэль 1 на 1</span>
                  <span class="hub-mode-tag tag-violet" data-i18n="modeDuelTag">Тренировка</span>
                </div>
                <p class="hub-mode-desc" data-i18n="modeDuelDesc">Чистая дуэль против ИИ для отработки парирований</p>
              </div>
              <button id="btn-menu-duel" class="hub-card-mini-play" title="Сразу начать дуэль" data-i18n-title="fightNow">
                ${ICONS.play}
              </button>
            </div>

            <div id="hub-mode-online" class="hub-mode-card card-online-link" role="button" tabindex="0">
              <div class="hub-mode-orb orb-cyan">${ICONS.globe}</div>
              <div class="hub-mode-info">
                <div class="hub-mode-top">
                  <span class="hub-mode-name" data-i18n="modeOnlineName">Сетевая игра</span>
                  <span class="hub-mode-tag tag-cyan" data-i18n="modeOnlineTag">До 5 игроков</span>
                </div>
                <p class="hub-mode-desc" data-i18n="modeOnlineDesc">Быстрый поиск матча, список залов и вход по коду друга</p>
              </div>
              <span class="hub-card-chevron">${ICONS.chevronRight}</span>
            </div>
          </div>

          <div class="hub-arena-theme-card">
            <div class="hub-arena-theme-head">
              <span class="hub-arena-theme-title" data-i18n="settingsTheme">Покрытие арены</span>
              <span id="hub-arena-theme-label" class="hub-arena-theme-badge">Дубовый помост</span>
            </div>
            <div id="hub-arena-theme-strip" class="arena-theme-swatches">
              ${ARENA_THEMES.map(
                (t) => `
                <button
                  type="button"
                  class="arena-theme-chip"
                  data-arena-theme="${t.id}"
                  title="${this.tl(`theme_${t.id}`)} — ${this.tl(`themeDesc_${t.id}`)}"
                >
                  <span
                    class="arena-theme-dot"
                    style="background: linear-gradient(135deg, ${t.swatchPrimary}, ${t.swatchSecondary});"
                  ></span>
                  <span class="arena-theme-chip-name">${this.tl(`themeShort_${t.id}`)}</span>
                </button>
              `
              ).join('')}
            </div>
          </div>
        </aside>

        <div class="hub-spin-hint">
          ${ICONS.rotate3d}
          <span data-i18n="rotateHint">Потяните мышью для обзора 360°</span>
        </div>

        <footer class="hub-bottom-dock pointer-auto">
          <div class="hub-quick-heroes-box">
            <div class="hub-quick-heroes-head">
              <span data-i18n="heroYourHero">Ваш герой</span>
              <button id="btn-hub-inspect" class="hub-link-pill">
                <span data-i18n="heroInspect">Навыки и характеристики</span>
                ${ICONS.chevronRight}
              </button>
            </div>
            <div id="hub-hero-strip" class="hub-hero-strip"></div>
          </div>

          <button id="btn-menu-quick" class="hub-play-cta">
            <span class="hub-play-icon">${ICONS.play}</span>
            <span class="hub-play-copy">
              <strong id="hub-play-title" class="hub-play-title">В БОЙ!</strong>
              <span id="hub-play-sub" class="hub-play-sub">5 бойцов · Рыцарь клинка</span>
            </span>
          </button>
        </footer>
      </div>

      <!-- SCREEN 2: HEROES INSPECTOR ("ГЕРОИ") — BENTO STATS + INTERACTIVE SKILL DOCK -->
      <div id="screen-selection" class="hub-screen armory-screen hidden">
        <aside id="hero-bento-card" class="hero-bento-card pointer-auto" data-cls="sword">
          <div id="class-details"></div>
        </aside>

        <div class="hub-spin-hint">
          ${ICONS.rotate3d}
          <span data-i18n="rotateHint">Потяните мышью для обзора 360°</span>
        </div>

        <footer class="armory-bottom-dock pointer-auto">
          <div class="armory-bottom-left">
            <button id="btn-sel-back" class="btn btn-icon-circle" title="Назад в Арену" data-i18n-title="backArena">
              ${ICONS.arrowLeft}
            </button>
            <div id="class-tabs" class="armory-hero-pills"></div>
          </div>

          <div class="selection-showcase-dock">
            <div id="selection-skill-bar" class="skill-squares-row"></div>
          </div>

          <div class="armory-launch-group">
            <div class="mode-toggle-row">
              <button id="mode-ffa5" class="mode-btn active" data-i18n="modeFfaTag">5 бойцов</button>
              <button id="mode-duel" class="mode-btn" data-i18n="modeDuelName">1 на 1</button>
            </div>
            <button id="btn-sel-start" class="hub-play-cta compact">
              <span class="hub-play-icon">${ICONS.play}</span>
              <strong class="hub-play-title" data-i18n="playFight">В БОЙ!</strong>
            </button>
          </div>
        </footer>
      </div>

      <!-- SCREEN 3: ONLINE MULTIPLAYER ("ОНЛАЙН") — BENTO PARTY & SERVER HUB -->
      <div id="screen-multiplayer" class="hub-screen mp-screen hidden">
        <div class="mp-bento-sheet pointer-auto">
          <div class="mp-header-row">
            <div class="mp-header-left">
              <div class="mp-header-orb">${ICONS.globe}</div>
              <div>
                <h2 class="mp-heading" data-i18n="mpTitle">Сетевая арена</h2>
                <p class="mp-subheading" data-i18n="mpSubtitle">До 5 живых игроков в матче · Серверная физика 60 Гц</p>
              </div>
            </div>
            <div id="mp-conn-pill" class="mp-conn-pill connecting">${this.tl('mpConnecting')}</div>
          </div>

          <div id="mp-alert-banner" class="mp-alert-banner hidden"></div>

          <!-- VIEW 1: ROOM BROWSER & MATCHMAKING -->
          <div id="mp-browser-view" class="mp-browser-view">
            <div class="mp-profile-bar">
              <div class="mp-name-field">
                <label for="mp-name-input" class="bento-label" data-i18n="mpName">Ваш никнейм</label>
                <div class="mp-input-wrap">
                  <span class="mp-input-icon">${ICONS.user}</span>
                  <input
                    id="mp-name-input"
                    type="text"
                    maxlength="18"
                    value="${initialName}"
                    placeholder="Введите имя..." data-i18n-placeholder="enterName"
                    class="mp-text-input"
                  />
                </div>
              </div>
              <div class="mp-class-picker-wrap">
                <div class="bento-label" data-i18n="mpSelectedHero">Выбранный герой</div>
                <div id="mp-class-tabs" class="mp-mini-class-tabs"></div>
              </div>
            </div>

            <div class="mp-columns">
              <!-- Left column: Quick Join / Create / Code Join -->
              <div class="mp-col-actions">
                <button id="btn-mp-quick" class="mp-quickplay-card">
                  <span class="mp-qp-orb">${ICONS.bolt}</span>
                  <span class="mp-qp-copy">
                    <strong data-i18n="mpQuickJoin">Быстрый поиск боя</strong>
                    <span data-i18n="mpQuickDesc">Мгновенный вход в открытую комнату</span>
                  </span>
                  <span class="mp-qp-arrow">${ICONS.arrowRight}</span>
                </button>

                <div class="mp-card-box">
                  <div class="mp-box-title" data-i18n="mpCreateTitle">Создать свою комнату</div>
                  <label for="mp-opt-bots" class="mp-check-line">
                    <span data-i18n="mpFillBots">Дополнить ботами ИИ до 5 бойцов</span>
                    <input id="mp-opt-bots" type="checkbox" class="ios-switch" checked />
                  </label>
                  <label for="mp-opt-public" class="mp-check-line">
                    <span data-i18n="mpPublic">Показывать в открытом списке</span>
                    <input id="mp-opt-public" type="checkbox" class="ios-switch" checked />
                  </label>
                  <button id="btn-mp-create" class="btn btn-accent-violet" style="width: 100%; margin-top: 4px;">
                    ${ICONS.users}
                    <span data-i18n="mpCreateRoom">Создать комнату</span>
                  </button>
                </div>

                <div class="mp-card-box">
                  <div class="mp-box-title" data-i18n="mpJoinCode">Присоединиться по коду</div>
                  <div class="mp-code-join-row">
                    <input
                      id="mp-code-input"
                      type="text"
                      maxlength="6"
                      placeholder="КОД" data-i18n-placeholder="codePlaceholder"
                      class="mp-text-input mp-code-field"
                    />
                    <button id="btn-mp-join-code" class="btn btn-primary" data-i18n="mpJoin">Войти</button>
                  </div>
                </div>
              </div>

              <!-- Right column: Live Public Rooms List -->
              <div class="mp-col-rooms">
                <div class="mp-rooms-head">
                  <span class="mp-box-title" data-i18n="mpOpenRooms">Открытые комнаты</span>
                  <button id="btn-mp-refresh" class="btn btn-sm">
                    ${ICONS.refresh}
                    <span data-i18n="mpRefresh">Обновить</span>
                  </button>
                </div>
                <div id="mp-rooms-list" class="mp-rooms-list"></div>
              </div>
            </div>

            <div class="mp-footer-bar">
              <button id="btn-mp-back" class="btn btn-ghost">
                ${ICONS.arrowLeft}
                <span data-i18n="mpBack">На главную</span>
              </button>
              <span class="mp-footer-note" data-i18n="mpShare">Отправьте 4-буквенный код друзьям для мгновенного входа</span>
            </div>
          </div>

          <!-- VIEW 2: 5-PLAYER PARTY WAITING ROOM -->
          <div id="mp-room-view" class="mp-room-view hidden">
            <div class="mp-room-top-bar">
              <div class="mp-room-code-plaque">
                <span class="mp-code-kicker" data-i18n="mpRoomCode">Код комнаты</span>
                <strong id="mp-room-code-text" class="mp-code-big">----</strong>
                <button id="btn-mp-copy-code" class="btn btn-sm">
                  ${ICONS.copy}
                  <span data-i18n="mpCopyCode">Скопировать</span>
                </button>
              </div>

              <div class="mp-room-toggles">
                <label for="mp-room-bots-toggle" class="mp-check-line compact">
                  <span data-i18n="mpBots">Боты ИИ</span>
                  <input id="mp-room-bots-toggle" type="checkbox" class="ios-switch" checked />
                </label>
                <label for="mp-room-public-toggle" class="mp-check-line compact">
                  <span data-i18n="mpPublicLabel">Публичная</span>
                  <input id="mp-room-public-toggle" type="checkbox" class="ios-switch" checked />
                </label>
              </div>
            </div>

            <div class="mp-room-class-strip">
              <span class="bento-label" style="margin: 0;" data-i18n="mpChangeHero">Сменить героя:</span>
              <div id="mp-room-class-tabs" class="mp-mini-class-tabs"></div>
            </div>

            <div id="mp-slots-grid" class="mp-slots-grid"></div>

            <div class="mp-footer-bar">
              <button id="btn-mp-leave" class="btn btn-ghost">
                ${ICONS.arrowLeft}
                <span data-i18n="mpLeave">Покинуть комнату</span>
              </button>
              <div class="mp-room-cta-right">
                <button id="btn-mp-ready" class="btn btn-accent-violet">${this.tl('mpReady')}</button>
                <button id="btn-mp-start" class="btn btn-primary btn-hero">
                  ${ICONS.play}
                  <span data-i18n="mpStart">Начать матч!</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- IN-GAME FLOATING GLASS COMBAT HUD -->
      <div id="screen-hud" class="hud-layer hidden">
        <div id="world-labels-layer"></div>

        <div class="hud-top-bar">
          <div class="hud-clock-group">
            <span class="hud-clock-icon" aria-hidden="true">${ICONS.clock}</span>
            <div id="hud-timer" class="hud-timer">03:10</div>
          </div>
          <span class="hud-top-divider" aria-hidden="true"></span>
          <div id="hud-alive-pill" class="hud-alive-pill">${this.tl('aliveCount', { alive: 5, total: 5 })}</div>
          <span id="hud-net-sep" class="hud-top-divider hidden" aria-hidden="true"></span>
          <div id="hud-net-pill" class="hud-net-pill hidden" data-i18n="navOnline">Онлайн</div>
        </div>

        <div id="hud-pointer-prompt" class="pointer-prompt hidden">
          ${this.tl('aimHint')}
        </div>

        <div id="hud-countdown" class="countdown-banner hidden">3</div>

        <div class="hud-roster">
          <div class="roster-title" data-i18n="rosterTitle">Бойцы на арене</div>
          <div id="hud-roster-list" class="roster-list-inner"></div>
        </div>

        <div id="hud-kill-feed" class="kill-feed"></div>

        <div id="hud-reticle" class="hud-reticle">
          <div id="hud-reticle-target" class="reticle-target-pill hidden"></div>
          <div id="hud-reticle-ring" class="reticle-ring">
            <span class="reticle-tick tick-t"></span>
            <span class="reticle-tick tick-r"></span>
            <span class="reticle-tick tick-b"></span>
            <span class="reticle-tick tick-l"></span>
            <span class="reticle-dot"></span>
          </div>
          <div id="hud-charge-meter" class="charge-meter hidden">
            <div id="hud-charge-fill" class="charge-meter-fill" style="width: 0%"></div>
          </div>
        </div>

        <!-- Bottom-Left Vitals Card -->
        <div id="hud-vitals-box" class="hud-vitals">
          <div class="vitals-header">
            <div class="vitals-identity">
              <img id="hud-player-class-icon" class="vitals-class-emblem" src="${getSkillIconUrl(
                'sword_light.svg'
              )}" alt="" draggable="false" />
              <span id="hud-player-class">${classDisplayName('sword', this.settings.language)}</span>
            </div>
            <span id="hud-player-state" class="state-pill">${this.tl('ready')}</span>
          </div>
          <div class="bar-container hp-bar-frame">
            <div id="hud-hp-fill" class="hp-fill" style="width: 100%"></div>
            <div id="hud-hp-text" class="bar-text">100 / 100 HP</div>
          </div>
          <div class="bar-container stam-bar-frame">
            <div id="hud-stam-fill" class="stamina-fill" style="width: 100%"></div>
            <div id="hud-stam-text" class="bar-text">${this.tl('staminaValue', { value: 100 })}</div>
          </div>
          <div id="hud-active-buff" class="hud-buff-pill hidden"></div>
        </div>

        <!-- Bottom-Center Skill Dock -->
        <div id="hud-actionbar" class="hud-actionbar pointer-auto">
          <div id="hud-actionbar-slots" class="skill-squares-row"></div>
          <div id="hud-actionbar-hint" class="hud-actionbar-hint">
            ${this.tl('controlsHint')}
          </div>
        </div>

        <!-- SPECTATOR DEATH OVERLAY -->
        <div id="hud-spectator-bar" class="spectator-bar pointer-auto hidden">
          <div class="spectator-title">
            ${ICONS.skull}
            <span data-i18n="spectating">Вы выбыли · Режим наблюдения</span>
          </div>
          <div id="spectator-sub" class="spectator-sub">${this.tl('decidingWinner')}</div>
          <div class="spectator-actions">
            <button id="btn-spec-prev" class="btn btn-sm" data-i18n="specPrevious">Пред. [Q]</button>
            <button id="btn-spec-next" class="btn btn-sm" data-i18n="specNext">След. [E]</button>
            <button id="btn-spec-restart" class="btn btn-primary btn-sm" data-i18n="specRestart">Снова в бой</button>
            <button id="btn-spec-menu" class="btn btn-ghost btn-sm" data-i18n="backMenu">В меню</button>
          </div>
        </div>
      </div>

      <!-- PAUSE MODAL -->
      <div id="modal-pause" class="modal-backdrop hidden">
        <div class="glass-modal pause-sheet">
          <div class="modal-pill-badge" data-i18n="pauseBadge">Матч на паузе</div>
          <h2 class="modal-sheet-title" data-i18n="pauseTitle">Пауза</h2>
          <p class="modal-sheet-sub" data-i18n="pauseSub">Выберите действие для продолжения</p>

          <div class="pause-actions-stack">
            <button id="btn-pause-resume" class="btn btn-primary btn-hero">
              ${ICONS.play}
              <span data-i18n="pauseResume">Продолжить бой</span>
            </button>
            <button id="btn-pause-restart" class="btn btn-accent-violet">
              ${ICONS.refresh}
              <span data-i18n="pauseRestart">Начать заново</span>
            </button>
            <button id="btn-pause-settings" class="btn">
              ${ICONS.sliders}
              <span data-i18n="navSettings">Настройки</span>
            </button>
            <button id="btn-pause-controls" class="btn">
              ${ICONS.gamepad}
              <span data-i18n="navControls">Управление</span>
            </button>
            <button id="btn-pause-menu" class="btn btn-ghost">
              ${ICONS.door}
              <span data-i18n="pauseMenu">Выйти в меню</span>
            </button>
          </div>
        </div>
      </div>

      <!-- CONTROLS CHEAT-SHEET MODAL -->
      <div id="modal-controls" class="modal-backdrop hidden">
        <div class="glass-modal controls-sheet">
          <div class="modal-top-row">
            <div>
              <div class="modal-pill-badge" data-i18n="controlsBadge">Справка по клавишам</div>
              <h2 class="modal-sheet-title" data-i18n="controlsTitle">Управление в бою</h2>
            </div>
            <button id="btn-controls-x" class="icon-close-btn" title="Закрыть" data-i18n-title="adCloseBtn">
              ${ICONS.close}
            </button>
          </div>

          <div class="controls-bento-grid">
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlMove">Перемещение</strong><span data-i18n="controlMoveDesc">Свободное движение + Shift для спринта</span></div>
            </div>
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd data-i18n="mouse">Мышь</kbd> + <kbd data-i18n="wheel">Колесо</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlCamera">ММО-камера 360° и Зум</strong><span data-i18n="controlCameraDesc">Полное вращение вокруг героя, взгляд вверх/вниз и отдаление</span></div>
            </div>
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd data-i18n="middleMouse">СКМ</kbd> / <kbd>V</kbd> · <kbd>~</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlLook">Свободный обзор и Прицел</strong><span data-i18n="controlLookDesc">Обзор 360° на бегу (СКМ/V) · Свободный прицел по экрану (~)</span></div>
            </div>
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd data-i18n="leftMouse">ЛКМ</kbd> / <kbd data-i18n="hold">Удерж.</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlAttack">Комбо и Пробой</strong><span data-i18n="controlAttackDesc">Мгновенная серия ударов и заряженный пробой в точку прицела</span></div>
            </div>
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd data-i18n="rightMouse">ПКМ</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlBlock">Блок и парирование</strong><span data-i18n="controlBlockDesc">Вовремя нажатый блок оглушает врага</span></div>
            </div>
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlSkills">Активные навыки</strong><span data-i18n="controlSkillsDesc">Три уникальных приёма каждого героя</span></div>
            </div>
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd>Space</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlJump">Прыжок</strong><span data-i18n="controlJumpDesc">Прыжки через преграды и двухуровневый мост</span></div>
            </div>
            <div class="ctrl-card">
              <div class="ctrl-keys"><kbd>Alt</kbd> / <kbd>C</kbd></div>
              <div class="ctrl-info"><strong data-i18n="controlDodge">Рывок / Толчок</strong><span data-i18n="controlDodgeDesc">Резкое уклонение или силовой толчок щитом</span></div>
            </div>
          </div>

          <div class="modal-bottom-row">
            <span class="modal-hint-note" data-i18n="controlsHint">В бою удерживайте Tab, чтобы показать курсор, или нажмите Esc для паузы</span>
            <button id="btn-controls-close" class="btn btn-primary" data-i18n="ok">Понятно</button>
          </div>
        </div>
      </div>

      <!-- RESULTS MODAL -->
      <div id="modal-results" class="modal-backdrop hidden">
        <div class="glass-modal results-sheet">
          <div class="results-header">
            <div class="results-trophy-orb">${ICONS.trophy}</div>
            <div>
              <div id="res-badge" class="modal-pill-badge">${this.tl('resBadge')}</div>
              <h2 id="res-headline" class="modal-sheet-title results-headline">${this.tl('resVictory')}</h2>
              <div id="res-sub" class="results-sub"></div>
            </div>
          </div>

          <div class="standings-scroll-wrap">
            <table class="standings-table">
              <thead>
                <tr>
                  <th data-i18n="resPlace">Место</th>
                  <th data-i18n="resFighter">Боец</th>
                  <th data-i18n="resHero">Герой</th>
                  <th data-i18n="resStatus">Статус</th>
                  <th data-i18n="resKills">Фраги</th>
                  <th data-i18n="resDamage">Урон</th>
                </tr>
              </thead>
              <tbody id="res-tbody"></tbody>
            </table>
          </div>

          <div class="results-actions">
            <button id="btn-res-menu" class="btn btn-ghost">${this.tl('backMenu')}</button>
            <button id="btn-res-class" class="btn btn-accent-violet">${this.tl('changeHero')}</button>
            <button id="btn-res-again" class="btn btn-primary btn-hero">
              ${ICONS.play}
              <span data-i18n="playAgain">Играть снова!</span>
            </button>
          </div>
        </div>
      </div>

      <!-- AD MODAL (mandatory after victory / optional from menu) -->
      <div id="modal-ad" class="modal-backdrop hidden">
        <div class="glass-modal ad-sheet">
          <div class="ad-header">
            <div class="ad-icon">📺</div>
            <div>
              <div class="ad-pill" data-i18n="adBadge">Реклама</div>
              <h2 class="ad-title" data-i18n="adTitle">Смотрите рекламу</h2>
              <div id="ad-sub" class="ad-sub" data-i18n="adSub">Получите +10 монет за просмотр</div>
            </div>
          </div>
          <div class="ad-body"><p id="ad-status" role="status"></p></div>
          <div class="ad-actions">
            <button id="btn-ad-close" class="btn btn-ghost ad-close-btn" data-i18n="adCloseBtn">Закрыть</button>
            <button id="btn-ad-reward" class="btn btn-primary btn-hero ad-reward-btn">
              ${ICONS.trophy}
              <span data-i18n="adRewardBtn">Получить +10 монет</span>
            </button>
          </div>
        </div>
      </div>

      <!-- SETTINGS MODAL -->
      <div id="modal-settings" class="modal-backdrop hidden">
        <div class="glass-modal settings-sheet">
          <div class="modal-top-row">
            <div>
              <div class="modal-pill-badge" data-i18n="settingsBadge">Параметры</div>
              <h2 class="modal-sheet-title" data-i18n="settingsTitle">Настройки игры</h2>
            </div>
            <button id="btn-settings-x" class="icon-close-btn" title="Закрыть" data-i18n-title="adCloseBtn">
              ${ICONS.close}
            </button>
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span data-i18n="settingsVol">Громкость звука</span>
              <span id="lbl-vol" class="setting-val-pill">70%</span>
            </div>
            <input id="inp-vol" type="range" min="0" max="100" step="1" class="setting-slider" />
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span data-i18n="settingsSens">Чувствительность мыши</span>
              <span id="lbl-sens" class="setting-val-pill">1.00x</span>
            </div>
            <input id="inp-sens" type="range" min="20" max="250" step="5" class="setting-slider" />
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span data-i18n="settingsThemeFull">Покрытие и стиль арены</span>
              <span id="lbl-arena-theme" class="setting-val-pill">Дубовый помост</span>
            </div>
            <div id="settings-arena-theme-strip" class="arena-theme-swatches">
              ${ARENA_THEMES.map(
                (t) => `
                <button
                  type="button"
                  class="arena-theme-chip"
                  data-arena-theme="${t.id}"
                  title="${this.tl(`theme_${t.id}`)} — ${this.tl(`themeDesc_${t.id}`)}"
                >
                  <span
                    class="arena-theme-dot"
                    style="background: linear-gradient(135deg, ${t.swatchPrimary}, ${t.swatchSecondary});"
                  ></span>
                  <span class="arena-theme-chip-name">${this.tl(`themeShort_${t.id}`)}</span>
                </button>
              `
              ).join('')}
            </div>
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span data-i18n="settingsQuality">Качество графики</span>
              <span id="lbl-qual" class="setting-val-pill">Ультра</span>
            </div>
            <div class="mode-toggle-row" style="grid-template-columns: 1fr 1fr 1fr;">
              <button id="qual-ultra" class="mode-btn active" data-i18n="qualityUltra">Ультра</button>
              <button id="qual-high" class="mode-btn" data-i18n="qualityHigh">Высокое</button>
              <button id="qual-low" class="mode-btn" data-i18n="qualityLow">Быстрое</button>
            </div>
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span data-i18n="renderStyle">Стиль рендера</span>
              <span id="lbl-pix" class="setting-val-pill">Чёткий HD 3D (1x)</span>
            </div>
            <input id="inp-pix" type="range" min="1" max="3" step="1" class="setting-slider" />
          </div>

          <label for="inp-debug" class="setting-plaque setting-check-row">
            <span data-i18n="settingsDebug">Показывать сектора ударов и цели ИИ [F3]</span>
            <input id="inp-debug" type="checkbox" class="ios-switch" />
          </label>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span data-i18n="navLanguage">Язык</span>
              <span id="lbl-lang" class="setting-val-pill">Русский</span>
            </div>
            <div id="lang-tabs" class="language-tabs" role="group" aria-label="Language">
              ${LANGS.map(
                (l) => `
                <button
                  type="button"
                  class="lang-btn mode-btn"
                  data-lang="${l.code}"
                  title="${l.name}"
                >
                  ${l.code}
                </button>
              `
              ).join('')}
            </div>
          </div>

          <div class="modal-bottom-row" style="justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <button id="btn-settings-about" class="btn btn-ghost"><span data-i18n="aboutTitle">${this.tl('aboutTitle')}</span></button>
            <button id="btn-settings-close" class="btn btn-primary" style="min-width: 155px;">
              ${ICONS.check}
              <span data-i18n="settingsDone">Готово</span>
            </button>
          </div>
        </div>
      </div>
      <div id="modal-cloud-conflict" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="cloud-conflict-title">
        <div class="glass-modal about-sheet">
          <h2 id="cloud-conflict-title" class="modal-sheet-title" data-i18n="cloudConflictTitle">${this.tl('cloudConflictTitle')}</h2>
          <p class="about-intro" data-i18n="cloudConflictText">${this.tl('cloudConflictText')}</p>
          <div class="modal-bottom-row" style="gap: 12px; flex-wrap: wrap;">
            <button id="btn-cloud-local" class="btn btn-ghost" data-i18n="cloudChooseLocal">${this.tl('cloudChooseLocal')}</button>
            <button id="btn-cloud-remote" class="btn btn-primary" data-i18n="cloudChooseRemote">${this.tl('cloudChooseRemote')}</button>
          </div>
        </div>
      </div>
      <div id="modal-about" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="glass-modal about-sheet">
          <div class="modal-top-row">
            <h2 id="about-title" class="modal-sheet-title" data-i18n="aboutTitle">${this.tl('aboutTitle')}</h2>
            <button id="btn-about-x" class="icon-close-btn" data-i18n-title="adCloseBtn" aria-label="Close">×</button>
          </div>
          <p class="about-intro" data-i18n="aboutIntro">${this.tl('aboutIntro')}</p>
          <p class="about-game-title">KNIGHTS: LAST STANDING</p>
          <div class="about-credits">
            ${[
              ['Game-Icons.net — Lorc, Delapouite (CC BY 3.0; modified icons)', 'icons/skills/LICENSE.txt'],
              ['KayKit: Adventurers & Skeletons — Kay Lousberg (CC0)', 'models/kaykit/LICENSE.txt'],
              ['KayKit: Dungeon Remastered — Kay Lousberg (CC0)', 'models/dungeon/LICENSE.txt'],
              ['Kenney & Quaternius — arena props (CC0)', 'models/props/LICENSE.txt'],
              ['Arena textures — sources and verification', 'textures/arena/LICENSE.txt'],
              ['Fire effects and textures — source credits', 'textures/fx/LICENSE.txt'],
              ['Sound effects — creator and source list', 'audio/LICENSE.txt'],
              ['Three.js — MIT', 'licenses/three-MIT.txt'],
              ['THREE.Fire — typeWolffo — MIT', 'licenses/typeWolffo-THREE.Fire-MIT.txt'],
              ['THREE.Fire — mattatz — MIT', 'licenses/mattatz-THREE.Fire-MIT.txt'],
              ['Flame — rethinkos-playground — MIT', 'licenses/rethinkos-playground-flame-MIT.txt'],
              ['WebGL noise — Ashima Arts & Stefan Gustavson — MIT', 'licenses/ashima-webgl-noise-MIT.txt'],
              ['Inter — SIL Open Font License 1.1', 'licenses/inter-OFL.txt'],
              ['Cinzel — SIL Open Font License 1.1', 'licenses/cinzel-OFL.txt'],
              ['Philosopher — SIL Open Font License 1.1', 'licenses/philosopher-OFL.txt'],
              ['ws — MIT', 'licenses/ws-MIT.txt'],
              ['CC0 1.0 — full text', 'licenses/CC0-1.0.txt'],
              ['Conquest — Apache 2.0', 'licenses/conquest-Apache-2.0.txt'],
              ['Conquest — original NOTICE', 'licenses/conquest-NOTICE.txt'],
              ['VolumetricFire — upstream package metadata', 'licenses/VolumetricFire-package.json'],
            ].map(([title, path]) => `<details class="about-credit" data-license-path="${path}"><summary>${title}</summary><pre></pre></details>`).join('')}
          </div>
          <div class="modal-bottom-row"><button id="btn-about-close" class="btn btn-primary" data-i18n="adCloseBtn">${this.tl('adCloseBtn')}</button></div>
        </div>
      </div>
    `;

    this.hubTopDockEl = this.q('#hub-top-dock');
    this.navTabArenaEl = this.q('#nav-tab-arena') as HTMLButtonElement;
    this.navTabHeroesEl = this.q('#btn-menu-select') as HTMLButtonElement;
    this.navTabOnlineEl = this.q('#btn-menu-multiplayer') as HTMLButtonElement;

    this.mainMenuEl = this.q('#screen-main-menu');
    this.hubHeroStripEl = this.q('#hub-hero-strip');
    this.hubPlaySubEl = this.q('#hub-play-sub');
    this.hubPlayTitleEl = this.q('#hub-play-title');
    this.hubModeFfaCardEl = this.q('#hub-mode-ffa');
    this.hubModeDuelCardEl = this.q('#hub-mode-duel');

    this.selectionEl = this.q('#screen-selection');
    this.heroBentoCardEl = this.q('#hero-bento-card');
    this.selectionSkillBarEl = this.q('#selection-skill-bar');
    this.multiplayerEl = this.q('#screen-multiplayer');
    this.hudEl = this.q('#screen-hud');
    this.pauseModalEl = this.q('#modal-pause');
    this.settingsModalEl = this.q('#modal-settings');
    this.controlsModalEl = this.q('#modal-controls');
    this.resultsModalEl = this.q('#modal-results');
    this.adModalEl = this.q('#modal-ad');
    this.adCloseBtnEl = this.q('#btn-ad-close') as HTMLButtonElement;
    this.adRewardBtnEl = this.q('#btn-ad-reward') as HTMLButtonElement;
    this.btnWatchAdEl = this.q('#btn-watch-ad') as HTMLButtonElement;
    this.hubCoinDisplayEl = this.q('#hub-coin-display');

    this.mpConnPillEl = this.q('#mp-conn-pill');
    this.mpAlertEl = this.q('#mp-alert-banner');
    this.mpBrowserViewEl = this.q('#mp-browser-view');
    this.mpRoomViewEl = this.q('#mp-room-view');
    this.mpNameInputEl = this.q('#mp-name-input') as HTMLInputElement;
    this.mpCodeInputEl = this.q('#mp-code-input') as HTMLInputElement;
    this.mpOptBotsEl = this.q('#mp-opt-bots') as HTMLInputElement;
    this.mpOptPublicEl = this.q('#mp-opt-public') as HTMLInputElement;
    this.mpClassTabsEl = this.q('#mp-class-tabs');
    this.mpRoomsListEl = this.q('#mp-rooms-list');
    this.mpRoomCodeTextEl = this.q('#mp-room-code-text');
    this.mpRoomBotsToggleEl = this.q('#mp-room-bots-toggle') as HTMLInputElement;
    this.mpRoomPublicToggleEl = this.q(
      '#mp-room-public-toggle'
    ) as HTMLInputElement;
    this.mpRoomClassTabsEl = this.q('#mp-room-class-tabs');
    this.mpSlotsGridEl = this.q('#mp-slots-grid');
    this.mpReadyBtnEl = this.q('#btn-mp-ready') as HTMLButtonElement;
    this.mpStartBtnEl = this.q('#btn-mp-start') as HTMLButtonElement;
    this.mpCopyCodeBtnEl = this.q('#btn-mp-copy-code') as HTMLButtonElement;

    this.timerEl = this.q('#hud-timer');
    this.alivePillEl = this.q('#hud-alive-pill');
    this.netHudPillEl = this.q('#hud-net-pill');
    this.netHudSepEl = this.q('#hud-net-sep');
    this.rosterListEl = this.q('#hud-roster-list');
    this.killFeedEl = this.q('#hud-kill-feed');
    this.vitalsBoxEl = this.q('#hud-vitals-box');
    this.playerClassIconEl = this.q(
      '#hud-player-class-icon'
    ) as HTMLImageElement;
    this.playerClassLabelEl = this.q('#hud-player-class');
    this.playerStatePillEl = this.q('#hud-player-state');
    this.hpFillEl = this.q('#hud-hp-fill');
    this.hpTextEl = this.q('#hud-hp-text');
    this.stamFillEl = this.q('#hud-stam-fill');
    this.stamTextEl = this.q('#hud-stam-text');
    this.activeBuffEl = this.q('#hud-active-buff');
    this.actionBarWrapEl = this.q('#hud-actionbar');
    this.actionBarSlotsEl = this.q('#hud-actionbar-slots');
    this.actionBarHintEl = this.q('#hud-actionbar-hint');
    this.reticleEl = this.q('#hud-reticle');
    this.reticleRingEl = this.q('#hud-reticle-ring');
    this.reticleTargetEl = this.q('#hud-reticle-target');
    this.chargeMeterEl = this.q('#hud-charge-meter');
    this.chargeFillEl = this.q('#hud-charge-fill');
    this.pointerPromptEl = this.q('#hud-pointer-prompt');
    this.countdownBannerEl = this.q('#hud-countdown');
    this.worldLabelsLayerEl = this.q('#world-labels-layer');
    this.spectatorBarEl = this.q('#hud-spectator-bar');
    this.spectatorSubEl = this.q('#spectator-sub');

    this.pauseRestartBtnEl = this.q('#btn-pause-restart') as HTMLButtonElement;
    this.pauseMenuBtnEl = this.q('#btn-pause-menu') as HTMLButtonElement;
    this.specRestartBtnEl = this.q('#btn-spec-restart') as HTMLButtonElement;
    this.specMenuBtnEl = this.q('#btn-spec-menu') as HTMLButtonElement;
    this.resAgainBtnEl = this.q('#btn-res-again') as HTMLButtonElement;
    this.resClassBtnEl = this.q('#btn-res-class') as HTMLButtonElement;
    this.resMenuBtnEl = this.q('#btn-res-menu') as HTMLButtonElement;

    this.bindEvents();
    this.renderSelectionClass(this.profile.activeKnight, false);
    this.renderMpClassButtons();
    this.syncModeButtons();
    this.updatePublicRooms([]);
    this.updateMultiplayerStatus(this.mpStatus, this.mpPingMs);
    this.syncSettingsControls();
    this.applyTranslations();
  }

  public showCloudConflict(onChoice: (choice: 'local' | 'cloud') => void): void {
    const modal = this.q('#modal-cloud-conflict');
    modal.classList.remove('hidden');
    const choose = (choice: 'local' | 'cloud') => {
      onChoice(choice);
      this.profile = loadProfile();
      this.hubCoinDisplayEl.textContent = String(this.profile.coins);
      this.q('#hub-main-coin-display').textContent = String(this.profile.coins);
      this.renderSelectionClass(this.profile.activeKnight, false);
      this.renderHubQuickHeroStrip();
      this.updatePlayButtonSubtitle();
      modal.classList.add('hidden');
    };
    (this.q('#btn-cloud-local') as HTMLButtonElement).onclick = () => choose('local');
    (this.q('#btn-cloud-remote') as HTMLButtonElement).onclick = () => choose('cloud');
  }

  /** Only use the platform name when the player has not selected their own. */
  public useYandexPlayerName(name: string): void {
    try { if (localStorage.getItem(MP_NAME_STORAGE_KEY)) return; } catch { return; }
    if (this.playerNameEdited || document.activeElement === this.mpNameInputEl) return;
    const clean = name.trim().slice(0, 18);
    if (clean.length >= 2) this.mpNameInputEl.value = clean;
  }

  public updateSettingsExternal(next: GameSettings): void {
    this.settings = { ...next };
    this.refreshLanguage();
  }

  private refreshLanguage(): void {
    this.applyTranslations();
    this.syncSettingsControls();
    this.renderSelectionClass(this.currentSelectedClass, false);
    this.renderMpClassButtons();
    this.updateMultiplayerStatus(this.mpStatus, this.mpPingMs);
    this.updatePublicRooms(this.mpRooms);
    if (this.mpRoom) this.updateMultiplayerRoom(this.mpRoom, this.mpMyClientId);
    this.renderedActionBarClass = null;
    if (this.lastRenderedState === 'MatchFinished' && this.lastResults) {
      const { match, isHost, rewards } = this.lastResults;
      this.renderResults(match, isHost, rewards);
    }
    this.lastRenderedState = null;
  }

  public getEnteredPlayerName(): string {
    const val = this.mpNameInputEl.value.trim();
    const clean = val.length >= 2 ? val.slice(0, 18) : loadSavedPlayerName(this.settings.language);
    savePlayerName(clean);
    return clean;
  }

  public getSelectedClass(): KnightClassId {
    return this.currentSelectedClass;
  }

  public updateMultiplayerStatus(
    status: NetConnectionStatus,
    pingMs: number,
    errorText?: string
  ): void {
    this.mpStatus = status;
    this.mpPingMs = pingMs;

    this.mpConnPillEl.classList.remove('online', 'connecting', 'offline');
    if (status === 'connected') {
      this.mpConnPillEl.classList.add('online');
      this.mpConnPillEl.textContent =
        pingMs > 0 ? `${this.tl('mpOnline')} · ${pingMs} ms` : this.tl('mpOnline');
    } else if (status === 'connecting') {
      this.mpConnPillEl.classList.add('connecting');
      this.mpConnPillEl.textContent = this.tl('mpConnecting');
    } else {
      this.mpConnPillEl.classList.add('offline');
      this.mpConnPillEl.textContent = this.tl('mpOffline');
    }

    if (errorText) {
      this.showMultiplayerNotice(errorText, 'error');
    }
  }

  public showMultiplayerNotice(
    message: string,
    tone: 'error' | 'info' = 'error'
  ): void {
    if (this.mpAlertTimer) {
      clearTimeout(this.mpAlertTimer);
    }
    this.mpAlertEl.textContent = this.translateNetworkMessage(message);
    this.mpAlertEl.classList.remove('hidden', 'tone-error', 'tone-info');
    this.mpAlertEl.classList.add(
      tone === 'info' ? 'tone-info' : 'tone-error'
    );
    this.mpAlertTimer = setTimeout(() => {
      this.mpAlertEl.classList.add('hidden');
    }, 4500);
  }

  public updatePublicRooms(rooms: RoomSummary[]): void {
    this.mpRooms = rooms;
    if (rooms.length === 0) {
      this.mpRoomsListEl.innerHTML = `
        <div class="mp-empty-rooms">
          <div class="mp-empty-title">${this.tl('emptyRooms')}</div>
          <div class="mp-empty-sub">
            ${this.tl('emptyRoomsHint')}
          </div>
        </div>
      `;
      return;
    }

    this.mpRoomsListEl.innerHTML = rooms
      .map((r) => {
        const canJoin = r.phase === 'lobby' && r.playerCount < r.maxPlayers;
        const statusBadge =
          r.phase === 'lobby'
            ? `<span class="mp-room-badge open">${this.tl('waiting')} · ${r.playerCount}/${r.maxPlayers}</span>`
            : `<span class="mp-room-badge busy">${this.tl('inBattle')} · ${r.playerCount}/${r.maxPlayers}</span>`;
        const botTag = r.fillBots ? this.tl('botsPlus') : this.tl('playersOnly');
        return `
          <div class="mp-room-row">
            <div class="mp-room-row-info">
              <div class="mp-room-row-top">
                <span class="mp-room-code-chip">${escapeHtml(r.roomCode)}</span>
                <strong class="mp-room-host">${escapeHtml(r.hostIsBot ? botDisplayName(r.hostName, this.settings.language) : r.hostName)}</strong>
              </div>
              <div class="mp-room-row-meta">
                ${statusBadge}
                <span class="mp-room-meta-tag">${botTag}</span>
              </div>
            </div>
            ${
              canJoin
                ? `<button class="btn btn-primary btn-sm mp-join-row-btn" data-code="${escapeHtml(
                    r.roomCode
                  )}" >${this.tl('mpJoin')}</button>`
                : `<span class="mp-room-locked">${
                    r.phase === 'in_match' ? this.tl('inBattle') : this.tl('roomFull')
                  }</span>`
            }
          </div>
        `;
      })
      .join('');

    this.mpRoomsListEl
      .querySelectorAll('.mp-join-row-btn')
      .forEach((btnEl) => {
        btnEl.addEventListener('click', () => {
          const code = (btnEl as HTMLElement).dataset.code ?? '';
          if (code) {
            this.callbacks.onMpJoinRoom(
              code,
              this.getEnteredPlayerName(),
              this.currentSelectedClass
            );
          }
        });
      });
  }

  public updateMultiplayerRoom(
    room: RoomLobbyState | null,
    myClientId: string | null
  ): void {
    this.mpRoom = room;
    this.mpMyClientId = myClientId;

    const inLobbyRoom = Boolean(room && room.phase === 'lobby');
    this.mpBrowserViewEl.classList.toggle('hidden', inLobbyRoom);
    this.mpRoomViewEl.classList.toggle('hidden', !inLobbyRoom);

    if (!room) {
      return;
    }

    const me = room.players.find((p) => p.clientId === myClientId) ?? null;
    if (me && me.classId !== this.currentSelectedClass) {
      this.currentSelectedClass = me.classId;
      this.renderSelectionClass(me.classId, false);
      this.renderMpClassButtons();
    }

    const isHost = room.hostClientId === myClientId;
    this.mpRoomCodeTextEl.textContent = room.roomCode;
    this.mpRoomBotsToggleEl.checked = room.fillBots;
    this.mpRoomPublicToggleEl.checked = room.isPublic;
    this.mpRoomBotsToggleEl.disabled = !isHost;
    this.mpRoomPublicToggleEl.disabled = !isHost;

    // Render 5 Modern Party Cards
    const slotsHtml: string[] = [];
    for (let idx = 0; idx < MAX_PLAYERS_PER_ROOM; idx++) {
      const p = room.players[idx];
      if (p) {
        const clsCfg = KNIGHT_CLASSES[p.classId];
        const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[p.classId]);
        const isMe = p.clientId === myClientId;
        const readyPill = p.isHost
          ? `<span class="mp-slot-pill host">${this.tl('leader')}</span>`
          : p.ready
          ? `<span class="mp-slot-pill ready">${this.tl('ready')}</span>`
          : `<span class="mp-slot-pill wait">${this.tl('notReady')}</span>`;

        slotsHtml.push(`
          <div class="mp-slot-card occupied cls-${p.classId} ${
          isMe ? 'me' : ''
        }">
            <div class="mp-slot-top">
              <span class="mp-slot-index">#${idx + 1}</span>
              <span class="mp-slot-ping">${p.pingMs} ms</span>
            </div>
            <img class="mp-slot-emblem" src="${iconUrl}" alt="" draggable="false" />
            <div class="mp-slot-body">
              <strong class="mp-slot-name">${escapeHtml(p.clientId.startsWith('c_bot_') ? botDisplayName(p.name, this.settings.language) : p.name)}${
          isMe ? ` (${this.tl('you')})` : ''
        }</strong>
              <div class="mp-slot-sub">${classDisplayName(p.classId, this.settings.language)} · ${clsCfg.maxHp} HP</div>
            </div>
            ${readyPill}
          </div>
        `);
      } else if (room.fillBots) {
        slotsHtml.push(`
          <div class="mp-slot-card bot-slot">
            <div class="mp-slot-top">
              <span class="mp-slot-index">#${idx + 1}</span>
              <span class="mp-slot-tag-mini">${this.tl('ai')}</span>
            </div>
            <div class="mp-slot-bot-badge">${ICONS.bot}</div>
            <div class="mp-slot-body">
              <span class="mp-slot-name muted">${this.tl('arenaBot')}</span>
              <div class="mp-slot-sub">${this.tl('botReplaced')}</div>
            </div>
            <span class="mp-slot-pill bot">${this.tl('autoBot')}</span>
          </div>
        `);
      } else {
        slotsHtml.push(`
          <div class="mp-slot-card empty-slot">
            <div class="mp-slot-top">
              <span class="mp-slot-index">#${idx + 1}</span>
              <span class="mp-slot-tag-mini">${this.tl('freeSlot')}</span>
            </div>
            <div class="mp-slot-bot-badge">${ICONS.user}</div>
            <div class="mp-slot-body">
              <span class="mp-slot-name muted">${this.tl('waitingPlayer')}</span>
              <div class="mp-slot-sub">${this.tl('codeLabel', { code: escapeHtml(room.roomCode) })}</div>
            </div>
            <span class="mp-slot-pill wait">${this.tl('empty')}</span>
          </div>
        `);
      }
    }
    this.mpSlotsGridEl.innerHTML = slotsHtml.join('');

    // Host vs Guest buttons
    if (isHost) {
      this.mpReadyBtnEl.classList.add('hidden');
      this.mpStartBtnEl.classList.remove('hidden');
      const canStart = room.fillBots || room.players.length >= 2;
      this.mpStartBtnEl.disabled = !canStart;
      this.mpStartBtnEl.style.opacity = canStart ? '1' : '0.45';
    } else {
      this.mpStartBtnEl.classList.add('hidden');
      this.mpReadyBtnEl.classList.remove('hidden');
      const readyNow = me ? me.ready : true;
      this.mpReadyBtnEl.textContent = readyNow
        ? this.tl('cancelReady')
        : this.tl('confirmReady');
    }
  }

  public update(
    match: MatchManager,
    labels: ProjectedFighterLabel[],
    pointerLocked: boolean,
    reticleState?: HudReticleViewState
  ): void {
    const st = match.state;

    if (st !== this.lastRenderedState || match.paused !== this.lastPaused) {
      this.lastRenderedState = st;
      this.lastPaused = match.paused;

      const inHub =
        st === 'MainMenu' ||
        st === 'CharacterSelection' ||
        st === 'MultiplayerLobby';
      this.hubTopDockEl.classList.toggle('hidden', !inHub);

      this.navTabArenaEl.classList.toggle('active', st === 'MainMenu');
      this.navTabHeroesEl.classList.toggle(
        'active',
        st === 'CharacterSelection'
      );
      this.navTabOnlineEl.classList.toggle('active', st === 'MultiplayerLobby');

      this.mainMenuEl.classList.toggle('hidden', st !== 'MainMenu');
      this.selectionEl.classList.toggle('hidden', st !== 'CharacterSelection');
      this.multiplayerEl.classList.toggle('hidden', st !== 'MultiplayerLobby');

      const inHud =
        st === 'Countdown' ||
        st === 'InProgress' ||
        st === 'PlayerEliminated';
      this.hudEl.classList.toggle('hidden', !inHud);

      this.pauseModalEl.classList.toggle('hidden', !match.paused);
      if (!match.paused && !inHub) {
        this.settingsModalEl.classList.add('hidden');
        this.controlsModalEl.classList.add('hidden');
      }

      this.resultsModalEl.classList.toggle('hidden', st !== 'MatchFinished');

      // Online-aware Pause & Spectator button labels
      this.pauseRestartBtnEl.classList.toggle('hidden', match.isOnlineMatch);
      this.pauseMenuBtnEl.innerHTML = match.isOnlineMatch
        ? `${ICONS.door}<span>${this.tl('leaveBattle')}</span>`
        : `${ICONS.door}<span>${this.tl('pauseMenu')}</span>`;

      this.specRestartBtnEl.classList.toggle('hidden', match.isOnlineMatch);
      this.specMenuBtnEl.textContent = match.isOnlineMatch
        ? this.tl('mpLeave')
        : this.tl('backMenu');
    }

    if (st === 'MatchFinished') {
      const isHost = Boolean(
        this.mpRoom && this.mpRoom.hostClientId === this.mpMyClientId
      );
      const key = `${match.matchGeneration}_${match.isOnlineMatch}_${isHost}_${match.fighters.length}`;
      if (this.resultsRenderedKey !== key) {
        this.resultsRenderedKey = key;
        // Award coins to profile
        const rewards = match.getMatchRewards();
        if (rewards.coins > 0) {
          this.profile = addCoins(this.profile, rewards.coins);
          saveProfile(this.profile);
          this.hubCoinDisplayEl.textContent = String(this.profile.coins);
          this.q('#hub-main-coin-display').textContent = String(this.profile.coins);
        }
        this.lastResults = { match, isHost, rewards };
        this.renderResults(match, isHost, rewards);
      }
      return;
    }

    if (
      st === 'Countdown' ||
      st === 'InProgress' ||
      st === 'PlayerEliminated'
    ) {
      this.updateActiveHud(match, labels, pointerLocked, reticleState);
    }
  }

  private bindEvents(): void {
    const openSettings = () => {
      this.settingsModalEl.classList.remove('hidden');
    };
    const closeSettings = () => {
      this.settingsModalEl.classList.add('hidden');
    };
    const openControls = () => {
      this.controlsModalEl.classList.remove('hidden');
    };
    const closeControls = () => {
      this.controlsModalEl.classList.add('hidden');
    };

    // Persistent Top Hub Dock
    this.q('#btn-brand-home').addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });
    this.navTabArenaEl.addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });
    this.navTabHeroesEl.addEventListener('click', () => {
      this.callbacks.onOpenSelection();
    });
    this.navTabOnlineEl.addEventListener('click', () => {
      this.callbacks.onOpenMultiplayer();
    });
    this.q('#btn-open-controls').addEventListener('click', openControls);
    this.q('#btn-menu-settings').addEventListener('click', openSettings);

    // Main Hub Mode Cards & Quick Launch
    this.hubModeFfaCardEl.addEventListener('click', () => {
      this.selectedMode = 'ffa5';
      this.syncModeButtons();
    });
    this.hubModeFfaCardEl.addEventListener('dblclick', () => {
      this.selectedMode = 'ffa5';
      this.syncModeButtons();
      this.callbacks.onStartMatch(this.currentSelectedClass, 'ffa5');
    });

    this.hubModeDuelCardEl.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement | null)?.id === 'btn-menu-duel') return;
      this.selectedMode = 'duel_debug';
      this.syncModeButtons();
    });
    this.hubModeDuelCardEl.addEventListener('dblclick', () => {
      this.selectedMode = 'duel_debug';
      this.syncModeButtons();
      this.callbacks.onStartMatch(this.currentSelectedClass, 'duel_debug');
    });

    this.q('#btn-menu-duel').addEventListener('click', (ev) => {
      (ev as Event).stopPropagation?.();
      this.selectedMode = 'duel_debug';
      this.syncModeButtons();
      this.callbacks.onStartMatch(this.currentSelectedClass, 'duel_debug');
    });

    this.q('#hub-mode-online').addEventListener('click', () => {
      this.callbacks.onOpenMultiplayer();
    });

    this.q('#btn-hub-inspect').addEventListener('click', () => {
      this.callbacks.onOpenSelection();
    });

    // Big Main Hub Play CTA — buy hero if not owned, otherwise start match!
    this.q('#btn-menu-quick').addEventListener('click', () => {
      const owned = isKnightUnlocked(this.profile, this.currentSelectedClass);
      if (!owned) {
        const unlock = KNIGHT_UNLOCK_CONFIG[this.currentSelectedClass];
        if (this.profile.coins < unlock.price) {
          // Not enough coins — do nothing (could show a toast later)
          return;
        }
        const purchased = addCoins(this.profile, -unlock.price);
        this.profile = purchased;
        const { profile: newProfile, success } = unlockKnight(
          this.profile,
          this.currentSelectedClass
        );
        if (!success) return;
        this.profile = newProfile;
        saveProfile(this.profile);
        this.hubCoinDisplayEl.textContent = String(this.profile.coins);
        this.q('#hub-main-coin-display').textContent = String(this.profile.coins);
        this.renderHubQuickHeroStrip();
        this.updatePlayButtonSubtitle();
        return;
      }
      this.callbacks.onStartMatch(this.currentSelectedClass, this.selectedMode);
    });

    // Heroes Inspector Screen
    this.q('#mode-ffa5').addEventListener('click', () => {
      this.selectedMode = 'ffa5';
      this.syncModeButtons();
    });
    this.q('#mode-duel').addEventListener('click', () => {
      this.selectedMode = 'duel_debug';
      this.syncModeButtons();
    });
    this.q('#btn-sel-back').addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });
    this.q('#btn-sel-start').addEventListener('click', () => {
      this.callbacks.onStartMatch(this.currentSelectedClass, this.selectedMode);
    });

    // Multiplayer Lobby & Waiting Room
    this.mpNameInputEl.addEventListener('change', () => {
      const name = this.getEnteredPlayerName();
      this.callbacks.onMpSetName(name);
    });
    this.q('#btn-mp-quick').addEventListener('click', () => {
      this.callbacks.onMpQuickJoin(
        this.getEnteredPlayerName(),
        this.currentSelectedClass
      );
    });
    this.q('#btn-mp-create').addEventListener('click', () => {
      this.callbacks.onMpCreateRoom({
        playerName: this.getEnteredPlayerName(),
        classId: this.currentSelectedClass,
        fillBots: this.mpOptBotsEl.checked,
        isPublic: this.mpOptPublicEl.checked,
      });
    });
    this.q('#btn-mp-join-code').addEventListener('click', () => {
      const code = this.mpCodeInputEl.value.trim().toUpperCase();
      if (code.length < 3) {
        this.showMultiplayerNotice(this.tl('invalidCode'), 'error');
        return;
      }
      this.callbacks.onMpJoinRoom(
        code,
        this.getEnteredPlayerName(),
        this.currentSelectedClass
      );
    });
    this.mpCodeInputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        (this.q('#btn-mp-join-code') as HTMLButtonElement).click();
      }
    });
    this.q('#btn-mp-refresh').addEventListener('click', () => {
      this.callbacks.onMpRefreshRooms();
    });
    this.q('#btn-mp-back').addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });

    this.mpCopyCodeBtnEl.addEventListener('click', () => {
      if (!this.mpRoom) return;
      const code = this.mpRoom.roomCode;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).catch(() => {});
      } else {
        try {
          const tmp = document.createElement('textarea');
          tmp.value = code;
          tmp.style.position = 'fixed';
          tmp.style.opacity = '0';
          document.body.appendChild(tmp);
          tmp.select();
          document.execCommand('copy');
          tmp.remove();
        } catch {
          // Ignore
        }
      }
      this.showMultiplayerNotice(
        this.tl('mpNoticeCopied', { code }),
        'info'
      );
    });
    this.mpRoomBotsToggleEl.addEventListener('change', () => {
      this.callbacks.onMpRoomOptions({
        fillBots: this.mpRoomBotsToggleEl.checked,
        isPublic: this.mpRoomPublicToggleEl.checked,
      });
    });
    this.mpRoomPublicToggleEl.addEventListener('change', () => {
      this.callbacks.onMpRoomOptions({
        fillBots: this.mpRoomBotsToggleEl.checked,
        isPublic: this.mpRoomPublicToggleEl.checked,
      });
    });
    this.q('#btn-mp-leave').addEventListener('click', () => {
      this.callbacks.onMpLeaveRoom();
    });
    this.mpReadyBtnEl.addEventListener('click', () => {
      const me = this.mpRoom?.players.find(
        (p) => p.clientId === this.mpMyClientId
      );
      this.callbacks.onMpToggleReady(!(me?.ready ?? true));
    });
    this.mpStartBtnEl.addEventListener('click', () => {
      this.callbacks.onMpStartMatch();
    });

    // Pause Modal
    this.q('#btn-pause-resume').addEventListener('click', () => {
      this.callbacks.onResumeGame();
    });
    this.pauseRestartBtnEl.addEventListener('click', () => {
      this.callbacks.onRestartMatch();
    });
    this.q('#btn-pause-settings').addEventListener('click', openSettings);
    this.q('#btn-pause-controls').addEventListener('click', openControls);
    this.pauseMenuBtnEl.addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });

    // Controls Cheat-Sheet Modal
    this.q('#btn-controls-close').addEventListener('click', closeControls);
    this.q('#btn-controls-x').addEventListener('click', closeControls);
    this.controlsModalEl.addEventListener('click', (ev) => {
      if (ev.target === this.controlsModalEl) closeControls();
    });

    // Spectator Controls
    this.q('#btn-spec-prev').addEventListener('click', () => {
      this.callbacks.onCycleSpectator(-1);
    });
    this.q('#btn-spec-next').addEventListener('click', () => {
      this.callbacks.onCycleSpectator(1);
    });
    this.specRestartBtnEl.addEventListener('click', () => {
      this.callbacks.onRestartMatch();
    });
    this.specMenuBtnEl.addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });

    // Results buttons
    this.resAgainBtnEl.addEventListener('click', () => {
      this.callbacks.onRestartMatch();
    });
    this.resClassBtnEl.addEventListener('click', () => {
      if (this.mpRoom) {
        this.callbacks.onMpReturnToLobby();
      } else {
        this.callbacks.onOpenSelection();
      }
    });
    this.resMenuBtnEl.addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });

    // Watch ad button (menu)
    this.btnWatchAdEl.addEventListener('click', () => {
      this.showAd();
    });

    // Ad modal close
    this.adCloseBtnEl.addEventListener('click', () => {
      this.hideAd();
    });
    this.adRewardBtnEl.addEventListener('click', () => {
      this.claimAdReward();
    });
    this.adModalEl.addEventListener('click', (ev) => {
      if (ev.target === this.adModalEl) {
        this.hideAd();
      }
    });

    this.mpNameInputEl.addEventListener('input', () => { this.playerNameEdited = true; });

    // Settings controls
    const volInp = this.q('#inp-vol') as HTMLInputElement;
    const sensInp = this.q('#inp-sens') as HTMLInputElement;
    const pixInp = this.q('#inp-pix') as HTMLInputElement;
    const dbgInp = this.q('#inp-debug') as HTMLInputElement;

    const pushSettings = (
      overrideQual?: GraphicsQuality,
      overrideTheme?: ArenaThemeId
    ) => {
      const pVal = Number(pixInp.value);
      const pixelScale: 1 | 2 | 3 = pVal === 2 ? 2 : pVal === 3 ? 3 : 1;
      this.settings = {
        language: this.settings.language,
        masterVolume: Number(volInp.value) / 100,
        mouseSensitivity: Number(sensInp.value) / 100,
        pixelScale,
        debugHitboxes: dbgInp.checked,
        graphicsQuality: overrideQual ?? this.settings.graphicsQuality,
        arenaTheme: overrideTheme ?? this.settings.arenaTheme,
      };
      this.syncSettingsControls();
      this.callbacks.onSettingsChanged(this.settings);
    };

    this.root
      .querySelectorAll<HTMLButtonElement>('[data-arena-theme]')
      .forEach((chip) => {
        chip.addEventListener('click', () => {
          const themeId = chip.dataset.arenaTheme as ArenaThemeId | undefined;
          if (themeId) {
            pushSettings(undefined, themeId);
          }
        });
      });

    volInp.addEventListener('input', () => pushSettings());
    sensInp.addEventListener('input', () => pushSettings());
    pixInp.addEventListener('input', () => pushSettings());
    dbgInp.addEventListener('change', () => pushSettings());

    this.q('#qual-ultra').addEventListener('click', () => pushSettings('ultra'));
    this.q('#qual-high').addEventListener('click', () => pushSettings('high'));
    this.q('#qual-low').addEventListener('click', () => pushSettings('low'));

    // Language tabs
    this.root.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.lang as Lang | undefined;
        if (!code) return;
        this.settings = { ...this.settings, language: code };
        markLanguageSelected();
        this.refreshLanguage();
        this.callbacks.onSettingsChanged(this.settings);
      });
    });

    const about = this.q('#modal-about');
    const closeAbout = () => about.classList.add('hidden');
    this.q('#btn-settings-about').addEventListener('click', () => about.classList.remove('hidden'));
    this.q('#btn-about-close').addEventListener('click', closeAbout);
    this.q('#btn-about-x').addEventListener('click', closeAbout);
    about.addEventListener('click', (event) => { if (event.target === about) closeAbout(); });
    about.querySelectorAll<HTMLDetailsElement>('details[data-license-path]').forEach((details) => {
      details.addEventListener('toggle', () => {
        if (!details.open || details.dataset.loaded === 'true') return;
        const text = details.querySelector('pre')!;
        text.textContent = this.tl('aboutLoading');
        void fetch(assetUrl(details.dataset.licensePath!)).then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        }).then((value) => {
          text.textContent = value;
          details.dataset.loaded = 'true';
        }).catch(() => { text.textContent = this.tl('aboutError'); });
      });
    });

    this.q('#btn-settings-close').addEventListener('click', closeSettings);
    this.q('#btn-settings-x').addEventListener('click', closeSettings);
    this.settingsModalEl.addEventListener('click', (ev) => {
      if (ev.target === this.settingsModalEl) {
        closeSettings();
      }
    });
  }

  private currentSelectedClass: KnightClassId = 'sword';

  private renderHubQuickHeroStrip(): void {
    this.hubHeroStripEl.innerHTML = CLASS_ORDER.map((cid) => {
      const c = KNIGHT_CLASSES[cid];
      const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[cid]);
      const isAct = cid === this.currentSelectedClass;
      const owned = isKnightUnlocked(this.profile, cid);
      const unlock = KNIGHT_UNLOCK_CONFIG[cid];
      const priceTag = owned
        ? ''
        : `<span class="hub-hero-price">${this.tl('hubHeroPrice', { price: unlock.price })}</span>`;
      return `
        <button class="hub-hero-chip cls-${cid} ${
        isAct ? 'active' : ''
      } ${!owned ? 'locked' : ''}" data-cid="${cid}" title="${classDisplayName(cid, this.settings.language)}">
          <img class="hub-hero-avatar" src="${iconUrl}" alt="" draggable="false" />
          <div class="hub-hero-meta">
            <strong>${classDisplayName(cid, this.settings.language)}</strong>
            <span>${c.maxHp} HP</span>
            ${priceTag}
          </div>
        </button>
      `;
    }).join('');

    this.hubHeroStripEl.querySelectorAll('.hub-hero-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.cid as KnightClassId;
        this.renderSelectionClass(cid, true);
        this.renderMpClassButtons();
      });
    });

    this.updatePlayButtonSubtitle();
  }

  private updatePlayButtonSubtitle(): void {
    const modeLabel =
      this.selectedMode === 'ffa5'
        ? this.tl('modeFfaTag')
        : this.tl('modeDuelTag');
    const clsName = classDisplayName(
      this.currentSelectedClass,
      this.settings.language
    );
    const owned = isKnightUnlocked(this.profile, this.currentSelectedClass);
    const unlock = KNIGHT_UNLOCK_CONFIG[this.currentSelectedClass];
    const btn = this.q('#btn-menu-quick');

    this.hubPlayTitleEl.textContent = owned
      ? this.tl('playFight')
      : this.tl('playBuy', { price: unlock.price });
    this.hubPlaySubEl.textContent = owned
      ? `${modeLabel} · ${clsName}`
      : `${this.tl('playBuy', { price: unlock.price })} · ${clsName}`;
    btn.classList.toggle('buy-state', !owned);
  }

  private renderMpClassButtons(): void {
    const html = CLASS_ORDER.map((cid) => {
      const c = KNIGHT_CLASSES[cid];
      const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[cid]);
      return `
        <button class="mp-cls-btn cls-${cid} ${
          cid === this.currentSelectedClass ? 'active' : ''
        }" data-cid="${cid}" title="${classDisplayName(cid, this.settings.language)} (${c.maxHp} HP)">
          <img src="${iconUrl}" alt="" draggable="false" />
          <span>${classDisplayName(cid, this.settings.language)}</span>
        </button>
      `;
    }).join('');

    this.mpClassTabsEl.innerHTML = html;
    this.mpRoomClassTabsEl.innerHTML = html;

    const bindContainer = (el: HTMLElement) => {
      el.querySelectorAll('.mp-cls-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = (btn as HTMLElement).dataset.cid as KnightClassId;
          this.renderSelectionClass(cid, false);
          this.renderMpClassButtons();
          this.callbacks.onMpSelectClass(cid);
        });
      });
    };

    bindContainer(this.mpClassTabsEl);
    bindContainer(this.mpRoomClassTabsEl);
  }

  private populateSkillSquares(
    container: HTMLElement,
    classId: KnightClassId,
    interactiveClicks: boolean
  ): ActionBarSlotRefs[] {
    const descriptors = buildClassSkillBar(classId, this.settings.language);
    container.innerHTML = '';
    const refs: ActionBarSlotRefs[] = [];

    descriptors.forEach((slot, index) => {
      if (index === 3 || index === 6) {
        const sep = document.createElement('div');
        sep.className = 'skill-bar-sep';
        container.appendChild(sep);
      }

      const rootEl = document.createElement('div');
      rootEl.className = `skill-sq ${
        slot.isSignature ? 'signature' : 'core'
      } ready`;
      rootEl.dataset.slot = slot.slotKey;

      const cdMeta =
        slot.cooldownSec !== null
          ? `<span>${this.tl('skillCooldown', { value: slot.cooldownSec })}</span>`
          : `<span><strong>${this.tl('skillNoCooldown')}</strong></span>`;
      const stamMeta =
        slot.staminaCost > 0
          ? `<span>${this.tl('skillStamina', { value: slot.staminaCost })}</span>`
          : `<span>${this.tl('skillStamina', { value: 0 })}</span>`;
      const badgesHtml = slot.badges
        .map((b) => `<span class="skill-tip-badge">${b}</span>`)
        .join('');

      rootEl.innerHTML = `
        <div class="skill-sq-frame">
          <img class="skill-sq-img" src="${slot.iconUrl}" alt="${slot.title}" draggable="false" />
          <div class="skill-sq-cd-veil" style="height: 0%"></div>
          <div class="skill-sq-cd-num hidden"></div>
        </div>
        <span class="skill-sq-key">${slot.hotkey}</span>
        ${
          slot.staminaCost > 0
            ? `<span class="skill-sq-stam">${slot.staminaCost}</span>`
            : ''
        }
        <div class="skill-tooltip" role="tooltip">
          <div class="skill-tip-head">
            <img class="skill-tip-icon" src="${slot.iconUrl}" alt="" draggable="false" />
            <div class="skill-tip-titles">
              <div class="skill-tip-name">${slot.title}</div>
              <div class="skill-tip-cat">${slot.category}</div>
            </div>
          </div>
          <div class="skill-tip-costs">
            ${cdMeta}
            ${stamMeta}
          </div>
          <div class="skill-tip-badges">${badgesHtml}</div>
          <div class="skill-tip-desc">${slot.description}</div>
        </div>
      `;

      if (interactiveClicks && this.callbacks.onTriggerSkillSlot) {
        rootEl.addEventListener('mousedown', (ev) => {
          ev.stopPropagation();
          if (ev.button === 0) {
            this.callbacks.onTriggerSkillSlot?.(slot.slotKey);
          }
        });
      }

      container.appendChild(rootEl);

      refs.push({
        descriptor: slot,
        rootEl,
        cdVeilEl: rootEl.querySelector('.skill-sq-cd-veil') as HTMLElement,
        cdNumEl: rootEl.querySelector('.skill-sq-cd-num') as HTMLElement,
      });
    });

    return refs;
  }

  private renderSelectionClass(
    classId: KnightClassId,
    userInitiated = false
  ): void {
    this.currentSelectedClass = classId;
    this.heroBentoCardEl.dataset.cls = classId;
    this.callbacks.onSelectPreviewClass(classId, userInitiated);

    const tabsEl = this.q('#class-tabs');
    tabsEl.innerHTML = CLASS_ORDER.map((cid) => {
      const c = KNIGHT_CLASSES[cid];
      const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[cid]);
      return `
        <button class="class-tab cls-${cid} ${
          cid === classId ? 'active' : ''
        }" data-cid="${cid}">
          <img class="class-tab-emblem" src="${iconUrl}" alt="" draggable="false" />
          <div class="class-tab-text">
            <div class="class-tab-name">${classDisplayName(cid, this.settings.language)}</div>
            <div class="class-tab-code">${heroText(cid, 'role', this.settings.language, c.role)}</div>
          </div>
        </button>
      `;
    }).join('');

    tabsEl.querySelectorAll('.class-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.cid as KnightClassId;
        this.renderSelectionClass(cid, true);
        this.renderMpClassButtons();
      });
    });

    this.renderHubQuickHeroStrip();

    const cfg = KNIGHT_CLASSES[classId];
    const detailsEl = this.q('#class-details');
    const bar = (val: number) => Math.min(100, Math.round((val / 5) * 100));

    detailsEl.innerHTML = `
      <div class="dossier-hero-head">
        <div class="dossier-badges-row">
          <span class="dossier-role-pill">${heroText(classId, 'role', this.settings.language, cfg.role)}</span>
          <span class="dossier-hp-pill">${cfg.maxHp} HP</span>
        </div>
        <h3 class="dossier-class-title">${classDisplayName(classId, this.settings.language)}</h3>
        <p class="dossier-summary">${heroText(classId, 'summary', this.settings.language, cfg.summary)}</p>
      </div>

      <div class="stat-grid">
        <div class="stat-row">
          <span class="stat-lbl" data-i18n="statHealth">Здоровье</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill hp-tone" style="width:${bar(
            cfg.uiRatings.hp
          )}%"></div></div>
          <strong class="stat-num">${cfg.maxHp}</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl" data-i18n="statSpeed">Скорость</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.speed
          )}%"></div></div>
          <strong class="stat-num">${this.tl('metersSec', { value: cfg.moveSpeed.toFixed(1) })}</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl" data-i18n="statAttack">Сила удара</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.attack
          )}%"></div></div>
          <strong class="stat-num">${cfg.lightCombo
            .map((c) => c.damage)
            .join('·')} / ${cfg.heavyAttack.damage}</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl" data-i18n="statDefense">Защита</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.defense
          )}%"></div></div>
          <strong class="stat-num">${Math.round(
            cfg.defense.damageReduction * 100
          )}%</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl" data-i18n="statReach">Дальность</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.reach
          )}%"></div></div>
          <strong class="stat-num">${this.tl('meters', { value: cfg.heavyAttack.range.toFixed(1) })}</strong>
        </div>
      </div>

      <div class="bento-label" style="margin-bottom: 8px;" data-i18n="uniqueSkills">Уникальные навыки [1], [2] и [3]</div>
      <div class="sel-abilities-grid">
        ${cfg.abilities
          .map(
            (ab) => `
          <div class="sel-ability-card">
            <img class="sel-ability-icon-img" src="${getSkillIconUrl(
              `${ab.id}.svg`
            )}" alt="${abilityText(ab.id, 'name', this.settings.language, ab.name)}" draggable="false" />
            <div class="sel-ability-body">
              <div class="sel-ability-head">
                <span class="sel-ability-key">${ab.slot}</span>
                <span class="sel-ability-name">${abilityText(ab.id, 'name', this.settings.language, ab.name)}</span>
                <span class="sel-ability-meta">${this.tl('abilityMeta', { cooldown: ab.cooldown, stamina: ab.staminaCost })}</span>
              </div>
              <div class="sel-ability-desc">${abilityText(ab.id, 'description', this.settings.language, ab.description)}</div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    this.populateSkillSquares(this.selectionSkillBarEl, classId, false);
    this.applyTranslations();
    this.updatePlayButtonSubtitle();
  }

  private syncModeButtons(): void {
    const isFfa = this.selectedMode === 'ffa5';
    this.q('#mode-ffa5').classList.toggle('active', isFfa);
    this.q('#mode-duel').classList.toggle('active', !isFfa);
    this.hubModeFfaCardEl.classList.toggle('active', isFfa);
    this.hubModeDuelCardEl.classList.toggle('active', !isFfa);
    this.updatePlayButtonSubtitle();
  }

  private syncSettingsControls(): void {
    (this.q('#inp-vol') as HTMLInputElement).value = String(
      Math.round(this.settings.masterVolume * 100)
    );
    this.q('#lbl-vol').textContent = `${Math.round(
      this.settings.masterVolume * 100
    )}%`;

    (this.q('#inp-sens') as HTMLInputElement).value = String(
      Math.round(this.settings.mouseSensitivity * 100)
    );
    this.q('#lbl-sens').textContent = `${this.settings.mouseSensitivity.toFixed(
      2
    )}x`;

    (this.q('#inp-pix') as HTMLInputElement).value = String(
      this.settings.pixelScale
    );
    this.q('#lbl-pix').textContent =
      this.settings.pixelScale === 1
        ? this.tl('pixel1')
        : this.settings.pixelScale === 2
        ? this.tl('pixel2')
        : this.tl('pixel3');

    const q = this.settings.graphicsQuality;
    this.q('#qual-ultra').classList.toggle('active', q === 'ultra');
    this.q('#qual-high').classList.toggle('active', q === 'high');
    this.q('#qual-low').classList.toggle('active', q === 'low');
    this.q('#lbl-qual').textContent =
      q === 'ultra'
        ? this.tl('qualityUltraDesc')
        : q === 'high'
        ? this.tl('qualityHighDesc')
        : this.tl('qualityLow');

    (this.q('#inp-debug') as HTMLInputElement).checked =
      this.settings.debugHitboxes;

    const themeMeta = getArenaThemeMeta(this.settings.arenaTheme);
    this.q('#lbl-arena-theme').textContent = this.tl(`theme_${themeMeta.id}`);
    this.q('#hub-arena-theme-label').textContent = this.tl(`theme_${themeMeta.id}`);
    this.root.querySelectorAll<HTMLButtonElement>('[data-arena-theme]').forEach((chip) => {
      const id = chip.dataset.arenaTheme;
      if (id) chip.title = `${this.tl(`theme_${id}`)} — ${this.tl(`themeDesc_${id}`)}`;
      const name = chip.querySelector('.arena-theme-chip-name');
      if (id && name) name.textContent = this.tl(`themeShort_${id}`);
    });
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-arena-theme]')
      .forEach((chip) => {
        chip.classList.toggle(
          'active',
          chip.dataset.arenaTheme === this.settings.arenaTheme
        );
      });

    // Language controls
    const langMeta = LANGS.find((l) => l.code === this.settings.language);
    this.q('#lbl-lang').textContent = langMeta ? langMeta.name : this.settings.language;
    this.root
      .querySelectorAll<HTMLButtonElement>('.lang-btn')
      .forEach((chip) => {
        const active = chip.dataset.lang === this.settings.language;
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', String(active));
      });

    // RTL direction for Arabic
    document.documentElement.dir = isRtl(this.settings.language) ? 'rtl' : 'ltr';
    document.documentElement.lang = this.settings.language;
  }

  private updateActionBarForFighter(
    fighter: Fighter | null,
    pointerLocked: boolean
  ): void {
    if (!fighter) {
      this.actionBarWrapEl.classList.add('hidden');
      return;
    }
    this.actionBarWrapEl.classList.remove('hidden');

    if (this.renderedActionBarClass !== fighter.classId) {
      this.renderedActionBarClass = fighter.classId;
      this.actionBarRefs = this.populateSkillSquares(
        this.actionBarSlotsEl,
        fighter.classId,
        true
      );
    }

    this.actionBarHintEl.textContent = pointerLocked
      ? this.tl('actionHintLocked')
      : this.tl('actionHintFree');

    for (const ref of this.actionBarRefs) {
      const { descriptor, rootEl, cdVeilEl, cdNumEl } = ref;
      let cdRem = 0;
      let cdPct = 0;
      let isActiveNow = false;

      switch (descriptor.slotKey) {
        case 'light':
          isActiveNow =
            fighter.state === 'Attacking' && fighter.activeAbility === null;
          break;
        case 'heavy':
          isActiveNow =
            fighter.isChargingHeavy ||
            (fighter.state === 'HeavyAttacking' &&
              fighter.activeAbility === null);
          break;
        case 'defense':
          isActiveNow = fighter.state === 'Blocking';
          if (fighter.defenseLockoutTimer > 0) {
            cdRem = fighter.defenseLockoutTimer;
            cdPct = Math.min(100, (cdRem / 0.55) * 100);
          }
          break;
        case 'ability1':
          cdRem = fighter.abilityCooldowns[0];
          cdPct =
            descriptor.cooldownSec && descriptor.cooldownSec > 0
              ? Math.min(100, (cdRem / descriptor.cooldownSec) * 100)
              : 0;
          isActiveNow = fighter.activeAbility?.slot === 1;
          break;
        case 'ability2':
          cdRem = fighter.abilityCooldowns[1];
          cdPct =
            descriptor.cooldownSec && descriptor.cooldownSec > 0
              ? Math.min(100, (cdRem / descriptor.cooldownSec) * 100)
              : 0;
          isActiveNow = fighter.activeAbility?.slot === 2;
          break;
        case 'ability3':
          cdRem = fighter.abilityCooldowns[2];
          cdPct =
            descriptor.cooldownSec && descriptor.cooldownSec > 0
              ? Math.min(100, (cdRem / descriptor.cooldownSec) * 100)
              : 0;
          isActiveNow = fighter.activeAbility?.slot === 3;
          break;
        case 'dodge':
          isActiveNow = fighter.state === 'Dodging';
          break;
      }

      const noStam =
        cdRem <= 0.02 &&
        descriptor.staminaCost > 0 &&
        fighter.stamina < descriptor.staminaCost;

      rootEl.classList.toggle('active-now', isActiveNow);
      rootEl.classList.toggle('on-cd', cdRem > 0.04 && !isActiveNow);
      rootEl.classList.toggle('no-stam', noStam && !isActiveNow);
      rootEl.classList.toggle(
        'ready',
        !isActiveNow && cdRem <= 0.04 && !noStam
      );

      if (cdRem > 0.04 && !isActiveNow) {
        cdVeilEl.style.height = `${Math.round(cdPct)}%`;
        cdNumEl.classList.remove('hidden');
        cdNumEl.textContent =
          cdRem >= 9.95 ? `${Math.ceil(cdRem)}` : cdRem.toFixed(1);
      } else {
        cdVeilEl.style.height = '0%';
        cdNumEl.classList.add('hidden');
      }
    }
  }

  private updateActiveHud(
    match: MatchManager,
    labels: ProjectedFighterLabel[],
    pointerLocked: boolean,
    reticleState?: HudReticleViewState
  ): void {
    // 1. Timer, Alive Pill & Online Room/Ping Pill
    const secs = Math.ceil(match.matchTimeRemaining);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.timerEl.textContent = match.isFinalPhase
      ? `${this.tl('finalPhase')} · ${mm}:${ss}`
      : `${mm}:${ss}`;
    this.timerEl.classList.toggle('final-phase', match.isFinalPhase);

    const aliveCount = match.getLivingFighters().length;
    this.alivePillEl.textContent = this.tl('aliveCount', { alive: aliveCount, total: match.fighters.length });

    if (match.isOnlineMatch) {
      this.netHudSepEl.classList.remove('hidden');
      this.netHudPillEl.classList.remove('hidden');
      const code = this.mpRoom ? this.mpRoom.roomCode : this.tl('mpOnline');
      this.netHudPillEl.textContent =
        this.mpPingMs > 0
          ? this.tl('roomPing', { code, ping: this.mpPingMs })
          : this.tl('roomLabel', { code });
    } else {
      this.netHudSepEl.classList.add('hidden');
      this.netHudPillEl.classList.add('hidden');
    }

    // 2. Countdown Banner
    if (match.state === 'Countdown') {
      this.countdownBannerEl.classList.remove('hidden');
      const num = Math.ceil(match.countdownTimer);
      this.countdownBannerEl.textContent = num > 0 ? String(num) : this.tl('playFight');
    } else {
      this.countdownBannerEl.classList.add('hidden');
    }

    // 3. Pointer Lock / Free-Aim Prompt & Elevated Dynamic Reticle
    const rx = reticleState ? reticleState.normX : 0.5;
    const ry = reticleState ? reticleState.normY : 0.34;
    this.reticleEl.style.left = `${(rx * 100).toFixed(2)}%`;
    this.reticleEl.style.top = `${(ry * 100).toFixed(2)}%`;
    this.reticleEl.classList.toggle(
      'free-aim',
      Boolean(reticleState?.freeCursorAim)
    );
    this.reticleEl.classList.toggle(
      'hidden',
      match.state === 'PlayerEliminated'
    );

    if (reticleState?.targetName && match.state !== 'PlayerEliminated') {
      const pct = Math.max(1, Math.round(reticleState.targetHpRatio * 100));
      this.reticleRingEl.classList.add('locked-enemy');
      this.reticleTargetEl.classList.remove('hidden');
      this.reticleTargetEl.textContent = `${this.fighterName(match, reticleState.targetName)} · ${pct}%`;
    } else {
      this.reticleRingEl.classList.remove('locked-enemy');
      this.reticleTargetEl.classList.add('hidden');
    }

    if (match.paused || match.state === 'PlayerEliminated') {
      this.pointerPromptEl.classList.add('hidden');
    } else if (reticleState?.freeLookActive) {
      this.pointerPromptEl.classList.remove('hidden');
      this.pointerPromptEl.textContent =
        this.tl('freeLookHint');
    } else if (!pointerLocked) {
      this.pointerPromptEl.classList.remove('hidden');
      this.pointerPromptEl.textContent = reticleState?.freeCursorAim
        ? this.tl('aimHint')
        : this.tl('pointerHint');
    } else {
      this.pointerPromptEl.classList.add('hidden');
    }

    // 4. Roster Top-Right
    this.rosterListEl.innerHTML = match.fighters
      .map((f) => {
        const isMe = f.id === match.localPlayerId;
        const pct = Math.max(0, Math.round((f.hp / f.maxHp) * 100));
        return `
          <div class="roster-item cls-${f.classId} ${
          isMe ? 'human' : ''
        } ${f.isAlive ? '' : 'dead'}">
            <div class="roster-row-top">
              <span class="roster-name"><span class="roster-dot"></span>${escapeHtml(
                this.fighterName(match, f.displayName)
              )}${isMe ? ` (${this.tl('you')})` : ''}</span>
              <span class="roster-hp-tag">${
                f.isAlive ? `${Math.ceil(f.hp)}` : this.tl('eliminated')
              }</span>
            </div>
            <div class="roster-mini-hp">
              <div class="roster-mini-hp-fill" style="width:${pct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    // 5. Kill Feed
    this.killFeedEl.innerHTML = match.killFeed
      .slice(0, 4)
      .map((kf) =>
        kf.killerName
          ? `<div class="kill-feed-item"><strong>${escapeHtml(
              this.fighterName(match, kf.killerName)
            )}</strong> <span class="kf-sword">${
              ICONS.blades
            }</span> <strong>${escapeHtml(this.fighterName(match, kf.victimName))}</strong></div>`
          : `<div class="kill-feed-item"><strong>${escapeHtml(
              this.fighterName(match, kf.victimName)
            )}</strong> ${this.tl('eliminated')}</div>`
      )
      .join('');

    // 6. Player Vitals + Bottom Skill Dock
    const player = match.getPlayer();
    const observed = match.getObservedFighter();

    if (match.state === 'PlayerEliminated') {
      this.vitalsBoxEl.classList.add('hidden');
      this.spectatorBarEl.classList.remove('hidden');
      this.spectatorSubEl.textContent = observed
        ? this.tl('spectatorCamera', { name: this.fighterName(match, observed.displayName), hero: classDisplayName(observed.classId, this.settings.language), count: aliveCount })
        : this.tl('decidingWinner');
      this.chargeMeterEl.classList.add('hidden');
      this.updateActionBarForFighter(observed, false);
    } else if (player) {
      this.vitalsBoxEl.classList.remove('hidden');
      this.spectatorBarEl.classList.add('hidden');

      if (this.renderedVitalsClass !== player.classId) {
        this.renderedVitalsClass = player.classId;
        this.playerClassIconEl.src = getSkillIconUrl(
          CLASS_EMBLEM_ICON[player.classId]
        );
      }

      this.playerClassLabelEl.textContent = classDisplayName(player.classId, this.settings.language);
      this.playerStatePillEl.textContent = this.tl(`state${player.state}`);

      const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
      this.hpFillEl.style.width = `${hpPct}%`;
      this.hpTextEl.textContent = `${Math.ceil(player.hp)} / ${player.maxHp} HP`;

      const stPct = Math.max(0, (player.stamina / player.maxStamina) * 100);
      this.stamFillEl.style.width = `${stPct}%`;
      this.stamTextEl.textContent = this.tl('staminaValue', { value: Math.floor(player.stamina) });

      if (player.damageAuraTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = this.tl('buffDamage', { time: player.damageAuraTimer.toFixed(1) });
      } else if (player.hasteTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = this.tl('buffSpeed', { time: player.hasteTimer.toFixed(1) });
      } else if (player.ironBastionTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = this.tl('buffDefense', { time: player.ironBastionTimer.toFixed(1) });
      } else {
        this.activeBuffEl.classList.add('hidden');
      }

      this.updateActionBarForFighter(player, pointerLocked);

      if (player.isChargingHeavy || player.chargeRatio > 0) {
        this.chargeMeterEl.classList.remove('hidden');
        this.chargeFillEl.style.width = `${Math.round(player.chargeRatio * 100)}%`;
      } else {
        this.chargeMeterEl.classList.add('hidden');
      }
    }

    // 7. World-Space Floating Enemy Bars
    const activeIds = new Set<string>();
    for (const lbl of labels) {
      activeIds.add(lbl.id);
      let el = this.labelPool.get(lbl.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'world-label';
        el.innerHTML = `
          <div class="world-label-ai hidden"></div>
          <div class="world-label-name"></div>
          <div class="world-label-hp"><div class="world-label-hp-fill"></div></div>
        `;
        this.worldLabelsLayerEl.appendChild(el);
        this.labelPool.set(lbl.id, el);
      }

      if (!lbl.visible) {
        el.classList.add('hidden');
        continue;
      }
      el.classList.remove('hidden');
      el.style.left = `${lbl.screenX}px`;
      el.style.top = `${lbl.screenY}px`;

      (el.children[1] as HTMLElement).textContent = this.fighterName(match, lbl.name);
      const fill = el.children[2].firstElementChild as HTMLElement;
      fill.style.width = `${Math.max(0, Math.round((lbl.hp / lbl.maxHp) * 100))}%`;

      const aiEl = el.children[0] as HTMLElement;
      if (lbl.aiStateLabel) {
        aiEl.classList.remove('hidden');
        aiEl.textContent = lbl.aiStateLabel;
      } else {
        aiEl.classList.add('hidden');
      }
    }

    for (const [id, el] of this.labelPool.entries()) {
      if (!activeIds.has(id)) {
        el.remove();
        this.labelPool.delete(id);
      }
    }
  }

  private renderResults(
    match: MatchManager,
    isHost: boolean,
    rewards?: { coins: number; breakdown: { place: number }; place: number } | null
  ): void {
    const standings = match.getStandings();
    const winner = standings[0];
    const playerWon = Boolean(winner && winner.isHuman);

    const headline = this.q('#res-headline');
    const sub = this.q('#res-sub');
    const badge = this.q('#res-badge');

    const placeLabel =
      rewards?.place === 1
        ? this.tl('resultsPlace1')
        : rewards?.place === 2
          ? this.tl('resultsPlace2')
          : rewards?.place === 3
            ? this.tl('resultsPlace3')
            : this.tl('resultsPlaceOther');
    const timeUpText = this.tl('resultsTimeUp');
    const durationText = this.tl('resultsDuration', {
      secs: Math.round(match.matchElapsed),
    });
    const activeRoomText =
      match.isOnlineMatch && this.mpStatus === 'connected'
        ? this.tl('resultsActiveRoom')
        : '';
    // Inject coin payout row into results sub-text based on place
    if (rewards && rewards.coins > 0) {
      sub.textContent =
        this.tl('resultsCoinsRow', { coins: rewards.coins, place: placeLabel }) +
        (match.finishReason === 'time_up'
          ? timeUpText
          : durationText + activeRoomText);
    } else {
      sub.textContent =
        match.finishReason === 'time_up' ? timeUpText : durationText + activeRoomText;
    }

    if (playerWon) {
      badge.textContent = this.tl('lastSurvivor');
      headline.textContent = this.tl('resVictory');
      headline.classList.add('victory-gold');
    } else {
      badge.textContent = this.tl('matchFinished');
      headline.textContent = winner
        ? this.tl('resWinner', { name: this.fighterName(match, winner.name) })
        : this.tl('resDraw');
      headline.classList.remove('victory-gold');
    }

    if (match.isOnlineMatch && this.mpRoom) {
      this.resMenuBtnEl.textContent = this.tl('mpLeave');
      if (isHost) {
        this.resClassBtnEl.classList.remove('hidden');
        this.resClassBtnEl.textContent = this.tl('roomReturn');
        this.resAgainBtnEl.innerHTML = `${ICONS.play}<span>${this.tl('newRound')}</span>`;
      } else {
        this.resClassBtnEl.classList.add('hidden');
        this.resAgainBtnEl.innerHTML = `<span>${this.tl('rematchReady')}</span>`;
      }
    } else {
      this.resMenuBtnEl.textContent = this.tl('backMenu');
      this.resClassBtnEl.classList.remove('hidden');
      this.resClassBtnEl.textContent = this.tl('changeHero');
      this.resAgainBtnEl.innerHTML = `${ICONS.play}<span>${this.tl('playAgain')}</span>`;
    }

    const tbody = this.q('#res-tbody');
    tbody.innerHTML = standings
      .map((s) => {
        const clsName = classDisplayName(s.classId, this.settings.language);
        const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[s.classId]);
        const rowCls = `${s.place === 1 ? 'winner-row' : ''} ${
          s.isHuman ? 'human-row' : ''
        }`;
        const placeBadge = `#${s.place}`;
        const statusPill = s.isAlive
          ? `<span class="res-status alive">${this.tl('aliveHp', { hp: s.hp })}</span>`
          : `<span class="res-status fallen">${this.tl('eliminated')}</span>`;
        return `
          <tr class="${rowCls}">
            <td class="res-place">${placeBadge}</td>
            <td class="res-fighter">${escapeHtml(this.fighterName(match, s.name))}</td>
            <td>
              <span class="res-class-cell">
                <img src="${iconUrl}" alt="" class="res-class-icon" draggable="false" />
                <span>${clsName}</span>
              </span>
            </td>
            <td>${statusPill}</td>
            <td class="res-num">${s.kills}</td>
            <td class="res-num">${s.damageDealt}</td>
          </tr>
        `;
      })
      .join('');
  }

  /** Rewarded advertising is always optional and requires an explicit click. */
  private showAd(): void {
    this.adModalEl.classList.remove('hidden');
    this.adRewardBtnEl.disabled = false;
    this.adCloseBtnEl.disabled = false;
    this.q('#ad-status').textContent = '';
  }

  private hideAd(): void {
    if (!this.adCloseBtnEl.disabled) this.adModalEl.classList.add('hidden');
  }

  private claimAdReward(): void {
    if (this.adRewardBtnEl.disabled) return;
    this.adRewardBtnEl.disabled = true;
    this.adCloseBtnEl.disabled = true;
    this.q('#ad-status').textContent = '';
    const started = this.callbacks.onWatchRewardedAd?.(
      () => this.grantAdCoins(),
      (rewarded) => {
        this.adRewardBtnEl.disabled = false;
        this.adCloseBtnEl.disabled = false;
        if (rewarded) this.hideAd();
        else this.q('#ad-status').textContent = this.tl('adUnavailable');
      }
    );
    if (!started) {
      this.adRewardBtnEl.disabled = false;
      this.adCloseBtnEl.disabled = false;
      this.q('#ad-status').textContent = this.tl('adUnavailable');
    }
  }

  private grantAdCoins(): void {
    this.profile = addCoins(this.profile, AD_COIN_REWARD);
    saveProfile(this.profile);
    this.hubCoinDisplayEl.textContent = String(this.profile.coins);
    this.q('#hub-main-coin-display').textContent = String(this.profile.coins);
  }

  private fighterName(match: MatchManager, name: string): string {
    const fighter = match.fighters.find((f) => f.displayName === name);
    if (!fighter) return name;
    if (!match.isOnlineMatch && fighter.id === match.localPlayerId && name === 'Вы (Рыцарь)') return this.tl('you');
    return fighter.isHuman && !fighter.id.startsWith('bot_') ? name : botDisplayName(name, this.settings.language);
  }

  private translateNetworkMessage(message: string): string {
    if (this.settings.language === 'ru') return message;
    const exact: Record<string, string> = {
      'Бой в этой комнате уже начался. Дождитесь завершения раунда.': 'netMatchStarted',
      'Только глава комнаты может начать поединок.': 'netHostOnly',
      'Нужно минимум 2 игрока (или включите «Дополнить ботами до 5»).': 'netNeedPlayers',
      'Сессия истекла. Нажмите «Обновить» для переподключения.': 'netExpired',
      'Сервер хостинга временно перегружен. Попробуйте через пару секунд.': 'netBusy',
      'Потеряна связь с сервером арены.': 'netLost',
      'Соединение с сервером прервано.': 'netDisconnected',
    };
    if (exact[message]) return this.tl(exact[message]);
    const missing = message.match(/^Комната «(.+)» не найдена\.$/);
    if (missing) return this.tl('netRoomMissing', { code: missing[1] });
    const full = message.match(/^Комната заполнена \(([^)]+)\)\.$/);
    if (full) return this.tl('netRoomFull', { count: full[1] });
    if (message.startsWith('Не удалось подключиться к серверу арены')) return this.tl('netCannotConnect');
    if (/ошибка сети|сервер вернул HTML|не найден api\/mp\.php|HTTP \d+ от api\/mp\.php/i.test(message)) return this.tl('netError');
    return message;
  }

  private applyTranslations(): void {
    this.root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      if (key) el.textContent = this.tl(key);
    });
    this.root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (key) el.placeholder = this.tl(key);
    });
    this.root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
      const key = el.dataset.i18nTitle;
      if (key) el.title = this.tl(key);
    });
  }

  /** Translate a key using current settings language. */
  private tl(key: string, params?: Record<string, string | number>): string {
    return t(key, this.settings.language, params);
  }

  private q(selector: string): HTMLElement {
    const el = this.root.querySelector(selector);
    if (!el) throw new Error(`Missing UI element: ${selector}`);
    return el as HTMLElement;
  }
}
