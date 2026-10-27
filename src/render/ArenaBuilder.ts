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
 * Builds an atmospheric, richly detailed 28m medieval tournament bastion:
 * - Normal-mapped ashlar stone courtyard with inlaid bronze/stone tournament rings
 * - Crenellated fortress walls, Gothic columns, iron-bound oak barricades & weapon racks
 * - North Gatehouse keep with iron portcullis & watchtowers + distant mountain vista
 * - Flickering HDR wall braziers/torches and vertex-fluttering heraldic banners
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
    this.buildGrassAndFoliage(arena, mats);
    this.buildTorchesAndBanners(arena, mats);
    this.buildFinalPhaseRing();
  }

  private buildFloor(arena: ArenaConfig, mats: MaterialLibrary): void {
    // Main normal-mapped courtyard floor
    const floorGeo = new THREE.CylinderGeometry(
      arena.radius + 1.0,
      arena.radius + 1.0,
      0.6,
      36
    );
    const floor = new THREE.Mesh(floorGeo, mats.floorMat);
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Outer perimeter stone walkway curb
    const outerCurbGeo = new THREE.RingGeometry(
      arena.radius - 0.9,
      arena.radius + 0.2,
      36
    );
    outerCurbGeo.rotateX(-Math.PI / 2);
    const outerCurb = new THREE.Mesh(outerCurbGeo, mats.curbStoneMat);
    outerCurb.position.y = 0.014;
    outerCurb.receiveShadow = true;
    this.group.add(outerCurb);

    // Central tournament stone ring & bronze inlay compass rose
    const centerRingGeo = new THREE.RingGeometry(3.85, 4.35, 24);
    centerRingGeo.rotateX(-Math.PI / 2);
    const centerRing = new THREE.Mesh(centerRingGeo, mats.curbStoneMat);
    centerRing.position.y = 0.016;
    centerRing.receiveShadow = true;
    this.group.add(centerRing);

    const bronzeInlayGeo = new THREE.RingGeometry(4.06, 4.14, 24);
    bronzeInlayGeo.rotateX(-Math.PI / 2);
    const bronzeInlay = new THREE.Mesh(bronzeInlayGeo, mats.bronzeTrimMat);
    bronzeInlay.position.y = 0.022;
    this.group.add(bronzeInlay);

    const innerMedallion = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.52, 0.04, 16),
      mats.curbStoneMat
    );
    innerMedallion.position.y = 0.02;
    innerMedallion.receiveShadow = true;
    this.group.add(innerMedallion);

    const centerStar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.58, 0.05, 8),
      mats.bronzeTrimMat
    );
    centerStar.position.y = 0.026;
    this.group.add(centerStar);

    // Subtle weathered stone flagstones around outer lane
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16 + 0.12;
      const r = 11.7 + (i % 2) * 0.75;
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.045, 1.18),
        mats.curbStoneMat
      );
      slab.position.set(Math.cos(a) * r, 0.022, Math.sin(a) * r);
      slab.rotation.y = -a + 0.18;
      slab.receiveShadow = true;
      this.group.add(slab);
    }
  }

  private buildPerimeterWalls(arena: ArenaConfig, mats: MaterialLibrary): void {
    const segments = 32;
    const r = arena.radius + arena.wallThickness * 0.45;
    const segLen = (2 * Math.PI * r) / segments + 0.16;

    const wallSegGeo = new THREE.BoxGeometry(
      segLen,
      arena.wallHeight,
      arena.wallThickness
    );
    const corniceGeo = new THREE.BoxGeometry(
      segLen + 0.06,
      0.32,
      arena.wallThickness + 0.28
    );
    const merlonGeo = new THREE.BoxGeometry(
      segLen * 0.58,
      0.92,
      arena.wallThickness * 0.88
    );
    const merlonCapGeo = new THREE.BoxGeometry(
      segLen * 0.64,
      0.16,
      arena.wallThickness * 0.96
    );
    const buttressGeo = new THREE.BoxGeometry(
      1.08,
      arena.wallHeight + 0.75,
      1.62
    );

    for (let i = 0; i < segments; i++) {
      const angle = (i * Math.PI * 2) / segments;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const rotY = -angle + Math.PI / 2;

      const wallSeg = new THREE.Mesh(wallSegGeo, mats.wallMat);
      wallSeg.position.set(x, arena.wallHeight * 0.5, z);
      wallSeg.rotation.y = rotY;
      wallSeg.castShadow = true;
      wallSeg.receiveShadow = true;
      this.group.add(wallSeg);

      // Stone parapet cornice ledge
      const cornice = new THREE.Mesh(corniceGeo, mats.curbStoneMat);
      cornice.position.set(x, arena.wallHeight + 0.08, z);
      cornice.rotation.y = rotY;
      cornice.castShadow = true;
      this.group.add(cornice);

      // Battlement merlon + beveled cap
      const merlon = new THREE.Mesh(merlonGeo, mats.wallMat);
      merlon.position.set(x, arena.wallHeight + 0.58, z);
      merlon.rotation.y = rotY;
      merlon.castShadow = true;
      this.group.add(merlon);

      const mCap = new THREE.Mesh(merlonCapGeo, mats.curbStoneMat);
      mCap.position.set(x, arena.wallHeight + 1.08, z);
      mCap.rotation.y = rotY;
      this.group.add(mCap);

      // Fortified stone buttresses every 4th segment
      if (i % 4 === 0) {
        const bx = Math.cos(angle) * (arena.radius + 0.42);
        const bz = Math.sin(angle) * (arena.radius + 0.42);
        const buttress = new THREE.Mesh(buttressGeo, mats.pillarMat);
        buttress.position.set(bx, (arena.wallHeight + 0.75) * 0.5, bz);
        buttress.rotation.y = rotY;
        buttress.castShadow = true;
        buttress.receiveShadow = true;
        this.group.add(buttress);
      }
    }
  }

  /**
   * Builds scenic medieval castle architecture & rocky landscape OUTSIDE the 28m arena
   * so every 360-degree camera view frames an epic medieval stronghold!
   */
  private buildCitadelBackdrop(arena: ArenaConfig, mats: MaterialLibrary): void {
    // Surrounding grassy plateau & rocky crags beyond walls
    const outerGround = new THREE.Mesh(
      new THREE.RingGeometry(arena.radius + 0.8, 88, 36),
      mats.grassMat
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.08;
    this.group.add(outerGround);

    // Grand North Castle Keep & Twin Watchtowers overlooking the arena (at z = -19.5)
    const keepGroup = new THREE.Group();
    keepGroup.position.set(0, 0, -19.5);

    const mainKeep = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 14.5, 7.5),
      mats.wallMat
    );
    mainKeep.position.y = 7.25;
    mainKeep.castShadow = true;
    mainKeep.receiveShadow = true;
    keepGroup.add(mainKeep);

    // Pitched slate castle roof
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x2e3b4e,
      roughness: 0.78,
      metalness: 0.12,
      flatShading: true,
    });

    for (const side of [-1, 1]) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(2.6, 2.85, 17.5, 12),
        mats.wallMat
      );
      tower.position.set(side * 6.8, 8.75, 1.4);
      tower.castShadow = true;
      tower.receiveShadow = true;
      keepGroup.add(tower);

      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(3.15, 5.6, 12),
        roofMat
      );
      spire.position.set(side * 6.8, 20.2, 1.4);
      spire.castShadow = true;
      keepGroup.add(spire);
    }

    // Iron portcullis gate arch facing inward
    const gateRecess = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 6.8, 0.8),
      mats.darkIronMat
    );
    gateRecess.position.set(0, 3.4, 3.6);
    keepGroup.add(gateRecess);

    this.group.add(keepGroup);

    // South Royal Tournament Pavilion / Tribune overlooking the wall (at z = +18.2)
    const pavilion = new THREE.Group();
    pavilion.position.set(0, 5.4, 16.4);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xa62626,
      roughness: 0.85,
      flatShading: true,
    });
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 0.55, 3.8),
      canopyMat
    );
    canopy.position.y = 3.2;
    canopy.rotation.x = 0.12;
    pavilion.add(canopy);

    for (const px of [-3.8, -1.3, 1.3, 3.8]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.16, 3.3, 8),
        mats.woodMat
      );
      post.position.set(px, 1.6, 0);
      pavilion.add(post);
    }
    this.group.add(pavilion);

    // Distant Perimeter Watchtowers & Stylized Mountain Crags + Pines
    const towerAngles = [0.65, 2.45, 3.85, 5.6];
    for (const a of towerAngles) {
      const dist = 24.5;
      const tx = Math.cos(a) * dist;
      const tz = Math.sin(a) * dist;
      const wt = new THREE.Mesh(
        new THREE.CylinderGeometry(2.1, 2.4, 13.5, 10),
        mats.wallMat
      );
      wt.position.set(tx, 6.75, tz);
      this.group.add(wt);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(2.6, 4.4, 10),
        roofMat
      );
      cone.position.set(tx, 15.6, tz);
      this.group.add(cone);
    }

    // Horizon mountain peaks & stylized conifers
    const rockGeo = new THREE.DodecahedronGeometry(7.5, 0);
    const pineGeo = new THREE.ConeGeometry(1.4, 4.2, 6);
    for (let i = 0; i < 18; i++) {
      const a = (i * Math.PI * 2) / 18 + 0.1;
      const r = 38 + (i % 3) * 9;
      const rock = new THREE.Mesh(rockGeo, mats.cliffRockMat);
      const sy = 0.9 + (i % 4) * 0.45;
      rock.scale.set(1.3, sy, 1.1);
      rock.position.set(Math.cos(a) * r, sy * 2.4 - 1.5, Math.sin(a) * r);
      rock.rotation.y = i * 1.1;
      this.group.add(rock);

      // Cluster of dark emerald pines on outer hills
      const pr = 21 + (i % 3) * 4.5;
      const px = Math.cos(a + 0.14) * pr;
      const pz = Math.sin(a + 0.14) * pr;
      if (Math.abs(px) > 8 || pz < 15) {
        const pine = new THREE.Mesh(pineGeo, mats.grassMat);
        pine.position.set(px, 2.0, pz);
        this.group.add(pine);
      }
    }
  }

  private buildSpawns(arena: ArenaConfig, mats: MaterialLibrary): void {
    const padGeo = new THREE.CylinderGeometry(0.98, 1.12, 0.07, 12);
    const ringGeo = new THREE.RingGeometry(0.76, 0.9, 12);
    ringGeo.rotateX(-Math.PI / 2);

    for (const sp of arena.spawns) {
      const pad = new THREE.Mesh(padGeo, mats.curbStoneMat);
      pad.position.set(sp.x, 0.035, sp.z);
      pad.receiveShadow = true;
      this.group.add(pad);

      const ring = new THREE.Mesh(ringGeo, mats.bronzeTrimMat);
      ring.position.set(sp.x, 0.075, sp.z);
      this.group.add(ring);
    }
  }

  private buildPillars(arena: ArenaConfig, mats: MaterialLibrary): void {
    const contactMat = new THREE.MeshBasicMaterial({
      map: mats.contactShadowTex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    for (const c of arena.circles) {
      const pGroup = new THREE.Group();
      pGroup.position.set(c.x, 0, c.z);

      // Ground contact shadow
      const shadowQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(c.radius * 3.6, c.radius * 3.6),
        contactMat
      );
      shadowQuad.rotation.x = -Math.PI / 2;
      shadowQuad.position.y = 0.018;
      pGroup.add(shadowQuad);

      // Stepped octagonal stone plinth
      const plinth = new THREE.Mesh(
        new THREE.CylinderGeometry(c.radius * 1.18, c.radius * 1.28, 0.42, 8),
        mats.curbStoneMat
      );
      plinth.position.y = 0.21;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      pGroup.add(plinth);

      // Fluted octagonal shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(
          c.radius * 0.88,
          c.radius * 0.96,
          c.height - 0.85,
          8
        ),
        mats.pillarMat
      );
      shaft.position.y = (c.height - 0.85) * 0.5 + 0.42;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pGroup.add(shaft);

      // Sculpted Gothic capital
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(c.radius * 1.32, c.radius * 0.92, 0.48, 8),
        mats.curbStoneMat
      );
      cap.position.y = c.height - 0.18;
      cap.castShadow = true;
      pGroup.add(cap);

      // Forged iron rings with bronze studs
      for (const ry of [1.4, 2.85]) {
        const band = new THREE.Mesh(
          new THREE.CylinderGeometry(
            c.radius * 0.97,
            c.radius * 0.97,
            0.14,
            8
          ),
          mats.darkIronMat
        );
        band.position.y = ry;
        pGroup.add(band);
      }

      this.group.add(pGroup);
    }
  }

  private buildWoodenStructures(arena: ArenaConfig, mats: MaterialLibrary): void {
    for (const b of arena.boxes) {
      const wGroup = new THREE.Group();
      wGroup.position.set(b.x, 0, b.z);
      wGroup.rotation.y = b.rotationY;

      if (b.kind === 'wood_barrier') {
        const w = b.halfWidth * 2;
        const postGeo = new THREE.BoxGeometry(0.26, b.height + 0.08, 0.26);

        for (const sx of [-b.halfWidth + 0.22, b.halfWidth - 0.22]) {
          const post = new THREE.Mesh(postGeo, mats.woodMat);
          post.position.set(sx, (b.height + 0.08) * 0.5, 0);
          post.castShadow = true;
          post.receiveShadow = true;
          wGroup.add(post);

          const ironCap = new THREE.Mesh(
            new THREE.BoxGeometry(0.3, 0.08, 0.3),
            mats.darkIronMat
          );
          ironCap.position.set(sx, b.height + 0.08, 0);
          wGroup.add(ironCap);

          const foot = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.14, b.halfDepth * 1.95),
            mats.woodMat
          );
          foot.position.set(sx, 0.07, 0);
          foot.castShadow = true;
          wGroup.add(foot);
        }

        const plankGeo = new THREE.BoxGeometry(w, 0.24, 0.15);
        for (const py of [0.35, 0.76]) {
          const plank = new THREE.Mesh(plankGeo, mats.woodMat);
          plank.position.set(0, py, 0);
          plank.castShadow = true;
          plank.receiveShadow = true;
          wGroup.add(plank);
        }

        // Iron reinforcement straps & decorative practice shield hung on barrier
        const studGeo = new THREE.BoxGeometry(0.11, 0.76, 0.19);
        for (const sx of [-b.halfWidth + 0.22, 0, b.halfWidth - 0.22]) {
          const stud = new THREE.Mesh(studGeo, mats.darkIronMat);
          stud.position.set(sx, 0.56, 0);
          wGroup.add(stud);
        }

        const buckler = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.08, 10),
          mats.darkIronMat
        );
        buckler.rotation.x = Math.PI / 2;
        buckler.position.set(0.45, 0.56, 0.12);
        wGroup.add(buckler);
      } else {
        // Iron-strapped oak supply crates + wooden barrel
        const c1 = new THREE.Mesh(
          new THREE.BoxGeometry(1.04, 0.96, 0.96),
          mats.woodMat
        );
        c1.position.set(-0.5, 0.48, 0);
        c1.rotation.y = 0.08;
        c1.castShadow = true;
        c1.receiveShadow = true;
        wGroup.add(c1);

        const frame1 = new THREE.Mesh(
          new THREE.BoxGeometry(1.08, 0.1, 1.0),
          mats.darkIronMat
        );
        frame1.position.set(-0.5, 0.88, 0);
        frame1.rotation.y = 0.08;
        wGroup.add(frame1);

        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.44, 0.92, 12),
          mats.woodMat
        );
        barrel.position.set(0.54, 0.46, 0.05);
        barrel.castShadow = true;
        barrel.receiveShadow = true;
        wGroup.add(barrel);

        for (const hy of [0.22, 0.7]) {
          const hoop = new THREE.Mesh(
            new THREE.CylinderGeometry(0.43, 0.43, 0.07, 12),
            mats.darkIronMat
          );
          hoop.position.set(0.54, hy, 0.05);
          wGroup.add(hoop);
        }
      }

      this.group.add(wGroup);
    }
  }

  private buildGrassAndFoliage(arena: ArenaConfig, mats: MaterialLibrary): void {
    const bladeGeo = new THREE.ConeGeometry(0.16, 0.54, 4);
    for (let i = 0; i < 36; i++) {
      const a = (i * Math.PI * 2) / 36 + (i % 3) * 0.04;
      const r = arena.radius - 0.45 - (i % 2) * 0.26;
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
  }

  private buildTorchesAndBanners(
    arena: ArenaConfig,
    mats: MaterialLibrary
  ): void {
    const bracketGeo = new THREE.BoxGeometry(0.14, 0.14, 0.58);
    const cageGeo = new THREE.CylinderGeometry(0.2, 0.1, 0.34, 6);
    const shaftGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.62, 6);
    const flameOuterGeo = new THREE.OctahedronGeometry(0.24, 1);
    const flameCoreGeo = new THREE.OctahedronGeometry(0.12, 0);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff942e,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haloGeo = new THREE.SphereGeometry(0.58, 8, 8);

    arena.torches.forEach((tm, idx) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(tm.x, tm.y, tm.z);
      tGroup.rotation.y = tm.inwardAngle;

      const bracket = new THREE.Mesh(bracketGeo, mats.darkIronMat);
      bracket.position.set(0, 0, 0.22);
      tGroup.add(bracket);

      const shaft = new THREE.Mesh(shaftGeo, mats.woodMat);
      shaft.position.set(0, 0.18, 0.44);
      shaft.rotation.x = 0.26;
      tGroup.add(shaft);

      const cage = new THREE.Mesh(cageGeo, mats.darkIronMat);
      cage.position.set(0, 0.44, 0.51);
      cage.rotation.x = 0.26;
      tGroup.add(cage);

      const flameOuter = new THREE.Mesh(flameOuterGeo, mats.flameOuterMat);
      flameOuter.position.set(0, 0.64, 0.54);
      flameOuter.scale.set(1, 1.5, 1);
      tGroup.add(flameOuter);

      const flameCore = new THREE.Mesh(flameCoreGeo, mats.flameCoreMat);
      flameCore.position.set(0, 0.6, 0.54);
      tGroup.add(flameCore);

      const haloSprite = new THREE.Mesh(haloGeo, haloMat);
      haloSprite.position.set(0, 0.64, 0.54);
      tGroup.add(haloSprite);

      // 4 warm dynamic point lights casting golden torchlight across masonry & armor
      let light: THREE.PointLight | null = null;
      if (idx % 2 === 0) {
        light = new THREE.PointLight(0xff9636, 9.5, 14.5, 1.55);
        light.position.set(0, 0.72, 0.85);
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

    // Vertex-animated Heraldic Banners
    const crossbarGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.48, 8);
    crossbarGeo.rotateZ(Math.PI / 2);

    arena.banners.forEach((bm, idx) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bm.x, bm.y, bm.z);
      bGroup.rotation.y = bm.inwardAngle;

      const bar = new THREE.Mesh(crossbarGeo, mats.bronzeTrimMat);
      bar.position.set(0, 0, 0.22);
      bGroup.add(bar);

      const bannerClothGeo = new THREE.PlaneGeometry(1.24, 2.45, 4, 8);
      const tex = mats.createBannerTexture(bm.color);
      const clothMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.86,
        metalness: 0.04,
        side: THREE.DoubleSide,
      });
      const cloth = new THREE.Mesh(bannerClothGeo, clothMat);
      cloth.position.set(0, -1.24, 0.24);
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
      t.flameOuter.scale.set(0.95 * flicker, 1.52 * flicker, 0.95 * flicker);
      t.flameOuter.rotation.y = elapsed * 2.5 + t.phase;
      t.haloSprite.scale.setScalar(0.92 + flicker * 0.14);
      if (t.light) {
        t.light.intensity = 9.2 * flicker;
      }
    }

    // Smooth vertex cloth ripple on banners
    for (const b of this.banners) {
      const posAttr = b.mesh.geometry.attributes
        .position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const base = b.basePositions;
      for (let i = 0; i < arr.length; i += 3) {
        const bx = base[i];
        const by = base[i + 1]; // +1.225 at top crossbar -> -1.225 at bottom
        const hangFactor = Math.max(0, (1.225 - by) / 2.45);
        arr[i + 2] =
          Math.sin(elapsed * 3.1 - by * 2.4 + b.phase) * 0.12 * hangFactor +
          Math.cos(elapsed * 2.2 + bx * 2.0 + b.phase) * 0.04 * hangFactor;
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
