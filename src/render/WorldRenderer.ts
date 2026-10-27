import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ARENA_CONFIG } from '../config/arenaConfig';
import { KnightClassId } from '../config/classes';
import { GameSettings, GraphicsQuality } from '../config/settings';
import { CombatEvent } from '../core/CombatSystem';
import { MatchManager } from '../core/MatchManager';
import { ArenaBuilder } from './ArenaBuilder';
import { CameraRig } from './CameraRig';
import { dungeonAssets } from './DungeonAssetCache';
import { EffectsManager } from './EffectsManager';
import { kayKitAssets } from './KayKitAssetCache';
import { KnightVisualRig } from './KnightMesh';
import { MaterialLibrary } from './PixelTextures';
import { SkyAndAtmosphere } from './SkyAndAtmosphere';

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

const CINEMATIC_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.24 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Gentle corner vignette & subtle golden-hour warmth in linear HDR space
      col *= vec3(1.02, 1.0, 0.98);
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered);
      col *= 1.0 - distSq * uVignette * 1.45;

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

/**
 * High-Fidelity Stylized 3D World Renderer for KNIGHTS: LAST STANDING.
 * Combines GLSL Golden-Hour Sky, PMREM IBL Environment Reflections, Normal-Mapped Masonry & Steel,
 * 2048px Soft Shadows, Rim Backlighting, 3D Weapon Ribbon Trails, and HDR Post-Processing.
 */
export class WorldRenderer {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly cameraRig: CameraRig;
  public readonly materials: MaterialLibrary;
  public readonly sky: SkyAndAtmosphere;
  public readonly arenaBuilder: ArenaBuilder;
  public readonly effects: EffectsManager;

  private sunLight!: THREE.DirectionalLight;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private readonly fightersGroup = new THREE.Group();
  private readonly trailsGroup = new THREE.Group();
  private readonly rigs = new Map<string, KnightVisualRig>();
  private renderedGeneration = -1;

  // Dedicated 3D Showcase Knight on sunlit stone pedestal for Class Selection screen
  private readonly showcaseGroup = new THREE.Group();
  private showcaseRig: KnightVisualRig | null = null;
  private showcaseClassId: KnightClassId | null = null;
  private readonly showcasePos = new THREE.Vector3(0, 0.24, 12.2);

