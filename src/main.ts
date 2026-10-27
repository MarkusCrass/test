import './style.css';
import { KnightClassId } from './config/classes';
import { loadSettings, saveSettings } from './config/settings';
import { createEmptyIntent, FighterInputIntent } from './core/Fighter';
import { MatchManager, MatchMode } from './core/MatchManager';
import { SoundManager } from './audio/SoundManager';
import { WorldRenderer } from './render/WorldRenderer';
import { UIManager } from './ui/UIManager';

class KnightsGameApp {
  private settings = loadSettings();
  private readonly match = new MatchManager();
  private readonly sound = new SoundManager();
  private readonly world: WorldRenderer;
  private readonly ui: UIManager;

  private readonly keysDown = new Set<string>();
  private lmbHeld = false;
  private rmbHeld = false;
  private dodgeQueued = false;

  private pointerLocked = false;
  private intentionalUnlock = false;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;

  private lastFrameTime = performance.now();
  private lastCountdownWhole = -1;

  constructor() {
    const canvasRoot = document.getElementById('game-canvas-root')!;
    const uiRoot = document.getElementById('ui-root')!;

    this.sound.setVolume(this.settings.masterVolume);
    this.world = new WorldRenderer(canvasRoot);
    this.world.handleResize(this.settings.pixelScale);

    this.ui = new UIManager(uiRoot, this.settings, {
      onOpenSelection: () => {
        this.sound.unlock();
        this.releasePointerLock();
        this.match.goToCharacterSelection();
      },
      onStartMatch: (classId: KnightClassId, mode: MatchMode) => {
        this.sound.unlock();
        this.beginMatch(classId, mode);
      },
      onRestartMatch: () => {
        this.sound.unlock();
        this.beginMatch(this.match.selectedPlayerClass, this.match.mode);
      },
      onReturnMainMenu: () => {
        this.releasePointerLock();
        this.match.goToMainMenu();
      },
      onResumeGame: () => {
        this.match.paused = false;
        this.requestPointerLockSafe();
      },
      onCycleSpectator: (delta) => {
        const next = this.match.cycleSpectatorTarget(delta);
        if (next) {
          this.world.cameraRig.snapBehindTarget(
            next.body.x,
            next.body.z,
            next.yaw
          );
        }
      },
      onSettingsChanged: (next) => {
        this.settings = { ...next };
        saveSettings(this.settings);
        this.sound.setVolume(this.settings.masterVolume);
        this.world.handleResize(this.settings.pixelScale);
      },
      onSelectPreviewClass: (classId) => {
        this.match.selectedPlayerClass = classId;
        this.world.syncShowcaseClass(classId);
      },
    });

    this.setupInputListeners();
    requestAnimationFrame(this.loop);
  }

  private beginMatch(classId: KnightClassId, mode: MatchMode): void {
    this.clearActionInputs();
    this.match.startMatch(classId, mode);
    this.lastCountdownWhole = Math.ceil(this.match.countdownTimer);
    this.sound.playCountdownTick(false);
    this.world.resetCameraBehindPlayer(this.match);
    this.requestPointerLockSafe();
  }

