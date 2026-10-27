import {
  CLASS_ORDER,
  KNIGHT_CLASSES,
  KnightClassId,
} from '../config/classes';
import { GameSettings } from '../config/settings';
import { FighterState } from '../core/Fighter';
import { MatchManager, MatchMode, MatchState } from '../core/MatchManager';
import { ProjectedFighterLabel } from '../render/WorldRenderer';

export interface UICallbacks {
  onOpenSelection: () => void;
  onStartMatch: (classId: KnightClassId, mode: MatchMode) => void;
  onRestartMatch: () => void;
  onReturnMainMenu: () => void;
  onResumeGame: () => void;
  onCycleSpectator: (delta: 1 | -1) => void;
  onSettingsChanged: (next: GameSettings) => void;
  onSelectPreviewClass: (classId: KnightClassId) => void;
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

/**
 * Manages all UI screens, class selection showcase stats, compact combat HUD,
 * spectator controls, pause menu, settings modal, and match results table.
 * Rendered cleanly above the 3D canvas so text stays razor-sharp at any pixel scale.
 */
export class UIManager {
  private readonly root: HTMLElement;
  private readonly callbacks: UICallbacks;
  private settings: GameSettings;

  // Screen containers
  private readonly mainMenuEl: HTMLElement;
  private readonly selectionEl: HTMLElement;
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
  private readonly chargeMeterEl: HTMLElement;
  private readonly chargeFillEl: HTMLElement;
  private readonly pointerPromptEl: HTMLElement;
  private readonly countdownBannerEl: HTMLElement;
  private readonly worldLabelsLayerEl: HTMLElement;
  private readonly spectatorBarEl: HTMLElement;
  private readonly spectatorSubEl: HTMLElement;

  private readonly labelPool = new Map<string, HTMLElement>();
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
            <div><span class="key-chip">Space</span> Уклонение / Толчок</div>
            <div><span class="key-chip">Shift</span> Бег</div>
            <div><span class="key-chip">F3</span> Хитбоксы · <span class="key-chip">Esc</span> Пауза</div>
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
        <div class="stone-panel showcase-caption">
          3D-модель выбранного рыцаря на постаменте арены
        </div>
      </div>

      <!-- IN-GAME HUD -->
      <div id="screen-hud" class="hud-layer hidden">
        <div id="world-labels-layer"></div>

        <div class="stone-panel hud-top-bar">
          <div id="hud-timer" class="hud-timer">02:30</div>
          <div id="hud-alive-pill" class="hud-alive-pill">ЖИВЫХ: 5 / 5</div>
        </div>

        <div id="hud-pointer-prompt" class="pointer-prompt hidden">
          Кликните мышью по экрану для управления камерой и атак
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
          <div class="hud-hint-line">
            ЛКМ: Удар / Заряд · ПКМ: Защита · Space: Манёвр · Esc: Пауза
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
              <span>Стиль рендера</span>
              <span id="lbl-pix">Чёткий Low-Poly (1x)</span>
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
    const state = match.state;

    if (this.lastRenderedState !== state || this.lastPaused !== match.paused) {
      this.mainMenuEl.classList.toggle('hidden', state !== 'MainMenu');
      this.selectionEl.classList.toggle(
        'hidden',
        state !== 'CharacterSelection'
      );
      const showHud =
        state === 'Countdown' ||
        state === 'InProgress' ||
        state === 'PlayerEliminated';
      this.hudEl.classList.toggle('hidden', !showHud);

      this.pauseModalEl.classList.toggle(
        'hidden',
        !match.paused || !showHud
      );
      this.resultsModalEl.classList.toggle('hidden', state !== 'MatchFinished');

      if (state === 'CharacterSelection') {
        this.renderSelectionClass(match.selectedPlayerClass);
      }

      if (state === 'MatchFinished' && this.resultsRenderedGen !== match.matchGeneration) {
        this.resultsRenderedGen = match.matchGeneration;
        this.renderResults(match);
      }

      this.lastRenderedState = state;
      this.lastPaused = match.paused;
    }

    if (
      state === 'Countdown' ||
      state === 'InProgress' ||
      state === 'PlayerEliminated'
    ) {
      this.updateActiveHud(match, labels, pointerLocked);
    }
  }

  private bindEvents(): void {
    this.q('#btn-menu-select').addEventListener('click', () => {
      this.selectedMode = 'ffa5';
      this.syncModeButtons();
      this.callbacks.onOpenSelection();
    });

    this.q('#btn-menu-quick').addEventListener('click', () => {
      this.callbacks.onStartMatch('sword', 'ffa5');
    });

    this.q('#btn-menu-duel').addEventListener('click', () => {
      this.selectedMode = 'duel_debug';
      this.syncModeButtons();
      this.callbacks.onStartMatch('sword', 'duel_debug');
    });

    this.q('#btn-menu-settings').addEventListener('click', () => {
      this.settingsModalEl.classList.remove('hidden');
    });

    // Mode buttons in selection
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

    // Pause buttons
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

    // Spectator buttons
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

    const pushSettings = () => {
      const pVal = Number(pixInp.value);
      const pixelScale: 1 | 2 | 3 = pVal === 2 ? 2 : pVal === 3 ? 3 : 1;
      this.settings = {
        masterVolume: Number(volInp.value) / 100,
        mouseSensitivity: Number(sensInp.value) / 100,
        pixelScale,
        debugHitboxes: dbgInp.checked,
      };
      this.syncSettingsControls();
      this.callbacks.onSettingsChanged(this.settings);
    };

    volInp.addEventListener('input', pushSettings);
    sensInp.addEventListener('input', pushSettings);
    pixInp.addEventListener('input', pushSettings);
    dbgInp.addEventListener('change', pushSettings);

    this.q('#btn-settings-close').addEventListener('click', () => {
      this.settingsModalEl.classList.add('hidden');
    });
  }

  private currentSelectedClass: KnightClassId = 'sword';

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
      <div style="font-size: 11px; font-weight: 800; color: var(--border-gold); text-transform: uppercase;">
        Боевые приёмы класса
      </div>
      <ul class="ability-list">
        ${cfg.abilitiesList.map((a) => `<li>${a}</li>`).join('')}
      </ul>
    `;
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
        ? 'Чёткий Low-Poly (1x)'
        : this.settings.pixelScale === 2
        ? 'Ретро 3D (2x)'
        : 'Пиксель-ретро (3x)';

    (this.q('#inp-debug') as HTMLInputElement).checked =
      this.settings.debugHitboxes;
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

    // 6. Player Vitals vs Spectator Mode
    const player = match.getPlayer();
    if (match.state === 'PlayerEliminated') {
      this.vitalsBoxEl.classList.add('hidden');
      this.spectatorBarEl.classList.remove('hidden');
      const obs = match.getObservedFighter();
      this.spectatorSubEl.textContent = obs
        ? `Камера следует за: ${obs.displayName} (${KNIGHT_CLASSES[obs.classId].name}) — Осталось бойцов: ${aliveCount}`
        : 'Определение победителя...';
      this.chargeMeterEl.classList.add('hidden');
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
