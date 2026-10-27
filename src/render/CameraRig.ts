import * as THREE from 'three';
import { ArenaConfig } from '../config/arenaConfig';
import { clamp, lerp, segmentCircleHitT, wrapAngle } from '../core/math';

/**
 * Godot-style SpringArm3D + Camera3D controller:
 * - Free 360 horizontal yaw & clamped vertical pitch
 * - Smooth damped 3D follow on character pivot (across Tier 1 Courtyard, Staircases & Tier 2 Skybridge!)
 * - Analytical spring-arm collision against fortress perimeter walls, stone columns & bridge deck
 * - Controlled impact camera shake
 */
export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;

  public yaw = 0;
  public pitch = 0.36; // ~20 deg downward overview
  private readonly minPitch = 0.06;
  private readonly maxPitch = 0.95;

  private readonly pivot = new THREE.Vector3(0, 1.65, 0);
  private pivotInitialized = false;

  private readonly idealDistance = 5.65;
  private currentDistance = 5.65;

  private shakeTrauma = 0;
  private shakeTime = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.15, 165);
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public snapBehindTarget(
    x: number,
    z: number,
    facingYaw: number,
    targetY = 0
  ): void {
    this.yaw = wrapAngle(facingYaw);
    this.pitch = 0.35;
    this.pivot.set(x, targetY + 1.65, z);
    this.pivotInitialized = true;
    this.currentDistance = this.idealDistance;
  }

  public applyMouseDelta(
    movementX: number,
    movementY: number,
    sensitivity: number
  ): void {
    const baseScale = 0.0024 * sensitivity;
    this.yaw = wrapAngle(this.yaw - movementX * baseScale);
    this.pitch = clamp(
      this.pitch + movementY * baseScale * 0.85,
      this.minPitch,
      this.maxPitch
    );
  }

  public addShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1.0);
  }

  /**
   * Returns camera horizontal forward & right vectors on XZ plane for camera-relative WASD.
   */
  public getHorizontalBasis(): {
    fwdX: number;
    fwdZ: number;
    rightX: number;
    rightZ: number;
  } {
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    return { fwdX, fwdZ, rightX, rightZ };
  }

  public updateGameplay(
    dt: number,
    targetX: number,
    targetZ: number,
    arena: ArenaConfig,
    targetY = 0
  ): void {
    const targetPivotY = targetY + 1.68;
    if (!this.pivotInitialized) {
      this.pivot.set(targetX, targetPivotY, targetZ);
      this.pivotInitialized = true;
    } else {
      const followAlpha = 1 - Math.exp(-15.0 * dt);
      const yAlpha = 1 - Math.exp(-12.5 * dt);
      this.pivot.x = lerp(this.pivot.x, targetX, followAlpha);
      this.pivot.y = lerp(this.pivot.y, targetPivotY, yAlpha);
      this.pivot.z = lerp(this.pivot.z, targetZ, followAlpha);
    }

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const backX = -Math.sin(this.yaw) * cosPitch;
    const backY = sinPitch;
    const backZ = -Math.cos(this.yaw) * cosPitch;

    const desiredX = this.pivot.x + backX * this.idealDistance;
    const desiredZ = this.pivot.z + backZ * this.idealDistance;

    let minT = 1.0;

    // 1. Check rectangular fortress perimeter walls (if present)
    if (arena.boundsHalfX && arena.boundsHalfZ) {
      const limX = arena.boundsHalfX - 0.55;
      const limZ = arena.boundsHalfZ - 0.55;
      const dx = desiredX - this.pivot.x;
      const dz = desiredZ - this.pivot.z;
      if (Math.abs(desiredX) > limX && Math.abs(dx) > 1e-5) {
        const edgeX = Math.sign(desiredX) * limX;
        const tx = (edgeX - this.pivot.x) / dx;
        minT = Math.min(minT, clamp(tx, 0.2, 1.0));
      }
      if (Math.abs(desiredZ) > limZ && Math.abs(dz) > 1e-5) {
        const edgeZ = Math.sign(desiredZ) * limZ;
        const tz = (edgeZ - this.pivot.z) / dz;
        minT = Math.min(minT, clamp(tz, 0.2, 1.0));
      }
    }

    // 2. Check outer bounding circle
    const wallR = arena.radius - 0.55;
    const wallT = this.rayInsideCircleExitT(
      this.pivot.x,
      this.pivot.z,
      desiredX,
      desiredZ,
      wallR
    );
    if (wallT < minT) {
      minT = wallT;
    }

    // 3. Check camera-blocking stone pillars at current tier elevation
    for (const c of arena.circles) {
      if (!c.blocksCamera) continue;
      const cMinY = c.minY ?? 0;
      const cMaxY = cMinY + c.height;
      if (targetY >= cMaxY - 0.15) continue;

      const hitT = segmentCircleHitT(
        this.pivot.x,
        this.pivot.z,
        desiredX,
        desiredZ,
        c.x,
        c.z,
        c.radius + 0.38
      );
      if (hitT !== null && hitT < minT) {
        minT = Math.max(0.2, hitT - 0.04);
      }
    }

    const safeDist = Math.max(1.25, this.idealDistance * minT);
    if (safeDist < this.currentDistance) {
      this.currentDistance = lerp(
        this.currentDistance,
        safeDist,
        1 - Math.exp(-26 * dt)
      );
    } else {
      this.currentDistance = lerp(
        this.currentDistance,
        safeDist,
        1 - Math.exp(-9 * dt)
      );
    }

    let camX = this.pivot.x + backX * this.currentDistance;
    let camY = Math.max(
      targetY + 0.65,
      this.pivot.y + backY * this.currentDistance
    );
    let camZ = this.pivot.z + backZ * this.currentDistance;

    if (this.shakeTrauma > 0) {
      this.shakeTime += dt * 38;
      const mag = this.shakeTrauma * this.shakeTrauma * 0.22;
      camX += Math.sin(this.shakeTime * 1.7) * mag;
      camY += Math.cos(this.shakeTime * 2.3) * mag * 0.8;
      camZ += Math.sin(this.shakeTime * 1.3) * mag;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 3.1);
    }

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(this.pivot.x, this.pivot.y - 0.12, this.pivot.z);
  }

  /**
   * Panoramic arena camera for Main Menu background showcasing the Two-Tier Skybridge & Staircases!
   */
  public updateMenuOrbit(elapsed: number): void {
    this.pivotInitialized = false;
    const angle = elapsed * 0.14;
    const r = 17.6;
    this.camera.position.set(Math.cos(angle) * r, 8.8, Math.sin(angle) * r);
    this.camera.lookAt(0, 3.1, 0);
  }

  /**
   * Framed close-up camera for the Character Selection 3D showcase knight!
   */
  public updateShowcaseCamera(pedestalX: number, pedestalZ: number): void {
    this.pivotInitialized = false;
    this.camera.position.set(pedestalX - 0.85, 1.95, pedestalZ + 3.45);
    this.camera.lookAt(pedestalX - 0.55, 1.28, pedestalZ);
  }

  private rayInsideCircleExitT(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    r: number
  ): number {
    const endDistSq = bx * bx + bz * bz;
    if (endDistSq <= r * r) return 1.0;

    const dx = bx - ax;
    const dz = bz - az;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) return 1.0;

    const b = 2 * (ax * dx + az * dz);
    const c = ax * ax + az * az - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return 0.25;

    const tExit = (-b + Math.sqrt(disc)) / (2 * a);
    return clamp(tExit, 0.2, 1.0);
  }
}
