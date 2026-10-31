import '@fontsource/cinzel/latin-800.css';
import '@fontsource/philosopher/cyrillic-700.css';
import '@fontsource/philosopher/latin-700.css';
import '@fontsource/philosopher/latin-ext-700.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-800.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/latin-ext-600.css';
import '@fontsource/inter/latin-ext-800.css';
import './style.css';
import { DefaultLoadingManager } from 'three';
import { KnightClassId } from './config/classes';
import { hasSavedLanguage, loadSettings, saveSettings } from './config/settings';
import { detectYandexLanguage } from './config/locales';
import { loadProfile } from './config/playerProfile';
import { createEmptyIntent, FighterInputIntent } from './core/Fighter';
import { MatchManager, MatchMode, MatchState } from './core/MatchManager';
import { forwardFromYaw } from './core/math';
import { SoundManager } from './audio/SoundManager';
import {
  MultiplayerClient,
  ServerSnapshotMsg,
} from './net/MultiplayerClient';
import { ClientNetWorldSync } from './net/MultiplayerRoomSim';
import {
  CameraRig,
  CrosshairAimResult,
  RETICLE_DEFAULT_NORM_X,
  RETICLE_DEFAULT_NORM_Y,
} from './render/CameraRig';
import { WorldRenderer } from './render/WorldRenderer';
import { HudReticleViewState, UIManager } from './ui/UIManager';
import { LoadingScreen } from './ui/LoadingScreen';
import { LoadingTracker } from './render/LoadingTracker';
import { YandexGames, type YandexLoader } from './platform/YandexGames';
import { CrazyGames, findCrazySdk } from './platform/CrazyGames';
import type { GamePlatform } from './platform/GamePlatform';
import { CloudProfile, type CloudPlayer } from './platform/CloudProfile';

class KnightsGameApp {
  private settings = loadSettings();
  private readonly profile = loadProfile();
  private readonly match = new MatchManager();
  private readonly sound = new SoundManager();

  private world: WorldRenderer | null = null;
  private readonly ui: UIManager;
  private readonly net: MultiplayerClient;
  private readonly netSync = new ClientNetWorldSync();

  private readonly canvasRoot: HTMLElement;
  private readonly keysDown = new Set<string>();
  private lmbHeld = false;
  private lmbTapQueued = false;
  private rmbHeld = false;
  private mmbHeld = false;
  private dodgeQueued = false;
  private jumpQueued = false;
  private ability1Queued = false;
  private ability2Queued = false;
  private ability3Queued = false;
  private fallbackYaw = 0;

  // MMORPG Free-Look (orbit camera 360 deg while keeping run heading) & Screen-Wide Free Crosshair Mode
  private freeLookToggled = false;
  private lockedMoveYaw: number | null = null;
  private freeCursorAimMode = false;
  private reticleNormX = RETICLE_DEFAULT_NORM_X;
  private reticleNormY = RETICLE_DEFAULT_NORM_Y;
  private latestAimResult: CrosshairAimResult | null = null;

  private pointerLocked = false;
  private intentionalUnlock = false;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;
  private showcaseDragging = false;
  private showcaseLastX = 0;

  private lastFrameTime = performance.now();
  private lastCountdownWhole = -1;

  private platformPaused: boolean;
  private adPaused = false;
  private windowFocused = true;
  private readonly platform: GamePlatform;
  private readonly isCrazyGames = import.meta.env.VITE_PLATFORM === 'crazygames';
  private loading = true;

