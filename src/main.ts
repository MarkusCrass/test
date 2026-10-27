import '@fontsource/cinzel/latin-800.css';
import '@fontsource/philosopher/cyrillic-700.css';
import '@fontsource/philosopher/latin-700.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-800.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-800.css';
import './style.css';
import { KnightClassId } from './config/classes';
import { loadSettings, saveSettings } from './config/settings';
import { createEmptyIntent, FighterInputIntent } from './core/Fighter';
import { MatchManager, MatchMode, MatchState } from './core/MatchManager';
import { SoundManager } from './audio/SoundManager';
import {
  MultiplayerClient,
  ServerSnapshotMsg,
} from './net/MultiplayerClient';
import { ClientNetWorldSync } from './net/MultiplayerRoomSim';
import { WorldRenderer } from './render/WorldRenderer';
import { UIManager } from './ui/UIManager';

class KnightsGameApp {
  private settings = loadSettings();
  private readonly match = new MatchManager();
  private readonly sound = new SoundManager();
  private readonly world: WorldRenderer;
  private readonly ui: UIManager;
  private readonly net: MultiplayerClient;
  private readonly netSync = new ClientNetWorldSync();

  private readonly keysDown = new Set<string>();
  private lmbHeld = false;
  private rmbHeld = false;
  private dodgeQueued = false;
  private jumpQueued = false;
  private ability1Queued = false;
  private ability2Queued = false;

  private pointerLocked = false;
  private intentionalUnlock = false;
  private lastClientX: number | null = null;
  private lastClientY: number | null = null;

  private lastFrameTime = performance.now();
  private lastCountdownWhole = -1;
  private hitStopTimer = 0;

  constructor() {
    const canvasRoot = document.getElementById('game-canvas-root')!;
    const uiRoot = document.getElementById('ui-root')!;

    this.sound.setVolume(this.settings.masterVolume);
    this.world = new WorldRenderer(canvasRoot);
    this.world.applyGraphicsConfig(
      this.settings.pixelScale,
      this.settings.graphicsQuality
    );

    this.net = new MultiplayerClient({
      onStatusChange: (status, errText) => {
        this.ui.updateMultiplayerStatus(status, this.net.pingMs, errText);
        if (status === 'disconnected' && this.match.isOnlineMatch) {
          this.releasePointerLock();
          this.match.goToMultiplayerLobby();
          this.ui.showMultiplayerNotice(
            'Соединение с сервером прервано.',
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
        this.world.resetCameraBehindPlayer(this.match);
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
    });

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
        if (next) {
          this.world.cameraRig.snapBehindTarget(
            next.body.x,
            next.body.z,
            next.yaw,
            next.body.y
          );
        }
      },
      onSettingsChanged: (next) => {
        this.settings = { ...next };
        saveSettings(this.settings);
        this.sound.setVolume(this.settings.masterVolume);
        this.world.applyGraphicsConfig(
          this.settings.pixelScale,
          this.settings.graphicsQuality
        );
      },
      onSelectPreviewClass: (classId, userInitiated) => {
        if (userInitiated) {
          this.sound.playClassSelect(classId);
        }
        this.match.selectedPlayerClass = classId;
        this.world.syncShowcaseClass(classId);
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
    this.jumpQueued = false;
    this.ability1Queued = false;
    this.ability2Queued = false;
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
      this.world.applyGraphicsConfig(
        this.settings.pixelScale,
        this.settings.graphicsQuality
      );
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      const wasLocked = this.pointerLocked;
      this.pointerLocked = locked;

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

      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) {
          this.keysDown.add('Tab');
          this.releasePointerLock();
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
          this.match.state !== 'PlayerEliminated'
        ) {
          this.requestPointerLockSafe();
        }
        return;
      }
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.clearActionInputs();
    });

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
      } else {
        if (this.lastClientX !== null && this.lastClientY !== null) {
          dx = e.clientX - this.lastClientX;
          dy = e.clientY - this.lastClientY;
        }
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
      }

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
    intent.hasAimOverride = true;
    intent.sprint =
      this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
    intent.attackHeld = this.lmbHeld;
    intent.blockHeld = this.rmbHeld;
    intent.dodgePressed = this.dodgeQueued;
    intent.jumpPressed = this.jumpQueued;
    intent.ability1Pressed = this.ability1Queued;
    intent.ability2Pressed = this.ability2Queued;
    this.dodgeQueued = false;
    this.jumpQueued = false;
    this.ability1Queued = false;
    this.ability2Queued = false;

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
      this.world.effects.spawnLandingDust(landed.x, landed.y, landed.z);
    }

    if (events.length > 0) {
      this.sound.handleCombatEvents(events, this.match.fighters, obsId);
      this.world.processCombatEvents(events, obsId);

      for (const ev of events) {
        if (
          (ev.attackerId === obsId || ev.victimId === obsId) &&
          (ev.type === 'heavy_hit' ||
            ev.type === 'parried' ||
            ev.type === 'guard_broken')
        ) {
          this.hitStopTimer = 0.032;
          break;
        }
      }
    }
  }

  private handleOnlineSnapshot(msg: ServerSnapshotMsg): void {
    const stateChangedTo = this.netSync.applySnapshot(this.match, msg.snapshot);
    this.handleStateAudioAndEffects(
      stateChangedTo,
      msg.enteredFinalPhase,
      msg.footsteps,
      msg.jumps,
      msg.dodges,
      msg.landings,
      msg.events
    );
  }

  private loop = (now: number): void => {
    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
      const projected = this.world.renderFrame(
        dt * 0.15,
        this.match,
        this.settings
      );
      this.ui.update(this.match, projected, this.pointerLocked);
      requestAnimationFrame(this.loop);
      return;
    }

    if (this.match.isOnlineMatch) {
      const intent =
        this.match.paused || this.match.state === 'PlayerEliminated'
          ? createEmptyIntent(this.world.cameraRig.yaw)
          : this.buildHumanIntent();
      this.net.streamInputIntent(dt, intent);
      this.netSync.interpolateFrame(this.match, dt);
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
    if (obs) {
      const camBasis = this.world.cameraRig.getHorizontalBasis();
      this.sound.updateListener(
        obs.body.x,
        obs.body.y,
        obs.body.z,
        camBasis.rightX,
        camBasis.rightZ
      );
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
