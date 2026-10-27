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
 * Crisp Stepped Pixel-Style 3D Weapon Slash Ribbon Trail
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
      // Quantize trail fade into crisp cel/pixel steps!
      const rawFade = 1 - i / (this.maxSamples - 1);
      const stepped = Math.ceil(rawFade * 4) / 4;
      const intensity = stepped * stepped;
      colors[i * 6 + 0] = 0.85 * intensity;
      colors[i * 6 + 1] = 0.72 * intensity;
      colors[i * 6 + 2] = 0.35 * intensity;

      colors[i * 6 + 3] = 1.45 * intensity;
      colors[i * 6 + 4] = 1.32 * intensity;
      colors[i * 6 + 5] = 0.85 * intensity;

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

    this.mat.color.setHex(isHeavy ? 0xffa83b : 0xfff8dc);
    this.mat.opacity = isHeavy ? 0.92 : 0.78;

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
 * Blockbench / Chibi-Heroic Low-Poly Pixel-Art Knight Rig (Reference-Matched Style):
 * - Clean flat-shaded 6-sided faceted limbs, torso, flared cuffs, and chunky two-tone cuffed boots
 * - Expressive 32x32 NearestFilter pixel-art face (determined brows, anime-pixel eyes, 3D nose wedge)
 * - Layered stepped voxel/blocky hair locks + class-distinct open-faced / raised-visor knight helmets
 * - Chunky leather belt with square pixel-gold buckle, flared tunic peplum & pixel heraldry
 * - True 2-bone articulated arms & legs + flowing stepped hair & cape bones
 */
export class KnightVisualRig {
  public readonly root = new THREE.Group();
  public readonly trail = new WeaponRibbonTrail();

  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly hairBackGroup = new THREE.Group();

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

    // Matte, Flat-Shaded Cel/Low-Poly Materials (zero muddy metallic normal-map noise!)
    const flatMat = (
      hex: number,
      map?: THREE.Texture
    ): THREE.MeshStandardMaterial =>
      this.trackMat(
        new THREE.MeshStandardMaterial({
          color: hex,
          map: map ?? null,
          roughness: 0.95,
          metalness: 0.0,
          flatShading: true,
          envMapIntensity: 0.12,
        })
      );