  constructor(platform: GamePlatform, platformLanguage: string | undefined, platformPaused: boolean, cloud: CloudProfile | null, private readonly loadingScreen: LoadingScreen) {
    this.platform = platform;
    this.platformPaused = platformPaused;
    if (platformLanguage && !hasSavedLanguage()) {
      this.settings = { ...this.settings, language: detectYandexLanguage(platformLanguage) };
    }
    this.loadingScreen.setLanguage(this.settings.language);
    this.match.selectedPlayerClass = this.profile.activeKnight;
    const canvasRoot = document.getElementById('game-canvas-root')!;
    this.canvasRoot = canvasRoot;
    const uiRoot = document.getElementById('ui-root')!;

    this.sound.setVolume(this.settings.masterVolume);

    this.net = new MultiplayerClient({
      onStatusChange: (status, errText) => {
        this.ui.updateMultiplayerStatus(status, this.net.pingMs, errText);
        if (
          (status === 'disconnected' || status === 'error') &&
          this.match.isOnlineMatch
        ) {
          this.releasePointerLock();
          this.match.goToMultiplayerLobby();
          this.ui.showMultiplayerNotice(
            errText || 'Соединение с сервером прервано.',
            'error'
          );
        }
      },
      onPingUpdate: (pingMs) => {
        this.ui.updateMultiplayerStatus(this.net.getStatus(), pingMs);
      },
      onRoomsList: (rooms) => {
        this.ui.updatePublicRooms(rooms);
      },
      onRoomUpdated: (room) => {
        this.ui.updateMultiplayerRoom(room, this.net.clientId);
      },
      onErrorMsg: (message) => {
        this.ui.showMultiplayerNotice(message, 'error');
      },
      onMatchStarted: ({ yourFighterId, matchGeneration, snapshot }) => {
        this.sound.unlock();
        this.clearActionInputs();
        this.netSync.initMatchFromSnapshot(
          this.match,
          yourFighterId,
          matchGeneration,
          snapshot
        );
        this.lastCountdownWhole = Math.ceil(this.match.countdownTimer);
        this.sound.playCountdownTick(false);
        this.world?.resetCameraBehindPlayer(this.match);
        this.requestPointerLockSafe();
      },
      onSnapshot: (msg) => {
        if (!this.match.isOnlineMatch) return;
        this.handleOnlineSnapshot(msg);
      },
      onReturnedToLobby: (room) => {
        this.releasePointerLock();
        this.clearActionInputs();
        this.match.goToMultiplayerLobby();
        this.ui.updateMultiplayerRoom(room, this.net.clientId);
      },
    }, import.meta.env.VITE_MULTIPLAYER_BASE_URL || undefined);

    // Mount UI immediately so Main Menu opens in <100ms without waiting on Three.js/WebGL!
    this.ui = new UIManager(uiRoot, this.settings, {
      onOpenSelection: () => {
        this.sound.playUiClick();
        this.releasePointerLock();
        this.match.goToCharacterSelection();
      },
      onOpenMultiplayer: () => {
        this.sound.playUiClick();
        this.releasePointerLock();
        this.match.goToMultiplayerLobby();
        this.net.connect().then((ok) => {
          if (ok) {
            this.net.requestRooms();
          }
        });
      },
      onStartMatch: (classId: KnightClassId, mode: MatchMode) => {
        this.sound.unlock();
        this.net.leaveRoom();
        this.beginMatch(classId, mode);
      },
      onRestartMatch: () => {
        this.sound.unlock();
        if (this.match.isOnlineMatch && this.net.currentRoom) {
          this.net.requestRematch();
          return;
        }
        this.beginMatch(this.match.selectedPlayerClass, this.match.mode);
      },
      onReturnMainMenu: () => {
        this.sound.playUiClick();
        this.releasePointerLock();
        if (this.match.isOnlineMatch) {
          this.net.leaveRoom();
          this.match.goToMultiplayerLobby();
          this.net.requestRooms();
          return;
        }
        if (this.net.currentRoom) {
          this.net.leaveRoom();
        }
        this.match.goToMainMenu();
      },
      onResumeGame: () => {
        this.sound.playUiClick();
        this.match.paused = false;
        this.requestPointerLockSafe();
      },
      onCycleSpectator: (delta) => {
        this.sound.playUiClick();
        const next = this.match.cycleSpectatorTarget(delta);
        if (next && this.world) {
          this.world.cameraRig.snapBehindTarget(
            next.body.x,
            next.body.z,
            next.yaw,
            next.body.y
          );
        }
      },
      onWatchRewardedAd: (reward, finished) => {
        this.adPaused = true;
        this.syncPlatformPause();
        const started = this.platform.showRewarded(reward, (rewarded) => {
          this.adPaused = false;
          this.syncPlatformPause();
          finished(rewarded);
        });
        if (!started) {
          this.adPaused = false;
          this.syncPlatformPause();
        }
        return started;
      },
      onSettingsChanged: (next) => {
        this.settings = { ...next };
        saveSettings(this.settings);
        this.sound.setVolume(this.settings.masterVolume);
        this.world?.applyGraphicsConfig(
          this.settings.pixelScale,
          this.settings.graphicsQuality
        );
        this.world?.applyArenaTheme(this.settings.arenaTheme);
      },
      onSelectPreviewClass: (classId, userInitiated) => {
        if (userInitiated) {
          this.sound.playClassSelect(classId);
        }
        this.match.selectedPlayerClass = classId;
        this.world?.syncShowcaseClass(classId);
      },
      onTriggerSkillSlot: (slotKey) => {
        if (
          !this.isCombatInteractive() ||
          this.match.state === 'PlayerEliminated'
        ) {
          return;
        }
        this.sound.unlock();
        if (slotKey === 'ability1') {
          this.ability1Queued = true;
        } else if (slotKey === 'ability2') {
          this.ability2Queued = true;
        } else if (slotKey === 'ability3') {
          this.ability3Queued = true;
        } else if (slotKey === 'dodge') {
          this.dodgeQueued = true;
        } else if (slotKey === 'light') {
          this.lmbHeld = true;
          window.setTimeout(() => {
            this.lmbHeld = false;
          }, 60);
        }
      },

      // Online Multiplayer UI actions
      onMpQuickJoin: (playerName, classId) => {
        this.sound.playUiClick();
        this.net.quickJoin(playerName, classId);
      },
      onMpCreateRoom: (opts) => {
        this.sound.playUiClick();
        this.net.createRoom(opts);
      },
      onMpJoinRoom: (roomCode, playerName, classId) => {
        this.sound.playUiClick();
        this.net.joinRoom(roomCode, playerName, classId);
      },
      onMpRefreshRooms: () => {
        this.sound.playUiClick();
        this.net.connect().then((ok) => {
          if (ok) this.net.requestRooms();
        });
      },
      onMpLeaveRoom: () => {
        this.sound.playUiClick();
        this.net.leaveRoom();
        this.net.requestRooms();
      },
      onMpSelectClass: (classId) => {
        this.sound.playClassSelect(classId);
        this.match.selectedPlayerClass = classId;
        if (this.net.currentRoom) {
          this.net.selectClass(classId);
        }
      },
      onMpSetName: (playerName) => {
        if (this.net.currentRoom) {
          this.net.setName(playerName);
        }
      },
      onMpToggleReady: (ready) => {
        this.sound.playUiClick();
        this.net.setReady(ready);
      },
      onMpRoomOptions: (opts) => {
        this.sound.playUiClick();
        this.net.setRoomOptions(opts);
      },
      onMpStartMatch: () => {
        this.sound.unlock();
        this.sound.playUiClick();
        this.net.startMatch();
      },
      onMpReturnToLobby: () => {
        this.sound.playUiClick();
        this.net.returnToLobby();
      },
    });

    void this.platform.getPlayerName().then((name) => {
      if (name) this.ui.useYandexPlayerName(name);
    });
    const showCloudConflict = () => {
      if (!cloud) return;
      if (this.match.state === 'Countdown' || this.match.state === 'InProgress') {
        this.match.paused = true;
        this.clearActionInputs();
        this.releasePointerLock();
      }
      this.ui.showCloudConflict((choice) => {
        cloud.resolveConflict(choice);
        const profile = loadProfile();
        this.match.selectedPlayerClass = profile.activeKnight;
        this.world?.syncShowcaseClass(profile.activeKnight);
      });
    };
    cloud?.onConflict(showCloudConflict);
    if (cloud?.conflict) showCloudConflict();
    document.addEventListener('visibilitychange', () => this.syncPlatformPause());
    this.syncPlatformPause();

    this.setupGlobalInputListeners();
    this.ui.update(this.match, [], false);

    // Create the renderer while the loading overlay blocks interaction.
    window.setTimeout(() => {
      this.initWorldRenderer(canvasRoot);
    }, 16);

    // Экспонируем приложение для доступа из UI (например, к Яндекс SDK для рекламы)
    (window as unknown as { __knightsApp?: KnightsGameApp }).__knightsApp = this;

    // Обработка изменения размера окна (Яндекс Игры запускают во фрейме)
    window.addEventListener('resize', () => {
      this.world?.applyGraphicsConfig(
        this.settings.pixelScale,
        this.settings.graphicsQuality
      );
    });

    requestAnimationFrame(this.loop);
  }

