import * as THREE from 'three';
import {
  AttackAnimStyle,
  KNIGHT_CLASSES,
  KnightClassConfig,
  KnightClassId,
} from '../config/classes';
import { Fighter } from '../core/Fighter';
import { clamp } from '../core/math';
import { kayKitAssets, LoadedKayKitPack } from './KayKitAssetCache';
import { MaterialLibrary } from './PixelTextures';

/**
 * Dynamic 3D World-Space Ribbon Trail following the real animated weapon bone!
 */
class WeaponRibbonTrail {
  public readonly mesh: THREE.Mesh;
  private readonly maxSamples = 12;
  private readonly history: Array<{
    base: THREE.Vector3;
    tip: THREE.Vector3;
  }> = [];
  private readonly positions: Float32Array;
  private readonly mat: THREE.MeshBasicMaterial;

  constructor() {
    const vertCount = this.maxSamples * 2;
    this.positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const indices: number[] = [];

    for (let i = 0; i < this.maxSamples; i++) {
      const fade = 1 - i / (this.maxSamples - 1);
      const intensity = fade * fade;
      colors[i * 6 + 0] = 0.72 * intensity;
      colors[i * 6 + 1] = 0.56 * intensity;
      colors[i * 6 + 2] = 0.26 * intensity;

      colors[i * 6 + 3] = 1.42 * intensity;
      colors[i * 6 + 4] = 1.18 * intensity;
      colors[i * 6 + 5] = 0.68 * intensity;

      if (i < this.maxSamples - 1) {
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
      opacity: 0.78,
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
      if (this.history.length < 2) {
        this.mesh.visible = false;
        return;
      }
    } else {
      this.history.unshift({
        base: worldBase.clone(),
        tip: worldTip.clone(),
      });
      if (this.history.length > this.maxSamples) {
        this.history.length = this.maxSamples;
      }
    }

    if (this.history.length < 2) {
      this.mesh.visible = false;
      return;
    }

    this.mat.color.setHex(isHeavy ? 0xff9f38 : 0xfff4cf);
    this.mat.opacity = isHeavy ? 0.9 : 0.72;

    for (let i = 0; i < this.maxSamples; i++) {
      const sample = this.history[Math.min(i, this.history.length - 1)];
      const idx = i * 6;
      this.positions[idx] = sample.base.x;
      this.positions[idx + 1] = sample.base.y;
      this.positions[idx + 2] = sample.base.z;

      this.positions[idx + 3] = sample.tip.x;
      this.positions[idx + 4] = sample.tip.y;
      this.positions[idx + 5] = sample.tip.z;
    }

    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = true;
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
 * Real Skeletal 3D Knight Visual Rig powered by CC0 KayKit Adventurers (.glb) models
 * (`Knight.glb` & `Rogue_Hooded.glb`) + Three.js `AnimationMixer` with 76 skeletal animations,
 * palette-customized gradient atlases per class/faction, and phase-locked combat choreography.
 */
export class KnightVisualRig {
  public readonly root = new THREE.Group();
  public readonly trail = new WeaponRibbonTrail();
  public readonly config: KnightClassConfig;

  private readonly modelHolder = new THREE.Group();
  private readonly stunRing = new THREE.Group();
  private readonly footRing: THREE.Mesh;
  private readonly contactShadow: THREE.Mesh;

  private readonly weaponBaseAnchor = new THREE.Object3D();
  private readonly weaponTipAnchor = new THREE.Object3D();
  private readonly tmpBaseWorld = new THREE.Vector3();
  private readonly tmpTipWorld = new THREE.Vector3();

  private readonly classId: KnightClassId;
  private readonly clothHex: number;
  private readonly tintMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly baseColors: number[] = [];

  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private actions = new Map<string, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;
  private activeClipName = '';
  private rootBone: THREE.Object3D | null = null;

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

    // Ground Contact Shadow + Tactical Foot Ring
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

    // Mount real KayKit GLB model immediately if cached, or hot-mount the instant preload completes!
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

    const isDualRogue = this.classId === 'dual';
    const clonedRig = isDualRogue
      ? kayKitAssets.cloneRogueRig()
      : kayKitAssets.cloneKnightRig();
    if (!clonedRig) return;

    this.clips = isDualRogue ? pack.rogueClips : pack.knightClips;

    // Class-distinct scale so heavy Bastion Knight looks broader & taller than agile Duelist
    if (this.classId === 'hammer') {
      clonedRig.scale.set(0.95, 0.89, 0.95);
    } else if (this.classId === 'spear') {
      clonedRig.scale.set(0.85, 0.89, 0.85);
    } else if (this.classId === 'dual') {
      clonedRig.scale.set(0.85, 0.85, 0.85);
    } else {
      clonedRig.scale.set(0.87, 0.86, 0.87);
    }

    // Build per-fighter customized KayKit gradient atlas material (preserves hit-flash isolation too!)
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

    // Hide all built-in slot items first
    for (const eqName of isDualRogue
      ? BUILTIN_ROGUE_EQUIPMENT
      : BUILTIN_KNIGHT_EQUIPMENT) {
      const node = clonedRig.getObjectByName(eqName);
      if (node) node.visible = false;
    }

    this.rootBone = clonedRig.getObjectByName('root') ?? null;

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

    // Equip class-specific 3D weapons, shields & crests!
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
      // Class A: Armored Paladin Knight with KayKit's winged 2H_Sword + Royal Plume!
      const sword2H = clonedRig.getObjectByName('2H_Sword');
      if (sword2H) {
        sword2H.visible = true;
        this.weaponBaseAnchor.position.set(0, 0.25, 0);
        this.weaponTipAnchor.position.set(0, 1.95, 0);
        sword2H.add(this.weaponBaseAnchor);
        sword2H.add(this.weaponTipAnchor);
      }

      if (helmetNode) {
        // Cascading heraldic plume on top of Knight_Helmet
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
      // Class B: Hooded Medieval Bladedancer wielding Twin KayKit Knight Swords!
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

        this.weaponBaseAnchor.position.set(0, 0.2, 0);
        this.weaponTipAnchor.position.set(0, 1.4, 0);
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
      }
    } else if (this.classId === 'spear') {
      // Class C: Vanguard Spear Knight with KayKit Badge_Shield + Winged Partisan Spear!
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
        // Match exact local grip transform of KayKit's 2H_Sword on handslot.r!
        spear.position.set(0, 0.033, 0);
        spear.rotation.y = Math.PI;
        handSlotR.add(spear);

        this.weaponBaseAnchor.position.set(0, 1.72, 0);
        this.weaponTipAnchor.position.set(0, 2.68, 0);
        spear.add(this.weaponBaseAnchor);
        spear.add(this.weaponTipAnchor);
      }
    } else {
      // Class D: Heavy Bastion Knight with KayKit Spike_Shield + Siege Warhammer + Helmet Horns!
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
        // Curved Siege Horns on Juggernaut Knight_Helmet
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
      new THREE.CylinderGeometry(0.048, 0.056, 2.38, 10),
      woodMat
    );
    shaft.position.y = 0.78;
    shaft.castShadow = true;
    g.add(shaft);

    for (const ry of [0.18, 0.75, 1.88]) {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.068, 0.09, 10),
        goldMat
      );
      collar.position.y = ry;
      g.add(collar);
    }

    const buttCap = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.24, 8),
      steelMat
    );
    buttCap.rotation.x = Math.PI;
    buttCap.position.y = -0.48;
    g.add(buttCap);

    // Chunky KayKit-proportioned Winged Partisan Spearhead!
    const pShape = new THREE.Shape();
    pShape.moveTo(0, 0.76);
    pShape.lineTo(0.13, 0.36);
    pShape.lineTo(0.28, 0.18);
    pShape.lineTo(0.11, 0.12);
    pShape.lineTo(0.07, 0);
    pShape.lineTo(-0.07, 0);
    pShape.lineTo(-0.11, 0.12);
    pShape.lineTo(-0.28, 0.18);
    pShape.lineTo(-0.13, 0.36);
    pShape.closePath();

    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(pShape, {
        depth: 0.042,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.018,
        bevelSegments: 2,
      }),
      steelMat
    );
    blade.position.set(0, 1.92, -0.021);
    blade.castShadow = true;
    g.add(blade);

    const pennant = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.54, 4),
      clothMat
    );
    pennant.position.set(0.22, 1.82, 0);
    pennant.rotation.z = -Math.PI * 0.42;
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

    // Chunky Beveled KayKit-proportioned Warhammer Head + Back Raven Spike!
    // Aligned along X-axis (-X leading strike face, +X rear spike), matching KayKit's 1H_Axe/1H_Sword plane!
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
    } else {
      next.setEffectiveTimeScale(timeScale);
    }

    return next;
  }

  /**
   * Immediately activates a scrubbed pose clip at full weight=1 with timeScale=0,
   * avoiding stuck crossfade weights when manually driving `action.time` by combat phase!
   */
  private activateScrubClip(clipName: string): THREE.AnimationAction | null {
    const next = this.getAction(clipName);
    if (!next || !this.mixer) return null;

    if (this.activeClipName !== clipName) {
      this.mixer.stopAllAction();
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
      next.play();

      this.activeAction = next;
      this.activeClipName = clipName;
    } else {
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(0);
    }

    return next;
  }

  private resolveAttackClipName(
    style: AttackAnimStyle,
    isHeavy: boolean
  ): string {
    if (style === 'dual_left') return 'Dualwield_Melee_Attack_Slice';
    if (style === 'dual_cross') return 'Dualwield_Melee_Attack_Chop';
    if (style === 'dual_finisher') {
      return isHeavy ? '2H_Melee_Attack_Spin' : 'Dualwield_Melee_Attack_Stab';
    }
    if (style === 'spear_poke') return '1H_Melee_Attack_Stab';
    if (style === 'spear_impale') return '2H_Melee_Attack_Stab';
    if (style === 'overhead_cleave' || style === 'hammer_slam') {
      return '2H_Melee_Attack_Chop';
    }
    if (style === 'slash_left') {
      return this.classId === 'hammer'
        ? '1H_Melee_Attack_Chop'
        : '1H_Melee_Attack_Slice_Diagonal';
    }
    return this.classId === 'hammer'
      ? '1H_Melee_Attack_Chop'
      : '1H_Melee_Attack_Slice_Horizontal';
  }

  public syncFromFighter(fighter: Fighter): void {
    this.root.position.set(fighter.body.x, fighter.body.y, fighter.body.z);
    this.root.rotation.y = fighter.yaw;

    // Hit-flash tint across all character & weapon materials
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
    this.footRing.visible = fighter.isAlive;
    this.contactShadow.scale.setScalar(fighter.isAlive ? 1.0 : 1.35);

    if (!this.mixer) {
      this.trail.clear();
      return;
    }

    const dt =
      this.lastAnimTime < 0
        ? 0.016
        : clamp(fighter.animTime - this.lastAnimTime, 0, 0.1);
    this.lastAnimTime = fighter.animTime;

    const inSwing =
      (fighter.state === 'Attacking' || fighter.state === 'HeavyAttacking') &&
      fighter.activeAttack !== null;

    if (!fighter.isAlive || fighter.state === 'Dead') {
      const deathClip = this.classId === 'hammer' ? 'Death_B' : 'Death_A';
      this.fadeToClip(deathClip, 0.12, false, 1.0);
      this.mixer.update(dt);
      this.lockInPlaceRoot();
      this.trail.clear();
      return;
    }

    if (inSwing && fighter.activeAttack) {
      const atk = fighter.activeAttack;
      const clipName = this.resolveAttackClipName(atk.animStyle, atk.isHeavy);
      const act = this.activateScrubClip(clipName);
      if (act) {
        act.paused = false;
        const clipDur = act.getClip().duration;
        // Phase-locked animation scrubbing: Active hitbox window ALWAYS matches peak strike frames!
        let norm = 0;
        if (fighter.attackPhase === 'Windup') {
          const p = 1 - clamp(fighter.attackPhaseTimer / atk.windupDuration, 0, 1);
          norm = p * 0.34;
        } else if (fighter.attackPhase === 'Active') {
          const p = 1 - clamp(fighter.attackPhaseTimer / atk.activeDuration, 0, 1);
          norm = 0.34 + p * 0.34;
        } else {
          const p = 1 - clamp(fighter.attackPhaseTimer / atk.recoveryDuration, 0, 1);
          norm = 0.68 + p * 0.32;
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
      const act = this.activateScrubClip(heavyClip);
      if (act) {
        act.paused = false;
        act.time =
          clamp(fighter.chargeRatio, 0, 1) * 0.32 * act.getClip().duration;
      }
      this.mixer.update(dt);
    } else if (fighter.state === 'Blocking') {
      const blockClip =
        fighter.classId === 'spear' ? 'Block_Attack' : 'Blocking';
      this.fadeToClip(blockClip, 0.08, true, 1.0);
      this.mixer.update(dt);
    } else if (fighter.state === 'Dodging') {
      const mode = fighter.config.dodge.mode;
      const dodgeClip =
        mode === 'shield_shove'
          ? 'Block_Attack'
          : mode === 'backstep'
          ? 'Dodge_Backward'
          : 'Dodge_Forward';
      const dur = Math.max(0.15, fighter.config.dodge.duration);
      const clipObj = this.clips.get(dodgeClip);
      const speed = clipObj ? clipObj.duration / dur : 1.2;
      this.fadeToClip(dodgeClip, 0.05, false, speed);
      this.mixer.update(dt);
    } else if (fighter.state === 'HitReaction') {
      this.fadeToClip('Hit_A', 0.05, false, 1.35);
      this.mixer.update(dt);
    } else if (fighter.state === 'Stunned') {
      this.fadeToClip('Hit_B', 0.1, true, 0.65);
      this.mixer.update(dt);
    } else if (fighter.state === 'Moving') {
      const moveClip = fighter.isSprinting ? 'Running_A' : 'Walking_A';
      const speed = fighter.isSprinting ? 1.22 : 1.32;
      this.fadeToClip(moveClip, 0.12, true, speed);
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

    // Update 3D Weapon Slash Ribbon in World Space!
    this.root.updateMatrixWorld(true);
    this.weaponBaseAnchor.getWorldPosition(this.tmpBaseWorld);
    this.weaponTipAnchor.getWorldPosition(this.tmpTipWorld);

    const emitRibbon =
      inSwing &&
      (fighter.attackPhase === 'Active' ||
        (fighter.attackPhase === 'Windup' &&
          fighter.attackPhaseTimer < 0.05));

    this.trail.recordAndBuild(
      this.tmpBaseWorld,
      this.tmpTipWorld,
      Boolean(fighter.activeAttack?.isHeavy),
      emitRibbon
    );
  }

  public updatePreviewIdle(elapsed: number): void {
    if (!this.mixer) return;
    const dt =
      this.lastPreviewElapsed < 0
        ? 0.016
        : clamp(elapsed - this.lastPreviewElapsed, 0, 0.1);
    this.lastPreviewElapsed = elapsed;

    const idleClip =
      this.classId === 'spear' && this.clips.has('2H_Melee_Idle')
        ? '2H_Melee_Idle'
        : 'Idle';
    this.fadeToClip(idleClip, 0.15, true, 1.0);
    this.mixer.update(dt);
    this.lockInPlaceRoot();
  }

  private lockInPlaceRoot(): void {
    if (this.rootBone) {
      this.rootBone.position.x = 0;
      this.rootBone.position.z = 0;
    }
  }
}
