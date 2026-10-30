import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arenaConfig';
import { CLASS_ORDER, KNIGHT_CLASSES } from '../src/config/classes';
import { createEmptyIntent, Fighter } from '../src/core/Fighter';
import { AuthoritativeMatchSim } from '../src/net/MultiplayerRoomSim';
import { LoadedKayKitPack, kayKitAssets } from '../src/render/KayKitAssetCache';
import { KnightVisualRig } from '../src/render/KnightMesh';
import { MaterialLibrary } from '../src/render/PixelTextures';

async function parseGlbFromDisk(relPath: string): Promise<{
  scene: THREE.Group;
  clips: Map<string, THREE.AnimationClip>;
}> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.self) g.self = globalThis;
  if (!g.createImageBitmap) {
    g.createImageBitmap = async () => ({
      width: 1,
      height: 1,
      close() {},
    });
  }

  const fullPath = path.resolve(process.cwd(), relPath);
  const buf = fs.readFileSync(fullPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.parse(
      ab,
      '',
      (gltf) => {
        const clips = new Map<string, THREE.AnimationClip>();
        for (const c of gltf.animations) {
          clips.set(c.name, c);
        }
        resolve({ scene: gltf.scene, clips });
      },
      (err) => reject(err)
    );
  });
}

describe('Zero-Delay Attack Input, 3-Hit Combos & Layered 3D Skeletal Animations', () => {
  it('starts Light Attack Windup on frame 0 of mousedown (attackHeld=true) with zero mouseup wait across all 4 classes', () => {
    for (const classId of CLASS_ORDER) {
      const f = new Fighter({
        id: `test_${classId}`,
        displayName: classId,
        isHuman: true,
        classId,
        x: 0,
        z: 0,
        yaw: 0,
      });

      const pressIntent = createEmptyIntent(0);
      pressIntent.attackHeld = true;

      // Single 16ms tick with LMB held down must IMMEDIATELY enter Attacking (Windup)!
      const res = f.update(1 / 60, pressIntent, ARENA_CONFIG, true);
      expect(f.state).toBe('Attacking');
      expect(f.attackPhase).toBe('Windup');
      expect(res.swungAttack?.id).toBe(KNIGHT_CLASSES[classId].lightCombo[0].id);

      // Hold for realistic 95ms human click, then release -> transitions straight into Active with zero reset!
      for (let i = 0; i < 5; i++) {
        f.update(1 / 60, pressIntent, ARENA_CONFIG, true);
      }
      const releaseIntent = createEmptyIntent(0);
      releaseIntent.attackHeld = false;

      let sawActive = f.attackPhase === 'Active';
      for (let i = 0; i < 12; i++) {
        f.update(1 / 60, releaseIntent, ARENA_CONFIG, true);
        if (f.attackPhase === 'Active') {
          sawActive = true;
          break;
        }
      }
      expect(sawActive).toBe(true);
    }
  });

  it('seamlessly morphs sustained LMB hold into HeavyAttacking with exact stamina cost', () => {
    for (const classId of CLASS_ORDER) {
      const f = new Fighter({
        id: `heavy_${classId}`,
        displayName: classId,
        isHuman: true,
        classId,
        x: 0,
        z: 0,
        yaw: 0,
      });

      const startStam = f.stamina;
      const holdIntent = createEmptyIntent(0);
      holdIntent.attackHeld = true;

      let enteredHeavy = false;
      for (let i = 0; i < 36; i++) {
        f.update(1 / 60, holdIntent, ARENA_CONFIG, true);
        if (f.state === 'HeavyAttacking') {
          enteredHeavy = true;
          break;
        }
      }

      expect(enteredHeavy).toBe(true);
      expect(f.activeAttack?.id).toBe(KNIGHT_CLASSES[classId].heavyAttack.id);
      // Total stamina spent across chamber + morph must equal exact heavyAttack.staminaCost!
      expect(startStam - f.stamina).toBeCloseTo(
        KNIGHT_CLASSES[classId].heavyAttack.staminaCost,
        3
      );
    }
  });

  it('buffers early clicks during Active/Recovery and chains all 3 combo hits smoothly via early recovery cancel', () => {
    for (const classId of CLASS_ORDER) {
      const cfg = KNIGHT_CLASSES[classId];
      expect(cfg.lightCombo.length).toBe(3);

      const f = new Fighter({
        id: `combo_${classId}`,
        displayName: classId,
        isHuman: true,
        classId,
        x: 0,
        z: 0,
        yaw: 0,
      });

      const observedSteps: string[] = [];

      // Strike 1
      const tap1 = createEmptyIntent(0);
      tap1.lightAttackTap = true;
      const r1 = f.update(1 / 60, tap1, ARENA_CONFIG, true);
      if (r1.swungAttack) observedSteps.push(r1.swungAttack.id);

      // Advance until early Recovery (20% into Recovery), then click LMB ONCE (buffered!)
      let clickedSecond = false;
      let clickedThird = false;
      for (let tick = 0; tick < 120; tick++) {
        const intent = createEmptyIntent(0);
        if (
          !clickedSecond &&
          f.attackPhase === 'Recovery' &&
          f.activeComboStep === 0
        ) {
          // Click immediately at the VERY START of Recovery (tests 240ms input buffer + 45% cancel!)
          intent.attackHeld = true;
          clickedSecond = true;
        } else if (
          !clickedThird &&
          f.attackPhase === 'Recovery' &&
          f.activeComboStep === 1
        ) {
          intent.attackHeld = true;
          clickedThird = true;
        }

        const stepRes = f.update(1 / 60, intent, ARENA_CONFIG, true);
        if (stepRes.swungAttack) {
          observedSteps.push(stepRes.swungAttack.id);
        }
        if (observedSteps.length >= 3) break;
      }

      expect(observedSteps).toEqual([
        cfg.lightCombo[0].id,
        cfg.lightCombo[1].id,
        cfg.lightCombo[2].id,
      ]);
    }
  });

  it('allows instant Riposte counterattack from Blocking and early Dodge cancel out of Recovery', () => {
    const f = new Fighter({
      id: 'riposte_knight',
      displayName: 'Paladin',
      isHuman: true,
      classId: 'hammer',
      x: 0,
      z: 0,
      yaw: 0,
    });

    // Hold shield block
    const blockIntent = createEmptyIntent(0);
    blockIntent.blockHeld = true;
    f.update(1 / 60, blockIntent, ARENA_CONFIG, true);
    expect(f.state).toBe('Blocking');

    // Click LMB while STILL holding RMB -> instant Riposte!
    const riposteIntent = createEmptyIntent(0);
    riposteIntent.blockHeld = true;
    riposteIntent.attackHeld = true;
    const res = f.update(1 / 60, riposteIntent, ARENA_CONFIG, true);
    expect(f.state).toBe('Attacking');
    expect(res.swungAttack?.id).toBe('hammer_light_1');

    // Release LMB, let swing reach Recovery, and cancel late Recovery with Dodge!
    for (let i = 0; i < 40; i++) {
      f.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      if (
        f.attackPhase === 'Recovery' &&
        f.attackPhaseTimer <= f.activeAttack!.recoveryDuration * 0.55
      ) {
        break;
      }
    }
    expect(f.attackPhase).toBe('Recovery');

    const dodgeIntent = createEmptyIntent(0);
    dodgeIntent.dodgePressed = true;
    f.update(1 / 60, dodgeIntent, ARENA_CONFIG, true);
    expect(f.state).toBe('Dodging');
  });

  it('delivers fast sub-poll clicks via attackSeq in AuthoritativeMatchSim', () => {
    const sim = new AuthoritativeMatchSim();
    sim.start(
      [
        { fighterId: 'human_1', name: 'Артур', classId: 'sword' },
        { fighterId: 'human_2', name: 'Ланселот', classId: 'spear' },
      ],
      false
    );
    for (let i = 0; i < 185; i++) sim.step(1 / 60);
    expect(sim.phase).toBe('InProgress');

    // Guest clicked & released within a single browser frame so attackHeld=false, but attackSeq incremented!
    sim.submitInput('human_1', {
      moveX: 0,
      moveZ: 0,
      aimYaw: 0,
      sprint: false,
      attackHeld: false,
      attackSeq: 1,
      blockHeld: false,
      jumpSeq: 0,
      dodgeSeq: 0,
      ability1Seq: 0,
      ability2Seq: 0,
    });

    sim.step(1 / 60);
    const p1 = sim.fighters.find((x) => x.id === 'human_1')!;
    expect(p1.state).toBe('Attacking');
    expect(p1.attackPhase).toBe('Windup');
  });

  it('drives disjoint Upper/Lower skeletal layers across all 9 melee classes & 95 KayKit clips without NaNs', async () => {
    const [
      knightGltf,
      rogueGltf,
      barbarianGltf,
      duelistGltf,
      skelWarriorGltf,
      skelRogueGltf,
      skelMinionGltf,
      skelBladeGltf,
      skelAxeGltf,
      skelShieldLAGltf,
      skelShieldSAGltf,
    ] = await Promise.all([
      parseGlbFromDisk('public/models/kaykit/Knight.glb'),
      parseGlbFromDisk('public/models/kaykit/Rogue_Hooded.glb'),
      parseGlbFromDisk('public/models/kaykit/Barbarian.glb'),
      parseGlbFromDisk('public/models/kaykit/Rogue.glb'),
      parseGlbFromDisk('public/models/kaykit/Skeleton_Warrior.glb'),
      parseGlbFromDisk('public/models/kaykit/Skeleton_Rogue.glb'),
      parseGlbFromDisk('public/models/kaykit/Skeleton_Minion.glb'),
      parseGlbFromDisk('public/models/kaykit/Skeleton_Blade.glb'),
      parseGlbFromDisk('public/models/kaykit/Skeleton_Axe.glb'),
      parseGlbFromDisk('public/models/kaykit/Skeleton_Shield_Large_A.glb'),
      parseGlbFromDisk('public/models/kaykit/Skeleton_Shield_Small_A.glb'),
    ]);

    const mergedClips = new Map<string, THREE.AnimationClip>(knightGltf.clips);
    for (const [k, v] of skelWarriorGltf.clips) {
      if (!mergedClips.has(k)) mergedClips.set(k, v);
    }
    expect(mergedClips.size).toBe(95);
    expect(mergedClips.has('1H_Melee_Attack_Jump_Chop')).toBe(true);
    expect(mergedClips.has('Idle_Combat')).toBe(true);
    expect(mergedClips.has('Running_C')).toBe(true);
    expect(mergedClips.has('Death_C_Skeletons')).toBe(true);

    const fakePack: LoadedKayKitPack = {
      knightScene: knightGltf.scene,
      rogueScene: rogueGltf.scene,
      barbarianScene: barbarianGltf.scene,
      duelistScene: duelistGltf.scene,
      skeletonWarriorScene: skelWarriorGltf.scene,
      skeletonRogueScene: skelRogueGltf.scene,
      skeletonMinionScene: skelMinionGltf.scene,
      knightClips: mergedClips,
      rogueClips: mergedClips,
      mergedClips,
      knightBaseImage: null,
      rogueBaseImage: null,
      sword1HProto: knightGltf.scene.getObjectByName('1H_Sword') ?? null,
      swordOffhandProto:
        knightGltf.scene.getObjectByName('1H_Sword_Offhand') ?? null,
      roundShieldProto:
        knightGltf.scene.getObjectByName('Round_Shield') ?? null,
      skeletonBladeProto: skelBladeGltf.scene.children[0] ?? skelBladeGltf.scene,
      skeletonAxeProto: skelAxeGltf.scene.children[0] ?? skelAxeGltf.scene,
      skeletonShieldLargeAProto:
        skelShieldLAGltf.scene.children[0] ?? skelShieldLAGltf.scene,
      skeletonShieldSmallAProto:
        skelShieldSAGltf.scene.children[0] ?? skelShieldSAGltf.scene,
    };

    // Inject loaded pack into singleton cache for headless skeletal rig test
    const cacheAny = kayKitAssets as unknown as {
      pack: LoadedKayKitPack | null;
    };
    cacheAny.pack = fakePack;

    const mats = {
      contactShadowTex: new THREE.DataTexture(
        new Uint8Array([0, 0, 0, 255]),
        1,
        1
      ),
    } as unknown as MaterialLibrary;

    for (const classId of CLASS_ORDER) {
      const rig = new KnightVisualRig(classId, mats, { isHuman: true });
      const f = new Fighter({
        id: `rig_${classId}`,
        displayName: classId,
        isHuman: true,
        classId,
        x: 0,
        z: 0,
        yaw: 0,
      });

      // 1. Moving while Blocking (shield-strafe footwork + guard upper body)
      const blockMove = createEmptyIntent(0);
      blockMove.blockHeld = true;
      blockMove.moveX = 1;
      for (let i = 0; i < 6; i++) {
        f.update(1 / 60, blockMove, ARENA_CONFIG, true);
        rig.syncFromFighter(f);
      }

      // 2. Moving/Lunging through Attack Windup -> Active -> Recovery + Ribbon emission
      const atkIntent = createEmptyIntent(0);
      atkIntent.lightAttackTap = true;
      atkIntent.moveZ = 1;
      f.update(1 / 60, atkIntent, ARENA_CONFIG, true);

      let ribbonBecameVisible = false;
      for (let i = 0; i < 24; i++) {
        const moveOnly = createEmptyIntent(0);
        moveOnly.moveZ = 1;
        f.update(1 / 60, moveOnly, ARENA_CONFIG, true);
        rig.syncFromFighter(f);
        if (rig.trail.primary.mesh.visible) {
          ribbonBecameVisible = true;
        }
      }
      expect(ribbonBecameVisible).toBe(true);

      // 3. Combat Impact Hit-Stop & Directional Shudder
      rig.notifyCombatImpact('victim', 'heavy', 0.6, 0.8);
      f.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
      rig.syncFromFighter(f);

      // 4. Airborne Jump + Aerial Attack
      f.state = 'Idle';
      f.attackPhase = 'None';
      f.activeAttack = null;
      const jumpAtk = createEmptyIntent(0);
      jumpAtk.jumpPressed = true;
      f.update(1 / 60, jumpAtk, ARENA_CONFIG, true);
      const airSwing = createEmptyIntent(0);
      airSwing.lightAttackTap = true;
      f.update(1 / 60, airSwing, ARENA_CONFIG, true);
      rig.syncFromFighter(f);

      expect(Number.isFinite(rig.root.position.x)).toBe(true);
      expect(Number.isFinite(rig.root.position.y)).toBe(true);
      expect(Number.isFinite(rig.root.position.z)).toBe(true);
    }
  });

  it('eliminates forward-and-backward hero rocking and prevents AnimationMixer bone quaternion drift across 240 frames', async () => {
    const knightGltf = await parseGlbFromDisk('public/models/kaykit/Knight.glb');
    const rogueGltf = await parseGlbFromDisk(
      'public/models/kaykit/Rogue_Hooded.glb'
    );
    const fakePack: LoadedKayKitPack = {
      knightScene: knightGltf.scene,
      rogueScene: rogueGltf.scene,
      knightClips: knightGltf.clips,
      rogueClips: rogueGltf.clips,
      knightBaseImage: null,
      rogueBaseImage: null,
      sword1HProto: knightGltf.scene.getObjectByName('1H_Sword') ?? null,
      swordOffhandProto:
        knightGltf.scene.getObjectByName('1H_Sword_Offhand') ?? null,
    };
    const cacheAny = kayKitAssets as unknown as {
      pack: LoadedKayKitPack | null;
    };
    cacheAny.pack = fakePack;

    const mats = {
      contactShadowTex: new THREE.DataTexture(
        new Uint8Array([0, 0, 0, 255]),
        1,
        1
      ),
    } as unknown as MaterialLibrary;

    for (const cid of CLASS_ORDER) {
      const f = new Fighter({
        id: `steady_${cid}`,
        displayName: cid,
        isHuman: true,
        classId: cid,
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
      });
      const rig = new KnightVisualRig(cid, mats, {
        isHuman: true,
      });

      const spineBone = rig.root.getObjectByName('spine')!;
      expect(spineBone).toBeTruthy();

      // 1. Gameplay Idle across 240 frames (4 seconds): zero forward/back rocking on modelHolder & zero spine drift!
      const idleSpineQuatX: number[] = [];
      for (let i = 0; i < 240; i++) {
        f.update(1 / 60, createEmptyIntent(0), ARENA_CONFIG, true);
        rig.syncFromFighter(f);
        expect(Math.abs(rig.modelHolder.rotation.x)).toBeLessThan(1e-4);
        if (i >= 15) {
          idleSpineQuatX.push(spineBone.quaternion.x);
        }
      }
      const minQX = Math.min(...idleSpineQuatX);
      const maxQX = Math.max(...idleSpineQuatX);
      // Idle spine X quaternion must never drift or rock like a pendulum!
      expect(maxQX - minQX).toBeLessThan(0.002);

      // 2. Walking & Sprinting forward/backward: modelHolder stays level (zero forward-back pitch bobbing!)
      for (let i = 0; i < 90; i++) {
        const moveIntent = createEmptyIntent(0);
        moveIntent.moveZ = i < 45 ? 1 : -1;
        moveIntent.sprint = i < 30;
        f.update(1 / 60, moveIntent, ARENA_CONFIG, true);
        rig.syncFromFighter(f);
        expect(Math.abs(rig.modelHolder.rotation.x)).toBeLessThan(1e-4);
      }

      // 3. Main Menu / Hero Showcase preview idle across 180 frames: zero forward/back rocking!
      const previewSpineQuatX: number[] = [];
      for (let i = 0; i < 180; i++) {
        rig.updatePreviewIdle(i / 60);
        expect(Math.abs(rig.modelHolder.rotation.x)).toBeLessThan(1e-4);
        if (i >= 15) {
          previewSpineQuatX.push(spineBone.quaternion.x);
        }
      }
      expect(
        Math.max(...previewSpineQuatX) - Math.min(...previewSpineQuatX)
      ).toBeLessThan(0.002);
    }
  });
});
