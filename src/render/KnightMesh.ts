import * as THREE from 'three';
import {
  AttackAnimStyle,
  KNIGHT_CLASSES,
  KnightClassConfig,
  KnightClassId,
} from '../config/classes';
import { Fighter } from '../core/Fighter';
import { angleDiff, clamp, lerp } from '../core/math';
import {
  kayKitAssets,
  KayKitCharacterModelKind,
  LoadedKayKitPack,
} from './KayKitAssetCache';
import { MaterialLibrary } from './PixelTextures';

export type RibbonTone = 'light' | 'heavy' | 'ability';

/**
 * High-density sub-stepped Catmull-Rom 3D blade slash ribbon.
 * Automatically subdivides large frame-to-frame swings along radial arc paths so even
 * 110ms slashes render as razor-smooth, glowing steel crescents without polygonal kinks!
 */
class SingleBladeRibbon {
  public readonly mesh: THREE.Mesh;
  private readonly maxRawSamples = 14;
  private readonly splineSteps = 34;
  private readonly history: Array<{
    base: THREE.Vector3;
    tip: THREE.Vector3;
  }> = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly baseCurve = new THREE.CatmullRomCurve3([]);
  private readonly tipCurve = new THREE.CatmullRomCurve3([]);
  private readonly tmpBase = new THREE.Vector3();
  private readonly tmpTip = new THREE.Vector3();
  private lastTone: RibbonTone | null = null;

