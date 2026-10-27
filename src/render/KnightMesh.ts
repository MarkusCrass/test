import * as THREE from 'three';
import {
  AttackAnimStyle,
  KNIGHT_CLASSES,
  KnightClassConfig,
  KnightClassId,
} from '../config/classes';
import { Fighter } from '../core/Fighter';
import { clamp, lerp } from '../core/math';
import { MaterialLibrary } from './PixelTextures';

/**
 * Dynamic 3D World-Space Ribbon Trail following weapon base -> weapon tip!
 */
class WeaponRibbonTrail {
  public readonly mesh: THREE.Mesh;
  private readonly maxSamples = 10;
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
      // Base edge slightly dimmer, tip edge bright
      colors[i * 6 + 0] = 0.7 * intensity;
      colors[i * 6 + 1] = 0.55 * intensity;
      colors[i * 6 + 2] = 0.25 * intensity;

      colors[i * 6 + 3] = 1.35 * intensity;
      colors[i * 6 + 4] = 1.15 * intensity;
      colors[i * 6 + 5] = 0.65 * intensity;

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
      opacity: 0.75,
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
      if (this.history.length > 0) {
        this.history.pop();
      }
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
    this.mat.opacity = isHeavy ? 0.88 : 0.68;

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

/**
 * Heroic Stylized 3D Knight Rig with forged metallic PBR armor, articulated pauldrons,
 * knee poleyns, flowing capes, signature medieval helmets & weapons, contact shadow,
 * and dynamic 3D world-space blade ribbon trail.
 */
export class KnightVisualRig {
  public readonly root = new THREE.Group();
  public readonly trail = new WeaponRibbonTrail();

  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly handR = new THREE.Group();
  private readonly handL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly capeMesh: THREE.Mesh | null = null;
  private readonly stunRing = new THREE.Group();
  private readonly footRing: THREE.Mesh;
  private readonly contactShadow: THREE.Mesh;

  private readonly weaponBaseAnchor = new THREE.Object3D();
  private readonly weaponTipAnchor = new THREE.Object3D();
  private readonly tmpBaseWorld = new THREE.Vector3();
  private readonly tmpTipWorld = new THREE.Vector3();

  private readonly tintMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly baseColors: number[] = [];
  public readonly config: KnightClassConfig;

