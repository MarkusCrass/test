import * as THREE from 'three';
import { CombatEvent, ThrownProjectile } from '../core/CombatSystem';
import { Fighter } from '../core/Fighter';

interface BurstParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  floorY: number;
  gravity: number;
  bounce: number;
  life: number;
  maxLife: number;
  baseScale: number;
  stretchByVelocity: boolean;
}

interface FlashStar {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface GroundDecal {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

/**
 * High-impact 3D Combat VFX Manager:
 * - HDR clash flashes, bouncing velocity-stretched hot metal sparks, billowing stone dust
 * - Expanding 3D shockwave rings on Parries, Guard Breaks & Heavy Slams
 * - Ground fracture decals on Hammer slams + brief dynamic clash light
 * - Toggleable 3D Debug Hitbox & Attack Sector visualization (F3 / Settings)
 */
export class EffectsManager {
  public readonly group = new THREE.Group();
  public readonly debugGroup = new THREE.Group();

  private readonly particles: BurstParticle[] = [];
  private readonly flashes: FlashStar[] = [];
  private readonly shockwaves: ShockwaveRing[] = [];
  private readonly decals: GroundDecal[] = [];
  private readonly projectileMeshes = new Map<number, THREE.Group>();
  private readonly maxParticles = 140;

  private readonly sparkGeo = new THREE.OctahedronGeometry(0.065, 0);
  private readonly dustGeo = new THREE.DodecahedronGeometry(0.19, 0);
  private readonly flashGeo = new THREE.OctahedronGeometry(0.36, 0);
  private readonly ringGeo = new THREE.RingGeometry(0.42, 0.56, 28);
  private readonly daggerBladeGeo = new THREE.ConeGeometry(0.065, 0.52, 4);
  private readonly daggerGuardGeo = new THREE.BoxGeometry(0.22, 0.035, 0.045);

