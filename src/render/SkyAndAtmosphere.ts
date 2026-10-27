import * as THREE from 'three';

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec3 vWorldDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.04 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float y = clamp(dir.y, -0.2, 1.0);

    // Bright, clean sunlit fantasy sky gradient (matches crisp low-poly pixel art!)
    vec3 zenithCol  = vec3(0.24, 0.52, 0.84);
    vec3 midSkyCol  = vec3(0.52, 0.76, 0.92);
    vec3 horizonCol = vec3(0.86, 0.94, 0.86);
    vec3 groundBounce = vec3(0.38, 0.44, 0.42);

    vec3 col;
    if (y >= 0.0) {
      float t1 = pow(1.0 - y, 2.6);
      col = mix(zenithCol, midSkyCol, smoothstep(0.0, 0.58, 1.0 - y));
      col = mix(col, horizonCol, t1);
    } else {
      col = mix(horizonCol, groundBounce, clamp(-y * 5.0, 0.0, 1.0));
    }

    // Stepped pixel-cel solar disc & halo
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    col += vec3(1.0, 0.88, 0.56) * pow(sunDot, 9.0) * 0.34;
    col += vec3(1.4, 1.32, 0.98) * step(0.9965, sunDot);

    // Crisp stepped pixel-art clouds above horizon!
    if (dir.y > 0.04) {
      vec2 uv = floor((dir.xz / (dir.y + 0.3) * 1.4 + vec2(uTime * 0.01, uTime * 0.005)) * 28.0) / 28.0;
      float c = fbm(uv);
      float cloudBand = step(0.56, c) * 0.55 + step(0.68, c) * 0.45;
      float cloudMask = cloudBand * smoothstep(0.04, 0.22, dir.y);
      vec3 cloudLit = mix(vec3(0.92, 0.96, 1.0), vec3(1.04, 0.99, 0.92), step(0.68, c));
      col = mix(col, cloudLit, cloudMask * 0.78);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyAndAtmosphere {
  public readonly group = new THREE.Group();
  private readonly skyUniforms: {
    uSunDir: { value: THREE.Vector3 };
    uTime: { value: number };
  };
  private readonly motesPoints: THREE.Points;
  private readonly motesPositions: Float32Array;
  private readonly motesCount = 130;

  constructor(sunPosition: THREE.Vector3) {
    this.skyUniforms = {
      uSunDir: { value: sunPosition.clone().normalize() },
      uTime: { value: 0 },
    };

    const skyGeo = new THREE.SphereGeometry(120, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.group.add(skyDome);

    // Floating sunlit dust motes & warm torch embers in the arena air
    this.motesPositions = new Float32Array(this.motesCount * 3);
    const colors = new Float32Array(this.motesCount * 3);
    for (let i = 0; i < this.motesCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 13.4;
      this.motesPositions[i * 3] = Math.cos(a) * r;
      this.motesPositions[i * 3 + 1] = 0.4 + Math.random() * 5.2;
      this.motesPositions[i * 3 + 2] = Math.sin(a) * r;

      const isEmber = i % 3 === 0;
      colors[i * 3] = isEmber ? 1.0 : 1.0;
      colors[i * 3 + 1] = isEmber ? 0.58 : 0.92;
      colors[i * 3 + 2] = isEmber ? 0.18 : 0.68;
    }

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.motesPositions, 3)
    );
    pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pMat = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.motesPoints = new THREE.Points(pGeo, pMat);
    this.group.add(this.motesPoints);
  }

  /**
   * Generates a crisp procedural PMREM Environment Map so steel armor, weapons,
   * shields, and stone bevels receive authentic golden-hour sky & warm bounce reflections.
   */
  public generateEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(
      new THREE.SphereGeometry(30, 24, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX_SHADER,
        fragmentShader: SKY_FRAGMENT_SHADER,
        uniforms: {
          uSunDir: { value: this.skyUniforms.uSunDir.value.clone() },
          uTime: { value: 0 },
        },
        side: THREE.BackSide,
      })
    );
    envScene.add(envSky);

    // Subtle warm torch bounce accents inside the IBL cubemap
    const warmBounceGeo = new THREE.SphereGeometry(0.9, 8, 8);
    const warmBounceMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.4, 0.75, 0.3),
    });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const orb = new THREE.Mesh(warmBounceGeo, warmBounceMat);
      orb.position.set(Math.cos(a) * 12, 1.5, Math.sin(a) * 12);
      envScene.add(orb);
    }

    const rt = pmrem.fromScene(envScene, 0.035);
    pmrem.dispose();
    return rt.texture;
  }

  public setMotesVisible(visible: boolean): void {
    this.motesPoints.visible = visible;
  }

  public update(dt: number, elapsed: number): void {
    this.skyUniforms.uTime.value = elapsed;

    if (!this.motesPoints.visible) return;
    const pos = this.motesPositions;
    for (let i = 0; i < this.motesCount; i++) {
      const idx = i * 3;
      pos[idx] += Math.sin(elapsed * 0.7 + i) * 0.18 * dt;
      pos[idx + 1] += (0.22 + (i % 5) * 0.06) * dt;
      pos[idx + 2] += Math.cos(elapsed * 0.6 + i * 1.3) * 0.18 * dt;

      if (pos[idx + 1] > 5.8) {
        pos[idx + 1] = 0.35;
      }
    }
    this.motesPoints.geometry.attributes.position.needsUpdate = true;
  }
}
