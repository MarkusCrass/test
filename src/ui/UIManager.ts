import {
  CLASS_ORDER,
  KNIGHT_CLASSES,
  KnightClassId,
} from '../config/classes';
import { GameSettings, GraphicsQuality } from '../config/settings';
import { Fighter, FighterState } from '../core/Fighter';
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

export interface UICallbacks {
  onOpenSelection: () => void;
  onOpenMultiplayer: () => void;
  onStartMatch: (classId: KnightClassId, mode: MatchMode) => void;
  onRestartMatch: () => void;
  onReturnMainMenu: () => void;
  onResumeGame: () => void;
  onCycleSpectator: (delta: 1 | -1) => void;
  onSettingsChanged: (next: GameSettings) => void;
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

const STATE_LABELS_RU: Record<FighterState, string> = {
  Idle: 'Готовность',
  Moving: 'Движение',
  Attacking: 'Лёгкая атака',
  HeavyAttacking: 'Тяжёлый удар!',
  Blocking: 'Защита / Блок',
  Dodging: 'Уклонение',
  HitReaction: 'Урон!',
  Stunned: 'ОГЛУШЁН!',
  Dead: 'Пал в бою',
};

const CLASS_EMBLEM_ICON: Record<KnightClassId, string> = {
  sword: 'sword_light.svg',
  dual: 'dual_light.svg',
  spear: 'spear_light.svg',
  hammer: 'hammer_light.svg',
};

const CORNER_STUDS_HTML = `
  <span class="corner-orn tl" aria-hidden="true"></span>
  <span class="corner-orn tr" aria-hidden="true"></span>
  <span class="corner-orn bl" aria-hidden="true"></span>
  <span class="corner-orn br" aria-hidden="true"></span>
`;

const ORNAMENT_DIVIDER_HTML = `
  <div class="ornament-divider" aria-hidden="true">
    <span class="ornament-line"></span>
    <span class="ornament-gem">❖</span>
    <span class="ornament-line"></span>
  </div>
`;

const CREST_SHIELD_SVG = `
  <svg class="window-crest-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="crestGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff4c2"/>
        <stop offset="50%" stop-color="#e5b24c"/>
        <stop offset="100%" stop-color="#8f5e14"/>
      </linearGradient>
      <linearGradient id="crestCrimson" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8f1d28"/>
        <stop offset="100%" stop-color="#2e090f"/>
      </linearGradient>
    </defs>
    <path d="M12 12L52 52M52 12L12 52" stroke="url(#crestGold)" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M18 14L23 8L32 14L41 8L46 14H18Z" fill="url(#crestGold)"/>
    <path d="M16 17H48V33C48 45 32 54 32 54C32 54 16 45 16 33V17Z" fill="url(#crestCrimson)" stroke="url(#crestGold)" stroke-width="2.6"/>
    <path d="M32 22V46M23 31H41" stroke="url(#crestGold)" stroke-width="2.4" stroke-linecap="round"/>
  </svg>
`;

const CREST_SWORDS_SVG = `
  <svg class="window-crest-svg sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M14 50L50 14M42 14H50V22M14 14L50 50M22 14H14V22" stroke="#f0c362" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="32" cy="32" r="9" fill="#251a12" stroke="#f0c362" stroke-width="2.4"/>
    <circle cx="32" cy="32" r="3.5" fill="#ffe8a3"/>
  </svg>
`;

const CREST_NETWORK_SVG = `
  <svg class="window-crest-svg sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="32" r="20" fill="#172430" stroke="#f0c362" stroke-width="2.4"/>
    <ellipse cx="32" cy="32" rx="10" ry="20" stroke="#7dd3fc" stroke-width="1.8"/>
    <path d="M13 26H51M13 38H51" stroke="#7dd3fc" stroke-width="1.6"/>
    <path d="M22 12L27 7L32 12L37 7L42 12" stroke="#ffe8a3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const CREST_GEAR_SVG = `
  <svg class="window-crest-svg sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="32" cy="32" r="19" stroke="#e5b24c" stroke-width="2.4" stroke-dasharray="6 4"/>
    <polygon points="32,12 37,25 51,25 40,34 44,48 32,39 20,48 24,34 13,25 27,25" fill="#362512" stroke="#f3c969" stroke-width="2"/>
    <circle cx="32" cy="32" r="5" fill="#ffe9a8"/>
  </svg>
`;

const CREST_TROPHY_SVG = `
  <svg class="window-crest-svg sm" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16 18H48V28C48 37 41 43 32 43C23 43 16 37 16 28V18Z" fill="#472f10" stroke="#f5cb6c" stroke-width="2.6"/>
    <path d="M16 21H10C10 29 14 33 18 33M48 21H54C54 29 50 33 46 33" stroke="#f5cb6c" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M32 43V51M22 52H42" stroke="#f5cb6c" stroke-width="3" stroke-linecap="round"/>
    <path d="M24 13L28 8L32 13L36 8L40 13" stroke="#ffeaa6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadSavedPlayerName(): string {
  try {
    const saved = localStorage.getItem(MP_NAME_STORAGE_KEY);
    if (saved && saved.trim().length >= 2) {
      return saved.trim().slice(0, 18);
    }
  } catch {
    // Ignore storage block
  }
  return `Сэр Артур`;
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
 * Manages all UI screens, royal medieval windows, class selection showcase stats,
 * online multiplayer lobby & 5-slot waiting room, bottom square skill hotbar with
 * hover tooltips, compact combat HUD, spectator controls, pause/settings modals,
 * and match results table.
 */
export class UIManager {
  private readonly root: HTMLElement;
  private readonly callbacks: UICallbacks;
  private settings: GameSettings;

  // Screen containers
  private readonly mainMenuEl: HTMLElement;
  private readonly selectionEl: HTMLElement;
  private readonly selectionSkillBarEl: HTMLElement;
  private readonly multiplayerEl: HTMLElement;
  private readonly hudEl: HTMLElement;
  private readonly pauseModalEl: HTMLElement;
  private readonly settingsModalEl: HTMLElement;
  private readonly resultsModalEl: HTMLElement;

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

  // Multiplayer UI state
  private mpStatus: NetConnectionStatus = 'disconnected';
  private mpPingMs = 0;
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