  constructor() {
    const vertCount = this.splineSteps * 2;
    this.positions = new Float32Array(vertCount * 3);
    this.colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    for (let i = 0; i < this.splineSteps - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      indices.push(a, b, c, b, d, c);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setIndex(indices);

    this.applyColorPalette('light');

    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  private applyColorPalette(tone: RibbonTone): void {
    if (this.lastTone === tone) return;
    this.lastTone = tone;

    for (let i = 0; i < this.splineSteps; i++) {
      const u = i / (this.splineSteps - 1);
      const fade = Math.pow(1 - u, 1.72);
      const headBoost = i < 4 ? 1.18 : 1.0;

      if (tone === 'heavy') {
        // Blazing molten gold-orange cleave
        this.colors[i * 6 + 0] = 0.95 * fade;
        this.colors[i * 6 + 1] = 0.44 * fade;
        this.colors[i * 6 + 2] = 0.14 * fade;

        this.colors[i * 6 + 3] = 2.05 * fade * headBoost;
        this.colors[i * 6 + 4] = 1.28 * fade * headBoost;
        this.colors[i * 6 + 5] = 0.42 * fade * headBoost;
      } else if (tone === 'ability') {
        // Radiant sky-sapphire & white steel energy arc
        this.colors[i * 6 + 0] = 0.24 * fade;
        this.colors[i * 6 + 1] = 0.68 * fade;
        this.colors[i * 6 + 2] = 1.15 * fade;

        this.colors[i * 6 + 3] = 1.25 * fade * headBoost;
        this.colors[i * 6 + 4] = 1.82 * fade * headBoost;
        this.colors[i * 6 + 5] = 2.25 * fade * headBoost;
      } else {
        // Crisp silver-azure tempered steel slash
        this.colors[i * 6 + 0] = 0.42 * fade;
        this.colors[i * 6 + 1] = 0.56 * fade;
        this.colors[i * 6 + 2] = 0.78 * fade;

        this.colors[i * 6 + 3] = 1.48 * fade * headBoost;
        this.colors[i * 6 + 4] = 1.66 * fade * headBoost;
        this.colors[i * 6 + 5] = 1.92 * fade * headBoost;
      }
    }

    const colAttr = this.mesh?.geometry.attributes.color;
    if (colAttr) {
      colAttr.needsUpdate = true;
    }
  }

  public clear(): void {
    this.history.length = 0;
    this.mesh.visible = false;
  }

  public recordAndBuild(
    worldBase: THREE.Vector3,
    worldTip: THREE.Vector3,
    tone: RibbonTone,
    active: boolean
  ): void {
    if (!active) {
      for (let k = 0; k < 3; k++) {
        if (this.history.length > 0) this.history.pop();
      }
      if (this.history.length < 2) {
        this.mesh.visible = false;
        return;
      }
    } else {
      const head = this.history[0];
      if (!head) {
        this.history.unshift({
          base: worldBase.clone(),
          tip: worldTip.clone(),
        });
      } else {
        const tipDistSq = head.tip.distanceToSquared(worldTip);
        if (tipDistSq > 0.0003) {
          const tipDist = Math.sqrt(tipDistSq);
          // Sub-step large angular leaps preserving true radial blade length!
          const subSteps = clamp(Math.ceil(tipDist / 0.28), 1, 3);
          const prevBase = head.base.clone();
          const prevTip = head.tip.clone();
          const prevLen = Math.max(0.2, prevTip.distanceTo(prevBase));
          const curLen = Math.max(0.2, worldTip.distanceTo(worldBase));

          for (let s = 1; s <= subSteps; s++) {
            const f = s / subSteps;
            const b = prevBase.clone().lerp(worldBase, f);
            const rawDir = prevTip
              .clone()
              .sub(prevBase)
              .lerp(worldTip.clone().sub(worldBase), f);
            if (rawDir.lengthSq() > 1e-5) {
              rawDir.normalize().multiplyScalar(lerp(prevLen, curLen, f));
            }
            const t = b.clone().add(rawDir);
            this.history.unshift({ base: b, tip: t });
          }

          if (this.history.length > this.maxRawSamples) {
            this.history.length = this.maxRawSamples;
          }
        }
      }
    }

    if (this.history.length < 2) {
      this.mesh.visible = false;
      return;
    }

    this.applyColorPalette(tone);
    this.mat.opacity = tone === 'heavy' ? 0.94 : tone === 'ability' ? 0.92 : 0.8;

    this.baseCurve.points = this.history.map((h) => h.base);
    this.tipCurve.points = this.history.map((h) => h.tip);

    for (let i = 0; i < this.splineSteps; i++) {
      const t = i / (this.splineSteps - 1);
      this.baseCurve.getPoint(t, this.tmpBase);
      this.tipCurve.getPoint(t, this.tmpTip);

      // Razor-sharp tapered crescent profile
      const taper = (1 - t * 0.56) * (i === 0 ? 0.85 : 1.0);
      const bx = lerp(this.tmpTip.x, this.tmpBase.x, taper);
      const by = lerp(this.tmpTip.y, this.tmpBase.y, taper);
      const bz = lerp(this.tmpTip.z, this.tmpBase.z, taper);

      const idx = i * 6;
      this.positions[idx] = bx;
      this.positions[idx + 1] = by;
      this.positions[idx + 2] = bz;

      this.positions[idx + 3] = this.tmpTip.x;
      this.positions[idx + 4] = this.tmpTip.y;
      this.positions[idx + 5] = this.tmpTip.z;
    }

    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
  }
}

/**
 * Container exposing `mesh` (a THREE.Group) holding primary + optional Dual-Sword offhand ribbons.
 */
class WeaponRibbonTrail {
  public readonly mesh = new THREE.Group();
  public readonly primary = new SingleBladeRibbon();
  public readonly offhand = new SingleBladeRibbon();

  constructor() {
    this.mesh.add(this.primary.mesh);
    this.mesh.add(this.offhand.mesh);
  }

  public clear(): void {
    this.primary.clear();
    this.offhand.clear();
  }
}

const BUILTIN_ALL_EQUIPMENT = [
  '1H_Sword',
  '2H_Sword',
  '1H_Sword_Offhand',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
  'Knife',
  'Knife_Offhand',
  '1H_Crossbow',
  '2H_Crossbow',
  'Throwable',
  '1H_Axe',
  '1H_Axe_Offhand',
  '2H_Axe',
  'Barbarian_Round_Shield',
  'Mug',
];

const UPPER_BODY_BONES = new Set([
  'spine',
  'chest',
  'head',
  'upperarml',
  'lowerarml',
  'wristl',
  'handl',
  'handslotl',
  'upperarmr',
  'lowerarmr',
  'wristr',
  'handr',
  'handslotr',
  'elbowIKl',
  'handIKl',
  'elbowIKr',
  'handIKr',
]);

const LOWER_BODY_BONES = new Set([
  'hips',
  'upperlegl',
  'lowerlegl',
  'footl',
  'toesl',
  'upperlegr',
  'lowerlegr',
  'footr',
  'toesr',
  'kneeIKl',
  'control-toe-rolll',
  'control-heel-rolll',
  'control-foot-rolll',
  'heelIKl',
  'IK-footl',
  'IK-toel',
  'kneeIKr',
  'control-toe-rollr',
  'control-heel-rollr',
  'control-foot-rollr',
  'heelIKr',
  'IK-footr',
  'IK-toer',
]);

interface SplitClipLibrary {
  upper: Map<string, THREE.AnimationClip>;
  lower: Map<string, THREE.AnimationClip>;
}

const splitClipCache = new WeakMap<
  Map<string, THREE.AnimationClip>,
  SplitClipLibrary
>();

function getSplitClipLibrary(
  sourceClips: Map<string, THREE.AnimationClip>
): SplitClipLibrary {
  const existing = splitClipCache.get(sourceClips);
  if (existing) return existing;

  const upper = new Map<string, THREE.AnimationClip>();
  const lower = new Map<string, THREE.AnimationClip>();

  for (const [name, clip] of sourceClips.entries()) {
    const upperTracks: THREE.KeyframeTrack[] = [];
    const lowerTracks: THREE.KeyframeTrack[] = [];

    for (const track of clip.tracks) {
      const rootName = track.name.split('.')[0];
      if (UPPER_BODY_BONES.has(rootName)) {
        upperTracks.push(track);
      } else if (LOWER_BODY_BONES.has(rootName)) {
        lowerTracks.push(track);
      }
    }

    upper.set(
      name,
      new THREE.AnimationClip(`${name}__upper`, clip.duration, upperTracks)
    );
    lower.set(
      name,
      new THREE.AnimationClip(`${name}__lower`, clip.duration, lowerTracks)
    );
  }

  const built = { upper, lower };
  splitClipCache.set(sourceClips, built);
  return built;
}

/**
 * Forward-kinematics calibrated normalized [0..1] keyframe windows for every KayKit melee clip.
 * `strikeStart` aligns with the true coil reversal point and `strikeEnd` aligns with peak blade extension,
 * so the visual slash whips through space on the exact frame gameplay `Active` begins!
 */
const CLIP_PHASE_WINDOWS: Record<
  string,
  { start: number; strikeStart: number; strikeEnd: number; end: number }
> = {
  '1H_Melee_Attack_Slice_Horizontal': {
    start: 0.04,
    strikeStart: 0.18,
    strikeEnd: 0.35,
    end: 0.86,
  },
  '1H_Melee_Attack_Slice_Diagonal': {
    start: 0.05,
    strikeStart: 0.33,
    strikeEnd: 0.52,
    end: 0.94,
  },
  '1H_Melee_Attack_Chop': {
    start: 0.08,
    strikeStart: 0.49,
    strikeEnd: 0.66,
    end: 0.95,
  },
  '1H_Melee_Attack_Stab': {
    start: 0.04,
    strikeStart: 0.2,
    strikeEnd: 0.48,
    end: 0.92,
  },
  '2H_Melee_Attack_Chop': {
    start: 0.06,
    strikeStart: 0.43,
    strikeEnd: 0.6,
    end: 0.95,
  },
  '2H_Melee_Attack_Slice': {
    start: 0.05,
    strikeStart: 0.3,
    strikeEnd: 0.49,
    end: 0.93,
  },
  '2H_Melee_Attack_Stab': {
    start: 0.02,
    strikeStart: 0.14,
    strikeEnd: 0.48,
    end: 0.92,
  },
  '2H_Melee_Attack_Spin': {
    start: 0.05,
    strikeStart: 0.24,
    strikeEnd: 0.6,
    end: 0.94,
  },
  '2H_Melee_Attack_Spinning': {
    start: 0.02,
    strikeStart: 0.1,
    strikeEnd: 0.9,
    end: 0.98,
  },
  Spellcast_Raise: {
    start: 0.03,
    strikeStart: 0.12,
    strikeEnd: 0.58,
    end: 0.94,
  },
  Throw: {
    start: 0.1,
    strikeStart: 0.47,
    strikeEnd: 0.66,
    end: 0.95,
  },
  Block_Attack: {
    start: 0.05,
    strikeStart: 0.28,
    strikeEnd: 0.58,
    end: 0.93,
  },
  Dualwield_Melee_Attack_Slice: {
    start: 0.1,
    strikeStart: 0.45,
    strikeEnd: 0.72,
    end: 0.96,
  },
  Dualwield_Melee_Attack_Chop: {
    start: 0.06,
    strikeStart: 0.28,
    strikeEnd: 0.49,
    end: 0.92,
  },
  Dualwield_Melee_Attack_Stab: {
    start: 0.04,
    strikeStart: 0.2,
    strikeEnd: 0.49,
    end: 0.92,
  },
  '1H_Melee_Attack_Jump_Chop': {
    start: 0.16,
    strikeStart: 0.45,
    strikeEnd: 0.65,
    end: 0.96,
  },
  Taunt: {
    start: 0.08,
    strikeStart: 0.25,
    strikeEnd: 0.65,
    end: 0.95,
  },
  Spellcast_Summon: {
    start: 0.06,
    strikeStart: 0.2,
    strikeEnd: 0.56,
    end: 0.94,
  },
};

/**
 * Layered Skeletal 3D Knight Visual Rig powered by CC0 KayKit Adventurers (.glb):
 * - Disjoint Upper-Body & Lower-Body skeletal blending (zero foot-sliding while attacking, blocking, or charging!)
 * - Forward-kinematics calibrated 3-phase martial-arts combat choreography across 3-hit combos, heavies & abilities
 * - 8-way velocity-matched locomotion, turn-in-place footwork, airborne jump-attack posing & landing knee absorption
 * - Per-rig visual hit-stop & directional impact shudder + weapon steel ember glow during heavy charge
 * - Sub-stepped Catmull-Rom HDR spline slash ribbons (including twin Dual-Sword ribbons)
 */
export class KnightVisualRig {
  public readonly root = new THREE.Group();
  public readonly trail = new WeaponRibbonTrail();
  public readonly config: KnightClassConfig;
  public readonly modelHolder = new THREE.Group();
  private readonly stunRing = new THREE.Group();
  private readonly buffAuraRing: THREE.Mesh;
  private readonly buffAuraMat: THREE.MeshBasicMaterial;
  private readonly footRing: THREE.Mesh;
  private readonly contactShadow: THREE.Mesh;

  private readonly weaponBaseAnchor = new THREE.Object3D();
  private readonly weaponTipAnchor = new THREE.Object3D();
  private readonly offhandBaseAnchor = new THREE.Object3D();
  private readonly offhandTipAnchor = new THREE.Object3D();
  private hasOffhandBlade = false;

  private readonly tmpBaseWorld = new THREE.Vector3();
  private readonly tmpTipWorld = new THREE.Vector3();
  private readonly tmpOffBaseWorld = new THREE.Vector3();
  private readonly tmpOffTipWorld = new THREE.Vector3();

  private readonly classId: KnightClassId;
  private readonly clothHex: number;
  private readonly tintMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly baseColors: number[] = [];
  private readonly weaponGlowMaterials: THREE.MeshStandardMaterial[] = [];

  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private splitClips: SplitClipLibrary | null = null;

  // Independent Upper-Body & Lower-Body animation channels on the same AnimationMixer
  private upperActions = new Map<string, THREE.AnimationAction>();
  private lowerActions = new Map<string, THREE.AnimationAction>();
  private activeUpperAction: THREE.AnimationAction | null = null;
  private activeLowerAction: THREE.AnimationAction | null = null;
  private activeUpperName = '';
  private activeLowerName = '';
  private isUpperScrubbed = false;
  private isLowerScrubbed = false;

  private rootBone: THREE.Object3D | null = null;
  private spineBone: THREE.Object3D | null = null;
  private chestBone: THREE.Object3D | null = null;
  private headBone: THREE.Object3D | null = null;
  private capeNode: THREE.Object3D | null = null;

  // Exact procedural quaternion offsets applied on the previous frame —
  // inverted before AnimationMixer.update() so Three.js PropertyMixer dirty-skipping
  // never accumulates bone rotations across frames!
  private readonly appliedSpineOffsetQ = new THREE.Quaternion();
  private readonly appliedChestOffsetQ = new THREE.Quaternion();
  private readonly appliedHeadOffsetQ = new THREE.Quaternion();
  private readonly tmpOffsetQ = new THREE.Quaternion();
  private readonly tmpInvOffsetQ = new THREE.Quaternion();
  private readonly tmpOffsetEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // Smoothed procedural secondary motion & impact recoil state
  private smoothPitch = 0;
  private smoothRoll = 0;
  private smoothChestTwist = 0;
  private smoothSpinePitch = 0;
  private smoothCapeLift = 0.08;
  private prevYaw = 0;
  private lastSwingId = -1;
  private wasInHitReaction = false;
  private hitVariantToggle = 0;

  // Per-rig visual hit-stop & directional impact jolt (purely visual — never stalls simulation!)
  private visualHitStopTimer = 0;
  private impactJoltX = 0;
  private impactJoltZ = 0;
  private impactPitchImpulse = 0;
  private impactRollImpulse = 0;

  private lastAnimTime = -1;
  private lastPreviewElapsed = -1;

  constructor(
    classId: KnightClassId,
    mats: MaterialLibrary,
    options?: {
      clothOverride?: number;
      isHuman?: boolean;
      isPreview?: boolean;
    }
  ) {
    this.classId = classId;
    this.config = KNIGHT_CLASSES[classId];
    const vis = this.config.visual;
    this.clothHex = options?.clothOverride ?? vis.clothColor;

    // Ground Contact Shadow + Tactical Foot Ring (pinned dynamically to ground beneath jumps!)
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(vis.capsuleRadius * 3.2, vis.capsuleRadius * 3.2),
      new THREE.MeshBasicMaterial({
        map: mats.contactShadowTex,
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
      })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.018;
    this.root.add(this.contactShadow);

    const ringColor = options?.isHuman ? 0xffdf6b : this.clothHex;
    const ringGeo = new THREE.RingGeometry(
      vis.capsuleRadius * 0.84,
      vis.capsuleRadius * 1.04,
      28
    );
    ringGeo.rotateX(-Math.PI / 2);
    this.footRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: options?.isPreview ? 0.0 : options?.isHuman ? 0.72 : 0.34,
        depthWrite: false,
      })
    );
    this.footRing.position.y = 0.026;
    this.root.add(this.footRing);

    this.root.add(this.modelHolder);

