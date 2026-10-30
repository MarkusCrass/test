import * as THREE from 'three';
import { ArenaConfig } from '../config/arenaConfig';
import { ArenaThemeId, getArenaThemeMeta } from '../config/settings';
import { ArenaFireSystem } from './ArenaFireSystem';
import { arenaProps } from './ArenaPropCache';
import { DungeonAssetKey, dungeonAssets } from './DungeonAssetCache';
import { MaterialLibrary } from './PixelTextures';

/**
 * Builds the Grand 44m x 44m Two-Tier Medieval Bridge Citadel:
 * - Tier 1 Lower Courtyard (y = 0.0m) with stone flagstones, central molten-fire iron pit grates & columns
 * - Tier 2 Central Timber-and-Stone Skybridge & West/East Bastion Keeps (y = 4.0m)
 * - Four monumental wide stone staircases (stairs_wide.gltf.glb) connecting Tier 1 <-> Tier 2
 * - 60+ CC0 3D .glb architectural, fire, brazier, campfire, cauldron, forge, chain, siege & forest assets
 * - Real-time GLSL 3D sculpted flames (`fire_mesh.glb`), volumetric flame sheets & 240 rising embers
 */
export class ArenaBuilder {
  public readonly group = new THREE.Group();
  public readonly fireSystem = new ArenaFireSystem();

  private readonly fallbackGroup = new THREE.Group();
  private readonly fallbackTowersGroup = new THREE.Group();
  private readonly glbSceneGroup = new THREE.Group();
  private readonly floorTilesGroup = new THREE.Group();
  private readonly propsSceneGroup = new THREE.Group();
  private readonly torchHolders: THREE.Group[] = [];
  private readonly arena: ArenaConfig;
  private readonly materials: MaterialLibrary;
  private currentTheme: ArenaThemeId = 'oak_tournament';
  private citadelPopulated = false;
  private hazardRingLower: THREE.Mesh | null = null;
  private hazardRingBridge: THREE.Mesh | null = null;

  constructor(
    arena: ArenaConfig,
    mats: MaterialLibrary,
    initialTheme: ArenaThemeId = 'oak_tournament'
  ) {
    this.arena = arena;
    this.materials = mats;
    this.currentTheme = initialTheme;

    this.group.add(this.fallbackGroup);
    this.group.add(this.fallbackTowersGroup);
    this.glbSceneGroup.add(this.floorTilesGroup);
    this.group.add(this.glbSceneGroup);
    this.group.add(this.propsSceneGroup);
    this.group.add(this.fireSystem.group);

    this.applyThemeMaterials(initialTheme);

    // 1. Sub-grate molten inferno pit & distant mountain horizon
    this.buildSubPitAndBackdrop(arena, mats);

    // 2. Clean instant base geometry while .glb assets stream in (~100ms)
    this.buildInstantFallbackShell(arena, mats);

    // 3. Spawn markers, 3D wall torch flames/lights & Sudden-Death rings
    this.buildSpawns(arena, mats);
    this.buildTorchFlamesAndLights(arena);
    this.buildFinalPhaseRings();

    // 4. Populate full modular 3D KayKit Dungeon Remastered citadel
    dungeonAssets.onReady(() => {
      this.citadelPopulated = true;
      this.populateKayKitModularCitadel(arena);
      this.rebuildThemedFloorTiles(arena);
      this.fallbackGroup.visible = false;
    });

    // 5. Populate 3D fire braziers, bonfires, cauldrons, chains, forges, 3D watchtowers, siege engines & pines
    arenaProps.onReady(() => {
      if (arenaProps.flameGeometry3D) {
        this.fireSystem.applySculptedFlameGeometry(arenaProps.flameGeometry3D);
      }
      this.populateCitadelFireSiegeAndProps(arena);
      this.fallbackTowersGroup.visible = false;
    });
  }

