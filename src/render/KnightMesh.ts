import * as THREE from 'three';
import {
  AttackAnimStyle,
  KNIGHT_CLASSES,
  KnightClassConfig,
  KnightClassId,
} from '../config/classes';
import { Fighter } from '../core/Fighter';
import { angleDiff, clamp, lerp } from '../core/math';
import { kayKitAssets, LoadedKayKitPack } from './KayKitAssetCache';
import { MaterialLibrary } from './PixelTextures';

/**
 * Single Catmull-Rom spline-interpolated 3D blade slash ribbon.
 * Produces a silky-smooth, razor-sharp crescent arc even on fast 120ms slashes!
 */
class SingleBladeRibbon {
  public readonly mesh: THREE.Mesh;
  private readonly maxRawSamples = 9;
  private readonly splineSteps = 26;
  private readonly history: Array<{
    base: THREE.Vector3;
    tip: THREE.Vector3;
  }> = [];
  private readonly positions: Float32Array;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly baseCurve = new THREE.CatmullRomCurve3([]);
  private readonly tipCurve = new THREE.CatmullRomCurve3([]);
  private readonly tmpBase = new THREE.Vector3();
  private readonly tmpTip = new THREE.Vector3();

  constructor() {
    const vertCount = this.splineSteps * 2;
    this.positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    for (let i = 0; i < this.splineSteps; i++) {
      const u = i / (this.splineSteps - 1);
      const fade = Math.pow(1 - u, 1.85);
      // Inner blade base: warm steel glow
      colors[i * 6 + 0] = 0.65 * fade;
      colors[i * 6 + 1] = 0.54 * fade;
      colors[i * 6 + 2] = 0.34 * fade;

      // Outer cutting edge: bright HDR white-gold flare
      colors[i * 6 + 3] = 1.65 * fade;
      colors[i * 6 + 4] = 1.38 * fade;
      colors[i * 6 + 5] = 0.88 * fade;

      if (i < this.splineSteps - 1) {
        const a = i * 2;
        const b = i * 2 + 1;
        const c = (i + 1) * 2;
        const d = (i + 1) * 2 + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);

    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  public clear(): void {
    this.history.length = 0;
    this.mesh.visible = false;
  }

  public recordAndBuild(
    worldBase: THREE.Vector3,
    worldTip: THREE.Vector3,
    isHeavy: boolean,
    active: boolean
  ): void {
    if (!active) {
      if (this.history.length > 0) this.history.pop();
      if (this.history.length > 0) this.history.pop();
      if (this.history.length < 2) {
        this.mesh.visible = false;
        return;
      }
    } else {
      // Avoid duplicate zero-distance sample if paused
      const head = this.history[0];
      if (!head || head.tip.distanceToSquared(worldTip) > 0.0004) {
        this.history.unshift({
          base: worldBase.clone(),
          tip: worldTip.clone(),
        });
        if (this.history.length > this.maxRawSamples) {
          this.history.length = this.maxRawSamples;
        }
      }
    }

    if (this.history.length < 2) {
      this.mesh.visible = false;
      return;
    }

    this.mat.color.setHex(isHeavy ? 0xff9e38 : 0xfff6dc);
    this.mat.opacity = isHeavy ? 0.94 : 0.78;

    this.baseCurve.points = this.history.map((h) => h.base);
    this.tipCurve.points = this.history.map((h) => h.tip);

    for (let i = 0; i < this.splineSteps; i++) {
      const t = i / (this.splineSteps - 1);
      this.baseCurve.getPoint(t, this.tmpBase);
      this.tipCurve.getPoint(t, this.tmpTip);

      // Subtle width taper toward the tail of the slash arc
      const taper = 1 - t * 0.42;
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

const BUILTIN_KNIGHT_EQUIPMENT = [
  '1H_Sword',
  '2H_Sword',
  '1H_Sword_Offhand',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
];

const BUILTIN_ROGUE_EQUIPMENT = [
  'Knife',
  'Knife_Offhand',
  '1H_Crossbow',
  '2H_Crossbow',
  'Throwable',
];

/**
 * Exact measured normalized [0..1] keyframe windows for every KayKit melee clip,
 * ensuring Windup coils right up to the backswing peak and Active whips through the true strike arc!
 */
const CLIP_PHASE_WINDOWS: Record<
  string,
  { start: number; strikeStart: number; strikeEnd: number; end: number }
> = {
  '1H_Melee_Attack_Slice_Diagonal': {
    start: 0.04,
    strikeStart: 0.29,
    strikeEnd: 0.56,
    end: 0.96,
  },
  '1H_Melee_Attack_Slice_Horizontal': {
    start: 0.04,
    strikeStart: 0.21,
    strikeEnd: 0.47,
    end: 0.95,
  },
  '1H_Melee_Attack_Chop': {
    start: 0.06,
    strikeStart: 0.46,
    strikeEnd: 0.65,
    end: 0.96,
  },
  '1H_Melee_Attack_Stab': {
    start: 0.04,
    strikeStart: 0.2,
    strikeEnd: 0.46,
    end: 0.95,
  },
  '2H_Melee_Attack_Chop': {
    start: 0.05,
    strikeStart: 0.39,
    strikeEnd: 0.63,
    end: 0.96,
  },
  '2H_Melee_Attack_Slice': {
    start: 0.05,
    strikeStart: 0.29,
    strikeEnd: 0.56,
    end: 0.96,
  },
  '2H_Melee_Attack_Stab': {
    start: 0.04,
    strikeStart: 0.21,
    strikeEnd: 0.48,
    end: 0.95,
  },
  '2H_Melee_Attack_Spin': {
    start: 0.04,
    strikeStart: 0.22,
    strikeEnd: 0.68,
    end: 0.96,
  },
  '2H_Melee_Attack_Spinning': {
    start: 0.02,
    strikeStart: 0.12,
    strikeEnd: 0.88,
    end: 0.98,
  },
  Spellcast_Raise: {
    start: 0.04,
    strikeStart: 0.34,
    strikeEnd: 0.68,
    end: 0.96,
  },
  Throw: {
    start: 0.05,
    strikeStart: 0.36,
    strikeEnd: 0.64,
    end: 0.96,
  },
  Block_Attack: {
    start: 0.04,
    strikeStart: 0.2,
    strikeEnd: 0.72,
    end: 0.96,
  },
  Dualwield_Melee_Attack_Slice: {
    start: 0.06,
    strikeStart: 0.41,
    strikeEnd: 0.73,
    end: 0.97,
  },
  Dualwield_Melee_Attack_Chop: {
    start: 0.05,
    strikeStart: 0.3,
    strikeEnd: 0.6,
    end: 0.96,
  },
  Dualwield_Melee_Attack_Stab: {
    start: 0.04,
    strikeStart: 0.21,
    strikeEnd: 0.49,
    end: 0.95,
  },
};

/**
 * Real Skeletal 3D Knight Visual Rig powered by CC0 KayKit Adventurers (.glb) models:
 * - Smooth crossfaded 3-phase martial-arts combat choreography with per-clip keyframe landmarks
 * - 8-way directional velocity-matched locomotion + 4-way directional dodges + reactive block shudder
 * - Full Jump / Mid-Air / Landing animation lifecycle + floor-pinned contact shadow
 * - Procedural secondary torso lunge/twist, acceleration lean, turn banking & flowing cape physics
 * - Catmull-Rom spline weapon slash ribbons (including twin dual-wield ribbons!)
 */
export class KnightVisualRig {
  public readonly root = new THREE.Group();
  public readonly trail = new WeaponRibbonTrail();
  public readonly config: KnightClassConfig;

  private readonly modelHolder = new THREE.Group();
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

  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;
  private activeClipName = '';
  private isCurrentClipScrubbed = false;

  private rootBone: THREE.Object3D | null = null;
  private chestBone: THREE.Object3D | null = null;
  private capeNode: THREE.Object3D | null = null;

  // Smoothed procedural secondary motion state
  private smoothPitch = 0;
  private smoothRoll = 0;
  private smoothChestTwist = 0;
  private smoothCapeLift = 0.08;
  private prevYaw = 0;
  private lastSwingId = -1;

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

  private trackMat(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    this.tintMaterials.push(mat);
    this.baseColors.push(mat.color.getHex());
    return mat;
  }

  private mountKayKitCharacter(pack: LoadedKayKitPack): void {
    this.modelHolder.clear();
    this.tintMaterials.length = 0;
    this.baseColors.length = 0;
    this.actions.clear();
    this.activeAction = null;
    this.activeClipName = '';
    this.isCurrentClipScrubbed = false;
    this.hasOffhandBlade = false;

    const isDualRogue = this.classId === 'dual';
    const clonedRig = isDualRogue
      ? kayKitAssets.cloneRogueRig()
      : kayKitAssets.cloneKnightRig();
    if (!clonedRig) return;

    this.clips = isDualRogue ? pack.rogueClips : pack.knightClips;

    if (this.classId === 'hammer') {
      clonedRig.scale.set(0.95, 0.89, 0.95);
    } else if (this.classId === 'spear') {
      clonedRig.scale.set(0.85, 0.89, 0.85);
    } else if (this.classId === 'dual') {
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
      isDualRogue ? 'rogue' : 'knight',
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

    for (const eqName of isDualRogue
      ? BUILTIN_ROGUE_EQUIPMENT
      : BUILTIN_KNIGHT_EQUIPMENT) {
      const node = clonedRig.getObjectByName(eqName);
      if (node) node.visible = false;
    }

    this.rootBone = clonedRig.getObjectByName('root') ?? null;
    this.chestBone = clonedRig.getObjectByName('chest') ?? null;
    this.capeNode =
      clonedRig.getObjectByName('Knight_Cape') ??
      clonedRig.getObjectByName('Rogue_Cape') ??
      null;

    // Note: Three.js GLTFLoader sanitizes dots in bone names ('handslot.r' -> 'handslotr')!
    const handSlotR =
      clonedRig.getObjectByName('handslotr') ??
      clonedRig.getObjectByName('handslot.r') ??
      clonedRig.getObjectByName('1H_Sword')?.parent ??
      clonedRig.getObjectByName('Knife')?.parent ??
      null;

    const handSlotL =
      clonedRig.getObjectByName('handslotl') ??
      clonedRig.getObjectByName('handslot.l') ??
      clonedRig.getObjectByName('1H_Sword_Offhand')?.parent ??
      clonedRig.getObjectByName('Knife_Offhand')?.parent ??
      null;

    const helmetNode = clonedRig.getObjectByName('Knight_Helmet') ?? null;

    this.configureClassLoadout(
      pack,
      clonedRig,
      handSlotR,
      handSlotL,
      helmetNode
    );

    this.modelHolder.add(clonedRig);

    this.mixer = new THREE.AnimationMixer(clonedRig);
    const idleName =
      this.classId === 'spear' && this.clips.has('2H_Melee_Idle')
        ? '2H_Melee_Idle'
        : 'Idle';
    this.fadeToClip(idleName, 0.01, true, 1.0);
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
        roughness: 0.34,
        metalness: 0.65,
      })
    );
    const darkIronMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b4252,
        roughness: 0.48,
        metalness: 0.58,
      })
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
          roughness: 0.52,
          metalness: 0.24,
        })
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
    } else {
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

  private getAction(clipName: string): THREE.AnimationAction | null {
    if (!this.mixer) return null;
    const cached = this.actions.get(clipName);
    if (cached) return cached;

    const clip = this.clips.get(clipName) ?? this.clips.get('Idle');
    if (!clip) return null;

    const act = this.mixer.clipAction(clip);
    this.actions.set(clipName, act);
    return act;
  }

  private fadeToClip(
    clipName: string,
    fadeDuration: number,
    loop: boolean,
    timeScale: number
  ): THREE.AnimationAction | null {
    const next = this.getAction(clipName);
    if (!next) return null;

    if (this.activeClipName !== clipName) {
      // If blending out of a manually scrubbed attack clip, give it gentle follow-through motion!
      if (this.activeAction && this.isCurrentClipScrubbed) {
        this.activeAction.setEffectiveTimeScale(0.32);
      }

      next.reset();
      next.setLoop(
        loop ? THREE.LoopRepeat : THREE.LoopOnce,
        loop ? Infinity : 1
      );
      next.clampWhenFinished = !loop;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(timeScale);
      next.play();

      if (this.activeAction && this.activeAction !== next) {
        this.activeAction.crossFadeTo(next, fadeDuration, false);
      }

      this.activeAction = next;
      this.activeClipName = clipName;
      this.isCurrentClipScrubbed = false;
    } else {
      next.setEffectiveTimeScale(timeScale);
    }

    return next;
  }

  /**
   * Smoothly crossfades into a phase-scrubbed attack/charge clip with ZERO hard-cut snapping!
   */
  private blendToScrubClip(
    clipName: string,
    fadeDuration = 0.075,
    forceRestart = false
  ): THREE.AnimationAction | null {
    const next = this.getAction(clipName);
    if (!next || !this.mixer) return null;

    if (this.activeClipName !== clipName) {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
      next.play();

      if (this.activeAction && this.activeAction !== next) {
        this.activeAction.crossFadeTo(next, fadeDuration, false);
      }

      this.activeAction = next;
      this.activeClipName = clipName;
      this.isCurrentClipScrubbed = true;
    } else if (forceRestart) {
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
    } else {
      next.setEffectiveTimeScale(0);
      this.isCurrentClipScrubbed = true;
    }

    return next;
  }

  /**
   * Selects distinct, choreographed KayKit attack & ability clips across all 4 classes!
   */
  private resolveAttackClipName(
    style: AttackAnimStyle,
    isHeavy: boolean,
    comboStep: number
  ): string {
    if (style === 'ability_sword_rush') return '2H_Melee_Attack_Slice';
    if (style === 'ability_sword_warcry') return 'Spellcast_Raise';
    if (style === 'ability_dual_cyclone') return '2H_Melee_Attack_Spinning';
    if (style === 'ability_dual_dagger') return 'Throw';
    if (style === 'ability_spear_dragon') return '2H_Melee_Attack_Stab';
    if (style === 'ability_spear_sweep') return '2H_Melee_Attack_Spin';
    if (style === 'ability_hammer_ram') return 'Block_Attack';
    if (style === 'ability_hammer_quake') return '2H_Melee_Attack_Chop';

    if (style === 'dual_left') return 'Dualwield_Melee_Attack_Slice';
    if (style === 'dual_cross') return 'Dualwield_Melee_Attack_Chop';
    if (style === 'dual_finisher') {
      return isHeavy ? '2H_Melee_Attack_Spin' : 'Dualwield_Melee_Attack_Stab';
    }
    if (style === 'spear_poke') {
      return comboStep % 2 === 0
        ? '1H_Melee_Attack_Stab'
        : '2H_Melee_Attack_Stab';
    }
    if (style === 'spear_impale') return '2H_Melee_Attack_Stab';
    if (style === 'overhead_cleave' || style === 'hammer_slam') {
      return '2H_Melee_Attack_Chop';
    }
    if (style === 'slash_left') {
      return this.classId === 'hammer'
        ? '1H_Melee_Attack_Chop'
        : '1H_Melee_Attack_Slice_Diagonal';
    }
    // slash_right (2nd combo swing)
    return '1H_Melee_Attack_Slice_Horizontal';
  }

  public syncFromFighter(fighter: Fighter): void {
    this.root.position.set(fighter.body.x, fighter.body.y, fighter.body.z);
    this.root.rotation.y = fighter.yaw;

    // Pin contact shadow & foot ring directly onto the floor beneath jumping knights!
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

    // Hit-flash tint
    const flash = fighter.hitFlashTimer > 0;
    for (let i = 0; i < this.tintMaterials.length; i++) {
      const m = this.tintMaterials[i];
      if (flash) {
        m.color.setHex(0xfff2cc);
        m.emissive.setHex(0x884411);
      } else {
        m.color.setHex(this.baseColors[i]);
        m.emissive.setHex(0x000000);
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
        this.buffAuraMat.color.setHex(0x42f5c8);
      } else {
        this.buffAuraMat.color.setHex(0xff8438);
      }
      this.buffAuraRing.position.y =
        0.32 + Math.sin(fighter.animTime * 6.5) * 0.08;
      const pulse = 1 + Math.sin(fighter.animTime * 9.0) * 0.06;
      this.buffAuraRing.scale.setScalar(pulse);
    }

    this.footRing.visible = fighter.isAlive;

    if (!this.mixer) {
      this.trail.clear();
      return;
    }

    const dt =
      this.lastAnimTime < 0
        ? 0.016
        : clamp(fighter.animTime - this.lastAnimTime, 0.001, 0.1);
    this.lastAnimTime = fighter.animTime;

    const yawRate = angleDiff(this.prevYaw, fighter.yaw) / Math.max(0.008, dt);
    this.prevYaw = fighter.yaw;

    // Local-space velocity decomposition for 8-way directional animations & banking
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
      const deathClip = this.classId === 'hammer' ? 'Death_B' : 'Death_A';
      this.fadeToClip(deathClip, 0.14, false, 1.0);
      this.mixer.update(dt);
      this.lockInPlaceRoot();
      this.modelHolder.rotation.set(0, 0, 0);
      this.modelHolder.position.y = 0;
      this.trail.clear();
      return;
    }

    let targetPitch = 0;
    let targetRoll = 0;
    let targetChestTwist = 0;
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

      const act = this.blendToScrubClip(clipName, 0.07, isNewSwing);
      if (act) {
        act.paused = false;
        const clipDur = act.getClip().duration;
        const win = CLIP_PHASE_WINDOWS[clipName] ?? {
          start: 0.04,
          strikeStart: 0.3,
          strikeEnd: 0.62,
          end: 0.96,
        };

        let norm = win.start;
        const swingSign = fighter.activeComboStep % 2 === 0 ? 1 : -1;

        if (fighter.attackPhase === 'Windup') {
          const p =
            1 - clamp(fighter.attackPhaseTimer / atk.windupDuration, 0, 1);
          const eased = 1 - Math.pow(1 - p, 1.85);
          norm = lerp(win.start, win.strikeStart, eased);
          targetPitch =
            atk.animStyle === 'ability_sword_warcry' ? -0.14 * eased : -0.07 * eased;
          targetChestTwist = -0.16 * swingSign * eased;
        } else if (fighter.attackPhase === 'Active') {
          const p =
            1 - clamp(fighter.attackPhaseTimer / atk.activeDuration, 0, 1);
          const eased = 1 - Math.pow(1 - p, 2.35);
          norm = lerp(win.strikeStart, win.strikeEnd, eased);
          targetPitch =
            (atk.isHeavy ? 0.19 : 0.12) * Math.sin(p * Math.PI * 0.85 + 0.15);
          targetChestTwist = 0.22 * swingSign * eased;
          if (atk.animStyle === 'ability_dual_cyclone') {
            // 3 full 360° blade revolutions across Active window!
            spinYawOffset = p * Math.PI * 6;
          } else if (atk.animStyle === 'ability_spear_sweep') {
            spinYawOffset = eased * Math.PI * 2;
          }
        } else {
          const p =
            1 - clamp(fighter.attackPhaseTimer / atk.recoveryDuration, 0, 1);
          const eased = 1 - Math.pow(1 - p, 1.65);
          norm = lerp(win.strikeEnd, win.end, eased);
          targetPitch =
            atk.animStyle === 'ability_spear_sweep'
              ? -0.16 * (1 - eased)
              : (atk.isHeavy ? 0.12 : 0.06) * (1 - eased);
          targetChestTwist = 0.14 * swingSign * (1 - eased);
        }

        act.time = clamp(norm, 0, 0.995) * clipDur;
      }
      this.mixer.update(dt);
    } else if (fighter.isChargingHeavy) {
      const heavyClip =
        this.classId === 'spear'
          ? '2H_Melee_Attack_Stab'
          : this.classId === 'dual'
          ? '2H_Melee_Attack_Spin'
          : '2H_Melee_Attack_Chop';
      const win = CLIP_PHASE_WINDOWS[heavyClip];
      const act = this.blendToScrubClip(heavyClip, 0.09);
      if (act) {
        act.paused = false;
        const c = clamp(fighter.chargeRatio, 0, 1);
        const eased = 1 - Math.pow(1 - c, 1.7);
        const u = lerp(win.start, win.strikeStart, eased);
        act.time = u * act.getClip().duration;
        targetPitch = -0.09 * eased;
        targetChestTwist = -0.18 * eased;
      }
      this.mixer.update(dt);
    } else if (!fighter.body.isGrounded) {
      // AIRBORNE: Takeoff -> Mid-Air Soar!
      if (fighter.body.vy > 1.8) {
        this.fadeToClip('Jump_Start', 0.06, false, 1.35);
        targetPitch = -0.06;
      } else {
        this.fadeToClip('Jump_Idle', 0.12, true, 1.05);
        targetPitch = clamp(-fighter.body.vy * 0.012, -0.08, 0.12);
      }
      targetRoll = clamp(-localRightVel * 0.018, -0.09, 0.09);
      this.mixer.update(dt);
    } else if (fighter.state === 'Blocking') {
      if (fighter.blockImpactTimer > 0) {
        // Visibly shudder shield/sword on blocked strike!
        this.fadeToClip('Block_Hit', 0.04, false, 1.55);
        targetPitch = -0.08;
      } else {
        const blockClip =
          fighter.classId === 'spear' && fighter.blockElapsed < 0.22
            ? 'Block_Attack'
            : 'Blocking';
        this.fadeToClip(blockClip, 0.09, true, 1.0);
      }
      this.mixer.update(dt);
    } else if (fighter.state === 'Dodging') {
      const mode = fighter.config.dodge.mode;
      let dodgeClip = 'Dodge_Forward';
      if (mode === 'shield_shove') {
        dodgeClip = 'Block_Attack';
        targetPitch = 0.15;
      } else {
        const dFwd = fighter.dodgeDirX * sinY + fighter.dodgeDirZ * cosY;
        const dRight = -fighter.dodgeDirX * cosY + fighter.dodgeDirZ * sinY;
        if (Math.abs(dRight) > Math.abs(dFwd)) {
          dodgeClip = dRight > 0 ? 'Dodge_Right' : 'Dodge_Left';
          targetRoll = dRight > 0 ? -0.14 : 0.14;
        } else {
          dodgeClip = dFwd < -0.2 ? 'Dodge_Backward' : 'Dodge_Forward';
          targetPitch = dFwd < -0.2 ? -0.1 : 0.12;
        }
      }
      const dur = Math.max(0.15, fighter.config.dodge.duration);
      const clipObj = this.clips.get(dodgeClip);
      const speed = clipObj ? clipObj.duration / dur : 1.25;
      this.fadeToClip(dodgeClip, 0.05, false, speed);
      this.mixer.update(dt);
    } else if (fighter.state === 'HitReaction') {
      this.fadeToClip('Hit_A', 0.04, false, 1.4);
      targetPitch = -0.14;
      this.mixer.update(dt);
    } else if (fighter.state === 'Stunned') {
      this.fadeToClip('Hit_B', 0.1, true, 0.65);
      targetPitch = 0.06;
      this.mixer.update(dt);
    } else if (fighter.state === 'Moving') {
      // 8-Way Directional Velocity-Matched Locomotion!
      let moveClip = 'Walking_A';
      let refSpeed = 3.9;

      if (fighter.isSprinting && localFwdVel >= -0.5) {
        moveClip = this.classId === 'dual' ? 'Running_B' : 'Running_A';
        refSpeed = 5.9;
        targetPitch = 0.095;
      } else if (Math.abs(localRightVel) > Math.abs(localFwdVel) * 1.15) {
        moveClip =
          localRightVel > 0 ? 'Running_Strafe_Right' : 'Running_Strafe_Left';
        refSpeed = 4.6;
      } else if (localFwdVel < -0.55) {
        moveClip = 'Walking_Backwards';
        refSpeed = 3.6;
        targetPitch = -0.04;
      } else if (horizSpeed > 4.6) {
        moveClip = 'Running_A';
        refSpeed = 5.6;
        targetPitch = 0.065;
      } else {
        moveClip = 'Walking_A';
        refSpeed = 3.85;
        targetPitch = 0.03;
      }

      const playbackSpeed = clamp(horizSpeed / refSpeed, 0.72, 1.48);
      this.fadeToClip(moveClip, 0.12, true, playbackSpeed);
      targetRoll = clamp(
        -yawRate * 0.016 - localRightVel * 0.015,
        -0.11,
        0.11
      );
      this.mixer.update(dt);
    } else if (fighter.landingTimer > 0) {
      // Crisp athletic landing absorption right after touching down!
      this.fadeToClip('Jump_Land', 0.06, false, 1.55);
      this.mixer.update(dt);
    } else {
      const idleClip =
        this.classId === 'spear' && this.clips.has('2H_Melee_Idle')
          ? '2H_Melee_Idle'
          : 'Idle';
      this.fadeToClip(idleClip, 0.16, true, 1.0);
      this.mixer.update(dt);
    }

    this.lockInPlaceRoot();
    this.applySecondaryProceduralMotion(
      dt,
      fighter,
      horizSpeed,
      targetPitch,
      targetRoll,
      targetChestTwist,
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
          fighter.attackPhaseTimer < 0.045) ||
        (fighter.attackPhase === 'Recovery' &&
          fighter.activeAttack !== null &&
          fighter.attackPhaseTimer >
            fighter.activeAttack.recoveryDuration - 0.04));

    const isHeavySwing = Boolean(fighter.activeAttack?.isHeavy);
    this.trail.primary.recordAndBuild(
      this.tmpBaseWorld,
      this.tmpTipWorld,
      isHeavySwing,
      emitRibbon
    );

    if (this.hasOffhandBlade) {
      this.offhandBaseAnchor.getWorldPosition(this.tmpOffBaseWorld);
      this.offhandTipAnchor.getWorldPosition(this.tmpOffTipWorld);
      this.trail.offhand.recordAndBuild(
        this.tmpOffBaseWorld,
        this.tmpOffTipWorld,
        isHeavySwing,
        emitRibbon
      );
    }
  }

  /**
   * Applies smooth secondary upper-body torque, velocity lean/banking, landing knee-cushion,
   * and flowing cape physics on top of skeletal keyframes!
   */
  private applySecondaryProceduralMotion(
    dt: number,
    fighter: Fighter,
    horizSpeed: number,
    targetPitch: number,
    targetRoll: number,
    targetChestTwist: number,
    spinYawOffset = 0
  ): void {
    const smoothAlpha = 1 - Math.exp(-16 * dt);
    this.smoothPitch = lerp(this.smoothPitch, targetPitch, smoothAlpha);
    this.smoothRoll = lerp(this.smoothRoll, targetRoll, smoothAlpha);
    this.smoothChestTwist = lerp(
      this.smoothChestTwist,
      targetChestTwist,
      smoothAlpha
    );

    // Subtle knee-compression spring on jump landing
    let landDipY = 0;
    if (fighter.landingTimer > 0) {
      const p = fighter.landingTimer / 0.24;
      landDipY = -Math.sin(p * Math.PI) * 0.085;
    }

    this.modelHolder.position.y = landDipY;
    this.modelHolder.rotation.set(this.smoothPitch, spinYawOffset, this.smoothRoll);

    if (this.chestBone) {
      this.chestBone.rotation.y += this.smoothChestTwist;
    }

    // Dynamic cape billow when sprinting, leaping, or falling through air!
    if (this.capeNode) {
      let desiredLift = 0.06 + clamp(horizSpeed / 8.0, 0, 0.52);
      if (!fighter.body.isGrounded) {
        desiredLift += clamp(-fighter.body.vy * 0.055 + 0.28, 0.12, 0.65);
      }
      if (fighter.state === 'Dodging') {
        desiredLift += 0.35;
      }
      const flutter =
        Math.sin(fighter.animTime * (6.5 + horizSpeed * 1.4)) *
        (0.03 + horizSpeed * 0.008);
      this.smoothCapeLift = lerp(
        this.smoothCapeLift,
        clamp(desiredLift, 0.04, 1.05),
        1 - Math.exp(-11 * dt)
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

    const idleClip =
      this.classId === 'spear' && this.clips.has('2H_Melee_Idle')
        ? '2H_Melee_Idle'
        : 'Idle';
    this.fadeToClip(idleClip, 0.15, true, 1.0);
    this.mixer.update(dt);
    this.lockInPlaceRoot();
    if (this.capeNode) {
      this.capeNode.rotation.x = 0.08 + Math.sin(elapsed * 2.4) * 0.04;
    }
  }

  private lockInPlaceRoot(): void {
    if (this.rootBone) {
      this.rootBone.position.x = 0;
      this.rootBone.position.z = 0;
    }
  }
}