  public setPlatformPause(paused: boolean): void {
    this.platformPaused = paused;
    this.syncPlatformPause();
  }

  private syncPlatformPause(): void {
    const blocked = this.platformPaused || this.adPaused || document.hidden || !this.windowFocused;
    this.sound.setMuted(blocked);
    if (blocked) {
      this.clearActionInputs();
      if (this.match.isOnlineMatch) {
        this.net.streamInputIntent(0.1, createEmptyIntent(this.world?.cameraRig.yaw ?? this.fallbackYaw));
      }
      this.releasePointerLock();
      // CrazyGames handles focus changes itself; only the game pauses locally.
      if (!this.isCrazyGames) this.platform.setGameplay(false);
    }
  }

  private initWorldRenderer(canvasRoot: HTMLElement): void {
    const tracker = new LoadingTracker(DefaultLoadingManager);
    try {
      const world = new WorldRenderer(canvasRoot, this.settings.arenaTheme, stage => this.loadingScreen.setStage(stage));
      world.applyGraphicsConfig(this.settings.pixelScale, this.settings.graphicsQuality);
      world.applyArenaTheme(this.settings.arenaTheme);
      world.syncShowcaseClass(this.match.selectedPlayerClass);
      this.world = world;
      this.loadingScreen.allowContinue(() => this.finishInitialLoading());
      this.attachCanvasListeners(world.renderer.domElement);

      void world.assetsReady.then(async () => {
        await tracker.waitForIdle();
        if (document.fonts) await document.fonts.ready;
        tracker.dispose();
        if (!this.loading) {
          this.platform.ready();
        } else if (tracker.hasFailures) {
          this.loadingScreen.showProblem('failed');
        } else {
          this.finishInitialLoading();
        }
      }).catch(err => {
        tracker.dispose();
        console.error('Game asset preparation failed:', err);
        this.loadingScreen.showProblem('failed');
      });
    } catch (err) {
      tracker.dispose();
      console.error('3D WorldRenderer initialization failed:', err);
      this.loadingScreen.showProblem('fatal');
    }
  }

