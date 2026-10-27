import * as THREE from 'three';
import { ArenaConfig } from '../config/arenaConfig';
import { clamp, lerp, segmentCircleHitT, wrapAngle } from '../core/math';

/**
 * Godot-style SpringArm3D + Camera3D controller:
 * - Free 360 horizontal yaw & clamped vertical pitch
 * - Smooth damped follow on character pivot
 * - Analytical spring-arm collision against outer perimeter walls, stone columns & floor
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

  private readonly idealDistance = 5.5;
  private currentDistance = 5.5;

  private shakeTrauma = 0;
  private shakeTime = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.15, 95);
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public snapBehindTarget(x: number, z: number, facingYaw: number): void {
    // Camera looks along `yaw`: forward = (sin(yaw), cos(yaw)), so camera sits at -forward
    this.yaw = wrapAngle(facingYaw);
    this.pitch = 0.35;
    this.pivot.set(x, 1.65, z);
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
    // Right vector in Three.js right-handed world when looking toward (+sin(yaw), 0, +cos(yaw))
    const rightX = -fwdZ;
    const rightZ = fwdX;
    return { fwdX, fwdZ, rightX, rightZ };
  }

  public updateGameplay(
    dt: number,
    targetX: number,
    targetZ: number,
    arena: ArenaConfig
  ): void {
    const targetPivotY = 1.68;
    if (!this.pivotInitialized) {
      this.pivot.set(targetX, targetPivotY, targetZ);
      this.pivotInitialized = true;
    } else {
      const followAlpha = 1 - Math.exp(-15.0 * dt);
      this.pivot.x = lerp(this.pivot.x, targetX, followAlpha);
      this.pivot.y = lerp(this.pivot.y, targetPivotY, followAlpha);
      this.pivot.z = lerp(this.pivot.z, targetZ, followAlpha);
    }

    // Desired camera offset along (-sin(yaw)*cos(pitch), +sin(pitch), -cos(yaw)*cos(pitch))
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const backX = -Math.sin(this.yaw) * cosPitch;
    const backY = sinPitch;
    const backZ = -Math.cos(this.yaw) * cosPitch;

    const desiredX = this.pivot.x + backX * this.idealDistance;
    const desiredZ = this.pivot.z + backZ * this.idealDistance;

    // Spring-arm collision fraction minT in [0.18, 1.0]
    let minT = 1.0;

    // 1. Check outer stone perimeter wall (interior of cylinder r = arena.radius - 0.55)
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

    // 2. Check camera-blocking stone pillars
    for (const c of arena.circles) {
      if (!c.blocksCamera) continue;
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
      // Pull inward briskly to never clip walls
      this.currentDistance = lerp(
        this.currentDistance,
        safeDist,
        1 - Math.exp(-26 * dt)
      );
    } else {
      // Ease outward smoothly when obstacle clears
      this.currentDistance = lerp(
        this.currentDistance,
        safeDist,
        1 - Math.exp(-9 * dt)
      );
    }

    let camX = this.pivot.x + backX * this.currentDistance;
    let camY = Math.max(0.65, this.pivot.y + backY * this.currentDistance);
    let camZ = this.pivot.z + backZ * this.currentDistance;

    // Subtle, controlled camera shake on heavy impacts
    if (this.shakeTrauma > 0) {
      this.shakeTime += dt * 38;
      const mag = this.shakeTrauma * this.shakeTrauma * 0.22;
      camX += Math.sin(this.shakeTime * 1.7) * mag;
      camY += Math.cos(this.shakeTime * 2.3) * mag * 0.8;
      camZ += Math.sin(this.shakeTime * 1.3) * mag;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 3.1);
    }

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(
      this.pivot.x,
      this.pivot.y - 0.12,
      this.pivot.z
    );
  }

  /**
   * Panoramic arena camera for Main Menu background.
   */
  public updateMenuOrbit(elapsed: number): void {
    this.pivotInitialized = false;
    const angle = elapsed * 0.16;
    const r = 10.6;
    this.camera.position.set(Math.cos(angle) * r, 5.2, Math.sin(angle) * r);
    this.camera.lookAt(0, 1.3, 0);
  }

  /**
   * Framed close-up camera for the Character Selection 3D showcase knight!
   */
  public updateShowcaseCamera(pedestalX: number, pedestalZ: number): void {
    this.pivotInitialized = false;
    // Place knight slightly on the right half so left UI panel has clean breathing room
    this.camera.position.set(pedestalX - 0.85, 1.95, pedestalZ + 3.45);
    this.camera.lookAt(pedestalX - 0.55, 1.28, pedestalZ);
  }

  /**
   * Computes fraction t in [0..1] where segment A->B exits circle of radius R centered at (0,0).
   */
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
