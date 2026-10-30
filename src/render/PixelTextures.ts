import * as THREE from 'three';
import { KnightClassId } from '../config/classes';
import { ArenaThemeId } from '../config/settings';

/**
 * High-Detail Hand-Crafted Procedural PBR Texture & Material Library:
 * - 1024x1024 Bespoke Radial Medieval Courtyard Floor (concentric cobbles, inlaid compass medallion, moss & wear) + Normal Map
 * - Ashlar Fortress Stone Masonry + Normal Map
 * - Interlocking Iron Chainmail Hauberk + Normal Map
 * - Aged Oak Timber & Forged Tempered Steel + Normal Maps
 * - Hand-Painted Class Heraldry (Shields, Surcoats, Swallowtail Tournament Banners)
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
  public readonly chainmailTex: THREE.CanvasTexture;
  public readonly chainmailNormalTex: THREE.CanvasTexture;
  public readonly contactShadowTex: THREE.CanvasTexture;
  public readonly crackDecalTex: THREE.CanvasTexture;
  public readonly pbrHardwoodDiffuse: THREE.Texture;
  public readonly pbrHardwoodBump: THREE.Texture;
  public readonly pbrHardwoodRoughness: THREE.Texture;
  public readonly pbrMarbleDiffuse: THREE.Texture;
  public readonly pbrMarbleNormal: THREE.Texture;

  public readonly floorMat: THREE.MeshStandardMaterial;
  public readonly curbStoneMat: THREE.MeshStandardMaterial;
  public readonly wallMat: THREE.MeshStandardMaterial;
  public readonly darkStoneMat: THREE.MeshStandardMaterial;
  public readonly pillarMat: THREE.MeshStandardMaterial;
  public readonly woodMat: THREE.MeshStandardMaterial;
  public readonly darkIronMat: THREE.MeshStandardMaterial;
  public readonly chainmailMat: THREE.MeshStandardMaterial;
  public readonly bronzeTrimMat: THREE.MeshStandardMaterial;
  public readonly leatherMat: THREE.MeshStandardMaterial;
  public readonly grassMat: THREE.MeshStandardMaterial;
  public readonly ivyMat: THREE.MeshStandardMaterial;
  public readonly cliffRockMat: THREE.MeshStandardMaterial;
  public readonly emberCoalMat: THREE.MeshBasicMaterial;
  public readonly flameOuterMat: THREE.MeshBasicMaterial;
  public readonly flameCoreMat: THREE.MeshBasicMaterial;

  constructor() {
    // 1. Bespoke 1024x1024 Radial Courtyard Cobblestone & Compass Floor (mapped 1:1 to arena disc!)
    const floorPack = this.createRadialCourtyardMaps(1024);
    this.floorTex = floorPack.albedo;
    this.floorNormalTex = floorPack.normal;

    // 2. Fortress Ashlar Wall Masonry
    const wallPack = this.createMasonryWallMaps(256);
    this.wallTex = wallPack.albedo;
    this.wallNormalTex = wallPack.normal;
    for (const t of [this.wallTex, this.wallNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 2);
    }

    // 3. Aged Oak Timber
    const woodPack = this.createWoodPlankMaps(128);
    this.woodTex = woodPack.albedo;
    this.woodNormalTex = woodPack.normal;
    for (const t of [this.woodTex, this.woodNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 2);
    }

    // 4. Forged Tempered Steel
    const steelPack = this.createForgedSteelMaps(128);
    this.steelTex = steelPack.albedo;
    this.steelNormalTex = steelPack.normal;
    for (const t of [this.steelTex, this.steelNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }

    // 5. Interlocking Ring Chainmail
    const mailPack = this.createChainmailMaps(128);
    this.chainmailTex = mailPack.albedo;
    this.chainmailNormalTex = mailPack.normal;
    for (const t of [this.chainmailTex, this.chainmailNormalTex]) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(4, 4);
    }

    this.contactShadowTex = this.createContactShadowTexture(128);
    this.crackDecalTex = this.createGroundCrackTexture(128);

    // 6. Real Open-Source PBR Hardwood Plank & Royal Marble Textures (with headless fallback)
    this.pbrHardwoodDiffuse = this.loadSeamlessArenaTex(
      'textures/arena/hardwood2_diffuse.jpg',
      true,
      10
    );
    this.pbrHardwoodBump = this.loadSeamlessArenaTex(
      'textures/arena/hardwood2_bump.jpg',
      false,
      10
    );
    this.pbrHardwoodRoughness = this.loadSeamlessArenaTex(
      'textures/arena/hardwood2_roughness.jpg',
      false,
      10
    );
    this.pbrMarbleDiffuse = this.loadSeamlessArenaTex(
      'textures/arena/marble_checker_diffuse.jpg',
      true,
      12
    );
    this.pbrMarbleNormal = this.loadSeamlessArenaTex(
      'textures/arena/marble_checker_normal.jpg',
      false,
      12
    );

    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTex,
      normalMap: this.floorNormalTex,
      normalScale: new THREE.Vector2(1.35, 1.35),
      roughness: 0.82,
      metalness: 0.06,
    });

    this.curbStoneMat = new THREE.MeshStandardMaterial({
      color: 0x828894,
      normalMap: this.wallNormalTex,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 0.78,
      metalness: 0.07,
    });

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      normalMap: this.wallNormalTex,
      normalScale: new THREE.Vector2(1.3, 1.3),
      roughness: 0.85,
      metalness: 0.05,
    });

    this.darkStoneMat = new THREE.MeshStandardMaterial({
      color: 0x4f5561,
      normalMap: this.wallNormalTex,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.88,
      metalness: 0.06,
    });

    this.pillarMat = new THREE.MeshStandardMaterial({
      color: 0x888f9c,
      normalMap: this.wallNormalTex,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.76,
      metalness: 0.08,
    });

    this.woodMat = new THREE.MeshStandardMaterial({
      map: this.woodTex,
      normalMap: this.woodNormalTex,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.82,
      metalness: 0.04,
    });

    this.darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x2c323d,
      normalMap: this.steelNormalTex,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.44,
      metalness: 0.78,
    });

    this.chainmailMat = new THREE.MeshStandardMaterial({
      map: this.chainmailTex,
      normalMap: this.chainmailNormalTex,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.46,
      metalness: 0.76,
    });

    this.bronzeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xdfa83c,
      roughness: 0.3,
      metalness: 0.84,
    });

    this.leatherMat = new THREE.MeshStandardMaterial({
      color: 0x4e2d18,
      normalMap: this.woodNormalTex,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.74,
      metalness: 0.06,
    });

    this.grassMat = new THREE.MeshStandardMaterial({
      color: 0x3b9644,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
    });

    this.ivyMat = new THREE.MeshStandardMaterial({
      color: 0x2e7d38,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true,
    });

    this.cliffRockMat = new THREE.MeshStandardMaterial({
      color: 0x4b525e,
      roughness: 0.94,
      metalness: 0.04,
      flatShading: true,
    });

    this.emberCoalMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.6, 0.42, 0.08),
      toneMapped: false,
    });

    this.flameOuterMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.95, 0.74, 0.14),
      toneMapped: false,
    });

    this.flameCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.45, 1.9, 0.8),
      toneMapped: false,
    });

    this.applyArenaTheme('oak_tournament');
  }

  private loadSeamlessArenaTex(
    relPath: string,
    srgb: boolean,
    repeat: number
  ): THREE.Texture {
    if (typeof document === 'undefined') {
      const data = new Uint8Array([200, 170, 130, 255]);
      const fallback = new THREE.DataTexture(data, 1, 1);
      fallback.wrapS = THREE.RepeatWrapping;
      fallback.wrapT = THREE.RepeatWrapping;
      fallback.repeat.set(repeat, repeat);
      fallback.needsUpdate = true;
      return fallback;
    }
    const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
    const rawBase = meta.env?.BASE_URL ?? './';
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    const tex = new THREE.TextureLoader().load(`${base}${relPath}`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 4;
    if (srgb) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    return tex;
  }

  /**
   * Live-switches Arena PBR ground, wood decking, pedestal, and masonry colors.
   */
  public applyArenaTheme(theme: ArenaThemeId): void {
    if (theme === 'oak_tournament') {
      this.floorMat.map = this.pbrHardwoodDiffuse;
      this.floorMat.normalMap = null;
      this.floorMat.bumpMap = this.pbrHardwoodBump;
      this.floorMat.bumpScale = 0.045;
      this.floorMat.roughnessMap = this.pbrHardwoodRoughness;
      this.floorMat.color.setHex(0xf2d2ad);
      this.floorMat.roughness = 0.78;

      this.woodMat.map = this.pbrHardwoodDiffuse;
      this.woodMat.bumpMap = this.pbrHardwoodBump;
      this.woodMat.bumpScale = 0.035;
      this.woodMat.color.setHex(0xe8c49b);

      this.curbStoneMat.color.setHex(0xc4b093);
      this.pillarMat.map = this.pbrHardwoodDiffuse;
      this.pillarMat.color.setHex(0xd8a876);
      this.wallMat.color.setHex(0xfff0d8);
      this.cliffRockMat.color.setHex(0x635749);
    } else if (theme === 'sandstone_colosseum') {
      this.floorMat.map = this.floorTex;
      this.floorMat.normalMap = this.floorNormalTex;
      this.floorMat.bumpMap = null;
      this.floorMat.roughnessMap = null;
      this.floorMat.color.setHex(0xf6cf92);
      this.floorMat.roughness = 0.86;

      this.woodMat.map = this.pbrHardwoodDiffuse;
      this.woodMat.bumpMap = this.pbrHardwoodBump;
      this.woodMat.color.setHex(0xdfb483);

      this.curbStoneMat.color.setHex(0xd4ad76);
      this.pillarMat.map = null;
      this.pillarMat.color.setHex(0xe2be88);
      this.wallMat.color.setHex(0xf7d69e);
      this.cliffRockMat.color.setHex(0x735b3d);
    } else if (theme === 'azure_marble') {
      this.floorMat.map = this.pbrMarbleDiffuse;
      this.floorMat.normalMap = this.pbrMarbleNormal;
      this.floorMat.bumpMap = null;
      this.floorMat.roughnessMap = null;
      this.floorMat.color.setHex(0xd8ecff);
      this.floorMat.roughness = 0.58;

      this.woodMat.map = this.pbrHardwoodDiffuse;
      this.woodMat.bumpMap = this.pbrHardwoodBump;
      this.woodMat.color.setHex(0x8e6b4e);

      this.curbStoneMat.color.setHex(0x94aec9);
      this.pillarMat.map = this.pbrMarbleDiffuse;
      this.pillarMat.color.setHex(0xd8ecff);
      this.wallMat.color.setHex(0xd8ebff);
      this.cliffRockMat.color.setHex(0x46566b);
    } else {
      // 'obsidian_citadel'
      this.floorMat.map = this.floorTex;
      this.floorMat.normalMap = this.floorNormalTex;
      this.floorMat.bumpMap = null;
      this.floorMat.roughnessMap = null;
      this.floorMat.color.setHex(0x9099ab);
      this.floorMat.roughness = 0.82;

      this.woodMat.map = this.woodTex;
      this.woodMat.bumpMap = null;
      this.woodMat.color.setHex(0xb89674);

      this.curbStoneMat.color.setHex(0x6e7685);
      this.pillarMat.map = null;
      this.pillarMat.color.setHex(0x7d8696);
      this.wallMat.color.setHex(0x8d97ab);
      this.cliffRockMat.color.setHex(0x3f4552);
    }

    this.floorMat.needsUpdate = true;
    this.woodMat.needsUpdate = true;
    this.curbStoneMat.needsUpdate = true;
    this.pillarMat.needsUpdate = true;
    this.wallMat.needsUpdate = true;
    this.cliffRockMat.needsUpdate = true;
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
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

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
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Paints a 1024x1024 custom radial stone courtyard floor with concentric wedge-cut
   * medieval cobblestones, drainage channels, inlaid tournament rings, compass rose,
   * battle wear, and mossy outer joints!
   */
  private createRadialCourtyardMaps(size: number): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
  } {
    const { canvas, ctx } = this.makeCanvas(size);
    const cx = size / 2;
    const cy = size / 2;
    const maxR = size * 0.49;

    // Base mortar bed
    ctx.fillStyle = '#383c44';
    ctx.fillRect(0, 0, size, size);

    let seed = 777;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    const stoneColors = [
      '#6d737e',
      '#646a75',
      '#767c87',
      '#5f6570',
      '#75736e', // warm weathered sandstone block
      '#6a7178',
    ];

    // Draw 22 concentric cobblestone rings from r = 56px out to maxR
    let rInner = 62;
    let ringIdx = 0;
    while (rInner < maxR) {
      const isBandRing = ringIdx === 6 || ringIdx === 14;
      const ringThickness = isBandRing ? 18 : 19 + (ringIdx % 3) * 3;
      const rOuter = Math.min(maxR, rInner + ringThickness);
      const midR = (rInner + rOuter) * 0.5;
      const circumference = 2 * Math.PI * midR;
      const targetStoneW = isBandRing ? 34 : 24;
      const count = Math.max(12, Math.round(circumference / targetStoneW));
      const angleStep = (Math.PI * 2) / count;
      const angleOffset = (ringIdx % 2) * (angleStep * 0.5);

      // Outer perimeter moss factor
      const outerMossChance = Math.max(0, (rInner - maxR * 0.78) / (maxR * 0.22));

      for (let i = 0; i < count; i++) {
        const a0 = i * angleStep + angleOffset + 0.006;
        const a1 = (i + 1) * angleStep + angleOffset - 0.006;

        ctx.beginPath();
        ctx.arc(cx, cy, rOuter - 1.4, a0, a1, false);
        ctx.arc(cx, cy, rInner + 1.4, a1, a0, true);
        ctx.closePath();

        if (isBandRing) {
          ctx.fillStyle = i % 2 === 0 ? '#848891' : '#777c86';
        } else {
          ctx.fillStyle = stoneColors[Math.floor(rand() * stoneColors.length)];
        }
        ctx.fill();

        // Subtle stone bevel highlight on sun-facing edge
        ctx.strokeStyle = 'rgba(210, 218, 230, 0.14)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Occasional moss patch in outer joints
        if (outerMossChance > 0 && rand() < outerMossChance * 0.55) {
          const ma = (a0 + a1) * 0.5;
          ctx.fillStyle = 'rgba(58, 118, 56, 0.52)';
          ctx.beginPath();
          ctx.arc(
            cx + Math.cos(ma) * rInner,
            cy + Math.sin(ma) * rInner,
            3.5 + rand() * 3.5,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      rInner = rOuter;
      ringIdx += 1;
    }

    // Draw 8 radial stone rib spokes for grand architectural symmetry
    ctx.save();
    ctx.translate(cx, cy);
    for (let s = 0; s < 8; s++) {
      ctx.save();
      ctx.rotate((s * Math.PI) / 4);
      ctx.fillStyle = 'rgba(138, 143, 152, 0.42)';
      ctx.fillRect(62, -4, maxR - 66, 8);
      ctx.strokeStyle = 'rgba(42, 46, 54, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(62, -4, maxR - 66, 8);
      ctx.restore();
    }

    // Central Carved Stone & Tarnished Gold Compass Rose Medallion (r <= 62px)
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fillStyle = '#555b66';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#c5983e';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 48, 0, Math.PI * 2);
    ctx.fillStyle = '#707682';
    ctx.fill();

    // 8-point Heraldic Compass Star
    for (let p = 0; p < 8; p++) {
      ctx.save();
      ctx.rotate((p * Math.PI) / 4);
      const len = p % 2 === 0 ? 45 : 32;
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(9, -9);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = p % 2 === 0 ? '#d8a848' : '#9aa2b0';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(-9, -9);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = p % 2 === 0 ? '#a67c2b' : '#6c7380';
      ctx.fill();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#dfb04b';
    ctx.fill();
    ctx.restore();

    // Add fine pixel stone grain & battle scratch marks across the whole courtyard
    const img = ctx.getImageData(0, 0, size, size);
    const data = img.data;
    const heights = new Float32Array(size * size);

    for (let i = 0; i < size * size; i++) {
      const idx = i * 4;
      const grain = (rand() - 0.5) * 14;
      const r = Math.min(255, Math.max(0, data[idx] + grain));
      const g = Math.min(255, Math.max(0, data[idx + 1] + grain));
      const b = Math.min(255, Math.max(0, data[idx + 2] + grain));
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      // Luminance closely tracks mortar depth vs raised stone face!
      heights[i] = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
    }
    ctx.putImageData(img, 0, 0);

    return {
      albedo: this.toAlbedoTexture(canvas),
      normal: this.heightToNormalTexture(heights, size, 2.4),
    };
  }

  private createChainmailMaps(size: number): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
  } {
    const { canvas, ctx } = this.makeCanvas(size);
    ctx.fillStyle = '#252930';
    ctx.fillRect(0, 0, size, size);

    const rows = 8;
    const cols = 8;
    const stepX = size / cols;
    const stepY = size / rows;

    ctx.lineWidth = 3.2;
    for (let r = -1; r <= rows; r++) {
      const offsetX = (r % 2) * (stepX * 0.5);
      for (let c = -1; c <= cols; c++) {
        const rx = c * stepX + offsetX;
        const ry = r * stepY;
        ctx.strokeStyle = r % 2 === 0 ? '#9ba5b4' : '#858f9e';
        ctx.beginPath();
        ctx.ellipse(rx, ry, stepX * 0.44, stepY * 0.36, 0.18, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    const img = ctx.getImageData(0, 0, size, size);
    const heights = new Float32Array(size * size);
    for (let i = 0; i < size * size; i++) {
      heights[i] = img.data[i * 4] / 255;
    }

    return {
      albedo: this.toAlbedoTexture(canvas),
      normal: this.heightToNormalTexture(heights, size, 2.5),
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
      [108, 114, 124],
      [96, 102, 112],
      [118, 122, 130],
      [92, 98, 108],
      [112, 110, 105],
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
        const bevel = Math.min(1, Math.max(0, (edge - 1.5) / 4.2));
        const noise = (hash(Math.floor(x / 2), Math.floor(y / 2)) - 0.5) * 0.16;

        heights[y * size + x] = Math.max(0, Math.min(1, bevel * 0.85 + noise + 0.1));

        const c = stones[(row * 5 + col * 3) % stones.length];
        const shade = edge < 1.8 ? 0.42 : 0.68 + bevel * 0.32 + noise * 0.5;
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
      [132, 84, 47],
      [116, 72, 39],
      [142, 91, 52],
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
        const hammer = Math.sin(x * 0.22) * Math.cos(y * 0.22) * 0.06;
        // Subtle diagonal battle scratch
        const scratch =
          Math.abs(((x + y * 2) % 47) - 23) < 0.8 ? -0.08 : 0.0;
        const h = 0.5 + brush + hammer + scratch;
        heights[y * size + x] = h;

        const v = Math.round(220 + (brush + hammer + scratch) * 145);
        const idx = (y * size + x) * 4;
        data[idx] = Math.max(0, Math.min(255, v));
        data[idx + 1] = Math.max(0, Math.min(255, v + 4));
        data[idx + 2] = Math.max(0, Math.min(255, v + 10));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return {
      albedo: this.toAlbedoTexture(canvas),
      normal: this.heightToNormalTexture(heights, size, 1.25),
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
    grad.addColorStop(0, 'rgba(6, 8, 12, 0.76)');
    grad.addColorStop(0.55, 'rgba(8, 10, 15, 0.36)');
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

  /**
   * Hand-painted Heraldic Surcoat / Shield / Cape Fabric Texture tailored per Knight Class!
   */
  public createClassHeraldryTexture(
    classId: KnightClassId,
    clothHex: number
  ): THREE.CanvasTexture {
    const size = 128;
    const { canvas, ctx } = this.makeCanvas(size);
    const base = new THREE.Color(clothHex);
    const darkCss = `#${base.clone().multiplyScalar(0.62).getHexString()}`;
    const mainCss = `#${base.getHexString()}`;
    const lightCss = `#${base.clone().multiplyScalar(1.18).getHexString()}`;

    // Quartered heraldic background!
    ctx.fillStyle = mainCss;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = darkCss;
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

    // Woven linen fabric texture lines
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < size; y += 3) {
      ctx.fillRect(0, y, size, 1);
    }

    // Gold embroidered border trim
    ctx.strokeStyle = '#f2c350';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, size - 10, size - 10);

    ctx.strokeStyle = lightCss;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(11, 11, size - 22, size - 22);

    // Class-specific hand-drawn heraldic crest in center!
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.fillStyle = '#ffd970';
    ctx.strokeStyle = '#3b2508';
    ctx.lineWidth = 2;

    if (classId === 'sword') {
      // Crowned Fleur-de-Lis / Royal Sword Crest
      ctx.fillRect(-4, -34, 8, 66);
      ctx.fillRect(-20, -10, 40, 7);
      ctx.beginPath();
      ctx.arc(0, -10, 14, 0, Math.PI * 2);
      ctx.stroke();
      // Crown points above
      ctx.beginPath();
      ctx.moveTo(-16, -24);
      ctx.lineTo(-10, -36);
      ctx.lineTo(0, -28);
      ctx.lineTo(10, -36);
      ctx.lineTo(16, -24);
      ctx.closePath();
      ctx.fill();
    } else if (classId === 'dual') {
      // Crossed Twin Blades & Diamond Studs
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.rotate(s * 0.65);
        ctx.fillRect(-3, -36, 6, 68);
        ctx.fillRect(-13, 14, 26, 5);
        ctx.restore();
      }
    } else if (classId === 'spear') {
      // Winged Spearhead & Chevrons
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.lineTo(16, -6);
      ctx.lineTo(5, -10);
      ctx.lineTo(5, 34);
      ctx.lineTo(-5, 34);
      ctx.lineTo(-5, -10);
      ctx.lineTo(-16, -6);
      ctx.closePath();
      ctx.fill();
    } else {
      // Blazing Fortress Sun & Warhammer Crest
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 4);
        ctx.beginPath();
        ctx.moveTo(0, -34);
        ctx.lineTo(7, -14);
        ctx.lineTo(-7, -14);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    return this.toAlbedoTexture(canvas);
  }

  /**
   * Swallowtail Tournament Wall Banner with alpha-cutout swallowtail V-notch!
   */
  public createBannerTexture(hexColor: number): THREE.CanvasTexture {
    const size = 128;
    const { canvas, ctx } = this.makeCanvas(size);
    const c = new THREE.Color(hexColor);

    ctx.clearRect(0, 0, size, size);

    // Swallowtail silhouette clipping path!
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.lineTo(size - 4, 0);
    ctx.lineTo(size - 6, size - 4);
    ctx.lineTo(size / 2, size - 28); // Swallowtail V-cutout!
    ctx.lineTo(6, size - 4);
    ctx.closePath();
    ctx.clip();

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, `#${c.clone().multiplyScalar(1.16).getHexString()}`);
    grad.addColorStop(1, `#${c.clone().multiplyScalar(0.68).getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle vertical stripe
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(size * 0.36, 0, size * 0.28, size);

    // Woven texture
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < size; y += 4) {
      ctx.fillRect(0, y, size, 1);
    }

    // Gold embroidered side trims
    ctx.fillStyle = '#f3c452';
    ctx.fillRect(10, 0, 6, size);
    ctx.fillRect(size - 16, 0, 6, size);

    // Ornate Heraldic Escutcheon Shield + Crossed Swords + Crown
    ctx.translate(size / 2, size * 0.4);
    ctx.fillStyle = '#f8d26a';
    ctx.beginPath();
    ctx.moveTo(-24, -24);
    ctx.lineTo(24, -24);
    ctx.lineTo(20, 10);
    ctx.lineTo(0, 30);
    ctx.lineTo(-20, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = `#${c.clone().multiplyScalar(0.55).getHexString()}`;
    ctx.beginPath();
    ctx.moveTo(-18, -18);
    ctx.lineTo(18, -18);
    ctx.lineTo(15, 8);
    ctx.lineTo(0, 23);
    ctx.lineTo(-15, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fff5cf';
    ctx.fillRect(-3, -30, 6, 48);
    ctx.fillRect(-15, -11, 30, 5);
    ctx.restore();

    return this.toAlbedoTexture(canvas);
  }
}