    // Harmonized pastel-vibrant low-poly palette matching reference warmth & clarity
    const skinMat = flatMat(0xe6a97c);
    const faceMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: mats.createKnightFaceTexture(classId, '#e6a97c'),
        roughness: 0.96,
        metalness: 0.0,
        flatShading: true,
        envMapIntensity: 0.08,
      })
    );

    const hairColors: Record<KnightClassId, number> = {
      sword: 0x6b442b, // warm chestnut brown (just like reference!)
      dual: 0x523325,  // rich dark espresso-auburn
      spear: 0x8c5a32, // golden-russet chestnut
      hammer: 0x5e3c28, // deep oak brown
    };
    const hairMat = flatMat(hairColors[classId]);

    const brightSteelMat = flatMat(
      classId === 'dual' ? 0x9aa8bd : 0xd8e2f0
    );
    const midSteelMat = flatMat(
      classId === 'dual' ? 0x5c687d : 0xa3b1c6
    );
    const bladeLightMat = flatMat(0xf2f7ff);
    const bladeEdgeMat = flatMat(0xbccae0);

    const tunicTex = mats.createKnightTunicTexture(
      classId,
      clothHex,
      vis.primarySteel
    );
    const tunicMat = flatMat(0xffffff, tunicTex);

    const clothSolidMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: clothHex,
        roughness: 0.95,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide,
        envMapIntensity: 0.1,
      })
    );
    const clothDarkMat = flatMat(
      new THREE.Color(clothHex).offsetHSL(0.01, 0.04, -0.11).getHex()
    );

    const heraldicTex = mats.createClassHeraldryTexture(classId, clothHex);
    const heraldicMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: heraldicTex,
        roughness: 0.94,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide,
        envMapIntensity: 0.1,
      })
    );

    const leatherMat = flatMat(0x7c5840); // warm saddle brown (belt, cuffs & boots!)
    const darkLeatherMat = flatMat(0x593d2b);
    const creamWrapMat = flatMat(0xe6e4ec); // crisp white/silver shin wraps & boot toe-cap!
    const soleMat = flatMat(0xa89f9a);
    const goldMat = flatMat(0xf4c444); // crisp pixel-art gold buckle & trim!
    const plumeMat = flatMat(vis.plumeColor);

    // Crisp Octagonal Low-Poly Ground Contact Shadow
    this.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(vis.capsuleRadius * 2.9, vis.capsuleRadius * 2.9),
      new THREE.MeshBasicMaterial({
        map: mats.contactShadowTex,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    );
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.018;
    this.root.add(this.contactShadow);

    const ringColor = options?.isHuman ? 0xffdf5e : clothHex;
    const ringGeo = new THREE.RingGeometry(
      vis.capsuleRadius * 0.84,
      vis.capsuleRadius * 1.02,
      16
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
    this.footRing.position.y = 0.025;
    this.root.add(this.footRing);

    const wScale = vis.bodyScaleWidth;
    const hScale = vis.bodyScaleHeight;

    this.hips.position.set(0, 0.78 * hScale, 0);
    this.root.add(this.hips);

    // 1. WAIST, FLARED PEPLUM TUNIC SKIRT, CHUNKY BELT & GOLD SQUARE BUCKLE
    this.buildLowPolyWaistAndBelt(
      classId,
      wScale,
      clothSolidMat,
      clothDarkMat,
      heraldicMat,
      brightSteelMat,
      leatherMat,
      darkLeatherMat,
      goldMat
    );

    // 2. FACETED 6-SIDED TORSO, PAULDRONS & STEPPED PIXEL CAPE
    this.torso.position.set(0, 0.08, 0);
    this.hips.add(this.torso);
    this.buildLowPolyTorso(
      classId,
      wScale,
      hScale,
      tunicMat,
      clothSolidMat,
      heraldicMat,
      brightSteelMat,
      midSteelMat,
      leatherMat,
      goldMat,
      skinMat
    );

    // 3. CHIBI-HEROIC PIXEL-ART HEAD, LAYERED VOXEL HAIR & OPEN-FACE KNIGHT HELM
    this.headGroup.position.set(0, 0.48 * hScale, 0);
    this.torso.add(this.headGroup);
    this.buildChibiPixelKnightHead(
      classId,
      vis.headScale,
      skinMat,
      faceMat,
      hairMat,
      brightSteelMat,
      midSteelMat,
      goldMat,
      plumeMat
    );

    // 4. FACETED 6-SIDED LEGS & ICONIC CHUNKY TWO-TONE CUFFED BOOTS
    this.buildCuffedLowPolyLegs(
      classId,
      wScale,
      hScale,
      skinMat,
      clothDarkMat,
      brightSteelMat,
      creamWrapMat,
      leatherMat,
      darkLeatherMat,
      soleMat,
      goldMat
    );

    // 5. FACETED 6-SIDED ARMS, CHUNKY BRACER CUFFS & SCULPTED BLOCKY HANDS
    this.buildCuffedLowPolyArms(
      classId,
      wScale,
      hScale,
      skinMat,
      clothSolidMat,
      brightSteelMat,
      leatherMat,
      darkLeatherMat,
      goldMat
    );

    // 6. CRISP LOW-POLY FACETED WEAPONS & PIXEL HEATER SHIELD
    this.buildLowPolyPixelWeapons(
      classId,
      bladeLightMat,
      bladeEdgeMat,
      brightSteelMat,
      midSteelMat,
      leatherMat,
      heraldicMat,
      clothSolidMat,
      goldMat
    );

    // Overhead Stun Stars
    this.stunRing.position.set(0, 2.22 * hScale, 0);
    this.stunRing.visible = false;
    const starGeo = new THREE.OctahedronGeometry(0.12, 0);
    const starMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.9, 1.5, 0.35),
      toneMapped: false,
    });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(starGeo, starMat);
      const a = (i * Math.PI * 2) / 3;
      star.position.set(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4);
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

  /**
   * Builds the reference-style flared 6-sided tunic skirt/shorts, chunky brown belt,
   * bright gold square buckle, armored hip tassets & scabbard.
   */
  private buildLowPolyWaistAndBelt(
    classId: KnightClassId,
    wScale: number,
    clothMat: THREE.Material,
    shortsMat: THREE.Material,
    heraldicMat: THREE.Material,
    steelMat: THREE.Material,
    leatherMat: THREE.Material,
    darkLeatherMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    // Lower breeches / armored shorts pelvis block (6-sided flat-shaded)
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18 * wScale, 0.21 * wScale, 0.16, 6),
      darkLeatherMat
    );
    pelvis.scale.set(1.12, 1, 0.84);
    pelvis.position.y = -0.06;
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // Flared 6-sided Tunic Peplum Skirt (exact silhouette cousin of the flared blue hem in reference!)
    const peplum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19 * wScale, 0.265 * wScale, 0.16, 6),
      clothMat
    );
    peplum.scale.set(1.12, 1, 0.86);
    peplum.position.y = 0.01;
    peplum.castShadow = true;
    this.hips.add(peplum);

    // Chunky 6-sided Brown Leather Belt around waist!
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21 * wScale, 0.215 * wScale, 0.095, 6),
      leatherMat
    );
    belt.scale.set(1.14, 1, 0.88);
    belt.position.y = 0.085;
    belt.castShadow = true;
    this.hips.add(belt);

    // Prominent Square Golden Belt Buckle with dark inner pin (exact match to reference!)
    const buckleOuter = new THREE.Mesh(
      new THREE.BoxGeometry(0.115, 0.115, 0.045),
      goldMat
    );
    buckleOuter.position.set(0, 0.085, 0.188 * wScale);
    this.hips.add(buckleOuter);

    const buckleHole = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.052, 0.052),
      darkLeatherMat
    );
    buckleHole.position.set(0, 0.085, 0.19 * wScale);
    this.hips.add(buckleHole);

    // Faceted Low-Poly Knight Hip Tasset Plates on heavy/armored classes
    for (const side of [-1, 1]) {
      const tasset = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.18, 0.21 * wScale),
        classId === 'dual' ? shortsMat : steelMat
      );
      tasset.position.set(side * 0.235 * wScale, -0.03, 0);
      tasset.rotation.z = -side * 0.22;
      tasset.castShadow = true;
      this.hips.add(tasset);
    }

    // Crisp Pixel-Heraldry Front Tabard Flap on Sword, Spear & Hammer
    if (classId !== 'dual') {
      const tw = 0.115 * wScale;
      const tabShape = new THREE.Shape();
      tabShape.moveTo(-tw, 0);
      tabShape.lineTo(tw, 0);
      tabShape.lineTo(tw * 0.9, -0.24);
      tabShape.lineTo(0, -0.32);
      tabShape.lineTo(-tw * 0.9, -0.24);
      tabShape.closePath();

      const tabGeo = new THREE.ExtrudeGeometry(tabShape, {
        depth: 0.022,
        bevelEnabled: false,
      });
      this.normalizePlanarUVs(tabGeo, -tw, tw, -0.32, 0);
      const tabMesh = new THREE.Mesh(tabGeo, heraldicMat);
      tabMesh.position.set(0, 0.04, 0.182 * wScale);
      tabMesh.rotation.x = 0.08;
      tabMesh.castShadow = true;
      this.hips.add(tabMesh);
    }

    // Low-poly side scabbard / belt pouch
    if (classId === 'sword') {
      const scab = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.72, 0.095),
        darkLeatherMat
      );
      scab.position.set(0.25 * wScale, -0.18, -0.04);
      scab.rotation.x = -0.52;
      scab.rotation.z = 0.16;
      this.hips.add(scab);

      const chape = new THREE.Mesh(
        new THREE.BoxGeometry(0.072, 0.12, 0.102),
        goldMat
      );
      chape.position.set(0, -0.34, 0);
      scab.add(chape);
    } else {
      const pouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.11, 0.1),
        darkLeatherMat
      );
      pouch.position.set(-0.24 * wScale, 0.05, 0.08);
      pouch.rotation.z = 0.12;
      this.hips.add(pouch);
    }
  }

  /**
   * 6-sided Flat-Shaded Tapered Chest, Neck, Faceted Pauldrons & Stepped Cape.
   */
  private buildLowPolyTorso(
    classId: KnightClassId,
    wScale: number,
    hScale: number,
    tunicMat: THREE.Material,
    clothMat: THREE.Material,
    heraldicMat: THREE.Material,
    steelMat: THREE.Material,
    midSteelMat: THREE.Material,
    leatherMat: THREE.Material,
    goldMat: THREE.Material,
    skinMat: THREE.Material
  ): void {
    // 6-Sided Tapered Faceted Chest (exact Blockbench / low-poly faceted torso look!)
    const chestGeo = new THREE.CylinderGeometry(
      0.22 * wScale,
      0.175 * wScale,
      0.41 * hScale,
      6
    );
    const chest = new THREE.Mesh(chestGeo, tunicMat);
    chest.scale.set(1.14, 1.0, 0.82);
    chest.position.y = 0.23 * hScale;
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torso.add(chest);

    // Sculpted Upper Chest Facet Bevel (gives crisp low-poly pectoral/cuirass planes!)
    const upperChest = new THREE.Mesh(
      new THREE.BoxGeometry(0.37 * wScale, 0.15 * hScale, 0.29 * wScale),
      classId === 'hammer' ? steelMat : tunicMat
    );
    upperChest.position.set(0, 0.31 * hScale, 0.025);
    upperChest.rotation.x = -0.12;
    upperChest.castShadow = true;
    this.torso.add(upperChest);

    // Exposed sunlit 6-sided neck column (just like the reference neck!)
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.082, 0.095, 0.12 * hScale, 6),
      skinMat
    );
    neck.position.y = 0.45 * hScale;
    this.torso.add(neck);

    // Armored Collar / Gorget Rim on Sword & Hammer
    if (classId === 'sword' || classId === 'hammer') {
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14 * wScale, 0.18 * wScale, 0.075, 6),
        steelMat
      );
      collar.scale.set(1.1, 1, 0.85);
      collar.position.y = 0.42 * hScale;
      this.torso.add(collar);
    }

    // Faceted Blocky Knight Shoulder Pauldrons (crisp angled low-poly plates, NOT round spheres!)
    const pScale =
      classId === 'hammer' ? 1.24 : classId === 'dual' ? 0.78 : 0.98;
    for (const side of [-1, 1]) {
      // Agile Dual class wears a single asymmetrical pauldron on left shoulder for sleek silhouette!
      if (classId === 'dual' && side === -1) continue;

      const pGroup = new THREE.Group();
      pGroup.position.set(side * 0.28 * wScale, 0.39 * hScale, 0);
      pGroup.rotation.z = -side * 0.28;

      const mainPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.19 * pScale, 0.11 * pScale, 0.24 * pScale),
        side === 1 && classId === 'dual' ? midSteelMat : steelMat
      );
      mainPlate.castShadow = true;
      pGroup.add(mainPlate);

      const lowerLame = new THREE.Mesh(
        new THREE.BoxGeometry(0.17 * pScale, 0.075 * pScale, 0.21 * pScale),
        midSteelMat
      );
      lowerLame.position.set(side * 0.03, -0.07 * pScale, 0);
      lowerLame.rotation.z = -side * 0.18;
      pGroup.add(lowerLame);

      const goldEdge = new THREE.Mesh(
        new THREE.BoxGeometry(0.198 * pScale, 0.028, 0.248 * pScale),
        goldMat
      );
      goldEdge.position.y = 0.045 * pScale;
      pGroup.add(goldEdge);

      this.torso.add(pGroup);
    }

    // Crossed twin scabbards on Dual's back
    if (classId === 'dual') {
      for (const s of [-1, 1]) {
        const backScab = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.74, 0.075),
          leatherMat
        );
        backScab.position.set(0, 0.24 * hScale, -0.17 * wScale);
        backScab.rotation.z = s * 0.56;
        this.torso.add(backScab);
      }
    }

    // 3-Segment Stepped Blocky Pixel Cape
    this.capeBones.length = 0;
    const capeW =
      classId === 'dual'
        ? 0.24
        : classId === 'hammer'
        ? 0.54 * wScale
        : 0.44 * wScale;
    const segLen = classId === 'dual' ? 0.18 : 0.23;

    let parentNode: THREE.Object3D = this.torso;
    for (let seg = 0; seg < 3; seg++) {
      const bone = new THREE.Group();
      if (seg === 0) {
        bone.position.set(0, 0.41 * hScale, -0.15 * wScale);
        bone.rotation.x = 0.18;
      } else {
        bone.position.set(0, -segLen + 0.015, 0);
      }

      const segGeo = new THREE.BoxGeometry(
        capeW * (1 + seg * 0.09),
        segLen,
        0.032
      );
      segGeo.translate(0, -segLen * 0.5, 0);
      const segMesh = new THREE.Mesh(
        segGeo,
        seg === 2 ? heraldicMat : clothMat
      );
      segMesh.castShadow = true;
      bone.add(segMesh);

      parentNode.add(bone);
      parentNode = bone;
      this.capeBones.push(bone);
    }
  }

  /**
   * Builds the Chibi-Heroic Faceted Pixel-Art Head (exact visual language of the reference!):
   * - Clean chamfered head block + 32x32 NearestFilter pixel-art anime/knight face + 3D nose wedge
   * - Layered stepped blocky voxel hair locks framing cheeks & cascading down back
   * - Class-distinct Open-Face / Raised-Visor Low-Poly Knight Helmets
   */
  private buildChibiPixelKnightHead(
    classId: KnightClassId,
    scale: number,
    skinMat: THREE.Material,
    faceMat: THREE.Material,
    hairMat: THREE.Material,
    steelMat: THREE.Material,
    midSteelMat: THREE.Material,
    goldMat: THREE.Material,
    plumeMat: THREE.Material
  ): void {
    const h = new THREE.Group();
    // Slightly larger expressive heroic-chibi head (~1.08x) like the reference!
    h.scale.setScalar(scale * 1.08);

    // 1. Sculpted Low-Poly Head Cranium + Tapered Chin Wedge
    const cranium = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.28, 0.31),
      skinMat
    );
    cranium.position.set(0, 0.22, 0);
    cranium.castShadow = true;
    h.add(cranium);

    // Angled low-poly jaw/chin prism below cheeks (gives that cute pointed anime-lowpoly chin!)
    const chin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.11, 0.09, 4),
      skinMat
    );
    chin.rotation.y = Math.PI / 4;
    chin.scale.set(1.06, 1, 0.94);
    chin.position.set(0, 0.075, 0.005);
    h.add(chin);

    // Crisp 32x32 NearestFilter Pixel-Art Face Plane on front of head (+Z)!
    const facePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.3),
      faceMat
    );
    facePlane.position.set(0, 0.195, 0.158);
    h.add(facePlane);

    // Cute 3D Low-Poly Triangular Nose Wedge sticking out slightly (exact match to reference!)
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.028, 0.055, 3),
      skinMat
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.175, 0.182);
    h.add(nose);

    // 2. LAYERED STEPPED VOXEL/BLOCKBENCH HAIR LOCKS (framing cheeks & cascading down back!)
    // Crown base hair cap
    const hairTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.375, 0.11, 0.35),
      hairMat
    );
    hairTop.position.set(0, 0.355, -0.01);
    hairTop.castShadow = true;
    h.add(hairTop);

    // Asymmetric stepped front bangs peeking above eyebrows (just like reference!)
    const bangLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.065, 0.06),
      hairMat
    );
    bangLeft.position.set(-0.08, 0.31, 0.155);
    bangLeft.rotation.z = 0.14;
    h.add(bangLeft);

    const bangRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.055, 0.06),
      hairMat
    );
    bangRight.position.set(0.09, 0.315, 0.155);
    bangRight.rotation.z = -0.12;
    h.add(bangRight);

    // Stepped Cheek-Framing Side Locks (left & right vertical boxy voxel strips!)
    const sideLockLen = classId === 'dual' ? 0.36 : 0.3;
    for (const side of [-1, 1]) {
      const outerLock = new THREE.Mesh(
        new THREE.BoxGeometry(0.068, sideLockLen, 0.12),
        hairMat
      );
      outerLock.position.set(side * 0.188, 0.21, 0.07);
      outerLock.castShadow = true;
      h.add(outerLock);

      const steppedTip = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.12, 0.08),
        hairMat
      );
      steppedTip.position.set(side * 0.178, 0.05, 0.115);
      h.add(steppedTip);
    }

    // Cascading Stepped Blocky Voxel Back-Hair (fanned rectangular strips like reference!)
    this.hairBackGroup.position.set(0, 0.3, -0.14);
    h.add(this.hairBackGroup);

    const lockCount = classId === 'dual' ? 5 : 4;
    const backLen = classId === 'dual' ? 0.44 : 0.32;
    for (let i = 0; i < lockCount; i++) {
      const t = lockCount > 1 ? i / (lockCount - 1) - 0.5 : 0;
      const stripGroup = new THREE.Group();
      stripGroup.position.set(t * 0.28, 0, -Math.abs(t) * 0.02);
      stripGroup.rotation.x = 0.28 + Math.abs(t) * 0.08;
      stripGroup.rotation.z = -t * 0.22;

      const upperStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.088, backLen * 0.65, 0.075),
        hairMat
      );
      upperStrip.position.y = -backLen * 0.3;
      upperStrip.castShadow = true;
      stripGroup.add(upperStrip);

      // Stepped voxel offset lower lock!
      const lowerStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.072, backLen * 0.55, 0.068),
        hairMat
      );
      lowerStrip.position.set(0, -backLen * 0.72, -0.028);
      lowerStrip.rotation.x = 0.16;
      lowerStrip.castShadow = true;
      stripGroup.add(lowerStrip);

      this.hairBackGroup.add(stripGroup);
    }

    // 3. CLASS-DISTINCT OPEN-FACED / RAISED-VISOR LOW-POLY KNIGHT HELMETS!
    if (classId === 'sword') {
      // Paladin Raised-Visor Silver Crown-Helm + Gold Cross + Stepped Voxel Plume
      const helmDome = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.245, 0.17, 6),
        steelMat
      );
      helmDome.scale.set(1.04, 1, 1.02);
      helmDome.position.set(0, 0.41, -0.01);
      helmDome.castShadow = true;
      h.add(helmDome);

      // Raised Hinged Visor Crest on forehead
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.39, 0.11, 0.14),
        steelMat
      );
      visor.position.set(0, 0.38, 0.135);
      visor.rotation.x = -0.26;
      visor.castShadow = true;
      h.add(visor);

      const visorCrossV = new THREE.Mesh(
        new THREE.BoxGeometry(0.048, 0.12, 0.03),
        goldMat
      );
      visorCrossV.position.set(0, 0.385, 0.205);
      visorCrossV.rotation.x = -0.26;
      h.add(visorCrossV);

      const visorCrossH = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.038, 0.03),
        goldMat
      );
      visorCrossH.position.set(0, 0.385, 0.205);
      visorCrossH.rotation.x = -0.26;
      h.add(visorCrossH);

      // Stepped Blocky Voxel Plume Crest!
      for (let p = 0; p < 4; p++) {
        const pBlock = new THREE.Mesh(
          new THREE.BoxGeometry(0.075, 0.12, 0.12),
          plumeMat
        );
        pBlock.position.set(0, 0.53 - p * 0.055, 0.04 - p * 0.095);
        pBlock.rotation.x = -0.25 - p * 0.2;
        pBlock.castShadow = true;
        h.add(pBlock);
      }
    } else if (classId === 'dual') {
      // Sleek Duelist Winged Brow-Circlet / Half-Helm (leaves full stepped hair silhouette gleaming!)
      const browBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.395, 0.072, 0.37),
        midSteelMat
      );
      browBand.position.set(0, 0.355, 0.005);
      h.add(browBand);

      const centerGemMount = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.058, 0),
        goldMat
      );
      centerGemMount.position.set(0, 0.365, 0.195);
      h.add(centerGemMount);

      // Swept low-poly side wing fins
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.038, 0.16, 0.14),
          goldMat
        );
        wing.position.set(side * 0.215, 0.41, -0.02);
        wing.rotation.x = -0.45;
        wing.rotation.z = -side * 0.18;
        h.add(wing);
      }
    } else if (classId === 'spear') {
      // Faceted Vanguard Kettle-Sallet Brim Helm + Winged Crest
      const dome = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.24, 0.15, 6),
        steelMat
      );
      dome.position.set(0, 0.43, 0);
      dome.castShadow = true;
      h.add(dome);

      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.34, 0.065, 6),
        steelMat
      );
      brim.scale.set(1.05, 1, 1.08);
      brim.position.set(0, 0.365, 0.01);
      brim.rotation.x = -0.1;
      brim.castShadow = true;
      h.add(brim);

      const goldCrest = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.11, 0.28),
        goldMat
      );
      goldCrest.position.set(0, 0.51, 0);
      h.add(goldCrest);
    } else {
      // Class D: Heavy Horned Iron Siege Half-Helm with Stepped Voxel Bull-Horns!
      const ironCrown = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.255, 0.18, 6),
        midSteelMat
      );
      ironCrown.position.set(0, 0.41, 0);
      ironCrown.castShadow = true;
      h.add(ironCrown);

      const noseGuardBand = new THREE.Mesh(
        new THREE.BoxGeometry(0.41, 0.085, 0.12),
        goldMat
      );
      noseGuardBand.position.set(0, 0.35, 0.145);
      h.add(noseGuardBand);

      // Armored Iron Cheek-Plates framing jaw
      for (const side of [-1, 1]) {
        const cheekGuard = new THREE.Mesh(
          new THREE.BoxGeometry(0.055, 0.18, 0.13),
          midSteelMat
        );
        cheekGuard.position.set(side * 0.205, 0.21, 0.09);
        h.add(cheekGuard);

        // 3-Segment Stepped Blocky Voxel Bull-Horns!
        const h1 = new THREE.Mesh(
          new THREE.BoxGeometry(0.11, 0.095, 0.095),
          steelMat
        );
        h1.position.set(side * 0.26, 0.41, 0.02);
        h1.rotation.z = -side * 0.2;
        h.add(h1);

        const h2 = new THREE.Mesh(
          new THREE.BoxGeometry(0.085, 0.14, 0.085),
          steelMat
        );
        h2.position.set(side * 0.34, 0.49, 0.06);
        h2.rotation.z = side * 0.22;
        h2.rotation.x = 0.2;
        h.add(h2);

        const h3 = new THREE.Mesh(
          new THREE.ConeGeometry(0.052, 0.14, 4),
          goldMat
        );
        h3.position.set(side * 0.31, 0.61, 0.1);
        h3.rotation.z = side * 0.38;
        h3.rotation.x = 0.28;
        h.add(h3);
      }
    }

    this.headGroup.add(h);
  }

  /**
   * Builds 6-Sided Flat-Shaded Legs + Iconic Oversized Two-Tone Cuffed Boots
   * (knee cuff ring + crisp white/silver shin wrap + ankle cuff ring + two-tone beveled toe boot!).
   */
  private buildCuffedLowPolyLegs(
    classId: KnightClassId,
    wScale: number,
    hScale: number,
    skinMat: THREE.Material,
    shortsMat: THREE.Material,
    steelMat: THREE.Material,
    creamWrapMat: THREE.Material,
    leatherMat: THREE.Material,
    darkLeatherMat: THREE.Material,
    soleMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    const hipOffset = 0.145 * wScale;
    this.legR.position.set(-hipOffset, -0.06, 0);
    this.legL.position.set(hipOffset, -0.06, 0);
    this.hips.add(this.legR);
    this.hips.add(this.legL);

    const upperLegMat =
      classId === 'hammer' || classId === 'sword' ? shortsMat : skinMat;
    const bootUpperMat = classId === 'hammer' ? steelMat : leatherMat;
    const bootCuffMat = classId === 'hammer' ? goldMat : darkLeatherMat;

    const pairs = [
      [this.legR, this.kneeR, this.footR],
      [this.legL, this.kneeL, this.footL],
    ] as const;

    for (const [thighGroup, kneeGroup, footGroup] of pairs) {
      // Short cuffed breeches / cuisse hem at top of thigh (like reference shorts!)
      const shortCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.112 * wScale, 0.118 * wScale, 0.11, 6),
        darkLeatherMat
      );
      shortCuff.position.y = -0.05;
      shortCuff.castShadow = true;
      thighGroup.add(shortCuff);

      // 6-Sided Flat-Shaded Tapered Thigh
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.098 * wScale,
          0.078 * wScale,
          0.26 * hScale,
          6
        ),
        upperLegMat
      );
      thigh.position.y = -0.17 * hScale;
      thigh.castShadow = true;
      thighGroup.add(thigh);

      // Knee Hinge at y = -0.30 * hScale
      kneeGroup.position.set(0, -0.3 * hScale, 0);
      thighGroup.add(kneeGroup);

      // Chunky 6-Sided Below-Knee Folded Cuff Ring (exact match to reference knee-band!)
      const kneeCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.096 * wScale, 0.088 * wScale, 0.068, 6),
        bootCuffMat
      );
      kneeCuff.position.y = -0.04;
      kneeCuff.castShadow = true;
      kneeGroup.add(kneeCuff);

      // Crisp White/Silver 6-Sided Shin Greave / Stocking Wrap!
      const shinWrap = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.078 * wScale,
          0.072 * wScale,
          0.22 * hScale,
          6
        ),
        creamWrapMat
      );
      shinWrap.position.y = -0.15 * hScale;
      shinWrap.castShadow = true;
      kneeGroup.add(shinWrap);

      // Foot / Boot Group at y = -0.27 * hScale
      footGroup.position.set(0, -0.27 * hScale, 0);
      kneeGroup.add(footGroup);

      // Chunky Flared Ankle Boot Cuff Ring (exact match to reference!)
      const ankleCuff = new THREE.Mesh(
        new THREE.BoxGeometry(0.205 * wScale, 0.095, 0.215),
        leatherMat
      );
      ankleCuff.position.set(0, -0.02, 0.01);
      ankleCuff.castShadow = true;
      footGroup.add(ankleCuff);

      // Chunky Faceted Boot Upper Body
      const bootBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.195 * wScale, 0.115, 0.24),
        bootUpperMat
      );
      bootBody.position.set(0, -0.11, 0.03);
      bootBody.castShadow = true;
      footGroup.add(bootBody);

      // Two-Tone Beveled Bright Cream/Silver Toe-Cap projecting forward (+Z)!
      const toeCap = new THREE.Mesh(
        new THREE.BoxGeometry(0.19 * wScale, 0.092, 0.13),
        creamWrapMat
      );
      toeCap.position.set(0, -0.122, 0.155);
      toeCap.rotation.x = 0.12;
      toeCap.castShadow = true;
      footGroup.add(toeCap);

      // Thick Flat Light-Stone Boot Sole along ground!
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.205 * wScale, 0.042, 0.34),
        soleMat
      );
      sole.position.set(0, -0.175, 0.065);
      sole.castShadow = true;
      footGroup.add(sole);
    }
  }

  /**
   * Builds 6-Sided Flat-Shaded Arms, Chunky Flared Bracer Cuffs & Oversized Sculpted Blocky Hands.
   */
  private buildCuffedLowPolyArms(
    classId: KnightClassId,
    wScale: number,
    hScale: number,
    skinMat: THREE.Material,
    sleeveMat: THREE.Material,
    steelMat: THREE.Material,
    leatherMat: THREE.Material,
    darkLeatherMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    const shoulderX = 0.265 * wScale;
    const shoulderY = 0.38 * hScale;
    this.armR.position.set(-shoulderX, shoulderY, 0);
    this.armL.position.set(shoulderX, shoulderY, 0);
    this.torso.add(this.armR);
    this.torso.add(this.armL);

    // Agile Dual & Spear show warm sunlit low-poly arms with chunky bracers (just like reference!);
    // Heavy Sword & Hammer wear armored/sleeved arms with chunky gauntlet cuffs!
    const upperArmMat =
      classId === 'dual' || classId === 'spear' ? skinMat : sleeveMat;
    const cuffMat = classId === 'hammer' ? steelMat : leatherMat;

    const pairs = [
      [this.armR, this.elbowR, this.handR, -1],
      [this.armL, this.elbowL, this.handL, 1],
    ] as const;

    for (const [upperGroup, elbowGroup, handGroup, side] of pairs) {
      // 6-Sided Tapered Upper Arm
      const upperArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.068, 0.058, 0.22, 6),
        upperArmMat
      );
      upperArm.position.y = -0.1;
      upperArm.castShadow = true;
      upperGroup.add(upperArm);

      // Elbow Hinge at y = -0.20
      elbowGroup.position.set(0, -0.2, 0);
      upperGroup.add(elbowGroup);

      // 6-Sided Forearm
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.052, 0.19, 6),
        skinMat
      );
      forearm.position.y = -0.09;
      forearm.castShadow = true;
      elbowGroup.add(forearm);

      // CHUNKY FLARED 6-SIDED BRACER / GAUNTLET CUFF (exact match to reference wrist cuffs!)
      const bracerCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.095, 0.082, 0.11, 6),
        cuffMat
      );
      bracerCuff.position.y = -0.115;
      bracerCuff.castShadow = true;
      elbowGroup.add(bracerCuff);

      const wristBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.072, 0.068, 0.045, 6),
        classId === 'hammer' ? goldMat : darkLeatherMat
      );
      wristBand.position.y = -0.175;
      elbowGroup.add(wristBand);

      // Sculpted Blocky Low-Poly Hand at y = -0.20
      handGroup.position.set(0, -0.2, 0.01);
      elbowGroup.add(handGroup);

      const handMat = classId === 'hammer' ? steelMat : skinMat;
      const palm = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.115, 0.115),
        handMat
      );
      palm.position.y = -0.045;
      palm.castShadow = true;
      handGroup.add(palm);

      // Distinct Angled Low-Poly Thumb Block!
      const thumb = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.085, 0.05),
        handMat
      );
      thumb.position.set(-side * 0.058, -0.045, 0.048);
      thumb.rotation.z = side * 0.32;
      thumb.rotation.x = -0.25;
      handGroup.add(thumb);

      // Curled Finger Knuckle Wedge
      const fingers = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.068, 0.095),
        handMat
      );
      fingers.position.set(0, -0.105, 0.02);
      fingers.rotation.x = -0.22;
      handGroup.add(fingers);
    }
  }

  /**
   * Builds Crisp Blocky-Faceted Low-Poly Pixel-Art Weapons & Heater Shield.
   */
  private buildLowPolyPixelWeapons(
    classId: KnightClassId,
    bladeLightMat: THREE.Material,
    bladeEdgeMat: THREE.Material,
    steelMat: THREE.Material,
    midSteelMat: THREE.Material,
    leatherMat: THREE.Material,
    heraldicMat: THREE.Material,
    clothMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    if (classId === 'sword') {
      const sword = this.makeLowPolyBroadsword(
        bladeLightMat,
        bladeEdgeMat,
        leatherMat,
        goldMat,
        1.48,
        0.16
      );
      sword.position.set(0, -0.05, 0.06);
      sword.rotation.x = Math.PI * 0.44;
      this.handR.add(sword);

      this.weaponBaseAnchor.position.set(0, 0.22, 0);
      this.weaponTipAnchor.position.set(0, 1.76, 0);
      sword.add(this.weaponBaseAnchor);
      sword.add(this.weaponTipAnchor);
    } else if (classId === 'dual') {
      const saberR = this.makeLowPolySaber(
        bladeLightMat,
        leatherMat,
        goldMat,
        1.24
      );
      saberR.position.set(0, -0.05, 0.06);
      saberR.rotation.x = Math.PI * 0.45;
      this.handR.add(saberR);

      this.weaponBaseAnchor.position.set(0, 0.2, 0);
      this.weaponTipAnchor.position.set(0, 1.5, 0.12);
      saberR.add(this.weaponBaseAnchor);
      saberR.add(this.weaponTipAnchor);

      const saberL = this.makeLowPolySaber(
        bladeLightMat,
        leatherMat,
        steelMat,
        1.24
      );
      saberL.position.set(0, -0.05, 0.06);
      saberL.rotation.x = Math.PI * 0.45;
      this.handL.add(saberL);
    } else if (classId === 'spear') {
      const spear = new THREE.Group();

      // 6-sided ash shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.046, 2.52, 6),
        leatherMat
      );
      shaft.position.y = 0.84;
      shaft.castShadow = true;
      spear.add(shaft);

      for (const gy of [0.05, 0.56, 1.15]) {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.075, 6),
          goldMat
        );
        band.position.y = gy;
        spear.add(band);
      }

      const butt = new THREE.Mesh(
        new THREE.ConeGeometry(0.058, 0.22, 4),
        steelMat
      );
      butt.rotation.x = Math.PI;
      butt.position.y = -0.48;
      spear.add(butt);

      // Crisp Low-Poly Diamond-Faceted Winged Spearhead
      const headMain = new THREE.Mesh(
        new THREE.ConeGeometry(0.115, 0.68, 4),
        bladeLightMat
      );
      headMain.scale.set(1.0, 1.0, 0.36);
      headMain.position.y = 2.4;
      headMain.castShadow = true;
      spear.add(headMain);

      const crossWings = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.075, 0.055),
        goldMat
      );
      crossWings.position.y = 2.05;
      spear.add(crossWings);

      // Blocky pixel pennant banner below spearhead
      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.16, 0.025),
        clothMat
      );
      flag.position.set(0.18, 1.9, 0);
      flag.rotation.z = -0.18;
      spear.add(flag);

      spear.rotation.x = Math.PI * 0.48;
      spear.position.set(0, -0.03, 0.06);
      this.handR.add(spear);

      this.weaponBaseAnchor.position.set(0, 1.8, 0);
      this.weaponTipAnchor.position.set(0, 2.75, 0);
      spear.add(this.weaponBaseAnchor);
      spear.add(this.weaponTipAnchor);
    } else {
      // Class D: Chunky Faceted Low-Poly Warhammer + Crisp Pixel-Heraldry Heater Shield!
      const hammer = new THREE.Group();
      const haft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.052, 1.38, 6),
        leatherMat
      );
      haft.position.y = 0.54;
      haft.castShadow = true;
      hammer.add(haft);

      const collar = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.16, 0.12),
        goldMat
      );
      collar.position.y = 1.14;
      hammer.add(collar);

      const headBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.28, 0.48),
        midSteelMat
      );
      headBlock.position.set(0, 1.24, 0.04);
      headBlock.castShadow = true;
      hammer.add(headBlock);

      // Beveled striking face + back armor-spike
      const strikeFace = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.32, 0.1),
        bladeLightMat
      );
      strikeFace.position.set(0, 1.24, 0.31);
      hammer.add(strikeFace);

      const backBeak = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.32, 4),
        bladeLightMat
      );
      backBeak.rotation.x = -Math.PI / 2;
      backBeak.position.set(0, 1.24, -0.34);
      hammer.add(backBeak);

      const topSpike = new THREE.Mesh(
        new THREE.ConeGeometry(0.065, 0.24, 4),
        goldMat
      );
      topSpike.position.set(0, 1.5, 0.04);
      hammer.add(topSpike);

      hammer.rotation.x = Math.PI * 0.38;
      hammer.position.set(0, -0.04, 0.06);
      this.handR.add(hammer);

      this.weaponBaseAnchor.position.set(0, 0.94, 0);
      this.weaponTipAnchor.position.set(0, 1.62, 0.25);
      hammer.add(this.weaponBaseAnchor);
      hammer.add(this.weaponTipAnchor);

      // Crisp Low-Poly Pointed Heater Shield with 32x32 NearestFilter Pixel Heraldry!
      const shield = new THREE.Group();
      const shShape = new THREE.Shape();
      shShape.moveTo(-0.38, 0.5);
      shShape.lineTo(0.38, 0.5);
      shShape.lineTo(0.38, 0.04);
      shShape.lineTo(0, -0.58);
      shShape.lineTo(-0.38, 0.04);
      shShape.closePath();

      const rimGeo = new THREE.ExtrudeGeometry(shShape, {
        depth: 0.065,
        bevelEnabled: true,
        bevelSize: 0.022,
        bevelThickness: 0.02,
        bevelSegments: 1,
      });
      const shieldRim = new THREE.Mesh(rimGeo, steelMat);
      shieldRim.castShadow = true;
      shield.add(shieldRim);

      const innerShape = new THREE.Shape();
      innerShape.moveTo(-0.31, 0.43);
      innerShape.lineTo(0.31, 0.43);
      innerShape.lineTo(0.31, 0.05);
      innerShape.lineTo(0, -0.48);
      innerShape.lineTo(-0.31, 0.05);
      innerShape.closePath();

      const innerGeo = new THREE.ShapeGeometry(innerShape, 1);
      const uv = innerGeo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, (uv.getX(i) + 0.32) / 0.64, (uv.getY(i) + 0.5) / 0.95);
      }
      const shieldFace = new THREE.Mesh(innerGeo, heraldicMat);
      shieldFace.position.z = 0.088;
      shield.add(shieldFace);

      // Chunky Pixel-Gold Shield Boss & Square Rivets
      const boss = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        goldMat
      );
      boss.scale.set(1, 1, 0.5);
      boss.position.set(0, 0.06, 0.1);
      shield.add(boss);

      const rivetGeo = new THREE.BoxGeometry(0.042, 0.042, 0.03);
      for (const [rx, ry] of [
        [-0.32, 0.45],
        [0, 0.45],
        [0.32, 0.45],
        [-0.33, 0.06],
        [0.33, 0.06],
        [0, -0.5],
      ] as const) {
        const riv = new THREE.Mesh(rivetGeo, goldMat);
        riv.position.set(rx, ry, 0.09);
        shield.add(riv);
      }

      shield.position.set(0.18, 0.02, 0.2);
      shield.rotation.y = 0.36;
      this.handL.add(shield);
    }
  }

  private makeLowPolyBroadsword(
    bladeLightMat: THREE.Material,
    fullerMat: THREE.Material,
    gripMat: THREE.Material,
    goldMat: THREE.Material,
    bladeLen: number,
    bladeWidth: number
  ): THREE.Group {
    const g = new THREE.Group();

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.28, 0.068),
      gripMat
    );
    g.add(grip);

    const pommel = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.078, 0),
      goldMat
    );
    pommel.position.y = -0.18;
    g.add(pommel);

    // Chunky Blocky Pixel-Style Crossguard
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.085, 0.1),
      goldMat
    );
    guard.position.y = 0.16;
    guard.castShadow = true;
    g.add(guard);

    for (const side of [-1, 1]) {
      const tipCap = new THREE.Mesh(
        new THREE.BoxGeometry(0.075, 0.115, 0.11),
        goldMat
      );
      tipCap.position.set(side * 0.24, 0.165, 0);
      g.add(tipCap);
    }

    // Crisp Diamond-Cross-Section Low-Poly Blade + Tip Pyramid!
    const mainLen = bladeLen * 0.8;
    const bladeBody = new THREE.Mesh(
      new THREE.CylinderGeometry(
        bladeWidth * 0.48,
        bladeWidth * 0.56,
        mainLen,
        4
      ),
      bladeLightMat
    );
    bladeBody.rotation.y = Math.PI / 4;
    bladeBody.scale.set(1.0, 1.0, 0.28);
    bladeBody.position.y = 0.2 + mainLen * 0.5;
    bladeBody.castShadow = true;
    g.add(bladeBody);

    const tipCone = new THREE.Mesh(
      new THREE.ConeGeometry(bladeWidth * 0.48, bladeLen * 0.24, 4),
      bladeLightMat
    );
    tipCone.rotation.y = Math.PI / 4;
    tipCone.scale.set(1.0, 1.0, 0.28);
    tipCone.position.y = 0.2 + mainLen + bladeLen * 0.12;
    tipCone.castShadow = true;
    g.add(tipCone);

    const fuller = new THREE.Mesh(
      new THREE.BoxGeometry(bladeWidth * 0.24, mainLen * 0.72, 0.052),
      fullerMat
    );
    fuller.position.y = 0.22 + mainLen * 0.4;
    g.add(fuller);

    return g;
  }

  private makeLowPolySaber(
    bladeMat: THREE.Material,
    gripMat: THREE.Material,
    guardMat: THREE.Material,
    bladeLen: number
  ): THREE.Group {
    const g = new THREE.Group();

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.062, 0.26, 0.062),
      gripMat
    );
    g.add(grip);

    const guardBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.065, 0.34),
      guardMat
    );
    guardBar.position.set(0, 0.14, 0.03);
    g.add(guardBar);

    const knuckleGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.24, 0.055),
      guardMat
    );
    knuckleGuard.position.set(0, 0.02, 0.13);
    g.add(knuckleGuard);

    // Stepped 2-Segment Angled Low-Poly Saber Blade!
    const sShape = new THREE.Shape();
    sShape.moveTo(-0.045, 0);
    sShape.lineTo(-0.03, bladeLen * 0.62);
    sShape.lineTo(0.11, bladeLen);
    sShape.lineTo(0.085, bladeLen * 0.55);
    sShape.lineTo(0.055, 0);
    sShape.closePath();

    const blade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(sShape, {
        depth: 0.022,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
        bevelSegments: 1,
      }),
      bladeMat
    );
    blade.rotation.y = Math.PI / 2;
    blade.position.set(-0.011, 0.16, 0);
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
        m.color.setHex(0xfff4d4);
        m.emissive.setHex(0x884411);
      } else {
        m.color.setHex(this.baseColors[i]);
        m.emissive.setHex(0x000000);
      }
    }

    const hScale = this.config.visual.bodyScaleHeight;
    this.hips.position.set(0, 0.78 * hScale, 0);
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.hairBackGroup.rotation.set(0, 0, 0);
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

    // Biomechanical 2-Bone Run Cycle + Flowing Stepped Hair & Cape!
    if (fighter.state === 'Moving') {
      const freq = fighter.isSprinting ? 13.5 : 9.5;
      const amp = fighter.isSprinting ? 0.65 : 0.45;
      const phase = t * freq;
      const sinP = Math.sin(phase);
      const cosP = Math.cos(phase);

      this.legR.rotation.x = sinP * amp;
      this.kneeR.rotation.x = Math.max(0.08, -cosP * amp * 1.12 + 0.26);
      this.footR.rotation.x = -this.kneeR.rotation.x * 0.42;

      this.legL.rotation.x = -sinP * amp;
      this.kneeL.rotation.x = Math.max(0.08, cosP * amp * 1.12 + 0.26);
      this.footL.rotation.x = -this.kneeL.rotation.x * 0.42;

      this.hips.position.y += Math.abs(cosP) * 0.075 - 0.03;
      this.torso.rotation.x = fighter.isSprinting ? 0.22 : 0.1;
      this.torso.rotation.y = sinP * 0.09;
      this.headGroup.rotation.x = fighter.isSprinting ? -0.12 : -0.05;
      this.hairBackGroup.rotation.x =
        0.26 + Math.sin(phase - 0.6) * 0.14;

      this.armR.rotation.x += -sinP * amp * 0.32;
      this.armL.rotation.x += sinP * amp * 0.32;

      const baseCapeLift = fighter.isSprinting ? 0.46 : 0.26;
      this.capeBones.forEach((b, idx) => {
        b.rotation.x =
          (idx === 0 ? baseCapeLift : 0.14) +
          Math.sin(phase - idx * 0.85) * (0.1 + idx * 0.04);
      });
    } else {
      this.hairBackGroup.rotation.x = Math.sin(t * 2.2) * 0.04;
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
      this.elbowR.rotation.x = -0.72 * c;
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
      this.torso.rotation.x = -0.36;
      this.headGroup.rotation.x = -0.26;
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
      0.78 * hScale + Math.sin(elapsed * 2.4) * 0.022,
      0
    );
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, Math.sin(elapsed * 1.2) * 0.07, 0);
    this.headGroup.rotation.set(0, Math.sin(elapsed * 1.2) * 0.05, 0);
    this.hairBackGroup.rotation.set(Math.sin(elapsed * 2.1) * 0.05, 0, 0);
    this.armR.rotation.set(0, 0, 0);
    this.elbowR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.elbowL.rotation.set(0, 0, 0);

    // Heroic reference-like A-stance on pedestal!
    this.legR.rotation.set(0, 0, -0.06);
    this.kneeR.rotation.set(0.06, 0, 0);
    this.footR.rotation.set(0, 0, 0.06);
    this.legL.rotation.set(-0.06, 0, 0.06);
    this.kneeL.rotation.set(0.11, 0, 0);
    this.footL.rotation.set(0, 0, -0.06);

    this.applyBaseClassStance(this.config.id, elapsed);
    this.capeBones.forEach((b, idx) => {
      b.rotation.x =
        (idx === 0 ? 0.16 : 0.05) + Math.sin(elapsed * 2.2 - idx * 0.7) * 0.04;
    });
  }

  private applyBaseClassStance(classId: KnightClassId, t: number): void {
    const breathe = Math.sin(t * 2.8) * 0.038;
    if (classId === 'sword') {
      this.armR.rotation.x = -0.2 + breathe;
      this.armR.rotation.z = -0.22;
      this.elbowR.rotation.x = -0.38;
      this.armL.rotation.x = -0.12 - breathe;
      this.armL.rotation.z = 0.18;
      this.elbowL.rotation.x = -0.28;
    } else if (classId === 'dual') {
      this.torso.rotation.x = 0.1;
      this.armR.rotation.x = -0.24 + breathe;
      this.armR.rotation.z = -0.26;
      this.elbowR.rotation.x = -0.44;
      this.armL.rotation.x = -0.24 - breathe;
      this.armL.rotation.z = 0.26;
      this.elbowL.rotation.x = -0.44;
    } else if (classId === 'spear') {
      this.armR.rotation.x = -0.14 + breathe;
      this.armR.rotation.z = -0.16;
      this.elbowR.rotation.x = -0.32;
      this.armL.rotation.x = -0.38;
      this.armL.rotation.y = -0.38;
      this.elbowL.rotation.x = -0.46;
    } else {
      this.armR.rotation.x = -0.16 + breathe;
      this.armR.rotation.z = -0.24;
      this.elbowR.rotation.x = -0.36;
      this.armL.rotation.x = -0.32;
      this.armL.rotation.y = -0.26;
      this.elbowL.rotation.x = -0.42;
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

    if (phase === 'Active') {
      this.legR.rotation.x = -0.4;
      this.kneeR.rotation.x = 0.56;
      this.legL.rotation.x = 0.34;
      this.kneeL.rotation.x = 0.22;
      this.hips.position.y -= 0.065;
      this.hairBackGroup.rotation.x = 0.35;
    }

    if (style === 'spear_poke' || style === 'spear_impale') {
      if (phase === 'Windup') {
        this.torso.rotation.y = lerp(0, -0.48, p);
        this.armR.rotation.x = lerp(-0.15, 0.52, p);
        this.elbowR.rotation.x = lerp(-0.32, -0.78, p);
      } else if (phase === 'Active') {
        this.torso.rotation.y = lerp(-0.48, 0.42, p);
        this.torso.rotation.x = 0.24;
        this.armR.rotation.x = lerp(0.52, -1.02, p);
        this.elbowR.rotation.x = lerp(-0.78, -0.08, p);
      } else {
        this.torso.rotation.y = lerp(0.42, 0, p);
        this.torso.rotation.x = lerp(0.24, 0, p);
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
        this.elbowR.rotation.x = lerp(-0.12, -0.36, p);
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
        this.armL.rotation.x = lerp(-0.68, -0.24, p);
        this.elbowL.rotation.x = -0.44;
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
        this.torso.rotation.x = lerp(0.34, 0.1, p);
        this.armR.rotation.z = lerp(0.58, -0.26, p);
        this.armL.rotation.z = lerp(-0.58, 0.26, p);
        this.elbowR.rotation.x = -0.44;
        this.elbowL.rotation.x = -0.44;
      }
      return;
    }

    const dir = style === 'slash_left' ? -1 : 1;
    if (phase === 'Windup') {
      this.torso.rotation.y = lerp(0, -0.65 * dir, p);
      this.armR.rotation.x = lerp(-0.2, -1.05, p);
      this.elbowR.rotation.x = lerp(-0.38, -0.78, p);
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
      this.armR.rotation.x = lerp(-0.78, -0.2, p);
      this.elbowR.rotation.x = lerp(-0.15, -0.38, p);
      this.armR.rotation.y = lerp(1.08 * dir, 0, p);
    }
  }

  private applyBlockingAnimation(
    classId: KnightClassId,
    elapsed: number
  ): void {
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
