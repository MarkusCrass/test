import * as THREE from 'three';
import { ArenaConfig } from '../config/arenaConfig';
import { Fighter } from '../core/Fighter';
import {
  clamp,
  lerp,
  segmentCircleHitT,
  wrapAngle,
  yawFromDir,
} from '../core/math';

export { RETICLE_DEFAULT_NORM_X, RETICLE_DEFAULT_NORM_Y } from '../config/aim';

export interface CrosshairAimResult {
  aimYaw: number;
  aimPitch: number;
  aimWorldX: number;
  aimWorldY: number;
  aimWorldZ: number;
  targetFighterId: string | null;
  targetName: string | null;
  targetHpRatio: number;
}

/**
 * Action-MMORPG Free 360° Spherical Spring-Arm Camera + 3D Crosshair Raycaster:
 * - Unrestricted 360° horizontal orbit (`yaw`)
 * - Full vertical pitch (`-47°` looking steep upward at Skybridge/towers to `+70°` tactical MMORPG overview)
 * - Smooth mouse-wheel zoom (`2.4m` close action view to `10.8m` wide MMORPG arena view)
 * - Elevated over-head sightline pivot to keep the character from blocking the crosshair
 * - Universal 3D raycast through any screen crosshair position `(normX, normY)` for parallax-true 3D aiming
 */
