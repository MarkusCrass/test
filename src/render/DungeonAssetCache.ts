import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const DUNGEON_MODEL_FILES = {
  floorStone: 'floor_tile_large.gltf.glb',
  floorStoneRocks: 'floor_tile_large_rocks.gltf.glb',
  floorGrate: 'floor_tile_big_grate.gltf.glb',
  floorWood: 'floor_wood_large.gltf.glb',
  stairsWide: 'stairs_wide.gltf.glb',
  wallSolid: 'wall.gltf.glb',
  wallArched: 'wall_arched.gltf.glb',
  wallWindowGated: 'wall_archedwindow_gated.gltf.glb',
  wallPortcullis: 'wall_gated.gltf.glb',
  wallBridgeScaffold: 'wall_open_scaffold.gltf.glb',
  pillarDecorated: 'pillar_decorated.gltf.glb',
  barrierWood: 'barrier.gltf.glb',
  barrierColumn: 'barrier_column.gltf.glb',
  torchMounted: 'torch_mounted.gltf.glb',
  bannerShieldRed: 'banner_shield_red.gltf.glb',
  bannerShieldBlue: 'banner_shield_blue.gltf.glb',
  bannerShieldGreen: 'banner_shield_green.gltf.glb',
  bannerShieldYellow: 'banner_shield_yellow.gltf.glb',
  bannerPatternYellow: 'banner_patternA_yellow.gltf.glb',
  barrelDecorated: 'barrel_large_decorated.gltf.glb',
  cratesStacked: 'crates_stacked.gltf.glb',
  chestGold: 'chest_gold.glb',
  swordShieldGold: 'sword_shield_gold.gltf.glb',
} as const;

export type DungeonAssetKey = keyof typeof DUNGEON_MODEL_FILES;

type ReadyListener = () => void;

/**
 * Loads, caches, shares GPU textures/materials, and clones official CC0 1.0
 * KayKit Dungeon Remastered 3D architectural & prop .glb models.
 */
class DungeonAssetCache {
  private readonly templates = new Map<DungeonAssetKey, THREE.Group>();
  private loadingPromise: Promise<void> | null = null;
  private loaded = false;
  private readonly listeners: ReadyListener[] = [];
  private sharedAtlasTexture: THREE.Texture | null = null;
  private sharedDungeonMaterial: THREE.MeshStandardMaterial | null = null;

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

  public preload(): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise;

    const loader = new GLTFLoader();
    const keys = Object.keys(DUNGEON_MODEL_FILES) as DungeonAssetKey[];
    let cursor = 0;
    const workerCount = Math.min(3, keys.length);

    const runWorker = async (): Promise<void> => {
      while (cursor < keys.length) {
        const key = keys[cursor++];
        const filename = DUNGEON_MODEL_FILES[key];
        try {
          const gltf = await loader.loadAsync(`/models/dungeon/${filename}`);
          const root = gltf.scene;
          this.prepareTemplate(root);
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

  private prepareTemplate(root: THREE.Group): void {
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
            roughness: 0.76,
            metalness: 0.08,
            envMapIntensity: 0.9,
          });
        }
        if (this.sharedDungeonMaterial) {
          mesh.material = this.sharedDungeonMaterial;
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
