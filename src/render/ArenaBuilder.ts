import * as THREE from 'three';
import { ArenaConfig } from '../config/arenaConfig';
import { MaterialLibrary } from './PixelTextures';

export interface AnimatedTorch {
  flameOuter: THREE.Mesh;
  flameCore: THREE.Mesh;
  haloSprite: THREE.Mesh;
  light: THREE.PointLight | null;
  phase: number;
}

interface AnimatedBanner {
  mesh: THREE.Mesh;
  basePositions: Float32Array;
  phase: number;
}

/**
 * Builds a richly detailed, hand-crafted 28m Medieval Tournament Coliseum:
 * - 1024x1024 concentric radial cobblestone & compass-rose courtyard floor
 * - Gothic arched perimeter walls with machicolation corbels, arrow-loops & climbing ivy
 * - Carved octagonal columns adorned with heraldic shields & crossed blades
 * - Detailed low oak tilt-barriers & field weapon-rack armory crates
 * - Grand North Castle Gatehouse with 3D spiked iron portcullis, twin bastion towers & pennants
 * - South Royal Spectator Pavilion, glowing coal braziers, and swallowtail banners
 */
export class ArenaBuilder {
  public readonly group = new THREE.Group();
  public readonly torches: AnimatedTorch[] = [];
  private readonly banners: AnimatedBanner[] = [];
  private hazardRingMesh: THREE.Mesh | null = null;

  constructor(arena: ArenaConfig, mats: MaterialLibrary) {
    this.buildFloor(arena, mats);
    this.buildPerimeterWalls(arena, mats);
    this.buildCitadelBackdrop(arena, mats);
    this.buildSpawns(arena, mats);
    this.buildPillars(arena, mats);
    this.buildWoodenStructures(arena, mats);
    this.buildGrassAndIvy(arena, mats);
    this.buildTorchesAndBanners(arena, mats);
    this.buildFinalPhaseRing();
  }