  private totalElapsed = 0;
  private currentPixelScale: 1 | 2 | 3 = 1;
  private currentQuality: GraphicsQuality = 'ultra';

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc49c74, 0.0052);

    this.cameraRig = new CameraRig(
      window.innerWidth / Math.max(1, window.innerHeight)
    );

    const sunPos = new THREE.Vector3(24, 34, 18);
    this.setupLighting(sunPos);

    this.sky = new SkyAndAtmosphere(sunPos);
    this.scene.add(this.sky.group);

    // Apply procedural IBL environment map for authentic metallic armor & weapon sheen
    const envTex = this.sky.generateEnvironmentMap(this.renderer);
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.85;

    this.materials = new MaterialLibrary();
    this.arenaBuilder = new ArenaBuilder(ARENA_CONFIG, this.materials);
    this.scene.add(this.arenaBuilder.group);

    this.scene.add(this.fightersGroup);
    this.scene.add(this.trailsGroup);

    this.effects = new EffectsManager(this.materials.crackDecalTex);
    this.scene.add(this.effects.group);

    this.buildShowcasePedestal();
    this.rebuildPostProcessing(1, 'ultra');

    // Start preloading official CC0 KayKit rigged .glb knight & dungeon models immediately
    kayKitAssets.preload().catch((err) => {
      console.error('KayKit character preload error:', err);
    });
    dungeonAssets.preload().catch((err) => {
      console.error('KayKit dungeon preload error:', err);
    });
  }

  private setupLighting(sunPos: THREE.Vector3): void {
    // Sky-to-stone hemisphere fill
    const hemi = new THREE.HemisphereLight(0xcbe2ff, 0x615244, 0.88);
    this.scene.add(hemi);

    // Golden-hour main directional sun with crisp 2048px shadows across the 44x44m 2-tier citadel
    this.sunLight = new THREE.DirectionalLight(0xffe9c4, 2.35);
    this.sunLight.position.copy(sunPos);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 4;
    this.sunLight.shadow.camera.far = 96;
    const d = 27.5;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);

    // Cool azure rim backlight from opposite side so dark graphite armor silhouettes pop!
    const rimLight = new THREE.DirectionalLight(0x7cb8ff, 0.85);
    rimLight.position.set(-14, 11, -13);
    this.scene.add(rimLight);
  }

  private buildShowcasePedestal(): void {
    this.showcaseGroup.position.copy(this.showcasePos);

    const pedBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.32, 0.2, 16),
      this.materials.curbStoneMat
    );
    pedBase.position.y = -0.14;
    pedBase.receiveShadow = true;
    pedBase.castShadow = true;
    this.showcaseGroup.add(pedBase);

    const pedTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.02, 1.08, 0.08, 16),
      this.materials.pillarMat
    );
    pedTop.position.y = -0.02;
    pedTop.receiveShadow = true;
    this.showcaseGroup.add(pedTop);

    const goldRing = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 0.96, 24),
      this.materials.bronzeTrimMat
    );
    goldRing.rotateX(-Math.PI / 2);
    goldRing.position.y = 0.024;
    this.showcaseGroup.add(goldRing);

    // Dedicated warm key spotlight on showcase knight
    const keyLight = new THREE.PointLight(0xffe6ba, 6.0, 7.5, 1.4);
    keyLight.position.set(-1.3, 2.6, 2.2);
    this.showcaseGroup.add(keyLight);

    this.showcaseGroup.visible = false;
    this.scene.add(this.showcaseGroup);
  }

  public applyGraphicsConfig(
    pixelScale: 1 | 2 | 3,
    quality: GraphicsQuality
  ): void {
    this.currentPixelScale = pixelScale;
    this.currentQuality = quality;

    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.cameraRig.setAspect(w / h);

    this.sky.setMotesVisible(quality !== 'low');
    this.sunLight.castShadow = quality !== 'low';

    const maxDpr =
      quality === 'ultra' ? 2 : quality === 'high' ? 1.5 : 1;
    const dpr = pixelScale === 1 ? Math.min(window.devicePixelRatio || 1, maxDpr) : 1;

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, true);
    this.renderer.domElement.style.imageRendering =
      pixelScale > 1 ? 'pixelated' : 'auto';

    this.rebuildPostProcessing(pixelScale, quality);
  }

  public handleResize(
    pixelScale: 1 | 2 | 3 = this.currentPixelScale,
    quality: GraphicsQuality = this.currentQuality
  ): void {
    this.applyGraphicsConfig(pixelScale, quality);
  }

  private rebuildPostProcessing(
    pixelScale: 1 | 2 | 3,
    quality: GraphicsQuality
  ): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
    }

    if (quality === 'low' && pixelScale === 1) {
      // Direct single-pass WebGL render for maximum FPS on low-spec hardware
      return;
    }

    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = this.renderer.getPixelRatio();

    const rt = new THREE.WebGLRenderTarget(
      Math.floor(w * dpr),
      Math.floor(h * dpr),
      {
        type: THREE.HalfFloatType,
        samples:
          this.renderer.capabilities.isWebGL2 &&
          pixelScale === 1 &&
          quality === 'ultra'
            ? 4
            : 0,
      }
    );

    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);

    if (pixelScale > 1) {
      // Genuine depth/normal edge-aware 3D pixelation pass!
      const pixPass = new RenderPixelatedPass(
        pixelScale * 2,
        this.scene,
        this.cameraRig.camera,
        {
          normalEdgeStrength: 0.28,
          depthEdgeStrength: 0.35,
        }
      );
      this.composer.addPass(pixPass);
    } else {
      const renderPass = new RenderPass(this.scene, this.cameraRig.camera);
      this.composer.addPass(renderPass);
    }

    if (quality === 'ultra' || quality === 'high') {
      // Selective HDR Bloom: high threshold ensures zero screen haze — only flames & sparks glow!
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(w, h),
        quality === 'ultra' ? 0.32 : 0.22,
        0.42,
        0.96
      );
      this.composer.addPass(this.bloomPass);
    }

    const gradePass = new ShaderPass(CINEMATIC_GRADE_SHADER);
    this.composer.addPass(gradePass);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
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
    if (
      settings.pixelScale !== this.currentPixelScale ||
      settings.graphicsQuality !== this.currentQuality
    ) {
      this.applyGraphicsConfig(settings.pixelScale, settings.graphicsQuality);
    }

    this.totalElapsed += dt;
    this.sky.update(dt, this.totalElapsed);
    this.arenaBuilder.update(this.totalElapsed, match.isFinalPhase);

    if (match.state === 'MainMenu') {
      this.showcaseGroup.visible = false;
      this.fightersGroup.visible = false;
      this.trailsGroup.visible = false;
      this.effects.debugGroup.visible = false;
      this.cameraRig.updateMenuOrbit(this.totalElapsed);
      this.drawFinal();
      return [];
    }

    if (match.state === 'CharacterSelection') {
      this.fightersGroup.visible = false;
      this.trailsGroup.visible = false;
      this.effects.debugGroup.visible = false;
      this.showcaseGroup.visible = true;
      this.syncShowcaseClass(match.selectedPlayerClass);
      if (this.showcaseRig) {
        this.showcaseRig.updatePreviewIdle(this.totalElapsed);
        this.showcaseRig.root.rotation.y =
          Math.sin(this.totalElapsed * 0.72) * 0.92 + 0.22;
      }
      this.cameraRig.updateShowcaseCamera(
        this.showcasePos.x,
        this.showcasePos.z
      );
      this.drawFinal();
      return [];
    }

    // Active Match / Countdown / Spectator / Finished
    this.showcaseGroup.visible = false;
    this.fightersGroup.visible = true;
    this.trailsGroup.visible = true;

    this.syncFighterMeshes(match);

    const observed = match.getObservedFighter();
    if (observed) {
      this.cameraRig.updateGameplay(
        dt,
        observed.body.x,
        observed.body.z,
        match.arena,
        observed.body.y
      );
    }

    this.effects.update(
      dt,
      match.fighters,
      settings.debugHitboxes && match.state !== 'MatchFinished'
    );

    this.drawFinal();
    return this.projectLabels(match, settings.debugHitboxes);
  }

  private drawFinal(): void {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.cameraRig.camera);
    }
  }

  public resetCameraBehindPlayer(match: MatchManager): void {
    const p = match.getPlayer();
    if (p) {
      this.cameraRig.snapBehindTarget(p.body.x, p.body.z, p.yaw, p.body.y);
    }
  }

  private syncFighterMeshes(match: MatchManager): void {
    if (this.renderedGeneration !== match.matchGeneration) {
      for (const rig of this.rigs.values()) {
        this.fightersGroup.remove(rig.root);
        this.trailsGroup.remove(rig.trail.mesh);
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
        this.trailsGroup.add(rig.trail.mesh);
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
      tempV.set(f.body.x, f.body.y + 2.42, f.body.z);
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