  constructor(
    classId: KnightClassId,
    mats: MaterialLibrary,
    options?: {
      clothOverride?: number;
      isHuman?: boolean;
      isPreview?: boolean;
    }
  ) {
    this.config = KNIGHT_CLASSES[classId];
    const vis = this.config.visual;
    const clothHex = options?.clothOverride ?? vis.clothColor;

    // Satin-forged steel & armor materials using IBL + normal map
    const steelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.primarySteel,
        map: mats.steelTex,
        normalMap: mats.steelNormalTex,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughness: 0.34,
        metalness: 0.72,
      })
    );
    const darkArmorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.secondaryArmor,
        normalMap: mats.steelNormalTex,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.46,
        metalness: 0.62,
      })
    );
    const clothMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: clothHex,
        roughness: 0.86,
        metalness: 0.04,
        side: THREE.DoubleSide,
      })
    );
    const goldTrimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.plumeColor,
        roughness: 0.32,
        metalness: 0.78,
      })
    );
    const plumeClothMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.plumeColor,
        roughness: 0.82,
        metalness: 0.05,
      })
    );
    const leatherGripMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5c361c,
        map: mats.woodTex,
        normalMap: mats.woodNormalTex,
        normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 0.78,
        metalness: 0.05,
      })
    );
    const polishedBladeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xeaf2fa,
        normalMap: mats.steelNormalTex,
        normalScale: new THREE.Vector2(0.28, 0.28),
        roughness: 0.2,
        metalness: 0.88,
      })
    );
    const visorSlitMat = new THREE.MeshBasicMaterial({ color: 0x0b0e14 });

    // Ground Contact Shadow beneath character
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(vis.capsuleRadius * 3.1, vis.capsuleRadius * 3.1),
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

    // Crisp Player/Bot tactical ring on stone
    const ringColor = options?.isHuman ? 0xffdf6b : clothHex;
    const ringGeo = new THREE.RingGeometry(
      vis.capsuleRadius * 0.84,
      vis.capsuleRadius * 1.04,
      24
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

    const wScale = vis.bodyScaleWidth;
    const hScale = vis.bodyScaleHeight;

    this.hips.position.set(0, 0.73 * hScale, 0);
    this.root.add(this.hips);

    // Armored Pelvis + Leather Belt + Gold Buckle + Hip Tassets
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26 * wScale, 0.24 * wScale, 0.24, 10),
      darkArmorMat
    );
    pelvis.scale.set(1.08, 1, 0.82);
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.275 * wScale, 0.275 * wScale, 0.08, 12),
      leatherGripMat
    );
    belt.scale.set(1.08, 1, 0.84);
    belt.position.y = 0.06;
    this.hips.add(belt);

    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.11, 0.06),
      goldTrimMat
    );
    buckle.position.set(0, 0.06, 0.23 * wScale);
    this.hips.add(buckle);

    // Side armored tassets (hip plates)
    for (const side of [-1, 1]) {
      const tasset = new THREE.Mesh(
        new THREE.BoxGeometry(0.14 * wScale, 0.24, 0.28 * wScale),
        steelMat
      );
      tasset.position.set(side * 0.26 * wScale, -0.09, 0);
      tasset.rotation.z = -side * 0.16;
      tasset.castShadow = true;
      this.hips.add(tasset);
    }

    // Heraldic front & rear tabard flaps
    for (const zSign of [1, -1]) {
      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(0.32 * wScale, 0.38, 0.04),
        clothMat
      );
      flap.position.set(0, -0.16, zSign * 0.19 * wScale);
      flap.rotation.x = zSign * 0.06;
      this.hips.add(flap);
    }

    // Torso: Sculpted Cuirass + Breastplate Ridge + Gorget
    this.torso.position.set(0, 0.12, 0);
    this.hips.add(this.torso);

    const cuirass = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.34 * wScale,
        0.27 * wScale,
        0.6 * hScale,
        10
      ),
      classId === 'dual' ? darkArmorMat : steelMat
    );
    cuirass.scale.set(1.06, 1, 0.78);
    cuirass.position.y = 0.3 * hScale;
    cuirass.castShadow = true;
    cuirass.receiveShadow = true;
    this.torso.add(cuirass);

    // Sculpted breastplate V-plackart & heraldic surcoat band
    const plackart = new THREE.Mesh(
      new THREE.BoxGeometry(0.46 * wScale, 0.48 * hScale, 0.44 * wScale),
      clothMat
    );
    plackart.position.y = 0.29 * hScale;
    this.torso.add(plackart);

    const chestCrest = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.11 * wScale, 0),
      goldTrimMat
    );
    chestCrest.scale.set(1, 1.3, 0.45);
    chestCrest.position.set(0, 0.38 * hScale, 0.23 * wScale);
    this.torso.add(chestCrest);

    // Armored Neck Gorget
    const gorget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * wScale, 0.29 * wScale, 0.14, 10),
      steelMat
    );
    gorget.position.y = 0.61 * hScale;
    this.torso.add(gorget);

    // Layered Articulated Shoulder Pauldrons
    const pauldronScale =
      classId === 'hammer' ? 1.24 : classId === 'dual' ? 0.82 : 1.04;
    for (const side of [-1, 1]) {
      const pGroup = new THREE.Group();
      pGroup.position.set(side * 0.41 * wScale, 0.54 * hScale, 0);
      pGroup.rotation.z = -side * 0.24;

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(
          0.2 * pauldronScale,
          10,
          8,
          0,
          Math.PI * 2,
          0,
          Math.PI * 0.62
        ),
        steelMat
      );
      dome.scale.set(1.1, 0.95, 1.15);
      dome.castShadow = true;
      pGroup.add(dome);

      const trim = new THREE.Mesh(
        new THREE.TorusGeometry(0.18 * pauldronScale, 0.025, 6, 12),
        goldTrimMat
      );
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.02;
      pGroup.add(trim);

      this.torso.add(pGroup);
    }

    // Flowing Cape / Duelist Scarf
    if (classId === 'sword' || classId === 'dual' || classId === 'hammer') {
      const capeW =
        classId === 'dual' ? 0.32 : classId === 'hammer' ? 0.72 * wScale : 0.62 * wScale;
      const capeH = classId === 'dual' ? 0.62 : 0.76;
      const capeGeo = new THREE.BoxGeometry(capeW, capeH, 0.04, 2, 4, 1);
      capeGeo.translate(0, -capeH * 0.5, 0);
      const cape = new THREE.Mesh(capeGeo, clothMat);
      cape.position.set(0, 0.58 * hScale, -0.22 * wScale);
      cape.rotation.x = 0.18;
      cape.castShadow = true;
      this.torso.add(cape);
      this.capeMesh = cape;
    }

    // Head & Helmet
    this.headGroup.position.set(0, 0.66 * hScale, 0);
    this.torso.add(this.headGroup);
    this.buildHelmet(
      classId,
      vis.headScale,
      steelMat,
      darkArmorMat,
      goldTrimMat,
      plumeClothMat,
      visorSlitMat
    );

    // Articulated Legs: Thigh Cuisse -> Winged Knee Poleyn -> Greave -> Armored Sabaton
    const hipOffset = 0.185 * wScale;
    this.legR.position.set(-hipOffset, -0.06, 0);
    this.legL.position.set(hipOffset, -0.06, 0);
    this.hips.add(this.legR);
    this.hips.add(this.legL);

    for (const leg of [this.legR, this.legL]) {
      const cuisse = new THREE.Mesh(
        new THREE.CylinderGeometry(0.115 * wScale, 0.1 * wScale, 0.34 * hScale, 8),
        darkArmorMat
      );
      cuisse.position.y = -0.18 * hScale;
      cuisse.castShadow = true;
      leg.add(cuisse);

      const poleyn = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.125 * wScale, 1),
        steelMat
      );
      poleyn.scale.set(1.0, 0.85, 1.15);
      poleyn.position.set(0, -0.34 * hScale, 0.04);
      leg.add(poleyn);

      const greave = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11 * wScale, 0.125 * wScale, 0.24 * hScale, 8),
        steelMat
      );
      greave.position.y = -0.45 * hScale;
      greave.castShadow = true;
      leg.add(greave);

      const sabaton = new THREE.Mesh(
        new THREE.BoxGeometry(0.25 * wScale, 0.17 * hScale, 0.38),
        steelMat
      );
      sabaton.position.set(0, -0.58 * hScale, 0.06);
      sabaton.castShadow = true;
      leg.add(sabaton);
    }

    // Articulated Arms: Upper Vambrace -> Elbow Couter -> Plated Gauntlet
    const shoulderX = 0.44 * wScale;
    const shoulderY = 0.52 * hScale;
    this.armR.position.set(-shoulderX, shoulderY, 0);
    this.armL.position.set(shoulderX, shoulderY, 0);
    this.torso.add(this.armR);
    this.torso.add(this.armL);

    for (const [arm, hand] of [
      [this.armR, this.handR],
      [this.armL, this.handL],
    ] as const) {
      const rerebrace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.09, 0.34, 8),
        darkArmorMat
      );
      rerebrace.position.y = -0.16;
      rerebrace.castShadow = true;
      arm.add(rerebrace);

      const couter = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        steelMat
      );
      couter.position.set(0, -0.28, -0.02);
      arm.add(couter);

      hand.position.set(0, -0.39, 0.08);
      arm.add(hand);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.105, 0.16, 8),
        steelMat
      );
      cuff.rotation.x = Math.PI * 0.25;
      cuff.position.set(0, 0.05, -0.03);
      hand.add(cuff);

      const gauntlet = new THREE.Mesh(
        new THREE.BoxGeometry(0.23, 0.22, 0.25),
        steelMat
      );
      gauntlet.castShadow = true;
      hand.add(gauntlet);
    }

    // Build Class Masterwork Weapons + attach trail anchors!
    this.buildClassWeapons(
      classId,
      polishedBladeMat,
      steelMat,
      darkArmorMat,
      leatherGripMat,
      clothMat,
      goldTrimMat
    );

    // Overhead Stun Stars
    this.stunRing.position.set(0, 2.28 * hScale, 0);
    this.stunRing.visible = false;
    const starGeo = new THREE.OctahedronGeometry(0.13, 0);
    const starMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.8, 1.4, 0.3),
      toneMapped: false,
    });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const a = (i * Math.PI * 2) / 3;
      star.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      this.stunRing.add(star);
    }
    this.root.add(this.stunRing);
  }

  private trackMat(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    this.tintMaterials.push(mat);
    this.baseColors.push(mat.color.getHex());
    return mat;
  }

  private buildHelmet(
    classId: KnightClassId,
    scale: number,
    steelMat: THREE.Material,
    darkArmorMat: THREE.Material,
    goldMat: THREE.Material,
    plumeMat: THREE.Material,
    visorMat: THREE.Material
  ): void {
    const h = new THREE.Group();
    h.scale.setScalar(scale);

    if (classId === 'sword') {
      // Fluted Crusader Greathelm with Brass Cross & Flowing Feather Crest
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.275, 0.48, 12),
        steelMat
      );
      barrel.position.y = 0.24;
      barrel.castShadow = true;
      h.add(barrel);

      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45),
        steelMat
      );
      crown.position.y = 0.44;
      h.add(crown);

      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.055, 0.14),
        visorMat
      );
      slit.position.set(0, 0.28, 0.21);
      h.add(slit);

      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.38, 0.05),
        goldMat
      );
      crossV.position.set(0, 0.25, 0.255);
      h.add(crossV);

      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.05, 0.05),
        goldMat
      );
      crossH.position.set(0, 0.32, 0.245);
      h.add(crossH);

      // Multi-arc flowing crest plume
      for (let i = 0; i < 3; i++) {
        const feather = new THREE.Mesh(
          new THREE.ConeGeometry(0.085, 0.36 - i * 0.04, 6),
          plumeMat
        );
        feather.position.set(0, 0.58 - i * 0.06, -0.02 - i * 0.11);
        feather.rotation.x = -0.65 - i * 0.32;
        h.add(feather);
      }
    } else if (classId === 'dual') {
      // Houndskull / Beaked Duelist Bascinet
      const skull = new THREE.Mesh(
        new THREE.SphereGeometry(0.265, 12, 10),
        darkArmorMat
      );
      skull.scale.set(0.94, 1.08, 1.04);
      skull.position.y = 0.26;
      skull.castShadow = true;
      h.add(skull);

      const visorBeak = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.36, 6),
        steelMat
      );
      visorBeak.rotation.x = Math.PI / 2 + 0.12;
      visorBeak.position.set(0, 0.22, 0.29);
      visorBeak.castShadow = true;
      h.add(visorBeak);

      const eyeSlit = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.045, 0.12),
        visorMat
      );
      eyeSlit.position.set(0, 0.3, 0.22);
      h.add(eyeSlit);

      const crestFin = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.16, 0.34),
        goldMat
      );
      crestFin.position.set(0, 0.48, -0.02);
      h.add(crestFin);
    } else if (classId === 'spear') {
      // Polished Kettle-Sallet Vanguard Helm with Gold Band
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65),
        steelMat
      );
      dome.position.y = 0.28;
      dome.castShadow = true;
      h.add(dome);

      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.47, 0.09, 14),
        steelMat
      );
      brim.position.y = 0.28;
      brim.castShadow = true;
      h.add(brim);

      const goldBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.27, 0.06, 12),
        goldMat
      );
      goldBand.position.y = 0.34;
      h.add(goldBand);

      const spireTip = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.2, 8),
        goldMat
      );
      spireTip.position.y = 0.56;
      h.add(spireTip);

      const visorShadow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.14, 10),
        visorMat
      );
      visorShadow.position.y = 0.2;
      h.add(visorShadow);
    } else {
      // Class D: Crowned / Horned Siege Juggernaut Greathelm
      const helmCore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.29, 0.31, 0.52, 10),
        darkArmorMat
      );
      helmCore.position.y = 0.26;
      helmCore.castShadow = true;
      h.add(helmCore);

      const facePlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.42, 0.16),
        steelMat
      );
      facePlate.position.set(0, 0.25, 0.22);
      h.add(facePlate);

      const browCrown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.315, 0.31, 0.11, 10),
        goldMat
      );
      browCrown.position.y = 0.43;
      h.add(browCrown);

      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.055, 0.08),
        visorMat
      );
      slit.position.set(0, 0.28, 0.28);
      h.add(slit);

      for (const side of [-1, 1]) {
        const hornBase = new THREE.Mesh(
          new THREE.ConeGeometry(0.095, 0.38, 8),
          steelMat
        );
        hornBase.position.set(side * 0.36, 0.46, 0.03);
        hornBase.rotation.z = -side * 0.68;
        hornBase.rotation.x = 0.25;
        hornBase.castShadow = true;
        h.add(hornBase);
      }
    }

    this.headGroup.add(h);
  }

  private buildClassWeapons(
    classId: KnightClassId,
    bladeMat: THREE.Material,
    steelMat: THREE.Material,
    darkMat: THREE.Material,
    gripMat: THREE.Material,
    clothMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    if (classId === 'sword') {
      const sword = this.makeKnightlySword(
        bladeMat,
        gripMat,
        goldMat,
        1.52,
        0.155
      );
      sword.position.set(0, -0.02, 0.12);
      sword.rotation.x = Math.PI * 0.42;
      this.handR.add(sword);

      this.weaponBaseAnchor.position.set(0, 0.24, 0);
      this.weaponTipAnchor.position.set(0, 1.88, 0);
      sword.add(this.weaponBaseAnchor);
      sword.add(this.weaponTipAnchor);
    } else if (classId === 'dual') {
      const bladeR = this.makeKnightlySword(
        bladeMat,
        gripMat,
        steelMat,
        1.26,
        0.125
      );
      bladeR.position.set(0, -0.02, 0.12);
      bladeR.rotation.x = Math.PI * 0.45;
      this.handR.add(bladeR);

      this.weaponBaseAnchor.position.set(0, 0.22, 0);
      this.weaponTipAnchor.position.set(0, 1.6, 0);
      bladeR.add(this.weaponBaseAnchor);
      bladeR.add(this.weaponTipAnchor);

      const bladeL = this.makeKnightlySword(
        bladeMat,
        gripMat,
        steelMat,
        1.26,
        0.125
      );
      bladeL.position.set(0, -0.02, 0.12);
      bladeL.rotation.x = Math.PI * 0.45;
      this.handL.add(bladeL);
    } else if (classId === 'spear') {
      const spear = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.052, 2.58, 8),
        gripMat
      );
      shaft.position.y = 0.84;
      shaft.castShadow = true;
      spear.add(shaft);

      // Butt-spike counterweight
      const butt = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.22, 6),
        steelMat
      );
      butt.rotation.x = Math.PI;
      butt.position.y = -0.5;
      spear.add(butt);

      // Winged partisan socket + gleaming diamond spearhead
      const socket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.06, 0.2, 8),
        goldMat
      );
      socket.position.y = 2.04;
      spear.add(socket);

      const crossWings = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.06, 0.07),
        steelMat
      );
      crossWings.position.y = 2.09;
      spear.add(crossWings);

      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.145, 0.68, 4),
        bladeMat
      );
      head.scale.set(1.05, 1.0, 0.38);
      head.rotation.y = Math.PI / 4;
      head.position.y = 2.44;
      head.castShadow = true;
      spear.add(head);

      const pennant = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.48, 3),
        clothMat
      );
      pennant.position.set(0.18, 1.96, 0);
      pennant.rotation.z = -Math.PI * 0.42;
      spear.add(pennant);

      spear.rotation.x = Math.PI * 0.48;
      spear.position.set(0, 0, 0.08);
      this.handR.add(spear);

      this.weaponBaseAnchor.position.set(0, 1.75, 0);
      this.weaponTipAnchor.position.set(0, 2.76, 0);
      spear.add(this.weaponBaseAnchor);
      spear.add(this.weaponTipAnchor);
    } else {
      // Class D: Ornate Flanged Warhammer + Beveled Heater/Pavise Tower Shield!
      const hammer = new THREE.Group();
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.058, 1.42, 8),
        gripMat
      );
      handle.position.y = 0.54;
      handle.castShadow = true;
      hammer.add(handle);

      const langet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.065, 0.42, 8),
        goldMat
      );
      langet.position.y = 1.02;
      hammer.add(langet);

      const headBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.34, 0.68),
        darkMat
      );
      headBlock.position.y = 1.24;
      headBlock.castShadow = true;
      hammer.add(headBlock);

      const strikeCrown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.2, 0.18, 8),
        bladeMat
      );
      strikeCrown.rotation.x = Math.PI / 2;
      strikeCrown.position.set(0, 1.24, 0.38);
      hammer.add(strikeCrown);

      const backBeak = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.36, 4),
        bladeMat
      );
      backBeak.rotation.x = -Math.PI / 2;
      backBeak.position.set(0, 1.24, -0.48);
      hammer.add(backBeak);

      const topSpike = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.28, 6),
        bladeMat
      );
      topSpike.position.set(0, 1.54, 0);
      hammer.add(topSpike);

      hammer.rotation.x = Math.PI * 0.38;
      hammer.position.set(0, 0, 0.1);
      this.handR.add(hammer);

      this.weaponBaseAnchor.position.set(0, 0.95, 0);
      this.weaponTipAnchor.position.set(0, 1.62, 0.2);
      hammer.add(this.weaponBaseAnchor);
      hammer.add(this.weaponTipAnchor);

      // Curved/Beveled Tower Shield on Left Arm
      const shield = new THREE.Group();
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 1.24, 0.1),
        steelMat
      );
      board.castShadow = true;
      shield.add(board);

      const heraldicFace = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 1.1, 0.12),
        clothMat
      );
      heraldicFace.position.z = 0.01;
      shield.add(heraldicFace);

      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 1.08, 0.135),
        goldMat
      );
      crossV.position.z = 0.015;
      shield.add(crossV);

      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.11, 0.135),
        goldMat
      );
      crossH.position.set(0, 0.12, 0.015);
      shield.add(crossH);

      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 10, 8),
        goldMat
      );
      boss.scale.set(1, 1, 0.55);
      boss.position.set(0, 0.12, 0.09);
      shield.add(boss);

      shield.position.set(0.22, 0.06, 0.25);
      shield.rotation.y = 0.35;
      this.handL.add(shield);
    }
  }

  private makeKnightlySword(
    bladeMat: THREE.Material,
    gripMat: THREE.Material,
    guardMat: THREE.Material,
    bladeLen: number,
    bladeWidth: number
  ): THREE.Group {
    const g = new THREE.Group();

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.046, 0.3, 8),
      gripMat
    );
    g.add(grip);

    const pommel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.055, 10),
      guardMat
    );
    pommel.rotation.z = Math.PI / 2;
    pommel.position.y = -0.18;
    g.add(pommel);

    const crossguard = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.07, 0.11),
      guardMat
    );
    crossguard.position.y = 0.16;
    crossguard.castShadow = true;
    g.add(crossguard);

    // Diamond-section beveled blade!
    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bladeWidth * 0.34,
        bladeWidth * 0.62,
        bladeLen,
        4
      ),
      bladeMat
    );
    blade.scale.set(1.0, 1.0, 0.28);
    blade.rotation.y = Math.PI / 4;
    blade.position.y = 0.19 + bladeLen * 0.5;
    blade.castShadow = true;
    g.add(blade);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(bladeWidth * 0.34, 0.26, 4),
      bladeMat
    );
    tip.scale.set(1.0, 1.0, 0.28);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = 0.19 + bladeLen + 0.12;
    g.add(tip);

    return g;
  }

  public syncFromFighter(fighter: Fighter): void {
    this.root.position.set(fighter.body.x, fighter.body.y, fighter.body.z);
    this.root.rotation.y = fighter.yaw;

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

    const hScale = this.config.visual.bodyScaleHeight;
    this.hips.position.set(0, 0.73 * hScale, 0);
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.stunRing.visible = false;
    this.footRing.visible = fighter.isAlive;
    this.contactShadow.scale.setScalar(fighter.isAlive ? 1.0 : 1.35);

    const t = fighter.animTime;

    if (fighter.state === 'Dead') {
      this.hips.position.y = 0.24;
      this.hips.rotation.x = -Math.PI * 0.46;
      this.hips.rotation.z = 0.22;
      this.armR.rotation.z = -0.8;
      this.armL.rotation.z = 0.75;
      this.legR.rotation.x = 0.25;
      this.legL.rotation.x = -0.15;
      this.trail.clear();
      return;
    }

    this.applyBaseClassStance(fighter.classId, t);

    if (fighter.state === 'Moving') {
      const freq = fighter.isSprinting ? 13.5 : 9.5;
      const amp = fighter.isSprinting ? 0.68 : 0.48;
      const stride = Math.sin(t * freq);
      this.legR.rotation.x = stride * amp;
      this.legL.rotation.x = -stride * amp;
      this.hips.position.y += Math.abs(Math.cos(t * freq)) * 0.08;
      this.torso.rotation.x = fighter.isSprinting ? 0.24 : 0.1;
      this.torso.rotation.y = stride * 0.08;
      this.armR.rotation.x += -stride * amp * 0.35;
      this.armL.rotation.x += stride * amp * 0.35;

      if (this.capeMesh) {
        this.capeMesh.rotation.x =
          (fighter.isSprinting ? 0.58 : 0.36) + Math.sin(t * freq) * 0.11;
      }
    } else if (this.capeMesh) {
      this.capeMesh.rotation.x = 0.16 + Math.sin(t * 2.4) * 0.045;
    }

    if (fighter.isChargingHeavy) {
      const c = fighter.chargeRatio;
      const jitter = Math.sin(t * 42) * 0.03 * c;
      this.torso.rotation.y = -0.55 * c;
      this.torso.rotation.x = -0.14 * c;
      this.armR.rotation.x = -1.35 * c + jitter;
      this.armR.rotation.z = -0.35 * c;
    }

    const inSwing =
      (fighter.state === 'Attacking' || fighter.state === 'HeavyAttacking') &&
      fighter.activeAttack !== null;

    if (inSwing) {
      this.applyAttackAnimation(fighter);
    } else if (fighter.state === 'Blocking') {
      this.applyBlockingAnimation(fighter.classId, fighter.blockElapsed);
    } else if (fighter.state === 'Dodging') {
      this.applyDodgeAnimation(fighter);
    } else if (fighter.state === 'HitReaction') {
      this.torso.rotation.x = -0.38;
      this.headGroup.rotation.x = -0.28;
      this.armR.rotation.z = -0.5;
      this.armL.rotation.z = 0.5;
    } else if (fighter.state === 'Stunned') {
      this.stunRing.visible = true;
      this.stunRing.rotation.y = t * 4.8;
      this.torso.rotation.z = Math.sin(t * 9) * 0.2;
      this.torso.rotation.x = 0.18 + Math.cos(t * 9) * 0.12;
      this.headGroup.rotation.z = Math.cos(t * 9) * 0.22;
    }

    // Update world matrices & feed dynamic 3D Weapon Ribbon Trail!
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
    const hScale = this.config.visual.bodyScaleHeight;
    this.hips.position.set(
      0,
      0.73 * hScale + Math.sin(elapsed * 2.4) * 0.028,
      0
    );
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, Math.sin(elapsed * 1.2) * 0.08, 0);
    this.armR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.applyBaseClassStance(this.config.id, elapsed);
    if (this.capeMesh) {
      this.capeMesh.rotation.x = 0.18 + Math.sin(elapsed * 2.2) * 0.05;
    }
  }

  private applyBaseClassStance(classId: KnightClassId, t: number): void {
    const breathe = Math.sin(t * 2.8) * 0.04;
    if (classId === 'sword') {
      this.armR.rotation.x = -0.35 + breathe;
      this.armR.rotation.z = -0.18;
      this.armL.rotation.x = -0.22 - breathe;
      this.armL.rotation.z = 0.16;
    } else if (classId === 'dual') {
      this.torso.rotation.x = 0.12;
      this.armR.rotation.x = -0.45 + breathe;
      this.armR.rotation.z = -0.28;
      this.armL.rotation.x = -0.45 - breathe;
      this.armL.rotation.z = 0.28;
    } else if (classId === 'spear') {
      this.armR.rotation.x = -0.25 + breathe;
      this.armR.rotation.z = -0.12;
      this.armL.rotation.x = -0.62;
      this.armL.rotation.y = -0.42;
    } else {
      this.armR.rotation.x = -0.28 + breathe;
      this.armR.rotation.z = -0.22;
      this.armL.rotation.x = -0.48;
      this.armL.rotation.y = -0.28;
    }
  }

  private applyAttackAnimation(fighter: Fighter): void {
    const atk = fighter.activeAttack!;
    const phase = fighter.attackPhase;
    const style: AttackAnimStyle = atk.animStyle;

    let p = 0;
    if (phase === 'Windup') {
      p = 1 - clamp(fighter.attackPhaseTimer / atk.windupDuration, 0, 1);
    } else if (phase === 'Active') {
      p = 1 - clamp(fighter.attackPhaseTimer / atk.activeDuration, 0, 1);
    } else if (phase === 'Recovery') {
      p = 1 - clamp(fighter.attackPhaseTimer / atk.recoveryDuration, 0, 1);
    }

    if (style === 'spear_poke' || style === 'spear_impale') {
      if (phase === 'Windup') {
        this.torso.rotation.y = lerp(0, -0.48, p);
        this.armR.rotation.x = lerp(-0.25, 0.48, p);
      } else if (phase === 'Active') {
        this.torso.rotation.y = lerp(-0.48, 0.4, p);
        this.torso.rotation.x = 0.24;
        this.armR.rotation.x = lerp(0.48, -1.08, p);
      } else {
        this.torso.rotation.y = lerp(0.4, 0, p);
        this.torso.rotation.x = lerp(0.24, 0, p);
        this.armR.rotation.x = lerp(-1.08, -0.25, p);
      }
      return;
    }

    if (style === 'overhead_cleave' || style === 'hammer_slam') {
      if (phase === 'Windup') {
        this.torso.rotation.x = lerp(0, -0.35, p);
        this.armR.rotation.x = lerp(-0.3, -2.6, p);
        this.armR.rotation.z = -0.1;
      } else if (phase === 'Active') {
        this.torso.rotation.x = lerp(-0.35, 0.5, p);
        this.hips.position.y -= 0.15 * p;
        this.armR.rotation.x = lerp(-2.6, 0.38, p);
      } else {
        this.torso.rotation.x = lerp(0.5, 0, p);
        this.hips.position.y -= 0.15 * (1 - p);
        this.armR.rotation.x = lerp(0.38, -0.28, p);
      }
      return;
    }

    if (style === 'dual_left') {
      if (phase === 'Windup') {
        this.torso.rotation.y = lerp(0, 0.52, p);
        this.armL.rotation.x = -1.25 * p;
        this.armL.rotation.z = 0.82 * p;
      } else if (phase === 'Active') {
        this.torso.rotation.y = lerp(0.52, -0.58, p);
        this.armL.rotation.x = -0.72;
        this.armL.rotation.y = lerp(0.52, -1.12, p);
      } else {
        this.torso.rotation.y = lerp(-0.58, 0, p);
        this.armL.rotation.x = lerp(-0.72, -0.45, p);
      }
      return;
    }

    if (style === 'dual_cross' || style === 'dual_finisher') {
      if (phase === 'Windup') {
        this.torso.rotation.x = -0.22 * p;
        this.armR.rotation.z = -1.12 * p;
        this.armL.rotation.z = 1.12 * p;
        this.armR.rotation.x = -1.02 * p;
        this.armL.rotation.x = -1.02 * p;
      } else if (phase === 'Active') {
        this.torso.rotation.x = 0.34;
        this.torso.rotation.y =
          style === 'dual_finisher' ? p * Math.PI * 1.45 : 0;
        this.armR.rotation.z = lerp(-1.12, 0.58, p);
        this.armL.rotation.z = lerp(1.12, -0.58, p);
        this.armR.rotation.x = -0.76;
        this.armL.rotation.x = -0.76;
      } else {
        this.torso.rotation.x = lerp(0.34, 0.12, p);
        this.armR.rotation.z = lerp(0.58, -0.28, p);
        this.armL.rotation.z = lerp(-0.58, 0.28, p);
      }
      return;
    }

    const dir = style === 'slash_left' ? -1 : 1;
    if (phase === 'Windup') {
      this.torso.rotation.y = lerp(0, -0.65 * dir, p);
      this.armR.rotation.x = lerp(-0.35, -1.28, p);
      this.armR.rotation.z = -0.68 * dir * p;
    } else if (phase === 'Active') {
      this.torso.rotation.y = lerp(-0.65 * dir, 0.7 * dir, p);
      this.torso.rotation.x = 0.22;
      this.armR.rotation.x = -0.84;
      this.armR.rotation.y = lerp(-0.52 * dir, 1.08 * dir, p);
    } else {
      this.torso.rotation.y = lerp(0.7 * dir, 0, p);
      this.torso.rotation.x = lerp(0.22, 0, p);
      this.armR.rotation.x = lerp(-0.84, -0.32, p);
      this.armR.rotation.y = lerp(1.08 * dir, 0, p);
    }
  }

  private applyBlockingAnimation(
    classId: KnightClassId,
    elapsed: number
  ): void {
    if (classId === 'hammer') {
      this.hips.position.y -= 0.1;
      this.torso.rotation.y = 0.25;
      this.armL.rotation.x = -0.85;
      this.armL.rotation.y = -0.82;
      this.armR.rotation.x = -0.55;
    } else if (classId === 'dual') {
      this.armR.rotation.x = -1.25;
      this.armR.rotation.z = 0.58;
      this.armL.rotation.x = -1.25;
      this.armL.rotation.z = -0.58;
    } else if (classId === 'spear') {
      const sweep = clamp(elapsed / 0.28, 0, 1);
      this.torso.rotation.y = lerp(-0.6, 0.55, sweep);
      this.armR.rotation.x = -1.1;
      this.armR.rotation.z = 0.72;
      this.armL.rotation.x = -1.0;
    } else {
      this.torso.rotation.y = -0.22;
      this.armR.rotation.x = -1.35;
      this.armR.rotation.z = 0.72;
      this.armL.rotation.x = -0.95;
    }
  }

  private applyDodgeAnimation(fighter: Fighter): void {
    const mode = fighter.config.dodge.mode;
    const progress = clamp(
      fighter.dodgeElapsed / fighter.config.dodge.duration,
      0,
      1
    );

    if (mode === 'shield_shove') {
      this.torso.rotation.x = 0.36;
      this.armL.rotation.x = -1.06;
      this.armL.rotation.y = -0.9;
    } else if (mode === 'backstep') {
      this.hips.position.y += Math.sin(progress * Math.PI) * 0.26;
      this.torso.rotation.x = -0.24;
    } else if (mode === 'quick_dash') {
      this.hips.position.y -= 0.18;
      this.torso.rotation.x = 0.48;
      this.armR.rotation.x = 0.45;
      this.armL.rotation.x = 0.45;
    } else {
      this.hips.position.y -= 0.16;
      this.torso.rotation.x = progress * Math.PI * 2;
    }
  }
}