  private finishInitialLoading(): void {
    if (!this.loading || !this.world) return;
    try {
      // Draw once behind the overlay before making the menu interactive.
      this.world.renderFrame(0, this.match, this.settings);
    } catch (err) {
      console.error('First game frame failed:', err);
      this.loadingScreen.showProblem('fatal');
      return;
    }
    this.loading = false;
    this.clearActionInputs();
    this.loadingScreen.finish();
    (window as unknown as { __knightsBooted?: boolean }).__knightsBooted = true;
    // Fallback is a deliberate user choice; the first playable frame is ready even if downloads continue.
    this.platform.ready();
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ||
        location.hostname.endsWith('.e2b.app') || location.hostname.endsWith('.arena.site')) {
      fetch('/api/client-ready', { method: 'POST' }).catch(() => {});
    }
  }

  private beginMatch(classId: KnightClassId, mode: MatchMode): void {
    this.clearActionInputs();
    this.match.startMatch(classId, mode);
    this.lastCountdownWhole = Math.ceil(this.match.countdownTimer);
    this.sound.playCountdownTick(false);
    this.world?.resetCameraBehindPlayer(this.match);
    this.requestPointerLockSafe();
  }

  private clearActionInputs(): void {
    this.keysDown.clear();
    this.lmbHeld = false;
    this.lmbTapQueued = false;
    this.rmbHeld = false;
    this.mmbHeld = false;
    this.freeLookToggled = false;
    this.lockedMoveYaw = null;
    this.dodgeQueued = false;
    this.jumpQueued = false;
    this.ability1Queued = false;
    this.ability2Queued = false;
    this.ability3Queued = false;
  }

  private syncCursorVisualClass(): void {
    const useCustomCrosshairCursor =
      this.isCombatInteractive() &&
      this.match.state !== 'PlayerEliminated' &&
      !this.keysDown.has('Tab') &&
      !this.pointerLocked &&
      this.freeCursorAimMode;
    this.canvasRoot.classList.toggle(
      'free-aim-cursor',
      useCustomCrosshairCursor
    );
  }

  private isCombatInteractive(): boolean {
    return (
      !this.match.paused &&
      (this.match.state === 'Countdown' ||
        this.match.state === 'InProgress' ||
        this.match.state === 'PlayerEliminated')
    );
  }

  private requestPointerLockSafe(): void {
    if (this.freeCursorAimMode) return;
    const canvas = this.world?.renderer.domElement;
    if (!canvas || document.pointerLockElement === canvas) return;
    try {
      const req = canvas.requestPointerLock?.() as unknown as
        | Promise<void>
        | undefined;
      if (req && typeof req.catch === 'function') {
        req.catch(() => {});
      }
    } catch {
      // Fallback mouse tracking handles environments where pointer lock is restricted
    }
  }

  private releasePointerLock(): void {
    if (document.pointerLockElement) {
      this.intentionalUnlock = true;
      try {
        document.exitPointerLock?.();
      } catch {
        // Ignore
      }
    }
  }

  private togglePause(): void {
    if (
      this.match.state !== 'Countdown' &&
      this.match.state !== 'InProgress' &&
      this.match.state !== 'PlayerEliminated'
    ) {
      return;
    }

    this.match.paused = !this.match.paused;
    if (this.match.paused) {
      this.clearActionInputs();
      this.releasePointerLock();
    } else {
      this.requestPointerLockSafe();
    }
  }

  private attachCanvasListeners(canvas: HTMLCanvasElement): void {
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      const wasLocked = this.pointerLocked;
      this.pointerLocked = locked;

      if (locked) {
        this.reticleNormX = RETICLE_DEFAULT_NORM_X;
        this.reticleNormY = RETICLE_DEFAULT_NORM_Y;
      }

      if (
        wasLocked &&
        !locked &&
        !this.intentionalUnlock &&
        !this.freeCursorAimMode &&
        (this.match.state === 'Countdown' ||
          this.match.state === 'InProgress' ||
          this.match.state === 'PlayerEliminated') &&
        !this.match.paused
      ) {
        this.match.paused = true;
        this.clearActionInputs();
      }
      this.intentionalUnlock = false;
      this.syncCursorVisualClass();
    });

    canvas.addEventListener('mousedown', (e) => {
      this.sound.unlock();
      if (
        e.button === 0 &&
        !this.match.paused &&
        (this.match.state === 'MainMenu' ||
          this.match.state === 'CharacterSelection')
      ) {
        this.showcaseDragging = true;
        this.showcaseLastX = e.clientX;
        return;
      }

      if (!this.isCombatInteractive()) return;

      if (!this.pointerLocked) {
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        this.reticleNormX = Math.min(0.96, Math.max(0.04, e.clientX / w));
        this.reticleNormY = Math.min(0.92, Math.max(0.05, e.clientY / h));
      }

      if (
        !this.pointerLocked &&
        !this.freeCursorAimMode &&
        this.match.state !== 'PlayerEliminated'
      ) {
        this.requestPointerLockSafe();
      }

      if (e.button === 0) {
        this.lmbHeld = true;
        this.lmbTapQueued = true;
      } else if (e.button === 1) {
        e.preventDefault();
        this.mmbHeld = true;
        if (this.lockedMoveYaw === null) {
          this.lockedMoveYaw = this.world
            ? this.world.cameraRig.yaw
            : this.fallbackYaw;
        }
      } else if (e.button === 2) {
        this.rmbHeld = true;
      }
    });
  }

  private setupGlobalInputListeners(): void {
    window.addEventListener('resize', () => {
      this.world?.applyGraphicsConfig(
        this.settings.pixelScale,
        this.settings.graphicsQuality
      );
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.isCombatInteractive()) return;
        const inModal = Boolean(
          (e.target as Element | null)?.closest?.('.glass-modal')
        );
        if (inModal) return;
        e.preventDefault();
        this.world?.cameraRig.applyWheelZoom(e.deltaY);
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (this.loading) return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (e.code === 'F3') {
        e.preventDefault();
        this.settings.debugHitboxes = !this.settings.debugHitboxes;
        saveSettings(this.settings);
        this.ui.updateSettingsExternal(this.settings);
        return;
      }

      if (!this.isCombatInteractive()) return;

      if (e.code === 'Backquote' && !e.repeat) {
        e.preventDefault();
        this.freeCursorAimMode = !this.freeCursorAimMode;
        if (this.freeCursorAimMode) {
          this.releasePointerLock();
        } else {
          this.reticleNormX = RETICLE_DEFAULT_NORM_X;
          this.reticleNormY = RETICLE_DEFAULT_NORM_Y;
          if (this.match.state !== 'PlayerEliminated') {
            this.requestPointerLockSafe();
          }
        }
        this.syncCursorVisualClass();
        return;
      }

      if (e.code === 'KeyV' && !e.repeat) {
        e.preventDefault();
        this.freeLookToggled = !this.freeLookToggled;
        if (this.freeLookToggled) {
          this.lockedMoveYaw = this.world
            ? this.world.cameraRig.yaw
            : this.fallbackYaw;
        } else if (!this.mmbHeld) {
          this.lockedMoveYaw = null;
        }
        return;
      }

      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) {
          this.keysDown.add('Tab');
          this.releasePointerLock();
          this.syncCursorVisualClass();
        }
        return;
      }

      if (this.match.state === 'PlayerEliminated') {
        if (e.code === 'KeyQ') {
          this.match.cycleSpectatorTarget(-1);
        } else if (e.code === 'KeyE') {
          this.match.cycleSpectatorTarget(1);
        }
      }

      this.keysDown.add(e.code);
      if ((e.code === 'Digit1' || e.code === 'Numpad1') && !e.repeat) {
        e.preventDefault();
        this.ability1Queued = true;
      } else if ((e.code === 'Digit2' || e.code === 'Numpad2') && !e.repeat) {
        e.preventDefault();
        this.ability2Queued = true;
      } else if ((e.code === 'Digit3' || e.code === 'Numpad3') && !e.repeat) {
        e.preventDefault();
        this.ability3Queued = true;
      } else if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.jumpQueued = true;
      } else if (
        (e.code === 'AltLeft' ||
          e.code === 'AltRight' ||
          e.code === 'KeyC' ||
          e.code === 'ControlLeft') &&
        !e.repeat
      ) {
        e.preventDefault();
        this.dodgeQueued = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Tab' && this.keysDown.has('Tab')) {
        this.keysDown.delete('Tab');
        if (
          this.isCombatInteractive() &&
          this.match.state !== 'PlayerEliminated' &&
          !this.freeCursorAimMode
        ) {
          this.requestPointerLockSafe();
        }
        this.syncCursorVisualClass();
        return;
      }
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.windowFocused = false;
      this.syncPlatformPause();
      this.showcaseDragging = false;
      this.clearActionInputs();
      this.syncCursorVisualClass();
    });

    window.addEventListener('focus', () => { this.windowFocused = true; this.syncPlatformPause(); });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.showcaseDragging = false;
        this.lmbHeld = false;
      } else if (e.button === 1) {
        this.mmbHeld = false;
        if (!this.freeLookToggled) {
          this.lockedMoveYaw = null;
        }
      } else if (e.button === 2) {
        this.rmbHeld = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (
        this.showcaseDragging &&
        (this.match.state === 'MainMenu' ||
          this.match.state === 'CharacterSelection')
      ) {
        const dxSpin = e.clientX - this.showcaseLastX;
        this.showcaseLastX = e.clientX;
        if (Math.abs(dxSpin) < 160) {
          this.world?.rotateShowcaseBy(dxSpin * 0.012);
        }
        return;
      }

      const overSkillBar = Boolean(
        (e.target as Element | null)?.closest?.('.hud-actionbar')
      );
      if (
        !this.isCombatInteractive() ||
        this.keysDown.has('Tab') ||
        (!this.pointerLocked && overSkillBar)
      ) {
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        return;
      }

      let dx = 0;
      let dy = 0;
      if (this.pointerLocked) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
        this.reticleNormX = RETICLE_DEFAULT_NORM_X;
        this.reticleNormY = RETICLE_DEFAULT_NORM_Y;
      } else {
        if (this.lastClientX !== null && this.lastClientY !== null) {
          dx = e.clientX - this.lastClientX;
          dy = e.clientY - this.lastClientY;
        }
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;

        // Move the aiming crosshair freely anywhere across the viewport when unlocked!
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        if (!this.mmbHeld && !(this.freeCursorAimMode && this.rmbHeld)) {
          this.reticleNormX = Math.min(0.96, Math.max(0.04, e.clientX / w));
          this.reticleNormY = Math.min(0.92, Math.max(0.05, e.clientY / h));
        }

        // In explicit Free-Cursor MMORPG mode (~), orbit camera when holding RMB or MMB!
        if (this.freeCursorAimMode && !this.rmbHeld && !this.mmbHeld) {
          return;
        }
      }

      if (Math.abs(dx) < 280 && Math.abs(dy) < 280) {
        if (this.world) {
          this.world.cameraRig.applyMouseDelta(
            dx,
            dy,
            this.settings.mouseSensitivity
          );
        } else {
          this.fallbackYaw -= dx * 0.0028 * this.settings.mouseSensitivity;
        }
      }
    });
  }

  private evaluateCrosshairAim(): { aimYaw: number; aimPitch: number } {
    const camYaw = this.world ? this.world.cameraRig.yaw : this.fallbackYaw;
    const player = this.match.getPlayer();
    if (!this.world || !player) {
      this.latestAimResult = null;
      return {
        aimYaw: camYaw,
        aimPitch: this.world ? -this.world.cameraRig.pitch : 0,
      };
    }

    const normX = this.pointerLocked
      ? RETICLE_DEFAULT_NORM_X
      : this.reticleNormX;
    const normY = this.pointerLocked
      ? RETICLE_DEFAULT_NORM_Y
      : this.reticleNormY;

    const res = this.world.cameraRig.computeCrosshairAim({
      normX,
      normY,
      playerX: player.body.x,
      playerY: player.body.y,
      playerZ: player.body.z,
      fighters: this.match.fighters,
      localPlayerId: this.match.localPlayerId,
      arena: this.match.arena,
    });
    this.latestAimResult = res;
    return { aimYaw: res.aimYaw, aimPitch: res.aimPitch };
  }

  private buildHumanIntent(): FighterInputIntent {
    const camYaw = this.world ? this.world.cameraRig.yaw : this.fallbackYaw;
    const { aimYaw, aimPitch } = this.evaluateCrosshairAim();
    const intent = createEmptyIntent(aimYaw);

    let forwardInput = 0;
    let rightInput = 0;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) {
      forwardInput += 1;
    }
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) {
      forwardInput -= 1;
    }
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) {
      rightInput += 1;
    }
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) {
      rightInput -= 1;
    }

    const freeLookActive = this.mmbHeld || this.freeLookToggled;
    const moveBasisYaw =
      freeLookActive && this.lockedMoveYaw !== null
        ? this.lockedMoveYaw
        : camYaw;

    const basis = this.world
      ? CameraRig.basisFromYaw(moveBasisYaw)
      : (() => {
          const fwd = forwardFromYaw(moveBasisYaw);
          return { fwdX: fwd.x, fwdZ: fwd.z, rightX: -fwd.z, rightZ: fwd.x };
        })();
    let wx = basis.fwdX * forwardInput + basis.rightX * rightInput;
    let wz = basis.fwdZ * forwardInput + basis.rightZ * rightInput;
    const len = Math.hypot(wx, wz);
    if (len > 1e-4) {
      wx /= len;
      wz /= len;
    }

    intent.moveX = wx;
    intent.moveZ = wz;
    intent.aimYaw = aimYaw;
    intent.aimPitch = aimPitch;
    intent.hasAimOverride = true;
    intent.sprint =
      this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
    intent.attackHeld = this.lmbHeld;
    intent.lightAttackTap = this.lmbTapQueued && !this.lmbHeld;
    intent.blockHeld = this.rmbHeld;
    intent.dodgePressed = this.dodgeQueued;
    intent.jumpPressed = this.jumpQueued;
    intent.ability1Pressed = this.ability1Queued;
    intent.ability2Pressed = this.ability2Queued;
    intent.ability3Pressed = this.ability3Queued;
    this.lmbTapQueued = false;
    this.dodgeQueued = false;
    this.jumpQueued = false;
    this.ability1Queued = false;
    this.ability2Queued = false;
    this.ability3Queued = false;

    return intent;
  }

  private handleStateAudioAndEffects(
    stateChangedTo: MatchState | null,
    enteredFinalPhase: boolean,
    footstepIds: string[],
    jumpedIds: string[],
    dodgedIds: string[],
    landedFighters: Array<{ id: string; x: number; y: number; z: number }>,
    events: ServerSnapshotMsg['events']
  ): void {
    if (this.match.state === 'Countdown') {
      const whole = Math.ceil(this.match.countdownTimer);
      if (whole !== this.lastCountdownWhole && whole > 0) {
        this.lastCountdownWhole = whole;
        this.sound.playCountdownTick(false);
      }
    }

    if (stateChangedTo === 'InProgress') {
      this.sound.playCountdownTick(true);
    } else if (stateChangedTo === 'MatchFinished') {
      this.releasePointerLock();
      const player = this.match.getPlayer();
      this.sound.playMatchEnd(
        Boolean(player && this.match.winnerId === player.id)
      );
    } else if (stateChangedTo === 'PlayerEliminated') {
      this.releasePointerLock();
    }

    if (enteredFinalPhase) {
      this.sound.playSuddenDeathBell();
    }

    const obs = this.match.getObservedFighter();
    const obsId = obs ? obs.id : null;

    for (const fid of footstepIds) {
      const f = this.match.fighters.find((item) => item.id === fid);
      if (f) {
        this.sound.playFootstep(
          fid === obsId,
          f.body.x,
          f.body.y,
          f.body.z,
          f.classId
        );
      }
    }
    for (const fid of jumpedIds) {
      const f = this.match.fighters.find((item) => item.id === fid);
      if (f) {
        this.sound.playJump(
          fid === obsId,
          f.body.x,
          f.body.y,
          f.body.z,
          f.classId
        );
      }
    }
    for (const fid of dodgedIds) {
      const f = this.match.fighters.find((item) => item.id === fid);
      if (f) {
        this.sound.playDodge(
          fid === obsId,
          f.body.x,
          f.body.y,
          f.body.z,
          f.classId
        );
      }
    }
    for (const landed of landedFighters) {
      const f = this.match.fighters.find((item) => item.id === landed.id);
      this.sound.playLanding(
        landed.id === obsId,
        landed.x,
        landed.y,
        landed.z,
        f?.classId ?? 'sword'
      );
      this.world?.effects.spawnLandingDust(landed.x, landed.y, landed.z);
    }

    if (events.length > 0) {
      this.sound.handleCombatEvents(events, this.match.fighters, obsId);
      this.world?.processCombatEvents(events, obsId);
    }
  }

  private handleOnlineSnapshot(msg: ServerSnapshotMsg): void {
    const predictLocal = !this.net.isHostSimActive();
    const stateChangedTo = this.netSync.applySnapshot(
      this.match,
      msg.snapshot,
      false,
      {
        predictLocalPlayer: predictLocal,
        rttMs: this.net.pingMs,
      }
    );
    this.netSync.applyAuthoritativeCombatEvents(
      this.match,
      msg.events,
      predictLocal
    );

    const localId = predictLocal ? this.match.localPlayerId : null;
    const footsteps = localId
      ? msg.footsteps.filter((id) => id !== localId)
      : msg.footsteps;
    const jumps = localId
      ? msg.jumps.filter((id) => id !== localId)
      : msg.jumps;
    const dodges = localId
      ? msg.dodges.filter((id) => id !== localId)
      : msg.dodges;
    const landings = localId
      ? msg.landings.filter((l) => l.id !== localId)
      : msg.landings;
    const events = localId
      ? msg.events.filter(
          (ev) =>
            !(
              ev.attackerId === localId &&
              (ev.type === 'swing' || ev.type === 'ability_cast')
            )
        )
      : msg.events;

    this.handleStateAudioAndEffects(
      stateChangedTo,
      msg.enteredFinalPhase,
      footsteps,
      jumps,
      dodges,
      landings,
      events
    );
  }

  private loop = (now: number): void => {
    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    if (this.loading) { requestAnimationFrame(this.loop); return; }

    const blocked = this.platformPaused || this.adPaused || document.hidden || !this.windowFocused;
    if (!blocked || !this.isCrazyGames) {
      const playing = (this.isCrazyGames || !blocked) && !this.match.paused &&
        (this.match.state === 'InProgress' || (!this.isCrazyGames && this.match.state === 'Countdown'));
      this.platform.setGameplay(playing);
    }
    if (blocked) {
      requestAnimationFrame(this.loop);
      return;
    }

    const camYaw = this.world ? this.world.cameraRig.yaw : this.fallbackYaw;
    if (this.match.isOnlineMatch) {
      const intent =
        this.match.paused || this.match.state === 'PlayerEliminated'
          ? createEmptyIntent(camYaw)
          : this.buildHumanIntent();
      const predictLocal = !this.net.isHostSimActive();
      const localFx = this.netSync.predictAndInterpolateFrame(
        this.match,
        dt,
        intent,
        predictLocal
      );
      const me = predictLocal ? this.match.getPlayer() : null;
      const localPose =
        me && me.isAlive
          ? {
              x: me.body.x,
              y: me.body.y,
              z: me.body.z,
              vx: me.body.vx,
              vy: me.body.vy,
              vz: me.body.vz,
              yaw: me.yaw,
              isGrounded: me.body.isGrounded,
              supportFloorY: me.body.supportFloorY,
            }
          : undefined;
      this.net.streamInputIntent(dt, intent, localPose);
      if (
        predictLocal &&
        (localFx.footstepIds.length > 0 ||
          localFx.jumpedIds.length > 0 ||
          localFx.dodgedIds.length > 0 ||
          localFx.landedFighters.length > 0 ||
          localFx.events.length > 0)
      ) {
        this.handleStateAudioAndEffects(
          null,
          false,
          localFx.footstepIds,
          localFx.jumpedIds,
          localFx.dodgedIds,
          localFx.landedFighters,
          localFx.events
        );
      }
    } else {
      const humanIntent = this.buildHumanIntent();
      const stepOut = this.match.update(dt, humanIntent);
      this.handleStateAudioAndEffects(
        stepOut.stateChangedTo,
        stepOut.enteredFinalPhase,
        stepOut.footstepFighterIds,
        stepOut.jumpedFighterIds,
        stepOut.dodgedFighterIds,
        stepOut.landedFighters,
        stepOut.events
      );
    }

    const obs = this.match.getObservedFighter();
    if (obs && this.world) {
      const camBasis = this.world.cameraRig.getHorizontalBasis();
      this.sound.updateListener(
        obs.body.x,
        obs.body.y,
        obs.body.z,
        camBasis.rightX,
        camBasis.rightZ
      );
    }

    const projectedLabels = this.world
      ? this.world.renderFrame(dt, this.match, this.settings)
      : [];

    this.syncCursorVisualClass();
    const reticleView: HudReticleViewState = {
      normX: this.pointerLocked ? RETICLE_DEFAULT_NORM_X : this.reticleNormX,
      normY: this.pointerLocked ? RETICLE_DEFAULT_NORM_Y : this.reticleNormY,
      freeCursorAim: !this.pointerLocked,
      freeLookActive: this.mmbHeld || this.freeLookToggled,
      targetName: this.latestAimResult?.targetName ?? null,
      targetHpRatio: this.latestAimResult?.targetHpRatio ?? 0,
    };
    this.ui.update(this.match, projectedLabels, this.pointerLocked, reticleView);

    requestAnimationFrame(this.loop);
  };
}

