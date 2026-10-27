import * as THREE from 'three';

/**
 * Generates high-craft stylized PBR textures (Albedo + Sobel Height-to-Normal + Roughness)
 * for medieval stone flagstones, castle ashlar masonry, aged oak timber, forged steel,
 * woven heraldic banners, and soft ground contact shadows.
 */
export class MaterialLibrary {
  public readonly floorTex: THREE.CanvasTexture;
  public readonly floorNormalTex: THREE.CanvasTexture;
  public readonly wallTex: THREE.CanvasTexture;
  public readonly wallNormalTex: THREE.CanvasTexture;
  public readonly woodTex: THREE.CanvasTexture;
  public readonly woodNormalTex: THREE.CanvasTexture;
  public readonly steelTex: THREE.CanvasTexture;
  public readonly steelNormalTex: THREE.CanvasTexture;
  public readonly contactShadowTex: THREE.CanvasTexture;
  public readonly crackDecalTex: THREE.CanvasTexture;

  public readonly floorMat: THREE.MeshStandardMaterial;
  public readonly curbStoneMat: THREE.MeshStandardMaterial;
  public readonly wallMat: THREE.MeshStandardMaterial;
  public readonly pillarMat: THREE.MeshStandardMaterial;
  public readonly woodMat: THREE.MeshStandardMaterial;
  public readonly darkIronMat: THREE.MeshStandardMaterial;
  public readonly bronzeTrimMat: THREE.MeshStandardMaterial;
  public readonly grassMat: THREE.MeshStandardMaterial;
  public readonly cliffRockMat: THREE.MeshStandardMaterial;
  public readonly flameOuterMat: THREE.MeshBasicMaterial;
  public readonly flameCoreMat: THREE.MeshBasicMaterial;

  constructor() {
    const floorPack = this.createStoneSlabMaps(256);
    this.floorTex = floorPack.albedo;
    this.floorNormalTex = floorPack.normal;
    for (const t of [this.floorTex, this.floorNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(7, 7);
    }

    const wallPack = this.createMasonryWallMaps(256);
    this.wallTex = wallPack.albedo;
    this.wallNormalTex = wallPack.normal;
    for (const t of [this.wallTex, this.wallNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(12, 2);
    }

    const woodPack = this.createWoodPlankMaps(128);
    this.woodTex = woodPack.albedo;
    this.woodNormalTex = woodPack.normal;
    for (const t of [this.woodTex, this.woodNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 2);
    }

    const steelPack = this.createForgedSteelMaps(128);
    this.steelTex = steelPack.albedo;
    this.steelNormalTex = steelPack.normal;
    for (const t of [this.steelTex, this.steelNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }

    this.contactShadowTex = this.createContactShadowTexture(128);
    this.crackDecalTex = this.createGroundCrackTexture(128);

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTex,
      normalMap: this.floorNormalTex,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.84,
      metalness: 0.05,
    });

    this.curbStoneMat = new THREE.MeshStandardMaterial({
      color: 0x7b828e,
      normalMap: this.floorNormalTex,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.78,
      metalness: 0.08,
    });

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      normalMap: this.wallNormalTex,
      normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.86,
      metalness: 0.05,
    });

    this.pillarMat = new THREE.MeshStandardMaterial({
      color: 0x828894,
      normalMap: this.wallNormalTex,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.8,
      metalness: 0.08,
    });

    this.woodMat = new THREE.MeshStandardMaterial({
      map: this.woodTex,
      normalMap: this.woodNormalTex,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughness: 0.84,
      metalness: 0.04,
    });