  // HDR emissive colors (>1.0) so UnrealBloom gives sparks & parries a crisp golden/cyan glow!
  private readonly goldSparkMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.2, 1.55, 0.35),
    toneMapped: false,
  });
  private readonly emberOrangeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.3, 0.85, 0.2),
    toneMapped: false,
  });
  private readonly whiteHotMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 2.2, 1.8),
    toneMapped: false,
  });
  private readonly cyanParryMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.55, 2.1, 2.5),
    toneMapped: false,
  });
  private readonly dustMat = new THREE.MeshStandardMaterial({
    color: 0xa7a095,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.72,
    flatShading: true,
  });

  // Dynamic point light that flashes briefly at weapon clash point
  private readonly clashLight = new THREE.PointLight(0xffb84d, 0, 8.5, 1.8);
  private clashLightTimer = 0;

  private crackDecalTex: THREE.Texture | null = null;

  private readonly debugNodes = new Map<
    string,
    {
      root: THREE.Group;
      hurtbox: THREE.LineSegments;
      facingLine: THREE.Line;
      sectorFill: THREE.Mesh;
      sectorMat: THREE.MeshBasicMaterial;
      sectorArcDeg: number;
      sectorRange: number;
    }
  >();

  constructor(crackDecalTex?: THREE.Texture) {
    this.crackDecalTex = crackDecalTex ?? null;
    this.ringGeo.rotateX(-Math.PI / 2);
    this.group.add(this.debugGroup);
    this.group.add(this.clashLight);
  }

  public clearAll(): void {
    for (const p of this.particles) this.group.remove(p.mesh);
    this.particles.length = 0;

    for (const f of this.flashes) this.group.remove(f.mesh);
    this.flashes.length = 0;

    for (const s of this.shockwaves) {
      this.group.remove(s.mesh);
      s.mat.dispose();
    }
    this.shockwaves.length = 0;

    for (const d of this.decals) {
      this.group.remove(d.mesh);
      d.mat.dispose();
    }
    this.decals.length = 0;

    for (const pm of this.projectileMeshes.values()) {
      this.group.remove(pm);
    }
    this.projectileMeshes.clear();

    this.clashLight.intensity = 0;

    for (const node of this.debugNodes.values()) {
      this.debugGroup.remove(node.root);
      node.hurtbox.geometry.dispose();
      node.facingLine.geometry.dispose();
      node.sectorFill.geometry.dispose();
    }
    this.debugNodes.clear();
  }

  public syncProjectiles(projectiles: ThrownProjectile[], dt: number): void {
    const activeIds = new Set<number>();
    for (const p of projectiles) {
      activeIds.add(p.id);
      let g = this.projectileMeshes.get(p.id);
      if (!g) {
        g = new THREE.Group();
        const blade = new THREE.Mesh(this.daggerBladeGeo, this.whiteHotMat);
        blade.rotation.x = Math.PI / 2;
        blade.position.z = 0.16;
        const guard = new THREE.Mesh(this.daggerGuardGeo, this.goldSparkMat);
        guard.position.z = -0.08;
        const glowRing = new THREE.Mesh(
          new THREE.RingGeometry(0.12, 0.22, 16),
          this.cyanParryMat
        );
        g.add(blade, guard, glowRing);
        this.group.add(g);
        this.projectileMeshes.set(p.id, g);
      }
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.yaw;
      g.children[0].rotation.z += dt * 28.0;
      g.children[2].rotation.z -= dt * 18.0;
    }

    for (const [id, mesh] of this.projectileMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(mesh);
        this.projectileMeshes.delete(id);
      }
    }
  }

  public spawnLandingDust(x: number, y: number, z: number): void {
    const deckY = y >= 3.2 ? 4.0 : 0.0;
    this.spawnDustRing(x, deckY + 0.09, z, 7, 2.7, deckY);
  }

  public spawnFromEvent(ev: CombatEvent): void {
    // Infer underlying deck floor height (Tier 2 Skybridge y=4.0 vs Tier 1 Courtyard y=0.0)
    const deckY = ev.y >= 3.4 ? 4.0 : 0.0;

    switch (ev.type) {
      case 'hit': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.goldSparkMat, 1.0, 0.1);
        this.spawnSparks(ev.x, ev.y, ev.z, 11, this.goldSparkMat, 6.4, deckY);
        this.triggerClashLight(ev.x, ev.y, ev.z, 0xffb347, 10, 0.08);
        break;
      }
      case 'heavy_hit': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.whiteHotMat, 1.6, 0.14);
        this.spawnSparks(ev.x, ev.y, ev.z, 18, this.emberOrangeMat, 8.4, deckY);
        this.spawnShockwave(ev.x, deckY + 0.15, ev.z, 0xff9e38, 0.7, 3.6, 0.28);
        this.spawnDustRing(ev.x, deckY + 0.12, ev.z, 8, 3.8, deckY);
        this.triggerClashLight(ev.x, ev.y, ev.z, 0xff8c2b, 16, 0.12);
        break;
      }
      case 'blocked': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.whiteHotMat, 0.9, 0.09);
        this.spawnSparks(ev.x, ev.y, ev.z, 12, this.whiteHotMat, 6.8, deckY);
        this.spawnShockwave(ev.x, deckY + 0.75, ev.z, 0xffe299, 0.4, 2.0, 0.18);
        this.triggerClashLight(ev.x, ev.y, ev.z, 0xffe599, 11, 0.08);
        break;
      }
      case 'parried': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.cyanParryMat, 1.85, 0.18);
        this.spawnSparks(ev.x, ev.y, ev.z, 20, this.cyanParryMat, 9.0, deckY);
        this.spawnShockwave(ev.x, deckY + 0.25, ev.z, 0x6ef2ff, 0.6, 4.4, 0.34);
        this.triggerClashLight(ev.x, ev.y, ev.z, 0x5eeeff, 18, 0.15);
        break;
      }
      case 'guard_broken': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.emberOrangeMat, 1.65, 0.16);
        this.spawnSparks(ev.x, ev.y, ev.z, 16, this.emberOrangeMat, 7.6, deckY);
        this.spawnShockwave(ev.x, deckY + 0.3, ev.z, 0xff5924, 0.6, 4.0, 0.32);
        this.triggerClashLight(ev.x, ev.y, ev.z, 0xff5924, 15, 0.13);
        break;
      }
      case 'ground_slam': {
        this.spawnDustRing(ev.x, deckY + 0.12, ev.z, 16, 5.6, deckY);
        this.spawnSparks(ev.x, deckY + 0.22, ev.z, 14, this.emberOrangeMat, 6.8, deckY);
        this.spawnShockwave(ev.x, deckY + 0.06, ev.z, 0xff9b38, 0.6, 5.2, 0.36);
        this.spawnGroundCrack(ev.x, ev.z, deckY);
        this.triggerClashLight(ev.x, deckY + 0.5, ev.z, 0xff8a24, 16, 0.14);
        break;
      }
      case 'quake_slam': {
        this.spawnDustRing(ev.x, deckY + 0.14, ev.z, 22, 7.2, deckY);
        this.spawnSparks(ev.x, deckY + 0.28, ev.z, 22, this.emberOrangeMat, 8.6, deckY);
        this.spawnShockwave(ev.x, deckY + 0.08, ev.z, 0xff6e24, 0.8, 7.6, 0.46);
        this.spawnShockwave(ev.x, deckY + 0.35, ev.z, 0xffc857, 0.5, 5.4, 0.34);
        this.spawnGroundCrack(ev.x, ev.z, deckY);
        this.triggerClashLight(ev.x, deckY + 0.65, ev.z, 0xff6e24, 22, 0.2);
        break;
      }
      case 'warcry_nova': {
        this.spawnFlash(ev.x, deckY + 1.35, ev.z, this.goldSparkMat, 1.75, 0.18);
        this.spawnSparks(ev.x, deckY + 1.1, ev.z, 18, this.goldSparkMat, 7.4, deckY);
        this.spawnShockwave(ev.x, deckY + 0.16, ev.z, 0xffd659, 0.6, 6.4, 0.42);
        this.spawnShockwave(ev.x, deckY + 0.95, ev.z, 0xfff0a8, 0.4, 4.6, 0.3);
        this.triggerClashLight(ev.x, deckY + 1.4, ev.z, 0xffd659, 18, 0.18);
        break;
      }
      case 'dagger_throw': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.cyanParryMat, 0.75, 0.08);
        break;
      }
      case 'dagger_hit': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.cyanParryMat, 1.35, 0.13);
        this.spawnSparks(ev.x, ev.y, ev.z, 14, this.cyanParryMat, 7.8, deckY);
        this.spawnShockwave(ev.x, deckY + 0.55, ev.z, 0x4ef5d2, 0.35, 2.4, 0.2);
        this.triggerClashLight(ev.x, ev.y, ev.z, 0x4ef5d2, 13, 0.1);
        break;
      }
      case 'ability_cast': {
        this.spawnDustRing(ev.x, deckY + 0.1, ev.z, 8, 3.4, deckY);
        this.spawnShockwave(ev.x, deckY + 0.14, ev.z, 0xffe49e, 0.45, 2.6, 0.22);
        break;
      }
      case 'deflect_push':
      case 'shield_shove': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.whiteHotMat, 1.0, 0.1);
        this.spawnShockwave(ev.x, deckY + 0.25, ev.z, 0xffe099, 0.4, 2.8, 0.22);
        this.spawnDustRing(ev.x, deckY + 0.12, ev.z, 7, 3.3, deckY);
        break;
      }
      case 'evaded': {
        this.spawnDustRing(ev.x, deckY + 0.1, ev.z, 6, 2.6, deckY);
        break;
      }
      case 'death': {
        this.spawnDustRing(ev.x, deckY + 0.12, ev.z, 12, 4.0, deckY);
        this.spawnSparks(ev.x, deckY + 0.9, ev.z, 14, this.emberOrangeMat, 5.8, deckY);
        this.spawnShockwave(ev.x, deckY + 0.08, ev.z, 0xff5533, 0.5, 3.8, 0.35);
        break;
      }
      case 'swing':
        break;
    }
  }

  private triggerClashLight(
    x: number,
    y: number,
    z: number,
    hex: number,
    intensity: number,
    duration: number
  ): void {
    this.clashLight.position.set(x, y, z);
    this.clashLight.color.setHex(hex);
    this.clashLight.intensity = intensity;
    this.clashLightTimer = duration;
  }

  private spawnFlash(
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
    maxScale: number,
    duration: number
  ): void {
    const mesh = new THREE.Mesh(this.flashGeo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.group.add(mesh);
    this.flashes.push({
      mesh,
      life: duration,
      maxLife: duration,
      maxScale,
    });
  }

  private spawnShockwave(
    x: number,
    y: number,
    z: number,
    hexColor: number,
    startScale: number,
    endScale: number,
    duration: number
  ): void {
    const c = new THREE.Color(hexColor).multiplyScalar(1.6);
    const mat = new THREE.MeshBasicMaterial({
      color: c,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(startScale);
    this.group.add(mesh);

    this.shockwaves.push({
      mesh,
      mat,
      life: duration,
      maxLife: duration,
      startScale,
      endScale,
    });
  }

  private spawnGroundCrack(x: number, z: number, deckY = 0): void {
    if (!this.crackDecalTex) return;
    if (this.decals.length >= 6) {
      const old = this.decals.shift()!;
      this.group.remove(old.mesh);
      old.mat.dispose();
    }
    const mat = new THREE.MeshBasicMaterial({
      map: this.crackDecalTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.position.set(x, deckY + 0.032, z);
    this.group.add(mesh);

    this.decals.push({
      mesh,
      mat,
      life: 2.8,
      maxLife: 2.8,
    });
  }

  private spawnSparks(
    x: number,
    y: number,
    z: number,
    count: number,
    mat: THREE.Material,
    speed: number,
    floorY = 0
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        const oldest = this.particles.shift()!;
        this.group.remove(oldest.mesh);
      }

      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.45 + Math.random() * 0.8);
      const vy = 1.8 + Math.random() * 4.4;
      this.group.add(mesh);

      this.particles.push({
        mesh,
        vx: Math.cos(angle) * spd,
        vy,
        vz: Math.sin(angle) * spd,
        floorY,
        gravity: 15.0,
        bounce: 0.45,
        life: 0.28 + Math.random() * 0.2,
        maxLife: 0.42,
        baseScale: 0.85 + Math.random() * 0.65,
        stretchByVelocity: true,
      });
    }
  }

  private spawnDustRing(
    x: number,
    y: number,
    z: number,
    count: number,
    speed: number,
    floorY = 0
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        const oldest = this.particles.shift()!;
        this.group.remove(oldest.mesh);
      }

      const mesh = new THREE.Mesh(this.dustGeo, this.dustMat);
      const a = (i * Math.PI * 2) / count + Math.random() * 0.3;
      mesh.position.set(x + Math.cos(a) * 0.25, y, z + Math.sin(a) * 0.25);
      const spd = speed * (0.55 + Math.random() * 0.55);
      this.group.add(mesh);

      this.particles.push({
        mesh,
        vx: Math.cos(a) * spd,
        vy: 0.75 + Math.random() * 1.2,
        vz: Math.sin(a) * spd,
        floorY,
        gravity: 2.2,
        bounce: 0,
        life: 0.38 + Math.random() * 0.22,
        maxLife: 0.55,
        baseScale: 0.95 + Math.random() * 0.65,
        stretchByVelocity: false,
      });
    }
  }

  public update(dt: number, fighters: Fighter[], showDebug: boolean): void {
    if (this.clashLightTimer > 0) {
      this.clashLightTimer -= dt;
      if (this.clashLightTimer <= 0) {
        this.clashLight.intensity = 0;
      } else {
        this.clashLight.intensity *= Math.exp(-16 * dt);
      }
    }

    // Update flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.group.remove(f.mesh);
        this.flashes.splice(i, 1);
      } else {
        const ratio = f.life / f.maxLife;
        const s = f.maxScale * Math.sin(ratio * Math.PI);
        f.mesh.scale.setScalar(Math.max(0.05, s));
      }
    }

    // Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.group.remove(sw.mesh);
        sw.mat.dispose();
        this.shockwaves.splice(i, 1);
      } else {
        const t = 1 - sw.life / sw.maxLife;
        const eased = 1 - Math.pow(1 - t, 3);
        const s = sw.startScale + (sw.endScale - sw.startScale) * eased;
        sw.mesh.scale.setScalar(s);
        sw.mat.opacity = 0.85 * (1 - t);
      }
    }

    // Update ground fracture decals
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.group.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mat.dispose();
        this.decals.splice(i, 1);
      } else {
        d.mat.opacity = Math.min(0.92, (d.life / d.maxLife) * 1.4);
      }
    }

    // Update sparks & dust
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);
        this.particles.splice(i, 1);
      } else {
        p.vy -= p.gravity * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;

        const minY = p.floorY + 0.05;
        if (p.mesh.position.y < minY) {
          p.mesh.position.y = minY;
          if (p.bounce > 0 && p.vy < 0) {
            p.vy = -p.vy * p.bounce;
            p.vx *= 0.72;
            p.vz *= 0.72;
          } else {
            p.vy = 0;
          }
        }

        const ratio = Math.max(0, p.life / p.maxLife);
        if (p.stretchByVelocity) {
          const s = p.baseScale * ratio;
          p.mesh.scale.set(s * 0.75, s * 2.4, s * 0.75);
          p.mesh.lookAt(
            p.mesh.position.x + p.vx,
            p.mesh.position.y + p.vy,
            p.mesh.position.z + p.vz
          );
        } else {
          p.mesh.rotation.x += dt * 4;
          p.mesh.rotation.y += dt * 3;
          p.mesh.scale.setScalar(p.baseScale * ratio);
        }
      }
    }

    this.debugGroup.visible = showDebug;
    if (showDebug) {
      this.syncDebugHitboxes(fighters);
    }
  }

  private syncDebugHitboxes(fighters: Fighter[]): void {
    const seen = new Set<string>();

    for (const f of fighters) {
      seen.add(f.id);
      let node = this.debugNodes.get(f.id);
      if (!node) {
        const root = new THREE.Group();

        const cylGeo = new THREE.CylinderGeometry(
          f.body.radius,
          f.body.radius,
          1.8,
          12
        );
        const edges = new THREE.EdgesGeometry(cylGeo);
        cylGeo.dispose();
        const hurtbox = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: f.isHuman ? 0x44ff88 : 0xffaa33,
          })
        );
        hurtbox.position.y = 0.9;
        root.add(hurtbox);

        const linePts = [
          new THREE.Vector3(0, 0.15, 0),
          new THREE.Vector3(0, 0.15, 2.2),
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
        const facingLine = new THREE.Line(
          lineGeo,
          new THREE.LineBasicMaterial({ color: 0x57d9ff })
        );
        root.add(facingLine);

        const sectorMat = new THREE.MeshBasicMaterial({
          color: 0xff3333,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const sectorFill = new THREE.Mesh(
          this.createSectorGeo(2.5, 90),
          sectorMat
        );
        sectorFill.position.y = 0.08;
        sectorFill.visible = false;
        root.add(sectorFill);

        this.debugGroup.add(root);
        node = {
          root,
          hurtbox,
          facingLine,
          sectorFill,
          sectorMat,
          sectorArcDeg: 90,
          sectorRange: 2.5,
        };
        this.debugNodes.set(f.id, node);
      }

      node.root.visible = f.isAlive;
      if (!f.isAlive) continue;

      node.root.position.set(f.body.x, f.body.y, f.body.z);
      node.root.rotation.y = f.yaw;

      if (
        (f.state === 'Attacking' || f.state === 'HeavyAttacking') &&
        f.activeAttack &&
        (f.attackPhase === 'Windup' || f.attackPhase === 'Active')
      ) {
        const atk = f.activeAttack;
        if (
          node.sectorRange !== atk.range ||
          node.sectorArcDeg !== atk.hitAngleDeg
        ) {
          node.sectorFill.geometry.dispose();
          node.sectorFill.geometry = this.createSectorGeo(
            atk.range,
            atk.hitAngleDeg
          );
          node.sectorRange = atk.range;
          node.sectorArcDeg = atk.hitAngleDeg;
        }
        node.sectorFill.visible = true;
        if (f.attackPhase === 'Active') {
          node.sectorMat.color.setHex(0xff2b2b);
          node.sectorMat.opacity = 0.48;
        } else {
          node.sectorMat.color.setHex(0xffd23f);
          node.sectorMat.opacity = 0.25;
        }
      } else if (f.state === 'Blocking') {
        const arc = f.config.defense.blockAngleDeg;
        if (node.sectorRange !== 1.65 || node.sectorArcDeg !== arc) {
          node.sectorFill.geometry.dispose();
          node.sectorFill.geometry = this.createSectorGeo(1.65, arc);
          node.sectorRange = 1.65;
          node.sectorArcDeg = arc;
        }
        node.sectorFill.visible = true;
        node.sectorMat.color.setHex(0x38bdf8);
        node.sectorMat.opacity = 0.34;
      } else {
        node.sectorFill.visible = false;
      }
    }

    for (const [id, node] of this.debugNodes.entries()) {
      if (!seen.has(id)) {
        this.debugGroup.remove(node.root);
        this.debugNodes.delete(id);
      }
    }
  }

  private createSectorGeo(range: number, angleDeg: number): THREE.BufferGeometry {
    const rad = (angleDeg * Math.PI) / 180;
    const geo = new THREE.CircleGeometry(
      range,
      18,
      Math.PI / 2 - rad / 2,
      rad
    );
    geo.rotateX(Math.PI / 2);
    return geo;
  }
}
