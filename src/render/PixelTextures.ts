import * as THREE from 'three';

/**
 * Generates crisp low-resolution procedural pixel textures (NearestFilter)
 * for matte medieval stone, masonry walls, timber, steel, grass, and banners.
 * Reusable shared materials ensure minimal GPU draw overhead and consistent palette.
 */
export class MaterialLibrary {
  public readonly floorTex: THREE.CanvasTexture;
  public readonly wallTex: THREE.CanvasTexture;
  public readonly woodTex: THREE.CanvasTexture;
  public readonly steelTex: THREE.CanvasTexture;

  public readonly floorMat: THREE.MeshStandardMaterial;
  public readonly curbStoneMat: THREE.MeshStandardMaterial;
  public readonly wallMat: THREE.MeshStandardMaterial;
  public readonly pillarMat: THREE.MeshStandardMaterial;
  public readonly woodMat: THREE.MeshStandardMaterial;
  public readonly darkIronMat: THREE.MeshStandardMaterial;
  public readonly grassMat: THREE.MeshStandardMaterial;
  public readonly flameOuterMat: THREE.MeshBasicMaterial;
  public readonly flameCoreMat: THREE.MeshBasicMaterial;

  constructor() {
    this.floorTex = this.createStoneSlabTexture(64);
    this.floorTex.wrapS = THREE.RepeatWrapping;
    this.floorTex.wrapT = THREE.RepeatWrapping;
    this.floorTex.repeat.set(9, 9);

    this.wallTex = this.createMasonryWallTexture(64);
    this.wallTex.wrapS = THREE.RepeatWrapping;
    this.wallTex.wrapT = THREE.RepeatWrapping;
    this.wallTex.repeat.set(16, 2);

    this.woodTex = this.createWoodPlankTexture(32);
    this.woodTex.wrapS = THREE.RepeatWrapping;
    this.woodTex.wrapT = THREE.RepeatWrapping;
    this.woodTex.repeat.set(2, 2);

    this.steelTex = this.createBrushedSteelTexture(32);

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTex,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });

    this.curbStoneMat = new THREE.MeshStandardMaterial({
      color: 0x676d76,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });

    this.pillarMat = new THREE.MeshStandardMaterial({
      color: 0x767c87,
      roughness: 0.88,
      metalness: 0.06,
      flatShading: true,
    });

    this.woodMat = new THREE.MeshStandardMaterial({
      map: this.woodTex,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
    });

    this.darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x2d323a,
      roughness: 0.72,
      metalness: 0.35,
      flatShading: true,
    });

    this.grassMat = new THREE.MeshStandardMaterial({
      color: 0x3da64b,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
    });

    this.flameOuterMat = new THREE.MeshBasicMaterial({
      color: 0xff8c24,
    });

    this.flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfff099,
    });
  }

  private makeCanvas(size: number): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  }

  private toNearestTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createStoneSlabTexture(size: number): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(size);
    const tones = ['#6a7079', '#636972', '#727882', '#5d636c'];

    // Draw 4x4 large stone slabs with subtle variation
    const slab = size / 4;
    let seed = 17;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        const offsetX = gy % 2 === 1 ? slab / 2 : 0;
        const sx = (gx * slab + offsetX) % size;
        const sy = gy * slab;
        ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
        ctx.fillRect(sx, sy, slab, slab);
        if (sx + slab > size) {
          ctx.fillRect(0, sy, sx + slab - size, slab);
        }

        // Pixelated speckle
        for (let p = 0; p < 10; p++) {
          ctx.fillStyle = rand() > 0.5 ? '#7a808a' : '#585e67';
          const px = (sx + Math.floor(rand() * (slab - 2)) + 1) % size;
          const py = sy + Math.floor(rand() * (slab - 2)) + 1;
          ctx.fillRect(px, py, 1, 1);
        }

        // Dark mortar joint
        ctx.fillStyle = '#434850';
        ctx.fillRect(0, sy, size, 1);
        ctx.fillRect(sx, sy, 1, slab);
      }
    }

    return this.toNearestTexture(canvas);
  }

  private createMasonryWallTexture(size: number): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(size);
    ctx.fillStyle = '#5c626b';
    ctx.fillRect(0, 0, size, size);

    const rows = 8;
    const cols = 4;
    const rh = size / rows;
    const cw = size / cols;
    const blockColors = ['#666c76', '#5e646e', '#6f7580', '#565c66'];

    for (let r = 0; r < rows; r++) {
      const shift = (r % 2) * (cw / 2);
      for (let c = 0; c < cols + 1; c++) {
        ctx.fillStyle = blockColors[(r * 3 + c) % blockColors.length];
        ctx.fillRect(c * cw - shift + 1, r * rh + 1, cw - 2, rh - 2);
      }
      ctx.fillStyle = '#3d4149';
      ctx.fillRect(0, r * rh, size, 1);
    }

    return this.toNearestTexture(canvas);
  }

  private createWoodPlankTexture(size: number): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(size);
    const planks = ['#7a4c2a', '#6d4324', '#85532f', '#643d20'];
    const pw = size / 4;

    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = planks[i % planks.length];
      ctx.fillRect(i * pw, 0, pw, size);
      ctx.fillStyle = '#4a2b15';
      ctx.fillRect(i * pw, 0, 1, size);
      // Wood grain pixels
      ctx.fillStyle = '#5c371c';
      ctx.fillRect(i * pw + 3, 4, 1, 10);
      ctx.fillRect(i * pw + 5, 18, 1, 9);
    }

    return this.toNearestTexture(canvas);
  }

  private createBrushedSteelTexture(size: number): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(size);
    ctx.fillStyle = '#d8dee6';
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 2) {
      ctx.fillStyle = y % 4 === 0 ? '#cdd5df' : '#e4eaf2';
      ctx.fillRect(0, y, size, 1);
    }
    return this.toNearestTexture(canvas);
  }

  public createBannerTexture(hexColor: number): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(32);
    const c = new THREE.Color(hexColor);
    const mainCss = `#${c.getHexString()}`;
    ctx.fillStyle = mainCss;
    ctx.fillRect(0, 0, 32, 32);

    // Heraldic gold trim & central emblem
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(2, 0, 2, 32);
    ctx.fillRect(28, 0, 2, 32);
    ctx.fillRect(2, 28, 28, 2);

    // Bold pixelated sword/cross crest in center
    ctx.fillRect(15, 6, 2, 16);
    ctx.fillRect(10, 11, 12, 2);
    ctx.fillRect(14, 22, 4, 2);

    return this.toNearestTexture(canvas);
  }
}
