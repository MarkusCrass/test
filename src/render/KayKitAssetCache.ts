import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export type KayKitCharacterModelKind =
  | 'knight'
  | 'rogue'
  | 'barbarian'
  | 'duelist'
  | 'skeleton_warrior'
  | 'skeleton_rogue'
  | 'skeleton_minion';

export interface LoadedKayKitPack {
  knightScene: THREE.Object3D;
  knightClips: Map<string, THREE.AnimationClip>;
  knightBaseImage: CanvasImageSource | null;

  rogueScene: THREE.Object3D;
  rogueClips: Map<string, THREE.AnimationClip>;
  rogueBaseImage: CanvasImageSource | null;

  barbarianScene?: THREE.Object3D;
  barbarianBaseTexture?: THREE.Texture | null;

  duelistScene?: THREE.Object3D;
  duelistBaseTexture?: THREE.Texture | null;

  skeletonWarriorScene?: THREE.Object3D;
  skeletonRogueScene?: THREE.Object3D;
  skeletonMinionScene?: THREE.Object3D;
  skeletonBaseTexture?: THREE.Texture | null;

  mergedClips?: Map<string, THREE.AnimationClip>;

  sword1HProto: THREE.Object3D | null;
  swordOffhandProto: THREE.Object3D | null;
  roundShieldProto?: THREE.Object3D | null;

  skeletonBladeProto?: THREE.Object3D | null;
  skeletonAxeProto?: THREE.Object3D | null;
  skeletonShieldLargeAProto?: THREE.Object3D | null;
  skeletonShieldLargeBProto?: THREE.Object3D | null;
  skeletonShieldSmallAProto?: THREE.Object3D | null;
}