    this.darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x313742,
      normalMap: this.steelNormalTex,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.48,
      metalness: 0.72,
    });

    this.bronzeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd8a23a,
      roughness: 0.36,
      metalness: 0.78,
    });

    this.grassMat = new THREE.MeshStandardMaterial({
      color: 0x3d9946,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    });

    this.cliffRockMat = new THREE.MeshStandardMaterial({
      color: 0x4c535f,
      roughness: 0.94,
      metalness: 0.04,
      flatShading: true,
    });

    // High-HDR color (>1.0 via emissive/toneMapped:false) so UnrealBloom picks up real flames!
    this.flameOuterMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.9, 0.72, 0.14),
      toneMapped: false,
    });

    this.flameCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 1.85, 0.75),
      toneMapped: false,
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
    return { canvas, ctx };
  }

  private toAlbedoTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Converts a grayscale height array [0..1] of size N*N into a tangent-space Normal Map CanvasTexture.
   */
  private heightToNormalTexture(
    heights: Float32Array,
    size: number,
    strength: number
  ): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(size);
    const img = ctx.createImageData(size, size);
    const data = img.data;

    const sample = (x: number, y: number): number => {
      const wx = ((x % size) + size) % size;
      const wy = ((y % size) + size) % size;
      return heights[wy * size + wx];
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const tl = sample(x - 1, y - 1);
        const t = sample(x, y - 1);
        const tr = sample(x + 1, y - 1);
        const l = sample(x - 1, y);
        const r = sample(x + 1, y);
        const bl = sample(x - 1, y + 1);
        const b = sample(x, y + 1);
        const br = sample(x + 1, y + 1);

        const dX = tr + 2 * r + br - (tl + 2 * l + bl);
        const dY = bl + 2 * b + br - (tl + 2 * t + tr);

        let nx = -dX * strength;
        let ny = -dY * strength;
        let nz = 1.0;
        const invLen = 1 / Math.hypot(nx, ny, nz);
        nx *= invLen;
        ny *= invLen;
        nz *= invLen;

        const idx = (y * size + x) * 4;
        data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  private createStoneSlabMaps(size: number): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
  } {
    const { canvas, ctx } = this.makeCanvas(size);
    const heights = new Float32Array(size * size);
    const img = ctx.createImageData(size, size);
    const data = img.data;

    let seed = 101;
    const hash = (x: number, y: number): number => {
      const n = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
      return n - Math.floor(n);
    };

    const rows = 4;
    const cols = 4;
    const cellW = size / cols;
    const cellH = size / rows;

    const palette = [
      [112, 117, 126],
      [103, 109, 118],
      [121, 124, 130],
      [98, 103, 112],
      [116, 114, 110], // subtle warm limestone block
    ];

    for (let y = 0; y < size; y++) {
      const row = Math.floor(y / cellH);
      const localY = y - row * cellH;
      const shiftX = (row % 2) * (cellW * 0.5);

      for (let x = 0; x < size; x++) {
        const shiftedX = (x + shiftX) % size;
        const col = Math.floor(shiftedX / cellW);
        const localX = shiftedX - col * cellW;

        // Distance to mortar edge for smooth beveled stone chamfer
        const edgeDistX = Math.min(localX, cellW - localX);
        const edgeDistY = Math.min(localY, cellH - localY);
        const edgeDist = Math.min(edgeDistX, edgeDistY);

        const bevel = Math.min(1, Math.max(0, (edgeDist - 1.5) / 5.0));
        const grain =
          (hash(Math.floor(x / 2), Math.floor(y / 2)) - 0.5) * 0.14 +
          (hash(x, y) - 0.5) * 0.06;

        const blockSeed = Math.floor(hash(col * 13 + row * 7, row * 29) * palette.length);
        const base = palette[blockSeed % palette.length];

        const h = Math.max(0, Math.min(1, bevel * 0.85 + grain + 0.1));
        heights[y * size + x] = h;

        // Subtle moss tint inside mortar crevices
        const isMortar = edgeDist < 2.2;
        const moss = isMortar && hash(col + x * 0.1, row + y * 0.1) > 0.62;

        const shade = 0.52 + bevel * 0.48 + grain * 0.55;
        const idx = (y * size + x) * 4;
        if (moss) {
          data[idx] = Math.round(62 * shade + 12);
          data[idx + 1] = Math.round(88 * shade + 18);
          data[idx + 2] = Math.round(58 * shade + 10);
        } else if (isMortar) {
          data[idx] = 56;
          data[idx + 1] = 60;
          data[idx + 2] = 67;
        } else {
          data[idx] = Math.min(255, Math.max(0, Math.round(base[0] * shade)));
          data[idx + 1] = Math.min(255, Math.max(0, Math.round(base[1] * shade)));
          data[idx + 2] = Math.min(255, Math.max(0, Math.round(base[2] * shade)));
        }
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return {
      albedo: this.toAlbedoTexture(canvas),
      normal: this.heightToNormalTexture(heights, size, 2.6),
    };
  }

  private createMasonryWallMaps(size: number): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
  } {
    const { canvas, ctx } = this.makeCanvas(size);
    const heights = new Float32Array(size * size);
    const img = ctx.createImageData(size, size);
    const data = img.data;

    const hash = (x: number, y: number): number => {
      const n = Math.sin(x * 91.7 + y * 241.3 + 33.1) * 43758.5453;
      return n - Math.floor(n);
    };

    const rows = 8;
    const cols = 4;
    const cellW = size / cols;
    const cellH = size / rows;
    const stones = [
      [104, 110, 120],
      [94, 100, 110],
      [114, 118, 126],
      [89, 95, 105],
    ];

    for (let y = 0; y < size; y++) {
      const row = Math.floor(y / cellH);
      const localY = y - row * cellH;
      const shiftX = (row % 2) * (cellW * 0.5);

      for (let x = 0; x < size; x++) {
        const sx = (x + shiftX) % size;
        const col = Math.floor(sx / cellW);
        const localX = sx - col * cellW;

        const edge = Math.min(
          Math.min(localX, cellW - localX),
          Math.min(localY, cellH - localY)
        );
        const bevel = Math.min(1, Math.max(0, (edge - 1.5) / 4.0));
        const noise = (hash(Math.floor(x / 2), Math.floor(y / 2)) - 0.5) * 0.16;

        heights[y * size + x] = Math.max(0, Math.min(1, bevel * 0.85 + noise + 0.1));

        const c = stones[(row * 5 + col * 3) % stones.length];
        const shade = edge < 1.8 ? 0.45 : 0.68 + bevel * 0.32 + noise * 0.5;
        const idx = (y * size + x) * 4;
        data[idx] = Math.min(255, Math.max(0, Math.round(c[0] * shade)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(c[1] * shade)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(c[2] * shade)));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return {
      albedo: this.toAlbedoTexture(canvas),
      normal: this.heightToNormalTexture(heights, size, 2.8),
    };
  }

  private createWoodPlankMaps(size: number): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
  } {
    const { canvas, ctx } = this.makeCanvas(size);
    const heights = new Float32Array(size * size);
    const img = ctx.createImageData(size, size);
    const data = img.data;

    const planks = 4;
    const pw = size / planks;
    const tones = [
      [130, 82, 46],
      [116, 72, 39],
      [139, 89, 50],
      [108, 66, 35],
    ];

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pIdx = Math.floor(x / pw);
        const lx = x - pIdx * pw;
        const seam = Math.min(lx, pw - lx);
        const fiber =
          Math.sin(x * 1.4 + Math.sin(y * 0.14 + pIdx) * 2.2) * 0.08 +
          Math.cos(y * 0.35 + pIdx * 2) * 0.04;
        const bevel = Math.min(1, seam / 3.0);

        heights[y * size + x] = Math.max(0, Math.min(1, bevel * 0.8 + fiber + 0.15));

        const base = tones[pIdx % tones.length];
        const shade = seam < 1.2 ? 0.42 : 0.78 + bevel * 0.2 + fiber * 0.9;
        const idx = (y * size + x) * 4;
        data[idx] = Math.min(255, Math.max(0, Math.round(base[0] * shade)));
        data[idx + 1] = Math.min(255, Math.max(0, Math.round(base[1] * shade)));
        data[idx + 2] = Math.min(255, Math.max(0, Math.round(base[2] * shade)));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return {
      albedo: this.toAlbedoTexture(canvas),
      normal: this.heightToNormalTexture(heights, size, 1.9),
    };
  }

  private createForgedSteelMaps(size: number): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
  } {
    const { canvas, ctx } = this.makeCanvas(size);
    const heights = new Float32Array(size * size);
    const img = ctx.createImageData(size, size);
    const data = img.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const brush = Math.sin(y * 1.9 + Math.sin(x * 0.25) * 0.8) * 0.04;
        const hammer =
          Math.sin(x * 0.22) * Math.cos(y * 0.22) * 0.06;
        const h = 0.5 + brush + hammer;
        heights[y * size + x] = h;

        const v = Math.round(218 + (brush + hammer) * 140);
        const idx = (y * size + x) * 4;
        data[idx] = v;
        data[idx + 1] = Math.min(255, v + 4);
        data[idx + 2] = Math.min(255, v + 10);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return {
      albedo: this.toAlbedoTexture(canvas),
      normal: this.heightToNormalTexture(heights, size, 1.1),
    };
  }

  private createContactShadowTexture(size: number): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(size);
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.06,
      size / 2,
      size / 2,
      size * 0.48
    );
    grad.addColorStop(0, 'rgba(6, 8, 12, 0.72)');
    grad.addColorStop(0.55, 'rgba(8, 10, 15, 0.34)');
    grad.addColorStop(1, 'rgba(8, 10, 15, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return this.toAlbedoTexture(canvas);
  }

  private createGroundCrackTexture(size: number): THREE.CanvasTexture {
    const { canvas, ctx } = this.makeCanvas(size);
    const cx = size / 2;
    const cy = size / 2;

    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.46);
    glow.addColorStop(0, 'rgba(255, 165, 52, 0.85)');
    glow.addColorStop(0.35, 'rgba(42, 34, 28, 0.72)');
    glow.addColorStop(1, 'rgba(20, 20, 22, 0.0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);

    // Jagged radial stone fracture lines
    ctx.strokeStyle = 'rgba(22, 18, 15, 0.92)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9 + 0.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const midR = size * 0.22;
      const endR = size * 0.44;
      ctx.lineTo(
        cx + Math.cos(a + 0.14) * midR,
        cy + Math.sin(a + 0.14) * midR
      );
      ctx.lineTo(
        cx + Math.cos(a - 0.08) * endR,
        cy + Math.sin(a - 0.08) * endR
      );
      ctx.stroke();
    }
    return this.toAlbedoTexture(canvas);
  }

  public createBannerTexture(hexColor: number): THREE.CanvasTexture {
    const size = 128;
    const { canvas, ctx } = this.makeCanvas(size);
    const c = new THREE.Color(hexColor);

    // Rich fabric gradient
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, `#${c.clone().multiplyScalar(1.12).getHexString()}`);
    grad.addColorStop(1, `#${c.clone().multiplyScalar(0.72).getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle woven cloth crosshatch
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    for (let y = 0; y < size; y += 4) {
      ctx.fillRect(0, y, size, 1);
    }

    // Embroidered royal gold borders
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(8, 0, 6, size);
    ctx.fillRect(size - 14, 0, 6, size);
    ctx.fillRect(8, size - 16, size - 16, 6);

    // Central medieval crest (shield + sword + crown)
    ctx.save();
    ctx.translate(size / 2, size * 0.44);
    ctx.fillStyle = '#f6cf65';
    ctx.beginPath();
    ctx.moveTo(-22, -22);
    ctx.lineTo(22, -22);
    ctx.lineTo(18, 10);
    ctx.lineTo(0, 28);
    ctx.lineTo(-18, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `#${c.clone().multiplyScalar(0.6).getHexString()}`;
    ctx.beginPath();
    ctx.moveTo(-16, -16);
    ctx.lineTo(16, -16);
    ctx.lineTo(13, 7);
    ctx.lineTo(0, 21);
    ctx.lineTo(-13, 7);
    ctx.closePath();
    ctx.fill();

    // Sword silhouette inside crest
    ctx.fillStyle = '#fff3c4';
    ctx.fillRect(-3, -28, 6, 44);
    ctx.fillRect(-13, -10, 26, 5);
    ctx.restore();

    return this.toAlbedoTexture(canvas);
  }
}