    const initialName = escapeHtml(loadSavedPlayerName());

    this.root.innerHTML = `
      <!-- MAIN MENU -->
      <div id="screen-main-menu" class="screen-overlay menu-vignette">
        <div class="stone-panel royal-window main-menu-card pointer-auto">
          ${CORNER_STUDS_HTML}
          <div class="crest-wrap">${CREST_SHIELD_SVG}</div>
          <div class="title-badge">⚔ Средневековая арена на выживание ⚔</div>
          <h1 class="game-title">KNIGHTS:<br/><span>LAST STANDING</span></h1>
          ${ORNAMENT_DIVIDER_HTML}
          <p class="game-subtitle">
            Пять рыцарей выходят во двор древней цитадели. Четыре ордена клинка и стали. На ногах останется только один.
          </p>
          <div class="menu-actions">
            <button id="btn-menu-multiplayer" class="btn btn-online btn-hero">
              <span class="btn-emblem">🌐</span>
              <span>Сетевая игра · Мультиплеер</span>
            </button>
            <button id="btn-menu-select" class="btn btn-primary">
              <span class="btn-emblem">⚔</span>
              <span>Одиночный бой · Выбор рыцаря</span>
            </button>
            <button id="btn-menu-quick" class="btn btn-gold">
              <span class="btn-emblem">♛</span>
              <span>Быстрый бой с ботами (5 бойцов)</span>
            </button>
            <div class="menu-secondary-row">
              <button id="btn-menu-duel" class="btn">
                <span class="btn-emblem">🛡</span>
                <span>Дуэль 1 на 1</span>
              </button>
              <button id="btn-menu-settings" class="btn">
                <span class="btn-emblem">⚙</span>
                <span>Настройки</span>
              </button>
            </div>
          </div>
          <div class="controls-box">
            <div class="controls-box-title">Боевое управление</div>
            <div class="controls-grid">
              <div><span class="key-chip">WASD</span> Движение</div>
              <div><span class="key-chip">Мышь</span> Камера 360°</div>
              <div><span class="key-chip">ЛКМ</span> Серия ударов</div>
              <div><span class="key-chip">Удерж. ЛКМ</span> Силовой удар</div>
              <div><span class="key-chip">ПКМ</span> Блок / Парир.</div>
              <div><span class="key-chip">1 / 2</span> Скиллы ордена</div>
              <div><span class="key-chip">Space</span> Прыжок · <span class="key-chip">Alt</span> Рывок</div>
              <div><span class="key-chip">Tab</span> Курсор · <span class="key-chip">Esc</span> Пауза</div>
            </div>
          </div>
        </div>
      </div>

      <!-- CHARACTER SELECTION (SINGLEPLAYER) -->
      <div id="screen-selection" class="selection-layout hidden">
        <div class="stone-panel royal-window selection-panel pointer-auto">
          ${CORNER_STUDS_HTML}
          <div>
            <div class="selection-header-top">
              <div class="title-badge">Оружейная цитадели</div>
              <h2 class="window-heading">Выбор класса рыцаря</h2>
            </div>
            ${ORNAMENT_DIVIDER_HTML}
            <div id="class-tabs" class="class-tabs"></div>
            <div id="class-details"></div>
          </div>
          <div class="selection-footer">
            <div class="section-kicker">Режим схватки</div>
            <div class="mode-toggle-row">
              <button id="mode-ffa5" class="mode-btn active">♛ 5 бойцов · Все против всех</button>
              <button id="mode-duel" class="mode-btn">⚔ Дуэль 1 на 1 · Тренировка</button>
            </div>
            <div class="selection-cta-row">
              <button id="btn-sel-back" class="btn" style="flex: 0 0 auto;">◀ В меню</button>
              <button id="btn-sel-start" class="btn btn-primary" style="flex: 1;">
                <span class="btn-emblem">⚔</span>
                <span>Выйти на арену!</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Bottom Showcase Skill Squares with Hover Tooltips -->
        <div class="selection-showcase-dock royal-subframe pointer-auto">
          ${CORNER_STUDS_HTML}
          <div id="selection-skill-bar" class="skill-squares-row"></div>
          <div class="skill-dock-caption">
            ❖ Наведите курсор на иконку приёма для подробного описания ❖
          </div>
        </div>
      </div>

      <!-- ONLINE MULTIPLAYER LOBBY & 5-PLAYER WAITING ROOM -->
      <div id="screen-multiplayer" class="screen-overlay menu-vignette hidden">
        <div class="stone-panel royal-window mp-window-card pointer-auto">
          ${CORNER_STUDS_HTML}
          <div class="mp-header-row">
            <div class="mp-header-left">
              <div class="crest-wrap mp-crest">${CREST_NETWORK_SVG}</div>
              <div>
                <div class="title-badge">⚔ Королевская сеть цитадели ⚔</div>
                <h2 class="window-heading mp-heading">Сетевая арена · до 5 рыцарей</h2>
              </div>
            </div>
            <div id="mp-conn-pill" class="mp-conn-pill connecting">◌ Подключение...</div>
          </div>

          <div id="mp-alert-banner" class="mp-alert-banner hidden"></div>

          ${ORNAMENT_DIVIDER_HTML}

          <!-- VIEW 1: ROOM BROWSER & MATCHMAKING -->
          <div id="mp-browser-view" class="mp-browser-view">
            <div class="mp-profile-bar">
              <div class="mp-name-field">
                <label for="mp-name-input" class="section-kicker">Имя вашего рыцаря</label>
                <input
                  id="mp-name-input"
                  type="text"
                  maxlength="18"
                  value="${initialName}"
                  placeholder="Введите имя..."
                  class="mp-text-input"
                />
              </div>
              <div class="mp-class-picker-wrap">
                <div class="section-kicker">Ваш орден для боя</div>
                <div id="mp-class-tabs" class="mp-mini-class-tabs"></div>
              </div>
            </div>

            <div class="mp-columns">
              <!-- Left column: Quick Join / Create / Code Join -->
              <div class="mp-col-actions">
                <button id="btn-mp-quick" class="btn btn-online btn-hero">
                  <span class="btn-emblem">⚡</span>
                  <span>Быстрый поиск боя</span>
                </button>

                <div class="mp-card-box">
                  <div class="mp-box-title">♛ Создать свою комнату</div>
                  <label for="mp-opt-bots" class="mp-check-line">
                    <input id="mp-opt-bots" type="checkbox" class="royal-checkbox" checked />
                    <span>🤖 Дополнить ботами ИИ до 5 бойцов</span>
                  </label>
                  <label for="mp-opt-public" class="mp-check-line">
                    <input id="mp-opt-public" type="checkbox" class="royal-checkbox" checked />
                    <span>🌐 Показывать комнату в общем списке</span>
                  </label>
                  <button id="btn-mp-create" class="btn btn-gold" style="width: 100%; margin-top: 6px;">
                    <span class="btn-emblem">🏰</span>
                    <span>Создать комнату</span>
                  </button>
                </div>

                <div class="mp-card-box">
                  <div class="mp-box-title">🔑 Вход по коду комнаты</div>
                  <div class="mp-code-join-row">
                    <input
                      id="mp-code-input"
                      type="text"
                      maxlength="6"
                      placeholder="КОД"
                      class="mp-text-input mp-code-field"
                    />
                    <button id="btn-mp-join-code" class="btn btn-primary">Войти</button>
                  </div>
                </div>
              </div>

              <!-- Right column: Live Public Rooms List -->
              <div class="mp-col-rooms">
                <div class="mp-rooms-head">
                  <span class="mp-box-title">🌐 Открытые залы арены</span>
                  <button id="btn-mp-refresh" class="btn btn-sm">↻ Обновить</button>
                </div>
                <div id="mp-rooms-list" class="mp-rooms-list"></div>
              </div>
            </div>

            <div class="mp-footer-bar">
              <button id="btn-mp-back" class="btn">◀ Главное меню</button>
              <span class="mp-footer-note">До 5 живых игроков в одной битве · Серверная физика 60 Гц</span>
            </div>
          </div>

          <!-- VIEW 2: 5-SLOT WAITING ROOM -->
          <div id="mp-room-view" class="mp-room-view hidden">
            <div class="mp-room-top-bar">
              <div class="mp-room-code-plaque">
                <span class="mp-code-kicker">КОД ЗАЛА:</span>
                <strong id="mp-room-code-text" class="mp-code-big">----</strong>
                <button id="btn-mp-copy-code" class="btn btn-sm">📋 Копировать</button>
              </div>

              <div class="mp-room-toggles">
                <label for="mp-room-bots-toggle" class="mp-check-line compact">
                  <input id="mp-room-bots-toggle" type="checkbox" class="royal-checkbox" checked />
                  <span>🤖 Боты до 5</span>
                </label>
                <label for="mp-room-public-toggle" class="mp-check-line compact">
                  <input id="mp-room-public-toggle" type="checkbox" class="royal-checkbox" checked />
                  <span>🌐 Публичная</span>
                </label>
              </div>
            </div>

            <div class="mp-room-class-strip">
              <span class="section-kicker" style="margin: 0;">Сменить орден перед боем:</span>
              <div id="mp-room-class-tabs" class="mp-mini-class-tabs"></div>
            </div>

            <div id="mp-slots-grid" class="mp-slots-grid"></div>

            <div class="mp-footer-bar">
              <button id="btn-mp-leave" class="btn">◀ Покинуть зал</button>
              <div class="mp-room-cta-right">
                <button id="btn-mp-ready" class="btn btn-gold">✓ Готов к бою</button>
                <button id="btn-mp-start" class="btn btn-primary">
                  <span class="btn-emblem">⚔</span>
                  <span>Начать битву!</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- IN-GAME HUD -->
      <div id="screen-hud" class="hud-layer hidden">
        <div id="world-labels-layer"></div>

        <div class="stone-panel hud-top-bar">
          ${CORNER_STUDS_HTML}
          <div class="hud-clock-group">
            <span class="hud-clock-icon" aria-hidden="true">⏳</span>
            <div id="hud-timer" class="hud-timer">03:10</div>
          </div>
          <span class="hud-top-divider" aria-hidden="true"></span>
          <div id="hud-alive-pill" class="hud-alive-pill">⚔ ЖИВЫХ: 5 / 5</div>
          <span id="hud-net-sep" class="hud-top-divider hidden" aria-hidden="true"></span>
          <div id="hud-net-pill" class="hud-net-pill hidden">🌐 ОНЛАЙН</div>
        </div>

        <div id="hud-pointer-prompt" class="pointer-prompt hidden">
          ⚔ Кликните по арене для боя · Наведите мышь на скиллы снизу для описания
        </div>

        <div id="hud-countdown" class="countdown-banner hidden">3</div>

        <div class="stone-panel hud-roster">
          <div class="roster-title"><span>⚔</span> Летопись арены</div>
          <div id="hud-roster-list" class="roster-list-inner"></div>
        </div>

        <div id="hud-kill-feed" class="kill-feed"></div>

        <div class="hud-reticle">
          <div class="reticle-dot"></div>
          <div id="hud-charge-meter" class="charge-meter hidden">
            <div id="hud-charge-fill" class="charge-meter-fill" style="width: 0%"></div>
          </div>
        </div>

        <!-- Bottom-Left Vitals (HP, Stamina & Active Buff) -->
        <div id="hud-vitals-box" class="stone-panel hud-vitals">
          ${CORNER_STUDS_HTML}
          <div class="vitals-header">
            <div class="vitals-identity">
              <img id="hud-player-class-icon" class="vitals-class-emblem" src="${getSkillIconUrl(
                'sword_light.svg'
              )}" alt="" draggable="false" />
              <span id="hud-player-class">Рыцарь</span>
            </div>
            <span id="hud-player-state" class="state-pill">Готовность</span>
          </div>
          <div class="bar-container hp-bar-frame">
            <div id="hud-hp-fill" class="hp-fill" style="width: 100%"></div>
            <div id="hud-hp-text" class="bar-text">ЗДОРОВЬЕ: 100 / 100</div>
          </div>
          <div class="bar-container stam-bar-frame">
            <div id="hud-stam-fill" class="stamina-fill" style="width: 100%"></div>
            <div id="hud-stam-text" class="bar-text">ВЫНОСЛИВОСТЬ: 100</div>
          </div>
          <div id="hud-active-buff" class="hud-buff-pill hidden"></div>
        </div>

        <!-- Bottom-Center Square Skill Bar with Hover Descriptions -->
        <div id="hud-actionbar" class="hud-actionbar pointer-auto">
          ${CORNER_STUDS_HTML}
          <div id="hud-actionbar-slots" class="skill-squares-row"></div>
          <div id="hud-actionbar-hint" class="hud-actionbar-hint">
            Наведите курсор на иконку для описания · [Tab] показать курсор в бою
          </div>
        </div>

        <!-- SPECTATOR DEATH OVERLAY -->
        <div id="hud-spectator-bar" class="stone-panel royal-window spectator-bar pointer-auto hidden">
          ${CORNER_STUDS_HTML}
          <div class="spectator-title">☠ ВЫ ПАЛИ В БОЮ — РЕЖИМ НАБЛЮДЕНИЯ ☠</div>
          <div id="spectator-sub" class="spectator-sub">Наблюдение за оставшимися рыцарями...</div>
          <div class="spectator-actions">
            <button id="btn-spec-prev" class="btn btn-sm">◀ Пред. боец (Q)</button>
            <button id="btn-spec-next" class="btn btn-sm">След. боец (E) ▶</button>
            <button id="btn-spec-restart" class="btn btn-primary btn-sm">⚔ Снова в бой</button>
            <button id="btn-spec-menu" class="btn btn-sm">В меню</button>
          </div>
        </div>
      </div>

      <!-- PAUSE MODAL -->
      <div id="modal-pause" class="modal-backdrop hidden">
        <div class="stone-panel royal-window settings-card pause-card">
          ${CORNER_STUDS_HTML}
          <div class="crest-wrap">${CREST_SWORDS_SVG}</div>
          <div class="title-badge">Передышка в бою</div>
          <h2 class="window-heading">Бой приостановлен</h2>
          ${ORNAMENT_DIVIDER_HTML}
          <div class="menu-actions" style="margin-bottom: 0;">
            <button id="btn-pause-resume" class="btn btn-primary">
              <span class="btn-emblem">⚔</span>
              <span>Продолжить схватку</span>
            </button>
            <button id="btn-pause-restart" class="btn btn-gold">
              <span class="btn-emblem">↻</span>
              <span>Начать заново</span>
            </button>
            <button id="btn-pause-settings" class="btn">
              <span class="btn-emblem">⚙</span>
              <span>Настройки</span>
            </button>
            <button id="btn-pause-menu" class="btn">
              <span class="btn-emblem">🏛</span>
              <span>Главное меню</span>
            </button>
          </div>
        </div>
      </div>

      <!-- RESULTS MODAL -->
      <div id="modal-results" class="modal-backdrop hidden">
        <div class="stone-panel royal-window results-card">
          ${CORNER_STUDS_HTML}
          <div class="results-header">
            <div class="crest-wrap">${CREST_TROPHY_SVG}</div>
            <div id="res-badge" class="title-badge">Итоги турнира</div>
            <h2 id="res-headline" class="window-heading results-headline">ПОБЕДА!</h2>
            <div id="res-sub" class="results-sub"></div>
          </div>
          ${ORNAMENT_DIVIDER_HTML}
          <div class="standings-scroll-wrap">
            <table class="standings-table">
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Рыцарь</th>
                  <th>Орден</th>
                  <th>Исход</th>
                  <th>Побед</th>
                  <th>Урон</th>
                </tr>
              </thead>
              <tbody id="res-tbody"></tbody>
            </table>
          </div>
          <div class="results-actions">
            <button id="btn-res-menu" class="btn">Главное меню</button>
            <button id="btn-res-class" class="btn btn-gold">Сменить рыцаря</button>
            <button id="btn-res-again" class="btn btn-primary">
              <span class="btn-emblem">⚔</span>
              <span>Сразиться снова!</span>
            </button>
          </div>
        </div>
      </div>

      <!-- SETTINGS MODAL -->
      <div id="modal-settings" class="modal-backdrop hidden">
        <div class="stone-panel royal-window settings-card">
          ${CORNER_STUDS_HTML}
          <div class="modal-header-center">
            <div class="crest-wrap">${CREST_GEAR_SVG}</div>
            <div class="title-badge">Параметры цитадели</div>
            <h2 class="window-heading">Настройки игры</h2>
          </div>
          ${ORNAMENT_DIVIDER_HTML}

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span>🔊 Громкость звука</span>
              <span id="lbl-vol" class="setting-val-pill">70%</span>
            </div>
            <input id="inp-vol" type="range" min="0" max="100" step="1" class="setting-slider" />
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span>🎯 Чувствительность мыши</span>
              <span id="lbl-sens" class="setting-val-pill">1.0x</span>
            </div>
            <input id="inp-sens" type="range" min="20" max="250" step="5" class="setting-slider" />
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span>✨ Качество графики</span>
              <span id="lbl-qual" class="setting-val-pill">Ультра</span>
            </div>
            <div class="mode-toggle-row" style="grid-template-columns: 1fr 1fr 1fr; margin-bottom: 0;">
              <button id="qual-ultra" class="mode-btn active">Ультра</button>
              <button id="qual-high" class="mode-btn">Высокое</button>
              <button id="qual-low" class="mode-btn">Быстрое</button>
            </div>
          </div>

          <div class="setting-group setting-plaque">
            <div class="setting-label">
              <span>🖼 Стиль рендера</span>
              <span id="lbl-pix" class="setting-val-pill">Чёткий HD 3D (1x)</span>
            </div>
            <input id="inp-pix" type="range" min="1" max="3" step="1" class="setting-slider" />
          </div>

          <label for="inp-debug" class="setting-plaque setting-check-row">
            <input id="inp-debug" type="checkbox" class="royal-checkbox" />
            <span>Показывать сектора ударов, хитбоксы и цели ИИ (F3)</span>
          </label>

          <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
            <button id="btn-settings-close" class="btn btn-primary" style="min-width: 150px;">Сохранить</button>
          </div>
        </div>
      </div>
    `;

