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

/**
 * High-Detail Sculpted 3D Knight Rig:
 * - LatheGeometry anatomical Gothic breastplates, fluted helmets & greaves
 * - ExtrudeGeometry custom-profile longswords, curved sabers, winged partisan spears,
 *   raven's-beak warhammers, and classic pointed Heater shields with rivets
 * - True 2-bone articulated arms (Shoulder -> Elbow -> Gauntlet) & legs (Hip -> Knee -> Sabaton)
 * - Chainmail hauberk under-joints, belt scabbards, and 3-bone articulated flowing capes
 */
export class KnightVisualRig {
  public readonly root = new THREE.Group();
  public readonly trail = new WeaponRibbonTrail();

  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly headGroup = new THREE.Group();

  // 2-bone Arms: Shoulder -> Elbow -> Hand
  private readonly armR = new THREE.Group();
  private readonly elbowR = new THREE.Group();
  private readonly handR = new THREE.Group();

  private readonly armL = new THREE.Group();
  private readonly elbowL = new THREE.Group();
  private readonly handL = new THREE.Group();

  // 2-bone Legs: Hip -> Knee -> Foot
  private readonly legR = new THREE.Group();
  private readonly kneeR = new THREE.Group();
  private readonly footR = new THREE.Group();

  private readonly legL = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly footL = new THREE.Group();

  // 3-segment articulated cloth cape
  private readonly capeBones: THREE.Group[] = [];

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

