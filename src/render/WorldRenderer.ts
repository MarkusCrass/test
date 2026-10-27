import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ARENA_CONFIG } from '../config/arenaConfig';
import { KnightClassId } from '../config/classes';
import { GameSettings, GraphicsQuality } from '../config/settings';
import { CombatEvent } from '../core/CombatSystem';
import { MatchManager } from '../core/MatchManager';
import { ArenaBuilder } from './ArenaBuilder';
import { CameraRig } from './CameraRig';
import { EffectsManager } from './EffectsManager';
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

const BOT_CLOTH_ACCENTS = [0xc93838, 0x2c7ac9, 0xd99b26, 0x2f8f5b, 0x9b4bc4];

const CINEMATIC_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.14 },
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

      // Subtle sunlit warmth & gentle framing without darkening shadows
      col *= vec3(1.02, 1.01, 0.99);
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered);
      col *= 1.0 - distSq * uVignette * 1.1;

      gl_FragColor = vec4(col, texel.a);
    }
  `,
};

/**
 * Crisp Low-Poly Pixel-Art & Stylized 3D World Renderer for KNIGHTS: LAST STANDING.
 * Renders flat-shaded Blockbench-style knights with NearestFilter pixel-art faces, tunics & weapons
 * at authentic integer pixel resolution (2x default, matching the reference pixel-art look) or HD.
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
  private readonly showcasePos = new THREE.Vector3(0, 0.24, 4.2);

  private totalElapsed = 0;
  private currentPixelScale: 1 | 2 | 3 = 2;
  private currentQuality: GraphicsQuality = 'ultra';

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc4ded0, 0.0062);

    this.cameraRig = new CameraRig(
      window.innerWidth / Math.max(1, window.innerHeight)
    );

    const sunPos = new THREE.Vector3(14, 22, 13);
    this.setupLighting(sunPos);

    this.sky = new SkyAndAtmosphere(sunPos);
    this.scene.add(this.sky.group);

    const envTex = this.sky.generateEnvironmentMap(this.renderer);
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.35;

    this.materials = new MaterialLibrary();
    this.arenaBuilder = new ArenaBuilder(ARENA_CONFIG, this.materials);
    this.scene.add(this.arenaBuilder.group);

    this.scene.add(this.fightersGroup);
    this.scene.add(this.trailsGroup);

    this.effects = new EffectsManager(this.materials.crackDecalTex);
    this.scene.add(this.effects.group);

    this.buildShowcasePedestal();
    this.applyGraphicsConfig(2, 'ultra');
  }

  private setupLighting(sunPos: THREE.Vector3): void {
    // Clean, bright pastel sky-to-stone bounce fill so shadow facets stay colorful & readable (like reference!)
    const hemi = new THREE.HemisphereLight(0xfff9ec, 0x8ba2b5, 1.32);
    this.scene.add(hemi);

    // Warm sunlit key light with crisp pixel-clean shadows
    this.sunLight = new THREE.DirectionalLight(0xfff1d4, 2.02);
    this.sunLight.position.copy(sunPos);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 58;
    const d = 17.5;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);

    // Subtle cool sky rim light from behind
    const rimLight = new THREE.DirectionalLight(0xaad8ff, 0.58);
    rimLight.position.set(-14, 11, -13);
    this.scene.add(rimLight);
  }

  private buildShowcasePedestal(): void {
    this.showcaseGroup.position.copy(this.showcasePos);

    const pedBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.12, 1.26, 0.2, 10),
      this.materials.curbStoneMat
    );
    pedBase.position.y = -0.14;
    pedBase.receiveShadow = true;
    pedBase.castShadow = true;
    this.showcaseGroup.add(pedBase);

    const pedTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.98, 1.04, 0.08, 10),
      this.materials.pillarMat
    );
    pedTop.position.y = -0.02;
    pedTop.receiveShadow = true;
    this.showcaseGroup.add(pedTop);

    const goldRing = new THREE.Mesh(
      new THREE.RingGeometry(0.84, 0.93, 12),
      this.materials.bronzeTrimMat
    );
    goldRing.rotateX(-Math.PI / 2);
    goldRing.position.y = 0.024;
    this.showcaseGroup.add(goldRing);

    // Soft warm front key fill on showcase character
    const keyLight = new THREE.PointLight(0xfff2d6, 3.8, 7.5, 1.4);
    keyLight.position.set(-1.2, 2.4, 2.3);
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
    this.renderer.shadowMap.type =
      pixelScale > 1 ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;

    if (pixelScale > 1) {
      // Authentic crisp integer pixel-art rendering (2x = reference-grade fine pixel art, 3x = chunky retro)
      const step = pixelScale === 2 ? 2 : 3;
      const rw = Math.max(160, Math.floor(w / step));
      const rh = Math.max(90, Math.floor(h / step));

      this.renderer.setPixelRatio(1);
      this.renderer.setSize(rw, rh, false);
      this.renderer.domElement.style.width = `${w}px`;
      this.renderer.domElement.style.height = `${h}px`;
      this.renderer.domElement.style.imageRendering = 'pixelated';

      this.rebuildPostProcessing(pixelScale, quality, rw, rh);
    } else {
      const maxDpr = quality === 'ultra' ? 2 : quality === 'high' ? 1.5 : 1;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, true);
      this.renderer.domElement.style.imageRendering = 'auto';

      this.rebuildPostProcessing(pixelScale, quality, w, h);
    }
  }

  public handleResize(
    pixelScale: 1 | 2 | 3 = this.currentPixelScale,
    quality: GraphicsQuality = this.currentQuality
  ): void {
    this.applyGraphicsConfig(pixelScale, quality);
  }

  private rebuildPostProcessing(
    pixelScale: 1 | 2 | 3,
    quality: GraphicsQuality,
    rw: number,
    rh: number
  ): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloomPass = null;
    }

    if (quality === 'low' || pixelScale > 1) {
      // In pixel-art mode (pixelScale 2 or 3) or low quality, render directly to the un-antialiased
      // low-res WebGL framebuffer so every pixel edge is 100% razor-sharp with zero bloom blur!
      return;
    }

    const dpr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(
      Math.floor(rw * dpr),
      Math.floor(rh * dpr),
      {
        type: THREE.HalfFloatType,
        samples:
          this.renderer.capabilities.isWebGL2 && quality === 'ultra' ? 4 : 0,
      }
    );

    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(rw, rh);

    const renderPass = new RenderPass(this.scene, this.cameraRig.camera);
    this.composer.addPass(renderPass);

    if (quality === 'ultra' || quality === 'high') {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(rw, rh),
        quality === 'ultra' ? 0.26 : 0.18,
        0.4,
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
        // Gentle 3/4 turn arc (like reference angle!) so face, eyes, hair, boots & weapon shine!
        this.showcaseRig.root.rotation.y =
          Math.sin(this.totalElapsed * 0.72) * 0.58 + 0.34;
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
        match.arena
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
      this.cameraRig.snapBehindTarget(p.body.x, p.body.z, p.yaw);
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
