import {
  CLASS_ORDER,
  KNIGHT_CLASSES,
  KnightClassId,
} from '../config/classes';
import { GameSettings, GraphicsQuality } from '../config/settings';
import { Fighter, FighterState } from '../core/Fighter';
import { MatchManager, MatchMode, MatchState } from '../core/MatchManager';
import { ProjectedFighterLabel } from '../render/WorldRenderer';
import {
  buildClassSkillBar,
  getSkillIconUrl,
  SkillSlotDescriptor,
  SkillSlotKey,
} from './skillIcons';

export interface UICallbacks {
  onOpenSelection: () => void;
  onStartMatch: (classId: KnightClassId, mode: MatchMode) => void;
  onRestartMatch: () => void;
  onReturnMainMenu: () => void;
  onResumeGame: () => void;
  onCycleSpectator: (delta: 1 | -1) => void;
  onSettingsChanged: (next: GameSettings) => void;
  onSelectPreviewClass: (classId: KnightClassId) => void;
  onTriggerSkillSlot?: (slotKey: SkillSlotKey) => void;
}

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

interface ActionBarSlotRefs {
  descriptor: SkillSlotDescriptor;
  rootEl: HTMLElement;
  cdVeilEl: HTMLElement;
  cdNumEl: HTMLElement;
}