    // Bespoke PBR Materials per Knight
    const steelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.primarySteel,
        map: mats.steelTex,
        normalMap: mats.steelNormalTex,
        normalScale: new THREE.Vector2(0.65, 0.65),
        roughness: 0.3,
        metalness: 0.78,
      })
    );
    const darkArmorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.secondaryArmor,
        normalMap: mats.steelNormalTex,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.44,
        metalness: 0.68,
      })
    );
    const mailMat = this.trackMat(mats.chainmailMat.clone());
    const clothSolidMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: clothHex,
        roughness: 0.85,
        metalness: 0.04,
        side: THREE.DoubleSide,
      })
    );
    const heraldicTex = mats.createClassHeraldryTexture(classId, clothHex);
    const heraldicMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: heraldicTex,
        roughness: 0.8,
        metalness: 0.06,
        side: THREE.DoubleSide,
      })
    );
    const goldTrimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.plumeColor,
        roughness: 0.28,
        metalness: 0.84,
      })
    );
    const plumeClothMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.plumeColor,
        roughness: 0.78,
        metalness: 0.05,
      })
    );
    const leatherMat = this.trackMat(mats.leatherMat.clone());
    const polishedBladeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf0f6fc,
        normalMap: mats.steelNormalTex,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughness: 0.16,
        metalness: 0.92,
      })
    );
    const visorSlitMat = new THREE.MeshBasicMaterial({ color: 0x090c12 });

    // Ground Contact Shadow + Tactical Ring
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(vis.capsuleRadius * 3.2, vis.capsuleRadius * 3.2),
      new THREE.MeshBasicMaterial({
        map: mats.contactShadowTex,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.018;
    this.root.add(this.contactShadow);

    const ringColor = options?.isHuman ? 0xffdf6b : clothHex;
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

    const wScale = vis.bodyScaleWidth;
    const hScale = vis.bodyScaleHeight;

    this.hips.position.set(0, 0.74 * hScale, 0);
    this.root.add(this.hips);

    // 1. PELVIS, CHAINMAIL HAUBERK SKIRT, WAR BELT, TASSETS & SCABBARDS
    this.buildPelvisAndBelt(
      classId,
      wScale,
      steelMat,
      darkArmorMat,
      mailMat,
      heraldicMat,
      leatherMat,
      goldTrimMat
    );

    // 2. ANATOMICAL SCULPTED GOTHIC TORSO, PAULDRONS & MULTI-BONE CAPE
    this.torso.position.set(0, 0.11, 0);
    this.hips.add(this.torso);
    this.buildSculptedTorso(
      classId,
      wScale,
      hScale,
      steelMat,
      darkArmorMat,
      mailMat,
      heraldicMat,
      clothSolidMat,
      leatherMat,
      goldTrimMat
    );

    // 3. SCULPTED HELMET & CHAINMAIL AVENTAIL
    this.headGroup.position.set(0, 0.65 * hScale, 0);
    this.torso.add(this.headGroup);
    this.buildMasterworkHelmet(
      classId,
      vis.headScale,
      steelMat,
      darkArmorMat,
      mailMat,
      goldTrimMat,
      plumeClothMat,
      visorSlitMat
    );

    // 4. TWO-SEGMENT ARTICULATED LEGS (Thigh -> Knee -> Greave -> Sabaton)
    this.buildArticulatedLegs(
      wScale,
      hScale,
      steelMat,
      darkArmorMat,
      mailMat,
      goldTrimMat
    );

    // 5. TWO-SEGMENT ARTICULATED ARMS (Shoulder -> Elbow -> Forearm -> Gauntlet)
    this.buildArticulatedArms(
      wScale,
      hScale,
      steelMat,
      darkArmorMat,
      mailMat,
      leatherMat,
      goldTrimMat
    );

    // 6. MASTERWORK EXTRUDED WEAPONS & HEATER SHIELD
    this.buildMasterworkWeapons(
      classId,
      polishedBladeMat,
      steelMat,
      darkArmorMat,
      leatherMat,
      heraldicMat,
      clothSolidMat,
      goldTrimMat
    );

    // Overhead Stun Stars
    this.stunRing.position.set(0, 2.3 * hScale, 0);
    this.stunRing.visible = false;
    const starGeo = new THREE.OctahedronGeometry(0.13, 0);
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
  }

  private trackMat(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    this.tintMaterials.push(mat);
    this.baseColors.push(mat.color.getHex());
    return mat;
  }

  private normalizePlanarUVs(
    geo: THREE.BufferGeometry,
    minX: number,
    maxX: number,
    minY: number,
    maxY: number
  ): void {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    if (!pos || !uv) return;
    const spanX = Math.max(0.001, maxX - minX);
    const spanY = Math.max(0.001, maxY - minY);
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        clamp((pos.getX(i) - minX) / spanX, 0, 1),
        clamp((pos.getY(i) - minY) / spanY, 0, 1)
      );
    }
    uv.needsUpdate = true;
  }

  private buildPelvisAndBelt(
    classId: KnightClassId,
    wScale: number,
    steelMat: THREE.Material,
    darkArmorMat: THREE.Material,
    mailMat: THREE.Material,
    heraldicMat: THREE.Material,
    leatherMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    // Chainmail hauberk skirt hanging below waist
    const mailSkirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25 * wScale, 0.29 * wScale, 0.26, 14),
      mailMat
    );
    mailSkirt.scale.set(1.06, 1, 0.8);
    mailSkirt.position.y = -0.04;
    mailSkirt.castShadow = true;
    this.hips.add(mailSkirt);

    // Heavy Knightly Leather War-Belt + Ornate Gold Buckle + Studs
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.275 * wScale, 0.275 * wScale, 0.085, 16),
      leatherMat
    );
    belt.scale.set(1.08, 1, 0.84);
    belt.position.y = 0.07;
    this.hips.add(belt);

    const buckleFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.11, 0.05),
      goldMat
    );
    buckleFrame.position.set(0, 0.07, 0.235 * wScale);
    this.hips.add(buckleFrame);

    // Laminated 3-plate hip Tassets with brass rivets on left & right hips
    for (const side of [-1, 1]) {
      const tassetGroup = new THREE.Group();
      tassetGroup.position.set(side * 0.25 * wScale, -0.02, 0.02);
      tassetGroup.rotation.z = -side * 0.2;

      for (let lame = 0; lame < 3; lame++) {
        const plate = new THREE.Mesh(
          new THREE.BoxGeometry(0.12 * wScale, 0.085, 0.27 * wScale),
          classId === 'dual' ? darkArmorMat : steelMat
        );
        plate.position.y = -lame * 0.072;
        plate.castShadow = true;
        tassetGroup.add(plate);
      }
      this.hips.add(tassetGroup);
    }

    // Pointed Heraldic Tabard Front & Rear Banners
    const tabardShape = new THREE.Shape();
    const tw = 0.16 * wScale;
    tabardShape.moveTo(-tw, 0);
    tabardShape.lineTo(tw, 0);
    tabardShape.lineTo(tw * 0.88, -0.34);
    tabardShape.lineTo(0, -0.44);
    tabardShape.lineTo(-tw * 0.88, -0.34);
    tabardShape.closePath();

    const tabardGeo = new THREE.ExtrudeGeometry(tabardShape, {
      depth: 0.025,
      bevelEnabled: false,
    });
    this.normalizePlanarUVs(tabardGeo, -tw, tw, -0.44, 0);
    for (const zSign of [1, -1]) {
      const flap = new THREE.Mesh(tabardGeo, heraldicMat);
      flap.position.set(0, 0.03, zSign * 0.2 * wScale - 0.012);
      flap.rotation.x = zSign * 0.06;
      flap.castShadow = true;
      this.hips.add(flap);
    }

    // Class-specific Belt Gear: Scabbard / Rondel Dagger / Leather Pouch
    if (classId === 'sword') {
      const scabbard = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.028, 0.92, 8),
        leatherMat
      );
      body.scale.set(1, 1, 0.55);
      scabbard.add(body);
      const chape = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.16, 8),
        goldMat
      );
      chape.rotation.x = Math.PI;
      chape.position.y = -0.5;
      scabbard.add(chape);
      const locket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.046, 0.1, 8),
        goldMat
      );
      locket.position.y = 0.42;
      scabbard.add(locket);

      scabbard.position.set(0.29 * wScale, -0.22, -0.05);
      scabbard.rotation.x = -0.55;
      scabbard.rotation.z = 0.15;
      this.hips.add(scabbard);
    } else {
      // Leather pouch + rondel side-dagger on right hip
      const pouch = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 8, 8),
        leatherMat
      );
      pouch.scale.set(0.8, 1.05, 0.9);
      pouch.position.set(-0.27 * wScale, 0.02, 0.12);
      this.hips.add(pouch);
    }
  }

  private buildSculptedTorso(
    classId: KnightClassId,
    wScale: number,
    hScale: number,
    steelMat: THREE.Material,
    darkArmorMat: THREE.Material,
    mailMat: THREE.Material,
    heraldicMat: THREE.Material,
    clothSolidMat: THREE.Material,
    leatherMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    // Anatomical LatheGeometry Gothic Breastplate (wasp-waist -> broad heroic chest -> neck taper)
    const lathePts = [
      new THREE.Vector2(0.23 * wScale, 0.0),
      new THREE.Vector2(0.22 * wScale, 0.12 * hScale),
      new THREE.Vector2(0.29 * wScale, 0.28 * hScale),
      new THREE.Vector2(0.35 * wScale, 0.44 * hScale),
      new THREE.Vector2(0.32 * wScale, 0.56 * hScale),
      new THREE.Vector2(0.21 * wScale, 0.62 * hScale),
    ];
    const cuirassGeo = new THREE.LatheGeometry(lathePts, 16);
    const cuirass = new THREE.Mesh(
      cuirassGeo,
      classId === 'dual' ? darkArmorMat : steelMat
    );
    cuirass.scale.set(1.06, 1.0, 0.76);
    cuirass.castShadow = true;
    cuirass.receiveShadow = true;
    this.torso.add(cuirass);

    // Raised Gothic Chest Medial Keel / Heraldic Surcoat Breast Panel
    const surcoatShape = new THREE.Shape();
    const sw = 0.21 * wScale;
    surcoatShape.moveTo(-sw, 0.04 * hScale);
    surcoatShape.lineTo(sw, 0.04 * hScale);
    surcoatShape.lineTo(sw * 1.12, 0.52 * hScale);
    surcoatShape.lineTo(-sw * 1.12, 0.52 * hScale);
    surcoatShape.closePath();

    const surcoatGeo = new THREE.ExtrudeGeometry(surcoatShape, {
      depth: 0.03,
      bevelEnabled: true,
      bevelSize: 0.01,
      bevelThickness: 0.01,
      bevelSegments: 2,
    });
    this.normalizePlanarUVs(
      surcoatGeo,
      -sw * 1.14,
      sw * 1.14,
      0.04 * hScale,
      0.52 * hScale
    );
    const surcoatFront = new THREE.Mesh(surcoatGeo, heraldicMat);
    surcoatFront.position.set(0, 0, 0.235 * wScale);
    this.torso.add(surcoatFront);

    // Diagonal leather baldric strap across chest + brass medallion
    const baldric = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.62 * hScale, 0.49 * wScale),
      leatherMat
    );
    baldric.position.set(0, 0.31 * hScale, 0);
    baldric.rotation.z = 0.54;
    this.torso.add(baldric);

    const clasp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.065, 0.04, 10),
      goldMat
    );
    clasp.rotation.x = Math.PI / 2;
    clasp.position.set(0.06, 0.36 * hScale, 0.26 * wScale);
    this.torso.add(clasp);

    // Beveled Neck Gorget + Chainmail Collar
    const gorget = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19 * wScale, 0.27 * wScale, 0.13, 14),
      steelMat
    );
    gorget.position.y = 0.61 * hScale;
    this.torso.add(gorget);

    const gorgetTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.2 * wScale, 0.018, 6, 16),
      goldMat
    );
    gorgetTrim.rotation.x = Math.PI / 2;
    gorgetTrim.position.y = 0.65 * hScale;
    this.torso.add(gorgetTrim);

    // Multi-Lame Articulated Shoulder Pauldrons + Besagew Rondel Shields!
    const pScale =
      classId === 'hammer' ? 1.28 : classId === 'dual' ? 0.84 : 1.06;
    for (const side of [-1, 1]) {
      const pGroup = new THREE.Group();
      pGroup.position.set(side * 0.41 * wScale, 0.53 * hScale, 0);
      pGroup.rotation.z = -side * 0.22;

      // Chainmail armpit gusset
      const gusset = new THREE.Mesh(
        new THREE.SphereGeometry(0.13 * pScale, 10, 8),
        mailMat
      );
      gusset.position.set(-side * 0.04, -0.06, 0);
      pGroup.add(gusset);

      // 3 overlapping curved pauldron lames!
      for (let l = 0; l < 3; l++) {
        const lameR = (0.205 - l * 0.022) * pScale;
        const lame = new THREE.Mesh(
          new THREE.SphereGeometry(
            lameR,
            12,
            8,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.56
          ),
          classId === 'dual' && side === -1 ? darkArmorMat : steelMat
        );
        lame.scale.set(1.12, 0.9, 1.16);
        lame.position.y = -l * 0.065;
        lame.castShadow = true;
        pGroup.add(lame);
      }

      // Gold rim & vertical haute-piece neck-guard fin on Hammer & Sword!
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.19 * pScale, 0.02, 6, 14),
        goldMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.01;
      pGroup.add(rim);

      if (classId === 'hammer' || classId === 'sword') {
        const rondel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.085 * pScale, 0.085 * pScale, 0.03, 12),
          goldMat
        );
        rondel.rotation.x = Math.PI / 2;
        rondel.position.set(-side * 0.09, -0.03, 0.17 * pScale);
        pGroup.add(rondel);
      }

      this.torso.add(pGroup);
    }

    // 3-Segment Articulated Flowing Cloth Cape (or Crossed Back Scabbards + Scarf on Dual)
    this.capeBones.length = 0;
    if (classId === 'dual') {
      // Crossed twin scabbards on back + agile wind scarf!
      for (const s of [-1, 1]) {
        const backScab = new THREE.Mesh(
          new THREE.CylinderGeometry(0.034, 0.024, 0.86, 8),
          leatherMat
        );
        backScab.position.set(0, 0.34 * hScale, -0.22 * wScale);
        backScab.rotation.z = s * 0.58;
        this.torso.add(backScab);
      }
    }

    const capeWidth =
      classId === 'dual'
        ? 0.3
        : classId === 'hammer'
        ? 0.74 * wScale
        : 0.62 * wScale;
    const segLen = classId === 'dual' ? 0.22 : 0.27;

    let parentNode: THREE.Object3D = this.torso;
    for (let seg = 0; seg < 3; seg++) {
      const bone = new THREE.Group();
      if (seg === 0) {
        bone.position.set(0, 0.57 * hScale, -0.21 * wScale);
        bone.rotation.x = 0.16;
      } else {
        bone.position.set(0, -segLen + 0.02, 0);
      }

      const wTop = capeWidth * (1 + seg * 0.08);
      const segGeo = new THREE.BoxGeometry(wTop, segLen, 0.032);
      segGeo.translate(0, -segLen * 0.5, 0);
      const segMesh = new THREE.Mesh(
        segGeo,
        seg === 2 ? heraldicMat : clothSolidMat
      );
      segMesh.castShadow = true;
      bone.add(segMesh);

      parentNode.add(bone);
      parentNode = bone;
      this.capeBones.push(bone);
    }
  }

  private buildMasterworkHelmet(
    classId: KnightClassId,
    scale: number,
    steelMat: THREE.Material,
    darkArmorMat: THREE.Material,
    mailMat: THREE.Material,
    goldMat: THREE.Material,
    plumeMat: THREE.Material,
    visorMat: THREE.Material
  ): void {
    const h = new THREE.Group();
    h.scale.setScalar(scale);

    // Chainmail Aventail neck curtain beneath every helmet!
    const aventail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.24, 0.18, 12),
      mailMat
    );
    aventail.position.y = 0.07;
    h.add(aventail);

    if (classId === 'sword') {
      // Sculpted Lathe Sugarloaf Crusader Greathelm + Brass Cross + Cascading Plume
      const helmPts = [
        new THREE.Vector2(0.26, 0.08),
        new THREE.Vector2(0.27, 0.26),
        new THREE.Vector2(0.255, 0.4),
        new THREE.Vector2(0.18, 0.52),
        new THREE.Vector2(0.01, 0.57),
      ];
      const helm = new THREE.Mesh(
        new THREE.LatheGeometry(helmPts, 16),
        steelMat
      );
      helm.castShadow = true;
      h.add(helm);

      // Visor ocular slit + cheek ventilation holes
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.05, 0.14),
        visorMat
      );
      slit.position.set(0, 0.31, 0.21);
      h.add(slit);

      // Raised gilded facial cross + rivets
      const crossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.38, 0.05),
        goldMat
      );
      crossV.position.set(0, 0.28, 0.255);
      h.add(crossV);

      const crossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.052, 0.05),
        goldMat
      );
      crossH.position.set(0, 0.34, 0.245);
      h.add(crossH);

      // Twisted heraldic torse wreath around crown + 5 cascading plume feathers!
      const torse = new THREE.Mesh(
        new THREE.TorusGeometry(0.19, 0.036, 8, 16),
        plumeMat
      );
      torse.rotation.x = Math.PI / 2 - 0.12;
      torse.position.y = 0.48;
      h.add(torse);

      for (let i = 0; i < 5; i++) {
        const plume = new THREE.Mesh(
          new THREE.ConeGeometry(0.082 - i * 0.008, 0.38 - i * 0.03, 8),
          plumeMat
        );
        plume.position.set(
          (i % 2 === 0 ? 1 : -1) * (i * 0.012),
          0.64 - i * 0.055,
          0.02 - i * 0.095
        );
        plume.rotation.x = -0.55 - i * 0.28;
        plume.castShadow = true;
        h.add(plume);
      }
    } else if (classId === 'dual') {
      // Sculpted Armet / Houndskull Beaked Duelist Visor Helm
      const skullPts = [
        new THREE.Vector2(0.22, 0.08),
        new THREE.Vector2(0.265, 0.24),
        new THREE.Vector2(0.25, 0.4),
        new THREE.Vector2(0.14, 0.51),
        new THREE.Vector2(0.01, 0.54),
      ];
      const skull = new THREE.Mesh(
        new THREE.LatheGeometry(skullPts, 14),
        darkArmorMat
      );
      skull.scale.set(0.95, 1.04, 1.06);
      skull.castShadow = true;
      h.add(skull);

      // Pointed Houndskull visor with central ridge & hinge rosettes
      const visor = new THREE.Mesh(
        new THREE.ConeGeometry(0.205, 0.38, 6),
        steelMat
      );
      visor.rotation.x = Math.PI / 2 + 0.1;
      visor.position.set(0, 0.24, 0.29);
      visor.castShadow = true;
      h.add(visor);

      for (const side of [-1, 1]) {
        const hinge = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 0.04, 8),
          goldMat
        );
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(side * 0.24, 0.27, 0.06);
        h.add(hinge);
      }

      const eyeSlit = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.042, 0.12),
        visorMat
      );
      eyeSlit.position.set(0, 0.31, 0.23);
      h.add(eyeSlit);

      const comb = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.16, 0.38),
        goldMat
      );
      comb.position.set(0, 0.5, -0.03);
      h.add(comb);
    } else if (classId === 'spear') {
      // Sculpted Gothic Sallet / Kettle-Morion Vanguard Helm + Chin Bevor
      const domePts = [
        new THREE.Vector2(0.24, 0.24),
        new THREE.Vector2(0.255, 0.34),
        new THREE.Vector2(0.19, 0.47),
        new THREE.Vector2(0.02, 0.54),
      ];
      const dome = new THREE.Mesh(
        new THREE.LatheGeometry(domePts, 16),
        steelMat
      );
      dome.castShadow = true;
      h.add(dome);

      // Swept kettle brim
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.46, 0.1, 16),
        steelMat
      );
      brim.scale.set(0.95, 1, 1.12);
      brim.position.y = 0.27;
      brim.rotation.x = -0.08;
      brim.castShadow = true;
      h.add(brim);

      // Raised Morion comb crest along top
      const combShape = new THREE.Shape();
      combShape.moveTo(-0.22, 0.42);
      combShape.quadraticCurveTo(0, 0.68, 0.22, 0.42);
      combShape.closePath();
      const comb = new THREE.Mesh(
        new THREE.ExtrudeGeometry(combShape, { depth: 0.04, bevelEnabled: false }),
        goldMat
      );
      comb.rotation.y = Math.PI / 2;
      comb.position.set(-0.02, 0, 0);
      h.add(comb);

      // Armored chin Bevor + dark eye shadow
      const bevor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.24, 0.18, 12, 1, false, -1.1, 2.2),
        darkArmorMat
      );
      bevor.position.set(0, 0.15, 0.04);
      h.add(bevor);

      const faceShadow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.225, 0.225, 0.12, 12),
        visorMat
      );
      faceShadow.position.y = 0.22;
      h.add(faceShadow);
    } else {
      // Class D: Curved-Horn Frog-Mouth Siege Juggernaut Greathelm!
      const helmPts = [
        new THREE.Vector2(0.29, 0.06),
        new THREE.Vector2(0.31, 0.24),
        new THREE.Vector2(0.3, 0.42),
        new THREE.Vector2(0.22, 0.52),
        new THREE.Vector2(0.02, 0.55),
      ];
      const helmCore = new THREE.Mesh(
        new THREE.LatheGeometry(helmPts, 14),
        darkArmorMat
      );
      helmCore.castShadow = true;
      h.add(helmCore);

      // Heavy prow-shaped frog-mouth faceplate
      const prow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.29, 0.32, 0.36, 6),
        steelMat
      );
      prow.position.set(0, 0.23, 0.06);
      prow.castShadow = true;
      h.add(prow);

      const browCrown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.315, 0.1, 12),
        goldMat
      );
      browCrown.position.y = 0.43;
      h.add(browCrown);

      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.05, 0.12),
        visorMat
      );
      slit.position.set(0, 0.3, 0.28);
      h.add(slit);

      // Curved 3D Siege Bull Horns built via CatmullRomCurve3 + TubeGeometry!
      for (const side of [-1, 1]) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.26, 0.38, 0.02),
          new THREE.Vector3(side * 0.44, 0.44, 0.08),
          new THREE.Vector3(side * 0.52, 0.62, 0.18),
          new THREE.Vector3(side * 0.45, 0.76, 0.26),
        ]);
        const hornGeo = new THREE.TubeGeometry(curve, 10, 0.065, 7, false);
        // Taper horn vertices toward tip!
        const pos = hornGeo.attributes.position as THREE.BufferAttribute;
        for (let vi = 0; vi < pos.count; vi++) {
          const ringT = Math.floor(vi / 8) / 10;
          const center = curve.getPointAt(clamp(ringT, 0, 1));
          const vx = pos.getX(vi);
          const vy = pos.getY(vi);
          const vz = pos.getZ(vi);
          const taper = 1 - ringT * 0.85;
          pos.setXYZ(
            vi,
            center.x + (vx - center.x) * taper,
            center.y + (vy - center.y) * taper,
            center.z + (vz - center.z) * taper
          );
        }
        hornGeo.computeVertexNormals();
        const horn = new THREE.Mesh(hornGeo, steelMat);
        horn.castShadow = true;
        h.add(horn);

        const socketRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.072, 0.018, 6, 10),
          goldMat
        );
        socketRing.position.set(side * 0.27, 0.38, 0.02);
        socketRing.rotation.y = Math.PI / 2;
        h.add(socketRing);
      }
    }

    this.headGroup.add(h);
  }

  private buildArticulatedLegs(
    wScale: number,
    hScale: number,
    steelMat: THREE.Material,
    darkArmorMat: THREE.Material,
    mailMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    const hipOffset = 0.185 * wScale;
    this.legR.position.set(-hipOffset, -0.06, 0);
    this.legL.position.set(hipOffset, -0.06, 0);
    this.hips.add(this.legR);
    this.hips.add(this.legL);

    const pairs = [
      [this.legR, this.kneeR, this.footR, -1],
      [this.legL, this.kneeL, this.footL, 1],
    ] as const;

    // Anatomical Lathe calf greave profile
    const greavePts = [
      new THREE.Vector2(0.095 * wScale, 0),
      new THREE.Vector2(0.118 * wScale, 0.16 * hScale),
      new THREE.Vector2(0.105 * wScale, 0.27 * hScale),
    ];
    const greaveGeo = new THREE.LatheGeometry(greavePts, 12);

    for (const [thighGroup, kneeGroup, footGroup, side] of pairs) {
      // Upper thigh cuisse + mail joint
      const hipBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.105 * wScale, 8, 8),
        mailMat
      );
      thighGroup.add(hipBall);

      const cuisse = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.125 * wScale,
          0.105 * wScale,
          0.3 * hScale,
          10
        ),
        darkArmorMat
      );
      cuisse.position.y = -0.16 * hScale;
      cuisse.castShadow = true;
      thighGroup.add(cuisse);

      // Knee Hinge Group at y = -0.31 * hScale
      kneeGroup.position.set(0, -0.31 * hScale, 0);
      thighGroup.add(kneeGroup);

      // Winged Gothic Poleyn (knee guard) with side fan!
      const poleyn = new THREE.Mesh(
        new THREE.SphereGeometry(0.115 * wScale, 10, 8),
        steelMat
      );
      poleyn.scale.set(1.0, 0.9, 1.18);
      poleyn.position.set(0, 0, 0.03);
      kneeGroup.add(poleyn);

      const wing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.025, 8),
        goldMat
      );
      wing.rotation.z = Math.PI / 2;
      wing.position.set(side * 0.115 * wScale, 0, -0.01);
      kneeGroup.add(wing);

      // Sculpted Shin Greave
      const greave = new THREE.Mesh(greaveGeo, steelMat);
      greave.position.y = -0.27 * hScale;
      greave.castShadow = true;
      kneeGroup.add(greave);

      // Ankle / Foot Sabaton Group at y = -0.28 * hScale
      footGroup.position.set(0, -0.28 * hScale, 0);
      kneeGroup.add(footGroup);

      // Articulated Laminated Sabaton + Beveled Toe Cap + Heel Spur!
      const heel = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 * wScale, 0.14 * hScale, 0.22),
        steelMat
      );
      heel.position.set(0, -0.04, -0.01);
      heel.castShadow = true;
      footGroup.add(heel);

      const instep = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095 * wScale, 0.11 * wScale, 0.22, 8),
        steelMat
      );
      instep.rotation.x = Math.PI / 2 + 0.18;
      instep.position.set(0, -0.05, 0.12);
      instep.castShadow = true;
      footGroup.add(instep);

      const toePoint = new THREE.Mesh(
        new THREE.ConeGeometry(0.095 * wScale, 0.14, 6),
        steelMat
      );
      toePoint.rotation.x = Math.PI / 2;
      toePoint.position.set(0, -0.065, 0.26);
      footGroup.add(toePoint);
    }
  }

  private buildArticulatedArms(
    wScale: number,
    hScale: number,
    steelMat: THREE.Material,
    darkArmorMat: THREE.Material,
    mailMat: THREE.Material,
    leatherMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    const shoulderX = 0.44 * wScale;
    const shoulderY = 0.51 * hScale;
    this.armR.position.set(-shoulderX, shoulderY, 0);
    this.armL.position.set(shoulderX, shoulderY, 0);
    this.torso.add(this.armR);
    this.torso.add(this.armL);

    const armPairs = [
      [this.armR, this.elbowR, this.handR, -1],
      [this.armL, this.elbowL, this.handL, 1],
    ] as const;

    for (const [upperGroup, elbowGroup, handGroup, side] of armPairs) {
      // Upper arm rerebrace
      const rerebrace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.092, 0.25, 10),
        darkArmorMat
      );
      rerebrace.position.y = -0.12;
      rerebrace.castShadow = true;
      upperGroup.add(rerebrace);

      // Elbow Hinge at y = -0.24
      elbowGroup.position.set(0, -0.24, 0);
      upperGroup.add(elbowGroup);

      const mailJoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.088, 8, 8),
        mailMat
      );
      elbowGroup.add(mailJoint);

      // Fluted Elbow Couter
      const couter = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.14, 8),
        steelMat
      );
      couter.rotation.x = -Math.PI / 2;
      couter.position.set(side * 0.02, 0, -0.06);
      elbowGroup.add(couter);

      // Tapered Forearm Vambrace
      const vambrace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.082, 0.22, 10),
        steelMat
      );
      vambrace.position.set(0, -0.11, 0.015);
      vambrace.castShadow = true;
      elbowGroup.add(vambrace);

      // Gauntlet Hand Group at y = -0.22
      handGroup.position.set(0, -0.22, 0.03);
      elbowGroup.add(handGroup);

      // Flared Hourglass Gauntlet Cuff + Knuckle Plate + Curled Fingers
      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.115, 0.088, 0.12, 10),
        steelMat
      );
      cuff.position.y = 0.04;
      handGroup.add(cuff);

      const cuffTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.112, 0.012, 6, 12),
        goldMat
      );
      cuffTrim.rotation.x = Math.PI / 2;
      cuffTrim.position.y = 0.09;
      handGroup.add(cuffTrim);

      const palm = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.14, 0.16),
        leatherMat
      );
      palm.position.y = -0.03;
      handGroup.add(palm);

      const dorsalPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.15, 0.08),
        steelMat
      );
      dorsalPlate.position.set(0, -0.03, -0.06);
      dorsalPlate.castShadow = true;
      handGroup.add(dorsalPlate);

      const fingers = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.09, 0.14),
        steelMat
      );
      fingers.position.set(0, -0.09, 0.03);
      handGroup.add(fingers);
    }
  }

  private buildMasterworkWeapons(
    classId: KnightClassId,
    bladeMat: THREE.Material,
    steelMat: THREE.Material,
    darkMat: THREE.Material,
    leatherMat: THREE.Material,
    heraldicMat: THREE.Material,
    clothSolidMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    if (classId === 'sword') {
      const sword = this.makeExtrudedLongsword(
        bladeMat,
        darkMat,
        leatherMat,
        goldMat,
        1.56,
        0.15
      );
      sword.position.set(0, -0.03, 0.08);
      sword.rotation.x = Math.PI * 0.44;
      this.handR.add(sword);

      this.weaponBaseAnchor.position.set(0, 0.24, 0);
      this.weaponTipAnchor.position.set(0, 1.92, 0);
      sword.add(this.weaponBaseAnchor);
      sword.add(this.weaponTipAnchor);
    } else if (classId === 'dual') {
      const saberR = this.makeCurvedDuelistSaber(
        bladeMat,
        leatherMat,
        goldMat,
        1.32
      );
      saberR.position.set(0, -0.03, 0.08);
      saberR.rotation.x = Math.PI * 0.45;
      this.handR.add(saberR);

      this.weaponBaseAnchor.position.set(0, 0.22, 0);
      this.weaponTipAnchor.position.set(0, 1.62, 0.14);
      saberR.add(this.weaponBaseAnchor);
      saberR.add(this.weaponTipAnchor);

      const saberL = this.makeCurvedDuelistSaber(
        bladeMat,
        leatherMat,
        steelMat,
        1.32
      );
      saberL.position.set(0, -0.03, 0.08);
      saberL.rotation.x = Math.PI * 0.45;
      this.handL.add(saberL);
    } else if (classId === 'spear') {
      const spear = new THREE.Group();

      // Ash polearm shaft with spiral leather grip wraps
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.044, 0.052, 2.65, 10),
        leatherMat
      );
      shaft.position.y = 0.86;
      shaft.castShadow = true;
      spear.add(shaft);

      for (const gy of [0.05, 0.55, 1.15]) {
        const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(0.054, 0.054, 0.08, 10),
          goldMat
        );
        ring.position.y = gy;
        spear.add(ring);
      }

      const buttSpike = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.26, 8),
        steelMat
      );
      buttSpike.rotation.x = Math.PI;
      buttSpike.position.y = -0.52;
      spear.add(buttSpike);

      // Sculpted ExtrudeGeometry Winged Partisan Spearhead!
      const pShape = new THREE.Shape();
      pShape.moveTo(0, 0.82); // sharp tip
      pShape.lineTo(0.11, 0.42);
      pShape.lineTo(0.24, 0.22); // right parry lug wing!
      pShape.lineTo(0.1, 0.16);
      pShape.lineTo(0.06, 0.0);
      pShape.lineTo(-0.06, 0.0);
      pShape.lineTo(-0.1, 0.16);
      pShape.lineTo(-0.24, 0.22); // left parry lug wing!
      pShape.lineTo(-0.11, 0.42);
      pShape.closePath();

      const spearHead = new THREE.Mesh(
        new THREE.ExtrudeGeometry(pShape, {
          depth: 0.026,
          bevelEnabled: true,
          bevelThickness: 0.014,
          bevelSize: 0.012,
          bevelSegments: 2,
        }),
        bladeMat
      );
      spearHead.position.set(0, 2.08, -0.013);
      spearHead.castShadow = true;
      spear.add(spearHead);

      const socket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.056, 0.22, 10),
        goldMat
      );
      socket.position.y = 2.04;
      spear.add(socket);

      // Twin swallowtail battle pennants below spearhead
      for (const pIdx of [0, 1]) {
        const flag = new THREE.Mesh(
          new THREE.ConeGeometry(0.11, 0.52 - pIdx * 0.1, 4),
          pIdx === 0 ? heraldicMat : clothSolidMat
        );
        flag.position.set(0.19, 1.94 - pIdx * 0.09, pIdx * 0.04);
        flag.rotation.z = -Math.PI * 0.42 - pIdx * 0.12;
        spear.add(flag);
      }

      spear.rotation.x = Math.PI * 0.48;
      spear.position.set(0, 0, 0.08);
      this.handR.add(spear);

      this.weaponBaseAnchor.position.set(0, 1.85, 0);
      this.weaponTipAnchor.position.set(0, 2.9, 0);
      spear.add(this.weaponBaseAnchor);
      spear.add(this.weaponTipAnchor);
    } else {
      // Class D: Bec-de-Corbin Raven's-Beak Warhammer + Classic Pointed Heater Shield!
      const hammer = new THREE.Group();
      const haft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.058, 1.46, 8),
        leatherMat
      );
      haft.position.y = 0.56;
      haft.castShadow = true;
      hammer.add(haft);

      // Steel side langets with rivets
      const langet = new THREE.Mesh(
        new THREE.BoxGeometry(0.115, 0.52, 0.075),
        steelMat
      );
      langet.position.y = 1.02;
      hammer.add(langet);

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.082, 0.075, 0.16, 10),
        goldMat
      );
      collar.position.y = 1.24;
      hammer.add(collar);

      // Heavy Warhammer Block + 4-Pronged Striking Crown + Extruded Curved Raven's Beak!
      const coreBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.28, 0.42),
        darkMat
      );
      coreBlock.position.set(0, 1.26, 0.06);
      coreBlock.castShadow = true;
      hammer.add(coreBlock);

      const crownNeck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.13, 0.18, 8),
        steelMat
      );
      crownNeck.rotation.x = Math.PI / 2;
      crownNeck.position.set(0, 1.26, 0.34);
      hammer.add(crownNeck);

      // 4 brutal armor-crushing prongs on hammer face
      for (const px of [-0.065, 0.065]) {
        for (const py of [-0.065, 0.065]) {
          const prong = new THREE.Mesh(
            new THREE.ConeGeometry(0.055, 0.12, 4),
            bladeMat
          );
          prong.rotation.x = Math.PI / 2;
          prong.position.set(px, 1.26 + py, 0.47);
          hammer.add(prong);
        }
      }

      // Curved Raven's Beak armor-piercing back fluke
      const beakShape = new THREE.Shape();
      beakShape.moveTo(0, 0.12);
      beakShape.quadraticCurveTo(-0.28, 0.1, -0.46, -0.12);
      beakShape.quadraticCurveTo(-0.24, -0.02, 0, -0.1);
      beakShape.closePath();

      const beak = new THREE.Mesh(
        new THREE.ExtrudeGeometry(beakShape, {
          depth: 0.06,
          bevelEnabled: true,
          bevelSize: 0.015,
          bevelThickness: 0.015,
          bevelSegments: 2,
        }),
        bladeMat
      );
      beak.rotation.y = Math.PI / 2;
      beak.position.set(0.03, 1.26, -0.12);
      beak.castShadow = true;
      hammer.add(beak);

      const topSpike = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, 0.34, 6),
        bladeMat
      );
      topSpike.position.set(0, 1.56, 0.04);
      hammer.add(topSpike);

      hammer.rotation.x = Math.PI * 0.38;
      hammer.position.set(0, 0, 0.08);
      this.handR.add(hammer);

      this.weaponBaseAnchor.position.set(0, 0.96, 0);
      this.weaponTipAnchor.position.set(0, 1.68, 0.25);
      hammer.add(this.weaponBaseAnchor);
      hammer.add(this.weaponTipAnchor);

      // Classic Medieval Pointed Heater / Pavise Shield (ExtrudeGeometry + 14 Brass Rivets!)
      const shield = new THREE.Group();
      const shShape = new THREE.Shape();
      shShape.moveTo(-0.44, 0.58);
      shShape.lineTo(0.44, 0.58);
      shShape.quadraticCurveTo(0.46, -0.06, 0, -0.68);
      shShape.quadraticCurveTo(-0.46, -0.06, -0.44, 0.58);

      const shieldSteelRim = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shShape, {
          depth: 0.065,
          bevelEnabled: true,
          bevelSize: 0.028,
          bevelThickness: 0.025,
          bevelSegments: 2,
        }),
        steelMat
      );
      shieldSteelRim.castShadow = true;
      shield.add(shieldSteelRim);

      // Inset Hand-Painted Heraldic Shield Face!
      const innerShape = new THREE.Shape();
      innerShape.moveTo(-0.37, 0.51);
      innerShape.lineTo(0.37, 0.51);
      innerShape.quadraticCurveTo(0.38, -0.05, 0, -0.58);
      innerShape.quadraticCurveTo(-0.38, -0.05, -0.37, 0.51);

      const innerGeo = new THREE.ShapeGeometry(innerShape, 12);
      // Normalize UVs [0..1] for heraldry texture!
      const uv = innerGeo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (uv.getX(i) + 0.4) / 0.8, (uv.getY(i) + 0.6) / 1.15);
      }
      const shieldFace = new THREE.Mesh(innerGeo, heraldicMat);
      shieldFace.position.z = 0.093;
      shield.add(shieldFace);

      // Raised Golden Sun Boss & 12 Perimeter Dome Rivets!
      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 12, 10),
        goldMat
      );
      boss.scale.set(1, 1, 0.55);
      boss.position.set(0, 0.06, 0.11);
      shield.add(boss);

      const rivetGeo = new THREE.SphereGeometry(0.022, 6, 6);
      const rivetCoords: Array<[number, number]> = [
        [-0.36, 0.53],
        [0, 0.53],
        [0.36, 0.53],
        [-0.4, 0.25],
        [0.4, 0.25],
        [-0.36, -0.04],
        [0.36, -0.04],
        [-0.25, -0.32],
        [0.25, -0.32],
        [0, -0.58],
      ];
      for (const [rx, ry] of rivetCoords) {
        const riv = new THREE.Mesh(rivetGeo, goldMat);
        riv.position.set(rx, ry, 0.095);
        shield.add(riv);
      }

      // Inner leather arm-straps on back of shield
      const strap = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.024, 6, 10),
        leatherMat
      );
      strap.position.set(0, 0.05, -0.02);
      shield.add(strap);

      shield.position.set(0.2, 0.05, 0.22);
      shield.rotation.y = 0.36;
      this.handL.add(shield);
    }
  }

  private makeExtrudedLongsword(
    bladeMat: THREE.Material,
    fullerMat: THREE.Material,
    gripMat: THREE.Material,
    goldMat: THREE.Material,
    bladeLen: number,
    bladeWidth: number
  ): THREE.Group {
    const g = new THREE.Group();

    // Ribbed leather grip via LatheGeometry
    const gripPts = [
      new THREE.Vector2(0.044, -0.15),
      new THREE.Vector2(0.052, 0.0),
      new THREE.Vector2(0.046, 0.15),
    ];
    const grip = new THREE.Mesh(new THREE.LatheGeometry(gripPts, 10), gripMat);
    g.add(grip);

    // Faceted Wheel Pommel with gold recessed coin
    const pommel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.055, 12),
      goldMat
    );
    pommel.rotation.x = Math.PI / 2;
    pommel.position.y = -0.19;
    g.add(pommel);

    // Flared Knightly Crossguard (Quillons)
    const guardShape = new THREE.Shape();
    guardShape.moveTo(-0.26, 0.045);
    guardShape.quadraticCurveTo(0, 0.02, 0.26, 0.045);
    guardShape.lineTo(0.28, -0.045);
    guardShape.quadraticCurveTo(0, -0.015, -0.28, -0.045);
    guardShape.closePath();

    const crossguard = new THREE.Mesh(
      new THREE.ExtrudeGeometry(guardShape, {
        depth: 0.075,
        bevelEnabled: true,
        bevelSize: 0.01,
        bevelThickness: 0.01,
        bevelSegments: 2,
      }),
      goldMat
    );
    crossguard.position.set(0, 0.16, -0.037);
    crossguard.castShadow = true;
    g.add(crossguard);

    // Custom 2D Tapered Longsword Blade Profile + Central Blood-Groove Fuller!
    const hw = bladeWidth * 0.5;
    const bShape = new THREE.Shape();
    bShape.moveTo(-hw, 0);
    bShape.lineTo(hw, 0);
    bShape.lineTo(hw * 0.62, bladeLen * 0.78);
    bShape.lineTo(0, bladeLen);
    bShape.lineTo(-hw * 0.62, bladeLen * 0.78);
    bShape.closePath();

    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(bShape, {
        depth: 0.018,
        bevelEnabled: true,
        bevelThickness: 0.016,
        bevelSize: 0.018,
        bevelSegments: 2,
      }),
      bladeMat
    );
    blade.position.set(0, 0.19, -0.009);
    blade.castShadow = true;
    g.add(blade);

    const fuller = new THREE.Mesh(
      new THREE.BoxGeometry(bladeWidth * 0.24, bladeLen * 0.64, 0.054),
      fullerMat
    );
    fuller.position.set(0, 0.19 + bladeLen * 0.33, 0);
    g.add(fuller);

    return g;
  }

  private makeCurvedDuelistSaber(
    bladeMat: THREE.Material,
    gripMat: THREE.Material,
    guardMat: THREE.Material,
    bladeLen: number
  ): THREE.Group {
    const g = new THREE.Group();

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.044, 0.28, 8),
      gripMat
    );
    g.add(grip);

    // Swept D-Ring Knuckle Guard!
    const bow = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.018, 6, 12, Math.PI),
      guardMat
    );
    bow.rotation.y = Math.PI / 2;
    bow.rotation.z = -Math.PI / 2;
    bow.position.set(0, 0.02, 0.04);
    g.add(bow);

    const quillon = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.05, 0.34),
      guardMat
    );
    quillon.position.set(0, 0.15, 0.02);
    g.add(quillon);

    // Custom Curved Falchion / Saber Blade Shape!
    const sShape = new THREE.Shape();
    sShape.moveTo(-0.04, 0);
    sShape.quadraticCurveTo(-0.03, bladeLen * 0.55, 0.13, bladeLen); // sharp curved tip!
    sShape.quadraticCurveTo(0.11, bladeLen * 0.52, 0.055, 0);
    sShape.closePath();

    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(sShape, {
        depth: 0.014,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
      }),
      bladeMat
    );
    blade.rotation.y = Math.PI / 2;
    blade.position.set(-0.007, 0.16, 0);
    blade.castShadow = true;
    g.add(blade);

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
    this.hips.position.set(0, 0.74 * hScale, 0);
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
    this.elbowR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.elbowL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.kneeR.rotation.set(0, 0, 0);
    this.footR.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.kneeL.rotation.set(0, 0, 0);
    this.footL.rotation.set(0, 0, 0);

    this.stunRing.visible = false;
    this.footRing.visible = fighter.isAlive;
    this.contactShadow.scale.setScalar(fighter.isAlive ? 1.0 : 1.35);

    const t = fighter.animTime;

    if (fighter.state === 'Dead') {
      this.hips.position.y = 0.24;
      this.hips.rotation.x = -Math.PI * 0.46;
      this.hips.rotation.z = 0.22;
      this.armR.rotation.z = -0.75;
      this.elbowR.rotation.x = -0.45;
      this.armL.rotation.z = 0.72;
      this.elbowL.rotation.x = -0.35;
      this.legR.rotation.x = 0.2;
      this.kneeR.rotation.x = 0.35;
      this.legL.rotation.x = -0.15;
      this.trail.clear();
      return;
    }

    this.applyBaseClassStance(fighter.classId, t);

    // 2-Bone Biomechanical Run / Walk Cycle + Flowing 3-Segment Cape!
    if (fighter.state === 'Moving') {
      const freq = fighter.isSprinting ? 13.5 : 9.5;
      const amp = fighter.isSprinting ? 0.66 : 0.46;
      const phase = t * freq;
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);

      this.legR.rotation.x = sinP * amp;
      this.kneeR.rotation.x = Math.max(0.08, -cosP * amp * 1.15 + 0.28);
      this.footR.rotation.x = -this.kneeR.rotation.x * 0.45;

      this.legL.rotation.x = -sinP * amp;
      this.kneeL.rotation.x = Math.max(0.08, cosP * amp * 1.15 + 0.28);
      this.footL.rotation.x = -this.kneeL.rotation.x * 0.45;

      this.hips.position.y += Math.abs(cosP) * 0.075 - 0.03;
      this.torso.rotation.x = fighter.isSprinting ? 0.24 : 0.1;
      this.torso.rotation.y = sinP * 0.09;
      this.armR.rotation.x += -sinP * amp * 0.32;
      this.armL.rotation.x += sinP * amp * 0.32;

      const baseCapeLift = fighter.isSprinting ? 0.48 : 0.28;
      this.capeBones.forEach((b, idx) => {
        b.rotation.x =
          (idx === 0 ? baseCapeLift : 0.14) +
          Math.sin(phase - idx * 0.85) * (0.1 + idx * 0.04);
      });
    } else {
      this.capeBones.forEach((b, idx) => {
        b.rotation.x =
          (idx === 0 ? 0.15 : 0.04) +
          Math.sin(t * 2.4 - idx * 0.7) * 0.035;
      });
    }

    if (fighter.isChargingHeavy) {
      const c = fighter.chargeRatio;
      const jitter = Math.sin(t * 42) * 0.03 * c;
      this.torso.rotation.y = -0.56 * c;
      this.torso.rotation.x = -0.14 * c;
      this.armR.rotation.x = -1.25 * c + jitter;
      this.elbowR.rotation.x = -0.75 * c;
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
      this.elbowR.rotation.x = -0.5;
      this.armL.rotation.z = 0.5;
      this.kneeR.rotation.x = 0.25;
      this.kneeL.rotation.x = 0.25;
    } else if (fighter.state === 'Stunned') {
      this.stunRing.visible = true;
      this.stunRing.rotation.y = t * 4.8;
      this.torso.rotation.z = Math.sin(t * 9) * 0.2;
      this.torso.rotation.x = 0.18 + Math.cos(t * 9) * 0.12;
      this.headGroup.rotation.z = Math.cos(t * 9) * 0.22;
      this.kneeR.rotation.x = 0.28;
      this.kneeL.rotation.x = 0.28;
      this.hips.position.y -= 0.06;
    }

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
      0.74 * hScale + Math.sin(elapsed * 2.4) * 0.025,
      0
    );
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, Math.sin(elapsed * 1.2) * 0.08, 0);
    this.armR.rotation.set(0, 0, 0);
    this.elbowR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.elbowL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.kneeR.rotation.set(0.08, 0, 0);
    this.legL.rotation.set(-0.08, 0, 0);
    this.kneeL.rotation.set(0.14, 0, 0);

    this.applyBaseClassStance(this.config.id, elapsed);
    this.capeBones.forEach((b, idx) => {
      b.rotation.x =
        (idx === 0 ? 0.16 : 0.05) + Math.sin(elapsed * 2.2 - idx * 0.7) * 0.04;
    });
  }

  private applyBaseClassStance(classId: KnightClassId, t: number): void {
    const breathe = Math.sin(t * 2.8) * 0.04;
    if (classId === 'sword') {
      this.armR.rotation.x = -0.22 + breathe;
      this.armR.rotation.z = -0.2;
      this.elbowR.rotation.x = -0.42;
      this.armL.rotation.x = -0.15 - breathe;
      this.armL.rotation.z = 0.16;
      this.elbowL.rotation.x = -0.35;
    } else if (classId === 'dual') {
      this.torso.rotation.x = 0.13;
      this.armR.rotation.x = -0.28 + breathe;
      this.armR.rotation.z = -0.28;
      this.elbowR.rotation.x = -0.48;
      this.armL.rotation.x = -0.28 - breathe;
      this.armL.rotation.z = 0.28;
      this.elbowL.rotation.x = -0.48;
    } else if (classId === 'spear') {
      this.armR.rotation.x = -0.14 + breathe;
      this.armR.rotation.z = -0.14;
      this.elbowR.rotation.x = -0.32;
      this.armL.rotation.x = -0.45;
      this.armL.rotation.y = -0.44;
      this.elbowL.rotation.x = -0.52;
    } else {
      // Hammer & Tower Shield poised guard
      this.armR.rotation.x = -0.16 + breathe;
      this.armR.rotation.z = -0.24;
      this.elbowR.rotation.x = -0.38;
      this.armL.rotation.x = -0.34;
      this.armL.rotation.y = -0.28;
      this.elbowL.rotation.x = -0.45;
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

    // Lunge leg bend during active strike!
    if (phase === 'Active') {
      this.legR.rotation.x = -0.42;
      this.kneeR.rotation.x = 0.58;
      this.legL.rotation.x = 0.35;
      this.kneeL.rotation.x = 0.22;
      this.hips.position.y -= 0.07;
    }

    if (style === 'spear_poke' || style === 'spear_impale') {
      if (phase === 'Windup') {
        this.torso.rotation.y = lerp(0, -0.48, p);
        this.armR.rotation.x = lerp(-0.15, 0.52, p);
        this.elbowR.rotation.x = lerp(-0.32, -0.78, p);
      } else if (phase === 'Active') {
        this.torso.rotation.y = lerp(-0.48, 0.42, p);
        this.torso.rotation.x = 0.25;
        this.armR.rotation.x = lerp(0.52, -1.02, p);
        this.elbowR.rotation.x = lerp(-0.78, -0.08, p); // full arm extension!
      } else {
        this.torso.rotation.y = lerp(0.42, 0, p);
        this.torso.rotation.x = lerp(0.25, 0, p);
        this.armR.rotation.x = lerp(-1.02, -0.15, p);
        this.elbowR.rotation.x = lerp(-0.08, -0.32, p);
      }
      return;
    }

    if (style === 'overhead_cleave' || style === 'hammer_slam') {
      if (phase === 'Windup') {
        this.torso.rotation.x = lerp(0, -0.36, p);
        this.armR.rotation.x = lerp(-0.2, -2.25, p);
        this.elbowR.rotation.x = lerp(-0.4, -0.72, p);
        this.armR.rotation.z = -0.1;
      } else if (phase === 'Active') {
        this.torso.rotation.x = lerp(-0.36, 0.52, p);
        this.hips.position.y -= 0.14 * p;
        this.kneeR.rotation.x = 0.65 * p;
        this.kneeL.rotation.x = 0.65 * p;
        this.armR.rotation.x = lerp(-2.25, 0.42, p);
        this.elbowR.rotation.x = lerp(-0.72, -0.12, p);
      } else {
        this.torso.rotation.x = lerp(0.52, 0, p);
        this.hips.position.y -= 0.14 * (1 - p);
        this.armR.rotation.x = lerp(0.42, -0.2, p);
        this.elbowR.rotation.x = lerp(-0.12, -0.38, p);
      }
      return;
    }

    if (style === 'dual_left') {
      if (phase === 'Windup') {
        this.torso.rotation.y = lerp(0, 0.52, p);
        this.armL.rotation.x = -1.05 * p;
        this.elbowL.rotation.x = -0.75 * p;
        this.armL.rotation.z = 0.82 * p;
      } else if (phase === 'Active') {
        this.torso.rotation.y = lerp(0.52, -0.58, p);
        this.armL.rotation.x = -0.68;
        this.elbowL.rotation.x = -0.18;
        this.armL.rotation.y = lerp(0.52, -1.12, p);
      } else {
        this.torso.rotation.y = lerp(-0.58, 0, p);
        this.armL.rotation.x = lerp(-0.68, -0.28, p);
        this.elbowL.rotation.x = -0.45;
      }
      return;
    }

    if (style === 'dual_cross' || style === 'dual_finisher') {
      if (phase === 'Windup') {
        this.torso.rotation.x = -0.22 * p;
        this.armR.rotation.z = -1.1 * p;
        this.armL.rotation.z = 1.1 * p;
        this.armR.rotation.x = -0.85 * p;
        this.armL.rotation.x = -0.85 * p;
        this.elbowR.rotation.x = -0.7;
        this.elbowL.rotation.x = -0.7;
      } else if (phase === 'Active') {
        this.torso.rotation.x = 0.34;
        this.torso.rotation.y =
          style === 'dual_finisher' ? p * Math.PI * 1.45 : 0;
        this.armR.rotation.z = lerp(-1.1, 0.58, p);
        this.armL.rotation.z = lerp(1.1, -0.58, p);
        this.armR.rotation.x = -0.72;
        this.armL.rotation.x = -0.72;
        this.elbowR.rotation.x = -0.18;
        this.elbowL.rotation.x = -0.18;
      } else {
        this.torso.rotation.x = lerp(0.34, 0.12, p);
        this.armR.rotation.z = lerp(0.58, -0.28, p);
        this.armL.rotation.z = lerp(-0.58, 0.28, p);
        this.elbowR.rotation.x = -0.45;
        this.elbowL.rotation.x = -0.45;
      }
      return;
    }

    const dir = style === 'slash_left' ? -1 : 1;
    if (phase === 'Windup') {
      this.torso.rotation.y = lerp(0, -0.65 * dir, p);
      this.armR.rotation.x = lerp(-0.22, -1.05, p);
      this.elbowR.rotation.x = lerp(-0.42, -0.78, p);
      this.armR.rotation.z = -0.68 * dir * p;
    } else if (phase === 'Active') {
      this.torso.rotation.y = lerp(-0.65 * dir, 0.7 * dir, p);
      this.torso.rotation.x = 0.22;
      this.armR.rotation.x = -0.78;
      this.elbowR.rotation.x = -0.15;
      this.armR.rotation.y = lerp(-0.52 * dir, 1.08 * dir, p);
    } else {
      this.torso.rotation.y = lerp(0.7 * dir, 0, p);
      this.torso.rotation.x = lerp(0.22, 0, p);
      this.armR.rotation.x = lerp(-0.78, -0.22, p);
      this.elbowR.rotation.x = lerp(-0.15, -0.42, p);
      this.armR.rotation.y = lerp(1.08 * dir, 0, p);
    }
  }

  private applyBlockingAnimation(
    classId: KnightClassId,
    elapsed: number
  ): void {
    // Grounded defensive knee bend
    this.hips.position.y -= 0.08;
    this.legR.rotation.x = -0.22;
    this.kneeR.rotation.x = 0.42;
    this.legL.rotation.x = 0.18;
    this.kneeL.rotation.x = 0.35;

    if (classId === 'hammer') {
      this.torso.rotation.y = 0.24;
      this.armL.rotation.x = -0.62;
      this.armL.rotation.y = -0.84;
      this.elbowL.rotation.x = -0.55;
      this.armR.rotation.x = -0.35;
      this.elbowR.rotation.x = -0.65;
    } else if (classId === 'dual') {
      this.armR.rotation.x = -0.95;
      this.elbowR.rotation.x = -0.65;
      this.armR.rotation.z = 0.58;
      this.armL.rotation.x = -0.95;
      this.elbowL.rotation.x = -0.65;
      this.armL.rotation.z = -0.58;
    } else if (classId === 'spear') {
      const sweep = clamp(elapsed / 0.28, 0, 1);
      this.torso.rotation.y = lerp(-0.6, 0.55, sweep);
      this.armR.rotation.x = -0.85;
      this.elbowR.rotation.x = -0.55;
      this.armR.rotation.z = 0.72;
      this.armL.rotation.x = -0.8;
      this.elbowL.rotation.x = -0.5;
    } else {
      this.torso.rotation.y = -0.22;
      this.armR.rotation.x = -1.05;
      this.elbowR.rotation.x = -0.62;
      this.armR.rotation.z = 0.72;
      this.armL.rotation.x = -0.75;
      this.elbowL.rotation.x = -0.55;
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
      this.torso.rotation.x = 0.38;
      this.armL.rotation.x = -0.82;
      this.armL.rotation.y = -0.9;
      this.elbowL.rotation.x = -0.45;
      this.legR.rotation.x = -0.5;
      this.kneeR.rotation.x = 0.7;
    } else if (mode === 'backstep') {
      this.hips.position.y += Math.sin(progress * Math.PI) * 0.26;
      this.torso.rotation.x = -0.24;
      this.kneeR.rotation.x = 0.55;
      this.kneeL.rotation.x = 0.45;
    } else if (mode === 'quick_dash') {
      this.hips.position.y -= 0.18;
      this.torso.rotation.x = 0.48;
      this.armR.rotation.x = 0.45;
      this.armL.rotation.x = 0.45;
      this.kneeR.rotation.x = 0.65;
      this.kneeL.rotation.x = 0.55;
    } else {
      this.hips.position.y -= 0.18;
      this.torso.rotation.x = progress * Math.PI * 2;
      this.kneeR.rotation.x = 0.85;
      this.kneeL.rotation.x = 0.85;
    }
  }
}
