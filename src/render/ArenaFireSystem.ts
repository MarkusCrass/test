import * as THREE from 'three';

export type FirePreset =
  | 'torch'
  | 'brazier'
  | 'bonfire'
  | 'candle'
  | 'pit_inferno';

interface FireInstance {
  group: THREE.Group;
  volumeMesh: THREE.Mesh;
  volumeMat: THREE.ShaderMaterial;
  simpleFlame: THREE.Sprite;
  simpleFlameWidth: number;
  simpleFlameHeight: number;
  haloMesh: THREE.Mesh;
  light: THREE.PointLight | null;
  baseLightIntensity: number;
  phase: number;
}

interface EmberEmitter {
  x: number;
  y: number;
  z: number;
  spreadXZ: number;
  riseHeight: number;
  upSpeed: number;
}

/**
 * Open-Source Volumetric 3D Raymarched Fire Vertex Shader.
 * Passes local box coordinates (`x,z in [-0.5..0.5], y in [0..1]`) for analytical slab raymarching.
 */
const VOLUMETRIC_FIRE_VERT = /* glsl */ `
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Open-Source Volumetric 3D Raymarched Flame & Lit Smoke Fragment Shader.
 *
 * Synthesizes two MIT open-source Three.js volumetric fire implementations:
 * 1. `typeWolffo/THREE.Fire` / `mattatz/THREE.Fire` (ACM I3D "Real-Time Procedural Volumetric Fire"
 *    by Fuller et al.): Ashima 3D Simplex turbulence + radial-height `three_fire_lut.png` profile.
 * 2. `rethinkos-playground/flame`: Analytical ray-box slab marching (`boxHit`), stochastic ray jitter,
 *    buoyancy-accelerated advection, helical swirl, Inigo Quilez ridged domain-warped FBM tongues,
 *    4-stop blackbody temperature color ramp, Beer-Lambert transmittance, and fire-lit smoke wisps.
 */
const VOLUMETRIC_FIRE_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uFireLut;
  uniform float uTime;
  uniform float uSeed;
  uniform vec3 uLocalCamPos;
  uniform float uCamDist;
  uniform vec3 uColorCore;
  uniform vec3 uColorEdge;
  uniform float uIntensity;
  uniform float uSpeed;
  uniform float uTurbulence;
  uniform float uWobble;
  uniform float uSmoke;

  varying vec3 vLocalPos;

  const int MAX_STEPS = 28;

  // --- Ashima 3D Simplex Noise (MIT, from typeWolffo/THREE.Fire) ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  // --- Fast hash & ridged FBM helpers (MIT, from rethinkos-playground/flame) ---
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  float ridgedSimplex(vec3 p) {
    float n = 1.0 - abs(snoise(p));
    return n * n;
  }

  float simplexFbm(vec3 p) {
    float v = 0.55 * (snoise(p) * 0.5 + 0.5);
    p = p * 2.08 + vec3(1.7, 5.3, 2.9);
    v += 0.30 * (snoise(p) * 0.5 + 0.5);
    p = p * 2.12 + vec3(4.1, 1.9, 6.3);
    v += 0.15 * (snoise(p) * 0.5 + 0.5);
    return v;
  }

  vec2 axisSway(float y, float t) {
    float w = uWobble * y * y;
    return vec2(
      sin(y * 5.2 - t * 2.4 + uSeed) * 0.56 + sin(y * 11.4 - t * 3.9 + uSeed * 1.7) * 0.24,
      cos(y * 4.5 - t * 2.0 + uSeed * 0.8) * 0.56 + cos(y * 9.8 - t * 3.3 + uSeed * 2.1) * 0.24
    ) * w * 0.34;
  }

  // 4-stop Blackbody temperature gradient: smoldering crimson -> fiery orange -> gold core -> white-hot
  vec3 blackbodyRamp(float t01) {
    vec3 c = uColorEdge * 0.18;
    c = mix(c, uColorEdge, smoothstep(0.04, 0.36, t01));
    c = mix(c, uColorCore, smoothstep(0.35, 0.75, t01));
    c = mix(c, vec3(1.25, 1.18, 1.04), smoothstep(0.80, 1.0, t01) * 0.82);
    return c;
  }

  float sampleVolumetricFire(vec3 p, out vec3 emit) {
    emit = vec3(0.0);
    float t = uTime * uSpeed + uSeed;

    // Normalize local y in [0..1] so flame body occupies [0..0.78] and smoke [0.45..1.0]
    float y = p.y / 0.78;
    if (y < 0.0 || y > 1.24) return 0.0;

    vec2 sway = axisSway(clamp(y, 0.0, 1.15), t);
    vec2 xz = p.xz - sway;
    float r = length(xz);

    float yc = clamp(y, 0.0, 1.0);
    // Teardrop envelope + warm fuel skirt at base
    float radiusAtY = 0.36 * (1.0 - pow(yc, 1.32));
    radiusAtY *= 1.0 + 0.32 * exp(-y * 8.5);
    radiusAtY = max(radiusAtY, 0.015);

    float radial = 1.0 - smoothstep(0.0, 1.0, r / radiusAtY);
    float lift = smoothstep(-0.02, 0.09, y);
    float tip = 1.0 - smoothstep(0.54, 1.12, y);
    float fuel = pow(radial, 1.18) * lift * tip;

    // Analytical empty-space skip before evaluating any 3D Simplex noise!
    if (fuel < 0.11) return 0.0;

    // Buoyancy-accelerated upward flow + gentle helical swirl
    float rise = t * 1.85 * (0.58 + y * 1.15);
    float ang = y * 2.4 + t * 0.65;
    float ca = cos(ang), sa = sin(ang);
    vec2 sxz = vec2(xz.x * ca - xz.y * sa, xz.x * sa + xz.y * ca);

    vec3 np = vec3(sxz * 5.2, y * 2.8 - rise);

    // Inigo Quilez ridged domain warping -> crisp curling & detaching flame tongues!
    float warpAmt = 1.45 * mix(0.32, 1.0, yc) * uTurbulence;
    vec2 q = vec2(
      ridgedSimplex(np * 0.85 + vec3(0.0, 0.0, t * 0.42)),
      ridgedSimplex(np * 0.85 + vec3(3.7, 1.4, t * 0.42))
    );
    vec3 wp = np + vec3(q.x - 0.5, (q.y - q.x) * 0.68, q.y - 0.5) * warpAmt;

    float fbmVal = simplexFbm(wp);
    float turb = mix(0.28, 1.88, fbmVal);
    float erosion = smoothstep(-0.04, 0.48, y) * uTurbulence;

    // Blend analytical fuel field with THREE.Fire radial-height LUT profile
    vec2 lutUv = clamp(
      vec2(clamp(r / 0.42, 0.01, 0.99), clamp(yc + sqrt(yc) * 0.42 * (fbmVal - 0.35), 0.01, 0.99)),
      0.01,
      0.99
    );
    float lutProfile = texture2D(uFireLut, lutUv).r;

    float heat = mix(fuel, fuel * (0.65 + lutProfile * 0.75), 0.55) * mix(1.0, turb, erosion);

    // High-frequency outer-edge tongue breakup
    heat -= (1.0 - radial) * abs(snoise(wp * 2.6 + vec3(0.0, -t * 2.1, 0.0))) * 0.24 * uTurbulence;
    heat -= 0.28 * smoothstep(0.36, 1.06, y);

    // Natural breathing pulsation
    heat *= 0.94 + 0.06 * sin(t * 5.8) + 0.03 * sin(t * 13.7);
    heat = max((heat - 0.23) * 1.88, 0.0);

    float dens = smoothstep(0.0, 0.44, heat);
    float t01 = clamp(heat * 0.78, 0.0, 1.0);
    vec3 c = blackbodyRamp(t01);

    float flick = 1.0 + 0.09 * sin(t * 8.9) + 0.05 * sin(t * 19.3 + p.y * 5.0);
    emit = c * (0.26 + 2.55 * pow(t01, 1.85)) * uIntensity * flick;
    return dens;
  }

  float sampleLitSmoke(vec3 p, out vec3 scat) {
    scat = vec3(0.0);
    if (uSmoke <= 0.001) return 0.0;
    float y = p.y / 0.78;
    if (y < 0.42 || y > 1.28) return 0.0;

    float t = uTime * uSpeed + uSeed;
    vec2 sway = axisSway(min(y, 1.0), t);
    float rad = length(p.xz - sway * 0.45);
    float spread = 0.22 + (y - 0.42) * 0.32;
    float radial = 1.0 - smoothstep(spread * 0.35, spread * 1.25, rad);
    float band = smoothstep(0.42, 0.78, y) * (1.0 - smoothstep(0.96, 1.28, y));

    if (radial * band * uSmoke < 0.012) return 0.0;

    vec3 np = vec3(p.xz * 3.1, p.y * 2.6 - t * 0.95);
    float n = snoise(np + 23.7) * 0.5 + 0.5;
    float d = smoothstep(0.46, 0.92, n) * radial * band * uSmoke;

    float underGlow = exp(-max(y - 0.48, 0.0) * 2.4) * exp(-rad * 3.2);
    scat = mix(vec3(0.11, 0.09, 0.08), uColorEdge * 1.25 + 0.05, underGlow * 0.92);
    return d;
  }

  float safeComp(float v) {
    return abs(v) < 1e-5 ? (v < 0.0 ? -1e-5 : 1e-5) : v;
  }

  vec2 boxHit(vec3 ro, vec3 rd) {
    vec3 bmin = vec3(-0.5, 0.0, -0.5);
    vec3 bmax = vec3( 0.5, 1.0,  0.5);
    vec3 invRd = 1.0 / vec3(safeComp(rd.x), safeComp(rd.y), safeComp(rd.z));
    vec3 t0 = (bmin - ro) * invRd;
    vec3 t1 = (bmax - ro) * invRd;
    vec3 tn = min(t0, t1);
    vec3 tf = max(t0, t1);
    return vec2(max(tn.x, max(tn.y, tn.z)), min(tf.x, min(tf.y, tf.z)));
  }

  void main() {
    vec3 ro = uLocalCamPos;
    vec3 rd = normalize(vLocalPos - ro);

    vec2 tb = boxHit(ro, rd);
    float t0 = max(tb.x, 0.0);
    float t1 = tb.y;
    if (t1 <= t0 + 1e-4) discard;

    // Distance-adaptive step count: 28 steps up close, scaling down smoothly at 35m+
    int steps = int(clamp(mix(float(MAX_STEPS), 10.0, clamp((uCamDist - 4.0) / 30.0, 0.0, 1.0)), 10.0, float(MAX_STEPS)));
    float dt = (t1 - t0) / float(steps);
    float jitter = hash13(vec3(gl_FragCoord.xy, fract(uTime * 0.73 + uSeed)));
    float tt = t0 + dt * jitter;

    vec3 acc = vec3(0.0);
    float trans = 1.0;

    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= steps || trans < 0.025 || tt > t1) break;
      vec3 p = ro + rd * tt;

      vec3 emit;
      float df = sampleVolumetricFire(p, emit);
      vec3 scat;
      float ds = sampleLitSmoke(p, scat);

      float sigF = df * 4.6;
      float sigS = ds * 2.1;
      float sig = sigF + sigS;

      if (sig > 1e-4) {
        vec3 j = emit * sigF + scat * sigS * 0.35;
        float stepT = exp(-sig * dt);
        acc += trans * (j / sig) * (1.0 - stepT);
        trans *= stepT;
      }

      tt += dt;
    }

    float alpha = clamp(1.0 - trans, 0.0, 1.0);
    if (alpha < 0.008) discard;

    // Premultiplied-friendly emission output with true Beer-Lambert opacity
    gl_FragColor = vec4(acc, alpha);
  }
`;

