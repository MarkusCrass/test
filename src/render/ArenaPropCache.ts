import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const ARENA_PROP_FILES = {
  // Fire, Braziers, Campfires & Cauldrons
  fireMesh3D: 'survival/fire_mesh.glb',
  campfireTripod: 'survival/campfire.glb',
  campfireStoneRing: 'survival/campfire_flames.glb',
  campfireStones: 'survival/campfire_stones.glb',
  campfireBricks: 'survival/campfire_bricks.glb',
  cauldronIron: 'survival/cauldron.glb',
  fireBrazierBowl: 'graveyard/fire_brazier.glb',
  brazierPedestal: 'graveyard/column_large.glb',
  lanternCandle: 'graveyard/lantern_candle.glb',

  // Armory, Forge, Altars & Dungeon Chains
  anvil: 'survival/anvil.glb',
  grindstone: 'survival/grindstone.glb',
  dungeonChain: 'survival/dungeon_chain.glb',
  altarStone: 'graveyard/altar_stone.glb',
  pillarObelisk: 'graveyard/pillar_obelisk.glb',

  // Outer Castle Watchtowers, Flags, Siege Engines & Forest Backdrop
  towerBase: 'castle/tower_base.glb',
  towerHexMid: 'castle/tower_hex_mid.glb',
  towerHexTop: 'castle/tower_hex_top.glb',
  towerHexRoof: 'castle/tower_hex_roof.glb',
  castleFlag: 'castle/castle_flag.glb',
  castlePennant: 'castle/castle_pennant.glb',
  siegeBallista: 'castle/siege_ballista.glb',
  siegeCatapult: 'castle/siege_catapult.glb',
  siegeTrebuchet: 'castle/siege_trebuchet.glb',
  pavilionTent: 'survival/pavilion_tent.glb',
  pineTree: 'graveyard/pine_tree.glb',
  pineCrooked: 'graveyard/pine_crooked.glb',
  treeLarge: 'castle/tree_large.glb',
  rocksLarge: 'castle/rocks_large.glb',
  rocksTall: 'graveyard/rocks_tall.glb',
} as const;

export type ArenaPropKey = keyof typeof ARENA_PROP_FILES;

type ReadyListener = () => void;

/**
 * Loads, caches, shares GPU textures/materials, and clones CC0 1.0 medieval
 * citadel props, 3D fire geometry, wrought-iron braziers, siege engines,
 * watchtowers, and forest surroundings.
 */
class ArenaPropCache {
  private readonly templates = new Map<ArenaPropKey, THREE.Group>();
  private sculptedFlameGeo: THREE.BufferGeometry | null = null;
  private loadingPromise: Promise<void> | null = null;
  private loaded = false;
  private readonly listeners: ReadyListener[] = [];

  private graveyardColormapMat: THREE.MeshStandardMaterial | null = null;
  private castleColormapMat: THREE.MeshStandardMaterial | null = null;

  public get isReady(): boolean {
    return this.loaded;
  }

  public get flameGeometry3D(): THREE.BufferGeometry | null {
    return this.sculptedFlameGeo;
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
    const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
    const rawBase = meta.env?.BASE_URL ?? './';
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    const keys = Object.keys(ARENA_PROP_FILES) as ArenaPropKey[];
    let cursor = 0;
    const workerCount = Math.min(4, keys.length);

    const runWorker = async (): Promise<void> => {
      while (cursor < keys.length) {
        const key = keys[cursor++];
        const relPath = ARENA_PROP_FILES[key];
        try {
          const gltf = await loader.loadAsync(`${base}models/props/${relPath}`);
          const root = gltf.scene;
          this.prepareTemplate(key, relPath, root);
          this.templates.set(key, root);
        } catch (err) {
          console.error(`Failed to load arena prop ${relPath}:`, err);
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
        console.error('Failed to load ArenaPropCache:', err);
      });

    return this.loadingPromise;
  }

  private prepareTemplate(
    key: ArenaPropKey,
    relPath: string,
    root: THREE.Group
  ): void {
    const isGraveyard = relPath.startsWith('graveyard/');
    const isCastle = relPath.startsWith('castle/');

    root.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const srcMat = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      const stdMat = srcMat as THREE.MeshStandardMaterial | undefined;
      if (!stdMat) return;

      // Hide static 78-vertex baked cone in fire_mesh.glb & style charred glowing firewood
      if (key === 'fireMesh3D') {
        if (stdMat.name === 'fire') {
          if (!this.sculptedFlameGeo) {
            const g = mesh.geometry.clone();
            g.computeBoundingBox();
            const bb = g.boundingBox!;
            const cx = (bb.min.x + bb.max.x) * 0.5;
            const cz = (bb.min.z + bb.max.z) * 0.5;
            const h = Math.max(0.01, bb.max.y - bb.min.y);
            const rx = Math.max(0.01, bb.max.x - bb.min.x);
            const rz = Math.max(0.01, bb.max.z - bb.min.z);
            g.translate(-cx, -bb.min.y, -cz);
            g.scale(1 / rx, 1 / h, 1 / rz);
            g.computeVertexNormals();
            this.sculptedFlameGeo = g;
          }
          mesh.visible = false;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        } else {
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x3b2213,
            emissive: 0x3a1002,
            emissiveIntensity: 0.55,
            roughness: 0.9,
            metalness: 0.05,
          });
        }
        return;
      }

      // Share single GPU colormap texture across all Graveyard / Castle kit meshes
      if (stdMat.map) {
        stdMat.map.colorSpace = THREE.SRGBColorSpace;
        stdMat.map.anisotropy = 4;
        if (isGraveyard) {
          if (!this.graveyardColormapMat) {
            this.graveyardColormapMat = new THREE.MeshStandardMaterial({
              map: stdMat.map,
              roughness: 0.78,
              metalness: 0.14,
              envMapIntensity: 0.92,
            });
          }
          mesh.material = this.graveyardColormapMat;
        } else if (isCastle) {
          if (!this.castleColormapMat) {
            this.castleColormapMat = new THREE.MeshStandardMaterial({
              map: stdMat.map,
              roughness: 0.8,
              metalness: 0.1,
              envMapIntensity: 0.88,
            });
          }
          mesh.material = this.castleColormapMat;
        }
        return;
      }

      // Upgrade forged iron / steel / wood PBR materials for IBL reflections
      const matName = (stdMat.name || '').toLowerCase();
      if (
        matName.includes('metal') ||
        matName.includes('chain') ||
        matName.includes('cauldron')
      ) {
        stdMat.metalness = matName.includes('cauldron') ? 0.65 : 0.76;
        stdMat.roughness = matName.includes('cauldron') ? 0.44 : 0.34;
        stdMat.envMapIntensity = 1.1;
      } else {
        stdMat.roughness = 0.84;
        stdMat.metalness = 0.06;
      }
    });
  }

  public instantiate(
    key: ArenaPropKey,
    options?: {
      x?: number;
      y?: number;
      z?: number;
      rotX?: number;
      rotY?: number;
      rotZ?: number;
      scale?: number;
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
      if (options.rotX !== undefined) clone.rotation.x = options.rotX;
      if (options.rotY !== undefined) clone.rotation.y = options.rotY;
      if (options.rotZ !== undefined) clone.rotation.z = options.rotZ;

      const s = options.scale ?? 1;
      clone.scale.set(
        options.scaleX ?? s,
        options.scaleY ?? s,
        options.scaleZ ?? s
      );

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

export const arenaProps = new ArenaPropCache();