  private clearActionInputs(): void {
    this.keysDown.clear();
    this.lmbHeld = false;
    this.rmbHeld = false;
    this.dodgeQueued = false;
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
    const canvas = this.world.renderer.domElement;
    if (document.pointerLockElement === canvas) return;
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

  private setupInputListeners(): void {
    const canvas = this.world.renderer.domElement;

    window.addEventListener('resize', () => {
      this.world.handleResize(this.settings.pixelScale);
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      const wasLocked = this.pointerLocked;
      this.pointerLocked = locked;

      // Browser exits pointer lock on Escape press before keydown fires:
      // automatically open Pause menu unless we unlocked intentionally!
      if (
        wasLocked &&
        !locked &&
        !this.intentionalUnlock &&
        (this.match.state === 'Countdown' ||
          this.match.state === 'InProgress' ||
          this.match.state === 'PlayerEliminated') &&
        !this.match.paused
      ) {
        this.match.paused = true;
        this.clearActionInputs();
      }
      this.intentionalUnlock = false;
    });

    window.addEventListener('keydown', (e) => {
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

      if (this.match.state === 'PlayerEliminated') {
        if (e.code === 'KeyQ') {
          this.match.cycleSpectatorTarget(-1);
        } else if (e.code === 'KeyE') {
          this.match.cycleSpectatorTarget(1);
        }
      }

      this.keysDown.add(e.code);
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.dodgeQueued = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.clearActionInputs();
    });

    // Mouse buttons on canvas
    canvas.addEventListener('mousedown', (e) => {
      this.sound.unlock();
      if (!this.isCombatInteractive()) return;

      if (!this.pointerLocked && this.match.state !== 'PlayerEliminated') {
        this.requestPointerLockSafe();
      }

      if (e.button === 0) {
        this.lmbHeld = true;
      } else if (e.button === 2) {
        this.rmbHeld = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.lmbHeld = false;
      } else if (e.button === 2) {
        this.rmbHeld = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isCombatInteractive()) {
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
        return;
      }

      let dx = 0;
      let dy = 0;
      if (this.pointerLocked) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      } else {
        // Smooth fallback camera rotation if pointer lock isn't active in iframe
        if (this.lastClientX !== null && this.lastClientY !== null) {
          dx = e.clientX - this.lastClientX;
          dy = e.clientY - this.lastClientY;
        }
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
      }

      // Guard against occasional browser pointer-lock jump spikes
      if (Math.abs(dx) < 280 && Math.abs(dy) < 280) {
        this.world.cameraRig.applyMouseDelta(
          dx,
          dy,
          this.settings.mouseSensitivity
        );
      }
    });
  }

  private buildHumanIntent(): FighterInputIntent {
    const camYaw = this.world.cameraRig.yaw;
    const intent = createEmptyIntent(camYaw);

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

    const basis = this.world.cameraRig.getHorizontalBasis();
    let wx = basis.fwdX * forwardInput + basis.rightX * rightInput;
    let wz = basis.fwdZ * forwardInput + basis.rightZ * rightInput;
    const len = Math.hypot(wx, wz);
    if (len > 1e-4) {
      wx /= len;
      wz /= len;
    }

    intent.moveX = wx;
    intent.moveZ = wz;
    intent.aimYaw = camYaw;
    intent.hasAimOverride = true; // Attacks & blocks align toward camera view direction
    intent.sprint =
      this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
    intent.attackHeld = this.lmbHeld;
    intent.blockHeld = this.rmbHeld;
    intent.dodgePressed = this.dodgeQueued;
    this.dodgeQueued = false;

    return intent;
  }

  private loop = (now: number): void => {
    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    const humanIntent = this.buildHumanIntent();
    const stepOut = this.match.update(dt, humanIntent);

    // Countdown audio ticks
    if (this.match.state === 'Countdown') {
      const whole = Math.ceil(this.match.countdownTimer);
      if (whole !== this.lastCountdownWhole && whole > 0) {
        this.lastCountdownWhole = whole;
        this.sound.playCountdownTick(false);
      }
    }
    if (stepOut.stateChangedTo === 'InProgress') {
      this.sound.playCountdownTick(true);
    } else if (stepOut.stateChangedTo === 'MatchFinished') {
      this.releasePointerLock();
      const player = this.match.getPlayer();
      this.sound.playMatchEnd(
        Boolean(player && this.match.winnerId === player.id)
      );
    } else if (stepOut.stateChangedTo === 'PlayerEliminated') {
      // Allow comfortable mouse buttons on spectator controls
      this.releasePointerLock();
    }

    // Footstep & combat audio + 3D effects
    for (const fid of stepOut.footstepFighterIds) {
      this.sound.playFootstep(fid === 'player');
    }
    if (stepOut.events.length > 0) {
      this.sound.handleCombatEvents(stepOut.events);
      const obs = this.match.getObservedFighter();
      this.world.processCombatEvents(stepOut.events, obs ? obs.id : null);
    }

    const projectedLabels = this.world.renderFrame(
      dt,
      this.match,
      this.settings
    );
    this.ui.update(this.match, projectedLabels, this.pointerLocked);

    requestAnimationFrame(this.loop);
  };
}

new KnightsGameApp();
