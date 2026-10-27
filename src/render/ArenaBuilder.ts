import * as THREE from 'three';
import { ArenaConfig } from '../config/arenaConfig';
import { MaterialLibrary } from './PixelTextures';

export interface AnimatedTorch {
  flameOuter: THREE.Mesh;
  flameCore: THREE.Mesh;
  light: THREE.PointLight | null;
  phase: number;
}

/**
 * Builds the 28-meter stylized low-poly medieval stone arena:
 * - Stone slab courtyard floor with subtle central fighting ring & outer grass tufts
 * - High crenellated stone perimeter walls
 * - 5 stone spawn markers
 * - 4 stone columns
 * - Low wooden barricades & supply crates (never blocking camera overview)
 * - 8 flickering wall torches & 8 colorful heraldic banners
 */
export class ArenaBuilder {
  public readonly group = new THREE.Group();
  public readonly torches: AnimatedTorch[] = [];
  private hazardRingMesh: THREE.Mesh | null = null;
  private bannerMeshes: THREE.Mesh[] = [];

  constructor(arena: ArenaConfig, mats: MaterialLibrary) {
    this.buildFloor(arena, mats);
    this.buildPerimeterWalls(arena, mats);
    this.buildSpawns(arena, mats);
    this.buildPillars(arena, mats);
    this.buildWoodenStructures(arena, mats);
    this.buildGrassTufts(arena, mats);
    this.buildTorchesAndBanners(arena, mats);
    this.buildFinalPhaseRing();
  }