/**
 * Glowing 3D Ember Coal Bed Shader — incandescent magma fissures pulsing across dark charcoal lumps.
 */
const COAL_BED_VERT = /* glsl */ `
  varying vec3 vObjPos;
  varying vec3 vNormalView;
  void main() {
    vObjPos = position;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const COAL_BED_FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  varying vec3 vObjPos;
  varying vec3 vNormalView;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    float n1 = vnoise(vObjPos * 11.0);
    float n2 = vnoise(vObjPos * 23.0 + 4.7);
    float crack = smoothstep(0.42, 0.78, n1 * 0.65 + n2 * 0.45);
    float pulse = 0.82 + 0.24 * sin(uTime * 4.3 + n1 * 8.0);
    float centerHeat = 1.0 - smoothstep(0.12, 0.56, length(vObjPos.xz));

    vec3 ashCharcoal = vec3(0.08, 0.04, 0.03);
    vec3 emberRed = vec3(1.65, 0.26, 0.03);
    vec3 magmaGold = vec3(2.85, 1.35, 0.25);

    float glow = clamp((crack * 0.8 + centerHeat * 0.55) * pulse, 0.0, 1.25);
    vec3 col = mix(ashCharcoal, emberRed, clamp(glow * 1.2, 0.0, 1.0));
    col = mix(col, magmaGold, smoothstep(0.65, 1.15, glow));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * GPU-Driven Rising Ember Spark Shaders (MIT, adapted from `rethinkos-playground/flame`).
 */
const GPU_EMBER_VERT = /* glsl */ `
  attribute vec3 aEmitterOrigin;
  attribute vec3 aEmitterParams; // x: spreadXZ, y: riseHeight, z: upSpeed
  attribute float aSeed;
  attribute float aSize;

  uniform float uTime;

  varying float vLife;
  varying float vSeed;

  void main() {
    // Hide unallocated sparks when no emitter registered yet
    if (aEmitterParams.y <= 0.001) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vLife = 1.0;
      vSeed = aSeed;
      return;
    }

    float rate = (0.24 + 0.22 * fract(aSeed * 19.7)) * aEmitterParams.z;
    float life = fract(aSeed + uTime * rate);
    vLife = life;
    vSeed = aSeed;

    float spread = aEmitterParams.x;
    float height = aEmitterParams.y;

    float ang = aSeed * 57.0 + life * (1.6 + fract(aSeed * 31.0) * 3.8) + uTime * 0.35;
    float rad = spread * (0.20 + 1.35 * life) * (0.35 + 0.85 * fract(aSeed * 13.7));

    vec3 worldPos = aEmitterOrigin + vec3(
      cos(ang) * rad + sin(uTime * 1.9 + aSeed * 91.0) * life * 0.26 * spread,
      life * height * (0.62 + 0.65 * fract(aSeed * 7.3)),
      sin(ang) * rad + cos(uTime * 1.55 + aSeed * 73.0) * life * 0.26 * spread
    );

    vec4 mv = modelViewMatrix * vec4(worldPos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * (165.0 / max(-mv.z, 0.25)) * (1.0 - 0.52 * life), 1.0, 26.0);
  }