    this.mainMenuEl = this.q('#screen-main-menu');
    this.selectionEl = this.q('#screen-selection');
    this.selectionSkillBarEl = this.q('#selection-skill-bar');
    this.multiplayerEl = this.q('#screen-multiplayer');
    this.hudEl = this.q('#screen-hud');
    this.pauseModalEl = this.q('#modal-pause');
    this.settingsModalEl = this.q('#modal-settings');
    this.resultsModalEl = this.q('#modal-results');

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
    this.renderSelectionClass('sword', false);
    this.renderMpClassButtons();
    this.updatePublicRooms([]);
    this.syncSettingsControls();
  }

  public updateSettingsExternal(next: GameSettings): void {
    this.settings = { ...next };
    this.syncSettingsControls();
  }

  public getEnteredPlayerName(): string {
    const val = this.mpNameInputEl.value.trim();
    const clean = val.length >= 2 ? val.slice(0, 18) : 'Сэр Артур';
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
        pingMs > 0 ? `● В СЕТИ · ${pingMs} мс` : `● В СЕТИ`;
    } else if (status === 'connecting') {
      this.mpConnPillEl.classList.add('connecting');
      this.mpConnPillEl.textContent = `◌ ПОДКЛЮЧЕНИЕ...`;
    } else {
      this.mpConnPillEl.classList.add('offline');
      this.mpConnPillEl.textContent = `✕ ОФФЛАЙН`;
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
    this.mpAlertEl.textContent = message;
    this.mpAlertEl.classList.remove('hidden', 'tone-error', 'tone-info');
    this.mpAlertEl.classList.add(
      tone === 'info' ? 'tone-info' : 'tone-error'
    );
    this.mpAlertTimer = setTimeout(() => {
      this.mpAlertEl.classList.add('hidden');
    }, 4500);
  }

