import { ArenaConfig } from '../config/arenaConfig';
import {
  clamp,
  resolveCircleVsBox,
  resolveCircleVsCircle,
  Vec2XZ,
} from './math';

/**
 * Kinematic 3D CharacterBody3D equivalent supporting Multi-Tier Arenas:
 * - Tier 1 Lower Courtyard (y = 0m) AND Tier 2 Skybridge / Bastions (y = 4.0m)
 * - Full Over-and-Under Bridge separation (walk over the bridge OR fight underneath it!)
 * - Smooth Staircase climbing & descending + Gravity drop-offs off open bridge ledges
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
  public isGrounded = true;
  public readonly radius: number;

  constructor(x: number, z: number, radius: number, initialY = 0) {
    this.x = x;
    this.y = initialY;
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
    const steps = moveDist > this.radius * 0.7 ? 2 : 1;
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      this.x += totalVx * stepDt;
      this.z += totalVz * stepDt;
      this.constrainToArena(arena);

      // Update vertical elevation across Staircases, Skybridge & Gravity drop-offs!
      const supportY = this.computeSupportFloorY(arena);
      if (this.y <= supportY + 0.55 && this.vy <= 0) {
        // Stick smoothly to stairs & deck transitions
        this.y = supportY;
        this.vy = 0;
        this.isGrounded = true;
      } else {
        // Falling off an elevated bridge ledge!
        this.vy -= 28.0 * stepDt;
        this.y += this.vy * stepDt;
        if (this.y <= supportY) {
          this.y = supportY;
          this.vy = 0;
          this.isGrounded = true;
        } else {
          this.isGrounded = false;
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
   * Computes the walkable floor Y beneath (x, z) given current elevation `this.y`,
   * allowing fighters to walk BOTH over the y=4.0m Skybridge AND underneath it at y=0.0m!
   */
  public computeSupportFloorY(arena: ArenaConfig): number {
    let bestY = 0;

    // 1. Check Staircase Ramps
    if (arena.stairs) {
      for (const s of arena.stairs) {
        if (
          this.x >= s.minX - this.radius * 0.25 &&
          this.x <= s.maxX + this.radius * 0.25 &&
          this.z >= s.minZ &&
          this.z <= s.maxZ
        ) {
          const span = s.zHigh - s.zLow;
          const t =
            Math.abs(span) > 1e-4 ? clamp((this.z - s.zLow) / span, 0, 1) : 0;
          const rampY = s.bottomY + t * (s.topY - s.bottomY);
          // Only step onto stair surface if within step-up reach (prevents side-wall teleport)
          if (this.y >= rampY - 1.35) {
            bestY = Math.max(bestY, rampY);
          }
        }
      }
    }

    // 2. Check Elevated Platforms & Skybridge Deck
    if (arena.platforms) {
      for (const p of arena.platforms) {
        if (
          this.x >= p.minX - this.radius * 0.25 &&
          this.x <= p.maxX + this.radius * 0.25 &&
          this.z >= p.minZ - this.radius * 0.25 &&
          this.z <= p.maxZ + this.radius * 0.25
        ) {
          // Fighter is on top of the deck if already near deck elevation; otherwise underneath at y=0!
          if (this.y >= p.topY - 1.15) {
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
      if (this.y + 1.8 > cMinY && this.y < cMaxY - 0.08) {
        resolveCircleVsCircle(pos, this.radius, circle);
      }
    }

    // 2. Barriers, crates & upper bridge parapet railings (elevation-filtered!)
    for (const box of arena.boxes) {
      const bMinY = box.minY ?? 0;
      const bMaxY = bMinY + box.height;
      if (this.y + 1.8 > bMinY && this.y < bMaxY - 0.05) {
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
   * Fighters on the y=4m Skybridge never push fighters walking underneath at y=0m.
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
          // Do not collide horizontally if one fighter is on the bridge and one is below!
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
      }
    }
  }
}