`;

const GPU_EMBER_FRAG = /* glsl */ `
  precision highp float;

  varying float vLife;
  varying float vSeed;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float m = 1.0 - smoothstep(0.14, 0.50, dist);
    if (m < 0.02) discard;

    float fade = smoothstep(0.0, 0.10, vLife) * (1.0 - smoothstep(0.38, 1.0, vLife));
    vec3 whiteGold = vec3(3.2, 2.35, 1.05);
    vec3 hotOrange = vec3(2.55, 0.78, 0.14);
    vec3 c = mix(whiteGold, hotOrange, clamp(vLife * 1.45 + fract(vSeed * 11.3) * 0.25, 0.0, 1.0));
    gl_FragColor = vec4(c * (fade * m), 1.0);
  }
`;

/**
 * Builds a multi-lump faceted 3D glowing coal & ember bed geometry (`radius ~ 0.5`).
 */
function buildFacetedCoalBedGeometry(): THREE.BufferGeometry {
  const geo = new THREE.DodecahedronGeometry(0.5, 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const lump =
      0.86 +
      0.18 * Math.sin(x * 13.7 + z * 9.3) +
      0.12 * Math.cos(y * 17.1 - x * 11.4);
    // Flatten underside and sculpt mounded craggy coal top
    const ny = y < 0 ? y * 0.22 : y * 0.44 * lump;
    pos.setXYZ(i, x * lump, ny, z * lump);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Open-Source Volumetric 3D Fire, Glowing Ember Coal Bed & GPU Spark System.
 *
 * Replaces flat crossed billboard sheets and rigid cone meshes with:
 * - Raymarched 3D Volumetric Fire (`typeWolffo/THREE.Fire` LUT + `rethinkos-playground/flame`
 *   ridged domain-warped FBM, blackbody radiation ramp & lit smoke wisps)
 * - Craggy 3D incandescent coal beds with pulsing magma fissures
 * - 1-draw-call 100% GPU-driven rising ember sparks
 */
export class ArenaFireSystem {
  public readonly group = new THREE.Group();

  private readonly instances: FireInstance[] = [];
  private readonly emitters: EmberEmitter[] = [];

  private readonly volumeBoxGeo: THREE.BufferGeometry;
  private readonly haloGeo = new THREE.PlaneGeometry(1, 1);
  private readonly coalGeo: THREE.BufferGeometry;

  private readonly fireLutTex: THREE.Texture;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly simpleFlameMat: THREE.SpriteMaterial;
  private lowQuality = false;
  private readonly coalMat: THREE.ShaderMaterial;

  // 1-draw-call GPU-driven rising ember particles
  private readonly emberCount = 360;
  private readonly emberOriginAttr: THREE.BufferAttribute;
  private readonly emberParamsAttr: THREE.BufferAttribute;
  private readonly emberMat: THREE.ShaderMaterial;
  private readonly emberPoints: THREE.Points;

  private readonly tmpInvMat = new THREE.Matrix4();
  private readonly tmpCamWorld = new THREE.Vector3();
  private readonly tmpCamLocal = new THREE.Vector3();
  private readonly tmpMeshWorld = new THREE.Vector3();

  constructor() {
    // Unit volumetric proxy box spanning x,z in [-0.5..0.5] and y in [0.0..1.0]
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    this.volumeBoxGeo = box;
    this.coalGeo = buildFacetedCoalBedGeometry();

    const texLoader = new THREE.TextureLoader();
    const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
    const rawBase = meta.env?.BASE_URL ?? './';
    const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

    const loadBrowserTex = (rel: string): THREE.Texture => {
      if (typeof document === 'undefined') {
        const dt = new THREE.DataTexture(
          new Uint8Array([255, 220, 140, 255]),
          1,
          1
        );
        dt.needsUpdate = true;
        return dt;
      }
      return texLoader.load(`${base}${rel}`);
    };

    // Official THREE.Fire radial-height profile LUT + Kenney soft halo glow
    this.fireLutTex = loadBrowserTex('textures/fx/three_fire_lut.png');
    this.fireLutTex.magFilter = THREE.LinearFilter;
    this.fireLutTex.minFilter = THREE.LinearFilter;
    this.fireLutTex.wrapS = THREE.ClampToEdgeWrapping;
    this.fireLutTex.wrapT = THREE.ClampToEdgeWrapping;

    const glowTex = loadBrowserTex('textures/fx/circle_05.png');
    this.simpleFlameMat = new THREE.SpriteMaterial({
      map: loadBrowserTex('textures/fx/flame_fast.png'),
      color: new THREE.Color(2.0, 0.5, 0.06),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    this.haloMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: new THREE.Color(1.45, 0.62, 0.15),
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.coalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: COAL_BED_VERT,
      fragmentShader: COAL_BED_FRAG,
    });

    // Build 1-draw-call GPU shader ember fountain
    const dummyPositions = new Float32Array(this.emberCount * 3);
    const emitterOrigins = new Float32Array(this.emberCount * 3);
    const emitterParams = new Float32Array(this.emberCount * 3);
    const seeds = new Float32Array(this.emberCount);
    const sizes = new Float32Array(this.emberCount);

    for (let i = 0; i < this.emberCount; i++) {
      seeds[i] = ((i * 0.6180339887) % 1 + 1) % 1;
      sizes[i] = 0.16 + (i % 7) * 0.032;
    }

    this.emberOriginAttr = new THREE.BufferAttribute(emitterOrigins, 3);
    this.emberParamsAttr = new THREE.BufferAttribute(emitterParams, 3);

    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(dummyPositions, 3)
    );
    emberGeo.setAttribute('aEmitterOrigin', this.emberOriginAttr);
    emberGeo.setAttribute('aEmitterParams', this.emberParamsAttr);
    emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    emberGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.emberMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: GPU_EMBER_VERT,
      fragmentShader: GPU_EMBER_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    this.emberPoints = new THREE.Points(emberGeo, this.emberMat);
    this.emberPoints.frustumCulled = false;
    this.group.add(this.emberPoints);
  }

  /**
   * Kept as a safe no-op hook for backward compatibility with ArenaPropCache.
   * Flames are now rendered via true 3D volumetric raymarching rather than low-poly cone meshes!
   */
  public applySculptedFlameGeometry(_geo: THREE.BufferGeometry): void {
    // True 3D volumetric raymarched boxes supersede static 78-vertex cone geometry.
  }

  /**
   * Spawns a true 3D raymarched volumetric fire volume + optional craggy 3D ember coal bed,
   * soft heat-bloom halo, flickering PointLight, and GPU spark emitter.
   */
  public createFire(opts: {
    parent: THREE.Object3D;
    x?: number;
    y?: number;
    z?: number;
    preset: FirePreset;
    withLight?: boolean;
    lightIntensity?: number;
    lightDistance?: number;
    lightColor?: number;
    worldEmberOrigin?: { x: number; y: number; z: number };
  }): THREE.Group {
    const g = new THREE.Group();
    g.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    opts.parent.add(g);

    let boxWidth = 0.56;
    let boxHeight = 0.92;
    let haloSize = 0.9;
    let addCoals = false;
    let coalRadius = 0.36;
    let speed = 1.05;
    let turbulence = 1.0;
    let wobble = 0.24;
    let smoke = 0.0;
    let intensity = 1.32;
    let defaultLightInt = 5.4;
    let defaultLightDist = 12.0;

    switch (opts.preset) {
      case 'candle':
        boxWidth = 0.16;
        boxHeight = 0.28;
        haloSize = 0.32;
        speed = 0.82;
        turbulence = 0.52;
        wobble = 0.14;
        smoke = 0.0;
        intensity = 1.25;
        defaultLightInt = 2.2;
        defaultLightDist = 5.5;
        break;
      case 'torch':
        // Compact 0.46m width stays >20cm clear of stone walls behind wall sconces!
        boxWidth = 0.46;
        boxHeight = 0.86;
        haloSize = 0.92;
        speed = 1.15;
        turbulence = 0.96;
        wobble = 0.26;
        smoke = 0.16;
        intensity = 1.38;
        defaultLightInt = 5.6;
        defaultLightDist = 12.5;
        break;
      case 'brazier':
        boxWidth = 1.08;
        boxHeight = 1.68;
        haloSize = 1.75;
        addCoals = true;
        coalRadius = 0.39;
        speed = 1.06;
        turbulence = 1.08;
        wobble = 0.24;
        smoke = 0.28;
        intensity = 1.42;
        defaultLightInt = 8.4;
        defaultLightDist = 15.5;
        break;
      case 'bonfire':
        boxWidth = 1.42;
        boxHeight = 2.18;
        haloSize = 2.25;
        addCoals = true;
        coalRadius = 0.54;
        speed = 1.02;
        turbulence = 1.15;
        wobble = 0.26;
        smoke = 0.34;
        intensity = 1.46;
        defaultLightInt = 9.5;
        defaultLightDist = 17.0;
        break;
      case 'pit_inferno':
        // Fits right beneath the y=0 central iron floor grates (from y=-0.96 up to y=+0.20)
        boxWidth = 2.45;
        boxHeight = 1.16;
        haloSize = 2.6;
        addCoals = true;
        coalRadius = 1.05;
        speed = 1.04;
        turbulence = 1.22;
        wobble = 0.24;
        smoke = 0.14;
        intensity = 1.52;
        defaultLightInt = 11.5;
        defaultLightDist = 18.0;
        break;
    }

    if (addCoals) {
      const coals = new THREE.Mesh(this.coalGeo, this.coalMat);
      coals.scale.set(coalRadius * 2, coalRadius * 0.72, coalRadius * 2);
      coals.position.y = 0.02;
      coals.castShadow = false;
      coals.receiveShadow = false;
      g.add(coals);
    }

    const phase =
      this.instances.length * 2.17 +
      (opts.x ?? 0) * 0.43 +
      (opts.z ?? 0) * 0.71;

    // Cloned ShaderMaterial shares the exact same compiled WebGLProgram across all fires!
    const volumeMat = new THREE.ShaderMaterial({
      uniforms: {
        uFireLut: { value: this.fireLutTex },
        uTime: { value: 0 },
        uSeed: { value: phase },
        uLocalCamPos: { value: new THREE.Vector3(0, 0.5, 3) },
        uCamDist: { value: 8.0 },
        uColorCore: { value: new THREE.Color(1.0, 0.82, 0.32) },
        uColorEdge: { value: new THREE.Color(1.0, 0.25, 0.04) },
        uIntensity: { value: intensity },
        uSpeed: { value: speed },
        uTurbulence: { value: turbulence },
        uWobble: { value: wobble },
        uSmoke: { value: smoke },
      },
      vertexShader: VOLUMETRIC_FIRE_VERT,
      fragmentShader: VOLUMETRIC_FIRE_FRAG,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      toneMapped: false,
    });

    const volumeMesh = new THREE.Mesh(this.volumeBoxGeo, volumeMat);
    volumeMesh.scale.set(boxWidth, boxHeight, boxWidth);
    volumeMesh.renderOrder = 5;

    // Update inverse model matrix & camera entry/exit side ONLY for frustum-visible fires!
    volumeMesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.tmpInvMat.copy(volumeMesh.matrixWorld).invert();
      camera.getWorldPosition(this.tmpCamWorld);
      volumeMesh.getWorldPosition(this.tmpMeshWorld);

      this.tmpCamLocal.copy(this.tmpCamWorld).applyMatrix4(this.tmpInvMat);
      volumeMat.uniforms.uLocalCamPos.value.copy(this.tmpCamLocal);
      volumeMat.uniforms.uCamDist.value = this.tmpCamWorld.distanceTo(
        this.tmpMeshWorld
      );

      const inside =
        Math.abs(this.tmpCamLocal.x) <= 0.54 &&
        this.tmpCamLocal.y >= -0.04 &&
        this.tmpCamLocal.y <= 1.04 &&
        Math.abs(this.tmpCamLocal.z) <= 0.54;
      const desiredSide = inside ? THREE.BackSide : THREE.FrontSide;
      if (volumeMat.side !== desiredSide) {
        volumeMat.side = desiredSide;
      }
    };

    g.add(volumeMesh);

    // Fast quality uses an inexpensive camera-facing flame instead of raymarching.
    const simpleFlame = new THREE.Sprite(this.simpleFlameMat);
    simpleFlame.scale.set(boxWidth * 1.5, boxHeight * 1.15, 1);
    simpleFlame.position.y = boxHeight * 0.5;
    simpleFlame.visible = this.lowQuality;
    simpleFlame.renderOrder = 3;
    volumeMesh.visible = !this.lowQuality;
    g.add(simpleFlame);

    // Subtle atmospheric heat-bloom halo
    const haloMesh = new THREE.Mesh(this.haloGeo, this.haloMat);
    haloMesh.scale.setScalar(haloSize);
    haloMesh.position.y = boxHeight * 0.34;
    haloMesh.renderOrder = 4;
    g.add(haloMesh);

    let light: THREE.PointLight | null = null;
    const baseLightIntensity = opts.lightIntensity ?? defaultLightInt;
    if (opts.withLight) {
      light = new THREE.PointLight(
        opts.lightColor ?? 0xff8c2b,
        baseLightIntensity,
        opts.lightDistance ?? defaultLightDist,
        1.65
      );
      light.position.set(0, boxHeight * 0.42 + 0.12, 0);
      light.visible = !this.lowQuality;
      g.add(light);
    }

    this.instances.push({
      group: g,
      volumeMesh,
      volumeMat,
      simpleFlame,
      simpleFlameWidth: boxWidth * 1.5,
      simpleFlameHeight: boxHeight * 1.15,
      haloMesh,
      light,
      baseLightIntensity,
      phase,
    });

    if (opts.worldEmberOrigin) {
      this.registerEmberEmitter({
        x: opts.worldEmberOrigin.x,
        y: opts.worldEmberOrigin.y,
        z: opts.worldEmberOrigin.z,
        spreadXZ:
          opts.preset === 'pit_inferno'
            ? 3.2
            : opts.preset === 'bonfire'
            ? 0.52
            : 0.34,
        riseHeight:
          opts.preset === 'pit_inferno'
            ? 5.8
            : opts.preset === 'bonfire'
            ? 3.8
            : 3.0,
        upSpeed: opts.preset === 'pit_inferno' ? 1.35 : 1.12,
      });
    }

    return g;
  }

  public registerEmberEmitter(emitter: EmberEmitter): void {
    this.emitters.push(emitter);
    const total = this.emitters.length;
    const origArr = this.emberOriginAttr.array as Float32Array;
    const paramArr = this.emberParamsAttr.array as Float32Array;

    for (let i = 0; i < this.emberCount; i++) {
      const em = this.emitters[i % total];
      origArr[i * 3] = em.x;
      origArr[i * 3 + 1] = em.y;
      origArr[i * 3 + 2] = em.z;

      paramArr[i * 3] = em.spreadXZ;
      paramArr[i * 3 + 1] = em.riseHeight;
      paramArr[i * 3 + 2] = em.upSpeed;
    }

    this.emberOriginAttr.needsUpdate = true;
    this.emberParamsAttr.needsUpdate = true;
  }

  /** Switch existing effects in place; fires created later inherit the setting. */
  public setLowQuality(low: boolean): void {
    this.lowQuality = low;
    this.emberPoints.visible = !low;
    for (const inst of this.instances) {
      inst.volumeMesh.visible = !low;
      inst.simpleFlame.visible = low;
      if (inst.light) inst.light.visible = !low;
    }
  }

  public update(elapsed: number, _dt: number, cameraPos?: THREE.Vector3): void {
    this.coalMat.uniforms.uTime.value = elapsed;
    this.emberMat.uniforms.uTime.value = elapsed;

    for (const inst of this.instances) {
      inst.volumeMat.uniforms.uTime.value = elapsed;

      const flicker =
        1.0 +
        Math.sin(elapsed * 9.6 + inst.phase) * 0.085 +
        Math.cos(elapsed * 17.8 + inst.phase * 1.63) * 0.055;

      if (this.lowQuality) {
        inst.simpleFlame.scale.set(
          inst.simpleFlameWidth * flicker,
          inst.simpleFlameHeight * flicker,
          1
        );
      }
      if (cameraPos) {
        inst.haloMesh.lookAt(cameraPos);
      } else {
        inst.haloMesh.rotation.z = elapsed * 0.4 + inst.phase;
      }
      if (inst.light) {
        inst.light.intensity = inst.baseLightIntensity * flicker;
      }
    }
  }
}
