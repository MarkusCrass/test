import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface LoadedKayKitPack {
  knightScene: THREE.Object3D;
  knightClips: Map<string, THREE.AnimationClip>;
  knightBaseImage: CanvasImageSource | null;

  rogueScene: THREE.Object3D;
  rogueClips: Map<string, THREE.AnimationClip>;
  rogueBaseImage: CanvasImageSource | null;

  sword1HProto: THREE.Object3D | null;
  swordOffhandProto: THREE.Object3D | null;
}

/**
 * Singleton loader, cloner, and gradient-atlas palette customizer for
 * official CC0 KayKit Adventurers 3D rigged models (Knight.glb & Rogue_Hooded.glb).
 */
class KayKitAssetRegistry {
  private pack: LoadedKayKitPack | null = null;
  private loadingPromise: Promise<LoadedKayKitPack> | null = null;
  private readonly readyCallbacks: Array<(pack: LoadedKayKitPack) => void> = [];
  private readonly textureCache = new Map<string, THREE.Texture>();

  public preload(): Promise<LoadedKayKitPack> {
    if (this.pack) return Promise.resolve(this.pack);
    if (this.loadingPromise) return this.loadingPromise;

    const loader = new GLTFLoader();
    this.loadingPromise = Promise.all([
      loader.loadAsync('./models/kaykit/Knight.glb'),
      loader.loadAsync('./models/kaykit/Rogue_Hooded.glb'),
    ]).then(([knightGltf, rogueGltf]) => {
      const pack = this.extractPack(knightGltf, rogueGltf);
      this.pack = pack;
      for (const cb of this.readyCallbacks) {
        cb(pack);
      }
      this.readyCallbacks.length = 0;
      return pack;
    });

    return this.loadingPromise;
  }

  public getLoadedPack(): LoadedKayKitPack | null {
    return this.pack;
  }

  public onReady(cb: (pack: LoadedKayKitPack) => void): void {
    if (this.pack) {
      cb(this.pack);
      return;
    }
    this.readyCallbacks.push(cb);
    this.preload().catch((err) => {
      console.error('Failed to load KayKit GLB models:', err);
    });
  }

  public cloneKnightRig(): THREE.Object3D | null {
    if (!this.pack) return null;
    return SkeletonUtils.clone(this.pack.knightScene);
  }

  public cloneRogueRig(): THREE.Object3D | null {
    if (!this.pack) return null;
    return SkeletonUtils.clone(this.pack.rogueScene);
  }

  /**
   * Generates (and caches) a customized KayKit 1024x1024 gradient atlas texture
   * by shifting the cloth gradient swatch cells to `clothHex` (and optionally tinting
   * steel armor swatches) while preserving KayKit's hand-painted highlight-to-shadow gradients!
   */
  public getCustomizedAtlasTexture(
    kind: 'knight' | 'rogue',
    clothHex: number,
    armorTintHex?: number
  ): THREE.Texture | null {
    if (!this.pack) return null;
    const baseImg =
      kind === 'knight' ? this.pack.knightBaseImage : this.pack.rogueBaseImage;
    if (!baseImg) return null;

    const cacheKey = `${kind}_${clothHex.toString(16)}_${(armorTintHex ?? 0).toString(16)}`;
    const existing = this.textureCache.get(cacheKey);
    if (existing) return existing;

    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(baseImg, 0, 0, size, size);

    const targetCol = new THREE.Color(clothHex);
    const targetHSL = { h: 0, s: 0, l: 0 };
    targetCol.getHSL(targetHSL);

    // Exact cloth swatch cells in KayKit 1024x1024 gradient atlases:
    const clothRects: Array<[number, number, number, number]> =
      kind === 'knight'
        ? [
            [0, 256, 128, 256],
            [256, 512, 128, 256],
          ]
        : [
            [0, 256, 256, 256],
            [128, 512, 256, 256],
          ];

    for (const [rx, ry, rw, rh] of clothRects) {
      this.recolorSwatchRect(ctx, rx, ry, rw, rh, targetHSL.h, targetHSL.s, 1.0);
    }

    // Optional subtle steel armor tint on Knight for class silhouette distinction
    if (kind === 'knight' && armorTintHex !== undefined) {
      const armorCol = new THREE.Color(armorTintHex);
      const armorHSL = { h: 0, s: 0, l: 0 };
      armorCol.getHSL(armorHSL);
      const steelRects: Array<[number, number, number, number]> = [
        [384, 0, 256, 256],
        [896, 0, 128, 512],
        [256, 256, 256, 256],
      ];
      for (const [rx, ry, rw, rh] of steelRects) {
        this.recolorSwatchRect(
          ctx,
          rx,
          ry,
          rw,
          rh,
          armorHSL.h,
          Math.min(0.28, armorHSL.s),
          armorHSL.l < 0.35 ? 0.78 : 1.02
        );
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    // CRITICAL for glTF 2.0 UV coordinates: flipY MUST be false!
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    this.textureCache.set(cacheKey, tex);
    return tex;
  }

  private recolorSwatchRect(
    ctx: CanvasRenderingContext2D,
    rx: number,
    ry: number,
    rw: number,
    rh: number,
    hue: number,
    sat: number,
    lightScale: number
  ): void {
    const imgData = ctx.getImageData(rx, ry, rw, rh);
    const d = imgData.data;
    const tmpCol = new THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };

    for (let i = 0; i < d.length; i += 4) {
      tmpCol.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      tmpCol.getHSL(hsl);
      const newL = Math.max(0.04, Math.min(0.95, hsl.l * lightScale));
      tmpCol.setHSL(hue, sat, newL);
      d[i] = Math.round(tmpCol.r * 255);
      d[i + 1] = Math.round(tmpCol.g * 255);
      d[i + 2] = Math.round(tmpCol.b * 255);
    }

    ctx.putImageData(imgData, rx, ry);
  }

  private extractPack(knightGltf: GLTF, rogueGltf: GLTF): LoadedKayKitPack {
    const knightClips = new Map<string, THREE.AnimationClip>();
    for (const clip of knightGltf.animations) {
      knightClips.set(clip.name, clip);
    }

    const rogueClips = new Map<string, THREE.AnimationClip>();
    for (const clip of rogueGltf.animations) {
      rogueClips.set(clip.name, clip);
    }

    const knightBaseImage = this.findBaseTextureImage(knightGltf.scene);
    const rogueBaseImage = this.findBaseTextureImage(rogueGltf.scene);

    const sword1HProto = knightGltf.scene.getObjectByName('1H_Sword') ?? null;
    const swordOffhandProto =
      knightGltf.scene.getObjectByName('1H_Sword_Offhand') ?? null;

    return {
      knightScene: knightGltf.scene,
      knightClips,
      knightBaseImage,
      rogueScene: rogueGltf.scene,
      rogueClips,
      rogueBaseImage,
      sword1HProto,
      swordOffhandProto,
    };
  }

  private findBaseTextureImage(root: THREE.Object3D): CanvasImageSource | null {
    let found: CanvasImageSource | null = null;
    root.traverse((obj) => {
      if (found) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const std = mat as THREE.MeshStandardMaterial;
      if (std && std.map && std.map.image) {
        found = std.map.image as CanvasImageSource;
      }
    });
    return found;
  }
}

export const kayKitAssets = new KayKitAssetRegistry();