  private buildFloor(arena: ArenaConfig, mats: MaterialLibrary): void {
    // Main stone courtyard disc
    const floorGeo = new THREE.CylinderGeometry(
      arena.radius + 0.8,
      arena.radius + 0.8,
      0.5,
      24
    );
    const floor = new THREE.Mesh(floorGeo, mats.floorMat);
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    this.group.add(floor);

    // Subtle central arena stone medallion (4cm height variation — readable & non-disruptive)
    const centerRingGeo = new THREE.RingGeometry(3.6, 4.15, 16);
    centerRingGeo.rotateX(-Math.PI / 2);
    const centerRing = new THREE.Mesh(centerRingGeo, mats.curbStoneMat);
    centerRing.position.y = 0.015;
    centerRing.receiveShadow = true;
    this.group.add(centerRing);

    const innerCrestGeo = new THREE.CylinderGeometry(1.3, 1.35, 0.04, 12);
    const innerCrest = new THREE.Mesh(innerCrestGeo, mats.curbStoneMat);
    innerCrest.position.y = 0.02;
    innerCrest.receiveShadow = true;
    this.group.add(innerCrest);

    // Scattered flat relief stone tiles around outer ring
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12 + 0.15;
      const r = 11.9 + (i % 2) * 0.8;
      const slabGeo = new THREE.BoxGeometry(1.5, 0.05, 1.2);
      const slab = new THREE.Mesh(slabGeo, mats.curbStoneMat);
      slab.position.set(Math.cos(a) * r, 0.025, Math.sin(a) * r);
      slab.rotation.y = -a + 0.2;
      slab.receiveShadow = true;
      this.group.add(slab);
    }
  }

  private buildPerimeterWalls(arena: ArenaConfig, mats: MaterialLibrary): void {
    const segments = 24;
    const r = arena.radius + arena.wallThickness * 0.45;
    const segLen = (2 * Math.PI * r) / segments + 0.18;

    const wallSegGeo = new THREE.BoxGeometry(
      segLen,
      arena.wallHeight,
      arena.wallThickness
    );
    const merlonGeo = new THREE.BoxGeometry(
      segLen * 0.56,
      0.85,
      arena.wallThickness * 0.92
    );
    const buttressGeo = new THREE.BoxGeometry(0.95, arena.wallHeight + 0.5, 1.45);

    for (let i = 0; i < segments; i++) {
      const angle = (i * Math.PI * 2) / segments;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      const wallSeg = new THREE.Mesh(wallSegGeo, mats.wallMat);
      wallSeg.position.set(x, arena.wallHeight * 0.5, z);
      wallSeg.rotation.y = -angle + Math.PI / 2;
      wallSeg.castShadow = true;
      wallSeg.receiveShadow = true;
      this.group.add(wallSeg);

      // Battlement merlon on top
      const merlon = new THREE.Mesh(merlonGeo, mats.curbStoneMat);
      merlon.position.set(x, arena.wallHeight + 0.42, z);
      merlon.rotation.y = -angle + Math.PI / 2;
      merlon.castShadow = true;
      this.group.add(merlon);

      // Every 3rd segment gets a chunky stone buttress towerlet
      if (i % 3 === 0) {
        const bx = Math.cos(angle) * (arena.radius + 0.35);
        const bz = Math.sin(angle) * (arena.radius + 0.35);
        const buttress = new THREE.Mesh(buttressGeo, mats.pillarMat);
        buttress.position.set(bx, (arena.wallHeight + 0.5) * 0.5, bz);
        buttress.rotation.y = -angle + Math.PI / 2;
        buttress.castShadow = true;
        buttress.receiveShadow = true;
        this.group.add(buttress);
      }
    }

    // Outer grassy ground skirt beyond the arena walls for horizon silhouette
    const outerGrassGeo = new THREE.RingGeometry(arena.radius + 0.9, 44, 24);
    outerGrassGeo.rotateX(-Math.PI / 2);
    const outerGrass = new THREE.Mesh(outerGrassGeo, mats.grassMat);
    outerGrass.position.y = -0.05;
    this.group.add(outerGrass);
  }

  private buildSpawns(arena: ArenaConfig, mats: MaterialLibrary): void {
    const padGeo = new THREE.CylinderGeometry(0.95, 1.08, 0.06, 8);
    for (const sp of arena.spawns) {
      const pad = new THREE.Mesh(padGeo, mats.curbStoneMat);
      pad.position.set(sp.x, 0.03, sp.z);
      pad.receiveShadow = true;
      this.group.add(pad);
    }
  }

  private buildPillars(arena: ArenaConfig, mats: MaterialLibrary): void {
    for (const c of arena.circles) {
      const pGroup = new THREE.Group();
      pGroup.position.set(c.x, 0, c.z);

      const baseGeo = new THREE.BoxGeometry(
        c.radius * 2.15,
        0.45,
        c.radius * 2.15
      );
      const base = new THREE.Mesh(baseGeo, mats.curbStoneMat);
      base.position.y = 0.225;
      base.castShadow = true;
      base.receiveShadow = true;
      pGroup.add(base);

      const shaftGeo = new THREE.CylinderGeometry(
        c.radius * 0.88,
        c.radius * 0.96,
        c.height - 0.8,
        8
      );
      const shaft = new THREE.Mesh(shaftGeo, mats.pillarMat);
      shaft.position.y = (c.height - 0.8) * 0.5 + 0.45;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pGroup.add(shaft);

      const capGeo = new THREE.BoxGeometry(
        c.radius * 2.25,
        0.42,
        c.radius * 2.25
      );
      const cap = new THREE.Mesh(capGeo, mats.curbStoneMat);
      cap.position.y = c.height - 0.15;
      cap.castShadow = true;
      pGroup.add(cap);

      // Iron brazier ring around middle of column
      const bandGeo = new THREE.CylinderGeometry(
        c.radius * 0.97,
        c.radius * 0.97,
        0.16,
        8
      );
      const band = new THREE.Mesh(bandGeo, mats.darkIronMat);
      band.position.y = 2.2;
      pGroup.add(band);

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
        // Two sturdy vertical wooden posts + cross planks + iron brackets
        const postGeo = new THREE.BoxGeometry(0.26, b.height, 0.26);
        for (const sx of [-b.halfWidth + 0.22, b.halfWidth - 0.22]) {
          const post = new THREE.Mesh(postGeo, mats.woodMat);
          post.position.set(sx, b.height * 0.5, 0);
          post.castShadow = true;
          post.receiveShadow = true;
          wGroup.add(post);

          const foot = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.14, b.halfDepth * 1.9),
            mats.woodMat
          );
          foot.position.set(sx, 0.07, 0);
          foot.castShadow = true;
          wGroup.add(foot);
        }

        const plankGeo = new THREE.BoxGeometry(w, 0.24, 0.14);
        for (const py of [0.36, 0.76]) {
          const plank = new THREE.Mesh(plankGeo, mats.woodMat);
          plank.position.set(0, py, 0);
          plank.castShadow = true;
          plank.receiveShadow = true;
          wGroup.add(plank);
        }

        // Iron reinforcement studs
        const studGeo = new THREE.BoxGeometry(0.12, 0.72, 0.18);
        for (const sx of [-b.halfWidth + 0.22, 0, b.halfWidth - 0.22]) {
          const stud = new THREE.Mesh(studGeo, mats.darkIronMat);
          stud.position.set(sx, 0.56, 0);
          wGroup.add(stud);
        }
      } else {
        // Wooden weapon/supply crates cluster (low profile ~1m)
        const c1 = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 0.95, 0.95),
          mats.woodMat
        );
        c1.position.set(-0.48, 0.475, 0);
        c1.rotation.y = 0.08;
        c1.castShadow = true;
        c1.receiveShadow = true;
        wGroup.add(c1);

        const c2 = new THREE.Mesh(
          new THREE.BoxGeometry(0.88, 0.76, 0.88),
          mats.woodMat
        );
        c2.position.set(0.52, 0.38, 0.06);
        c2.rotation.y = -0.14;
        c2.castShadow = true;
        c2.receiveShadow = true;
        wGroup.add(c2);

        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(1.09, 0.1, 0.99),
          mats.darkIronMat
        );
        trim.position.set(-0.48, 0.86, 0);
        trim.rotation.y = 0.08;
        wGroup.add(trim);
      }

      this.group.add(wGroup);
    }
  }

  private buildGrassTufts(arena: ArenaConfig, mats: MaterialLibrary): void {
    // Saturated green low-poly grass tufts along the base of outer stone walls
    const bladeGeo = new THREE.ConeGeometry(0.18, 0.52, 4);
    for (let i = 0; i < 28; i++) {
      const a = (i * Math.PI * 2) / 28 + (i % 3) * 0.05;
      const r = arena.radius - 0.48 - (i % 2) * 0.28;
      const tuft = new THREE.Group();
      tuft.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);

      for (let b = -1; b <= 1; b++) {
        const blade = new THREE.Mesh(bladeGeo, mats.grassMat);
        blade.position.set(b * 0.12, 0.24, (b % 2) * 0.08);
        blade.rotation.z = b * 0.22;
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
    const bracketGeo = new THREE.BoxGeometry(0.12, 0.12, 0.55);
    const shaftGeo = new THREE.CylinderGeometry(0.08, 0.05, 0.65, 6);
    const flameOuterGeo = new THREE.OctahedronGeometry(0.22, 0);
    const flameCoreGeo = new THREE.OctahedronGeometry(0.11, 0);

    arena.torches.forEach((tm, idx) => {
      const tGroup = new THREE.Group();
      tGroup.position.set(tm.x, tm.y, tm.z);
      tGroup.rotation.y = tm.inwardAngle;

      const bracket = new THREE.Mesh(bracketGeo, mats.darkIronMat);
      bracket.position.set(0, 0, 0.2);
      tGroup.add(bracket);

      const shaft = new THREE.Mesh(shaftGeo, mats.woodMat);
      shaft.position.set(0, 0.2, 0.42);
      shaft.rotation.x = 0.28;
      tGroup.add(shaft);

      const flameOuter = new THREE.Mesh(flameOuterGeo, mats.flameOuterMat);
      flameOuter.position.set(0, 0.58, 0.52);
      flameOuter.scale.set(1, 1.45, 1);
      tGroup.add(flameOuter);

      const flameCore = new THREE.Mesh(flameCoreGeo, mats.flameCoreMat);
      flameCore.position.set(0, 0.56, 0.52);
      tGroup.add(flameCore);

      // Keep dynamic point lights strictly limited to 4 alternating torches for high FPS!
      let light: THREE.PointLight | null = null;
      if (idx % 2 === 0) {
        light = new THREE.PointLight(0xff9b3d, 6.5, 13.5, 1.6);
        light.position.set(0, 0.65, 0.75);
        tGroup.add(light);
      }

      this.torches.push({
        flameOuter,
        flameCore,
        light,
        phase: idx * 1.37,
      });

      this.group.add(tGroup);
    });

    // Heraldic banners
    const bannerClothGeo = new THREE.PlaneGeometry(1.15, 2.25, 2, 4);
    const crossbarGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.35, 6);
    crossbarGeo.rotateZ(Math.PI / 2);

    arena.banners.forEach((bm) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bm.x, bm.y, bm.z);
      bGroup.rotation.y = bm.inwardAngle;

      const bar = new THREE.Mesh(crossbarGeo, mats.woodMat);
      bar.position.set(0, 0, 0.18);
      bGroup.add(bar);

      const tex = mats.createBannerTexture(bm.color);
      const clothMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.9,
        metalness: 0.0,
        side: THREE.DoubleSide,
        flatShading: true,
      });
      const cloth = new THREE.Mesh(bannerClothGeo, clothMat);
      cloth.position.set(0, -1.14, 0.2);
      cloth.castShadow = true;
      bGroup.add(cloth);
      this.bannerMeshes.push(cloth);

      this.group.add(bGroup);
    });
  }

  private buildFinalPhaseRing(): void {
    const ringGeo = new THREE.RingGeometry(11.15, 14.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4518,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.hazardRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.hazardRingMesh.position.y = 0.04;
    this.hazardRingMesh.visible = false;
    this.group.add(this.hazardRingMesh);
  }

  public update(elapsed: number, isFinalPhase: boolean): void {
    for (const t of this.torches) {
      const flicker =
        1 +
        Math.sin(elapsed * 11.5 + t.phase) * 0.12 +
        Math.cos(elapsed * 19.3 + t.phase * 2) * 0.07;
      t.flameOuter.scale.set(
        0.95 * flicker,
        1.4 * flicker,
        0.95 * flicker
      );
      t.flameOuter.rotation.y = elapsed * 2.2 + t.phase;
      if (t.light) {
        t.light.intensity = 6.2 * flicker;
      }
    }

    // Subtle wind sway on wall banners
    for (let i = 0; i < this.bannerMeshes.length; i++) {
      const b = this.bannerMeshes[i];
      b.rotation.x = Math.sin(elapsed * 2.1 + i * 0.9) * 0.06 + 0.03;
    }

    if (this.hazardRingMesh) {
      this.hazardRingMesh.visible = isFinalPhase;
      if (isFinalPhase) {
        const mat = this.hazardRingMesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.18 + Math.sin(elapsed * 6.0) * 0.07;
      }
    }
  }
}
