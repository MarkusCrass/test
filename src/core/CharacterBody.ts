import { ArenaConfig } from '../config/arenaConfig';
import {
  clamp,
  resolveCircleVsBox,
  resolveCircleVsCircle,
  Vec2XZ,
} from './math';

/**
 * Kinematic 3D CharacterBody3D equivalent supporting Multi-Tier Arenas & Jumping:
 * - Tier 1 Lower Courtyard (y = 0m) AND Tier 2 Skybridge / Bastions (y = 4.0m)
 * - Full Parabolic Jump (Space) capable of clearing low barriers & leaping off bridge edges
 * - Smooth Staircase climbing & descending without premature snap when airborne
 * - Elevation-filtered obstacle collisions & pairwise fighter separation
 */
export class CharacterBody {
  public x: number;
  public y: number;
  public z: number;
  public vx = 0;
  public vy = 0;
  public vz = 0;
  public knockbackVx = 0;
  public knockbackVz = 0;
  public supportFloorY = 0;
  public isGrounded = true;
  public justLanded = false;
  public readonly radius: number;

  constructor(x: number, z: number, radius: number, initialY = 0) {
    this.x = x;
    this.y = initialY;
    this.supportFloorY = initialY;
    this.z = z;
    this.radius = radius;
  }

  public applyImpulse(ix: number, iz: number): void {
    this.knockbackVx += ix;
    this.knockbackVz += iz;
  }

  public jump(upwardVelocity: number): boolean {
    if (!this.isGrounded) return false;
    this.vy = upwardVelocity;
    this.isGrounded = false;
    this.justLanded = false;
    return true;
  }

  public moveAndSlide(dt: number, arena: ArenaConfig): void {
    this.justLanded = false;
    const totalVx = this.vx + this.knockbackVx;
    const totalVz = this.vz + this.knockbackVz;

    // Sub-step if moving fast (e.g. fast dash or heavy knockback) to avoid tunneling
    const moveDist = Math.hypot(totalVx * dt, totalVz * dt);
    const steps = moveDist > this.radius * 0.7 ? 2 : 1;
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      const wasGrounded = this.isGrounded;
      this.x += totalVx * stepDt;
      this.z += totalVz * stepDt;

      // Elevate along stairs/ramps BEFORE horizontal obstacle checks so stepping onto
      // an upper platform never clips the underside base wall at the top step!
      if (wasGrounded && this.vy <= 0) {
        const preSupportY = this.computeSupportFloorY(arena);
        if (this.y <= preSupportY + 1.15 && preSupportY > this.y) {
          this.y = preSupportY;
        }
      }

      this.constrainToArena(arena);

      const supportY = this.computeSupportFloorY(arena);
      this.supportFloorY = supportY;

      if (wasGrounded && this.vy <= 0 && this.y <= supportY + 1.15) {
        // Walking or sprinting along flat floor or up/down staircase steps -> stick cleanly to surface!
        this.y = supportY;
        this.vy = 0;
        this.isGrounded = true;
      } else {
        // Airborne (jumping upward, falling from jump apex, or dropping off the Skybridge!)
        this.isGrounded = false;
        this.vy -= 28.0 * stepDt;
        this.y += this.vy * stepDt;
        if (this.y <= supportY) {
          // Never allow tunneling below supportY — even when jumping forward up steep stairs (vy > 0)!
          this.y = supportY;
          if (this.vy <= 0) {
            this.vy = 0;
            this.isGrounded = true;
            this.justLanded = true;
          }
        }
      }
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

  /**
   * Computes the walkable floor Y beneath (x, z):
   * - Solid stone staircases (`arena.stairs`) and solid Bastion keeps (`bastion_west`/`bastion_east`)
   *   ALWAYS support the fighter (impossible to fall through at any speed, jump, or knockback!).
   * - Only the central elevated Skybridge (`bridge_center`, x in [-10..10]) has an open walk-under archway.
   */
  public computeSupportFloorY(arena: ArenaConfig): number {
    let bestY = 0;

    // 1. Solid Stone Staircase Ramps (stairs_wide.gltf.glb — physically solid masonry!)
    if (arena.stairs) {
      for (const s of arena.stairs) {
        if (
          this.x >= s.minX &&
          this.x <= s.maxX &&
          this.z >= s.minZ &&
          this.z <= s.maxZ
        ) {
          const span = s.zHigh - s.zLow;
          const t =
            Math.abs(span) > 1e-4 ? clamp((this.z - s.zLow) / span, 0, 1) : 0;
          const rampY = s.bottomY + t * (s.topY - s.bottomY);
          bestY = Math.max(bestY, rampY);
        }
      }
    }

    // 2. Elevated Platforms (West/East Bastions are solid keeps; central Skybridge has walk-under arch!)
    if (arena.platforms) {
      for (const p of arena.platforms) {
        const margin = p.id === 'bridge_center' ? this.radius * 0.25 : 0;
        if (
          this.x >= p.minX - margin &&
          this.x <= p.maxX + margin &&
          this.z >= p.minZ - margin &&
          this.z <= p.maxZ + margin
        ) {
          const isWalkUnderSpan = p.id === 'bridge_center';
          if (!isWalkUnderSpan || this.y >= p.topY - 1.25) {
            bestY = Math.max(bestY, p.topY);
          }
        }
      }
    }

    return bestY;
  }

  public constrainToArena(arena: ArenaConfig): void {
    const pos: Vec2XZ = { x: this.x, z: this.z };

    // 1. Stone pillars (only collide if fighter's vertical body overlaps the pillar's height!)
    for (const circle of arena.circles) {
      const cMinY = circle.minY ?? 0;
      const cMaxY = cMinY + circle.height;
      if (this.y + 1.55 > cMinY && this.y < cMaxY - 0.12) {
        resolveCircleVsCircle(pos, this.radius, circle);
      }
    }

    // 2. Barriers, crates & upper bridge parapet railings (jumping above bMaxY vaults cleanly over!)
    for (const box of arena.boxes) {
      const bMinY = box.minY ?? 0;
      const bMaxY = bMinY + box.height;
      if (this.y + 1.55 > bMinY && this.y < bMaxY - 0.05) {
        resolveCircleVsBox(pos, this.radius, box);
      }
    }

    // 3. Rectangular Castle Fortress Walls (if configured)
    if (arena.boundsHalfX && arena.boundsHalfZ) {
      const maxX = arena.boundsHalfX - this.radius;
      const maxZ = arena.boundsHalfZ - this.radius;
      pos.x = clamp(pos.x, -maxX, maxX);
      pos.z = clamp(pos.z, -maxZ, maxZ);
    }

    // 4. Outer bounding circle safety
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
   * Resolves overlap between living CharacterBodies on the SAME vertical tier!
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
          if (Math.abs(a.y - b.y) > 1.75) continue;

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
        const supportY = b.computeSupportFloorY(arena);
        b.supportFloorY = supportY;
        if (
          b.y < supportY ||
          (b.isGrounded && b.vy <= 0 && b.y <= supportY + 1.15)
        ) {
          b.y = supportY;
          if (b.vy < 0) b.vy = 0;
          b.isGrounded = true;
        }
      }
    }
  }
}
