import * as THREE from 'three';
import { CombatEvent } from '../core/CombatSystem';
import { Fighter } from '../core/Fighter';

interface BurstParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  life: number;
  maxLife: number;
  baseScale: number;
  shrink: boolean;
}

interface FlashStar {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

/**
 * Manages expressive low-poly combat effects (impact star-flashes, metal sparks,
 * ground slam dust puffs, knockback dust) with capped particle counts for smooth 60 FPS,
 * PLUS developer Debug Hitbox & Attack Arc 3D visualization (toggleable via F3 / Settings).
 */
export class EffectsManager {
  public readonly group = new THREE.Group();
  public readonly debugGroup = new THREE.Group();

  private readonly particles: BurstParticle[] = [];
  private readonly flashes: FlashStar[] = [];
  private readonly maxParticles = 90;

  private readonly sparkGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
  private readonly dustGeo = new THREE.DodecahedronGeometry(0.18, 0);
  private readonly flashGeo = new THREE.OctahedronGeometry(0.36, 0);

  private readonly yellowMat = new THREE.MeshBasicMaterial({ color: 0xffe34d });
  private readonly orangeMat = new THREE.MeshBasicMaterial({ color: 0xff7b24 });
  private readonly whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly cyanParryMat = new THREE.MeshBasicMaterial({ color: 0x6ef2ff });
  private readonly dustMat = new THREE.MeshBasicMaterial({
    color: 0xa69f94,
    transparent: true,
    opacity: 0.75,
  });

  // Reusable debug wireframe meshes per fighter id
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

  constructor() {
    this.group.add(this.debugGroup);
  }

  public clearAll(): void {
    for (const p of this.particles) {
      this.group.remove(p.mesh);
    }
    this.particles.length = 0;

    for (const f of this.flashes) {
      this.group.remove(f.mesh);
    }
    this.flashes.length = 0;

    for (const node of this.debugNodes.values()) {
      this.debugGroup.remove(node.root);
      node.hurtbox.geometry.dispose();
      node.facingLine.geometry.dispose();
      node.sectorFill.geometry.dispose();
    }
    this.debugNodes.clear();
  }

  public spawnFromEvent(ev: CombatEvent): void {
    switch (ev.type) {
      case 'hit': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.yellowMat, 1.05, 0.11);
        this.spawnSparks(ev.x, ev.y, ev.z, 8, this.yellowMat, 5.8);
        break;
      }
      case 'heavy_hit': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.whiteMat, 1.65, 0.15);
        this.spawnSparks(ev.x, ev.y, ev.z, 14, this.orangeMat, 7.6);
        this.spawnDustRing(ev.x, 0.12, ev.z, 7, 3.6);
        break;
      }
      case 'blocked': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.whiteMat, 0.9, 0.1);
        this.spawnSparks(ev.x, ev.y, ev.z, 9, this.whiteMat, 6.2);
        break;
      }
      case 'parried': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.cyanParryMat, 1.75, 0.18);
        this.spawnSparks(ev.x, ev.y, ev.z, 14, this.yellowMat, 8.2);
        break;
      }
      case 'guard_broken': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.orangeMat, 1.6, 0.16);
        this.spawnSparks(ev.x, ev.y, ev.z, 12, this.orangeMat, 7.0);
        break;
      }
      case 'ground_slam': {
        this.spawnDustRing(ev.x, 0.1, ev.z, 14, 5.2);
        this.spawnSparks(ev.x, 0.25, ev.z, 8, this.orangeMat, 5.5);
        break;
      }
      case 'deflect_push':
      case 'shield_shove': {
        this.spawnFlash(ev.x, ev.y, ev.z, this.whiteMat, 1.0, 0.11);
        this.spawnDustRing(ev.x, 0.12, ev.z, 6, 3.2);
        break;
      }
      case 'evaded': {
        this.spawnDustRing(ev.x, 0.1, ev.z, 5, 2.5);
        break;
      }
      case 'death': {
        this.spawnDustRing(ev.x, 0.12, ev.z, 10, 3.8);
        this.spawnSparks(ev.x, 0.9, ev.z, 10, this.orangeMat, 5.0);
        break;
      }
      case 'swing':
        break;
    }
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

  private spawnSparks(
    x: number,
    y: number,
    z: number,
    count: number,
    mat: THREE.Material,
    speed: number
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        const oldest = this.particles.shift()!;
        this.group.remove(oldest.mesh);
      }

      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.45 + Math.random() * 0.75);
      const vy = 1.6 + Math.random() * 3.8;
      this.group.add(mesh);

      this.particles.push({
        mesh,
        vx: Math.cos(angle) * spd,
        vy,
        vz: Math.sin(angle) * spd,
        gravity: 13.5,
        life: 0.24 + Math.random() * 0.16,
        maxLife: 0.35,
        baseScale: 0.8 + Math.random() * 0.6,
        shrink: true,
      });
    }
  }

  private spawnDustRing(
    x: number,
    y: number,
    z: number,
    count: number,
    speed: number
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) {
        const oldest = this.particles.shift()!;
        this.group.remove(oldest.mesh);
      }

      const mesh = new THREE.Mesh(this.dustGeo, this.dustMat);
      const a = (i * Math.PI * 2) / count + Math.random() * 0.3;
      mesh.position.set(x + Math.cos(a) * 0.25, y, z + Math.sin(a) * 0.25);
      const spd = speed * (0.6 + Math.random() * 0.5);
      this.group.add(mesh);

      this.particles.push({
        mesh,
        vx: Math.cos(a) * spd,
        vy: 0.7 + Math.random() * 1.1,
        vz: Math.sin(a) * spd,
        gravity: 2.2,
        life: 0.35 + Math.random() * 0.18,
        maxLife: 0.5,
        baseScale: 0.9 + Math.random() * 0.6,
        shrink: true,
      });
    }
  }

  public update(dt: number, fighters: Fighter[], showDebug: boolean): void {
    // Update impact star flashes
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
        p.mesh.position.y = Math.max(0.05, p.mesh.position.y + p.vy * dt);
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += dt * 7;
        p.mesh.rotation.y += dt * 5;
        if (p.shrink) {
          const ratio = Math.max(0, p.life / p.maxLife);
          p.mesh.scale.setScalar(p.baseScale * ratio);
        }
      }
    }

    // Update Debug Hitbox & Attack Direction Visualization
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

      node.root.position.set(f.body.x, 0, f.body.z);
      node.root.rotation.y = f.yaw;

      // Show attack Windup (yellow), Active hitbox (bright red), or Block cone (cyan)
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
    // In Three.js RingGeometry/CircleGeometry before rotation, angle 0 is +X;
    // we want center of sector pointing along local +Z!
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
