import * as THREE from 'three';
import { ArenaConfig } from '../config/arenaConfig';
import { DungeonAssetKey, dungeonAssets } from './DungeonAssetCache';
import { MaterialLibrary } from './PixelTextures';

export interface AnimatedTorch {
  flameOuter: THREE.Mesh;
  flameCore: THREE.Mesh;
  haloSprite: THREE.Mesh;
  light: THREE.PointLight | null;
  phase: number;
}

/**
 * Builds the Grand 44m x 44m Two-Tier Medieval Bridge Citadel:
 * - Assembled from 23 official CC0 1.0 KayKit Dungeon Remastered 3D .glb modular models
 * - Tier 1 Lower Courtyard (y = 0.0m) with stone flagstones, central iron pit grates & towering columns
 * - Tier 2 Central Timber-and-Stone Skybridge & West/East Bastion Keeps (y = 4.0m)
 * - Four monumental wide stone staircases (stairs_wide.gltf.glb) connecting Tier 1 <-> Tier 2
 * - Two-story 8m perimeter castle walls, portcullis gatehouses, battlements, 3D banners, props & torches
 */
export class ArenaBuilder {
  public readonly group = new THREE.Group();
  public readonly torches: AnimatedTorch[] = [];

  private readonly fallbackGroup = new THREE.Group();
  private readonly glbSceneGroup = new THREE.Group();
  private readonly torchHolders: THREE.Group[] = [];
  private hazardRingLower: THREE.Mesh | null = null;
  private hazardRingBridge: THREE.Mesh | null = null;

  constructor(arena: ArenaConfig, mats: MaterialLibrary) {
    this.group.add(this.fallbackGroup);
    this.group.add(this.glbSceneGroup);

    // 1. Sub-grate molten dungeon pit & outer castle mountain/tower backdrop
    this.buildSubPitAndBackdrop(arena, mats);

    // 2. Clean instant base geometry while .glb assets stream in (~100ms)
    this.buildInstantFallbackShell(arena, mats);

    // 3. Spawn markers, animated torch flames/lights & Sudden-Death rings
    this.buildSpawns(arena, mats);
    this.buildTorchFlamesAndLights(arena);
    this.buildFinalPhaseRings();

    // 4. Populate full modular 3D KayKit Dungeon Remastered scene as soon as .glb cache is ready
    dungeonAssets.onReady(() => {
      this.populateKayKitModularCitadel(arena);
      this.fallbackGroup.visible = false;
    });
  }

  private buildSubPitAndBackdrop(
    arena: ArenaConfig,
    mats: MaterialLibrary
  ): void {
    // Deep dungeon abyss beneath the central iron floor grates
    const pitFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.MeshStandardMaterial({
        color: 0x16110e,
        emissive: 0x3a1405,
        emissiveIntensity: 0.45,
        roughness: 0.95,
      })
    );
    pitFloor.rotation.x = -Math.PI / 2;
    pitFloor.position.y = -1.05;
    this.group.add(pitFloor);

    // Warm under-grate glow beneath the Skybridge center
    const pitGlow = new THREE.PointLight(0xff5e1a, 5.5, 11.0, 1.6);
    pitGlow.position.set(0, -0.45, 0);
    this.group.add(pitGlow);

