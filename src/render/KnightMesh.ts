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
 * Stylized low-poly 3D Knight model with slightly exaggerated chunky proportions
 * (helmets, gauntlets, boots, oversized readable weapons) and full procedural
 * combat animation rig for all 4 classes and all combat states/phases.
 */
export class KnightVisualRig {
  public readonly root = new THREE.Group();
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
  private readonly slashArcMesh: THREE.Mesh;
  private readonly footRing: THREE.Mesh;

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

    // Create matte/semi-rough class materials
    const steelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.primarySteel,
        map: mats.steelTex,
        roughness: 0.72,
        metalness: 0.28,
        flatShading: true,
      })
    );
    const darkArmorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.secondaryArmor,
        roughness: 0.84,
        metalness: 0.18,
        flatShading: true,
      })
    );
    const clothMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: clothHex,
        roughness: 0.92,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide,
      })
    );
    const plumeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: vis.plumeColor,
        roughness: 0.88,
        metalness: 0.05,
        flatShading: true,
      })
    );
    const woodGripMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x6e4223,
        roughness: 0.9,
        metalness: 0.02,
        flatShading: true,
      })
    );
    const brightBladeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdbe5f0,
        roughness: 0.55,
        metalness: 0.38,
        flatShading: true,
      })
    );
    const visorSlitMat = new THREE.MeshBasicMaterial({ color: 0x11151c });

    // Subtle ground ring under fighter for crisp spatial grounding
    const ringColor = options?.isHuman ? 0xffe066 : clothHex;
    const ringGeo = new THREE.RingGeometry(
      vis.capsuleRadius * 0.78,
      vis.capsuleRadius * 1.02,
      16
    );
    ringGeo.rotateX(-Math.PI / 2);
    this.footRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: options?.isPreview ? 0.0 : options?.isHuman ? 0.65 : 0.36,
        depthWrite: false,
      })
    );
    this.footRing.position.y = 0.025;
    this.root.add(this.footRing);

    // Hierarchy: root -> hips -> torso -> head / arms, hips -> legs
    this.hips.position.set(0, 0.72 * vis.bodyScaleHeight, 0);
    this.root.add(this.hips);

    const wScale = vis.bodyScaleWidth;
    const hScale = vis.bodyScaleHeight;

    // Pelvis / belt
    const pelvis = new THREE.Mesh(
      new THREE.BoxGeometry(0.52 * wScale, 0.24, 0.36 * wScale),
      darkArmorMat
    );
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // Tabard front flap
    const tabard = new THREE.Mesh(
      new THREE.BoxGeometry(0.32 * wScale, 0.36, 0.06),
      clothMat
    );
    tabard.position.set(0, -0.14, 0.19 * wScale);
    this.hips.add(tabard);

    // Torso
    this.torso.position.set(0, 0.12, 0);
    this.hips.add(this.torso);

    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.66 * wScale, 0.62 * hScale, 0.44 * wScale),
      classId === 'dual' ? darkArmorMat : steelMat
    );
    chest.position.y = 0.31 * hScale;
    chest.castShadow = true;
    chest.receiveShadow = true;
    this.torso.add(chest);

    // Heraldic chest stripe / surcoat
    const surcoat = new THREE.Mesh(
      new THREE.BoxGeometry(0.42 * wScale, 0.56 * hScale, 0.46 * wScale),
      clothMat
    );
    surcoat.position.y = 0.3 * hScale;
    this.torso.add(surcoat);

    // Broad pauldrons (especially big on Sword & Hammer)
    if (classId !== 'dual') {
      const pauldronSize = classId === 'hammer' ? 0.34 : 0.27;
      const pGeo = new THREE.BoxGeometry(pauldronSize, 0.24, 0.38 * wScale);
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(pGeo, steelMat);
        p.position.set(side * (0.4 * wScale), 0.54 * hScale, 0);
        p.rotation.z = -side * 0.22;
        p.castShadow = true;
        this.torso.add(p);
      }
    }

    // Class A short cape or Class B scarf tail
    if (classId === 'sword' || classId === 'dual') {
      const capeW = classId === 'sword' ? 0.58 * wScale : 0.28;
      const capeH = classId === 'sword' ? 0.68 : 0.54;
      const capeGeo = new THREE.BoxGeometry(capeW, capeH, 0.05);
      capeGeo.translate(0, -capeH * 0.5, 0);
      const cape = new THREE.Mesh(capeGeo, clothMat);
      cape.position.set(0, 0.56 * hScale, -0.23 * wScale);
      cape.rotation.x = 0.18;
      cape.castShadow = true;
      this.torso.add(cape);
      this.capeMesh = cape;
    }

    // Head & Expressive Class Helmet
    this.headGroup.position.set(0, 0.66 * hScale, 0);
    this.torso.add(this.headGroup);
    this.buildHelmet(
      classId,
      vis.headScale,
      steelMat,
      darkArmorMat,
      plumeMat,
      visorSlitMat
    );

    // Chunky Legs & Boots
    const hipOffset = 0.18 * wScale;
    this.legR.position.set(-hipOffset, -0.06, 0);
    this.legL.position.set(hipOffset, -0.06, 0);
    this.hips.add(this.legR);
    this.hips.add(this.legL);

    for (const leg of [this.legR, this.legL]) {
      const thigh = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 * wScale, 0.38 * hScale, 0.24),
        darkArmorMat
      );
      thigh.position.y = -0.2 * hScale;
      thigh.castShadow = true;
      leg.add(thigh);

      // Chunky exaggerated boot!
      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.27 * wScale, 0.3 * hScale, 0.36),
        steelMat
      );
      boot.position.set(0, -0.51 * hScale, 0.05);
      boot.castShadow = true;
      leg.add(boot);
    }

    // Arms & Oversized Gauntlets
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
      const upperArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.36, 0.2),
        darkArmorMat
      );
      upperArm.position.y = -0.16;
      upperArm.castShadow = true;
      arm.add(upperArm);

      hand.position.set(0, -0.38, 0.08);
      arm.add(hand);

      const gauntlet = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.25, 0.27),
        steelMat
      );
      gauntlet.castShadow = true;
      hand.add(gauntlet);
    }

    // Build Class Weapons
    this.buildClassWeapons(
      classId,
      brightBladeMat,
      steelMat,
      darkArmorMat,
      woodGripMat,
      clothMat,
      plumeMat
    );

    // Weapon active swing arc ribbon (visible ONLY during Active hitbox window!)
    const arcGeo = new THREE.RingGeometry(1.15, 2.25, 10, 1, -0.9, 1.8);
    arcGeo.rotateX(-Math.PI / 2);
    this.slashArcMesh = new THREE.Mesh(
      arcGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff3a1,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.slashArcMesh.position.set(0, 1.05, 0.35);
    this.slashArcMesh.visible = false;
    this.root.add(this.slashArcMesh);

    // Overhead Stun Stars (visible when Stunned)
    this.stunRing.position.set(0, 2.25 * hScale, 0);
    this.stunRing.visible = false;
    const starGeo = new THREE.OctahedronGeometry(0.13, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffe047 });
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
    plumeMat: THREE.Material,
    visorMat: THREE.Material
  ): void {
    const h = new THREE.Group();
    h.scale.setScalar(scale);

    if (classId === 'sword') {
      // Chunky Crusader Greathelm + Gold Crest Plume
      const bucket = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.28, 0.48, 8),
        steelMat
      );
      bucket.position.y = 0.24;
      bucket.castShadow = true;
      h.add(bucket);

      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.06, 0.14),
        visorMat
      );
      slit.position.set(0, 0.27, 0.21);
      h.add(slit);

      const crossVert = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.34, 0.06),
        plumeMat
      );
      crossVert.position.set(0, 0.24, 0.25);
      h.add(crossVert);

      const plume = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.24, 0.36),
        plumeMat
      );
      plume.position.set(0, 0.54, -0.04);
      plume.rotation.x = -0.2;
      h.add(plume);
    } else if (classId === 'dual') {
      // Sleek Beaked Duelist Visor Helm
      const dome = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 1),
        darkArmorMat
      );
      dome.position.y = 0.24;
      dome.scale.set(0.95, 1.05, 1.05);
      dome.castShadow = true;
      h.add(dome);

      const beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.32, 4),
        steelMat
      );
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.22, 0.28);
      h.add(beak);

      const eyes = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.05, 0.12),
        visorMat
      );
      eyes.position.set(0, 0.29, 0.22);
      h.add(eyes);
    } else if (classId === 'spear') {
      // Medieval Kettle / Conical Infantry Helm
      const skull = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.25, 0.34, 8),
        steelMat
      );
      skull.position.y = 0.2;
      h.add(skull);

      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.45, 0.06, 10),
        steelMat
      );
      brim.position.y = 0.28;
      brim.castShadow = true;
      h.add(brim);

      const coneTop = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.24, 8),
        steelMat
      );
      coneTop.position.y = 0.44;
      h.add(coneTop);

      const faceShadow = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.12, 0.1),
        visorMat
      );
      faceShadow.position.set(0, 0.19, 0.21);
      h.add(faceShadow);
    } else {
      // Class D: Massive Juggernaut Greathelm with Iron Horns
      const blockHelm = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.5, 0.52),
        darkArmorMat
      );
      blockHelm.position.y = 0.25;
      blockHelm.castShadow = true;
      h.add(blockHelm);

      const browPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.14, 0.56),
        steelMat
      );
      browPlate.position.y = 0.38;
      h.add(browPlate);

      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.06, 0.08),
        visorMat
      );
      slit.position.set(0, 0.27, 0.25);
      h.add(slit);

      const hornGeo = new THREE.ConeGeometry(0.09, 0.34, 5);
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(hornGeo, steelMat);
        horn.position.set(side * 0.36, 0.44, 0.04);
        horn.rotation.z = -side * 0.72;
        horn.rotation.x = 0.25;
        h.add(horn);
      }
    }

    this.headGroup.add(h);
  }

  private buildClassWeapons(
    classId: KnightClassId,
    bladeMat: THREE.Material,
    steelMat: THREE.Material,
    darkMat: THREE.Material,
    woodMat: THREE.Material,
    clothMat: THREE.Material,
    goldMat: THREE.Material
  ): void {
    if (classId === 'sword') {
      const sword = this.makeBroadsword(bladeMat, woodMat, goldMat, 1.48, 0.16);
      sword.position.set(0, -0.02, 0.12);
      sword.rotation.x = Math.PI * 0.42;
      this.handR.add(sword);
    } else if (classId === 'dual') {
      const bladeR = this.makeBroadsword(bladeMat, woodMat, steelMat, 1.24, 0.12);
      bladeR.position.set(0, -0.02, 0.12);
      bladeR.rotation.x = Math.PI * 0.45;
      this.handR.add(bladeR);

      const bladeL = this.makeBroadsword(bladeMat, woodMat, steelMat, 1.24, 0.12);
      bladeL.position.set(0, -0.02, 0.12);
      bladeL.rotation.x = Math.PI * 0.45;
      this.handL.add(bladeL);
    } else if (classId === 'spear') {
      const spear = new THREE.Group();
      // Long wooden ash shaft (2.8m total silhouette!)
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.048, 0.052, 2.55, 6),
        woodMat
      );
      shaft.position.y = 0.82;
      shaft.castShadow = true;
      spear.add(shaft);

      // Gleaming wide leaf-blade spearhead (contrasts cleanly with stone floor)
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(0.15, 0.62, 4),
        bladeMat
      );
      head.scale.set(1.0, 1.0, 0.45);
      head.position.y = 2.35;
      head.castShadow = true;
      spear.add(head);

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.07, 0.14, 6),
        goldMat
      );
      collar.position.y = 2.02;
      spear.add(collar);

      // Bright pennant flag below spearhead for high visual readability
      const pennant = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.44, 3),
        clothMat
      );
      pennant.position.set(0.16, 1.94, 0);
      pennant.rotation.z = -Math.PI * 0.42;
      spear.add(pennant);

      spear.rotation.x = Math.PI * 0.48;
      spear.position.set(0, 0, 0.08);
      this.handR.add(spear);
    } else {
      // Class D: Warhammer in Right Hand + Massive Tower Shield on Left Arm!
      const hammer = new THREE.Group();
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.06, 1.38, 6),
        woodMat
      );
      handle.position.y = 0.52;
      handle.castShadow = true;
      hammer.add(handle);

      const headBlock = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.34, 0.68),
        steelMat
      );
      headBlock.position.y = 1.2;
      headBlock.castShadow = true;
      hammer.add(headBlock);

      const strikeFace = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.38, 0.14),
        bladeMat
      );
      strikeFace.position.set(0, 1.2, 0.35);
      hammer.add(strikeFace);

      const backSpike = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.32, 4),
        darkMat
      );
      backSpike.rotation.x = -Math.PI / 2;
      backSpike.position.set(0, 1.2, -0.46);
      hammer.add(backSpike);

      hammer.rotation.x = Math.PI * 0.38;
      hammer.position.set(0, 0, 0.1);
      this.handR.add(hammer);

      // Massive Tower Shield on Left Hand
      const shield = new THREE.Group();
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 1.22, 0.12),
        woodMat
      );
      board.castShadow = true;
      shield.add(board);

      const frontPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 1.08, 0.14),
        clothMat
      );
      frontPlate.position.z = 0.01;
      shield.add(frontPlate);

      const rimTop = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.12, 0.16),
        steelMat
      );
      rimTop.position.y = 0.58;
      shield.add(rimTop);

      const rimBot = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.12, 0.16),
        steelMat
      );
      rimBot.position.y = -0.58;
      shield.add(rimBot);

      const boss = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.18, 0),
        goldMat
      );
      boss.position.z = 0.1;
      shield.add(boss);

      shield.position.set(0.22, 0.06, 0.24);
      shield.rotation.y = 0.35;
      this.handL.add(shield);
    }
  }

  private makeBroadsword(
    bladeMat: THREE.Material,
    gripMat: THREE.Material,
    guardMat: THREE.Material,
    bladeLen: number,
    bladeWidth: number
  ): THREE.Group {
    const g = new THREE.Group();

    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.048, 0.3, 6),
      gripMat
    );
    g.add(grip);

    const pommel = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.085, 0),
      guardMat
    );
    pommel.position.y = -0.18;
    g.add(pommel);

    const crossguard = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.08, 0.12),
      guardMat
    );
    crossguard.position.y = 0.16;
    crossguard.castShadow = true;
    g.add(crossguard);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(bladeWidth, bladeLen, 0.05),
      bladeMat
    );
    blade.position.y = 0.2 + bladeLen * 0.5;
    blade.castShadow = true;
    g.add(blade);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(bladeWidth * 0.72, 0.24, 4),
      bladeMat
    );
    tip.scale.set(1, 1, 0.35);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = 0.2 + bladeLen + 0.11;
    g.add(tip);

    return g;
  }

  /**
   * Updates full 3D pose & visual cues from authoritative Fighter state.
   */
  public syncFromFighter(fighter: Fighter): void {
    this.root.position.set(fighter.body.x, fighter.body.y, fighter.body.z);
    this.root.rotation.y = fighter.yaw;

    // Hit flash material tint
    const flash = fighter.hitFlashTimer > 0;
    for (let i = 0; i < this.tintMaterials.length; i++) {
      const m = this.tintMaterials[i];
      if (flash) {
        m.color.setHex(0xfff1c2);
        m.emissive.setHex(0x663300);
      } else {
        m.color.setHex(this.baseColors[i]);
        m.emissive.setHex(0x000000);
      }
    }

    // Reset baseline transforms
    const hScale = this.config.visual.bodyScaleHeight;
    this.hips.position.set(0, 0.72 * hScale, 0);
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.armR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.slashArcMesh.visible = false;
    this.stunRing.visible = false;
    this.footRing.visible = fighter.isAlive;

    const t = fighter.animTime;

    if (fighter.state === 'Dead') {
      // Dramatic collapse onto stone floor
      this.hips.position.y = 0.24;
      this.hips.rotation.x = -Math.PI * 0.46;
      this.hips.rotation.z = 0.22;
      this.armR.rotation.z = -0.8;
      this.armL.rotation.z = 0.75;
      this.legR.rotation.x = 0.25;
      this.legL.rotation.x = -0.15;
      return;
    }

    // Default class weapon readiness posture
    this.applyBaseClassStance(fighter.classId, t);

    if (fighter.state === 'Moving') {
      const freq = fighter.isSprinting ? 13.5 : 9.5;
      const amp = fighter.isSprinting ? 0.68 : 0.48;
      const stride = Math.sin(t * freq);
      this.legR.rotation.x = stride * amp;
      this.legL.rotation.x = -stride * amp;
      this.hips.position.y += Math.abs(Math.cos(t * freq)) * 0.08;
      this.torso.rotation.x = fighter.isSprinting ? 0.24 : 0.1;
      this.armR.rotation.x += -stride * amp * 0.35;
      this.armL.rotation.x += stride * amp * 0.35;

      if (this.capeMesh) {
        this.capeMesh.rotation.x =
          (fighter.isSprinting ? 0.55 : 0.34) + Math.sin(t * freq) * 0.1;
      }
    } else if (this.capeMesh) {
      this.capeMesh.rotation.x = 0.16 + Math.sin(t * 2.4) * 0.04;
    }

    // Charging Heavy Attack Pose (LMB Held before threshold)
    if (fighter.isChargingHeavy) {
      const c = fighter.chargeRatio;
      const jitter = Math.sin(t * 42) * 0.03 * c;
      this.torso.rotation.y = -0.55 * c;
      this.torso.rotation.x = -0.14 * c;
      this.armR.rotation.x = -1.35 * c + jitter;
      this.armR.rotation.z = -0.35 * c;
    }

    // 3-Phase Attack Animations
    if (
      (fighter.state === 'Attacking' || fighter.state === 'HeavyAttacking') &&
      fighter.activeAttack
    ) {
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
  }

  /**
   * Idle preview animation used on the Class Selection Showcase pedestal.
   */
  public updatePreviewIdle(elapsed: number): void {
    const hScale = this.config.visual.bodyScaleHeight;
    this.hips.position.set(
      0,
      0.72 * hScale + Math.sin(elapsed * 2.4) * 0.03,
      0
    );
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, Math.sin(elapsed * 1.2) * 0.08, 0);
    this.armR.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0);
    this.applyBaseClassStance(this.config.id, elapsed);
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
      // Hammer & Shield
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

    // Show stylized active swing trail mesh during Active window
    if (phase === 'Active') {
      this.slashArcMesh.visible = true;
      const mat = this.slashArcMesh.material as THREE.MeshBasicMaterial;
      mat.color.setHex(atk.isHeavy ? 0xff9f2e : 0xfff5ad);
      mat.opacity = 0.78 * (1 - p * 0.5);
      const scale = clamp(atk.range / 2.35, 0.85, 1.75);
      this.slashArcMesh.scale.set(
        style === 'spear_poke' || style === 'spear_impale' ? 0.42 : scale,
        1,
        scale
      );
    }

    if (style === 'spear_poke' || style === 'spear_impale') {
      // Distinct thrust windup (pull back) -> snappy forward lunge thrust -> retract
      if (phase === 'Windup') {
        this.torso.rotation.y = lerp(0, -0.45, p);
        this.armR.rotation.x = lerp(-0.25, 0.45, p);
      } else if (phase === 'Active') {
        this.torso.rotation.y = lerp(-0.45, 0.38, p);
        this.torso.rotation.x = 0.22;
        this.armR.rotation.x = lerp(0.45, -1.05, p);
      } else {
        this.torso.rotation.y = lerp(0.38, 0, p);
        this.torso.rotation.x = lerp(0.22, 0, p);
        this.armR.rotation.x = lerp(-1.05, -0.25, p);
      }
      return;
    }

    if (style === 'overhead_cleave' || style === 'hammer_slam') {
      // Dramatic overhead raise -> heavy ground-crushing slam -> weighty recovery!
      if (phase === 'Windup') {
        this.torso.rotation.x = lerp(0, -0.32, p);
        this.armR.rotation.x = lerp(-0.3, -2.55, p);
        this.armR.rotation.z = -0.1;
      } else if (phase === 'Active') {
        this.torso.rotation.x = lerp(-0.32, 0.48, p);
        this.hips.position.y -= 0.14 * p;
        this.armR.rotation.x = lerp(-2.55, 0.35, p);
      } else {
        this.torso.rotation.x = lerp(0.48, 0, p);
        this.hips.position.y -= 0.14 * (1 - p);
        this.armR.rotation.x = lerp(0.35, -0.28, p);
      }
      return;
    }

    if (style === 'dual_left') {
      if (phase === 'Windup') {
        this.torso.rotation.y = lerp(0, 0.5, p);
        this.armL.rotation.x = -1.2 * p;
        this.armL.rotation.z = 0.8 * p;
      } else if (phase === 'Active') {
        this.torso.rotation.y = lerp(0.5, -0.55, p);
        this.armL.rotation.x = -0.7;
        this.armL.rotation.y = lerp(0.5, -1.1, p);
      } else {
        this.torso.rotation.y = lerp(-0.55, 0, p);
        this.armL.rotation.x = lerp(-0.7, -0.45, p);
      }
      return;
    }

    if (style === 'dual_cross' || style === 'dual_finisher') {
      if (phase === 'Windup') {
        this.torso.rotation.x = -0.2 * p;
        this.armR.rotation.z = -1.1 * p;
        this.armL.rotation.z = 1.1 * p;
        this.armR.rotation.x = -1.0 * p;
        this.armL.rotation.x = -1.0 * p;
      } else if (phase === 'Active') {
        this.torso.rotation.x = 0.32;
        this.torso.rotation.y =
          style === 'dual_finisher' ? p * Math.PI * 1.4 : 0;
        this.armR.rotation.z = lerp(-1.1, 0.55, p);
        this.armL.rotation.z = lerp(1.1, -0.55, p);
        this.armR.rotation.x = -0.75;
        this.armL.rotation.x = -0.75;
      } else {
        this.torso.rotation.x = lerp(0.32, 0.12, p);
        this.armR.rotation.z = lerp(0.55, -0.28, p);
        this.armL.rotation.z = lerp(-0.55, 0.28, p);
      }
      return;
    }

    // Horizontal right-to-left or left-to-right slashes (Sword & Hammer regular swings)
    const dir = style === 'slash_left' ? -1 : 1;
    if (phase === 'Windup') {
      this.torso.rotation.y = lerp(0, -0.62 * dir, p);
      this.armR.rotation.x = lerp(-0.35, -1.25, p);
      this.armR.rotation.z = -0.65 * dir * p;
    } else if (phase === 'Active') {
      this.torso.rotation.y = lerp(-0.62 * dir, 0.68 * dir, p);
      this.torso.rotation.x = 0.2;
      this.armR.rotation.x = -0.82;
      this.armR.rotation.y = lerp(-0.5 * dir, 1.05 * dir, p);
    } else {
      this.torso.rotation.y = lerp(0.68 * dir, 0, p);
      this.torso.rotation.x = lerp(0.2, 0, p);
      this.armR.rotation.x = lerp(-0.82, -0.32, p);
      this.armR.rotation.y = lerp(1.05 * dir, 0, p);
    }
  }

  private applyBlockingAnimation(
    classId: KnightClassId,
    elapsed: number
  ): void {
    if (classId === 'hammer') {
      // Crouch solidly behind massive tower shield!
      this.hips.position.y -= 0.1;
      this.torso.rotation.y = 0.25;
      this.armL.rotation.x = -0.85;
      this.armL.rotation.y = -0.82;
      this.armR.rotation.x = -0.55;
    } else if (classId === 'dual') {
      // Crossed twin-swords X-parry!
      this.armR.rotation.x = -1.25;
      this.armR.rotation.z = 0.58;
      this.armL.rotation.x = -1.25;
      this.armL.rotation.z = -0.58;
    } else if (classId === 'spear') {
      // Spinning horizontal shaft sweep!
      const sweep = clamp(elapsed / 0.28, 0, 1);
      this.torso.rotation.y = lerp(-0.6, 0.55, sweep);
      this.armR.rotation.x = -1.1;
      this.armR.rotation.z = 0.72;
      this.armL.rotation.x = -1.0;
    } else {
      // Sword cross-guard high block!
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
      // Armored shield-first battering ram lunge!
      this.torso.rotation.x = 0.35;
      this.armL.rotation.x = -1.05;
      this.armL.rotation.y = -0.88;
    } else if (mode === 'backstep') {
      // Spear agile backward hop
      this.hips.position.y += Math.sin(progress * Math.PI) * 0.26;
      this.torso.rotation.x = -0.24;
    } else if (mode === 'quick_dash') {
      // Dual-blade low phantom dash
      this.hips.position.y -= 0.18;
      this.torso.rotation.x = 0.48;
      this.armR.rotation.x = 0.45;
      this.armL.rotation.x = 0.45;
    } else {
      // Classic sword evasive tuck/roll
      this.hips.position.y -= 0.16;
      this.torso.rotation.x = progress * Math.PI * 2;
    }
  }
}