/**
 * Manages all UI screens, class selection showcase stats, bottom square skill hotbar
 * with hover tooltips, compact combat HUD, spectator controls, pause/settings modals,
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
  private readonly hudEl: HTMLElement;
  private readonly pauseModalEl: HTMLElement;
  private readonly settingsModalEl: HTMLElement;
  private readonly resultsModalEl: HTMLElement;

  // Dynamic HUD sub-elements
  private readonly timerEl: HTMLElement;
  private readonly alivePillEl: HTMLElement;
  private readonly rosterListEl: HTMLElement;
  private readonly killFeedEl: HTMLElement;
  private readonly vitalsBoxEl: HTMLElement;
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

  private readonly labelPool = new Map<string, HTMLElement>();
  private renderedActionBarClass: KnightClassId | null = null;
  private actionBarRefs: ActionBarSlotRefs[] = [];
  private lastRenderedState: MatchState | null = null;
  private lastPaused = false;
  private selectedMode: MatchMode = 'ffa5';
  private resultsRenderedGen = -1;

  constructor(
    root: HTMLElement,
    initialSettings: GameSettings,
    callbacks: UICallbacks
  ) {
    this.root = root;
    this.settings = { ...initialSettings };
    this.callbacks = callbacks;

    this.root.innerHTML = `
      <!-- MAIN MENU -->
      <div id="screen-main-menu" class="screen-overlay">
        <div class="stone-panel main-menu-card pointer-auto">
          <div class="title-badge">Third-Person Medieval Arena</div>
          <h1 class="game-title">KNIGHTS:<br/>LAST STANDING</h1>
          <p class="game-subtitle">
            Пять рыцарей на каменной арене. Четыре боевых стиля. Выживет только один.
          </p>
          <div class="menu-actions">
            <button id="btn-menu-select" class="btn btn-primary">Выбрать класс и в бой</button>
            <button id="btn-menu-quick" class="btn btn-gold">Быстрый бой (5 бойцов)</button>
            <button id="btn-menu-duel" class="btn">Тестовый режим (1 против 1 бота)</button>
            <button id="btn-menu-settings" class="btn">Настройки</button>
          </div>
          <div class="controls-box">
            <div><span class="key-chip">WASD</span> Движение</div>
            <div><span class="key-chip">Мышь</span> Обзор 360°</div>
            <div><span class="key-chip">ЛКМ</span> Лёгкий удар</div>
            <div><span class="key-chip">Удерж. ЛКМ</span> Тяжёлый удар</div>
            <div><span class="key-chip">ПКМ</span> Блок / Парирование</div>
            <div><span class="key-chip">1 / 2</span> Способности класса</div>
            <div><span class="key-chip">Space</span> Прыжок · <span class="key-chip">Alt / C</span> Рывок</div>
            <div><span class="key-chip">Tab</span> Курсор к скиллам · <span class="key-chip">Esc</span> Пауза</div>
          </div>
        </div>
      </div>

      <!-- CHARACTER SELECTION -->
      <div id="screen-selection" class="selection-layout hidden">
        <div class="stone-panel selection-panel pointer-auto">
          <div>
            <div class="title-badge">Подготовка к бою</div>
            <h2 style="margin: 2px 0 6px; font-size: 22px;">Выбор класса рыцаря</h2>
            <div id="class-tabs" class="class-tabs"></div>
            <div id="class-details"></div>
          </div>
          <div>
            <div style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">
              Режим схватки
            </div>
            <div class="mode-toggle-row">
              <button id="mode-ffa5" class="mode-btn active">5 бойцов (Все против всех)</button>
              <button id="mode-duel" class="mode-btn">Тест 1 на 1 (Отладка: 1 бот)</button>
            </div>
            <div style="display: flex; gap: 10px;">
              <button id="btn-sel-back" class="btn" style="flex: 0 0 auto;">Назад</button>
              <button id="btn-sel-start" class="btn btn-primary" style="flex: 1;">Начать битву!</button>
            </div>
          </div>
        </div>

        <!-- Bottom Showcase Skill Squares with Hover Tooltips -->
        <div class="selection-showcase-dock pointer-auto">
          <div id="selection-skill-bar" class="skill-squares-row"></div>
          <div class="skill-dock-caption">
            Наведите курсор на квадратик скилла для подробного описания
          </div>
        </div>
      </div>

      <!-- IN-GAME HUD -->
      <div id="screen-hud" class="hud-layer hidden">
        <div id="world-labels-layer"></div>

        <div class="stone-panel hud-top-bar">
          <div id="hud-timer" class="hud-timer">03:10</div>
          <div id="hud-alive-pill" class="hud-alive-pill">ЖИВЫХ: 5 / 5</div>
        </div>

        <div id="hud-pointer-prompt" class="pointer-prompt hidden">
          Кликните по арене для боя · Наведите мышь на скиллы снизу для описания
        </div>

        <div id="hud-countdown" class="countdown-banner hidden">3</div>

        <div class="stone-panel hud-roster">
          <div class="roster-title">Участники арены</div>
          <div id="hud-roster-list"></div>
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
          <div class="vitals-header">
            <span id="hud-player-class">Рыцарь</span>
            <span id="hud-player-state" class="state-pill">Готовность</span>
          </div>
          <div class="bar-container">
            <div id="hud-hp-fill" class="hp-fill" style="width: 100%"></div>
            <div id="hud-hp-text" class="bar-text">ЗДОРОВЬЕ: 100 / 100</div>
          </div>
          <div class="bar-container" style="height: 15px; margin-bottom: 4px;">
            <div id="hud-stam-fill" class="stamina-fill" style="width: 100%"></div>
            <div id="hud-stam-text" class="bar-text">ВЫНОСЛИВОСТЬ: 100</div>
          </div>
          <div id="hud-active-buff" class="hud-buff-pill hidden"></div>
        </div>

        <!-- Bottom-Center Square Skill Bar with Hover Descriptions -->
        <div id="hud-actionbar" class="hud-actionbar pointer-auto">
          <div id="hud-actionbar-slots" class="skill-squares-row"></div>
          <div id="hud-actionbar-hint" class="hud-actionbar-hint">
            Наведите курсор на иконку для описания · [Tab] показать курсор в бою
          </div>
        </div>

        <!-- SPECTATOR DEATH OVERLAY -->
        <div id="hud-spectator-bar" class="stone-panel spectator-bar pointer-auto hidden">
          <div class="spectator-title">ВЫ ПАЛИ В БОЮ — РЕЖИМ НАБЛЮДЕНИЯ</div>
          <div id="spectator-sub" class="spectator-sub">Наблюдение за оставшимися рыцарями...</div>
          <div class="spectator-actions">
            <button id="btn-spec-prev" class="btn btn-sm">◀ Пред. боец (Q)</button>
            <button id="btn-spec-next" class="btn btn-sm">След. боец (E) ▶</button>
            <button id="btn-spec-restart" class="btn btn-primary btn-sm">Перезапустить матч</button>
            <button id="btn-spec-menu" class="btn btn-sm">В меню</button>
          </div>
        </div>
      </div>

      <!-- PAUSE MODAL -->
      <div id="modal-pause" class="modal-backdrop hidden">
        <div class="stone-panel settings-card" style="text-align: center;">
          <div class="title-badge">Пауза</div>
          <h2 style="margin: 4px 0 18px;">Бой приостановлен</h2>
          <div class="menu-actions" style="margin-bottom: 0;">
            <button id="btn-pause-resume" class="btn btn-primary">Продолжить</button>
            <button id="btn-pause-restart" class="btn btn-gold">Начать заново</button>
            <button id="btn-pause-settings" class="btn">Настройки</button>
            <button id="btn-pause-menu" class="btn">Главное меню</button>
          </div>
        </div>
      </div>

      <!-- RESULTS MODAL -->
      <div id="modal-results" class="modal-backdrop hidden">
        <div class="stone-panel results-card">
          <div id="res-badge" class="title-badge">Итоги схватки</div>
          <h2 id="res-headline" style="margin: 4px 0 6px; font-size: 28px;">ПОБЕДА!</h2>
          <div id="res-sub" style="color: var(--text-muted); font-size: 14px;"></div>
          <table class="standings-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Боец</th>
                <th>Класс</th>
                <th>Статус</th>
                <th>Убийств</th>
                <th>Урон</th>
              </tr>
            </thead>
            <tbody id="res-tbody"></tbody>
          </table>
          <div style="display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
            <button id="btn-res-menu" class="btn">Главное меню</button>
            <button id="btn-res-class" class="btn">Сменить класс</button>
            <button id="btn-res-again" class="btn btn-primary">Сразиться снова!</button>
          </div>
        </div>
      </div>

      <!-- SETTINGS MODAL -->
      <div id="modal-settings" class="modal-backdrop hidden">
        <div class="stone-panel settings-card">
          <div class="title-badge">Параметры игры</div>
          <h2 style="margin: 4px 0 18px;">Настройки</h2>

          <div class="setting-group">
            <div class="setting-label">
              <span>Громкость звука</span>
              <span id="lbl-vol">70%</span>
            </div>
            <input id="inp-vol" type="range" min="0" max="100" step="1" class="setting-slider" />
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Чувствительность мыши</span>
              <span id="lbl-sens">1.0x</span>
            </div>
            <input id="inp-sens" type="range" min="20" max="250" step="5" class="setting-slider" />
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Качество графики</span>
              <span id="lbl-qual">Ультра (HDR + Тени 2K)</span>
            </div>
            <div class="mode-toggle-row" style="grid-template-columns: 1fr 1fr 1fr; margin-bottom: 4px;">
              <button id="qual-ultra" class="mode-btn active">Ультра</button>
              <button id="qual-high" class="mode-btn">Высокое</button>
              <button id="qual-low" class="mode-btn">Быстрое</button>
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Стиль рендера</span>
              <span id="lbl-pix">Чёткий HD 3D (1x)</span>
            </div>
            <input id="inp-pix" type="range" min="1" max="3" step="1" class="setting-slider" />
          </div>

          <div class="setting-group" style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
            <input id="inp-debug" type="checkbox" style="width: 18px; height: 18px; cursor: pointer;" />
            <label for="inp-debug" style="font-size: 13px; font-weight: 700; cursor: pointer;">
              Отладочное отображение хитбоксов и ИИ (F3)
            </label>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 18px;">
            <button id="btn-settings-close" class="btn btn-primary">Готово</button>
          </div>
        </div>
      </div>
    `;

    this.mainMenuEl = this.q('#screen-main-menu');
    this.selectionEl = this.q('#screen-selection');
    this.selectionSkillBarEl = this.q('#selection-skill-bar');
    this.hudEl = this.q('#screen-hud');
    this.pauseModalEl = this.q('#modal-pause');
    this.settingsModalEl = this.q('#modal-settings');
    this.resultsModalEl = this.q('#modal-results');

    this.timerEl = this.q('#hud-timer');
    this.alivePillEl = this.q('#hud-alive-pill');
    this.rosterListEl = this.q('#hud-roster-list');
    this.killFeedEl = this.q('#hud-kill-feed');
    this.vitalsBoxEl = this.q('#hud-vitals-box');
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

    this.bindEvents();
    this.renderSelectionClass('sword');
    this.syncSettingsControls();
  }

  public updateSettingsExternal(next: GameSettings): void {
    this.settings = { ...next };
    this.syncSettingsControls();
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
    }

    if (st === 'MatchFinished') {
      if (this.resultsRenderedGen !== match.fighters.length + Math.round(match.matchElapsed * 10)) {
        this.resultsRenderedGen =
          match.fighters.length + Math.round(match.matchElapsed * 10);
        this.renderResults(match);
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

    // Pause Modal
    this.q('#btn-pause-resume').addEventListener('click', () => {
      this.callbacks.onResumeGame();
    });
    this.q('#btn-pause-restart').addEventListener('click', () => {
      this.callbacks.onRestartMatch();
    });
    this.q('#btn-pause-settings').addEventListener('click', () => {
      this.settingsModalEl.classList.remove('hidden');
    });
    this.q('#btn-pause-menu').addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });

    // Spectator Controls
    this.q('#btn-spec-prev').addEventListener('click', () => {
      this.callbacks.onCycleSpectator(-1);
    });
    this.q('#btn-spec-next').addEventListener('click', () => {
      this.callbacks.onCycleSpectator(1);
    });
    this.q('#btn-spec-restart').addEventListener('click', () => {
      this.callbacks.onRestartMatch();
    });
    this.q('#btn-spec-menu').addEventListener('click', () => {
      this.callbacks.onReturnMainMenu();
    });

    // Results buttons
    this.q('#btn-res-again').addEventListener('click', () => {
      this.callbacks.onRestartMatch();
    });
    this.q('#btn-res-class').addEventListener('click', () => {
      this.callbacks.onOpenSelection();
    });
    this.q('#btn-res-menu').addEventListener('click', () => {
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

  /**
   * Builds a row of 6 beveled square skill icons with hover description tooltips.
   * Returns live DOM element references so HUD updates never recreate nodes or break :hover.
   */
  private populateSkillSquares(
    container: HTMLElement,
    classId: KnightClassId,
    interactiveClicks: boolean
  ): ActionBarSlotRefs[] {
    const descriptors = buildClassSkillBar(classId);
    container.innerHTML = '';
    const refs: ActionBarSlotRefs[] = [];

    descriptors.forEach((slot, index) => {
      // Insert subtle heraldic divider flanking the two central [1] & [2] signature abilities
      if (index === 3 || index === 5) {
        const sep = document.createElement('div');
        sep.className = 'skill-bar-sep';
        container.appendChild(sep);
      }

      const rootEl = document.createElement('div');
      rootEl.className = `skill-sq ${slot.isSignature ? 'signature' : 'core'} ready`;
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

  private renderSelectionClass(classId: KnightClassId): void {
    this.currentSelectedClass = classId;
    this.callbacks.onSelectPreviewClass(classId);

    const tabsEl = this.q('#class-tabs');
    tabsEl.innerHTML = CLASS_ORDER.map((cid) => {
      const c = KNIGHT_CLASSES[cid];
      return `
        <button class="class-tab ${cid === classId ? 'active' : ''}" data-cid="${cid}">
          <div class="class-tab-code">${c.codeLabel} · ${c.role}</div>
          <div class="class-tab-name">${c.name}</div>
        </button>
      `;
    }).join('');

    tabsEl.querySelectorAll('.class-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = (btn as HTMLElement).dataset.cid as KnightClassId;
        this.renderSelectionClass(cid);
      });
    });

    const cfg = KNIGHT_CLASSES[classId];
    const detailsEl = this.q('#class-details');
    const bar = (val: number) => Math.min(100, Math.round((val / 5) * 100));

    detailsEl.innerHTML = `
      <div style="font-size: 13px; color: #cfd7e6; line-height: 1.45; margin-bottom: 10px;">
        ${cfg.summary}
      </div>
      <div class="stat-grid">
        <div class="stat-row">
          <span>Здоровье</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(cfg.uiRatings.hp)}%"></div></div>
          <strong style="text-align:right">${cfg.maxHp} HP</strong>
        </div>
        <div class="stat-row">
          <span>Скорость</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(cfg.uiRatings.speed)}%"></div></div>
          <strong style="text-align:right">${cfg.moveSpeed.toFixed(1)} м/с</strong>
        </div>
        <div class="stat-row">
          <span>Сила атаки</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(cfg.uiRatings.attack)}%"></div></div>
          <strong style="text-align:right">${cfg.lightCombo[0].damage}/${cfg.heavyAttack.damage}</strong>
        </div>
        <div class="stat-row">
          <span>Защита</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(cfg.uiRatings.defense)}%"></div></div>
          <strong style="text-align:right">${Math.round(cfg.defense.damageReduction * 100)}%</strong>
        </div>
        <div class="stat-row">
          <span>Дальность</span>
          <div class="stat-bar-bg"><div class="stat-bar-fill" style="width:${bar(cfg.uiRatings.reach)}%"></div></div>
          <strong style="text-align:right">${cfg.heavyAttack.range.toFixed(1)} м</strong>
        </div>
      </div>
      <div style="font-size: 11px; font-weight: 800; color: var(--border-gold); text-transform: uppercase; margin-bottom: 6px;">
        Активные способности [1] и [2]
      </div>
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
                <span class="sel-ability-meta">${ab.cooldown}с · ${ab.staminaCost} СТ</span>
              </div>
              <div class="sel-ability-desc">${ab.description}</div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    // Populate the 6 square skill icons dock at the bottom of the showcase screen
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
        ? 'Ультра (HDR Bloom + Тени 2K)'
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
          isActiveNow =
            fighter.activeAbility?.slot === 1;
          break;
        case 'ability2':
          cdRem = fighter.abilityCooldowns[1];
          cdPct =
            descriptor.cooldownSec && descriptor.cooldownSec > 0
              ? Math.min(100, (cdRem / descriptor.cooldownSec) * 100)
              : 0;
          isActiveNow =
            fighter.activeAbility?.slot === 2;
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
        cdNumEl.textContent = cdRem >= 9.95 ? `${Math.ceil(cdRem)}` : cdRem.toFixed(1);
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
    // 1. Timer & Alive Pill
    const secs = Math.ceil(match.matchTimeRemaining);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    this.timerEl.textContent = match.isFinalPhase
      ? `ЯРОСТЬ АРЕНЫ · ${mm}:${ss}`
      : `${mm}:${ss}`;
    this.timerEl.classList.toggle('final-phase', match.isFinalPhase);

    const aliveCount = match.getLivingFighters().length;
    this.alivePillEl.textContent = `ЖИВЫХ: ${aliveCount} / ${match.fighters.length}`;

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
        const pct = Math.max(0, Math.round((f.hp / f.maxHp) * 100));
        return `
          <div class="roster-item ${f.isHuman ? 'human' : ''} ${
          f.isAlive ? '' : 'dead'
        }">
            <div class="roster-row-top">
              <span>${f.displayName}</span>
              <span>${f.isAlive ? `${Math.ceil(f.hp)} HP` : 'ВЫБЫЛ'}</span>
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
          ? `<div class="kill-feed-item"><strong>${kf.killerName}</strong> ⚔️ поверг <strong>${kf.victimName}</strong></div>`
          : `<div class="kill-feed-item"><strong>${kf.victimName}</strong> пал на арене</div>`
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

      this.playerClassLabelEl.textContent = KNIGHT_CLASSES[player.classId].name;
      this.playerStatePillEl.textContent = STATE_LABELS_RU[player.state];

      const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
      this.hpFillEl.style.width = `${hpPct}%`;
      this.hpTextEl.textContent = `ЗДОРОВЬЕ: ${Math.ceil(player.hp)} / ${player.maxHp}`;

      const stPct = Math.max(0, (player.stamina / player.maxStamina) * 100);
      this.stamFillEl.style.width = `${stPct}%`;
      this.stamTextEl.textContent = `ВЫНОСЛИВОСТЬ: ${Math.floor(player.stamina)} / ${player.maxStamina}`;

      if (player.damageAuraTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = `✨ ОБЕТ СТАЛИ: +25% УРОН (${player.damageAuraTimer.toFixed(1)}с)`;
      } else if (player.hasteTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = `💨 ШАГ ТЕНЕЙ: +25% СКОРОСТЬ (${player.hasteTimer.toFixed(1)}с)`;
      } else if (player.ironBastionTimer > 0) {
        this.activeBuffEl.classList.remove('hidden');
        this.activeBuffEl.textContent = `🛡️ ЖЕЛЕЗНЫЙ БАСТИОН: -35% УРОН (${player.ironBastionTimer.toFixed(1)}с)`;
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

  private renderResults(match: MatchManager): void {
    const standings = match.getStandings();
    const winner = standings[0];
    const playerWon = Boolean(winner && winner.isHuman);

    const headline = this.q('#res-headline');
    const sub = this.q('#res-sub');
    const badge = this.q('#res-badge');

    if (playerWon) {
      badge.textContent = 'Триумф на арене';
      headline.textContent = 'ПОБЕДА! ВЫ — ПОСЛЕДНИЙ ВЫЖИВШИЙ!';
      headline.style.color = '#ffe066';
    } else {
      badge.textContent = 'Матч завершён';
      headline.textContent = winner
        ? `ПОБЕДИТЕЛЬ: ${winner.name.toUpperCase()}`
        : 'НИЧЬЯ НА АРЕНЕ';
      headline.style.color = '#f3efe6';
    }

    sub.textContent =
      match.finishReason === 'time_up'
        ? 'Время схватки истекло — победитель определён по запасу здоровья и урону.'
        : `Длительность боя: ${Math.round(match.matchElapsed)} сек.`;

    const tbody = this.q('#res-tbody');
    tbody.innerHTML = standings
      .map((s) => {
        const clsName = KNIGHT_CLASSES[s.classId].name;
        const rowCls = `${s.place === 1 ? 'winner-row' : ''} ${
          s.isHuman ? 'human-row' : ''
        }`;
        return `
          <tr class="${rowCls}">
            <td>#${s.place}</td>
            <td>${s.name}</td>
            <td>${clsName}</td>
            <td>${s.isAlive ? `Жив (${s.hp} HP)` : 'Выбыл'}</td>
            <td>${s.kills}</td>
            <td>${s.damageDealt}</td>
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
