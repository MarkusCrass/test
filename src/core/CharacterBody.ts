import { ArenaConfig } from '../config/arenaConfig';
import {
  resolveCircleVsBox,
  resolveCircleVsCircle,
  Vec2XZ,
} from './math';

/**
 * Kinematic CharacterBody3D equivalent on the arena ground plane.
 * Handles velocity integration, smooth wall/obstacle sliding, arena perimeter confinement,
 * and pairwise fighter separation so characters never get stuck inside geometry or each other.
 */
export class CharacterBody {
  public x: number;
  public y = 0;
  public z: number;
  public vx = 0;
  public vz = 0;
  public knockbackVx = 0;
  public knockbackVz = 0;
  public readonly radius: number;

  constructor(x: number, z: number, radius: number) {
    this.x = x;
    this.z = z;
    this.radius = radius;
  }

  public applyImpulse(ix: number, iz: number): void {
    this.knockbackVx += ix;
    this.knockbackVz += iz;
  }

  public moveAndSlide(dt: number, arena: ArenaConfig): void {
    const totalVx = this.vx + this.knockbackVx;
    const totalVz = this.vz + this.knockbackVz;

    // Sub-step if moving fast (e.g. fast dash or heavy knockback) to avoid tunneling
    const moveDist = Math.hypot(totalVx * dt, totalVz * dt);
    const steps = moveDist > this.radius * 0.75 ? 2 : 1;
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this.x += totalVx * stepDt;
      this.z += totalVz * stepDt;
      this.constrainToArena(arena);
    }

    // Exponential decay on knockback velocity
    const damping = Math.exp(-9.5 * dt);
    this.knockbackVx *= damping;
    this.knockbackVz *= damping;
    if (Math.hypot(this.knockbackVx, this.knockbackVz) < 0.08) {
      this.knockbackVx = 0;
      this.knockbackVz = 0;
    }
  }

  public constrainToArena(arena: ArenaConfig): void {
    const pos: Vec2XZ = { x: this.x, z: this.z };

    // 1. Stone pillars
    for (const circle of arena.circles) {
      resolveCircleVsCircle(pos, this.radius, circle);
    }

    // 2. Wooden barricades / crates
    for (const box of arena.boxes) {
      resolveCircleVsBox(pos, this.radius, box);
    }

    // 3. Outer stone wall boundary
    const maxR = arena.radius - this.radius - 0.15;
    const distFromCenter = Math.hypot(pos.x, pos.z);
    if (distFromCenter > maxR && distFromCenter > 1e-5) {
      const scale = maxR / distFromCenter;
      pos.x *= scale;
      pos.z *= scale;
    }

    this.x = pos.x;
    this.z = pos.z;
  }

  /**
   * Resolves overlap between all living CharacterBodies so fighters never stack inside one another.
   */
  public static resolveFighterCollisions(
    bodies: CharacterBody[],
    arena: ArenaConfig
  ): void {
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const minDist = a.radius + b.radius;
          const dSq = dx * dx + dz * dz;
          if (dSq < minDist * minDist) {
            const d = Math.sqrt(dSq);
            let nx = 1;
            let nz = 0;
            if (d > 1e-5) {
              nx = dx / d;
              nz = dz / d;
            } else {
              const angle = (i * 1.7 + j * 2.3) % (Math.PI * 2);
              nx = Math.cos(angle);
              nz = Math.sin(angle);
            }
            const overlap = (minDist - d) * 0.5;
            a.x -= nx * overlap;
            a.z -= nz * overlap;
            b.x += nx * overlap;
            b.z += nz * overlap;
          }
        }
      }
      for (const b of bodies) {
        b.constrainToArena(arena);
      }
    }
  }
}
