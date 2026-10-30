import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const DUNGEON_MODEL_FILES = {
  floorStone: 'floor_tile_large.gltf.glb',
  floorStoneRocks: 'floor_tile_large_rocks.gltf.glb',
  floorGrate: 'floor_tile_big_grate.gltf.glb',
  floorWood: 'floor_wood_large.gltf.glb',
  floorWoodDark: 'floor_wood_large_dark.gltf.glb',
  floorDirt: 'floor_dirt_large.gltf.glb',
  stairsWide: 'stairs_wide.gltf.glb',
  wallSolid: 'wall.gltf.glb',
  wallCracked: 'wall_cracked.gltf.glb',
  wallArched: 'wall_arched.gltf.glb',
  wallWindowGated: 'wall_archedwindow_gated.gltf.glb',
  wallPortcullis: 'wall_gated.gltf.glb',
  wallBridgeScaffold: 'wall_open_scaffold.gltf.glb',
  pillarDecorated: 'pillar_decorated.gltf.glb',
  barrierWood: 'barrier.gltf.glb',
  barrierColumn: 'barrier_column.gltf.glb',
  torchMounted: 'torch_mounted.gltf.glb',
  torchLit: 'torch_unlit.gltf.glb',
  candleLit: 'candle_lit.gltf.glb',
  candleTriple: 'candle_triple.gltf.glb',
  bannerShieldRed: 'banner_shield_red.gltf.glb',
  bannerShieldBlue: 'banner_shield_blue.gltf.glb',
  bannerShieldGreen: 'banner_shield_green.gltf.glb',
  bannerShieldYellow: 'banner_shield_yellow.gltf.glb',
  bannerPatternYellow: 'banner_patternA_yellow.gltf.glb',
  bannerTripleRed: 'banner_triple_red.gltf.glb',
  bannerTripleBlue: 'banner_triple_blue.gltf.glb',
  barrelDecorated: 'barrel_large_decorated.gltf.glb',
  kegDecorated: 'keg_decorated.gltf.glb',
  cratesStacked: 'crates_stacked.gltf.glb',
  chestGold: 'chest_gold.glb',
  coinStackLarge: 'coin_stack_large.gltf.glb',
  rubbleLarge: 'rubble_large.gltf.glb',
  rubbleHalf: 'rubble_half.gltf.glb',
  swordShieldGold: 'sword_shield_gold.gltf.glb',
  swordShieldBroken: 'sword_shield_broken.gltf.glb',
} as const;

export type DungeonAssetKey = keyof typeof DUNGEON_MODEL_FILES;

const MASONRY_TINTED_KEYS = new Set<DungeonAssetKey>([
  'floorStone',
  'floorStoneRocks',
  'stairsWide',
  'wallSolid',
  'wallCracked',
  'wallArched',
  'wallWindowGated',
  'wallPortcullis',
  'pillarDecorated',
  'barrierColumn',
  'rubbleLarge',
  'rubbleHalf',
]);

type ReadyListener = () => void;

/**
 * Loads, caches, shares GPU textures/materials, and clones official CC0 1.0
 * KayKit Dungeon Remastered 3D architectural & prop .glb models.
 * Supports instant live re-theming of stone masonry (warm limestone, golden sandstone,
 * sapphire marble, dark basalt) while keeping wood planks & heraldic banners true-colored.
 */
class DungeonAssetCache {
  private readonly templates = new Map<DungeonAssetKey, THREE.Group>();
  private loadingPromise: Promise<void> | null = null;
  private loaded = false;
  private readonly listeners: ReadyListener[] = [];
  private sharedAtlasTexture: THREE.Texture | null = null;
  private sharedDungeonMaterial: THREE.MeshStandardMaterial | null = null;
  private sharedMasonryMaterial: THREE.MeshStandardMaterial | null = null;
  private pendingMasonryHex = 0xffefd6;
  private pendingMasonryRoughness = 0.72;

  public get isReady(): boolean {
    return this.loaded;
  }

  public onReady(cb: ReadyListener): void {
    if (this.loaded) {
      cb();
    } else {
      this.listeners.push(cb);
    }
  }