const loadingScreen = new LoadingScreen(loadSettings().language);
(window as unknown as { __knightsLoadingStarted?: boolean }).__knightsLoadingStarted = true;

async function startGame(): Promise<void> {
  let app: KnightsGameApp | undefined;
  let platformPaused = false;
  let platformLanguage: string | undefined;
  if (import.meta.env.VITE_PLATFORM === 'crazygames') {
    const crazy = new CrazyGames();
    // Ignore late initialization after a timeout: it must not attach to a running session.
    await crazy.initialize(await findCrazySdk());
    app = new KnightsGameApp(crazy, undefined, false, null, loadingScreen);
    return;
  }
  const yandex = new YandexGames((paused) => {
    platformPaused = paused;
    app?.setPlatformPause(paused);
  });
  const loader = (window as unknown as { YaGames?: YandexLoader }).YaGames;
  // Keep the game usable if a third-party SDK or account request stalls.
  const bounded = <T>(promise: Promise<T>, fallback: T): Promise<T> => new Promise(resolve => {
    const timeout = window.setTimeout(() => resolve(fallback), 10000);
    promise.then(value => { clearTimeout(timeout); resolve(value); }, () => { clearTimeout(timeout); resolve(fallback); });
  });
  await bounded(yandex.initialize(loader, language => {
    platformLanguage = language;
    if (!hasSavedLanguage()) loadingScreen.setLanguage(detectYandexLanguage(language));
  }), undefined);
  let cloud: CloudProfile | null = null;
  yandex.watchAccountSelection(
    () => cloud?.pause(),
    () => { cloud?.pause(); window.location.reload(); }
  );
  const player = await bounded(yandex.getPlayer(), undefined);
  if (player?.getUniqueID && player.getData && player.setData) {
    cloud = await CloudProfile.start(player as CloudPlayer);
  }
  app = new KnightsGameApp(yandex, platformLanguage, platformPaused, cloud, loadingScreen);
}

void startGame().catch((err: unknown) => {
  console.error('Boot error:', err);
  loadingScreen.showProblem('fatal');
  const msg = err instanceof Error ? err.message : String(err);
  const w = window as unknown as { __reportBootIssue?: (m: string) => void };
  w.__reportBootIssue?.(msg);
});
