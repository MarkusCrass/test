import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../src/render/CameraRig';
import { SkyAndAtmosphere } from '../src/render/SkyAndAtmosphere';

describe('sky visibility', () => {
  it('keeps the sky dome inside the camera far plane from the arena and while looking upward', () => {
    const sky = new SkyAndAtmosphere(new THREE.Vector3(24, 34, 18));
    sky.group.updateMatrixWorld(true);
    const dome = sky.group.children.find(child => child instanceof THREE.Mesh);
    expect(dome).toBeDefined();
    const cam = new CameraRig(16 / 9).camera;
    const ray = new THREE.Raycaster();
    const views = [
      { pos: [0, 2, -20], look: [0, 35, 80] },
      { pos: [20, 5, 0], look: [-70, 50, 0] },
      { pos: [-18, 1, 12], look: [50, 70, -60] },
      { pos: [0, 9, 0], look: [0, 90, 1] },
    ];
    for (const view of views) {
      cam.position.fromArray(view.pos);
      cam.lookAt(new THREE.Vector3().fromArray(view.look));
      cam.updateMatrixWorld(true);
      for (const x of [-0.9, 0, 0.9]) {
        for (const y of [-0.9, 0, 0.9]) {
          ray.setFromCamera(new THREE.Vector2(x, y), cam);
          const hit = ray.intersectObject(dome!)[0];
          expect(hit, `sky missing for ${JSON.stringify(view)} at ${x}, ${y}`).toBeDefined();
          const depth = hit.point.clone().applyMatrix4(cam.matrixWorldInverse).z;
          expect(-depth, `far-plane clipping at ${x}, ${y}`).toBeLessThan(cam.far);
        }
      }
    }
  });
});