  public setMasonryTint(colorHex: number, roughness = 0.74): void {
    this.pendingMasonryHex = colorHex;
    this.pendingMasonryRoughness = roughness;
    if (this.sharedMasonryMaterial) {
      this.sharedMasonryMaterial.color.setHex(colorHex);
      this.sharedMasonryMaterial.roughness = roughness;
      this.sharedMasonryMaterial.needsUpdate = true;
    }
  }

  public preload(): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise;

    const loader = new GLTFLoader();
    const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
    const rawBase = meta.env?.BASE_URL ?? './';
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    const keys = Object.keys(DUNGEON_MODEL_FILES) as DungeonAssetKey[];
    let cursor = 0;
    const workerCount = Math.min(3, keys.length);

    const runWorker = async (): Promise<void> => {
      while (cursor < keys.length) {
        const key = keys[cursor++];
        const filename = DUNGEON_MODEL_FILES[key];
        try {
          const gltf = await loader.loadAsync(`${base}models/dungeon/${filename}`);
          const root = gltf.scene;
          this.prepareTemplate(key, root);
          this.templates.set(key, root);
        } catch (err) {
          console.error(`Failed to load dungeon asset ${filename}:`, err);
        }
      }
    };

    this.loadingPromise = Promise.all(
      Array.from({ length: workerCount }, () => runWorker())
    )
      .then(() => {
        this.loaded = true;
        for (const fn of this.listeners) {
          fn();
        }
        this.listeners.length = 0;
      })
      .catch((err) => {
        console.error('Failed to load KayKit Dungeon Remastered assets:', err);
      });

    return this.loadingPromise;
  }

  private prepareTemplate(key: DungeonAssetKey, root: THREE.Group): void {
    const useMasonryMat = MASONRY_TINTED_KEYS.has(key);

    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const srcMat = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      const stdMat = srcMat as THREE.MeshStandardMaterial | undefined;

      if (stdMat && stdMat.map) {
        if (!this.sharedAtlasTexture) {
          stdMat.map.colorSpace = THREE.SRGBColorSpace;
          stdMat.map.anisotropy = 4;
          stdMat.map.needsUpdate = true;
          this.sharedAtlasTexture = stdMat.map;
          this.sharedDungeonMaterial = new THREE.MeshStandardMaterial({
            map: this.sharedAtlasTexture,
            roughness: 0.74,
            metalness: 0.06,
            envMapIntensity: 0.92,
          });
          this.sharedMasonryMaterial = new THREE.MeshStandardMaterial({
            map: this.sharedAtlasTexture,
            color: new THREE.Color(this.pendingMasonryHex),
            roughness: this.pendingMasonryRoughness,
            metalness: 0.07,
            envMapIntensity: 0.92,
          });
        }
        const targetMat = useMasonryMat
          ? this.sharedMasonryMaterial
          : this.sharedDungeonMaterial;
        if (targetMat) {
          mesh.material = targetMat;
        }
      }
    });
  }

  public instantiate(
    key: DungeonAssetKey,
    options?: {
      x?: number;
      y?: number;
      z?: number;
      rotY?: number;
      scaleX?: number;
      scaleY?: number;
      scaleZ?: number;
      castShadow?: boolean;
      receiveShadow?: boolean;
    }
  ): THREE.Group | null {
    const tpl = this.templates.get(key);
    if (!tpl) return null;

    const clone = tpl.clone(true);
    if (options) {
      clone.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
      if (options.rotY !== undefined) {
        clone.rotation.y = options.rotY;
      }
      if (
        options.scaleX !== undefined ||
        options.scaleY !== undefined ||
        options.scaleZ !== undefined
      ) {
        clone.scale.set(
          options.scaleX ?? 1,
          options.scaleY ?? 1,
          options.scaleZ ?? 1
        );
      }
      if (
        options.castShadow !== undefined ||
        options.receiveShadow !== undefined
      ) {
        clone.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) {
            if (options.castShadow !== undefined) {
              c.castShadow = options.castShadow;
            }
            if (options.receiveShadow !== undefined) {
              c.receiveShadow = options.receiveShadow;
            }
          }
        });
      }
    }
    return clone;
  }
}

export const dungeonAssets = new DungeonAssetCache();