  private buildSubPitAndBackdrop(
    arena: ArenaConfig,
    mats: MaterialLibrary
  ): void {
    // Deep glowing ember abyss beneath the central iron floor grates
    const pitFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a0e09,
        emissive: 0x5c1c05,
        emissiveIntensity: 0.65,
        roughness: 0.92,
      })
    );
    pitFloor.rotation.x = -Math.PI / 2;
    pitFloor.position.y = -1.02;
    this.group.add(pitFloor);

    // Three roaring 3D sub-grate inferno fires + rising embers drifting right through the central iron grates!
    for (const gx of [-4.0, 0.0, 4.0]) {
      this.fireSystem.createFire({
        parent: this.group,
        x: gx,
        y: -0.96,
        z: 0,
        preset: 'pit_inferno',
        withLight: gx === 0,
        lightColor: 0xff5a14,
        lightIntensity: 8.5,
        lightDistance: 13.5,
        worldEmberOrigin: { x: gx, y: -0.25, z: 0 },
      });
    }

    // Instant fallback corner watchtowers (replaced seamlessly once 3D castle/tower_*.glb loads)
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
      this.fallbackTowersGroup.add(tower);

      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(3.85, 4.4, 12),
        new THREE.MeshStandardMaterial({
          color: 0x3b485e,
          roughness: 0.78,
          metalness: 0.12,
        })
      );
      spire.position.set(tx, 15.6, tz);
      this.fallbackTowersGroup.add(spire);
    }

    // Distant jagged mountain silhouette ring framing the horizon beyond the 3D pine forest
    const peakCount = 26;
    const peakMat = new THREE.MeshStandardMaterial({
      color: 0x5c534d,
      roughness: 0.96,
      flatShading: true,
    });
    for (let i = 0; i < peakCount; i++) {
      const ang = (i * Math.PI * 2) / peakCount;
      const dist = arena.radius + 32 + (i % 3) * 7;
      const h = 16 + ((i * 7) % 14);
      const r = 10 + (i % 4) * 2.8;
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

  public getTheme(): ArenaThemeId {
    return this.currentTheme;
  }

  public setTheme(theme: ArenaThemeId): void {
    if (this.currentTheme === theme && this.floorTilesGroup.children.length > 0) {
      this.applyThemeMaterials(theme);
      return;
    }
    this.currentTheme = theme;
    this.applyThemeMaterials(theme);
    if (this.citadelPopulated && dungeonAssets.isReady) {
      this.rebuildThemedFloorTiles(this.arena);
    }
  }

  private applyThemeMaterials(theme: ArenaThemeId): void {
    const meta = getArenaThemeMeta(theme);
    this.materials.applyArenaTheme(theme);
    dungeonAssets.setMasonryTint(meta.masonryTintHex, meta.masonryRoughness);
  }

  /**
   * Rebuilds Tier 1 Courtyard, Tier 2 Bastion Keeps, and Central Skybridge floor tiles
   * according to the active ArenaThemeId (Oak/Dark-Oak Timber, Golden Sandstone/Earth,
   * Royal Sapphire Marble + Dark Oak, or Dark Obsidian Citadel).
   */
  private rebuildThemedFloorTiles(arena: ArenaConfig): void {
    this.floorTilesGroup.clear();
    const H = arena.tierHeight;
    const theme = this.currentTheme;

    // 1. Tier 1 Courtyard 11x11 Floor Grid (4m x 4m modular 3D tiles)
    for (let gx = -20; gx <= 20; gx += 4) {
      for (let gz = -20; gz <= 20; gz += 4) {
        if (Math.abs(gx) >= 12 && Math.abs(gx) <= 16 && Math.abs(gz) <= 4) {
          continue;
        }

        const ix = Math.round(gx / 4);
        const iz = Math.round(gz / 4);
        const checker = (ix + iz) & 1;
        const isOuterBorder = Math.abs(gx) === 20 || Math.abs(gz) === 20;

        let key: DungeonAssetKey = 'floorStone';
        let rotY = (((gx * 3 + gz * 7) & 3) * Math.PI) / 2;
        let tileY = -0.04;

        if (Math.abs(gx) <= 4 && gz === 0) {
          key = 'floorGrate';
          rotY = 0;
        } else if (theme === 'oak_tournament') {
          if (isOuterBorder && Math.abs(gx) === 20 && Math.abs(gz) === 20) {
            key = 'floorStone';
          } else {
            // Parquet oak & dark-walnut timber tournament floor!
            key = checker === 0 ? 'floorWood' : 'floorWoodDark';
            rotY = checker === 0 ? 0 : Math.PI * 0.5;
            tileY = -0.042;
          }
        } else if (theme === 'sandstone_colosseum') {
          if (isOuterBorder) {
            key = 'floorStone';
          } else {
            // Packed tournament earth/sand ring framed by golden sandstone!
            key = 'floorDirt';
            tileY = -0.095;
          }
        } else if (theme === 'azure_marble') {
          if ((gx === 0 || gz === 0) && !isOuterBorder) {
            key = 'floorWoodDark';
            rotY = gx === 0 ? Math.PI * 0.5 : 0;
            tileY = -0.042;
          } else {
            key = 'floorStone';
          }
        } else {
          // 'obsidian_citadel'
          if (
            (Math.abs(gx) === 20 && Math.abs(gz) >= 16) ||
            (Math.abs(gz) === 20 && Math.abs(gx) === 12)
          ) {
            key = 'floorStoneRocks';
          } else {
            key = 'floorStone';
          }
        }

        const tile = dungeonAssets.instantiate(key, {
          x: gx,
          y: tileY,
          z: gz,
          rotY,
          castShadow: false,
          receiveShadow: true,
        });
        if (tile) this.floorTilesGroup.add(tile);
      }
    }

    // 2. Tier 2 West & East Bastion Keep Decks (y = 4.0m)
    const bastionKey: DungeonAssetKey =
      theme === 'oak_tournament' || theme === 'azure_marble'
        ? 'floorWoodDark'
        : theme === 'sandstone_colosseum'
        ? 'floorWood'
        : 'floorStone';

    for (const side of [-1, 1]) {
      for (const tx of [side * 12.0, side * 16.0]) {
        for (const tz of [-4.0, 0.0, 4.0]) {
          const deckTile = dungeonAssets.instantiate(bastionKey, {
            x: tx,
            y: H - 0.042,
            z: tz,
            rotY:
              bastionKey === 'floorStone'
                ? ((tx + tz) & 1) * (Math.PI * 0.5)
                : Math.PI * 0.5,
            scaleX: 0.998,
            scaleZ: 0.998,
          });
          if (deckTile) this.floorTilesGroup.add(deckTile);
        }
      }
    }

    // 3. Tier 2 Central 20m Walk-Over / Walk-Under Skybridge Deck (y = 4.0m)
    const bridgeKey: DungeonAssetKey =
      theme === 'azure_marble' || theme === 'obsidian_citadel'
        ? 'floorWoodDark'
        : 'floorWood';

    for (const bx of [-8.0, -4.0, 0.0, 4.0, 8.0]) {
      for (const bz of [-2.0, 2.0]) {
        const woodDeck = dungeonAssets.instantiate(bridgeKey, {
          x: bx,
          y: H - 0.035,
          z: bz,
          rotY: 0,
          scaleX: 0.998,
          scaleZ: 0.998,
        });
        if (woodDeck) this.floorTilesGroup.add(woodDeck);
      }
    }
  }

  /**
   * Instantiates the complete 2-Tier Castle & Skybridge from KayKit Dungeon Remastered .glb models.
   * (Swappable floor & deck tiles are managed by `rebuildThemedFloorTiles`.)
   */
  private populateKayKitModularCitadel(arena: ArenaConfig): void {
    const H = arena.tierHeight; // 4.0m

    // =========================================================================
    // 2. TWO-STORY 8M PERIMETER CASTLE WALLS & GATEHOUSES (with weathered cracked bays!)
    // =========================================================================
    const gridCoords = [-20, -16, -12, -8, -4, 0, 4, 8, 12, 16, 20];

    const addWallBay = (
      x: number,
      z: number,
      rotY: number,
      idx: number,
      isCenterGate: boolean
    ) => {
      const lowerKey: DungeonAssetKey = isCenterGate
        ? 'wallPortcullis'
        : idx % 4 === 2
        ? 'wallCracked'
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

      const upperKey: DungeonAssetKey = isCenterGate
        ? 'wallWindowGated'
        : idx % 5 === 3
        ? 'wallCracked'
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
      addWallBay(c, -22.0, 0, idx, c === 0);
      addWallBay(c, 22.0, Math.PI, idx, c === 0);
      addWallBay(-22.0, c, Math.PI * 0.5, idx, false);
      addWallBay(22.0, c, -Math.PI * 0.5, idx, false);
    });

    // Grand Royal Triple-Pennant Tapestries crowning North & South Gatehouses + Battle Crests
    for (const [gx, gz, grot, bKey] of [
      [0, -21.35, 0, 'bannerTripleRed'],
      [0, 21.35, Math.PI, 'bannerTripleBlue'],
      [-21.35, 0, Math.PI * 0.5, 'bannerTripleRed'],
      [21.35, 0, -Math.PI * 0.5, 'bannerTripleBlue'],
    ] as const) {
      const tap = dungeonAssets.instantiate(bKey, {
        x: gx,
        y: 4.35,
        z: gz,
        rotY: grot,
        castShadow: false,
      });
      if (tap) this.glbSceneGroup.add(tap);
    }

    // Standing 3D Iron Torches (`torch_unlit.gltf.glb`) + Live Volumetric Flames flanking Gatehouses
    for (const sideZ of [-1, 1]) {
      const rot = sideZ < 0 ? 0 : Math.PI;
      const wallZ = sideZ * 21.35;
      for (const sx of [-2.35, 2.35]) {
        const torchZ = wallZ - sideZ * 0.24;
        const litTorch = dungeonAssets.instantiate('torchLit', {
          x: sx,
          y: 2.35,
          z: torchZ,
          rotY: rot,
          castShadow: false,
        });
        if (litTorch) this.glbSceneGroup.add(litTorch);

        this.fireSystem.createFire({
          parent: this.group,
          x: sx,
          y: 2.91,
          z: torchZ,
          preset: 'torch',
          withLight: false,
        });

        const brokenCrest = dungeonAssets.instantiate('swordShieldBroken', {
          x: sx * 3.4,
          y: 2.65,
          z: wallZ,
          rotY: rot,
          castShadow: false,
        });
        if (brokenCrest) this.glbSceneGroup.add(brokenCrest);
      }
    }

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
    // 3. TIER 2 — WEST & EAST ELEVATED BASTION KEEPS (y = 4.0m) + TREASURE & CANDLES
    // =========================================================================
    for (const side of [-1, 1]) {
      const bastionCenterX = side * 14.0;
      const innerFaceX = side * 10.0;
      const outerFaceX = side * 18.0;
      const inwardRot = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const outwardRot = side < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;

      // Tuck lower walls & corner columns 3cm inside the 15cm upper floor slab (top = 3.88m < 4.008m)
      // so there is ZERO Z-fighting flicker on the upper platform edges AND zero gap from below!
      for (const wz of [-4.0, 0.0, 4.0]) {
        const innerWall = dungeonAssets.instantiate(
          wz === 0 ? 'wallPortcullis' : 'wallArched',
          {
            x: innerFaceX + side * 0.52,
            y: -0.02,
            z: wz,
            rotY: inwardRot,
            scaleY: 0.975,
          }
        );
        const outerWall = dungeonAssets.instantiate('wallArched', {
          x: outerFaceX - side * 0.52,
          y: -0.02,
          z: wz,
          rotY: outwardRot,
          scaleY: 0.975,
        });
        if (innerWall) this.glbSceneGroup.add(innerWall);
        if (outerWall) this.glbSceneGroup.add(outerWall);
      }

      for (const cz of [-5.55, 5.55]) {
        for (const cx of [innerFaceX + side * 0.5, outerFaceX - side * 0.5]) {
          const col = dungeonAssets.instantiate('pillarDecorated', {
            x: cx,
            y: -0.02,
            z: cz,
            rotY: inwardRot,
            scaleY: 0.975,
          });
          if (col) this.glbSceneGroup.add(col);
        }
      }

      for (const rz of [-4.0, 0.0, 4.0]) {
        const backRail = dungeonAssets.instantiate('barrierColumn', {
          x: side * 17.85,
          y: H + 0.01,
          z: rz,
          rotY: inwardRot,
          scaleX: 0.985,
        });
        if (backRail) this.glbSceneGroup.add(backRail);
      }

      // Inner wing parapets smoothly framing the 12m Bastion -> 8m Skybridge transition (matches bastion_wing_*)
      for (const wz of [-5.02, 5.02]) {
        const wingRail = dungeonAssets.instantiate('barrierColumn', {
          x: side * 10.05,
          y: H + 0.01,
          z: wz,
          rotY: inwardRot,
          scaleX: 0.48,
        });
        if (wingRail) this.glbSceneGroup.add(wingRail);
      }

      // Royal Golden Chest + Gleaming Coin Hoards + Dripping Lit Wax Candles atop each Bastion!
      const chest = dungeonAssets.instantiate('chestGold', {
        x: side * 16.65,
        y: H + 0.02,
        z: 0.0,
        rotY: inwardRot,
      });
      if (chest) this.glbSceneGroup.add(chest);

      for (const cz of [-1.45, 1.45]) {
        const coins = dungeonAssets.instantiate('coinStackLarge', {
          x: side * 16.75,
          y: H + 0.02,
          z: cz,
          rotY: cz > 0 ? 0.6 : -0.5,
          scaleX: 0.72,
          scaleY: 0.72,
          scaleZ: 0.72,
          castShadow: false,
        });
        if (coins) this.glbSceneGroup.add(coins);

        const candles = dungeonAssets.instantiate('candleTriple', {
          x: side * 17.25,
          y: H + 1.38,
          z: cz * 1.45,
          rotY: inwardRot,
          scaleX: 0.75,
          scaleY: 0.75,
          scaleZ: 0.75,
          castShadow: false,
        });
        if (candles) this.glbSceneGroup.add(candles);

        this.fireSystem.createFire({
          parent: this.group,
          x: side * 17.25,
          y: H + 2.02,
          z: cz * 1.45,
          preset: 'candle',
          withLight: false,
        });
      }

      const crest = dungeonAssets.instantiate('swordShieldGold', {
        x: innerFaceX - side * 0.08,
        y: 2.8,
        z: 0.0,
        rotY: inwardRot,
      });
      if (crest) this.glbSceneGroup.add(crest);

      // Four Monumental Wide Stone Staircases (y = -0.022 eliminates coplanar Z-fighting at z = +-6.0!)
      const stairsSouth = dungeonAssets.instantiate('stairsWide', {
        x: bastionCenterX,
        y: -0.022,
        z: 6.0,
        rotY: 0,
      });
      if (stairsSouth) this.glbSceneGroup.add(stairsSouth);

      const stairsNorth = dungeonAssets.instantiate('stairsWide', {
        x: bastionCenterX,
        y: -0.022,
        z: -6.0,
        rotY: Math.PI,
      });
      if (stairsNorth) this.glbSceneGroup.add(stairsNorth);
    }

    // =========================================================================
    // 5. TIER 2 — CENTRAL 20M WALK-OVER / WALK-UNDER SKYBRIDGE (y = 4.0m)
    // =========================================================================
    // (Skybridge woodDeck tiles are placed by rebuildThemedFloorTiles so themes can swap Oak / Dark Oak!)

    // Under-bridge timber spandrel beams tucked cleanly beneath the wood deck (maxY = 3.84m < 3.865m!)
    for (const bx of [-8.0, -4.0, 0.0, 4.0, 8.0]) {
      for (const bz of [-3.62, 3.62]) {
        const beam = dungeonAssets.instantiate('barrierWood', {
          x: bx,
          y: H - 1.12,
          z: bz,
          rotY: bz < 0 ? 0 : Math.PI,
          scaleX: 0.985,
          scaleY: 0.87,
        });
        if (beam) this.glbSceneGroup.add(beam);
      }
    }

    // Non-overlapping Skybridge Parapet Railings (scaleX = 0.95 prevents Z-fighting at x = +-6.0!)
    for (const bz of [-3.92, 3.92]) {
      const rot = bz < 0 ? 0 : Math.PI;
      for (const rx of [-8.0, -4.1, 4.1, 8.0]) {
        const rail = dungeonAssets.instantiate('barrierColumn', {
          x: rx,
          y: H + 0.015,
          z: bz,
          rotY: rot,
          scaleX: 0.95,
        });
        if (rail) this.glbSceneGroup.add(rail);
      }
    }

    // =========================================================================
    // 6. COURTYARD & BRIDGE STONE PILLARS (1:1 with ARENA_CONFIG.circles)
    // =========================================================================
    for (const c of arena.circles) {
      const isTall = c.height > 5.0;
      const stories = isTall ? [0, H] : [-0.02];
      for (const py of stories) {
        const col = dungeonAssets.instantiate('pillarDecorated', {
          x: c.x,
          y: py,
          z: c.z,
          rotY: c.z < 0 ? 0 : Math.PI,
          scaleX: 0.88,
          scaleY: isTall ? 1.0 : 0.97,
          scaleZ: 0.88,
        });
        if (col) this.glbSceneGroup.add(col);
      }
    }

    // =========================================================================
    // 7. COURTYARD 3D BARRIERS, CRATES, BARRELS, KEGS & STONE RUBBLE
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
        const candleOnCrate = dungeonAssets.instantiate('candleLit', {
          x: box.x + 0.85,
          y: (box.minY ?? 0) + 2.52,
          z: box.z + 0.15,
          rotY: 0.2,
          scaleX: 0.58,
          scaleY: 0.58,
          scaleZ: 0.58,
          castShadow: false,
        });
        if (crates) this.glbSceneGroup.add(crates);
        if (barrel) this.glbSceneGroup.add(barrel);
        if (candleOnCrate) this.glbSceneGroup.add(candleOnCrate);
      }
    }

    // Corner Armory Kegs & Fallen Stone Rubble Clusters (strictly along outer perimeter |x|,|z| >= 19.6m)
    for (const [kx, kz, krot] of [
      [-19.5, -19.6, Math.PI * 0.25],
      [19.5, -19.6, -Math.PI * 0.25],
      [-19.5, 19.6, Math.PI * 0.75],
      [19.5, 19.6, -Math.PI * 0.75],
    ]) {
      const keg = dungeonAssets.instantiate('kegDecorated', {
        x: kx,
        y: 0,
        z: kz,
        rotY: krot,
        scaleX: 0.76,
        scaleY: 0.76,
        scaleZ: 0.76,
      });
      if (keg) this.glbSceneGroup.add(keg);
    }

    for (const [rx, rz, rrot] of [
      [-15.8, -20.6, 0.15],
      [15.8, -20.6, -0.2],
      [-15.8, 20.6, Math.PI - 0.15],
      [15.8, 20.6, Math.PI + 0.2],
    ]) {
      const rub = dungeonAssets.instantiate('rubbleHalf', {
        x: rx,
        y: 0,
        z: rz,
        rotY: rrot,
        scaleX: 0.52,
        scaleY: 0.46,
        scaleZ: 0.52,
        castShadow: false,
      });
      if (rub) this.glbSceneGroup.add(rub);
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

  /**
   * Instantiates 26 new CC0 3D models:
   * - Wrought-iron standing fire braziers (`fire_brazier.glb` + `border_pillar.glb`) + GLSL 3D fire & sparks
   * - Courtyard stone-ring bonfires (`campfire_flames.glb`, `fire_mesh.glb`, `campfire.glb`) & iron cauldrons (`cauldron.glb`)
   * - Courtyard blacksmith anvils & grindstones (`anvil.glb`, `grindstone.glb`), carved stone altars (`altar_stone.glb`), obelisks (`pillar_obelisk.glb`)
   * - Hanging wrought-iron Skybridge chains & candle lanterns (`dungeon_chain.glb`, `lantern_candle.glb`)
   * - Full 3D castle corner watchtowers, waving flags/pennants, rooftop ballistas, outer trebuchets, catapults, pavilions & pine forest!
   */
  private populateCitadelFireSiegeAndProps(arena: ArenaConfig): void {
    const H = arena.tierHeight;

    const spawnStandingBrazier = (
      x: number,
      y: number,
      z: number,
      withLight: boolean
    ) => {
      // Carved octagonal stone column (`column_large.glb`: 0.38m wide x 1.10m tall)
      const ped = arenaProps.instantiate('brazierPedestal', {
        x,
        y,
        z,
        scaleX: 1.62,
        scaleY: 1.24,
        scaleZ: 1.62,
      });
      const bowl = arenaProps.instantiate('fireBrazierBowl', {
        x,
        y: y + 1.34,
        z,
        scaleX: 3.7,
        scaleY: 3.7,
        scaleZ: 3.7,
      });
      if (ped) this.propsSceneGroup.add(ped);
      if (bowl) this.propsSceneGroup.add(bowl);

      this.fireSystem.createFire({
        parent: this.group,
        x,
        y: y + 1.56,
        z,
        preset: 'brazier',
        withLight,
        lightIntensity: 7.8,
        lightDistance: 14.5,
        worldEmberOrigin: { x, y: y + 1.72, z },
      });
    };

    // 1. Eight Monumental Wrought-Iron Fire Braziers (4 Courtyard Stair Approaches + 4 Upper Bastion Overlooks)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        // Courtyard outer stair flank (safely clear of stair width x in [10..18])
        spawnStandingBrazier(sx * 19.35, 0.01, sz * 11.1, sz > 0);
        // Upper Bastion Keep overlook corners (y = 4.015m — clear of floorStone at 4.008m!)
        spawnStandingBrazier(sx * 17.15, H + 0.015, sz * 5.15, false);
      }
    }

    // 2. Four Roaring Courtyard Perimeter Bonfires & Boiling Iron Cauldrons (along North & South curtain walls)
    for (const [bx, bz, hasCauldron, hearthKey] of [
      [-9.2, -20.25, false, 'campfireStones'],
      [9.2, -20.25, true, 'campfireBricks'],
      [-9.2, 20.25, true, 'campfireBricks'],
      [9.2, 20.25, false, 'campfireStones'],
    ] as const) {
      const stoneHearth = arenaProps.instantiate(hearthKey, {
        x: bx,
        y: 0.02,
        z: bz,
        rotY: bx * 0.4,
        scale: hearthKey === 'campfireStones' ? 2.85 : 3.1,
      });
      if (stoneHearth) this.propsSceneGroup.add(stoneHearth);

      const timberBase = arenaProps.instantiate('campfireStoneRing', {
        x: bx,
        y: 0.04,
        z: bz,
        rotY: -bx * 0.35,
        scale: 1.9,
      });
      if (timberBase) this.propsSceneGroup.add(timberBase);

      if (hasCauldron) {
        const cauldron = arenaProps.instantiate('cauldronIron', {
          x: bx,
          y: 0.18,
          z: bz,
          scale: 1.08,
        });
        if (cauldron) this.propsSceneGroup.add(cauldron);
      } else {
        const woodLogs = arenaProps.instantiate('fireMesh3D', {
          x: bx,
          y: 0.28,
          z: bz,
          rotY: bz > 0 ? 0.5 : -0.6,
          scale: 0.42,
        });
        if (woodLogs) this.propsSceneGroup.add(woodLogs);
      }

      this.fireSystem.createFire({
        parent: this.group,
        x: bx,
        y: hasCauldron ? 0.22 : 0.14,
        z: bz,
        preset: 'bonfire',
        withLight: !hasCauldron,
        lightIntensity: 8.6,
        lightDistance: 15.5,
        worldEmberOrigin: { x: bx, y: 0.55, z: bz },
      });
    }

    // 3. Courtyard Blacksmith Forges (Anvils + Grindstones) & Carved Gothic Stone Altars/Obelisks
    for (const side of [-1, 1]) {
      const rot = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      const anvil = arenaProps.instantiate('anvil', {
        x: side * 20.1,
        y: 0,
        z: -2.4,
        rotY: rot + 0.3,
        scale: 3.35,
      });
      const grind = arenaProps.instantiate('grindstone', {
        x: side * 20.1,
        y: 0,
        z: 2.4,
        rotY: rot - 0.25,
        scale: 3.5,
      });
      const altar = arenaProps.instantiate('altarStone', {
        x: side * 20.15,
        y: 0,
        z: 0.0,
        rotY: rot,
        scale: 1.85,
      });
      if (anvil) this.propsSceneGroup.add(anvil);
      if (grind) this.propsSceneGroup.add(grind);
      if (altar) this.propsSceneGroup.add(altar);

      // Gothic carved obelisks flanking the North & South Portcullis Gatehouses
      const obeliskN = arenaProps.instantiate('pillarObelisk', {
        x: side * 3.85,
        y: 0,
        z: -20.55,
        scale: 3.1,
      });
      const obeliskS = arenaProps.instantiate('pillarObelisk', {
        x: side * 3.85,
        y: 0,
        z: 20.55,
        scale: 3.1,
      });
      if (obeliskN) this.propsSceneGroup.add(obeliskN);
      if (obeliskS) this.propsSceneGroup.add(obeliskS);
    }

    // 4. Heavy Hanging Wrought-Iron Chains & Candle Lanterns under the Central Skybridge!
    for (const cx of [-6.2, -2.1, 2.1, 6.2]) {
      for (const cz of [-3.45, 3.45]) {
        const chain = arenaProps.instantiate('dungeonChain', {
          x: cx,
          y: H - 0.12,
          z: cz,
          rotX: Math.PI * 0.5,
          scale: 1.15,
          castShadow: false,
        });
        if (chain) this.propsSceneGroup.add(chain);

        if (Math.abs(cx) > 4.0) {
          const lantern = arenaProps.instantiate('lanternCandle', {
            x: cx,
            y: H - 1.58,
            z: cz,
            scale: 2.2,
            castShadow: false,
          });
          if (lantern) this.propsSceneGroup.add(lantern);
        }
      }
    }

    // 5. Skybridge Waving Pennants & Gatehouse Battlement Defense Ballistas (y = 8.0m)
    for (const px of [-6.0, 6.0]) {
      for (const pz of [-3.85, 3.85]) {
        const pennant = arenaProps.instantiate('castlePennant', {
          x: px,
          y: H + 1.35,
          z: pz,
          rotY: pz < 0 ? 0 : Math.PI,
          scale: 2.4,
          castShadow: false,
        });
        if (pennant) this.propsSceneGroup.add(pennant);
      }

      // Fortress Defense Ballistas crowning the 8m North & South Gatehouse Walls!
      for (const wallZ of [-21.8, 21.8]) {
        const ballista = arenaProps.instantiate('siegeBallista', {
          x: px,
          y: H * 2 + 0.05,
          z: wallZ,
          rotY: wallZ < 0 ? Math.PI : 0,
          scale: 2.35,
          castShadow: false,
        });
        if (ballista) this.propsSceneGroup.add(ballista);
      }
    }

    // 6. Four 3D Stone Octagonal Corner Watchtowers + Rooftop Flags (replacing fallback cylinders!)
    for (const [tx, tz] of [
      [-22.6, -22.6],
      [22.6, -22.6],
      [-22.6, 22.6],
      [22.6, 22.6],
    ]) {
      const rot = Math.atan2(-tx, -tz);
      const tBase = arenaProps.instantiate('towerBase', {
        x: tx,
        y: 0,
        z: tz,
        rotY: rot,
        scaleX: 6.4,
        scaleY: 5.8,
        scaleZ: 6.4,
      });
      const tMid = arenaProps.instantiate('towerHexMid', {
        x: tx,
        y: 7.45,
        z: tz,
        rotY: rot,
        scaleX: 6.6,
        scaleY: 11.2,
        scaleZ: 6.6,
      });
      const tTop = arenaProps.instantiate('towerHexTop', {
        x: tx,
        y: 12.5,
        z: tz,
        rotY: rot,
        scaleX: 6.8,
        scaleY: 7.5,
        scaleZ: 6.8,
      });
      const tRoof = arenaProps.instantiate('towerHexRoof', {
        x: tx,
        y: 13.4,
        z: tz,
        rotY: rot,
        scaleX: 6.9,
        scaleY: 5.6,
        scaleZ: 6.9,
      });
      const tFlag = arenaProps.instantiate('castleFlag', {
        x: tx,
        y: 17.95,
        z: tz,
        rotY: 0.4,
        scale: 3.4,
        castShadow: false,
      });
      if (tBase) this.propsSceneGroup.add(tBase);
      if (tMid) this.propsSceneGroup.add(tMid);
      if (tTop) this.propsSceneGroup.add(tTop);
      if (tRoof) this.propsSceneGroup.add(tRoof);
      if (tFlag) this.propsSceneGroup.add(tFlag);
    }

    // 7. Outer Besieged Fortress Panorama (Trebuchets, Catapults, Pavilions, Medieval Pines & Cliff Rocks)
    for (const sideZ of [-1, 1]) {
      const faceIn = sideZ < 0 ? 0 : Math.PI;
      const treb = arenaProps.instantiate('siegeTrebuchet', {
        x: -9.5 * sideZ,
        y: -0.2,
        z: sideZ * 31.5,
        rotY: faceIn + 0.18,
        scale: 3.7,
        castShadow: false,
      });
      const cat = arenaProps.instantiate('siegeCatapult', {
        x: 9.8 * sideZ,
        y: 0.25,
        z: sideZ * 29.5,
        rotY: faceIn - 0.22,
        scale: 3.1,
        castShadow: false,
      });
      const tent = arenaProps.instantiate('pavilionTent', {
        x: 16.5 * sideZ,
        y: -0.1,
        z: sideZ * 31.0,
        rotY: faceIn - 0.4,
        scale: 6.8,
        castShadow: false,
      });
      if (treb) this.propsSceneGroup.add(treb);
      if (cat) this.propsSceneGroup.add(cat);
      if (tent) this.propsSceneGroup.add(tent);
    }

    // Ring of 28 Tall 3D Pines, Oaks & Craggy Boulders framing the outer castle cliffs
    const treeCount = 28;
    for (let i = 0; i < treeCount; i++) {
      const ang = (i * Math.PI * 2) / treeCount + 0.11;
      const dist = 28.5 + (i % 4) * 3.8;
      const px = Math.cos(ang) * dist;
      const pz = Math.sin(ang) * dist;
      // Leave clear sightline right in front of North/South siege engines
      if (Math.abs(px) < 5.5 && Math.abs(pz) > 24) continue;

      const treeKey =
        i % 3 === 0 ? 'pineTree' : i % 3 === 1 ? 'pineCrooked' : 'treeLarge';
      const treeScale = 3.8 + (i % 4) * 0.65;
      const tree = arenaProps.instantiate(treeKey, {
        x: px,
        y: -0.35,
        z: pz,
        rotY: i * 1.37,
        scale: treeScale,
        castShadow: false,
      });
      if (tree) this.propsSceneGroup.add(tree);

      if (i % 2 === 0) {
        const rockKey = i % 4 === 0 ? 'rocksLarge' : 'rocksTall';
        const rock = arenaProps.instantiate(rockKey, {
          x: px * 0.92,
          y: -0.25,
          z: pz * 0.92,
          rotY: i * 2.1,
          scale: 2.9 + (i % 3) * 0.6,
          castShadow: false,
        });
        if (rock) this.propsSceneGroup.add(rock);
      }
    }
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
    arena.torches.forEach((t, idx) => {
      const holder = new THREE.Group();
      holder.position.set(t.x, t.y, t.z);
      holder.rotation.y = t.inwardAngle;
      this.group.add(holder);
      this.torchHolders.push(holder);

      const isBridgeTorch = Math.abs(t.z) < 8;
      const withLight = isBridgeTorch || idx % 4 === 0;
      const fwdX = Math.sin(t.inwardAngle) * 0.45;
      const fwdZ = Math.cos(t.inwardAngle) * 0.45;

      // Matches KayKit torch_mounted.gltf.glb cup position (0, 0.68, 0.45) with full 3D GLSL flame!
      this.fireSystem.createFire({
        parent: holder,
        x: 0,
        y: 0.68,
        z: 0.45,
        preset: 'torch',
        withLight,
        lightIntensity: isBridgeTorch ? 6.6 : 4.8,
        lightDistance: isBridgeTorch ? 13.0 : 11.5,
        worldEmberOrigin: isBridgeTorch
          ? { x: t.x + fwdX, y: t.y + 0.95, z: t.z + fwdZ }
          : undefined,
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

  public update(
    elapsed: number,
    isFinalPhase: boolean,
    dt = 0.016,
    cameraPos?: THREE.Vector3
  ): void {
    this.fireSystem.update(elapsed, dt, cameraPos);

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