    // Overhead Stun Stars
    this.stunRing.position.set(0, 2.28 * vis.bodyScaleHeight, 0);
    this.stunRing.visible = false;
    const starGeo = new THREE.OctahedronGeometry(0.12, 0);
    const starMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.9, 1.45, 0.3),
      toneMapped: false,
    });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const a = (i * Math.PI * 2) / 3;
      star.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      this.stunRing.add(star);
    }
    this.root.add(this.stunRing);

    const auraGeo = new THREE.TorusGeometry(
      vis.capsuleRadius * 1.18,
      0.045,
      8,
      28
    );
    auraGeo.rotateX(Math.PI / 2);
    this.buffAuraMat = new THREE.MeshBasicMaterial({
      color: 0xffcf48,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.buffAuraRing = new THREE.Mesh(auraGeo, this.buffAuraMat);
    this.buffAuraRing.position.y = 0.28;
    this.buffAuraRing.visible = false;
    this.root.add(this.buffAuraRing);

    kayKitAssets.onReady((pack) => {
      this.mountKayKitCharacter(pack);
    });
  }

  /**
   * Triggers visceral visual hit-stop and directional body recoil on steel-on-steel / flesh impact.
   */
  public notifyCombatImpact(
    role: 'attacker' | 'victim',
    kind: 'light' | 'heavy' | 'blocked' | 'parried',
    dirX = 0,
    dirZ = 0
  ): void {
    if (role === 'attacker') {
      if (kind === 'parried') {
        this.visualHitStopTimer = Math.max(this.visualHitStopTimer, 0.055);
        this.impactPitchImpulse = -0.22;
      } else {
        this.visualHitStopTimer = Math.max(
          this.visualHitStopTimer,
          kind === 'heavy' ? 0.056 : 0.034
        );
      }
      return;
    }

    // Victim impact shudder + directional knock-snap
    const mag = kind === 'heavy' ? 0.14 : kind === 'blocked' ? 0.075 : 0.095;
    this.visualHitStopTimer = Math.max(
      this.visualHitStopTimer,
      kind === 'heavy' ? 0.052 : 0.03
    );
    this.impactJoltX = clamp(this.impactJoltX + dirX * mag, -0.2, 0.2);
    this.impactJoltZ = clamp(this.impactJoltZ + dirZ * mag, -0.2, 0.2);

    const sinY = Math.sin(this.prevYaw);
    const cosY = Math.cos(this.prevYaw);
    const localFwd = dirX * sinY + dirZ * cosY;
    const localRight = -dirX * cosY + dirZ * sinY;
    this.impactPitchImpulse = clamp(
      localFwd * (kind === 'heavy' ? 0.26 : 0.16),
      -0.28,
      0.28
    );
    this.impactRollImpulse = clamp(-localRight * 0.2, -0.24, 0.24);
  }

  private trackMat(
    mat: THREE.MeshStandardMaterial,
    isWeaponSteel = false
  ): THREE.MeshStandardMaterial {
    this.tintMaterials.push(mat);
    this.baseColors.push(mat.color.getHex());
    if (isWeaponSteel) {
      this.weaponGlowMaterials.push(mat);
    }
    return mat;
  }

  private resolveModelKind(): KayKitCharacterModelKind {
    switch (this.classId) {
      case 'dual':
        return 'rogue';
      case 'barbarian':
        return 'barbarian';
      case 'duelist':
        return 'duelist';
      case 'skeleton_knight':
        return 'skeleton_warrior';
      case 'skeleton_reaper':
        return 'skeleton_rogue';
      case 'skeleton_berserker':
        return 'skeleton_minion';
      case 'sword':
      case 'spear':
      case 'hammer':
      default:
        return 'knight';
    }
  }

  private getIdleClipName(): string {
    if (
      (this.classId === 'spear' || this.classId === 'barbarian') &&
      this.clips.has('2H_Melee_Idle')
    ) {
      return '2H_Melee_Idle';
    }
    if (
      (this.classId === 'skeleton_knight' ||
        this.classId === 'skeleton_berserker') &&
      this.clips.has('Idle_Combat')
    ) {
      return 'Idle_Combat';
    }
    if (this.classId === 'duelist' && this.clips.has('Idle_B')) {
      return 'Idle_B';
    }
    return 'Idle';
  }

  private mountKayKitCharacter(pack: LoadedKayKitPack): void {
    this.modelHolder.clear();
    this.tintMaterials.length = 0;
    this.baseColors.length = 0;
    this.weaponGlowMaterials.length = 0;
    this.upperActions.clear();
    this.lowerActions.clear();
    this.activeUpperAction = null;
    this.activeLowerAction = null;
    this.activeUpperName = '';
    this.activeLowerName = '';
    this.isUpperScrubbed = false;
    this.isLowerScrubbed = false;
    this.hasOffhandBlade = false;
    this.appliedSpineOffsetQ.identity();
    this.appliedChestOffsetQ.identity();
    this.appliedHeadOffsetQ.identity();

    const modelKind = this.resolveModelKind();
    const clonedRig = kayKitAssets.cloneCharacterRig(modelKind);
    if (!clonedRig) return;

    this.clips =
      pack.mergedClips ??
      (modelKind === 'rogue' || modelKind === 'duelist'
        ? pack.rogueClips
        : pack.knightClips);
    this.splitClips = getSplitClipLibrary(this.clips);

    if (this.classId === 'hammer') {
      clonedRig.scale.set(0.95, 0.89, 0.95);
    } else if (this.classId === 'barbarian') {
      clonedRig.scale.set(0.94, 0.91, 0.94);
    } else if (this.classId === 'skeleton_knight') {
      clonedRig.scale.set(0.91, 0.89, 0.91);
    } else if (this.classId === 'spear') {
      clonedRig.scale.set(0.85, 0.89, 0.85);
    } else if (
      this.classId === 'dual' ||
      this.classId === 'duelist' ||
      this.classId === 'skeleton_reaper'
    ) {
      clonedRig.scale.set(0.85, 0.85, 0.85);
    } else {
      clonedRig.scale.set(0.87, 0.86, 0.87);
    }

    const armorTint =
      this.classId === 'hammer'
        ? 0x454a57
        : this.classId === 'spear'
        ? 0xb8cde0
        : undefined;

    const customTex = kayKitAssets.getCustomizedAtlasTexture(
      modelKind,
      this.clothHex,
      armorTint
    );

    const charMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: customTex,
        roughness: 0.62,
        metalness: 0.12,
      })
    );

    clonedRig.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = charMat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });

    for (const eqName of BUILTIN_ALL_EQUIPMENT) {
      const node = clonedRig.getObjectByName(eqName);
      if (node) node.visible = false;
    }

    this.rootBone = clonedRig.getObjectByName('root') ?? null;
    this.spineBone = clonedRig.getObjectByName('spine') ?? null;
    this.chestBone = clonedRig.getObjectByName('chest') ?? null;
    this.headBone = clonedRig.getObjectByName('head') ?? null;
    this.capeNode =
      clonedRig.getObjectByName('Knight_Cape') ??
      clonedRig.getObjectByName('Rogue_Cape') ??
      clonedRig.getObjectByName('Skeleton_Warrior_Cape') ??
      clonedRig.getObjectByName('Skeleton_Rogue_Cape') ??
      clonedRig.getObjectByName('Skeleton_Minion_Cloak') ??
      null;

    // Three.js GLTFLoader sanitizes dots in bone names ('handslot.r' -> 'handslotr')
    const handSlotR =
      clonedRig.getObjectByName('handslotr') ??
      clonedRig.getObjectByName('handslot.r') ??
      clonedRig.getObjectByName('1H_Sword')?.parent ??
      clonedRig.getObjectByName('2H_Axe')?.parent ??
      clonedRig.getObjectByName('Knife')?.parent ??
      null;

    const handSlotL =
      clonedRig.getObjectByName('handslotl') ??
      clonedRig.getObjectByName('handslot.l') ??
      clonedRig.getObjectByName('1H_Sword_Offhand')?.parent ??
      clonedRig.getObjectByName('Barbarian_Round_Shield')?.parent ??
      clonedRig.getObjectByName('Knife_Offhand')?.parent ??
      null;

    const helmetNode =
      clonedRig.getObjectByName('Knight_Helmet') ??
      clonedRig.getObjectByName('Skeleton_Warrior_Helmet') ??
      null;

    this.configureClassLoadout(
      pack,
      clonedRig,
      handSlotR,
      handSlotL,
      helmetNode
    );

    this.modelHolder.add(clonedRig);

    this.mixer = new THREE.AnimationMixer(clonedRig);
    const idleName = this.getIdleClipName();
    this.fadeFullBodyToClip(idleName, 0.01, true, 1.0);
    this.mixer.update(0.001);
  }

  private configureClassLoadout(
    pack: LoadedKayKitPack,
    clonedRig: THREE.Object3D,
    handSlotR: THREE.Object3D | null,
    handSlotL: THREE.Object3D | null,
    helmetNode: THREE.Object3D | null
  ): void {
    const steelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdce5f2,
        roughness: 0.32,
        metalness: 0.68,
      }),
      true
    );
    const darkIronMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b4252,
        roughness: 0.48,
        metalness: 0.58,
      }),
      true
    );
    const goldMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf0b93c,
        roughness: 0.32,
        metalness: 0.72,
      })
    );
    const woodShaftMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7c5032,
        roughness: 0.82,
        metalness: 0.05,
      })
    );
    const accentClothMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: this.clothHex,
        roughness: 0.8,
        metalness: 0.05,
        side: THREE.DoubleSide,
      })
    );

    if (this.classId === 'sword') {
      const sword2H = clonedRig.getObjectByName('2H_Sword');
      if (sword2H) {
        sword2H.visible = true;
        const swordCustomTex = kayKitAssets.getCustomizedAtlasTexture(
          'knight',
          this.clothHex
        );
        const swordBladeMat = this.trackMat(
          new THREE.MeshStandardMaterial({
            map: swordCustomTex,
            roughness: 0.45,
            metalness: 0.32,
          }),
          true
        );
        sword2H.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.material = swordBladeMat;
          }
        });
        this.weaponBaseAnchor.position.set(0, 0.25, 0);
        this.weaponTipAnchor.position.set(0, 1.95, 0);
        sword2H.add(this.weaponBaseAnchor);
        sword2H.add(this.weaponTipAnchor);
      }

      if (helmetNode) {
        const plume = new THREE.Mesh(
          new THREE.ConeGeometry(0.11, 0.44, 8),
          accentClothMat
        );
        plume.position.set(0, 1.22, -0.14);
        plume.rotation.x = -0.78;
        plume.castShadow = true;
        helmetNode.add(plume);
      }
    } else if (this.classId === 'dual') {
      const knightSwordTex = kayKitAssets.getCustomizedAtlasTexture(
        'knight',
        this.clothHex
      );
      const swordAtlasMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          map: knightSwordTex,
          roughness: 0.48,
          metalness: 0.28,
        }),
        true
      );

      if (handSlotR && pack.sword1HProto) {
        const rightSword = pack.sword1HProto.clone(true);
        rightSword.visible = true;
        rightSword.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.material = swordAtlasMat;
            m.castShadow = true;
          }
        });
        handSlotR.add(rightSword);

        this.weaponBaseAnchor.position.set(0, 0.22, 0);
        this.weaponTipAnchor.position.set(0, 1.42, 0);
        rightSword.add(this.weaponBaseAnchor);
        rightSword.add(this.weaponTipAnchor);
      }

      if (handSlotL && pack.swordOffhandProto) {
        const leftSword = pack.swordOffhandProto.clone(true);
        leftSword.visible = true;
        leftSword.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.material = swordAtlasMat;
            m.castShadow = true;
          }
        });
        handSlotL.add(leftSword);

        this.offhandBaseAnchor.position.set(0, 0.22, 0);
        this.offhandTipAnchor.position.set(0, 1.42, 0);
        leftSword.add(this.offhandBaseAnchor);
        leftSword.add(this.offhandTipAnchor);
        this.hasOffhandBlade = true;
      }
    } else if (this.classId === 'spear') {
      const badgeShield = clonedRig.getObjectByName('Badge_Shield');
      if (badgeShield) {
        badgeShield.visible = true;
      }

      if (handSlotR) {
        const spear = this.buildKayKitStyleSpear(
          steelMat,
          goldMat,
          woodShaftMat,
          accentClothMat
        );
        spear.position.set(0, 0.033, 0);
        spear.rotation.y = Math.PI;
        handSlotR.add(spear);

        this.weaponBaseAnchor.position.set(0, 1.72, 0);
        this.weaponTipAnchor.position.set(0, 2.68, 0);
        spear.add(this.weaponBaseAnchor);
        spear.add(this.weaponTipAnchor);
      }
    } else if (this.classId === 'hammer') {
      const spikeShield = clonedRig.getObjectByName('Spike_Shield');
      if (spikeShield) {
        spikeShield.visible = true;
      }

      if (handSlotR) {
        const hammer = this.buildKayKitStyleWarhammer(
          steelMat,
          darkIronMat,
          goldMat,
          woodShaftMat
        );
        hammer.position.set(0, 0.033, 0);
        hammer.rotation.y = Math.PI;
        handSlotR.add(hammer);

        this.weaponBaseAnchor.position.set(0, 0.96, 0);
        this.weaponTipAnchor.position.set(0, 1.62, 0);
        hammer.add(this.weaponBaseAnchor);
        hammer.add(this.weaponTipAnchor);
      }

      if (helmetNode) {
        for (const side of [-1, 1]) {
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * 0.42, 0.72, 0.04),
            new THREE.Vector3(side * 0.68, 0.85, 0.14),
            new THREE.Vector3(side * 0.74, 1.12, 0.28),
          ]);
          const hornGeo = new THREE.TubeGeometry(curve, 8, 0.085, 7, false);
          const pos = hornGeo.attributes.position as THREE.BufferAttribute;
          for (let vi = 0; vi < pos.count; vi++) {
            const ringT = Math.floor(vi / 8) / 8;
            const c = curve.getPointAt(clamp(ringT, 0, 1));
            const taper = 1 - ringT * 0.82;
            pos.setXYZ(
              vi,
              c.x + (pos.getX(vi) - c.x) * taper,
              c.y + (pos.getY(vi) - c.y) * taper,
              c.z + (pos.getZ(vi) - c.z) * taper
            );
          }
          hornGeo.computeVertexNormals();
          const horn = new THREE.Mesh(hornGeo, goldMat);
          horn.castShadow = true;
          helmetNode.add(horn);
        }
      }
    } else if (this.classId === 'barbarian') {
      const axe2H =
        clonedRig.getObjectByName('2H_Axe') ??
        clonedRig.getObjectByName('2H_Sword');
      if (axe2H) {
        axe2H.visible = true;
        this.weaponBaseAnchor.position.set(0, 0.45, 0);
        this.weaponTipAnchor.position.set(0, 1.85, 0);
        axe2H.add(this.weaponBaseAnchor);
        axe2H.add(this.weaponTipAnchor);
      } else if (handSlotR && pack.sword1HProto) {
        const w = pack.sword1HProto.clone(true);
        w.visible = true;
        handSlotR.add(w);
        this.weaponBaseAnchor.position.set(0, 0.24, 0);
        this.weaponTipAnchor.position.set(0, 1.5, 0);
        w.add(this.weaponBaseAnchor);
        w.add(this.weaponTipAnchor);
      }
    } else if (this.classId === 'duelist') {
      const knightTex = kayKitAssets.getCustomizedAtlasTexture(
        'knight',
        this.clothHex
      );
      const duelistEquipMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          map: knightTex,
          roughness: 0.45,
          metalness: 0.34,
        }),
        true
      );

      if (handSlotR && pack.sword1HProto) {
        const rapier = pack.sword1HProto.clone(true);
        rapier.visible = true;
        rapier.scale.set(0.78, 1.08, 0.78);
        rapier.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.material = duelistEquipMat;
            m.castShadow = true;
          }
        });
        handSlotR.add(rapier);
        this.weaponBaseAnchor.position.set(0, 0.22, 0);
        this.weaponTipAnchor.position.set(0, 1.48, 0);
        rapier.add(this.weaponBaseAnchor);
        rapier.add(this.weaponTipAnchor);
      }

      if (handSlotL && pack.roundShieldProto) {
        const buckler = pack.roundShieldProto.clone(true);
        buckler.visible = true;
        buckler.scale.setScalar(0.82);
        buckler.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.material = duelistEquipMat;
            m.castShadow = true;
          }
        });
        handSlotL.add(buckler);
      }
    } else if (
      this.classId === 'skeleton_knight' ||
      this.classId === 'skeleton_reaper' ||
      this.classId === 'skeleton_berserker'
    ) {
      const skelTex =
        kayKitAssets.getCustomizedAtlasTexture(
          'skeleton_warrior',
          this.clothHex
        ) ??
        kayKitAssets.getCustomizedAtlasTexture('knight', this.clothHex);
      const skelWeaponMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          map: skelTex,
          roughness: 0.5,
          metalness: 0.28,
        }),
        true
      );

      const attachSkelItem = (
        slot: THREE.Object3D | null,
        proto: THREE.Object3D | null | undefined,
        fallbackProto: THREE.Object3D | null | undefined,
        isShield: boolean,
        isRightHand: boolean
      ): THREE.Object3D | null => {
        if (!slot) return null;
        const src = proto ?? fallbackProto;
        if (!src) return null;
        const item = src.clone(true);
        item.visible = true;
        if (proto) {
          if (isShield) {
            item.position.set(0, 0.017, 0.1559);
            item.rotation.set(0, 0, 0);
          } else if (isRightHand) {
            item.position.set(0, 0.0333, 0);
            item.rotation.set(0, Math.PI, 0);
          } else {
            item.position.set(0, 0.017, 0);
            item.rotation.set(0, 0, 0);
          }
        }
        item.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            if (skelTex) m.material = skelWeaponMat;
            m.castShadow = true;
          }
        });
        slot.add(item);
        return item;
      };

      if (this.classId === 'skeleton_knight') {
        const blade = attachSkelItem(
          handSlotR,
          pack.skeletonBladeProto,
          pack.sword1HProto,
          false,
          true
        );
        if (blade) {
          this.weaponBaseAnchor.position.set(0, 0.24, 0);
          this.weaponTipAnchor.position.set(0, 1.5, 0);
          blade.add(this.weaponBaseAnchor);
          blade.add(this.weaponTipAnchor);
        }
        attachSkelItem(
          handSlotL,
          pack.skeletonShieldLargeAProto,
          pack.roundShieldProto,
          true,
          false
        );
      } else if (this.classId === 'skeleton_reaper') {
        const rightAxe = attachSkelItem(
          handSlotR,
          pack.skeletonAxeProto,
          pack.sword1HProto,
          false,
          true
        );
        if (rightAxe) {
          this.weaponBaseAnchor.position.set(0, 0.26, 0);
          this.weaponTipAnchor.position.set(0, 1.44, 0);
          rightAxe.add(this.weaponBaseAnchor);
          rightAxe.add(this.weaponTipAnchor);
        }
        const leftBlade = attachSkelItem(
          handSlotL,
          pack.skeletonBladeProto,
          pack.swordOffhandProto,
          false,
          false
        );
        if (leftBlade) {
          this.offhandBaseAnchor.position.set(0, 0.22, 0);
          this.offhandTipAnchor.position.set(0, 1.42, 0);
          leftBlade.add(this.offhandBaseAnchor);
          leftBlade.add(this.offhandTipAnchor);
          this.hasOffhandBlade = true;
        }
      } else {
        const axe = attachSkelItem(
          handSlotR,
          pack.skeletonAxeProto,
          pack.sword1HProto,
          false,
          true
        );
        if (axe) {
          this.weaponBaseAnchor.position.set(0, 0.26, 0);
          this.weaponTipAnchor.position.set(0, 1.44, 0);
          axe.add(this.weaponBaseAnchor);
          axe.add(this.weaponTipAnchor);
        }
        attachSkelItem(
          handSlotL,
          pack.skeletonShieldSmallAProto,
          pack.roundShieldProto,
          true,
          false
        );
      }
    }
  }

  private buildKayKitStyleSpear(
    steelMat: THREE.Material,
    goldMat: THREE.Material,
    woodMat: THREE.Material,
    clothMat: THREE.Material
  ): THREE.Group {
    const g = new THREE.Group();

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.046, 0.054, 2.38, 10),
      woodMat
    );
    shaft.position.y = 0.88;
    shaft.castShadow = true;
    g.add(shaft);

    const buttSpike = new THREE.Mesh(
      new THREE.ConeGeometry(0.068, 0.24, 8),
      goldMat
    );
    buttSpike.rotation.x = Math.PI;
    buttSpike.position.y = -0.36;
    g.add(buttSpike);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.088, 0.068, 0.22, 10),
      goldMat
    );
    collar.position.y = 2.02;
    g.add(collar);

    const lugGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.44),
      goldMat
    );
    lugGuard.position.y = 2.08;
    g.add(lugGuard);

    const spearhead = new THREE.Mesh(
      new THREE.ConeGeometry(0.135, 0.68, 4),
      steelMat
    );
    spearhead.scale.set(0.45, 1.0, 1.25);
    spearhead.position.y = 2.44;
    spearhead.castShadow = true;
    g.add(spearhead);

    const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.48), clothMat);
    pennant.position.set(0, 1.82, -0.18);
    pennant.rotation.y = Math.PI * 0.5;
    pennant.rotation.z = 0.16;
    g.add(pennant);

    return g;
  }

  private buildKayKitStyleWarhammer(
    steelMat: THREE.Material,
    darkIronMat: THREE.Material,
    goldMat: THREE.Material,
    woodMat: THREE.Material
  ): THREE.Group {
    const g = new THREE.Group();

    const haft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.065, 1.46, 10),
      woodMat
    );
    haft.position.y = 0.44;
    haft.castShadow = true;
    g.add(haft);

    const pommel = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 10, 8),
      goldMat
    );
    pommel.position.y = -0.3;
    g.add(pommel);

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.085, 0.18, 10),
      goldMat
    );
    collar.position.y = 1.08;
    g.add(collar);

    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.34, 0.32),
      darkIronMat
    );
    core.position.set(-0.02, 1.24, 0);
    core.castShadow = true;
    g.add(core);

    const face = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.19, 0.17, 8),
      steelMat
    );
    face.rotation.z = Math.PI / 2;
    face.position.set(-0.37, 1.24, 0);
    face.castShadow = true;
    g.add(face);

    const backSpike = new THREE.Mesh(
      new THREE.ConeGeometry(0.125, 0.4, 6),
      steelMat
    );
    backSpike.rotation.z = -Math.PI / 2;
    backSpike.position.set(0.39, 1.24, 0);
    backSpike.castShadow = true;
    g.add(backSpike);

    const topFinial = new THREE.Mesh(
      new THREE.ConeGeometry(0.085, 0.28, 8),
      goldMat
    );
    topFinial.position.set(0, 1.54, 0);
    g.add(topFinial);

    return g;
  }

  private getUpperAction(clipName: string): THREE.AnimationAction | null {
    if (!this.mixer || !this.splitClips) return null;
    const cached = this.upperActions.get(clipName);
    if (cached) return cached;

    const clip =
      this.splitClips.upper.get(clipName) ?? this.splitClips.upper.get('Idle');
    if (!clip) return null;

    const act = this.mixer.clipAction(clip);
    this.upperActions.set(clipName, act);
    return act;
  }

  private getLowerAction(clipName: string): THREE.AnimationAction | null {
    if (!this.mixer || !this.splitClips) return null;
    const cached = this.lowerActions.get(clipName);
    if (cached) return cached;

    const clip =
      this.splitClips.lower.get(clipName) ?? this.splitClips.lower.get('Idle');
    if (!clip) return null;

    const act = this.mixer.clipAction(clip);
    this.lowerActions.set(clipName, act);
    return act;
  }

  private fadeUpperToClip(
    clipName: string,
    fadeDuration: number,
    loop: boolean,
    timeScale: number
  ): THREE.AnimationAction | null {
    const next = this.getUpperAction(clipName);
    if (!next) return null;

    if (this.activeUpperName !== clipName || this.isUpperScrubbed) {
      if (this.activeUpperAction && this.isUpperScrubbed) {
        this.activeUpperAction.setEffectiveTimeScale(0.35);
      }

      if (this.activeUpperAction !== next) {
        next.reset();
      }
      next.setLoop(
        loop ? THREE.LoopRepeat : THREE.LoopOnce,
        loop ? Infinity : 1
      );
      next.clampWhenFinished = !loop;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(timeScale);
      next.play();

      if (this.activeUpperAction && this.activeUpperAction !== next) {
        this.activeUpperAction.crossFadeTo(next, fadeDuration, false);
      }

      this.activeUpperAction = next;
      this.activeUpperName = clipName;
      this.isUpperScrubbed = false;
    } else {
      next.setEffectiveTimeScale(timeScale);
    }

    return next;
  }

  private fadeLowerToClip(
    clipName: string,
    fadeDuration: number,
    loop: boolean,
    timeScale: number
  ): THREE.AnimationAction | null {
    const next = this.getLowerAction(clipName);
    if (!next) return null;

    if (this.activeLowerName !== clipName || this.isLowerScrubbed) {
      if (this.activeLowerAction && this.isLowerScrubbed) {
        this.activeLowerAction.setEffectiveTimeScale(0.4);
      }

      if (this.activeLowerAction !== next) {
        next.reset();
      }
      next.setLoop(
        loop ? THREE.LoopRepeat : THREE.LoopOnce,
        loop ? Infinity : 1
      );
      next.clampWhenFinished = !loop;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(timeScale);
      next.play();

      if (this.activeLowerAction && this.activeLowerAction !== next) {
        this.activeLowerAction.crossFadeTo(next, fadeDuration, false);
      }

      this.activeLowerAction = next;
      this.activeLowerName = clipName;
      this.isLowerScrubbed = false;
    } else {
      next.setEffectiveTimeScale(timeScale);
    }

    return next;
  }

  private fadeFullBodyToClip(
    clipName: string,
    fadeDuration: number,
    loop: boolean,
    timeScale: number
  ): void {
    const u = this.fadeUpperToClip(clipName, fadeDuration, loop, timeScale);
    const l = this.fadeLowerToClip(clipName, fadeDuration, loop, timeScale);
    // Keep looping upper & lower clips phase-aligned when both play the same locomotion clip!
    if (u && l && loop && Math.abs(u.time - l.time) > 0.03) {
      u.time = l.time;
    }
  }

  private blendUpperToScrubClip(
    clipName: string,
    fadeDuration = 0.055,
    forceRestart = false
  ): THREE.AnimationAction | null {
    const next = this.getUpperAction(clipName);
    if (!next || !this.mixer) return null;

    if (this.activeUpperName !== clipName) {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
      next.play();

      if (this.activeUpperAction && this.activeUpperAction !== next) {
        this.activeUpperAction.crossFadeTo(next, fadeDuration, false);
      }

      this.activeUpperAction = next;
      this.activeUpperName = clipName;
      this.isUpperScrubbed = true;
    } else {
      if (forceRestart && !this.isUpperScrubbed) {
        next.reset();
        next.play();
      }
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
      this.isUpperScrubbed = true;
    }

    return next;
  }

  private blendLowerToScrubClip(
    clipName: string,
    fadeDuration = 0.065,
    forceRestart = false
  ): THREE.AnimationAction | null {
    const next = this.getLowerAction(clipName);
    if (!next || !this.mixer) return null;

    if (this.activeLowerName !== clipName) {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
      next.play();

      if (this.activeLowerAction && this.activeLowerAction !== next) {
        this.activeLowerAction.crossFadeTo(next, fadeDuration, false);
      }

      this.activeLowerAction = next;
      this.activeLowerName = clipName;
      this.isLowerScrubbed = true;
    } else {
      if (forceRestart && !this.isLowerScrubbed) {
        next.reset();
        next.play();
      }
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
      this.isLowerScrubbed = true;
    }

    return next;
  }

  private getRunClipName(): string {
    if (this.classId === 'dual' || this.classId === 'duelist') {
      return 'Running_B';
    }
    if (
      (this.classId === 'skeleton_knight' ||
        this.classId === 'skeleton_reaper' ||
        this.classId === 'skeleton_berserker') &&
      this.clips.has('Running_C')
    ) {
      return 'Running_C';
    }
    return 'Running_A';
  }

  private getWalkClipName(): string {
    if (
      (this.classId === 'skeleton_knight' ||
        this.classId === 'skeleton_berserker') &&
      this.clips.has('Walking_D_Skeletons')
    ) {
      return 'Walking_D_Skeletons';
    }
    return 'Walking_A';
  }

  /**
   * Computes directional lower-body footwork clip & playback cadence for moving combat or locomotion.
   */
  private applyDirectionalLowerBody(
    localFwdVel: number,
    localRightVel: number,
    horizSpeed: number,
    isSprinting: boolean,
    fadeDuration = 0.1
  ): { moveClip: string; leanPitch: number } {
    let moveClip = this.getWalkClipName();
    let refSpeed = 3.9;
    const leanPitch = 0;

    if (isSprinting && localFwdVel >= -0.5) {
      moveClip = this.getRunClipName();
      refSpeed = 5.85;
    } else if (Math.abs(localRightVel) > Math.abs(localFwdVel) * 1.12) {
      moveClip =
        localRightVel > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left';
      refSpeed = 4.55;
    } else if (localFwdVel < -0.5) {
      moveClip = 'Walking_Backwards';
      refSpeed = 3.55;
    } else if (horizSpeed > 4.55) {
      moveClip = this.getRunClipName();
      refSpeed = 5.55;
    } else {
      moveClip = this.getWalkClipName();
      refSpeed = 3.8;
    }

    const playbackSpeed = clamp(horizSpeed / refSpeed, 0.68, 1.55);
    this.fadeLowerToClip(moveClip, fadeDuration, true, playbackSpeed);
    return { moveClip, leanPitch };
  }

  /**
   * Selects distinct, choreographed KayKit attack & ability clips across all 9 melee classes
   * so every combo step, heavy blow, and ability has its own unmistakable silhouette!
   */
  private resolveAttackClipName(
    style: AttackAnimStyle,
    isHeavy: boolean,
    comboStep: number
  ): string {
    if (style === 'ability_sword_rush') return '2H_Melee_Attack_Slice';
    if (
      style === 'ability_sword_warcry' ||
      style === 'ability_hammer_forge'
    ) {
      return 'Spellcast_Raise';
    }
    if (style === 'ability_dual_cyclone') return '2H_Melee_Attack_Spinning';
    if (style === 'ability_dual_shadowstep') return 'Dualwield_Melee_Attack_Chop';
    if (
      style === 'ability_dual_dagger' ||
      style === 'ability_spear_javelin' ||
      style === 'ability_throw'
    ) {
      return 'Throw';
    }
    if (style === 'ability_spear_dragon') return '2H_Melee_Attack_Stab';
    if (style === 'ability_spear_sweep' || style === 'axe_whirl') {
      return '2H_Melee_Attack_Spin';
    }
    if (style === 'ability_hammer_ram') return 'Block_Attack';
    if (style === 'ability_hammer_quake') return '2H_Melee_Attack_Chop';
    if (
      style === 'jump_chop_slam' ||
      style === 'ability_sword_judgment' ||
      style === 'axe_guillotine'
    ) {
      return this.clips.has('1H_Melee_Attack_Jump_Chop')
        ? '1H_Melee_Attack_Jump_Chop'
        : '2H_Melee_Attack_Chop';
    }
    if (style === 'taunt_roar') {
      return this.clips.has('Taunt') ? 'Taunt' : 'Spellcast_Raise';
    }
    if (style === 'summon_roar') {
      return this.clips.has('Spellcast_Summon')
        ? 'Spellcast_Summon'
        : 'Spellcast_Raise';
    }
    if (style === 'axe_cleave_right') return '2H_Melee_Attack_Slice';
    if (style === 'axe_cleave_left') return '1H_Melee_Attack_Slice_Diagonal';
    if (style === 'rapier_lunge') return '1H_Melee_Attack_Stab';
    if (style === 'rapier_cut') return '1H_Melee_Attack_Slice_Horizontal';
    if (style === 'rapier_flurry') return '2H_Melee_Attack_Stab';

    // Dual Swords 3-hit combo + spin finisher
    if (style === 'dual_left') return 'Dualwield_Melee_Attack_Slice';
    if (style === 'dual_right') return 'Dualwield_Melee_Attack_Stab';
    if (style === 'dual_cross') return 'Dualwield_Melee_Attack_Chop';
    if (style === 'dual_finisher') {
      return isHeavy ? '2H_Melee_Attack_Spin' : 'Dualwield_Melee_Attack_Stab';
    }

    // Spear 3-hit combo + impale heavy
    if (style === 'spear_poke') {
      return comboStep % 2 === 0
        ? '1H_Melee_Attack_Stab'
        : '2H_Melee_Attack_Stab';
    }
    if (style === 'spear_slash') return '2H_Melee_Attack_Slice';
    if (style === 'spear_impale') return '2H_Melee_Attack_Stab';

    // Shield & Hammer 3-hit combo + slam heavy
    if (style === 'hammer_swing') return '1H_Melee_Attack_Chop';
    if (style === 'hammer_bash') return '2H_Melee_Attack_Slice';
    if (style === 'overhead_cleave' || style === 'hammer_slam') {
      return '2H_Melee_Attack_Chop';
    }

    // Sword 3-hit combo
    if (style === 'sword_thrust') return '2H_Melee_Attack_Slice';
    if (style === 'slash_left') return '1H_Melee_Attack_Slice_Diagonal';
    return '1H_Melee_Attack_Slice_Horizontal';
  }

  public syncFromFighter(fighter: Fighter): void {
    this.root.position.set(fighter.body.x, fighter.body.y, fighter.body.z);
    this.root.rotation.y = fighter.yaw;

    // Pin contact shadow & foot ring directly onto the floor beneath jumping knights
    const airHeight = Math.max(
      0,
      fighter.body.y - fighter.body.supportFloorY
    );
    this.contactShadow.position.y = 0.018 - airHeight;
    this.footRing.position.y = 0.026 - airHeight;
    const shadowScale = fighter.isAlive
      ? Math.max(0.42, 1.0 - airHeight * 0.22)
      : 1.35;
    this.contactShadow.scale.setScalar(shadowScale);
    (this.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      fighter.isAlive ? Math.max(0.24, 0.76 - airHeight * 0.22) : 0.76;

    // Hit-flash tint + Heavy Charge / Unblockable Weapon Steel Ember Glow!
    const flash = fighter.hitFlashTimer > 0;
    const chargeGlow = fighter.isChargingHeavy
      ? clamp(fighter.chargeRatio, 0.15, 1.0)
      : fighter.activeAttack &&
        (!fighter.activeAttack.blockable || fighter.activeAttack.isHeavy) &&
        fighter.attackPhase !== 'Recovery'
      ? 0.65
      : fighter.damageAuraTimer > 0
      ? 0.35
      : 0;

    for (let i = 0; i < this.tintMaterials.length; i++) {
      const m = this.tintMaterials[i];
      if (flash) {
        m.color.setHex(0xfff2cc);
        m.emissive.setHex(0x884411);
        m.emissiveIntensity = 1.0;
      } else {
        m.color.setHex(this.baseColors[i]);
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 1.0;
      }
    }

    if (!flash && chargeGlow > 0) {
      for (const wm of this.weaponGlowMaterials) {
        wm.emissive.setHex(
          fighter.damageAuraTimer > 0 && !fighter.isChargingHeavy
            ? 0xd99b26
            : 0xff7b24
        );
        wm.emissiveIntensity = chargeGlow * 0.85;
      }
    }

    this.stunRing.visible = fighter.state === 'Stunned' && fighter.isAlive;
    if (this.stunRing.visible) {
      this.stunRing.rotation.y = fighter.animTime * 4.8;
    }

    // Active Class Buff Aura ring (Valor / Haste / Iron Bastion)
    const hasBuff =
      fighter.isAlive &&
      (fighter.damageAuraTimer > 0 ||
        fighter.hasteTimer > 0 ||
        fighter.ironBastionTimer > 0);
    this.buffAuraRing.visible = hasBuff;
    if (hasBuff) {
      if (fighter.damageAuraTimer > 0) {
        this.buffAuraMat.color.setHex(0xffcf48);
      } else if (fighter.hasteTimer > 0) {
        this.buffAuraMat.color.setHex(0x38bdf8);
      } else {
        this.buffAuraMat.color.setHex(0xff8438);
      }
      this.buffAuraRing.position.y =
        0.32 + Math.sin(fighter.animTime * 6.5) * 0.08;
      const pulse = 1 + Math.sin(fighter.animTime * 9.0) * 0.06;
      this.buffAuraRing.scale.setScalar(pulse);
    }

    this.footRing.visible = fighter.isAlive;

    if (!this.mixer || !this.splitClips) {
      this.trail.clear();
      return;
    }

    const rawDt =
      this.lastAnimTime < 0
        ? 0.016
        : clamp(fighter.animTime - this.lastAnimTime, 0.001, 0.1);
    this.lastAnimTime = fighter.animTime;

    // Decay per-rig visual hit-stop & impact shudder
    if (this.visualHitStopTimer > 0) {
      this.visualHitStopTimer = Math.max(0, this.visualHitStopTimer - rawDt);
    }
    const animDt = this.visualHitStopTimer > 0 ? rawDt * 0.08 : rawDt;

    const yawRate =
      angleDiff(this.prevYaw, fighter.yaw) / Math.max(0.008, rawDt);
    this.prevYaw = fighter.yaw;

    // Undo previous frame's procedural bone offsets BEFORE AnimationMixer.update()
    // so constant-keyframe bones never accumulate pitch/yaw drift!
    this.clearProceduralBoneOffsets();

    // Alternate Hit_A / Hit_B cleanly each time fighter enters HitReaction
    if (fighter.state === 'HitReaction' && !this.wasInHitReaction) {
      this.hitVariantToggle = 1 - this.hitVariantToggle;
    }
    this.wasInHitReaction = fighter.state === 'HitReaction';

    // Local-space velocity decomposition for 8-way directional footwork & banking
    const sinY = Math.sin(fighter.yaw);
    const cosY = Math.cos(fighter.yaw);
    const vx = fighter.body.vx;
    const vz = fighter.body.vz;
    const localFwdVel = vx * sinY + vz * cosY;
    const localRightVel = -vx * cosY + vz * sinY;
    const horizSpeed = Math.hypot(vx, vz);

    const inSwing =
      (fighter.state === 'Attacking' || fighter.state === 'HeavyAttacking') &&
      fighter.activeAttack !== null;

    if (!fighter.isAlive || fighter.state === 'Dead') {
      const isSkel =
        this.classId === 'skeleton_knight' ||
        this.classId === 'skeleton_reaper' ||
        this.classId === 'skeleton_berserker';
      const deathClip =
        isSkel && this.clips.has('Death_C_Skeletons')
          ? 'Death_C_Skeletons'
          : this.classId === 'hammer' || this.classId === 'barbarian'
          ? 'Death_B'
          : 'Death_A';
      this.fadeFullBodyToClip(deathClip, 0.14, false, 1.0);
      this.mixer.update(rawDt);
      this.lockInPlaceRoot();
      this.modelHolder.rotation.set(0, 0, 0);
      this.modelHolder.position.set(0, 0, 0);
      this.trail.clear();
      return;
    }

    let targetPitch = 0;
    let targetRoll = 0;
    let targetChestTwist = 0;
    let targetSpinePitch = 0;
    let spinYawOffset = 0;

    if (inSwing && fighter.activeAttack) {
      const atk = fighter.activeAttack;
      const clipName = this.resolveAttackClipName(
        atk.animStyle,
        atk.isHeavy,
        fighter.activeComboStep
      );
      const isNewSwing = fighter.swingInstanceId !== this.lastSwingId;
      if (isNewSwing) {
        this.lastSwingId = fighter.swingInstanceId;
        this.trail.clear();
      }

      const upperAct = this.blendUpperToScrubClip(clipName, 0.05, isNewSwing);
      const win = CLIP_PHASE_WINDOWS[clipName] ?? {
        start: 0.04,
        strikeStart: 0.28,
        strikeEnd: 0.56,
        end: 0.94,
      };

      let norm = win.start;
      const swingSign = fighter.activeComboStep % 2 === 0 ? 1 : -1;

      if (fighter.attackPhase === 'Windup') {
        const p =
          1 -
          clamp(
            fighter.attackPhaseTimer / Math.max(0.04, atk.windupDuration),
            0,
            1
          );
        // Snappy ease-out anticipation coil right to strikeStart!
        const eased = 1 - Math.pow(1 - p, 2.15);
        norm = lerp(win.start, win.strikeStart, eased);
        targetPitch =
          atk.animStyle === 'ability_sword_warcry'
            ? -0.15 * eased
            : (atk.isHeavy ? -0.11 : -0.06) * eased;
        targetSpinePitch = (atk.isHeavy ? -0.08 : -0.04) * eased;
        targetChestTwist = (atk.isHeavy ? -0.26 : -0.19) * swingSign * eased;
      } else if (fighter.attackPhase === 'Active') {
        const p =
          1 -
          clamp(
            fighter.attackPhaseTimer / Math.max(0.04, atk.activeDuration),
            0,
            1
          );
        // Explosive whip acceleration through the strike window!
        const eased = 1 - Math.pow(1 - p, 2.75);
        norm = lerp(win.strikeStart, win.strikeEnd, eased);
        const driveCurve = Math.sin(p * Math.PI * 0.86 + 0.14);
        targetPitch = (atk.isHeavy ? 0.22 : 0.14) * driveCurve;
        targetSpinePitch = (atk.isHeavy ? 0.11 : 0.07) * driveCurve;
        targetChestTwist = (atk.isHeavy ? 0.29 : 0.24) * swingSign * eased;
        if (atk.animStyle === 'ability_dual_cyclone') {
          spinYawOffset = p * Math.PI * 6;
        } else if (
          atk.animStyle === 'ability_spear_sweep' ||
          atk.animStyle === 'axe_whirl'
        ) {
          spinYawOffset = eased * Math.PI * 2;
        }
      } else {
        const p =
          1 -
          clamp(
            fighter.attackPhaseTimer / Math.max(0.04, atk.recoveryDuration),
            0,
            1
          );
        const eased = 1 - Math.pow(1 - p, 1.75);
        norm = lerp(win.strikeEnd, win.end, eased);
        targetPitch =
          atk.animStyle === 'ability_spear_sweep'
            ? -0.16 * (1 - eased)
            : (atk.isHeavy ? 0.13 : 0.065) * (1 - eased);
        targetSpinePitch = 0.04 * (1 - eased);
        targetChestTwist = 0.16 * swingSign * (1 - eased);
      }

      if (upperAct && this.visualHitStopTimer <= 0) {
        upperAct.paused = false;
        upperAct.time = clamp(norm, 0, 0.995) * upperAct.getClip().duration;
      }

      // LAYERED LOWER BODY DURING ATTACKS:
      // - Airborne -> tucked Jump_Idle legs (aerial jump-attacks!)
      // - Moving/lunging fast -> real velocity-matched footsteps (zero foot sliding!)
      // - Planted strike -> synchronized martial stance footwork from the attack clip!
      const plantedSmash =
        atk.animStyle === 'ability_hammer_quake' ||
        atk.animStyle === 'ability_sword_warcry' ||
        atk.animStyle === 'taunt_roar' ||
        atk.animStyle === 'summon_roar';
      if (!fighter.body.isGrounded) {
        this.fadeLowerToClip('Jump_Idle', 0.08, true, 1.05);
      } else if (!plantedSmash && horizSpeed > 0.85) {
        this.applyDirectionalLowerBody(
          localFwdVel,
          localRightVel,
          horizSpeed,
          horizSpeed > 6.2,
          0.08
        );
      } else {
        const lowerAct = this.blendLowerToScrubClip(clipName, 0.06, isNewSwing);
        if (lowerAct && this.visualHitStopTimer <= 0) {
          lowerAct.paused = false;
          lowerAct.time = clamp(norm, 0, 0.995) * lowerAct.getClip().duration;
        }
      }

      this.mixer.update(animDt);
    } else if (fighter.isChargingHeavy) {
      const heavyClip =
        this.classId === 'spear' || this.classId === 'duelist'
          ? '2H_Melee_Attack_Stab'
          : this.classId === 'dual' ||
            this.classId === 'skeleton_reaper' ||
            this.classId === 'barbarian'
          ? '2H_Melee_Attack_Spin'
          : '2H_Melee_Attack_Chop';
      const win = CLIP_PHASE_WINDOWS[heavyClip];
      const upperAct = this.blendUpperToScrubClip(heavyClip, 0.065);
      const c = clamp(fighter.chargeRatio, 0, 1);
      const eased = 1 - Math.pow(1 - c, 1.85);
      const u = lerp(win.start, win.strikeStart, eased);
      // High-tension coiled weapon tremor as heavy charge nears peak!
      const tremor =
        c > 0.65 ? Math.sin(fighter.animTime * 46) * 0.018 * (c - 0.65) : 0;

      if (upperAct) {
        upperAct.paused = false;
        upperAct.time = u * upperAct.getClip().duration;
      }

      if (!fighter.body.isGrounded) {
        this.fadeLowerToClip('Jump_Idle', 0.08, true, 1.0);
      } else if (horizSpeed > 0.35) {
        this.applyDirectionalLowerBody(
          localFwdVel,
          localRightVel,
          horizSpeed,
          false,
          0.09
        );
      } else {
        const lowerAct = this.blendLowerToScrubClip(heavyClip, 0.08);
        if (lowerAct) {
          lowerAct.paused = false;
          lowerAct.time = u * lowerAct.getClip().duration;
        }
      }

      targetPitch = -0.11 * eased;
      targetSpinePitch = -0.07 * eased;
      targetChestTwist = -0.24 * eased + tremor;
      this.mixer.update(animDt);
    } else if (!fighter.body.isGrounded) {
      // AIRBORNE: Explosive Takeoff -> Mid-Air Soar!
      if (fighter.body.vy > 1.8) {
        this.fadeFullBodyToClip('Jump_Start', 0.06, false, 1.35);
        targetPitch = -0.065;
      } else {
        this.fadeFullBodyToClip('Jump_Idle', 0.11, true, 1.05);
        targetPitch = clamp(-fighter.body.vy * 0.013, -0.08, 0.13);
      }
      targetRoll = clamp(-localRightVel * 0.018, -0.095, 0.095);
      this.mixer.update(animDt);
    } else if (fighter.state === 'Blocking') {
      // Upper body holds tight guard / shield wall (or shudders on block impact)
      if (fighter.blockImpactTimer > 0) {
        this.fadeUpperToClip('Block_Hit', 0.035, false, 1.65);
        targetPitch = -0.095;
        targetSpinePitch = -0.05;
      } else {
        const blockClip =
          fighter.classId === 'spear' && fighter.blockElapsed < 0.22
            ? 'Block_Attack'
            : 'Blocking';
        this.fadeUpperToClip(blockClip, 0.075, true, 1.0);
        targetSpinePitch = 0.035;
      }

      // Lower body walks/strafes cleanly when moving with shield raised!
      if (horizSpeed > 0.32) {
        this.applyDirectionalLowerBody(
          localFwdVel,
          localRightVel,
          horizSpeed,
          false,
          0.09
        );
      } else if (Math.abs(yawRate) > 2.4) {
        this.fadeLowerToClip('Walking_A', 0.12, true, 0.78);
      } else {
        this.fadeLowerToClip('Blocking', 0.1, true, 1.0);
      }
      this.mixer.update(animDt);
    } else if (fighter.state === 'Dodging') {
      const mode = fighter.config.dodge.mode;
      let dodgeClip = 'Dodge_Forward';
      if (mode === 'shield_shove') {
        dodgeClip = 'Block_Attack';
        targetPitch = 0.17;
        targetSpinePitch = 0.08;
      } else {
        const dFwd = fighter.dodgeDirX * sinY + fighter.dodgeDirZ * cosY;
        const dRight = -fighter.dodgeDirX * cosY + fighter.dodgeDirZ * sinY;
        if (Math.abs(dRight) > Math.abs(dFwd)) {
          dodgeClip = dRight > 0 ? 'Dodge_Right' : 'Dodge_Left';
          targetRoll = dRight > 0 ? -0.16 : 0.16;
        } else {
          dodgeClip = dFwd < -0.2 ? 'Dodge_Backward' : 'Dodge_Forward';
          targetPitch = dFwd < -0.2 ? -0.12 : 0.15;
        }
      }
      const dur = Math.max(0.15, fighter.config.dodge.duration);
      const clipObj = this.clips.get(dodgeClip);
      const speed = clipObj ? clipObj.duration / dur : 1.3;
      this.fadeFullBodyToClip(dodgeClip, 0.045, false, speed);
      this.mixer.update(animDt);
    } else if (fighter.state === 'HitReaction') {
      const hitClip = this.hitVariantToggle === 0 ? 'Hit_A' : 'Hit_B';
      this.fadeFullBodyToClip(hitClip, 0.035, false, 1.48);
      targetPitch = -0.15;
      targetSpinePitch = -0.07;
      this.mixer.update(animDt);
    } else if (fighter.state === 'Stunned') {
      this.fadeFullBodyToClip('Hit_B', 0.09, true, 0.68);
      targetPitch = 0.07;
      targetRoll = Math.sin(fighter.animTime * 7.5) * 0.06;
      this.mixer.update(animDt);
    } else if (fighter.state === 'Moving' && horizSpeed > 0.25) {
      // 8-Way Directional Velocity-Matched Full-Body Locomotion!
      const { moveClip } = this.applyDirectionalLowerBody(
        localFwdVel,
        localRightVel,
        horizSpeed,
        fighter.isSprinting,
        0.1
      );
      const refSpeed = fighter.isSprinting
        ? 5.85
        : moveClip.includes('Strafe')
        ? 4.55
        : moveClip === 'Walking_Backwards'
        ? 3.55
        : horizSpeed > 4.55
        ? 5.55
        : 3.8;
      const playbackSpeed = clamp(horizSpeed / refSpeed, 0.68, 1.55);
      this.fadeUpperToClip(moveClip, 0.1, true, playbackSpeed);
      if (
        this.activeUpperAction &&
        this.activeLowerAction &&
        Math.abs(this.activeUpperAction.time - this.activeLowerAction.time) >
          0.035
      ) {
        this.activeUpperAction.time = this.activeLowerAction.time;
      }

      targetPitch = 0;
      targetSpinePitch = 0;
      targetRoll = clamp(
        -yawRate * 0.014 - localRightVel * 0.012,
        -0.09,
        0.09
      );
      // Subtle shoulder counter-swing on sprint & strafe (Y-axis only, zero forward/back rocking)
      targetChestTwist = clamp(-yawRate * 0.02, -0.12, 0.12);
      this.mixer.update(animDt);
    } else if (fighter.landingTimer > 0) {
      this.fadeFullBodyToClip('Jump_Land', 0.055, false, 1.55);
      targetSpinePitch = 0;
      this.mixer.update(animDt);
    } else {
      const idleClip = this.getIdleClipName();
      this.fadeUpperToClip(idleClip, 0.14, true, 1.0);
      // Subtle pivot footwork when spinning in place rapidly!
      if (Math.abs(yawRate) > 2.6) {
        this.fadeLowerToClip(this.getWalkClipName(), 0.12, true, 0.82);
        targetChestTwist = clamp(yawRate * 0.025, -0.12, 0.12);
      } else {
        this.fadeLowerToClip(idleClip, 0.14, true, 1.0);
      }
      targetPitch = 0;
      targetSpinePitch = 0;
      this.mixer.update(animDt);
    }

    this.lockInPlaceRoot();
    this.applySecondaryProceduralMotion(
      rawDt,
      fighter,
      horizSpeed,
      targetPitch,
      targetRoll,
      targetChestTwist,
      targetSpinePitch,
      spinYawOffset
    );

    // Update 3D Spline Weapon Slash Ribbons in World Space!
    this.root.updateMatrixWorld(true);
    this.weaponBaseAnchor.getWorldPosition(this.tmpBaseWorld);
    this.weaponTipAnchor.getWorldPosition(this.tmpTipWorld);

    const emitRibbon =
      inSwing &&
      (fighter.attackPhase === 'Active' ||
        (fighter.attackPhase === 'Windup' &&
          fighter.attackPhaseTimer < 0.055) ||
        (fighter.attackPhase === 'Recovery' &&
          fighter.activeAttack !== null &&
          fighter.attackPhaseTimer >
            fighter.activeAttack.recoveryDuration - 0.045));

    const tone: RibbonTone = fighter.activeAbility
      ? 'ability'
      : fighter.activeAttack?.isHeavy || fighter.activeAttack?.blockable === false
      ? 'heavy'
      : 'light';

    this.trail.primary.recordAndBuild(
      this.tmpBaseWorld,
      this.tmpTipWorld,
      tone,
      emitRibbon
    );

    if (this.hasOffhandBlade) {
      this.offhandBaseAnchor.getWorldPosition(this.tmpOffBaseWorld);
      this.offhandTipAnchor.getWorldPosition(this.tmpOffTipWorld);
      this.trail.offhand.recordAndBuild(
        this.tmpOffBaseWorld,
        this.tmpOffTipWorld,
        tone,
        emitRibbon
      );
    }
  }

  /**
   * Applies smooth secondary spine/chest martial torque, head target stabilization,
   * directional impact recoil, velocity banking, landing cushion, and flowing cape physics!
   */
  private applySecondaryProceduralMotion(
    dt: number,
    fighter: Fighter,
    horizSpeed: number,
    targetPitch: number,
    targetRoll: number,
    targetChestTwist: number,
    targetSpinePitch: number,
    spinYawOffset = 0
  ): void {
    const smoothAlpha = 1 - Math.exp(-18 * dt);
    const joltDecay = Math.exp(-22 * dt);

    this.impactJoltX *= joltDecay;
    this.impactJoltZ *= joltDecay;
    this.impactPitchImpulse *= joltDecay;
    this.impactRollImpulse *= joltDecay;

    this.smoothPitch = lerp(
      this.smoothPitch,
      targetPitch + this.impactPitchImpulse,
      smoothAlpha
    );
    this.smoothRoll = lerp(
      this.smoothRoll,
      targetRoll + this.impactRollImpulse,
      smoothAlpha
    );
    this.smoothChestTwist = lerp(
      this.smoothChestTwist,
      targetChestTwist,
      smoothAlpha
    );
    const aimTilt =
      fighter.state === 'Attacking' ||
      fighter.state === 'HeavyAttacking' ||
      fighter.state === 'Blocking' ||
      fighter.isChargingHeavy
        ? clamp(-(fighter.aimPitch || 0) * 0.42, -0.36, 0.36)
        : 0;

    this.smoothSpinePitch = lerp(
      this.smoothSpinePitch,
      targetSpinePitch + aimTilt,
      smoothAlpha
    );

    // Athletic knee-compression spring on jump landing
    let landDipY = 0;
    if (fighter.landingTimer > 0) {
      const p = fighter.landingTimer / 0.24;
      landDipY = -Math.sin(p * Math.PI) * 0.095;
    }

    // Convert world-space impact jolt into local root space
    const sinY = Math.sin(fighter.yaw);
    const cosY = Math.cos(fighter.yaw);
    const localJoltX = -this.impactJoltX * cosY + this.impactJoltZ * sinY;
    const localJoltZ = this.impactJoltX * sinY + this.impactJoltZ * cosY;
    const hitShudder =
      this.visualHitStopTimer > 0 && fighter.hitFlashTimer > 0
        ? Math.sin(fighter.animTime * 95) * 0.032
        : 0;

    this.modelHolder.position.set(
      localJoltX + hitShudder,
      landDipY,
      localJoltZ
    );
    this.modelHolder.rotation.set(
      this.smoothPitch,
      spinYawOffset,
      this.smoothRoll
    );

    this.applyProceduralBoneOffset(
      this.spineBone,
      this.smoothSpinePitch,
      this.smoothChestTwist * 0.38,
      this.appliedSpineOffsetQ
    );
    this.applyProceduralBoneOffset(
      this.chestBone,
      this.smoothSpinePitch * 0.5,
      this.smoothChestTwist * 0.72,
      this.appliedChestOffsetQ
    );
    // Counter-stabilize head during upper-body twists so gaze stays locked on target!
    if (spinYawOffset === 0) {
      this.applyProceduralBoneOffset(
        this.headBone,
        -this.smoothSpinePitch * 0.35,
        -this.smoothChestTwist * 0.52,
        this.appliedHeadOffsetQ
      );
    }

    // Dynamic cape billow when sprinting, leaping, dodging, or spinning!
    if (this.capeNode) {
      let desiredLift = 0.06 + clamp(horizSpeed / 7.6, 0, 0.56);
      if (!fighter.body.isGrounded) {
        desiredLift += clamp(-fighter.body.vy * 0.055 + 0.3, 0.14, 0.68);
      }
      if (fighter.state === 'Dodging' || Math.abs(spinYawOffset) > 0.1) {
        desiredLift += 0.38;
      }
      const flutter =
        Math.sin(fighter.animTime * (6.8 + horizSpeed * 1.45)) *
        (0.032 + horizSpeed * 0.0085);
      this.smoothCapeLift = lerp(
        this.smoothCapeLift,
        clamp(desiredLift, 0.04, 1.08),
        1 - Math.exp(-12 * dt)
      );
      this.capeNode.rotation.x = this.smoothCapeLift + flutter;
    }
  }

  public updatePreviewIdle(elapsed: number): void {
    if (!this.mixer) return;
    const dt =
      this.lastPreviewElapsed < 0
        ? 0.016
        : clamp(elapsed - this.lastPreviewElapsed, 0.001, 0.1);
    this.lastPreviewElapsed = elapsed;

    this.clearProceduralBoneOffsets();

    const idleClip = this.getIdleClipName();
    this.fadeFullBodyToClip(idleClip, 0.15, true, 1.0);
    this.mixer.update(dt);
    this.lockInPlaceRoot();
    this.modelHolder.rotation.set(0, 0, 0);
    this.modelHolder.position.set(0, 0, 0);
    if (this.capeNode) {
      this.capeNode.rotation.x = 0.08 + Math.sin(elapsed * 2.4) * 0.03;
    }
  }

  private clearProceduralBoneOffsets(): void {
    if (this.spineBone) {
      this.tmpInvOffsetQ.copy(this.appliedSpineOffsetQ).invert();
      this.spineBone.quaternion.multiply(this.tmpInvOffsetQ);
      this.appliedSpineOffsetQ.identity();
    }
    if (this.chestBone) {
      this.tmpInvOffsetQ.copy(this.appliedChestOffsetQ).invert();
      this.chestBone.quaternion.multiply(this.tmpInvOffsetQ);
      this.appliedChestOffsetQ.identity();
    }
    if (this.headBone) {
      this.tmpInvOffsetQ.copy(this.appliedHeadOffsetQ).invert();
      this.headBone.quaternion.multiply(this.tmpInvOffsetQ);
      this.appliedHeadOffsetQ.identity();
    }
  }

  private applyProceduralBoneOffset(
    bone: THREE.Object3D | null,
    pitchX: number,
    yawY: number,
    outAppliedQ: THREE.Quaternion
  ): void {
    if (!bone) return;
    if (Math.abs(pitchX) < 1e-6 && Math.abs(yawY) < 1e-6) {
      outAppliedQ.identity();
      return;
    }
    this.tmpOffsetEuler.set(pitchX, yawY, 0, 'YXZ');
    this.tmpOffsetQ.setFromEuler(this.tmpOffsetEuler);
    bone.quaternion.multiply(this.tmpOffsetQ);
    outAppliedQ.copy(this.tmpOffsetQ);
  }

  private lockInPlaceRoot(): void {
    if (this.rootBone) {
      this.rootBone.position.x = 0;
      this.rootBone.position.z = 0;
    }
  }
}
