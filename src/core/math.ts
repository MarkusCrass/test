import { ArenaConfig, BoxObstacle, CircleObstacle } from '../config/arenaConfig';

export interface Vec2XZ {
  x: number;
  z: number;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function wrapAngle(rad: number): number {
  let a = rad % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function angleDiff(from: number, to: number): number {
  return wrapAngle(to - from);
}

export function rotateTowardsAngle(
  current: number,
  target: number,
  maxDelta: number
): number {
  const diff = angleDiff(current, target);
  if (Math.abs(diff) <= maxDelta) {
    return wrapAngle(target);
  }
  return wrapAngle(current + Math.sign(diff) * maxDelta);
}

/**
 * Forward unit vector in XZ from yaw angle.
 * Convention: yaw = 0 points along +Z (sin(yaw), cos(yaw)), matchingatan2(dx, dz).
 */
export function forwardFromYaw(yaw: number): Vec2XZ {
  return {
    x: Math.sin(yaw),
    z: Math.cos(yaw),
  };
}

export function yawFromDir(dx: number, dz: number, fallback = 0): number {
  if (dx * dx + dz * dz < 1e-8) return fallback;
  return Math.atan2(dx, dz);
}

export function distXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(bx - ax, bz - az);
}

export function distSqXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

/**
 * Resolves overlap between a moving circle (x, z, r) and a static circle obstacle.
 */
export function resolveCircleVsCircle(
  pos: Vec2XZ,
  radius: number,
  obs: CircleObstacle
): boolean {
  const dx = pos.x - obs.x;
  const dz = pos.z - obs.z;
  const minDist = radius + obs.radius;
  const dSq = dx * dx + dz * dz;
  if (dSq >= minDist * minDist) return false;

  const d = Math.sqrt(dSq);
  if (d < 1e-5) {
    pos.x = obs.x + minDist;
    return true;
  }
  const push = minDist - d;
  pos.x += (dx / d) * push;
  pos.z += (dz / d) * push;
  return true;
}

/**
 * Resolves overlap between a moving circle (x, z, r) and an oriented box obstacle in XZ.
 */
export function resolveCircleVsBox(
  pos: Vec2XZ,
  radius: number,
  box: BoxObstacle
): boolean {
  const cos = Math.cos(-box.rotationY);
  const sin = Math.sin(-box.rotationY);
  const relX = pos.x - box.x;
  const relZ = pos.z - box.z;

  // Transform circle center into box local space
  const localX = relX * cos - relZ * sin;
  const localZ = relX * sin + relZ * cos;

  const closestX = clamp(localX, -box.halfWidth, box.halfWidth);
  const closestZ = clamp(localZ, -box.halfDepth, box.halfDepth);

  let dx = localX - closestX;
  let dz = localZ - closestZ;
  const dSq = dx * dx + dz * dz;

  if (dSq >= radius * radius) return false;

  let pushLocalX = 0;
  let pushLocalZ = 0;

  if (dSq > 1e-6) {
    const d = Math.sqrt(dSq);
    const pen = radius - d;
    pushLocalX = (dx / d) * pen;
    pushLocalZ = (dz / d) * pen;
  } else {
    // Center is inside box: push out along shallowest axis
    const penX = box.halfWidth - Math.abs(localX) + radius;
    const penZ = box.halfDepth - Math.abs(localZ) + radius;
    if (penX < penZ) {
      pushLocalX = localX >= 0 ? penX : -penX;
    } else {
      pushLocalZ = localZ >= 0 ? penZ : -penZ;
    }
  }

  // Rotate push vector back to world space
  const invCos = Math.cos(box.rotationY);
  const invSin = Math.sin(box.rotationY);
  pos.x += pushLocalX * invCos - pushLocalZ * invSin;
  pos.z += pushLocalX * invSin + pushLocalZ * invCos;
  return true;
}

/**
 * Ray/segment [A -> B] intersection fraction t in [0, 1] with a circle in XZ.
 * Returns null if no hit.
 */
export function segmentCircleHitT(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  r: number
): number | null {
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - cx;
  const fz = az - cz;

  const a = dx * dx + dz * dz;
  if (a < 1e-8) return null;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return Math.max(0, t1);
  return null;
}

/**
 * Checks whether line-of-sight between two XZ points is blocked by full-height pillars or outer wall.
 */
export function isLineBlockedByPillars(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  arena: ArenaConfig,
  padding = 0.05
): boolean {
  for (const pillar of arena.circles) {
    const t = segmentCircleHitT(
      ax,
      az,
      bx,
      bz,
      pillar.x,
      pillar.z,
      pillar.radius + padding
    );
    if (t !== null && t > 0.02 && t < 0.98) {
      return true;
    }
  }
  return false;
}
