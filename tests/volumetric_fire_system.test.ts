import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ArenaFireSystem, type FirePreset } from '../src/render/ArenaFireSystem';
import { ARENA_PROP_FILES } from '../src/render/ArenaPropCache';
import { DUNGEON_MODEL_FILES } from '../src/render/DungeonAssetCache';

describe('Open-Source Volumetric 3D Raymarched Fire & Upgraded Brazier/Torch Models', () => {
  it('replaces low-poly cones & crossed planes with a true 3D raymarched volumetric proxy box across all presets', () => {
    const fireSys = new ArenaFireSystem();
    const root = new THREE.Group();
    const presets: FirePreset[] = [
      'candle',
      'torch',
      'brazier',
      'bonfire',
      'pit_inferno',
    ];

    for (const preset of presets) {
      const fireGroup = fireSys.createFire({
        parent: root,
        x: 2,
        y: 1.5,
        z: -3,
        preset,
        withLight: preset === 'brazier',
        worldEmberOrigin:
          preset === 'brazier' || preset === 'bonfire'
            ? { x: 2, y: 1.8, z: -3 }
            : undefined,
      });

      const shaderMeshes: THREE.Mesh[] = [];
      fireGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          // Ensure zero ConeGeometry remains in any fire preset!
          expect(m.geometry.type).not.toBe('ConeGeometry');
          if ((m.material as THREE.ShaderMaterial).isShaderMaterial) {
            const sm = m.material as THREE.ShaderMaterial;
            if (sm.fragmentShader.includes('sampleVolumetricFire')) {
              shaderMeshes.push(m);
            }
          }
        }
      });

      expect(shaderMeshes.length).toBe(1);
      const volMesh = shaderMeshes[0];
      volMesh.geometry.computeBoundingBox();
      const bb = volMesh.geometry.boundingBox!;
      expect(bb.min.y).toBeCloseTo(0.0, 4);
      expect(bb.max.y).toBeCloseTo(1.0, 4);
      expect(bb.min.x).toBeCloseTo(-0.5, 4);
      expect(bb.max.x).toBeCloseTo(0.5, 4);

      const mat = volMesh.material as THREE.ShaderMaterial;
      expect(mat.fragmentShader).toContain('boxHit');
      expect(mat.fragmentShader).toContain('ridgedSimplex');
      expect(mat.fragmentShader).toContain('blackbodyRamp');
      expect(mat.fragmentShader).toContain('sampleLitSmoke');
      expect(mat.uniforms.uFireLut.value).toBeTruthy();
      expect(mat.depthTest).toBe(true);
      expect(mat.depthWrite).toBe(false);
    }
  });

  it('switches existing and later-created fires to inexpensive effects and restores them', () => {
    const fireSys = new ArenaFireSystem();
    const root = new THREE.Group();
    const makeFire = () => fireSys.createFire({ parent: root, preset: 'brazier', withLight: true });
    const existing = makeFire();
    const check = (fire: THREE.Group, low: boolean) => {
      const volume = fire.children.find((child) =>
        (child as THREE.Mesh).isMesh &&
        ((child as THREE.Mesh).material as THREE.ShaderMaterial).fragmentShader?.includes('sampleVolumetricFire')
      )!;
      const sprite = fire.children.find((child) => (child as THREE.Sprite).isSprite)!;
      const light = fire.children.find((child) => (child as THREE.PointLight).isPointLight)!;
      expect(volume.visible).toBe(!low);
      expect(sprite.visible).toBe(low);
      expect(light.visible).toBe(!low);
    };
    const sparks = fireSys.group.children.find((child) => (child as THREE.Points).isPoints)!;
    check(existing, false);
    fireSys.setLowQuality(true);
    check(existing, true);
    expect(sparks.visible).toBe(false);
    const lateFire = makeFire();
    check(lateFire, true);
    fireSys.update(1, 1 / 60, new THREE.Vector3(0, 1, 3));
    fireSys.setLowQuality(false);
    check(existing, false);
    check(lateFire, false);
    expect(sparks.visible).toBe(true);
  });

  it('dynamically updates uLocalCamPos, uCamDist, and FrontSide/BackSide culling in onBeforeRender', () => {
    const fireSys = new ArenaFireSystem();
    const scene = new THREE.Scene();
    const fireGroup = fireSys.createFire({
      parent: scene,
      x: 5,
      y: 2,
      z: -4,
      preset: 'brazier',
      withLight: true,
    });
    scene.updateMatrixWorld(true);

    const volMesh = fireGroup.children.find(
      (c) =>
        (c as THREE.Mesh).isMesh &&
        ((c as THREE.Mesh).material as THREE.ShaderMaterial).fragmentShader?.includes(
          'sampleVolumetricFire'
        )
    ) as THREE.Mesh;
    expect(volMesh).toBeTruthy();
    const volMat = volMesh.material as THREE.ShaderMaterial;

    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    // 1. Camera outside volume -> FrontSide
    cam.position.set(5, 3, 2);
    cam.updateMatrixWorld(true);
    volMesh.onBeforeRender(
      {} as THREE.WebGLRenderer,
      scene,
      cam,
      volMesh.geometry,
      volMat,
      null!
    );
    expect(volMat.side).toBe(THREE.FrontSide);
    expect(volMat.uniforms.uCamDist.value).toBeGreaterThan(5.5);

    // 2. Camera right inside flame volume -> BackSide so near-plane never clips volumetric fire!
    cam.position.set(5, 2.6, -4);
    cam.updateMatrixWorld(true);
    volMesh.onBeforeRender(
      {} as THREE.WebGLRenderer,
      scene,
      cam,
      volMesh.geometry,
      volMat,
      null!
    );
    expect(volMat.side).toBe(THREE.BackSide);
    expect(volMat.uniforms.uLocalCamPos.value.y).toBeGreaterThan(0.2);
    expect(volMat.uniforms.uLocalCamPos.value.y).toBeLessThan(0.6);
  });

  it('drives 360 rising ember sparks purely on the GPU via custom BufferAttributes & upgrades CC0 brazier/torch props', () => {
    const fireSys = new ArenaFireSystem();
    fireSys.registerEmberEmitter({
      x: -10,
      y: 1.6,
      z: 8,
      spreadXZ: 0.4,
      riseHeight: 3.2,
      upSpeed: 1.15,
    });
    fireSys.update(2.4, 1 / 60, new THREE.Vector3(0, 5, 12));

    const points = fireSys.group.children.find(
      (c) => (c as THREE.Points).isPoints
    ) as THREE.Points;
    expect(points).toBeTruthy();
    const origAttr = points.geometry.getAttribute(
      'aEmitterOrigin'
    ) as THREE.BufferAttribute;
    const paramAttr = points.geometry.getAttribute(
      'aEmitterParams'
    ) as THREE.BufferAttribute;
    expect(origAttr.count).toBe(360);
    expect(origAttr.getX(0)).toBeCloseTo(-10, 4);
    expect(origAttr.getY(0)).toBeCloseTo(1.6, 4);
    expect(paramAttr.getY(0)).toBeCloseTo(3.2, 4);

    // Verify upgraded CC0 unlit torch, carved octagonal brazier column, and stone/brick campfire hearths
    expect(DUNGEON_MODEL_FILES.torchLit).toBe('torch_unlit.gltf.glb');
    expect(ARENA_PROP_FILES.brazierPedestal).toBe('graveyard/column_large.glb');
    expect(ARENA_PROP_FILES.campfireStones).toBe('survival/campfire_stones.glb');
    expect(ARENA_PROP_FILES.campfireBricks).toBe('survival/campfire_bricks.glb');
  });
});