export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;

  public yaw = 0;
  public pitch = 0.24; // ~14 deg clean elevated MMORPG sightline
  public readonly minPitch = -0.82; // -47 deg: look steep upward!
  public readonly maxPitch = 1.22; // +70 deg: high MMORPG bird's-eye overview!

  public readonly minDistance = 2.4;
  public readonly maxDistance = 10.8;
  public targetDistance = 6.0;
  private smoothedTargetDistance = 6.0;
  private currentDistance = 6.0;

  private readonly pivot = new THREE.Vector3(0, 2.02, 0);
  private pivotInitialized = false;

  private shakeTrauma = 0;
  private shakeTime = 0;

  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpNdc = new THREE.Vector2();

  constructor(aspect: number) {
    // The 165 m sky dome must lie entirely in front of the far clip plane,
    // even when the camera is offset toward an arena wall.
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.15, 300);
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
    this.pitch = 0.24;
    this.smoothedTargetDistance = this.targetDistance;
    this.currentDistance = this.targetDistance;
    this.pivot.set(x, targetY + this.getPivotHeightOffset(), z);
    this.pivotInitialized = true;

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const backX = -Math.sin(this.yaw) * cosPitch;
    const backY = sinPitch;
    const backZ = -Math.cos(this.yaw) * cosPitch;
    this.camera.position.set(
      this.pivot.x + backX * this.currentDistance,
      Math.max(targetY + 0.3, this.pivot.y + backY * this.currentDistance),
      this.pivot.z + backZ * this.currentDistance
    );
    this.camera.lookAt(this.pivot.x, this.pivot.y + 0.06, this.pivot.z);
    this.camera.updateMatrixWorld();
  }

  public applyMouseDelta(
    movementX: number,
    movementY: number,
    sensitivity: number
  ): void {
    const baseScale = 0.0025 * sensitivity;
    this.yaw = wrapAngle(this.yaw - movementX * baseScale);
    this.pitch = clamp(
      this.pitch + movementY * baseScale * 0.9,
      this.minPitch,
      this.maxPitch
    );
  }

  /**
   * Smooth MMORPG mouse-wheel camera zoom in/out (`2.4m .. 10.8m`).
   */
  public applyWheelZoom(deltaY: number): void {
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 1e-4) return;
    // Normalize pixel vs line wheel deltas across browsers/trackpads
    const step = clamp(deltaY, -160, 160) * 0.0055;
    this.targetDistance = clamp(
      this.targetDistance + step,
      this.minDistance,
      this.maxDistance
    );
  }

  public addShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1.0);
  }

  private getPivotHeightOffset(): number {
    const zoomT = clamp(
      (this.smoothedTargetDistance - this.minDistance) /
        (this.maxDistance - this.minDistance),
      0,
      1
    );
    // Elevated pivot keeps the character from blocking the default crosshair.
    return lerp(1.88, 2.14, zoomT);
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
    return CameraRig.basisFromYaw(this.yaw);
  }

  public static basisFromYaw(yaw: number): {
    fwdX: number;
    fwdZ: number;
    rightX: number;
    rightZ: number;
  } {
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    const rightX = -fwdZ;
    const rightZ = fwdX;
    return { fwdX, fwdZ, rightX, rightZ };
  }

  private computeLocalFloorY(
    arena: ArenaConfig,
    x: number,
    z: number,
    refY: number
  ): number {
    let floorY = 0;
    if (arena.stairs) {
      for (const s of arena.stairs) {
        if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
          const span = s.zHigh - s.zLow;
          const t =
            Math.abs(span) > 1e-4 ? clamp((z - s.zLow) / span, 0, 1) : 0;
          const rampY = s.bottomY + t * (s.topY - s.bottomY);
          floorY = Math.max(floorY, rampY);
        }
      }
    }
    if (arena.platforms) {
      for (const p of arena.platforms) {
        if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
          const isWalkUnderSpan = p.id === 'bridge_center';
          if (!isWalkUnderSpan || refY >= p.topY - 1.35) {
            floorY = Math.max(floorY, p.topY);
          }
        }
      }
    }
    return floorY;
  }

  public updateGameplay(
    dt: number,
    targetX: number,
    targetZ: number,
    arena: ArenaConfig,
    targetY = 0
  ): void {
    const zoomAlpha = 1 - Math.exp(-16.0 * dt);
    this.smoothedTargetDistance = lerp(
      this.smoothedTargetDistance,
      this.targetDistance,
      zoomAlpha
    );

    const targetPivotY = targetY + this.getPivotHeightOffset();
    if (!this.pivotInitialized) {
      this.pivot.set(targetX, targetPivotY, targetZ);
      this.pivotInitialized = true;
    } else {
      const followAlpha = 1 - Math.exp(-16.5 * dt);
      const yAlpha = 1 - Math.exp(-13.5 * dt);
      this.pivot.x = lerp(this.pivot.x, targetX, followAlpha);
      this.pivot.y = lerp(this.pivot.y, targetPivotY, yAlpha);
      this.pivot.z = lerp(this.pivot.z, targetZ, followAlpha);
    }

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const backX = -Math.sin(this.yaw) * cosPitch;
    const backY = sinPitch;
    const backZ = -Math.cos(this.yaw) * cosPitch;

    const desiredDist = this.smoothedTargetDistance;
    const desiredX = this.pivot.x + backX * desiredDist;
    const desiredZ = this.pivot.z + backZ * desiredDist;

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
        minT = Math.min(minT, clamp(tx, 0.16, 1.0));
      }
      if (Math.abs(desiredZ) > limZ && Math.abs(dz) > 1e-5) {
        const edgeZ = Math.sign(desiredZ) * limZ;
        const tz = (edgeZ - this.pivot.z) / dz;
        minT = Math.min(minT, clamp(tz, 0.16, 1.0));
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
        minT = Math.max(0.16, hitT - 0.04);
      }
    }

    // 4. Analytical ground-plane spring-arm slide when looking steep UPWARD (`backY < 0`)
    // Prevents the camera from sinking below the courtyard/bridge floor while preserving true upward pitch!
    if (backY < -1e-3) {
      const probeX = this.pivot.x + backX * desiredDist * minT;
      const probeZ = this.pivot.z + backZ * desiredDist * minT;
      const floorAtCam = this.computeLocalFloorY(
        arena,
        probeX,
        probeZ,
        targetY
      );
      const minCamY = floorAtCam + 0.28;
      const maxAllowedDrop = this.pivot.y - minCamY;
      if (maxAllowedDrop > 0.15) {
        const groundT = maxAllowedDrop / (-backY * desiredDist);
        minT = Math.min(minT, clamp(groundT, 0.18, 1.0));
      }
    }

    const safeDist = Math.max(1.15, desiredDist * minT);
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
        1 - Math.exp(-10 * dt)
      );
    }

    let camX = this.pivot.x + backX * this.currentDistance;
    const localFloor = this.computeLocalFloorY(arena, camX, this.pivot.z + backZ * this.currentDistance, targetY);
    let camY = Math.max(
      localFloor + 0.25,
      this.pivot.y + backY * this.currentDistance
    );
    let camZ = this.pivot.z + backZ * this.currentDistance;

    // Prevent camera from rising into the underside of the y=4.0m Skybridge when fighting beneath it!
    if (targetY < 1.8 && arena.platforms) {
      for (const p of arena.platforms) {
        if (
          camX >= p.minX - 0.25 &&
          camX <= p.maxX + 0.25 &&
          camZ >= p.minZ - 0.25 &&
          camZ <= p.maxZ + 0.25 &&
          camY > p.topY - 0.45 &&
          camY < p.topY + 0.35
        ) {
          camY = p.topY - 0.45;
        }
      }
    }

    if (this.shakeTrauma > 0) {
      this.shakeTime += dt * 38;
      const mag = this.shakeTrauma * this.shakeTrauma * 0.22;
      camX += Math.sin(this.shakeTime * 1.7) * mag;
      camY += Math.cos(this.shakeTime * 2.3) * mag * 0.8;
      camZ += Math.sin(this.shakeTime * 1.3) * mag;
      this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 3.1);
    }

    this.camera.position.set(camX, camY, camZ);
    // Look slightly above the elevated pivot for a clear view over the hero.
    this.camera.lookAt(this.pivot.x, this.pivot.y + 0.06, this.pivot.z);
    this.camera.updateMatrixWorld();
  }

  /**
   * Projects a 3D world ray through screen crosshair `(normX, normY)` (`[0..1]`),
   * testing enemy fighters, elevated decks, floor, and walls to compute exact
   * parallax-compensated 3D `aimYaw` & `aimPitch` from the player's weapon chest!
   */
  public computeCrosshairAim(params: {
    normX: number;
    normY: number;
    playerX: number;
    playerY: number;
    playerZ: number;
    fighters?: Fighter[];
    localPlayerId?: string;
    arena?: ArenaConfig;
  }): CrosshairAimResult {
    this.camera.updateMatrixWorld();
    const ndcX = clamp(params.normX, 0.02, 0.98) * 2 - 1;
    const ndcY = 1 - clamp(params.normY, 0.02, 0.98) * 2;
    this.tmpNdc.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.tmpNdc, this.camera);

    const ro = this.raycaster.ray.origin;
    const rd = this.raycaster.ray.direction;

    const chestX = params.playerX;
    const chestY = params.playerY + 1.22;
    const chestZ = params.playerZ;

    // Minimum ray distance past the player's own shoulder so foreground objects behind the player never pull aim backward!
    const toPlayerX = chestX - ro.x;
    const toPlayerY = chestY - ro.y;
    const toPlayerZ = chestZ - ro.z;
    const projPlayerT = Math.max(
      0.5,
      toPlayerX * rd.x + toPlayerY * rd.y + toPlayerZ * rd.z + 0.35
    );

    let bestT = 28.0;

    // 1. Intersect arena horizontal floor (y = 0) & perimeter walls for accurate ground/wall targeting
    if (rd.y < -1e-4) {
      const tFloor = (0 - ro.y) / rd.y;
      if (tFloor > projPlayerT && tFloor < bestT) {
        bestT = tFloor;
      }
      if (params.arena?.platforms) {
        for (const plat of params.arena.platforms) {
          const tPlat = (plat.topY - ro.y) / rd.y;
          if (tPlat > projPlayerT && tPlat < bestT) {
            const hx = ro.x + rd.x * tPlat;
            const hz = ro.z + rd.z * tPlat;
            if (
              hx >= plat.minX &&
              hx <= plat.maxX &&
              hz >= plat.minZ &&
              hz <= plat.maxZ
            ) {
              bestT = tPlat;
            }
          }
        }
      }
    }
    if (params.arena?.boundsHalfX && params.arena?.boundsHalfZ) {
      const bx = params.arena.boundsHalfX;
      const bz = params.arena.boundsHalfZ;
      if (Math.abs(rd.x) > 1e-4) {
        const edgeX = rd.x > 0 ? bx : -bx;
        const tx = (edgeX - ro.x) / rd.x;
        if (tx > projPlayerT && tx < bestT) bestT = tx;
      }
      if (Math.abs(rd.z) > 1e-4) {
        const edgeZ = rd.z > 0 ? bz : -bz;
        const tz = (edgeZ - ro.z) / rd.z;
        if (tz > projPlayerT && tz < bestT) bestT = tz;
      }
    }

    // 2. Raycast against living enemy fighters' 3D capsules (generous aim-assist cylinder)
    let targetFighterId: string | null = null;
    let targetName: string | null = null;
    let targetHpRatio = 0;
    let enemyAimX = 0;
    let enemyAimY = 0;
    let enemyAimZ = 0;
    let bestEnemyT = bestT + 0.5;

    if (params.fighters) {
      const rdXZSq = rd.x * rd.x + rd.z * rd.z;
      for (const f of params.fighters) {
        if (!f.isAlive || f.id === params.localPlayerId) continue;
        const hitRadius = f.body.radius + 0.34;

        let tClosest = projPlayerT;
        if (rdXZSq > 1e-5) {
          const ox = f.body.x - ro.x;
          const oz = f.body.z - ro.z;
          tClosest = (ox * rd.x + oz * rd.z) / rdXZSq;
        }
        if (tClosest < projPlayerT * 0.75 || tClosest > bestEnemyT) continue;

        const rx = ro.x + rd.x * tClosest;
        const ry = ro.y + rd.y * tClosest;
        const rz = ro.z + rd.z * tClosest;
        const distXZSq =
          (rx - f.body.x) * (rx - f.body.x) + (rz - f.body.z) * (rz - f.body.z);

        if (
          distXZSq <= hitRadius * hitRadius &&
          ry >= f.body.y - 0.25 &&
          ry <= f.body.y + 2.25
        ) {
          bestEnemyT = tClosest;
          targetFighterId = f.id;
          targetName = f.displayName;
          targetHpRatio = clamp(f.hp / Math.max(1, f.maxHp), 0, 1);
          enemyAimX = f.body.x;
          enemyAimY = clamp(ry, f.body.y + 0.65, f.body.y + 1.65);
          enemyAimZ = f.body.z;
        }
      }
    }

    const aimWorldX = targetFighterId ? enemyAimX : ro.x + rd.x * bestT;
    const aimWorldY = targetFighterId ? enemyAimY : ro.y + rd.y * bestT;
    const aimWorldZ = targetFighterId ? enemyAimZ : ro.z + rd.z * bestT;

    const dx = aimWorldX - chestX;
    const dy = aimWorldY - chestY;
    const dz = aimWorldZ - chestZ;
    const horizDist = Math.hypot(dx, dz);

    const aimYaw =
      horizDist > 0.12
        ? yawFromDir(dx, dz, this.yaw)
        : yawFromDir(rd.x, rd.z, this.yaw);
    const aimPitch =
      horizDist > 0.12
        ? clamp(Math.atan2(dy, horizDist), -0.95, 0.95)
        : clamp(
            Math.atan2(rd.y, Math.max(0.05, Math.hypot(rd.x, rd.z))),
            -0.95,
            0.95
          );

    return {
      aimYaw,
      aimPitch,
      aimWorldX,
      aimWorldY,
      aimWorldZ,
      targetFighterId,
      targetName,
      targetHpRatio,
    };
  }

  private hubCamInitialized = false;
  private readonly hubCamPos = new THREE.Vector3();
  private readonly hubLookAt = new THREE.Vector3();

  /**
   * Panoramic arena camera for Multiplayer Lobby background showcasing the Two-Tier Skybridge & Staircases!
   */
  public updateMenuOrbit(elapsed: number): void {
    this.pivotInitialized = false;
    this.hubCamInitialized = false;
    const angle = elapsed * 0.14;
    const r = 17.6;
    this.camera.position.set(Math.cos(angle) * r, 8.8, Math.sin(angle) * r);
    this.camera.lookAt(0, 3.1, 0);
  }

  /**
   * Smoothly interpolated 3D Hero Hub camera for MainMenu ('hub') & Heroes Inspect ('inspect').
   */
  public updateHubHeroCamera(
    pedestalX: number,
    pedestalZ: number,
    elapsed: number,
    dt: number,
    mode: 'hub' | 'inspect'
  ): void {
    this.pivotInitialized = false;
    const sway = Math.sin(elapsed * 0.35) * 0.14;
    const targetX =
      mode === 'hub' ? pedestalX - 0.55 + sway : pedestalX - 0.85 + sway * 0.4;
    const targetY = mode === 'hub' ? 2.02 : 1.9;
    const targetZ = mode === 'hub' ? pedestalZ + 4.15 : pedestalZ + 3.35;

    const lookX = mode === 'hub' ? pedestalX - 0.42 : pedestalX - 0.56;
    const lookY = mode === 'hub' ? 1.32 : 1.27;
    const lookZ = mode === 'hub' ? pedestalZ - 0.8 : pedestalZ;

    if (!this.hubCamInitialized) {
      this.hubCamPos.set(targetX, targetY, targetZ);
      this.hubLookAt.set(lookX, lookY, lookZ);
      this.hubCamInitialized = true;
    } else {
      const alpha = 1 - Math.exp(-7.5 * Math.max(0.001, dt));
      this.hubCamPos.x = lerp(this.hubCamPos.x, targetX, alpha);
      this.hubCamPos.y = lerp(this.hubCamPos.y, targetY, alpha);
      this.hubCamPos.z = lerp(this.hubCamPos.z, targetZ, alpha);
      this.hubLookAt.x = lerp(this.hubLookAt.x, lookX, alpha);
      this.hubLookAt.y = lerp(this.hubLookAt.y, lookY, alpha);
      this.hubLookAt.z = lerp(this.hubLookAt.z, lookZ, alpha);
    }

    this.camera.position.copy(this.hubCamPos);
    this.camera.lookAt(this.hubLookAt);
  }

  private rayInsideCircleExitT(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    radius: number
  ): number {
    const r2 = radius * radius;
    const endDist2 = x1 * x1 + z1 * z1;
    if (endDist2 <= r2) return 1.0;

    const dx = x1 - x0;
    const dz = z1 - z0;
    const a = dx * dx + dz * dz;
    if (a < 1e-8) return 1.0;

    const b = 2 * (x0 * dx + z0 * dz);
    const c = x0 * x0 + z0 * z0 - r2;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return 0.25;

    const t = (-b + Math.sqrt(disc)) / (2 * a);
    return clamp(t, 0.2, 1.0);
  }
}