    // Outer castle corner watchtowers rising above the 8m curtain walls
    const towerCoords = [
      [-22.5, -22.5],
      [22.5, -22.5],
      [-22.5, 22.5],
      [22.5, 22.5],
    ];
    for (const [tx, tz] of towerCoords) {
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 3.6, 13.5, 12),
        mats.wallMat
      );
      tower.position.set(tx, 6.75, tz);
      tower.castShadow = true;
      tower.receiveShadow = true;
      this.group.add(tower);

      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(3.85, 4.4, 12),
        new THREE.MeshStandardMaterial({
          color: 0x3b485e,
          roughness: 0.78,
          metalness: 0.12,
        })
      );
      spire.position.set(tx, 15.6, tz);
      this.group.add(spire);
    }

    // Distant jagged mountain silhouette ring framing the horizon from the y=4m Skybridge
    const peakCount = 26;
    const peakMat = new THREE.MeshStandardMaterial({
      color: 0x5c534d,
      roughness: 0.96,
      flatShading: true,
    });
    for (let i = 0; i < peakCount; i++) {
      const ang = (i * Math.PI * 2) / peakCount;
      const dist = arena.radius + 24 + (i % 3) * 6;
      const h = 14 + ((i * 7) % 13);
      const r = 9 + (i % 4) * 2.5;
      const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), peakMat);
      peak.position.set(
        Math.cos(ang) * dist,
        h * 0.42 - 2.0,
        Math.sin(ang) * dist
      );
      peak.rotation.y = i * 0.9;
      this.group.add(peak);
    }
  }

  private buildInstantFallbackShell(
    arena: ArenaConfig,
    mats: MaterialLibrary
  ): void {
    const baseFloor = new THREE.Mesh(
      new THREE.BoxGeometry(45, 0.3, 45),
      mats.floorMat
    );
    baseFloor.position.y = -0.15;
    baseFloor.receiveShadow = true;
    this.fallbackGroup.add(baseFloor);

    // Fallback bridge & bastions
    for (const p of arena.platforms) {
      const w = p.maxX - p.minX;
      const d = p.maxZ - p.minZ;
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.35, d),
        p.id === 'bridge_center' ? mats.woodMat : mats.curbStoneMat
      );
      deck.position.set(
        (p.minX + p.maxX) * 0.5,
        p.topY - 0.175,
        (p.minZ + p.maxZ) * 0.5
      );
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.fallbackGroup.add(deck);
    }
  }

  /**
   * Instantiates the complete 2-Tier Castle & Skybridge from KayKit Dungeon Remastered .glb models.
   */
  private populateKayKitModularCitadel(arena: ArenaConfig): void {
    const H = arena.tierHeight; // 4.0m

    // =========================================================================
    // 1. TIER 1 COURTYARD FLOOR (11 x 11 grid of 4m x 4m .glb stone & grate tiles)
    // =========================================================================
    for (let gx = -20; gx <= 20; gx += 4) {
      for (let gz = -20; gz <= 20; gz += 4) {
        // Skip hidden interior footprints under solid West/East bastion bases
        if (Math.abs(gx) >= 12 && Math.abs(gx) <= 16 && Math.abs(gz) <= 4) {
          continue;
        }

        let key: DungeonAssetKey = 'floorStone';
        let rotY = (((gx * 3 + gz * 7) & 3) * Math.PI) / 2;

        if (Math.abs(gx) <= 4 && gz === 0) {
          // Dramatic iron dungeon grates directly beneath the Central Skybridge!
          key = 'floorGrate';
          rotY = 0;
        } else if (Math.abs(gx) === 20 && Math.abs(gz) >= 16) {
          key = 'floorStoneRocks';
        }

        const tile = dungeonAssets.instantiate(key, {
          x: gx,
          y: -0.04,
          z: gz,
          rotY,
          castShadow: false,
          receiveShadow: true,
        });
        if (tile) this.glbSceneGroup.add(tile);
      }
    }

    // =========================================================================
    // 2. TWO-STORY 8M PERIMETER CASTLE WALLS & GATEHOUSES (y = 0m & y = 4.0m)
    // =========================================================================
    const gridCoords = [-20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20];

    const addWallBay = (
      x: number,
      z: number,
      rotY: number,
      idx: number,
      isCenterGate: boolean
    ) => {
      // Lower story (y = 0..4m)
      const lowerKey: DungeonAssetKey = isCenterGate
        ? 'wallPortcullis'
        : idx % 3 === 1
        ? 'wallArched'
        : 'wallSolid';
      const lower = dungeonAssets.instantiate(lowerKey, {
        x,
        y: 0,
        z,
        rotY,
      });
      if (lower) this.glbSceneGroup.add(lower);

      // Upper story (y = 4..8m)
      const upperKey: DungeonAssetKey = isCenterGate
        ? 'wallWindowGated'
        : idx % 2 === 0
        ? 'wallWindowGated'
        : 'wallArched';
      const upper = dungeonAssets.instantiate(upperKey, {
        x,
        y: H,
        z,
        rotY,
      });
      if (upper) this.glbSceneGroup.add(upper);

      // Battlement parapet crowning y = 8.0m
      const crenel = dungeonAssets.instantiate('barrierColumn', {
        x,
        y: H * 2,
        z,
        rotY,
        castShadow: false,
      });
      if (crenel) this.glbSceneGroup.add(crenel);
    };

    gridCoords.forEach((c, idx) => {
      // North Wall (z = -22, facing +Z = 0)
      addWallBay(c, -22.0, 0, idx, c === 0);
      // South Wall (z = +22, facing -Z = PI)
      addWallBay(c, 22.0, Math.PI, idx, c === 0);
      // West Wall (x = -22, facing +X = PI/2)
      addWallBay(-22.0, c, Math.PI * 0.5, idx, false);
      // East Wall (x = +22, facing -X = -PI/2)
      addWallBay(22.0, c, -Math.PI * 0.5, idx, false);
    });

    // Wall Buttress Columns every 8m
    for (const c of [-14, -6, 6, 14]) {
      for (const storyY of [0, H]) {
        const pN = dungeonAssets.instantiate('pillarDecorated', {
          x: c,
          y: storyY,
          z: -21.4,
          rotY: 0,
        });
        const pS = dungeonAssets.instantiate('pillarDecorated', {
          x: c,
          y: storyY,
          z: 21.4,
          rotY: Math.PI,
        });
        if (pN) this.glbSceneGroup.add(pN);
        if (pS) this.glbSceneGroup.add(pS);
      }
    }

    // =========================================================================
    // 3. TIER 2 — WEST & EAST ELEVATED BASTION KEEPS (y = 4.0m)
    // =========================================================================
    for (const side of [-1, 1]) {
      const bastionCenterX = side * 14.0;
      const innerFaceX = side * 10.0;
      const outerFaceX = side * 18.0;
      const inwardRot = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const outwardRot = side < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

      // Upper walkable stone flagstone deck (x in [10..18], z in [-6..+6], y = 4.0m)
      for (const tx of [side * 12.0, side * 16.0]) {
        for (const tz of [-4.0, 0.0, 4.0]) {
          const deckTile = dungeonAssets.instantiate('floorStone', {
            x: tx,
            y: H - 0.05,
            z: tz,
            rotY: ((tx + tz) & 1) * (Math.PI * 0.5),
          });
          if (deckTile) this.glbSceneGroup.add(deckTile);
        }
      }

      // Solid stone arched walls forming the lower Bastion Keep (z = -4, 0, +4)
      for (const wz of [-4.0, 0.0, 4.0]) {
        const innerWall = dungeonAssets.instantiate(
          wz === 0 ? 'wallPortcullis' : 'wallArched',
          {
            x: innerFaceX + side * 0.45,
            y: 0,
            z: wz,
            rotY: inwardRot,
          }
        );
        const outerWall = dungeonAssets.instantiate('wallArched', {
          x: outerFaceX - side * 0.45,
          y: 0,
          z: wz,
          rotY: outwardRot,
        });
        if (innerWall) this.glbSceneGroup.add(innerWall);
        if (outerWall) this.glbSceneGroup.add(outerWall);
      }

      // Corner columns on each Bastion Keep
      for (const cz of [-5.6, 5.6]) {
        for (const cx of [innerFaceX + side * 0.4, outerFaceX - side * 0.4]) {
          const col = dungeonAssets.instantiate('pillarDecorated', {
            x: cx,
            y: 0,
            z: cz,
            rotY: inwardRot,
          });
          if (col) this.glbSceneGroup.add(col);
        }
      }

      // Upper Bastion outer back balustrades (y = 4.0m, matching bastion_rail_west / east)
      for (const rz of [-4.0, 0.0, 4.0]) {
        const backRail = dungeonAssets.instantiate('barrierColumn', {
          x: side * 17.85,
          y: H,
          z: rz,
          rotY: inwardRot,
        });
        if (backRail) this.glbSceneGroup.add(backRail);
      }

      // Royal Golden Chest & Heraldic Crest atop each Bastion Keep!
      const chest = dungeonAssets.instantiate('chestGold', {
        x: side * 16.6,
        y: H + 0.16,
        z: 0.0,
        rotY: inwardRot,
      });
      if (chest) this.glbSceneGroup.add(chest);

      const crest = dungeonAssets.instantiate('swordShieldGold', {
        x: innerFaceX - side * 0.08,
        y: 2.8,
        z: 0.0,
        rotY: inwardRot,
      });
      if (crest) this.glbSceneGroup.add(crest);

      // =======================================================================
      // 4. FOUR MONUMENTAL WIDE STONE STAIRCASES (stairs_wide.gltf.glb)
      // Ascending smoothly from Courtyard (y = 0m, |z| = 10m) -> Bastions (y = 4m, |z| = 6m)
      // =======================================================================
      // South Staircase (local z=+4 at y=0 -> z=0 at y=4, so rotY = 0 placed at z = +6.0!)
      const stairsSouth = dungeonAssets.instantiate('stairsWide', {
        x: bastionCenterX,
        y: 0,
        z: 6.0,
        rotY: 0,
      });
      if (stairsSouth) this.glbSceneGroup.add(stairsSouth);

      // North Staircase (rotated PI so local z=+4 lands at z = -10.0 y=0 -> z = -6.0 y=4!)
      const stairsNorth = dungeonAssets.instantiate('stairsWide', {
        x: bastionCenterX,
        y: 0,
        z: -6.0,
        rotY: Math.PI,
      });
      if (stairsNorth) this.glbSceneGroup.add(stairsNorth);
    }

    // =========================================================================
    // 5. TIER 2 — CENTRAL 20M WALK-OVER / WALK-UNDER SKYBRIDGE (y = 4.0m)
    // =========================================================================
    // Heavy Timber & Iron Bridge Deck (x in [-10..+10], z in [-4..+4], y = 4.0m)
    for (const bx of [-8.0, -4.0, 0.0, 4.0, 8.0]) {
      for (const bz of [-2.0, 2.0]) {
        const woodDeck = dungeonAssets.instantiate('floorWood', {
          x: bx,
          y: H - 0.05,
          z: bz,
          rotY: 0,
        });
        if (woodDeck) this.glbSceneGroup.add(woodDeck);
      }
    }

    // Architectural Bridge Fascia Scaffold Beams high along z = +-3.75 (open walk-under clearance!)
    for (const bx of [-8.0, -4.0, 0.0, 4.0, 8.0]) {
      for (const bz of [-3.72, 3.72]) {
        // Flip scaffold upside-down / elevated as timber bridge arch spandrel leaving y=0..3.1m wide open!
        const beam = dungeonAssets.instantiate('barrierWood', {
          x: bx,
          y: H - 0.95,
          z: bz,
          rotY: bz < 0 ? 0 : Math.PI,
          scaleY: 0.85,
        });
        if (beam) this.glbSceneGroup.add(beam);
      }
    }

    // Skybridge Upper Parapet Railings (matching bridge_rail_nw/ne/sw/se, leaving x in [-2.2..+2.2] OPEN!)
    for (const bz of [-3.85, 3.85]) {
      const rot = bz < 0 ? 0 : Math.PI;
      for (const rx of [-8.0, -4.15, 4.15, 8.0]) {
        const rail = dungeonAssets.instantiate('barrierColumn', {
          x: rx,
          y: H,
          z: bz,
          rotY: rot,
        });
        if (rail) this.glbSceneGroup.add(rail);
      }
    }

    // =========================================================================
    // 6. COURTYARD & BRIDGE STONE PILLARS (1:1 with ARENA_CONFIG.circles)
    // =========================================================================
    for (const c of arena.circles) {
      const stories = c.height > 5.0 ? [0, H] : [0];
      for (const py of stories) {
        const col = dungeonAssets.instantiate('pillarDecorated', {
          x: c.x,
          y: py,
          z: c.z,
          rotY: c.z < 0 ? 0 : Math.PI,
          scaleX: 0.88,
          scaleZ: 0.88,
        });
        if (col) this.glbSceneGroup.add(col);
      }
    }

    // =========================================================================
    // 7. COURTYARD 3D BARRIERS, CRATES & BARRELS (1:1 with ARENA_CONFIG.boxes)
    // =========================================================================
    for (const box of arena.boxes) {
      if (box.kind === 'wood_barrier') {
        const bar = dungeonAssets.instantiate('barrierWood', {
          x: box.x,
          y: box.minY ?? 0,
          z: box.z,
          rotY: box.rotationY,
        });
        if (bar) this.glbSceneGroup.add(bar);
      } else if (box.kind === 'crate_stack') {
        const crates = dungeonAssets.instantiate('cratesStacked', {
          x: box.x - 0.55,
          y: box.minY ?? 0,
          z: box.z,
          rotY: box.rotationY,
        });
        const barrel = dungeonAssets.instantiate('barrelDecorated', {
          x: box.x + 0.85,
          y: box.minY ?? 0,
          z: box.z + 0.15,
          rotY: 0.4,
        });
        if (crates) this.glbSceneGroup.add(crates);
        if (barrel) this.glbSceneGroup.add(barrel);
      }
    }

    // Decorative Corner Barrel Clusters near Gatehouses (outside combat lanes)
    for (const [bx, bz] of [
      [-19.8, -19.8],
      [19.8, -19.8],
      [-19.8, 19.8],
      [19.8, 19.8],
    ]) {
      const brl = dungeonAssets.instantiate('barrelDecorated', {
        x: bx,
        y: 0,
        z: bz,
        rotY: Math.atan2(-bx, -bz),
      });
      if (brl) this.glbSceneGroup.add(brl);
    }

    // =========================================================================
    // 8. 3D MOUNTED TORCHES & HERALDIC SHIELD BANNERS
    // =========================================================================
    arena.torches.forEach((_t, idx) => {
      const holder = this.torchHolders[idx];
      if (!holder) return;
      const sconce = dungeonAssets.instantiate('torchMounted', {
        x: 0,
        y: 0,
        z: 0,
        rotY: 0,
        castShadow: false,
      });
      if (sconce) holder.add(sconce);
    });

    const bannerKeys: DungeonAssetKey[] = [
      'bannerShieldRed',
      'bannerShieldBlue',
      'bannerShieldYellow',
      'bannerShieldGreen',
      'bannerPatternYellow',
    ];
    arena.banners.forEach((b, idx) => {
      const bKey = bannerKeys[idx % bannerKeys.length];
      const bannerObj = dungeonAssets.instantiate(bKey, {
        x: b.x,
        y: b.y - 2.1,
        z: b.z,
        rotY: b.inwardAngle,
        castShadow: false,
      });
      if (bannerObj) this.glbSceneGroup.add(bannerObj);
    });
  }

  private buildSpawns(arena: ArenaConfig, mats: MaterialLibrary): void {
    const ringGeo = new THREE.RingGeometry(0.68, 0.92, 24);
    ringGeo.rotateX(-Math.PI / 2);

    for (const sp of arena.spawns) {
      const sy = (sp.y ?? 0) + 0.04;
      const ring = new THREE.Mesh(ringGeo, mats.bronzeTrimMat);
      ring.position.set(sp.x, sy, sp.z);
      this.group.add(ring);
    }
  }

  private buildTorchFlamesAndLights(arena: ArenaConfig): void {
    const flameOuterMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.3, 1.05, 0.25),
      toneMapped: false,
    });
    const flameCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.6, 2.25, 1.3),
      toneMapped: false,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.4, 0.65, 0.15),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const outerGeo = new THREE.ConeGeometry(0.16, 0.46, 7);
    const coreGeo = new THREE.ConeGeometry(0.09, 0.28, 6);
    const haloGeo = new THREE.PlaneGeometry(0.85, 0.85);

    arena.torches.forEach((t, idx) => {
      const holder = new THREE.Group();
      holder.position.set(t.x, t.y, t.z);
      holder.rotation.y = t.inwardAngle;
      this.group.add(holder);
      this.torchHolders.push(holder);

      // Matches KayKit torch_mounted.gltf.glb cup position (0, 0.68, 0.45)
      const flameOuter = new THREE.Mesh(outerGeo, flameOuterMat);
      flameOuter.position.set(0, 0.82, 0.45);
      holder.add(flameOuter);

      const flameCore = new THREE.Mesh(coreGeo, flameCoreMat);
      flameCore.position.set(0, 0.78, 0.45);
      holder.add(flameCore);

      const haloSprite = new THREE.Mesh(haloGeo, haloMat);
      haloSprite.position.set(0, 0.84, 0.45);
      holder.add(haloSprite);

      // Attach PointLights strategically (all 4 Skybridge center torches + every 3rd perimeter torch)
      const isBridgeTorch = Math.abs(t.z) < 8;
      let light: THREE.PointLight | null = null;
      if (isBridgeTorch || idx % 3 === 0) {
        light = new THREE.PointLight(
          0xff9b3d,
          isBridgeTorch ? 6.5 : 4.8,
          isBridgeTorch ? 13.0 : 11.5,
          1.6
        );
        light.position.set(0, 0.95, 0.55);
        holder.add(light);
      }

      this.torches.push({
        flameOuter,
        flameCore,
        haloSprite,
        light,
        phase: idx * 1.37,
      });
    });
  }

  private buildFinalPhaseRings(): void {
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 0.38, 0.12),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const lowerGeo = new THREE.RingGeometry(16.25, 16.65, 64);
    lowerGeo.rotateX(-Math.PI / 2);
    this.hazardRingLower = new THREE.Mesh(lowerGeo, ringMat);
    this.hazardRingLower.position.y = 0.06;
    this.hazardRingLower.visible = false;
    this.group.add(this.hazardRingLower);

    const bridgeGeo = new THREE.RingGeometry(16.25, 16.65, 64);
    bridgeGeo.rotateX(-Math.PI / 2);
    this.hazardRingBridge = new THREE.Mesh(bridgeGeo, ringMat);
    this.hazardRingBridge.position.y = 4.06;
    this.hazardRingBridge.visible = false;
    this.group.add(this.hazardRingBridge);
  }

  public update(elapsed: number, isFinalPhase: boolean): void {
    for (const t of this.torches) {
      const flicker =
        1.0 +
        Math.sin(elapsed * 13.5 + t.phase) * 0.14 +
        Math.cos(elapsed * 23.0 + t.phase * 1.7) * 0.08;
      t.flameOuter.scale.set(
        0.92 + flicker * 0.08,
        flicker,
        0.92 + flicker * 0.08
      );
      t.flameCore.scale.setScalar(0.88 + flicker * 0.12);
      t.haloSprite.rotation.z = elapsed * 0.6 + t.phase;
      if (t.light) {
        t.light.intensity = 5.2 * flicker;
      }
    }

    if (this.hazardRingLower && this.hazardRingBridge) {
      this.hazardRingLower.visible = isFinalPhase;
      this.hazardRingBridge.visible = isFinalPhase;
      if (isFinalPhase) {
        const mat = this.hazardRingLower.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.48 + Math.sin(elapsed * 6.0) * 0.22;
      }
    }
  }
}
