import * as THREE from 'three';
import { KnightClassId } from '../config/classes';

/**
 * Crisp Low-Poly Pixel-Art Texture & Material Library (Blockbench / Faceted Chibi-Heroic Style).
 * Every texture is hand-drawn on low-resolution integer pixel grids with THREE.NearestFilter
 * and generateMipmaps = false — zero blurry filtering, zero noisy normal-map grain,
 * delivering razor-sharp pixel art across flat-shaded 3D geometry.
 */
export class MaterialLibrary {
  public readonly floorTex: THREE.CanvasTexture;
  public readonly wallTex: THREE.CanvasTexture;
  public readonly woodTex: THREE.CanvasTexture;
  public readonly chainmailTex: THREE.CanvasTexture;
  public readonly grassTex: THREE.CanvasTexture;
  public readonly contactShadowTex: THREE.CanvasTexture;
  public readonly crackDecalTex: THREE.CanvasTexture;

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

  private readonly faceCache = new Map<string, THREE.CanvasTexture>();
  private readonly armorCache = new Map<string, THREE.CanvasTexture>();
  private readonly heraldryCache = new Map<string, THREE.CanvasTexture>();

  constructor() {
    // 1. 256x256 Crisp Pixel-Art Radial Courtyard Cobblestone & Compass Floor
    this.floorTex = this.createPixelRadialFloor(256);

    // 2. 64x64 Crisp Pixel-Art Stone Brick Wall
    this.wallTex = this.createPixelBrickWall(64);
    this.wallTex.wrapS = THREE.RepeatWrapping;
    this.wallTex.wrapT = THREE.RepeatWrapping;
    this.wallTex.repeat.set(2, 2);

    // 3. 32x32 Crisp Pixel-Art Oak Wood Planks
    this.woodTex = this.createPixelWoodPlanks(32);
    this.woodTex.wrapS = THREE.RepeatWrapping;
    this.woodTex.wrapT = THREE.RepeatWrapping;
    this.woodTex.repeat.set(2, 2);

    // 4. 32x32 Crisp Pixel-Art Chainmail Rings
    this.chainmailTex = this.createPixelChainmail(32);
    this.chainmailTex.wrapS = THREE.RepeatWrapping;
    this.chainmailTex.wrapT = THREE.RepeatWrapping;
    this.chainmailTex.repeat.set(3, 3);

    // 5. 32x32 Crisp Pixel-Art Meadow Grass
    this.grassTex = this.createPixelGrass(32);
    this.grassTex.wrapS = THREE.RepeatWrapping;
    this.grassTex.wrapT = THREE.RepeatWrapping;
    this.grassTex.repeat.set(24, 24);

    this.contactShadowTex = this.createContactShadowTexture(64);
    this.crackDecalTex = this.createGroundCrackTexture(64);

    // Clean, matte, flat-shaded low-poly materials (zero glossy PBR smudge!)
    this.floorMat = new THREE.MeshStandardMaterial({
      map: this.floorTex,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.12,
    });

    this.curbStoneMat = new THREE.MeshStandardMaterial({
      color: 0xa2acb8,
      roughness: 0.94,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.15,
    });

    this.wallMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.12,
    });

    this.darkStoneMat = new THREE.MeshStandardMaterial({
      color: 0x555e70,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.1,
    });

    this.pillarMat = new THREE.MeshStandardMaterial({
      map: this.wallTex,
      color: 0xb4becb,
      roughness: 0.92,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.15,
    });

    this.woodMat = new THREE.MeshStandardMaterial({
      map: this.woodTex,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.1,
    });

    this.darkIronMat = new THREE.MeshStandardMaterial({
      color: 0x424b5c,
      roughness: 0.78,
      metalness: 0.12,
      flatShading: true,
      envMapIntensity: 0.2,
    });

    this.chainmailMat = new THREE.MeshStandardMaterial({
      map: this.chainmailTex,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
      envMapIntensity: 0.18,
    });

    this.bronzeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf4be44,
      roughness: 0.72,
      metalness: 0.15,
      flatShading: true,
      envMapIntensity: 0.25,
    });

    this.leatherMat = new THREE.MeshStandardMaterial({
      color: 0x7a543a,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.1,
    });

    this.grassMat = new THREE.MeshStandardMaterial({
      map: this.grassTex,
      roughness: 0.98,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.08,
    });

    this.ivyMat = new THREE.MeshStandardMaterial({
      color: 0x4ea854,
      roughness: 0.95,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.1,
    });

    this.cliffRockMat = new THREE.MeshStandardMaterial({
      color: 0x748094,
      roughness: 0.96,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.1,
    });

    this.emberCoalMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.8, 0.52, 0.12),
      toneMapped: false,
    });

    this.flameOuterMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 0.88, 0.2),
      toneMapped: false,
    });

    this.flameCoreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3.0, 2.5, 1.25),
      toneMapped: false,
    });
  }

  private finalizePixelTexture(
    canvas: HTMLCanvasElement,
    srgb = true
  ): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if (srgb) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * 32x32 Hand-Painted Pixel-Art Character Face Texture (like the reference image!):
   * - Clean warm peach/tan skin shading
   * - Determined angled pixel eyebrows
   * - Expressive anime-pixel eyes (dark top lashes, colored lower iris, crisp white highlight pixel!)
   * - Subtle nose shadow & small determined mouth line
   */
  public createKnightFaceTexture(
    classId: KnightClassId,
    skinBaseHex = '#e6a97c'
  ): THREE.CanvasTexture {
    const key = `${classId}_${skinBaseHex}`;
    const cached = this.faceCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Base warm sunlit skin
    ctx.fillStyle = skinBaseHex;
    ctx.fillRect(0, 0, 32, 32);

    // Forehead & upper hair/helm shadow band
    ctx.fillStyle = '#cf8d60';
    ctx.fillRect(0, 0, 32, 7);
    // Cheek subtle warm shading on outer edges
    ctx.fillRect(0, 7, 4, 25);
    ctx.fillRect(28, 7, 4, 25);
    // Chin shadow
    ctx.fillRect(6, 28, 20, 4);

    // Soft warm cheek blush pixels
    ctx.fillStyle = '#df8b68';
    ctx.fillRect(5, 19, 3, 2);
    ctx.fillRect(24, 19, 3, 2);

    // Class-distinct iris & brow colors
    const irisMap: Record<KnightClassId, { upper: string; lower: string; brow: string }> = {
      sword: { upper: '#23160f', lower: '#693c1e', brow: '#4d311e' },
      dual: { upper: '#241114', lower: '#9c3628', brow: '#3b211c' },
      spear: { upper: '#14261f', lower: '#2d7a5e', brow: '#5c4124' },
      hammer: { upper: '#261b0e', lower: '#9e6820', brow: '#3d2b1f' },
    };
    const pal = irisMap[classId];

    // Determined angled pixel eyebrows!
    ctx.fillStyle = pal.brow;
    // Left brow (tilted inward for heroic determination, exact match to reference!)
    ctx.fillRect(5, 10, 4, 2);
    ctx.fillRect(9, 11, 4, 2);
    // Right brow
    ctx.fillRect(23, 10, 4, 2);
    ctx.fillRect(19, 11, 4, 2);

    // Crisp Anime-Pixel Eyes (Left: x=6..12, Right: x=20..26, y=13..18)
    for (const ex of [6, 20]) {
      // Sclera white outer corner
      ctx.fillStyle = '#fff9f2';
      ctx.fillRect(ex, 14, 6, 4);

      // Thick dark upper lash line
      ctx.fillStyle = '#1e120d';
      ctx.fillRect(ex, 13, 6, 2);

      // Iris block (4x4)
      ctx.fillStyle = pal.upper;
      ctx.fillRect(ex + 1, 14, 4, 2);
      ctx.fillStyle = pal.lower;
      ctx.fillRect(ex + 1, 16, 4, 2);

      // Dark center pupil
      ctx.fillStyle = '#140c08';
      ctx.fillRect(ex + 2, 15, 2, 2);

      // Crisp 2-pixel white anime catchlight in upper-left of iris!
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ex + 1, 14, 2, 1);
      ctx.fillRect(ex + 1, 15, 1, 1);
    }

    // Subtle pixel nose highlight & underside shadow
    ctx.fillStyle = '#f2be94';
    ctx.fillRect(15, 18, 2, 3);
    ctx.fillStyle = '#be7b50';
    ctx.fillRect(15, 21, 3, 1);

    // Small determined frown/mouth pixel line (exact match to reference!)
    ctx.fillStyle = '#8f5134';
    ctx.fillRect(14, 25, 4, 1);
    ctx.fillRect(13, 26, 1, 1);

    // Optional battle scar / beard accent on Hammer Juggernaut
    if (classId === 'hammer') {
      ctx.fillStyle = '#c47952';
      ctx.fillRect(22, 19, 1, 4);
    }

    const tex = this.finalizePixelTexture(canvas);
    this.faceCache.set(key, tex);
    return tex;
  }

  /**
   * 32x32 Crisp Pixel-Art Tunic / Cuirass Texture with clean color-blocked bands,
   * pixel edge trim, and subtle knightly collar shading (like the reference tunic!).
   */
  public createKnightTunicTexture(
    classId: KnightClassId,
    clothHex: number,
    steelHex: number
  ): THREE.CanvasTexture {
    const key = `${classId}_${clothHex}_${steelHex}`;
    const cached = this.armorCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const baseCloth = new THREE.Color(clothHex);
    const lightCloth = baseCloth.clone().offsetHSL(0, -0.04, 0.1);
    const darkCloth = baseCloth.clone().offsetHSL(0.01, 0.04, -0.1);
    const baseSteel = new THREE.Color(steelHex);
    const lightSteel = baseSteel.clone().offsetHSL(0, 0, 0.14);

    // Stepped horizontal pixel-art color bands (just like the reference top!)
    ctx.fillStyle = `#${lightCloth.getHexString()}`;
    ctx.fillRect(0, 0, 32, 10);
    ctx.fillStyle = `#${baseCloth.getHexString()}`;
    ctx.fillRect(0, 10, 32, 12);
    ctx.fillStyle = `#${darkCloth.getHexString()}`;
    ctx.fillRect(0, 22, 32, 10);

    // Crisp pixel-art steel chest plate / gorget trim on upper chest
    ctx.fillStyle = `#${baseSteel.getHexString()}`;
    ctx.fillRect(4, 2, 24, 7);
    ctx.fillStyle = `#${lightSteel.getHexString()}`;
    ctx.fillRect(5, 3, 22, 2);

    // Golden pixel rivets & center emblem pixel motif
    ctx.fillStyle = '#f5c547';
    ctx.fillRect(4, 9, 24, 2);
    ctx.fillRect(15, 11, 2, 14);
    if (classId === 'sword' || classId === 'hammer') {
      ctx.fillRect(11, 15, 10, 2);
    } else {
      ctx.fillRect(13, 14, 6, 2);
      ctx.fillRect(12, 18, 8, 2);
    }

    const tex = this.finalizePixelTexture(canvas);
    this.armorCache.set(key, tex);
    return tex;
  }

  /**
   * 32x32 Crisp Pixel-Art Heraldry for Shields & Tabards.
   */
  public createClassHeraldryTexture(
    classId: KnightClassId,
    clothHex: number
  ): THREE.CanvasTexture {
    const key = `${classId}_${clothHex}`;
    const cached = this.heraldryCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const primary = new THREE.Color(clothHex);
    const secondary = primary.clone().offsetHSL(0.02, 0.04, -0.14);

    // Quartered pixel shield background
    ctx.fillStyle = `#${primary.getHexString()}`;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillRect(16, 16, 16, 16);
    ctx.fillStyle = `#${secondary.getHexString()}`;
    ctx.fillRect(16, 0, 16, 16);
    ctx.fillRect(0, 16, 16, 16);

    // Pixel gold border
    ctx.fillStyle = '#f5c547';
    ctx.fillRect(0, 0, 32, 2);
    ctx.fillRect(0, 30, 32, 2);
    ctx.fillRect(0, 0, 2, 32);
    ctx.fillRect(30, 0, 2, 32);

    // Bold pixel-art emblem in center
    ctx.fillStyle = '#ffe270';
    if (classId === 'sword') {
      // Pixel Crusader Cross
      ctx.fillRect(14, 5, 4, 22);
      ctx.fillRect(6, 13, 20, 4);
      ctx.fillRect(12, 5, 8, 2);
      ctx.fillRect(12, 25, 8, 2);
    } else if (classId === 'dual') {
      // Pixel Twin Diamonds
      for (let i = 0; i < 12; i++) {
        ctx.fillRect(8 + i, 8 + i, 3, 3);
        ctx.fillRect(21 - i, 8 + i, 3, 3);
      }
    } else if (classId === 'spear') {
      // Pixel Chevrons
      for (let x = 0; x < 10; x++) {
        ctx.fillRect(6 + x, 18 - x, 2, 3);
        ctx.fillRect(24 - x, 18 - x, 2, 3);
        ctx.fillRect(6 + x, 25 - x, 2, 2);
        ctx.fillRect(24 - x, 25 - x, 2, 2);
      }
    } else {
      // Pixel Fortress Sun Emblem
      ctx.fillRect(11, 11, 10, 10);
      ctx.fillRect(14, 6, 4, 20);
      ctx.fillRect(6, 14, 20, 4);
      ctx.fillStyle = '#fff6c4';
      ctx.fillRect(13, 13, 6, 6);
    }

    const tex = this.finalizePixelTexture(canvas);
    this.heraldryCache.set(key, tex);
    return tex;
  }

  /**
   * 32x64 Crisp Pixel-Art Swallowtail Tournament Banner with alpha cutout.
   */
  public createBannerTexture(hexColor: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 32, 64);

    const base = new THREE.Color(hexColor);
    const dark = base.clone().offsetHSL(0.01, 0.04, -0.14);

    // Draw pixel swallowtail banner row by row!
    for (let y = 0; y < 62; y++) {
      for (let x = 2; x < 30; x++) {
        // Swallowtail V-notch below y = 46
        if (y >= 46) {
          const notchHalf = Math.floor(((y - 46) / 16) * 12);
          if (Math.abs(x - 16) < notchHalf) continue;
        }
        const isBorder = x <= 3 || x >= 28 || y <= 2;
        if (isBorder) {
          ctx.fillStyle = '#f5c547';
        } else {
          ctx.fillStyle = x < 16 ? `#${base.getHexString()}` : `#${dark.getHexString()}`;
        }
        ctx.fillRect(x, y, 1, 1);
      }
    }

    // Center pixel emblem cross/diamond
    ctx.fillStyle = '#ffe478';
    ctx.fillRect(14, 14, 4, 22);
    ctx.fillRect(8, 22, 16, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(15, 23, 2, 2);

    return this.finalizePixelTexture(canvas);
  }

  private createPixelRadialFloor(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const half = size / 2;
    const img = ctx.createImageData(size, size);
    const d = img.data;

    const hash = (a: number, b: number): number => {
      const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Quantize to 2x2 pixel texels so cobblestones look distinctly pixel-art!
        const qx = Math.floor(x / 2) * 2 + 1;
        const qy = Math.floor(y / 2) * 2 + 1;
        const dx = (qx - half) / half;
        const dy = (qy - half) / half;
        const dist = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) + Math.PI;

        let r = 158;
        let g = 166;
        let b = 178;

        if (dist < 0.075) {
          // Golden pixel center medallion
          r = 235;
          g = 186;
          b = 72;
        } else if (dist < 0.25) {
          // 8-point pixel compass rose
          const sector = Math.floor((angle / (Math.PI * 2)) * 16);
          if (sector % 2 === 0) {
            r = 122;
            g = 134;
            b = 152;
          } else {
            r = 192;
            g = 198;
            b = 206;
          }
          if (Math.abs(dist - 0.24) < 0.014) {
            r = 232;
            g = 184;
            b = 70;
          }
        } else {
          // Clean pixel-art concentric cobblestone rings
          const ringIdx = Math.floor(dist * 22);
          const ringFrac = dist * 22 - ringIdx;
          const stonesInRing = Math.max(12, Math.floor(ringIdx * 6));
          const angScaled =
            (angle / (Math.PI * 2)) * stonesInRing + (ringIdx % 2) * 0.5;
          const stoneIdx = Math.floor(angScaled);
          const angFrac = angScaled - stoneIdx;

          const isGap =
            ringFrac < 0.14 ||
            angFrac < 0.1;

          // Radial stone walkways every 45 deg
          const spokeDist = Math.abs(
            ((angle / (Math.PI / 4) + 0.5) % 1) - 0.5
          );
          const isSpoke = spokeDist * dist < 0.018 && dist < 0.88;

          if (isSpoke) {
            r = 184;
            g = 190;
            b = 200;
            if (ringFrac < 0.1) {
              r -= 28;
              g -= 28;
              b -= 26;
            }
          } else if (isGap) {
            // Clean slate-moss mortar gap
            if (dist > 0.78 && hash(ringIdx, stoneIdx) > 0.42) {
              r = 94;
              g = 142;
              b = 88;
            } else {
              r = 114;
              g = 122;
              b = 136;
            }
          } else {
            // Crisp clean flat-colored cobble palette (4 pastel stone shades!)
            const pick = Math.floor(hash(ringIdx, stoneIdx) * 4);
            const palette = [
              [172, 178, 188],
              [158, 166, 178],
              [182, 184, 190],
              [148, 156, 170],
            ];
            [r, g, b] = palette[pick];
            // Crisp top-edge pixel highlight
            if (ringFrac > 0.14 && ringFrac < 0.3) {
              r += 12;
              g += 12;
              b += 10;
            }
          }
        }

        const idx = (y * size + x) * 4;
        d[idx] = Math.min(255, r);
        d[idx + 1] = Math.min(255, g);
        d[idx + 2] = Math.min(255, b);
        d[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return this.finalizePixelTexture(canvas);
  }

  private createPixelBrickWall(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    // Mortar base
    ctx.fillStyle = '#6c7586';
    ctx.fillRect(0, 0, size, size);

    const rows = 4;
    const cols = 2;
    const bh = size / rows;
    const bw = size / cols;
    const shades = ['#9aa4b4', '#8e98a8', '#a6b0bf', '#8590a1'];

    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 1 ? bw / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const bx = Math.floor(c * bw + offset);
        const by = Math.floor(r * bh);
        const shade = shades[Math.abs(r * 3 + c) % shades.length];

        // Main brick fill
        ctx.fillStyle = shade;
        ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);

        // Crisp 1-pixel top-left sunlit bevel
        ctx.fillStyle = '#bcc5d4';
        ctx.fillRect(bx + 1, by + 1, bw - 2, 1);
        ctx.fillRect(bx + 1, by + 1, 1, bh - 2);

        // Crisp 1-pixel bottom shadow bevel
        ctx.fillStyle = '#788294';
        ctx.fillRect(bx + 1, by + bh - 2, bw - 2, 1);
      }
    }

    return this.finalizePixelTexture(canvas);
  }

  private createPixelWoodPlanks(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const planks = 4;
    const pw = size / planks;
    const woodShades = ['#9c6b43', '#8f603a', '#a8754b', '#875935'];

    for (let p = 0; p < planks; p++) {
      const px = p * pw;
      ctx.fillStyle = woodShades[p % woodShades.length];
      ctx.fillRect(px, 0, pw, size);

      // Highlight edge & dark seam
      ctx.fillStyle = '#b88458';
      ctx.fillRect(px + 1, 0, 1, size);
      ctx.fillStyle = '#5e3c22';
      ctx.fillRect(px, 0, 1, size);

      // Pixel wood grain streaks
      ctx.fillStyle = '#7d5230';
      ctx.fillRect(px + 3, (p * 9) % size, 1, 10);
      ctx.fillRect(px + 5, (p * 17 + 6) % size, 1, 8);
    }

    return this.finalizePixelTexture(canvas);
  }

  private createPixelChainmail(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#3f4756';
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y += 4) {
      const shift = (y / 4) % 2 === 0 ? 0 : 2;
      for (let x = 0; x < size; x += 4) {
        const rx = (x + shift) % size;
        ctx.fillStyle = '#7d889c';
        ctx.fillRect(rx, y, 3, 2);
        ctx.fillStyle = '#a8b3c7';
        ctx.fillRect(rx + 1, y, 1, 1);
      }
    }

    return this.finalizePixelTexture(canvas);
  }

  private createPixelGrass(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = '#5da654';
    ctx.fillRect(0, 0, size, size);

    const blades = ['#6eb862', '#4e9146', '#79c468'];
    for (let i = 0; i < 48; i++) {
      const gx = (i * 13) % size;
      const gy = (i * 29) % size;
      ctx.fillStyle = blades[i % blades.length];
      ctx.fillRect(gx, gy, 2, 2);
    }

    return this.finalizePixelTexture(canvas);
  }

  private createContactShadowTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    // Clean stepped low-poly style octagonal/pixel shadow disc (matches the crisp ground shadow in the reference!)
    const half = size / 2;
    ctx.fillStyle = 'rgba(32, 44, 52, 0.34)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const r = half * 0.78;
      const px = half + Math.cos(a) * r;
      const py = half + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    return this.finalizePixelTexture(canvas, false);
  }

  private createGroundCrackTexture(size: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);

    const c = size / 2;
    ctx.strokeStyle = 'rgba(42, 48, 60, 0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + 0.2;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(a) * 14, c + Math.sin(a) * 14);
      ctx.lineTo(c + Math.cos(a + 0.18) * 26, c + Math.sin(a + 0.18) * 26);
      ctx.stroke();
    }
    return this.finalizePixelTexture(canvas, false);
  }
}