  public updatePublicRooms(rooms: RoomSummary[]): void {
    if (rooms.length === 0) {
      this.mpRoomsListEl.innerHTML = `
        <div class="mp-empty-rooms">
          <div class="mp-empty-title">Открытых залов пока нет</div>
          <div class="mp-empty-sub">
            Нажмите «Быстрый поиск боя» или «Создать комнату» — другие игроки смогут сразу присоединиться к вам!
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
            ? `<span class="mp-room-badge open">Ожидание · ${r.playerCount}/${r.maxPlayers}</span>`
            : `<span class="mp-room-badge busy">Идёт бой · ${r.playerCount}/${r.maxPlayers}</span>`;
        const botTag = r.fillBots ? '🤖 +Боты до 5' : '⚔ Только игроки';
        return `
          <div class="mp-room-row">
            <div class="mp-room-row-info">
              <div class="mp-room-row-top">
                <span class="mp-room-code-chip">${escapeHtml(r.roomCode)}</span>
                <strong class="mp-room-host">Зал: ${escapeHtml(r.hostName)}</strong>
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
                  )}">Войти</button>`
                : `<span class="mp-room-locked">${
                    r.phase === 'in_match' ? 'В бою' : 'Полон'
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
      this.renderMpClassButtons();
    }

    const isHost = room.hostClientId === myClientId;
    this.mpRoomCodeTextEl.textContent = room.roomCode;
    this.mpRoomBotsToggleEl.checked = room.fillBots;
    this.mpRoomPublicToggleEl.checked = room.isPublic;
    this.mpRoomBotsToggleEl.disabled = !isHost;
    this.mpRoomPublicToggleEl.disabled = !isHost;

    // Render 5 Arena Fighter Slots
    const slotsHtml: string[] = [];
    for (let idx = 0; idx < MAX_PLAYERS_PER_ROOM; idx++) {
      const p = room.players[idx];
      if (p) {
        const clsCfg = KNIGHT_CLASSES[p.classId];
        const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[p.classId]);
        const isMe = p.clientId === myClientId;
        const readyPill = p.isHost
          ? `<span class="mp-slot-pill host">♛ ГЛАВА ЗАЛА</span>`
          : p.ready
          ? `<span class="mp-slot-pill ready">✓ ГОТОВ</span>`
          : `<span class="mp-slot-pill wait">◌ НЕ ГОТОВ</span>`;

        slotsHtml.push(`
          <div class="mp-slot-card occupied ${isMe ? 'me' : ''}">
            <img class="mp-slot-emblem" src="${iconUrl}" alt="" draggable="false" />
            <div class="mp-slot-body">
              <div class="mp-slot-name-row">
                <strong class="mp-slot-name">${escapeHtml(p.name)}${
          isMe ? ' (Вы)' : ''
        }</strong>
                <span class="mp-slot-ping">${p.pingMs} мс</span>
              </div>
              <div class="mp-slot-sub">${clsCfg.name} · ${clsCfg.maxHp} HP</div>
            </div>
            ${readyPill}
          </div>
        `);
      } else if (room.fillBots) {
        slotsHtml.push(`
          <div class="mp-slot-card bot-slot">
            <div class="mp-slot-bot-badge">🤖</div>
            <div class="mp-slot-body">
              <div class="mp-slot-name-row">
                <span class="mp-slot-name muted">Слот #${idx + 1} · Тактический бот ИИ</span>
              </div>
              <div class="mp-slot-sub">Заменится живым игроком при входе в зал</div>
            </div>
            <span class="mp-slot-pill bot">ИИ</span>
          </div>
        `);
      } else {
        slotsHtml.push(`
          <div class="mp-slot-card empty-slot">
            <div class="mp-slot-bot-badge">⚔</div>
            <div class="mp-slot-body">
              <div class="mp-slot-name-row">
                <span class="mp-slot-name muted">Слот #${idx + 1} · Ожидание рыцаря...</span>
              </div>
              <div class="mp-slot-sub">Отправьте код ${escapeHtml(
                room.roomCode
              )} другу для входа</div>
            </div>
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
      this.mpStartBtnEl.style.opacity = canStart ? '1' : '0.55';
    } else {
      this.mpStartBtnEl.classList.add('hidden');
      this.mpReadyBtnEl.classList.remove('hidden');
      const readyNow = me ? me.ready : true;
      this.mpReadyBtnEl.textContent = readyNow
        ? '✓ Вы готовы (Снять)'
        : 'Подтвердить готовность';
    }
  }

  public update(
    match: MatchManager,
    labels: ProjectedFighterLabel[],
    pointerLocked: boolean
  ): void {
    const st = match.state;

    if (st !== this.lastRenderedState || match.paused !== this.lastPaused) {
      this.lastRenderedState = st;
      this.lastPaused = match.paused;

      this.mainMenuEl.classList.toggle('hidden', st !== 'MainMenu');
      this.selectionEl.classList.toggle('hidden', st !== 'CharacterSelection');
      this.multiplayerEl.classList.toggle('hidden', st !== 'MultiplayerLobby');

      const inHud =
        st === 'Countdown' ||
        st === 'InProgress' ||
        st === 'PlayerEliminated';
      this.hudEl.classList.toggle('hidden', !inHud);

      this.pauseModalEl.classList.toggle('hidden', !match.paused);
      if (!match.paused && st !== 'MainMenu') {
        this.settingsModalEl.classList.add('hidden');
      }

      this.resultsModalEl.classList.toggle('hidden', st !== 'MatchFinished');

      // Online-aware Pause & Spectator button labels
      this.pauseRestartBtnEl.classList.toggle('hidden', match.isOnlineMatch);
      this.pauseMenuBtnEl.innerHTML = match.isOnlineMatch
        ? `<span class="btn-emblem">🚪</span><span>Покинуть сетевой бой</span>`
        : `<span class="btn-emblem">🏛</span><span>Главное меню</span>`;

      this.specRestartBtnEl.classList.toggle('hidden', match.isOnlineMatch);
      this.specMenuBtnEl.textContent = match.isOnlineMatch
        ? 'Покинуть комнату'
        : 'В меню';
    }

    if (st === 'MatchFinished') {
      const isHost = Boolean(
        this.mpRoom && this.mpRoom.hostClientId === this.mpMyClientId
      );
      const key = `${match.matchGeneration}_${match.isOnlineMatch}_${isHost}_${match.fighters.length}`;
      if (this.resultsRenderedKey !== key) {
        this.resultsRenderedKey = key;
        this.renderResults(match, isHost);
      }
      return;
    }

    if (
      st === 'Countdown' ||
      st === 'InProgress' ||
      st === 'PlayerEliminated'
    ) {
      this.updateActiveHud(match, labels, pointerLocked);
    }
  }

  private bindEvents(): void {
    // Main Menu
    this.q('#btn-menu-multiplayer').addEventListener('click', () => {
      this.callbacks.onOpenMultiplayer();
    });
    this.q('#btn-menu-select').addEventListener('click', () => {
      this.callbacks.onOpenSelection();
    });
    this.q('#btn-menu-quick').addEventListener('click', () => {
      this.selectedMode = 'ffa5';
      this.syncModeButtons();
      this.callbacks.onStartMatch(this.currentSelectedClass, 'ffa5');
    });
    this.q('#btn-menu-duel').addEventListener('click', () => {
      this.selectedMode = 'duel_debug';
      this.syncModeButtons();
      this.callbacks.onStartMatch(this.currentSelectedClass, 'duel_debug');
    });
    this.q('#btn-menu-settings').addEventListener('click', () => {
      this.settingsModalEl.classList.remove('hidden');
    });

    // Character Selection
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
        this.showMultiplayerNotice('Введите 4-буквенный код комнаты.', 'error');
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
      }
      this.showMultiplayerNotice(
        `Код комнаты «${code}» скопирован в буфер обмена!`,
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
    this.q('#btn-pause-settings').addEventListener('click', () => {
      this.settingsModalEl.classList.remove('hidden');
    });
    this.pauseMenuBtnEl.addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
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

    // Settings controls
    const volInp = this.q('#inp-vol') as HTMLInputElement;
    const sensInp = this.q('#inp-sens') as HTMLInputElement;
    const pixInp = this.q('#inp-pix') as HTMLInputElement;
    const dbgInp = this.q('#inp-debug') as HTMLInputElement;

    const pushSettings = (overrideQual?: GraphicsQuality) => {
      const pVal = Number(pixInp.value);
      const pixelScale: 1 | 2 | 3 = pVal === 2 ? 2 : pVal === 3 ? 3 : 1;
      this.settings = {
        masterVolume: Number(volInp.value) / 100,
        mouseSensitivity: Number(sensInp.value) / 100,
        pixelScale,
        debugHitboxes: dbgInp.checked,
        graphicsQuality: overrideQual ?? this.settings.graphicsQuality,
      };
      this.syncSettingsControls();
      this.callbacks.onSettingsChanged(this.settings);
    };

    volInp.addEventListener('input', () => pushSettings());
    sensInp.addEventListener('input', () => pushSettings());
    pixInp.addEventListener('input', () => pushSettings());
    dbgInp.addEventListener('change', () => pushSettings());

    this.q('#qual-ultra').addEventListener('click', () => pushSettings('ultra'));
    this.q('#qual-high').addEventListener('click', () => pushSettings('high'));
    this.q('#qual-low').addEventListener('click', () => pushSettings('low'));

    this.q('#btn-settings-close').addEventListener('click', () => {
      this.settingsModalEl.classList.add('hidden');
    });
  }

  private currentSelectedClass: KnightClassId = 'sword';

  private renderMpClassButtons(): void {
    const html = CLASS_ORDER.map((cid) => {
      const c = KNIGHT_CLASSES[cid];
      const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[cid]);
      return `
        <button class="mp-cls-btn ${
          cid === this.currentSelectedClass ? 'active' : ''
        }" data-cid="${cid}" title="${c.name} (${c.maxHp} HP)">
          <img src="${iconUrl}" alt="" draggable="false" />
          <span>${c.name}</span>
        </button>
      `;
    }).join('');

    this.mpClassTabsEl.innerHTML = html;
    this.mpRoomClassTabsEl.innerHTML = html;

    const bindContainer = (el: HTMLElement) => {
      el.querySelectorAll('.mp-cls-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = (btn as HTMLElement).dataset.cid as KnightClassId;
          this.currentSelectedClass = cid;
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
    const descriptors = buildClassSkillBar(classId);
    container.innerHTML = '';
    const refs: ActionBarSlotRefs[] = [];

    descriptors.forEach((slot, index) => {
      if (index === 3 || index === 5) {
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
          ? `<span>⏱ Откат: <strong>${slot.cooldownSec} сек</strong></span>`
          : `<span>⏱ <strong>Без перезарядки</strong></span>`;
      const stamMeta =
        slot.staminaCost > 0
          ? `<span>⚡ СТ: <strong>${slot.staminaCost}</strong></span>`
          : `<span>⚡ СТ: <strong>0</strong></span>`;
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
    this.callbacks.onSelectPreviewClass(classId, userInitiated);

    const tabsEl = this.q('#class-tabs');
    tabsEl.innerHTML = CLASS_ORDER.map((cid) => {
      const c = KNIGHT_CLASSES[cid];
      const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[cid]);
      return `
        <button class="class-tab ${cid === classId ? 'active' : ''}" data-cid="${cid}">
          <img class="class-tab-emblem" src="${iconUrl}" alt="" draggable="false" />
          <div class="class-tab-text">
            <div class="class-tab-code">${c.codeLabel} · ${c.role}</div>
            <div class="class-tab-name">${c.name}</div>
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

    const cfg = KNIGHT_CLASSES[classId];
    const detailsEl = this.q('#class-details');
    const bar = (val: number) => Math.min(100, Math.round((val / 5) * 100));

    detailsEl.innerHTML = `
      <div class="class-summary-box">
        ${cfg.summary}
      </div>
      <div class="stat-grid">
        <div class="stat-row">
          <span class="stat-lbl">♥ Здоровье</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill hp-tone" style="width:${bar(
            cfg.uiRatings.hp
          )}%"></div></div>
          <strong class="stat-num">${cfg.maxHp} HP</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl">⚡ Скорость</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.speed
          )}%"></div></div>
          <strong class="stat-num">${cfg.moveSpeed.toFixed(1)} м/с</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl">⚔ Сила атаки</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.attack
          )}%"></div></div>
          <strong class="stat-num">${cfg.lightCombo[0].damage}/${
      cfg.heavyAttack.damage
    }</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl">🛡 Защита</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.defense
          )}%"></div></div>
          <strong class="stat-num">${Math.round(
            cfg.defense.damageReduction * 100
          )}%</strong>
        </div>
        <div class="stat-row">
          <span class="stat-lbl">⌖ Дальность</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(
            cfg.uiRatings.reach
          )}%"></div></div>
          <strong class="stat-num">${cfg.heavyAttack.range.toFixed(1)} м</strong>
        </div>
      </div>
      <div class="section-kicker gold">Активные способности ордена [1] и [2]</div>
      <div class="sel-abilities-grid">
        ${cfg.abilities
          .map(
            (ab) => `
          <div class="sel-ability-card">
            <img class="sel-ability-icon-img" src="${getSkillIconUrl(
              `${ab.id}.svg`
            )}" alt="${ab.name}" draggable="false" />
            <div class="sel-ability-body">
              <div class="sel-ability-head">
                <span class="sel-ability-key">[${ab.slot}]</span>
                <span class="sel-ability-name">${ab.name}</span>
                <span class="sel-ability-meta">${ab.cooldown}с · ${
              ab.staminaCost
            } СТ</span>
              </div>
              <div class="sel-ability-desc">${ab.description}</div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    this.populateSkillSquares(this.selectionSkillBarEl, classId, false);
  }

  private syncModeButtons(): void {
    this.q('#mode-ffa5').classList.toggle(
      'active',
      this.selectedMode === 'ffa5'
    );
    this.q('#mode-duel').classList.toggle(
      'active',
      this.selectedMode === 'duel_debug'
    );
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
        ? 'Чёткий HD 3D (1x)'
        : this.settings.pixelScale === 2
        ? 'Ретро 3D с контуром (2x)'
        : 'Пиксель-арт 3D (3x)';

    const q = this.settings.graphicsQuality;
    this.q('#qual-ultra').classList.toggle('active', q === 'ultra');
    this.q('#qual-high').classList.toggle('active', q === 'high');
    this.q('#qual-low').classList.toggle('active', q === 'low');
    this.q('#lbl-qual').textContent =
      q === 'ultra'
        ? 'Ультра (HDR + Тени 2K)'
        : q === 'high'
        ? 'Высокое (HDR + Тени)'
        : 'Производительность';

    (this.q('#inp-debug') as HTMLInputElement).checked =
      this.settings.debugHitboxes;
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
      ? 'Удерживайте [Tab] — показать курсор для описания скиллов'
      : 'Наведите курсор на квадратик скилла — появится описание';

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
    pointerLocked: boolean
  ): void {
    // 1. Timer, Alive Pill & Online Room/Ping Pill
    const secs = Math.ceil(match.matchTimeRemaining);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.timerEl.textContent = match.isFinalPhase
      ? `ЯРОСТЬ АРЕНЫ · ${mm}:${ss}`
      : `${mm}:${ss}`;
    this.timerEl.classList.toggle('final-phase', match.isFinalPhase);

    const aliveCount = match.getLivingFighters().length;
    this.alivePillEl.textContent = `⚔ ЖИВЫХ: ${aliveCount} / ${match.fighters.length}`;

    if (match.isOnlineMatch) {
      this.netHudSepEl.classList.remove('hidden');
      this.netHudPillEl.classList.remove('hidden');
      const code = this.mpRoom ? this.mpRoom.roomCode : 'ОНЛАЙН';
      this.netHudPillEl.textContent =
        this.mpPingMs > 0
          ? `🌐 ЗАЛ ${code} · ${this.mpPingMs} мс`
          : `🌐 ЗАЛ ${code}`;
    } else {
      this.netHudSepEl.classList.add('hidden');
      this.netHudPillEl.classList.add('hidden');
    }

    // 2. Countdown Banner
    if (match.state === 'Countdown') {
      this.countdownBannerEl.classList.remove('hidden');
      const num = Math.ceil(match.countdownTimer);
      this.countdownBannerEl.textContent = num > 0 ? String(num) : 'В БОЙ!';
    } else {
      this.countdownBannerEl.classList.add('hidden');
    }

    // 3. Pointer Lock Prompt
    this.pointerPromptEl.classList.toggle(
      'hidden',
      pointerLocked || match.paused || match.state === 'PlayerEliminated'
    );

    // 4. Roster Top-Right
    this.rosterListEl.innerHTML = match.fighters
      .map((f) => {
        const isMe = f.id === match.localPlayerId;
        const pct = Math.max(0, Math.round((f.hp / f.maxHp) * 100));
        const badgePrefix = isMe ? '♛ ' : f.isHuman ? '👤 ' : '';
        return `
          <div class="roster-item cls-${f.classId} ${
          isMe ? 'human' : ''
        } ${f.isAlive ? '' : 'dead'}">
            <div class="roster-row-top">
              <span class="roster-name">${badgePrefix}${escapeHtml(
          f.displayName
        )}</span>
              <span class="roster-hp-tag">${
                f.isAlive ? `${Math.ceil(f.hp)} HP` : '☠ ПАЛ'
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
              kf.killerName
            )}</strong> <span class="kf-sword">⚔</span> поверг <strong>${escapeHtml(
              kf.victimName
            )}</strong></div>`
          : `<div class="kill-feed-item"><strong>${escapeHtml(
              kf.victimName
            )}</strong> пал на арене</div>`
      )
      .join('');

    // 6. Player Vitals + Bottom Square Skill Bar
    const player = match.getPlayer();
    const observed = match.getObservedFighter();

    if (match.state === 'PlayerEliminated') {
      this.vitalsBoxEl.classList.add('hidden');
      this.spectatorBarEl.classList.remove('hidden');
      this.spectatorSubEl.textContent = observed
        ? `Камера следует за: ${observed.displayName} (${KNIGHT_CLASSES[observed.classId].name}) — Осталось бойцов: ${aliveCount}`
        : 'Определение победителя...';
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

      this.playerClassLabelEl.textContent = KNIGHT_CLASSES[player.classId].name;
      this.playerStatePillEl.textContent = STATE_LABELS_RU[player.state];

      const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
      this.hpFillEl.style.width = `${hpPct}%`;
      this.hpTextEl.textContent = `ЗДОРОВЬЕ: ${Math.ceil(player.hp)} / ${player.maxHp}`;

      const stPct = Math.max(0, (player.stamina / player.maxStamina) * 100);
      this.stamFillEl.style.width = `${stPct}%`;
      this.stamTextEl.textContent = `ВЫНОСЛИВОСТЬ: ${Math.floor(
        player.stamina
      )} / ${player.maxStamina}`;

      if (player.damageAuraTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = `✨ ОБЕТ СТАЛИ: +25% УРОН (${player.damageAuraTimer.toFixed(1)}с)`;
      } else if (player.hasteTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = `💨 ШАГ ТЕНЕЙ: +25% СКОРОСТЬ (${player.hasteTimer.toFixed(1)}с)`;
      } else if (player.ironBastionTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = `🛡 ЖЕЛЕЗНЫЙ БАСТИОН: -35% УРОН (${player.ironBastionTimer.toFixed(1)}с)`;
      } else {
        this.activeBuffEl.classList.add('hidden');
      }

      this.updateActionBarForFighter(player, pointerLocked);

      if (player.isChargingHeavy) {
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

      (el.children[1] as HTMLElement).textContent = lbl.name;
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

  private renderResults(match: MatchManager, isHost: boolean): void {
    const standings = match.getStandings();
    const winner = standings[0];
    const playerWon = Boolean(winner && winner.isHuman);

    const headline = this.q('#res-headline');
    const sub = this.q('#res-sub');
    const badge = this.q('#res-badge');

    if (playerWon) {
      badge.textContent = '♛ Триумф в цитадели ♛';
      headline.textContent = 'ПОБЕДА! ВЫ — ПОСЛЕДНИЙ ВЫЖИВШИЙ!';
      headline.classList.add('victory-gold');
    } else {
      badge.textContent = '⚔ Турнир завершён ⚔';
      headline.textContent = winner
        ? `ПОБЕДИТЕЛЬ: ${winner.name.toUpperCase()}`
        : 'НИЧЬЯ НА АРЕНЕ';
      headline.classList.remove('victory-gold');
    }

    sub.textContent =
      match.finishReason === 'time_up'
        ? 'Время схватки истекло — чемпион определён по запасу здоровья и нанесённому урону.'
        : `Длительность битвы: ${Math.round(match.matchElapsed)} сек.${
            match.isOnlineMatch && this.mpStatus === 'connected'
              ? ' · Сетевой зал активен'
              : ''
          }`;

    if (match.isOnlineMatch && this.mpRoom) {
      this.resMenuBtnEl.textContent = 'Покинуть комнату';
      if (isHost) {
        this.resClassBtnEl.classList.remove('hidden');
        this.resClassBtnEl.textContent = 'В зал комнаты (смена класса)';
        this.resAgainBtnEl.innerHTML = `<span class="btn-emblem">⚔</span><span>Новый раунд (Реванш)!</span>`;
      } else {
        this.resClassBtnEl.classList.add('hidden');
        this.resAgainBtnEl.innerHTML = `<span class="btn-emblem">✓</span><span>Готов к реваншу (ждём главу)</span>`;
      }
    } else {
      this.resMenuBtnEl.textContent = 'Главное меню';
      this.resClassBtnEl.classList.remove('hidden');
      this.resClassBtnEl.textContent = 'Сменить рыцаря';
      this.resAgainBtnEl.innerHTML = `<span class="btn-emblem">⚔</span><span>Сразиться снова!</span>`;
    }

    const tbody = this.q('#res-tbody');
    tbody.innerHTML = standings
      .map((s) => {
        const clsName = KNIGHT_CLASSES[s.classId].name;
        const iconUrl = getSkillIconUrl(CLASS_EMBLEM_ICON[s.classId]);
        const rowCls = `${s.place === 1 ? 'winner-row' : ''} ${
          s.isHuman ? 'human-row' : ''
        }`;
        const placeBadge = s.place === 1 ? '♛ #1' : `#${s.place}`;
        const statusPill = s.isAlive
          ? `<span class="res-status alive">Жив · ${s.hp} HP</span>`
          : `<span class="res-status fallen">Пал в бою</span>`;
        return `
          <tr class="${rowCls}">
            <td class="res-place">${placeBadge}</td>
            <td class="res-fighter">${escapeHtml(s.name)}</td>
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

  private q(selector: string): HTMLElement {
    const el = this.root.querySelector(selector);
    if (!el) throw new Error(`Missing UI element: ${selector}`);
    return el as HTMLElement;
  }
}
