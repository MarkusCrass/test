import * as THREE from 'three';
import { ARENA_CONFIG } from '../config/arenaConfig';
import { KnightClassId } from '../config/classes';
import { GameSettings } from '../config/settings';
import { CombatEvent } from '../core/CombatSystem';
import { MatchManager } from '../core/MatchManager';
import { ArenaBuilder } from './ArenaBuilder';
import { CameraRig } from './CameraRig';
import { EffectsManager } from './EffectsManager';
import { KnightVisualRig } from './KnightMesh';
import { MaterialLibrary } from './PixelTextures';

export interface ProjectedFighterLabel {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  isHuman: boolean;
  aiStateLabel: string | null;
  screenX: number;
  screenY: number;
  visible: boolean;
}

const BOT_CLOTH_ACCENTS = [0xc93838, 0x2979c9, 0xd99b26, 0x2f8f4e, 0xa843c9];

/**
 * Top-level 3D World Renderer for KNIGHTS: LAST STANDING.
 * Maintains consistent stylized lighting, shadows, arena geometry, character rigs,
 * 3D character selection showcase, and optional retro pixel scale.
 */
export class WorldRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly cameraRig: CameraRig;
  public readonly materials: MaterialLibrary;
  public readonly arenaBuilder: ArenaBuilder;
  public readonly effects: EffectsManager;

  private readonly fightersGroup = new THREE.Group();
  private readonly rigs = new Map<string, KnightVisualRig>();
  private renderedGeneration = -1;

  // Dedicated 3D Showcase Knight on a stone pedestal for Class Selection screen
  private readonly showcaseGroup = new THREE.Group();
  private showcaseRig: KnightVisualRig | null = null;
  private showcaseClassId: KnightClassId | null = null;
  private readonly showcasePos = new THREE.Vector3(0, 0.2, 4.2);

  private totalElapsed = 0;
  private currentPixelScale = 1;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x88a8c7);
    this.scene.fog = new THREE.Fog(0x88a8c7, 26, 62);

    this.cameraRig = new THREE.PerspectiveCamera
      ? new CameraRig(window.innerWidth / Math.max(1, window.innerHeight))
      : new CameraRig(1.6);

    this.setupLighting();

    this.materials = new MaterialLibrary();
    this.arenaBuilder = new ArenaBuilder(ARENA_CONFIG, this.materials);
    this.scene.add(this.arenaBuilder.group);

    this.scene.add(this.fightersGroup);

    this.effects = new EffectsManager();
    this.scene.add(this.effects.group);

    // Setup Selection Pedestal
    this.showcaseGroup.position.copy(this.showcasePos);
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.24, 12),
      this.materials.curbStoneMat
    );
    ped.position.y = -0.12;
    ped.receiveShadow = true;
    ped.castShadow = true;
    this.showcaseGroup.add(ped);
    this.showcaseGroup.visible = false;
    this.scene.add(this.showcaseGroup);

    this.handleResize(1);
  }

  private setupLighting(): void {
    // Crisp sky/ground hemisphere fill so dark armor silhouettes remain readable
    const hemi = new THREE.HemisphereLight(0xd9ecff, 0x524c44, 1.05);
    this.scene.add(hemi);

    // Main stylized sunlight casting expressive medieval courtyard shadows
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.05);
    sun.position.set(13, 22, 11);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 55;
    const d = 17;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun);
  }

  public handleResize(pixelScale: 1 | 2 | 3): void {
    this.currentPixelScale = pixelScale;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.cameraRig.setAspect(w / h);

    if (pixelScale === 1) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(w, h, true);
      this.renderer.domElement.style.imageRendering = 'auto';
    } else {
      // Optional crisp integer downscale without anti-aliasing blur
      this.renderer.setPixelRatio(1);
      const rw = Math.max(320, Math.floor(w / pixelScale));
      const rh = Math.max(200, Math.floor(h / pixelScale));
      this.renderer.setSize(rw, rh, false);
      this.renderer.domElement.style.width = `${w}px`;
      this.renderer.domElement.style.height = `${h}px`;
      this.renderer.domElement.style.imageRendering = 'pixelated';
    }
  }

  public syncShowcaseClass(classId: KnightClassId): void {
    if (this.showcaseClassId === classId && this.showcaseRig) return;
    if (this.showcaseRig) {
      this.showcaseGroup.remove(this.showcaseRig.root);
    }
    this.showcaseClassId = classId;
    this.showcaseRig = new KnightVisualRig(classId, this.materials, {
      isHuman: true,
      isPreview: true,
    });
    this.showcaseGroup.add(this.showcaseRig.root);
  }

  public processCombatEvents(
    events: CombatEvent[],
    observedFighterId: string | null
  ): void {
    for (const ev of events) {
      this.effects.spawnFromEvent(ev);

      // Moderate camera shake when player deals or receives impactful strikes
      const involvesObserved =
        ev.attackerId === observedFighterId || ev.victimId === observedFighterId;
      if (involvesObserved) {
        if (ev.type === 'heavy_hit' || ev.type === 'ground_slam') {
          this.cameraRig.addShake(0.62);
        } else if (ev.type === 'parried' || ev.type === 'guard_broken') {
          this.cameraRig.addShake(0.55);
        } else if (ev.type === 'hit' || ev.type === 'blocked') {
          this.cameraRig.addShake(0.28);
        }
      } else if (ev.type === 'ground_slam') {
        this.cameraRig.addShake(0.2);
      }
    }
  }

  public renderFrame(
    dt: number,
    match: MatchManager,
    settings: GameSettings
  ): ProjectedFighterLabel[] {
    if (settings.pixelScale !== this.currentPixelScale) {
      this.handleResize(settings.pixelScale);
    }

    this.totalElapsed += dt;
    this.arenaBuilder.update(this.totalElapsed, match.isFinalPhase);

    if (match.state === 'MainMenu') {
      this.showcaseGroup.visible = false;
      this.fightersGroup.visible = false;
      this.effects.debugGroup.visible = false;
      this.cameraRig.updateMenuOrbit(this.totalElapsed);
      this.renderer.render(this.scene, this.cameraRig.camera);
      return [];
    }

    if (match.state === 'CharacterSelection') {
      this.fightersGroup.visible = false;
      this.effects.debugGroup.visible = false;
      this.showcaseGroup.visible = true;
      this.syncShowcaseClass(match.selectedPlayerClass);
      if (this.showcaseRig) {
        this.showcaseRig.updatePreviewIdle(this.totalElapsed);
        // Gentle turntable rotation so user sees cape, shield, helmet & weapon clearly!
        this.showcaseRig.root.rotation.y =
          Math.sin(this.totalElapsed * 0.85) * 0.55 + 0.25;
      }
      this.cameraRig.updateShowcaseCamera(
        this.showcasePos.x,
        this.showcasePos.z
      );
      this.renderer.render(this.scene, this.cameraRig.camera);
      return [];
    }

    // Active Match / Countdown / Spectator / Finished
    this.showcaseGroup.visible = false;
    this.fightersGroup.visible = true;

    this.syncFighterMeshes(match);

    const observed = match.getObservedFighter();
    if (observed) {
      this.cameraRig.updateGameplay(
        dt,
        observed.body.x,
        observed.body.z,
        match.arena
      );
    }

    this.effects.update(
      dt,
      match.fighters,
      settings.debugHitboxes && match.state !== 'MatchFinished'
    );

    this.renderer.render(this.scene, this.cameraRig.camera);
    return this.projectLabels(match, settings.debugHitboxes);
  }

  public resetCameraBehindPlayer(match: MatchManager): void {
    const p = match.getPlayer();
    if (p) {
      this.cameraRig.snapBehindTarget(p.body.x, p.body.z, p.yaw);
    }
  }

  private syncFighterMeshes(match: MatchManager): void {
    if (this.renderedGeneration !== match.matchGeneration) {
      // Cleanly rebuild fighter meshes on new match start / restart
      for (const rig of this.rigs.values()) {
        this.fightersGroup.remove(rig.root);
      }
      this.rigs.clear();
      this.effects.clearAll();
      this.renderedGeneration = match.matchGeneration;

      match.fighters.forEach((f, idx) => {
        const clothOverride = f.isHuman
          ? undefined
          : BOT_CLOTH_ACCENTS[idx % BOT_CLOTH_ACCENTS.length];
        const rig = new KnightVisualRig(f.classId, this.materials, {
          clothOverride,
          isHuman: f.isHuman,
        });
        this.fightersGroup.add(rig.root);
        this.rigs.set(f.id, rig);
      });
    }

    for (const f of match.fighters) {
      const rig = this.rigs.get(f.id);
      if (rig) {
        rig.syncFromFighter(f);
      }
    }
  }

  private projectLabels(
    match: MatchManager,
    showDebugAI: boolean
  ): ProjectedFighterLabel[] {
    const out: ProjectedFighterLabel[] = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tempV = new THREE.Vector3();

    for (const f of match.fighters) {
      if (!f.isAlive || f.isHuman) continue;
      tempV.set(f.body.x, 2.38, f.body.z);
      tempV.project(this.cameraRig.camera);

      const inFront = tempV.z >= -1 && tempV.z <= 1;
      const sx = (tempV.x * 0.5 + 0.5) * w;
      const sy = (-tempV.y * 0.5 + 0.5) * h;

      const bot = match.bots.get(f.id);
      out.push({
        id: f.id,
        name: f.displayName,
        hp: f.hp,
        maxHp: f.maxHp,
        isAlive: f.isAlive,
        isHuman: f.isHuman,
        aiStateLabel: showDebugAI && bot ? `${bot.aiState} / ${f.state}` : null,
        screenX: sx,
        screenY: sy,
        visible: inFront && sx > -60 && sx < w + 60 && sy > -40 && sy < h + 40,
      });
    }

    return out;
  }
}