/**
 * Singleton loader, cloner, and gradient-atlas palette customizer for
 * official CC0 KayKit Adventurers 1.0 & KayKit Skeletons 1.0 3D rigged melee models.
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
    const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
    const rawBase = meta.env?.BASE_URL ?? './';
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    const dir = `${base}models/kaykit`;

    this.loadingPromise = (async () => {
      const [
        knightGltf,
        rogueGltf,
        barbarianGltf,
        duelistGltf,
        skelWarriorGltf,
        skelRogueGltf,
        skelMinionGltf,
        skelBladeGltf,
        skelAxeGltf,
        skelShieldLargeAGltf,
        skelShieldLargeBGltf,
        skelShieldSmallAGltf,
      ] = await Promise.all([
        loader.loadAsync(`${dir}/Knight.glb`),
        loader.loadAsync(`${dir}/Rogue_Hooded.glb`),
        loader.loadAsync(`${dir}/Barbarian.glb`),
        loader.loadAsync(`${dir}/Rogue.glb`),
        loader.loadAsync(`${dir}/Skeleton_Warrior.glb`),
        loader.loadAsync(`${dir}/Skeleton_Rogue.glb`),
        loader.loadAsync(`${dir}/Skeleton_Minion.glb`),
        loader.loadAsync(`${dir}/Skeleton_Blade.glb`),
        loader.loadAsync(`${dir}/Skeleton_Axe.glb`),
        loader.loadAsync(`${dir}/Skeleton_Shield_Large_A.glb`),
        loader.loadAsync(`${dir}/Skeleton_Shield_Large_B.glb`),
        loader.loadAsync(`${dir}/Skeleton_Shield_Small_A.glb`),
      ]);

      const pack = this.extractPack({
        knightGltf,
        rogueGltf,
        barbarianGltf,
        duelistGltf,
        skelWarriorGltf,
        skelRogueGltf,
        skelMinionGltf,
        skelBladeGltf,
        skelAxeGltf,
        skelShieldLargeAGltf,
        skelShieldLargeBGltf,
        skelShieldSmallAGltf,
      });

      this.pack = pack;
      for (const cb of this.readyCallbacks) {
        cb(pack);
      }
      this.readyCallbacks.length = 0;
      return pack;
    })();

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
  }

  public cloneKnightRig(): THREE.Object3D | null {
    if (!this.pack) return null;
    return SkeletonUtils.clone(this.pack.knightScene);
  }

  public cloneRogueRig(): THREE.Object3D | null {
    if (!this.pack) return null;
    return SkeletonUtils.clone(this.pack.rogueScene);
  }

  public cloneCharacterRig(
    kind: KayKitCharacterModelKind
  ): THREE.Object3D | null {
    if (!this.pack) return null;
    switch (kind) {
      case 'rogue':
        return SkeletonUtils.clone(this.pack.rogueScene);
      case 'barbarian':
        return SkeletonUtils.clone(
          this.pack.barbarianScene ?? this.pack.knightScene
        );
      case 'duelist':
        return SkeletonUtils.clone(
          this.pack.duelistScene ?? this.pack.rogueScene
        );
      case 'skeleton_warrior':
        return SkeletonUtils.clone(
          this.pack.skeletonWarriorScene ?? this.pack.knightScene
        );
      case 'skeleton_rogue':
        return SkeletonUtils.clone(
          this.pack.skeletonRogueScene ?? this.pack.rogueScene
        );
      case 'skeleton_minion':
        return SkeletonUtils.clone(
          this.pack.skeletonMinionScene ?? this.pack.knightScene
        );
      case 'knight':
      default:
        return SkeletonUtils.clone(this.pack.knightScene);
    }
  }

  public getMergedClips(): Map<string, THREE.AnimationClip> | null {
    if (!this.pack) return null;
    return this.pack.mergedClips ?? this.pack.knightClips;
  }

  public getBaseModelTexture(
    kind: KayKitCharacterModelKind
  ): THREE.Texture | null {
    if (!this.pack) return null;
    switch (kind) {
      case 'barbarian':
        return this.pack.barbarianBaseTexture ?? null;
      case 'duelist':
        return this.pack.duelistBaseTexture ?? null;
      case 'skeleton_warrior':
      case 'skeleton_rogue':
      case 'skeleton_minion':
        return this.pack.skeletonBaseTexture ?? null;
      default:
        return null;
    }
  }

  /**
   * Generates (and caches) a customized KayKit 1024x1024 gradient atlas texture
   * by shifting the cloth gradient swatch cells to `clothHex` (and optionally tinting
   * steel armor swatches) while preserving KayKit's hand-painted highlight-to-shadow gradients!
   */
  public getCustomizedAtlasTexture(
    kind: KayKitCharacterModelKind,
    clothHex: number,
    armorTintHex?: number
  ): THREE.Texture | null {
    if (!this.pack) return null;

    if (kind !== 'knight' && kind !== 'rogue') {
      const nativeTex = this.getBaseModelTexture(kind);
      const baseImg = nativeTex?.image as CanvasImageSource | undefined;
      if (!baseImg || typeof document === 'undefined') {
        return nativeTex;
      }

      const cacheKey = `${kind}_${clothHex.toString(16)}`;
      const cached = this.textureCache.get(cacheKey);
      if (cached) return cached;

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) return nativeTex;

      try {
        ctx.drawImage(baseImg, 0, 0, 1024, 1024);
        const targetCol = new THREE.Color(clothHex);
        const targetHSL = { h: 0, s: 0, l: 0 };
        targetCol.getHSL(targetHSL);

        // Recolor primary cloth swatch strip in Adventurers / Skeletons 1024x1024 gradient atlas
        const rects: Array<[number, number, number, number]> =
          kind === 'barbarian' || kind === 'duelist'
            ? [
                [0, 256, 128, 256],
                [128, 512, 128, 256],
              ]
            : [[0, 256, 128, 256]];

        for (const [rx, ry, rw, rh] of rects) {
          this.recolorSwatchRect(
            ctx,
            rx,
            ry,
            rw,
            rh,
            targetHSL.h,
            Math.min(0.82, targetHSL.s),
            1.0
          );
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        this.textureCache.set(cacheKey, tex);
        return tex;
      } catch {
        return nativeTex;
      }
    }

    const baseImg =
      kind === 'knight' ? this.pack.knightBaseImage : this.pack.rogueBaseImage;
    if (!baseImg || typeof document === 'undefined') return null;

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

  private extractPack(gltfs: {
    knightGltf: GLTF;
    rogueGltf: GLTF;
    barbarianGltf: GLTF;
    duelistGltf: GLTF;
    skelWarriorGltf: GLTF;
    skelRogueGltf: GLTF;
    skelMinionGltf: GLTF;
    skelBladeGltf: GLTF;
    skelAxeGltf: GLTF;
    skelShieldLargeAGltf: GLTF;
    skelShieldLargeBGltf: GLTF;
    skelShieldSmallAGltf: GLTF;
  }): LoadedKayKitPack {
    const mergedClips = new Map<string, THREE.AnimationClip>();
    const knightClips = new Map<string, THREE.AnimationClip>();
    for (const clip of gltfs.knightGltf.animations) {
      knightClips.set(clip.name, clip);
      mergedClips.set(clip.name, clip);
    }

    const rogueClips = new Map<string, THREE.AnimationClip>();
    for (const clip of gltfs.rogueGltf.animations) {
      rogueClips.set(clip.name, clip);
      if (!mergedClips.has(clip.name)) {
        mergedClips.set(clip.name, clip);
      }
    }

    for (const clip of gltfs.skelWarriorGltf.animations) {
      if (!mergedClips.has(clip.name)) {
        mergedClips.set(clip.name, clip);
      }
      if (!knightClips.has(clip.name)) {
        knightClips.set(clip.name, clip);
      }
      if (!rogueClips.has(clip.name)) {
        rogueClips.set(clip.name, clip);
      }
    }

    const knightBaseImage = this.findBaseTextureImage(gltfs.knightGltf.scene);
    const rogueBaseImage = this.findBaseTextureImage(gltfs.rogueGltf.scene);

    const barbarianBaseTexture = this.findBaseTexture(
      gltfs.barbarianGltf.scene
    );
    const duelistBaseTexture = this.findBaseTexture(gltfs.duelistGltf.scene);
    const skeletonBaseTexture = this.findBaseTexture(
      gltfs.skelWarriorGltf.scene
    );

    const sword1HProto =
      gltfs.knightGltf.scene.getObjectByName('1H_Sword') ?? null;
    const swordOffhandProto =
      gltfs.knightGltf.scene.getObjectByName('1H_Sword_Offhand') ?? null;
    const roundShieldProto =
      gltfs.knightGltf.scene.getObjectByName('Round_Shield') ?? null;

    return {
      knightScene: gltfs.knightGltf.scene,
      knightClips,
      knightBaseImage,
      rogueScene: gltfs.rogueGltf.scene,
      rogueClips,
      rogueBaseImage,
      barbarianScene: gltfs.barbarianGltf.scene,
      barbarianBaseTexture,
      duelistScene: gltfs.duelistGltf.scene,
      duelistBaseTexture,
      skeletonWarriorScene: gltfs.skelWarriorGltf.scene,
      skeletonRogueScene: gltfs.skelRogueGltf.scene,
      skeletonMinionScene: gltfs.skelMinionGltf.scene,
      skeletonBaseTexture,
      mergedClips,
      sword1HProto,
      swordOffhandProto,
      roundShieldProto,
      skeletonBladeProto: this.findFirstMeshBranch(gltfs.skelBladeGltf.scene),
      skeletonAxeProto: this.findFirstMeshBranch(gltfs.skelAxeGltf.scene),
      skeletonShieldLargeAProto: this.findFirstMeshBranch(
        gltfs.skelShieldLargeAGltf.scene
      ),
      skeletonShieldLargeBProto: this.findFirstMeshBranch(
        gltfs.skelShieldLargeBGltf.scene
      ),
      skeletonShieldSmallAProto: this.findFirstMeshBranch(
        gltfs.skelShieldSmallAGltf.scene
      ),
    };
  }

  private findFirstMeshBranch(root: THREE.Object3D): THREE.Object3D {
    for (const child of root.children) {
      return child;
    }
    return root;
  }

  private findBaseTexture(root: THREE.Object3D): THREE.Texture | null {
    let found: THREE.Texture | null = null;
    root.traverse((obj) => {
      if (found) return;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = Array.isArray(mesh.material)
        ? mesh.material[0]
        : mesh.material;
      const std = mat as THREE.MeshStandardMaterial;
      if (std && std.map) {
        found = std.map;
      }
    });
    return found;
  }

  private findBaseTextureImage(root: THREE.Object3D): CanvasImageSource | null {
    const tex = this.findBaseTexture(root);
    return (tex?.image as CanvasImageSource | undefined) ?? null;
  }
}

export const kayKitAssets = new KayKitAssetRegistry();