  private buildFloor(arena: ArenaConfig, mats: MaterialLibrary): void {
    // 1:1 Radial Courtyard Disc mapped to our bespoke 1024x1024 concentric cobblestone & compass map!
    const floorGeo = new THREE.CylinderGeometry(
      arena.radius + 0.65,
      arena.radius + 0.65,
      0.6,
      64
    );
    const floor = new THREE.Mesh(floorGeo, mats.floorMat);
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Physical 3D carved stone border curb around wall base
    const curbGeo = new THREE.RingGeometry(
      arena.radius - 0.65,
      arena.radius + 0.25,
      48
    );
    curbGeo.rotateX(-Math.PI / 2);
    const curb = new THREE.Mesh(curbGeo, mats.curbStoneMat);
    curb.position.y = 0.014;
    curb.receiveShadow = true;
    this.group.add(curb);

    // Physical 3D bronze & stone trim framing the central tournament ring
    const ringOuter = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.06, 8, 48),
      mats.bronzeTrimMat
    );
    ringOuter.rotation.x = Math.PI / 2;
    ringOuter.position.y = 0.012;
    this.group.add(ringOuter);

    const centerHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.48, 0.04, 16),
      mats.bronzeTrimMat
    );
    centerHub.position.y = 0.02;
    this.group.add(centerHub);
  }

  private buildPerimeterWalls(arena: ArenaConfig, mats: MaterialLibrary): void {
    const segments = 32;
    const r = arena.radius + arena.wallThickness * 0.45;
    const segLen = (2 * Math.PI * r) / segments + 0.14;

    const wallSegGeo = new THREE.BoxGeometry(
      segLen,
      arena.wallHeight,
      arena.wallThickness
    );
    const nicheGeo = new THREE.BoxGeometry(
      segLen * 0.64,
      3.1,
      0.24
    );
    const archRingGeo = new THREE.TorusGeometry(
      segLen * 0.32,
      0.14,
      6,
      12,
      Math.PI
    );
    const corniceGeo = new THREE.BoxGeometry(
      segLen + 0.08,
      0.34,
      arena.wallThickness + 0.36
    );
    const corbelGeo = new THREE.BoxGeometry(0.24, 0.48, 0.32);
    const merlonGeo = new THREE.BoxGeometry(
      segLen * 0.6,
      0.96,
      arena.wallThickness * 0.88
    );
    const arrowLoopGeo = new THREE.BoxGeometry(0.1, 0.48, arena.wallThickness * 0.92);
    const merlonCapGeo = new THREE.BoxGeometry(
      segLen * 0.66,
      0.16,
      arena.wallThickness * 0.96
    );
    const buttressGeo = new THREE.BoxGeometry(
      1.1,
      arena.wallHeight + 0.78,
      1.68
    );
    const buttressCapGeo = new THREE.ConeGeometry(0.95, 0.65, 4);

    for (let i = 0; i < segments; i++) {
      const angle = (i * Math.PI * 2) / segments;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const rotY = -angle + Math.PI / 2;

      const bayGroup = new THREE.Group();
      bayGroup.position.set(x, 0, z);
      bayGroup.rotation.y = rotY;

      // Main masonry wall block
      const wallSeg = new THREE.Mesh(wallSegGeo, mats.wallMat);
      wallSeg.position.y = arena.wallHeight * 0.5;
      wallSeg.castShadow = true;
      wallSeg.receiveShadow = true;
      bayGroup.add(wallSeg);

      // Recessed Gothic blind-arcade niche + stone arch facing arena interior (-Z in local bay space!)
      const inwardZ = -arena.wallThickness * 0.5 - 0.02;
      const niche = new THREE.Mesh(nicheGeo, mats.darkStoneMat);
      niche.position.set(0, 1.65, inwardZ + 0.08);
      bayGroup.add(niche);

      const arch = new THREE.Mesh(archRingGeo, mats.curbStoneMat);
      arch.position.set(0, 3.15, inwardZ);
      bayGroup.add(arch);

      // Projecting Machicolation Corbels under parapet cornice
      for (const cx of [-segLen * 0.28, 0, segLen * 0.28]) {
        const corbel = new THREE.Mesh(corbelGeo, mats.curbStoneMat);
        corbel.position.set(cx, arena.wallHeight - 0.24, inwardZ - 0.06);
        bayGroup.add(corbel);
      }

      // Parapet Cornice Ledge
      const cornice = new THREE.Mesh(corniceGeo, mats.curbStoneMat);
      cornice.position.y = arena.wallHeight + 0.1;
      cornice.castShadow = true;
      bayGroup.add(cornice);

      // Battlement Merlon + Arrow-Slit Loop + Beveled Stone Cap
      const merlon = new THREE.Mesh(merlonGeo, mats.wallMat);
      merlon.position.y = arena.wallHeight + 0.62;
      merlon.castShadow = true;
      bayGroup.add(merlon);

      const slit = new THREE.Mesh(arrowLoopGeo, mats.darkStoneMat);
      slit.position.y = arena.wallHeight + 0.62;
      bayGroup.add(slit);

      const mCap = new THREE.Mesh(merlonCapGeo, mats.curbStoneMat);
      mCap.position.y = arena.wallHeight + 1.15;
      bayGroup.add(mCap);

      this.group.add(bayGroup);

      // Heavy Gothic Pilaster Buttress every 4th bay
      if (i % 4 === 0) {
        const bx = Math.cos(angle) * (arena.radius + 0.42);
        const bz = Math.sin(angle) * (arena.radius + 0.42);
        const bGroup = new THREE.Group();
        bGroup.position.set(bx, 0, bz);
        bGroup.rotation.y = rotY;

        const buttress = new THREE.Mesh(buttressGeo, mats.pillarMat);
        buttress.position.y = (arena.wallHeight + 0.78) * 0.5;
        buttress.castShadow = true;
        buttress.receiveShadow = true;
        bGroup.add(buttress);

        const cap = new THREE.Mesh(buttressCapGeo, mats.curbStoneMat);
        cap.rotation.y = Math.PI / 4;
        cap.position.y = arena.wallHeight + 1.1;
        bGroup.add(cap);

        // Forged iron mooring ring hung on buttress face
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.18, 0.035, 6, 12),
          mats.darkIronMat
        );
        ring.position.set(0, 1.85, -0.86);
        bGroup.add(ring);

        this.group.add(bGroup);
      }
    }
  }

  /**
   * Builds the surrounding Medieval Citadel:
   * - Grand North Gatehouse Keep with real 3D spiked iron portcullis, arrow slits, timber hoardings & pennants
   * - South Royal Spectator Box with draped crimson tapestry, colonnade & gilded shields
   * - Outer Bastion Watchtowers, Mountain Cliffs & Conifer Forests
   */
  private buildCitadelBackdrop(arena: ArenaConfig, mats: MaterialLibrary): void {
    const outerGround = new THREE.Mesh(
      new THREE.RingGeometry(arena.radius + 0.8, 92, 40),
      mats.grassMat
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.08;
    this.group.add(outerGround);

    const slateRoofMat = new THREE.MeshStandardMaterial({
      color: 0x445a7d,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    });
    const crimsonVelvetMat = new THREE.MeshStandardMaterial({
      color: 0xc43238,
      roughness: 0.94,
      flatShading: true,
    });

    // 1. GRAND NORTH CASTLE GATEHOUSE KEEP (z = -19.2)
    const keepGroup = new THREE.Group();
    keepGroup.position.set(0, 0, -19.2);

    const mainKeep = new THREE.Mesh(
      new THREE.BoxGeometry(12.2, 15.2, 7.6),
      mats.wallMat
    );
    mainKeep.position.y = 7.6;
    mainKeep.castShadow = true;
    mainKeep.receiveShadow = true;
    keepGroup.add(mainKeep);

    // Keep upper battlements & timber hoarding gallery
    const timberGallery = new THREE.Mesh(
      new THREE.BoxGeometry(12.8, 1.6, 8.2),
      mats.woodMat
    );
    timberGallery.position.y = 14.4;
    keepGroup.add(timberGallery);

    const keepRoof = new THREE.Mesh(
      new THREE.ConeGeometry(7.6, 4.8, 4),
      slateRoofMat
    );
    keepRoof.rotation.y = Math.PI / 4;
    keepRoof.scale.set(1.2, 1, 0.75);
    keepRoof.position.y = 17.6;
    keepGroup.add(keepRoof);

    // Twin Octagonal Bastion Towers flanking the Gatehouse
    for (const side of [-1, 1]) {
      const tx = side * 7.2;
      const tz = 1.5;

      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(2.65, 2.95, 18.2, 12),
        mats.wallMat
      );
      tower.position.set(tx, 9.1, tz);
      tower.castShadow = true;
      tower.receiveShadow = true;
      keepGroup.add(tower);

      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(2.95, 2.75, 1.1, 12),
        mats.curbStoneMat
      );
      collar.position.set(tx, 17.8, tz);
      keepGroup.add(collar);

      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(3.25, 6.2, 12),
        slateRoofMat
      );
      spire.position.set(tx, 21.4, tz);
      spire.castShadow = true;
      keepGroup.add(spire);

      // Golden finial spire & fluttering red pennant at 24.8m!
      const finial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 1.5, 6),
        mats.bronzeTrimMat
      );
      finial.position.set(tx, 25.0, tz);
      keepGroup.add(finial);

      const pennant = new THREE.Mesh(
        new THREE.ConeGeometry(0.32, 1.35, 3),
        crimsonVelvetMat
      );
      pennant.rotation.z = -Math.PI / 2;
      pennant.position.set(tx + 0.65, 25.4, tz);
      keepGroup.add(pennant);

      // Tower arrow-slits
      for (const sy of [9.5, 13.5]) {
        const slit = new THREE.Mesh(
          new THREE.BoxGeometry(0.26, 1.35, 0.3),
          mats.darkStoneMat
        );
        slit.position.set(tx, sy, tz + 2.72);
        keepGroup.add(slit);
      }
    }

    // Recessed Gatehouse Arch + Real 3D Iron Portcullis Grid!
    const gateDark = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 8.2, 0.6),
      mats.darkStoneMat
    );
    gateDark.position.set(0, 4.4, 3.65);
    keepGroup.add(gateDark);

    const gateArch = new THREE.Mesh(
      new THREE.TorusGeometry(2.4, 0.42, 8, 16, Math.PI),
      mats.curbStoneMat
    );
    gateArch.position.set(0, 6.2, 3.85);
    keepGroup.add(gateArch);

    // 7 vertical spiked iron portcullis bars + 4 horizontal crossbars!
    for (let b = -3; b <= 3; b++) {
      const vBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 7.4, 6),
        mats.darkIronMat
      );
      vBar.position.set(b * 0.64, 4.9, 3.88);
      keepGroup.add(vBar);

      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.32, 6),
        mats.darkIronMat
      );
      spike.rotation.x = Math.PI;
      spike.position.set(b * 0.64, 1.1, 3.88);
      keepGroup.add(spike);
    }
    for (const hy of [2.2, 4.0, 5.8, 7.4]) {
      const hBar = new THREE.Mesh(
        new THREE.BoxGeometry(4.5, 0.14, 0.16),
        mats.darkIronMat
      );
      hBar.position.set(0, hy, 3.88);
      keepGroup.add(hBar);
    }

    this.group.add(keepGroup);

    // 2. SOUTH ROYAL TOURNAMENT PAVILION & GALLERY (z = +16.3)
    const pavilion = new THREE.Group();
    pavilion.position.set(0, 5.4, 16.3);

    const tribuneBase = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 1.4, 3.8),
      mats.curbStoneMat
    );
    tribuneBase.position.y = 0.5;
    pavilion.add(tribuneBase);

    // Royal crimson & gold front drape hanging over the balcony
    const royalDrape = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 1.5, 0.14),
      crimsonVelvetMat
    );
    royalDrape.position.set(0, 0.45, -1.92);
    pavilion.add(royalDrape);

    const goldTrimBar = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.14, 0.2),
      mats.bronzeTrimMat
    );
    goldTrimBar.position.set(0, 1.18, -1.94);
    pavilion.add(goldTrimBar);

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(9.4, 0.6, 4.2),
      crimsonVelvetMat
    );
    canopy.position.y = 3.6;
    canopy.rotation.x = 0.12;
    pavilion.add(canopy);

    for (const px of [-4.1, -1.4, 1.4, 4.1]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 3.5, 8),
        mats.woodMat
      );
      post.position.set(px, 1.9, -1.5);
      pavilion.add(post);

      const shieldCrest = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.38, 0.08, 6),
        mats.bronzeTrimMat
      );
      shieldCrest.rotation.x = Math.PI / 2;
      shieldCrest.position.set(px * 0.72, 0.55, -2.0);
      pavilion.add(shieldCrest);
    }

    this.group.add(pavilion);

    // 3. OUTER WATCHTOWERS, ROCKY CLIFFS & CONIFER TREES
    const towerAngles = [0.65, 2.48, 3.82, 5.62];
    for (const a of towerAngles) {
      const dist = 24.8;
      const tx = Math.cos(a) * dist;
      const tz = Math.sin(a) * dist;
      const wt = new THREE.Mesh(
        new THREE.CylinderGeometry(2.15, 2.45, 14.0, 10),
        mats.wallMat
      );
      wt.position.set(tx, 7.0, tz);
      this.group.add(wt);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.65, 4.6, 10),
        slateRoofMat
      );
      cone.position.set(tx, 16.2, tz);
      this.group.add(cone);
    }

    const rockGeo = new THREE.DodecahedronGeometry(7.8, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6);
    const tierGeo = new THREE.ConeGeometry(1.45, 2.6, 7);

    for (let i = 0; i < 20; i++) {
      const a = (i * Math.PI * 2) / 20 + 0.1;
      const r = 39 + (i % 3) * 9;
      const rock = new THREE.Mesh(rockGeo, mats.cliffRockMat);
      const sy = 0.95 + (i % 4) * 0.45;
      rock.scale.set(1.32, sy, 1.12);
      rock.position.set(Math.cos(a) * r, sy * 2.4 - 1.5, Math.sin(a) * r);
      rock.rotation.y = i * 1.1;
      this.group.add(rock);

      // Multi-tier conifer pine trees on surrounding hills
      const pr = 21.5 + (i % 3) * 4.5;
      const px = Math.cos(a + 0.14) * pr;
      const pz = Math.sin(a + 0.14) * pr;
      if (Math.abs(px) > 8.5 || (pz < 14.5 && pz > -14.5)) {
        const tree = new THREE.Group();
        tree.position.set(px, 0, pz);
        const trunk = new THREE.Mesh(trunkGeo, mats.woodMat);
        trunk.position.y = 0.7;
        tree.add(trunk);

        for (let t = 0; t < 3; t++) {
          const foliage = new THREE.Mesh(tierGeo, mats.ivyMat);
          const s = 1 - t * 0.22;
          foliage.scale.setScalar(s);
          foliage.position.y = 1.9 + t * 1.25;
          tree.add(foliage);
        }
        this.group.add(tree);
      }
    }
  }

  private buildSpawns(arena: ArenaConfig, mats: MaterialLibrary): void {
    const padGeo = new THREE.CylinderGeometry(1.02, 1.16, 0.075, 16);
    const ringGeo = new THREE.RingGeometry(0.78, 0.92, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const studGeo = new THREE.SphereGeometry(0.045, 6, 6);

    for (const sp of arena.spawns) {
      const sGroup = new THREE.Group();
      sGroup.position.set(sp.x, 0, sp.z);

      const pad = new THREE.Mesh(padGeo, mats.curbStoneMat);
      pad.position.y = 0.037;
      pad.receiveShadow = true;
      sGroup.add(pad);

      const ring = new THREE.Mesh(ringGeo, mats.bronzeTrimMat);
      ring.position.y = 0.078;
      sGroup.add(ring);

      for (let k = 0; k < 6; k++) {
        const ka = (k * Math.PI) / 3;
        const stud = new THREE.Mesh(studGeo, mats.bronzeTrimMat);
        stud.position.set(Math.cos(ka) * 0.98, 0.078, Math.sin(ka) * 0.98);
        sGroup.add(stud);
      }

      this.group.add(sGroup);
    }
  }

  private buildPillars(arena: ArenaConfig, mats: MaterialLibrary): void {
    const contactMat = new THREE.MeshBasicMaterial({
      map: mats.contactShadowTex,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });

    const shieldColors = [0xc93838, 0x2979c9, 0xd99b26, 0x2f8f4e];

    arena.circles.forEach((c, idx) => {
      const pGroup = new THREE.Group();
      pGroup.position.set(c.x, 0, c.z);
      // Face inward toward (0, 0) so column shield faces center arena!
      pGroup.rotation.y = Math.atan2(-c.x, -c.z);

      const shadowQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(c.radius * 3.8, c.radius * 3.8),
        contactMat
      );
      shadowQuad.rotation.x = -Math.PI / 2;
      shadowQuad.position.y = 0.018;
      pGroup.add(shadowQuad);

      // Multi-stepped octagonal Gothic base
      const plinthLower = new THREE.Mesh(
        new THREE.CylinderGeometry(c.radius * 1.26, c.radius * 1.34, 0.26, 8),
        mats.curbStoneMat
      );
      plinthLower.position.y = 0.13;
      plinthLower.castShadow = true;
      plinthLower.receiveShadow = true;
      pGroup.add(plinthLower);

      const plinthUpper = new THREE.Mesh(
        new THREE.CylinderGeometry(c.radius * 1.06, c.radius * 1.2, 0.26, 8),
        mats.curbStoneMat
      );
      plinthUpper.position.y = 0.39;
      plinthUpper.castShadow = true;
      pGroup.add(plinthUpper);

      // Fluted octagonal shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(
          c.radius * 0.88,
          c.radius * 0.96,
          c.height - 0.95,
          8
        ),
        mats.pillarMat
      );
      shaft.position.y = (c.height - 0.95) * 0.5 + 0.52;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pGroup.add(shaft);

      // Sculpted Gothic Capital + Abacus slab
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(c.radius * 1.34, c.radius * 0.92, 0.46, 8),
        mats.curbStoneMat
      );
      cap.position.y = c.height - 0.22;
      cap.castShadow = true;
      pGroup.add(cap);

      const abacus = new THREE.Mesh(
        new THREE.BoxGeometry(c.radius * 2.35, 0.16, c.radius * 2.35),
        mats.curbStoneMat
      );
      abacus.position.y = c.height + 0.04;
      abacus.castShadow = true;
      pGroup.add(abacus);

      // Forged iron bands
      for (const ry of [1.45, 2.95]) {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(
            c.radius * 0.98,
            c.radius * 0.98,
            0.13,
            8
          ),
          mats.darkIronMat
        );
        band.position.y = ry;
        pGroup.add(band);
      }

      // Mounted Heraldic Trophy Shield + Crossed Blades on inward face of column!
      const trophyMat = new THREE.MeshStandardMaterial({
        color: shieldColors[idx % shieldColors.length],
        roughness: 0.92,
        flatShading: true,
      });
      const trophyShield = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.24, 0.08, 6),
        trophyMat
      );
      trophyShield.rotation.x = Math.PI / 2;
      trophyShield.position.set(0, 2.22, c.radius * 0.95);
      pGroup.add(trophyShield);

      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 8, 8),
        mats.bronzeTrimMat
      );
      boss.position.set(0, 2.22, c.radius * 0.99);
      pGroup.add(boss);

      this.group.add(pGroup);
    });
  }

  private buildWoodenStructures(arena: ArenaConfig, mats: MaterialLibrary): void {
    const shieldPaintRed = new THREE.MeshStandardMaterial({
      color: 0xc93b3b,
      roughness: 0.92,
      flatShading: true,
    });
    const shieldPaintBlue = new THREE.MeshStandardMaterial({
      color: 0x3478c6,
      roughness: 0.92,
      flatShading: true,
    });

    for (const b of arena.boxes) {
      const wGroup = new THREE.Group();
      wGroup.position.set(b.x, 0, b.z);
      wGroup.rotation.y = b.rotationY;

      if (b.kind === 'wood_barrier') {
        const w = b.halfWidth * 2;
        const postGeo = new THREE.BoxGeometry(0.26, b.height + 0.06, 0.26);

        for (const sx of [-b.halfWidth + 0.22, b.halfWidth - 0.22]) {
          const post = new THREE.Mesh(postGeo, mats.woodMat);
          post.position.set(sx, (b.height + 0.06) * 0.5, 0);
          post.castShadow = true;
          post.receiveShadow = true;
          wGroup.add(post);

          // Forged iron pyramid cap on post
          const ironCap = new THREE.Mesh(
            new THREE.ConeGeometry(0.21, 0.14, 4),
            mats.darkIronMat
          );
          ironCap.rotation.y = Math.PI / 4;
          ironCap.position.set(sx, b.height + 0.12, 0);
          wGroup.add(ironCap);

          const foot = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.14, b.halfDepth * 2.0),
            mats.woodMat
          );
          foot.position.set(sx, 0.07, 0);
          foot.castShadow = true;
          wGroup.add(foot);
        }

        // Heavy horizontal rails + diagonal X-brace timber
        const plankGeo = new THREE.BoxGeometry(w, 0.23, 0.15);
        for (const py of [0.34, 0.77]) {
          const plank = new THREE.Mesh(plankGeo, mats.woodMat);
          plank.position.set(0, py, 0);
          plank.castShadow = true;
          plank.receiveShadow = true;
          wGroup.add(plank);
        }

        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.82, 0.12, 0.1),
          mats.woodMat
        );
        brace.position.set(0, 0.55, 0);
        brace.rotation.z = 0.22;
        wGroup.add(brace);

        // Iron reinforcement straps
        const studGeo = new THREE.BoxGeometry(0.11, 0.78, 0.19);
        for (const sx of [-b.halfWidth + 0.22, 0, b.halfWidth - 0.22]) {
          const stud = new THREE.Mesh(studGeo, mats.darkIronMat);
          stud.position.set(sx, 0.56, 0);
          wGroup.add(stud);
        }

        // Two painted tournament round-shields hung on barrier face!
        for (const [sx, sMat] of [
          [-0.58, shieldPaintRed],
          [0.58, shieldPaintBlue],
        ] as const) {
          const roundShield = new THREE.Mesh(
            new THREE.CylinderGeometry(0.33, 0.33, 0.06, 14),
            sMat
          );
          roundShield.rotation.x = Math.PI / 2;
          roundShield.position.set(sx, 0.56, 0.12);
          roundShield.castShadow = true;
          wGroup.add(roundShield);

          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(0.33, 0.03, 6, 14),
            mats.darkIronMat
          );
          rim.position.set(sx, 0.56, 0.13);
          wGroup.add(rim);

          const boss = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 8, 8),
            mats.bronzeTrimMat
          );
          boss.position.set(sx, 0.56, 0.16);
          wGroup.add(boss);
        }
      } else {
        // South Armory Supply Cluster: Iron-bound War Chest + Barrel + Spare Weapon Rack!
        const chest = new THREE.Mesh(
          new THREE.BoxGeometry(1.08, 0.72, 0.78),
          mats.woodMat
        );
        chest.position.set(-0.48, 0.36, 0.08);
        chest.rotation.y = 0.06;
        chest.castShadow = true;
        chest.receiveShadow = true;
        wGroup.add(chest);

        const chestLid = new THREE.Mesh(
          new THREE.CylinderGeometry(0.39, 0.39, 1.08, 10, 1, false, 0, Math.PI),
          mats.woodMat
        );
        chestLid.rotation.z = Math.PI / 2;
        chestLid.rotation.y = 0.06;
        chestLid.position.set(-0.48, 0.72, 0.08);
        chestLid.castShadow = true;
        wGroup.add(chestLid);

        const lockPlate = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.2, 0.06),
          mats.bronzeTrimMat
        );
        lockPlate.position.set(-0.48, 0.62, 0.48);
        wGroup.add(lockPlate);

        // Coopered Oak Barrel + Resting Spare Knight Helmet on top!
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.39, 0.43, 0.9, 14),
          mats.woodMat
        );
        barrel.position.set(0.56, 0.45, 0.04);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        wGroup.add(barrel);

        for (const hy of [0.2, 0.7]) {
          const hoop = new THREE.Mesh(
            new THREE.CylinderGeometry(0.425, 0.425, 0.065, 14),
            mats.darkIronMat
          );
          hoop.position.set(0.56, hy, 0.04);
          wGroup.add(hoop);
        }

        const spareHelm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.17, 0.19, 0.28, 10),
          mats.darkIronMat
        );
        spareHelm.position.set(0.54, 1.03, 0.04);
        spareHelm.rotation.y = -0.4;
        spareHelm.castShadow = true;
        wGroup.add(spareHelm);

        // Leaning practice sword against chest
        const propBlade = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.95, 0.03),
          mats.pillarMat
        );
        propBlade.position.set(0.06, 0.46, 0.36);
        propBlade.rotation.z = 0.24;
        propBlade.rotation.x = -0.18;
        wGroup.add(propBlade);
      }

      this.group.add(wGroup);
    }
  }

  private buildGrassAndIvy(arena: ArenaConfig, mats: MaterialLibrary): void {
    const bladeGeo = new THREE.ConeGeometry(0.16, 0.54, 4);
    for (let i = 0; i < 40; i++) {
      const a = (i * Math.PI * 2) / 40 + (i % 3) * 0.04;
      const r = arena.radius - 0.44 - (i % 2) * 0.24;
      const tuft = new THREE.Group();
      tuft.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);

      for (let b = -1; b <= 1; b++) {
        const blade = new THREE.Mesh(bladeGeo, mats.grassMat);
        blade.position.set(b * 0.11, 0.25, (b % 2) * 0.08);
        blade.rotation.z = b * 0.24;
        blade.rotation.y = i * 0.7;
        tuft.add(blade);
      }
      this.group.add(tuft);
    }

    // Climbing Emerald Ivy Clusters clinging to weathered perimeter walls!
    const leafGeo = new THREE.DodecahedronGeometry(0.28, 0);
    for (let v = 0; v < 10; v++) {
      const a = (v * Math.PI * 2) / 10 + 0.28;
      const r = arena.radius - 0.12;
      const vine = new THREE.Group();
      vine.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      vine.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));

      for (let step = 0; step < 7; step++) {
        const cluster = new THREE.Mesh(leafGeo, mats.ivyMat);
        cluster.scale.set(1.1, 0.85, 0.45);
        cluster.position.set(
          Math.sin(step * 1.4) * 0.34,
          0.45 + step * 0.52,
          0.08
        );
        cluster.rotation.z = step * 0.8;
        vine.add(cluster);
      }
      this.group.add(vine);
    }
  }

  private buildTorchesAndBanners(
    arena: ArenaConfig,
    mats: MaterialLibrary
  ): void {
    const bracketArmGeo = new THREE.BoxGeometry(0.12, 0.12, 0.62);
    const scrollBraceGeo = new THREE.TorusGeometry(0.22, 0.035, 6, 10, Math.PI);
    const basketGeo = new THREE.CylinderGeometry(0.24, 0.12, 0.32, 8);
    const coalBedGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const flameOuterGeo = new THREE.OctahedronGeometry(0.25, 1);
    const flameCoreGeo = new THREE.OctahedronGeometry(0.13, 0);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff942e,
      transparent: true,
      opacity: 0.24,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloGeo = new THREE.SphereGeometry(0.62, 8, 8);

    arena.torches.forEach((tm, idx) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(tm.x, tm.y, tm.z);
      tGroup.rotation.y = tm.inwardAngle;

      // Wrought-iron wall bracket + decorative scroll brace + coal fire-basket!
      const arm = new THREE.Mesh(bracketArmGeo, mats.darkIronMat);
      arm.position.set(0, 0.12, 0.26);
      tGroup.add(arm);

      const brace = new THREE.Mesh(scrollBraceGeo, mats.darkIronMat);
      brace.rotation.y = Math.PI / 2;
      brace.position.set(0, -0.08, 0.24);
      tGroup.add(brace);

      const basket = new THREE.Mesh(basketGeo, mats.darkIronMat);
      basket.position.set(0, 0.32, 0.54);
      tGroup.add(basket);

      const coals = new THREE.Mesh(coalBedGeo, mats.emberCoalMat);
      coals.scale.set(1, 0.55, 1);
      coals.position.set(0, 0.44, 0.54);
      tGroup.add(coals);

      const flameOuter = new THREE.Mesh(flameOuterGeo, mats.flameOuterMat);
      flameOuter.position.set(0, 0.68, 0.54);
      flameOuter.scale.set(1, 1.55, 1);
      tGroup.add(flameOuter);

      const flameCore = new THREE.Mesh(flameCoreGeo, mats.flameCoreMat);
      flameCore.position.set(0, 0.62, 0.54);
      tGroup.add(flameCore);

      const haloSprite = new THREE.Mesh(haloGeo, haloMat);
      haloSprite.position.set(0, 0.68, 0.54);
      tGroup.add(haloSprite);

      let light: THREE.PointLight | null = null;
      if (idx % 2 === 0) {
        light = new THREE.PointLight(0xff9636, 9.8, 14.8, 1.55);
        light.position.set(0, 0.75, 0.88);
        tGroup.add(light);
      }

      this.torches.push({
        flameOuter,
        flameCore,
        haloSprite,
        light,
        phase: idx * 1.37,
      });

      this.group.add(tGroup);
    });

    // Swallowtail Heraldic Wall Banners with Gilded Finials
    const crossbarGeo = new THREE.CylinderGeometry(0.052, 0.052, 1.56, 8);
    crossbarGeo.rotateZ(Math.PI / 2);
    const finialGeo = new THREE.SphereGeometry(0.09, 8, 8);

    arena.banners.forEach((bm, idx) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bm.x, bm.y, bm.z);
      bGroup.rotation.y = bm.inwardAngle;

      const bar = new THREE.Mesh(crossbarGeo, mats.bronzeTrimMat);
      bar.position.set(0, 0, 0.24);
      bGroup.add(bar);

      for (const sx of [-0.8, 0.8]) {
        const knob = new THREE.Mesh(finialGeo, mats.bronzeTrimMat);
        knob.position.set(sx, 0, 0.24);
        bGroup.add(knob);
      }

      const bannerClothGeo = new THREE.PlaneGeometry(1.3, 2.55, 5, 10);
      const tex = mats.createBannerTexture(bm.color);
      const clothMat = new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.45,
        roughness: 0.94,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide,
      });
      const cloth = new THREE.Mesh(bannerClothGeo, clothMat);
      cloth.position.set(0, -1.28, 0.26);
      cloth.castShadow = true;
      bGroup.add(cloth);

      const posAttr = bannerClothGeo.attributes.position as THREE.BufferAttribute;
      this.banners.push({
        mesh: cloth,
        basePositions: new Float32Array(posAttr.array),
        phase: idx * 0.95,
      });

      this.group.add(bGroup);
    });
  }

  private buildFinalPhaseRing(): void {
    const ringGeo = new THREE.RingGeometry(11.15, 14.0, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.8, 0.35, 0.08),
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      toneMapped: false,
    });
    this.hazardRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.hazardRingMesh.position.y = 0.045;
    this.hazardRingMesh.visible = false;
    this.group.add(this.hazardRingMesh);
  }

  public update(elapsed: number, isFinalPhase: boolean): void {
    for (const t of this.torches) {
      const flicker =
        1 +
        Math.sin(elapsed * 12.0 + t.phase) * 0.13 +
        Math.cos(elapsed * 21.0 + t.phase * 2) * 0.07;
      t.flameOuter.scale.set(0.95 * flicker, 1.55 * flicker, 0.95 * flicker);
      t.flameOuter.rotation.y = elapsed * 2.5 + t.phase;
      t.haloSprite.scale.setScalar(0.92 + flicker * 0.14);
      if (t.light) {
        t.light.intensity = 9.5 * flicker;
      }
    }

    for (const b of this.banners) {
      const posAttr = b.mesh.geometry.attributes
        .position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const base = b.basePositions;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i];
        const by = base[i + 1];
        const hangFactor = Math.max(0, (1.275 - by) / 2.55);
        arr[i + 2] =
          Math.sin(elapsed * 3.1 - by * 2.4 + b.phase) * 0.13 * hangFactor +
          Math.cos(elapsed * 2.2 + bx * 2.0 + b.phase) * 0.045 * hangFactor;
      }
      posAttr.needsUpdate = true;
      b.mesh.geometry.computeVertexNormals();
    }

    if (this.hazardRingMesh) {
      this.hazardRingMesh.visible = isFinalPhase;
      if (isFinalPhase) {
        const mat = this.hazardRingMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.2 + Math.sin(elapsed * 6.0) * 0.08;
      }
    }
  }
}
