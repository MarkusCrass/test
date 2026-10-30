import { AbilityKind, KnightClassId } from '../config/classes';
import { CombatEvent } from '../core/CombatSystem';
import { Fighter } from '../core/Fighter';

export type SfxBankId =
  | 'swing_sword'
  | 'swing_hammer'
  | 'swing_polearm'
  | 'dodge_whoosh'
  | 'cloth'
  | 'hit_slash'
  | 'hit_crush'
  | 'hit_pierce'
  | 'hit_plate'
  | 'hit_mail'
  | 'block'
  | 'shield_thud'
  | 'parry_clash'
  | 'anvil'
  | 'step_stone'
  | 'step_wood'
  | 'plate_clank'
  | 'fall_armoured'
  | 'drop_weapon'
  | 'quake'
  | 'slam'
  | 'warcry_buff'
  | 'warcry_voice'
  | 'dagger_throw'
  | 'unsheathe'
  | 'bell'
  | 'ui_click';

/**
 * Curated CC0 1.0 Public Domain medieval combat & foley sample banks
 * stored in public/audio/sfx/ (see public/audio/LICENSE.txt for full attribution).
 */
export const SFX_BANKS: Readonly<Record<SfxBankId, readonly string[]>> = {
  swing_sword: [
    'swing_sword_1.mp3',
    'swing_sword_2.mp3',
    'swing_sword_3.mp3',
    'swing_sword_4.mp3',
  ],
  swing_hammer: [
    'swing_hammer_1.mp3',
    'swing_hammer_2.mp3',
    'swing_hammer_3.mp3',
    'swing_hammer_4.mp3',
  ],
  swing_polearm: [
    'swing_polearm_1.mp3',
    'swing_polearm_2.mp3',
    'swing_polearm_3.mp3',
    'swing_polearm_4.mp3',
  ],
  dodge_whoosh: [
    'dodge_whoosh_1.mp3',
    'dodge_whoosh_2.mp3',
    'dodge_whoosh_3.mp3',
  ],
  cloth: ['cloth_1.mp3', 'cloth_2.mp3', 'cloth_3.mp3'],
  hit_slash: [
    'hit_slash_1.mp3',
    'hit_slash_2.mp3',
    'hit_slash_3.mp3',
    'hit_slash_4.mp3',
  ],
  hit_crush: [
    'hit_crush_1.mp3',
    'hit_crush_2.mp3',
    'hit_crush_3.mp3',
    'hit_crush_4.mp3',
  ],
  hit_pierce: [
    'hit_pierce_1.mp3',
    'hit_pierce_2.mp3',
    'hit_pierce_3.mp3',
    'hit_pierce_4.mp3',
  ],
  hit_plate: [
    'hit_plate_1.mp3',
    'hit_plate_2.mp3',
    'hit_plate_3.mp3',
    'hit_plate_4.mp3',
  ],
  hit_mail: ['hit_mail_1.mp3', 'hit_mail_2.mp3', 'hit_mail_3.mp3'],
  block: ['block_1.mp3', 'block_2.mp3', 'block_3.mp3', 'block_4.mp3'],
  shield_thud: ['shield_thud_1.mp3', 'shield_thud_2.mp3', 'shield_thud_3.mp3'],
  parry_clash: [
    'parry_clash_1.mp3',
    'parry_clash_2.mp3',
    'parry_clash_3.mp3',
    'parry_clash_4.mp3',
  ],
  anvil: ['anvil_1.mp3', 'anvil_2.mp3', 'anvil_3.mp3'],
  step_stone: [
    'step_stone_1.mp3',
    'step_stone_2.mp3',
    'step_stone_3.mp3',
    'step_stone_4.mp3',
  ],
  step_wood: [
    'step_wood_1.mp3',
    'step_wood_2.mp3',
    'step_wood_3.mp3',
    'step_wood_4.mp3',
  ],
  plate_clank: [
    'plate_clank_1.mp3',
    'plate_clank_2.mp3',
    'plate_clank_3.mp3',
    'plate_clank_4.mp3',
  ],
  fall_armoured: [
    'fall_armoured_1.mp3',
    'fall_armoured_2.mp3',
    'fall_armoured_3.mp3',
  ],
  drop_weapon: ['drop_weapon_1.mp3', 'drop_weapon_2.mp3', 'drop_weapon_3.mp3'],
  quake: ['quake_1.mp3', 'quake_2.mp3'],
  slam: ['slam_1.mp3', 'slam_2.mp3', 'slam_3.mp3'],
  warcry_buff: ['warcry_buff_1.mp3', 'warcry_buff_2.mp3', 'warcry_buff_3.mp3'],
  warcry_voice: [
    'warcry_voice_1.mp3',
    'warcry_voice_2.mp3',
    'warcry_voice_3.mp3',
  ],
  dagger_throw: [
    'dagger_throw_1.mp3',
    'dagger_throw_2.mp3',
    'dagger_throw_3.mp3',
  ],
  unsheathe: ['unsheathe_1.mp3', 'unsheathe_2.mp3', 'unsheathe_3.mp3'],
  bell: ['bell_1.mp3'],
  ui_click: ['ui_click_1.mp3', 'ui_click_2.mp3', 'ui_click_3.mp3'],
};

export interface SpatialMix {
  gain: number;
  pan: number;
  distantLowpassHz: number | null;
}

export interface ListenerPose {
  x: number;
  y: number;
  z: number;
  rightX: number;
  rightZ: number;
}

/**
 * Returns true when coordinates sit on the elevated central timber Skybridge deck
 * (x in [-10.2, 10.2], z in [-4.2, 4.2], y >= 3.4m) rather than stone courtyard/bastions.
 */
export function isWoodenBridgeSurface(x: number, y: number, z: number): boolean {
  return y >= 3.4 && Math.abs(x) <= 10.2 && Math.abs(z) <= 4.2;
}

/**
 * Computes 3D distance attenuation, stereo panning, and subtle air-absorption filtering
 * relative to the active camera/fighter listener.
 */
export function computeSpatialMix(
  listener: ListenerPose,
  x: number,
  y: number,
  z: number,
  isFocusActor = false
): SpatialMix {
  if (isFocusActor) {
    return { gain: 1.0, pan: 0.0, distantLowpassHz: null };
  }
  const dx = x - listener.x;
  const dy = (y - listener.y) * 0.85;
  const dz = z - listener.z;
  const dist = Math.hypot(dx, dy, dz);

  const excess = Math.max(0, dist - 2.2);
  const gain = Math.max(
    0.08,
    Math.min(1.0, 1 / (1 + Math.pow(excess / 10.5, 1.45)))
  );

  let pan = 0;
  const horizDist = Math.hypot(dx, dz);
  if (horizDist > 0.6) {
    const dotRight = (dx * listener.rightX + dz * listener.rightZ) / horizDist;
    pan = Math.max(-0.75, Math.min(0.75, dotRight * 0.72));
  }

  const distantLowpassHz = dist > 14.5 ? Math.max(2200, 5600 - dist * 115) : null;
  return { gain, pan, distantLowpassHz };
}

/**
 * Picks a variant index from [0, count - 1] guaranteed not to repeat `lastIndex`
 * back-to-back whenever count >= 2.
 */
export function pickVariantIndex(
  count: number,
  lastIndex: number | undefined,
  randomValue = Math.random()
): number {
  if (count <= 1) return 0;
  const clamped = Math.max(0, Math.min(0.999999, randomValue));
  if (lastIndex === undefined || lastIndex < 0 || lastIndex >= count) {
    return Math.floor(clamped * count);
  }
  const offset = 1 + Math.floor(clamped * (count - 1));
  return (lastIndex + offset) % count;
}

interface SamplePlayOptions {
  gain?: number;
  rateMin?: number;
  rateMax?: number;
  delaySec?: number;
  spatial?: SpatialMix;
}

/**
 * Real-Foley WebAudio Sound Manager:
 * Plays curated CC0 1.0 medieval weapon swings, layered steel/plate/mail hits,
 * shield blocks, Norse-sword parry clashes, surface-aware stone & Skybridge wood
 * footsteps, knight armor foley, seismic hammer quakes, fortress bells, and UI cues,
 * with automatic procedural WebAudio fallback before sample decoding completes.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private volume = 0.7;

  private readonly decodedBanks = new Map<SfxBankId, AudioBuffer[]>();
  private readonly lastVariantByBank = new Map<SfxBankId, number>();

  private decodeStarted = false;

  private listener: ListenerPose = {
    x: 0,
    y: 0,
    z: 0,
    rightX: 1,
    rightZ: 0,
  };

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      } catch {
        this.masterGain.gain.value = this.volume;
      }
    }
  }

  public updateListener(
    x: number,
    y: number,
    z: number,
    rightX: number,
    rightZ: number
  ): void {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.z = z;
    const len = Math.hypot(rightX, rightZ);
    if (len > 1e-4) {
      this.listener.rightX = rightX / len;
      this.listener.rightZ = rightZ / len;
    }
  }

  public unlock(): void {
    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.value = this.volume;

          if (typeof this.ctx.createDynamicsCompressor === 'function') {
            this.compressor = this.ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -10;
            this.compressor.knee.value = 12;
            this.compressor.ratio.value = 4;
            this.compressor.attack.value = 0.003;
            this.compressor.release.value = 0.16;
            this.compressor.connect(this.masterGain);
          }

          this.masterGain.connect(this.ctx.destination);
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.ctx && !this.decodeStarted) {
        this.decodeStarted = true;
        void this.decodeAllBanksThrottled();
      }
    } catch {
      // Never allow restricted iframe/WebAudio policies to block gameplay
    }
  }

  private getBaseUrl(): string {
    const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
    const base = meta.env?.BASE_URL ?? '/';
    return base.endsWith('/') ? base : `${base}/`;
  }

  /**
   * Loads and decodes CC0 MP3 banks using at most 4 concurrent HTTP requests
   * after the user's first interaction, avoiding proxy connection saturation at boot.
   */
  private async decodeAllBanksThrottled(): Promise<void> {
    if (!this.ctx || typeof fetch !== 'function') return;
    const ctx = this.ctx;
    const baseUrl = this.getBaseUrl();

    const queue: Array<{ bankId: SfxBankId; file: string }> = [];
    const entries = Object.entries(SFX_BANKS) as [SfxBankId, readonly string[]][];
    for (const [bankId, files] of entries) {
      for (const file of files) {
        queue.push({ bankId, file });
      }
    }

    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        const idx = cursor++;
        const item = queue[idx];
        try {
          const res = await fetch(`${baseUrl}audio/sfx/${item.file}`);
          if (!res.ok) continue;
          const raw = await res.arrayBuffer();
          if (raw.byteLength < 256) continue;
          const audioBuf = await ctx.decodeAudioData(raw.slice(0));
          let list = this.decodedBanks.get(item.bankId);
          if (!list) {
            list = [];
            this.decodedBanks.set(item.bankId, list);
          }
          list.push(audioBuf);
        } catch {
          // Procedural fallback handles any unavailable clip
        }
      }
    };

    const concurrency = 4;
    await Promise.all(
      Array.from({ length: concurrency }, () => worker())
    );
  }

  private getOutputNode(): AudioNode | null {
    if (!this.ctx) return null;
    return this.compressor ?? this.masterGain ?? this.ctx.destination;
  }

  private playSample(bank: SfxBankId, opts: SamplePlayOptions = {}): boolean {
    if (!this.ctx || this.volume <= 0.01) return false;
    const buffers = this.decodedBanks.get(bank);
    const out = this.getOutputNode();
    if (!buffers || buffers.length === 0 || !out) return false;

    const spatial = opts.spatial ?? {
      gain: 1.0,
      pan: 0.0,
      distantLowpassHz: null,
    };
    const effectiveGain = (opts.gain ?? 1.0) * spatial.gain;
    if (effectiveGain <= 0.008) return true;

    try {
      const idx = pickVariantIndex(
        buffers.length,
        this.lastVariantByBank.get(bank)
      );
      this.lastVariantByBank.set(bank, idx);

      const startTime = this.ctx.currentTime + Math.max(0, opts.delaySec ?? 0);
      const rMin = opts.rateMin ?? 0.95;
      const rMax = opts.rateMax ?? 1.05;
      const rate = rMin + Math.random() * (rMax - rMin);

      const src = this.ctx.createBufferSource();
      src.buffer = buffers[idx];
      src.playbackRate.setValueAtTime(rate, startTime);

      const gainNode = this.ctx.createGain();
      // Recorded clips are mastered at -20 dBFS; 1.85x brings primary hits right to vivid game presence
      gainNode.gain.setValueAtTime(effectiveGain * 1.85, startTime);

      let tail: AudioNode = src;
      if (spatial.distantLowpassHz !== null) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(spatial.distantLowpassHz, startTime);
        tail.connect(filter);
        tail = filter;
      }

      tail.connect(gainNode);
      if (
        typeof this.ctx.createStereoPanner === 'function' &&
        Math.abs(spatial.pan) > 0.02
      ) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(spatial.pan, startTime);
        gainNode.connect(panner);
        panner.connect(out);
      } else {
        gainNode.connect(out);
      }

      src.start(startTime);
      return true;
    } catch {
      return false;
    }
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.ctx || this.volume <= 0.01) return;
    if (!this.playSample('ui_click', { gain: 0.45, rateMin: 0.96, rateMax: 1.06 })) {
      this.playNoiseBurst(0.03, 900, 420, 0.08);
    }
  }

  public playClassSelect(classId: KnightClassId): void {
    this.unlock();
    if (!this.ctx || this.volume <= 0.01) return;
    if (
      classId === 'hammer' ||
      classId === 'barbarian' ||
      classId === 'skeleton_knight' ||
      classId === 'skeleton_berserker'
    ) {
      const ok = this.playSample('shield_thud', {
        gain: 0.68,
        rateMin: 0.88,
        rateMax: 1.0,
      });
      this.playSample(classId === 'barbarian' ? 'swing_hammer' : 'plate_clank', {
        gain: 0.48,
        rateMin: 0.88,
        rateMax: 0.98,
        delaySec: 0.04,
      });
      if (!ok) this.playBlockClangFallback();
    } else if (classId === 'spear') {
      const ok = this.playSample('swing_polearm', {
        gain: 0.65,
        rateMin: 0.96,
        rateMax: 1.04,
      });
      this.playSample('unsheathe', {
        gain: 0.35,
        rateMin: 1.02,
        rateMax: 1.1,
      });
      if (!ok) this.playSwingFallback(false);
    } else {
      const isFast =
        classId === 'dual' ||
        classId === 'duelist' ||
        classId === 'skeleton_reaper';
      const ok = this.playSample('unsheathe', {
        gain: 0.68,
        rateMin: isFast ? 1.06 : 0.95,
        rateMax: isFast ? 1.15 : 1.03,
      });
      if (classId === 'dual' || classId === 'skeleton_reaper') {
        this.playSample('unsheathe', {
          gain: 0.5,
          rateMin: 1.12,
          rateMax: 1.2,
          delaySec: 0.09,
        });
      }
      if (!ok) this.playSwingFallback(false);
    }
  }

  public handleCombatEvents(
    events: CombatEvent[],
    fighters: readonly Fighter[] = [],
    observedId: string | null = 'player'
  ): void {
    if (this.volume <= 0.01) return;

    const fighterMap = new Map<string, Fighter>();
    for (const f of fighters) {
      fighterMap.set(f.id, f);
    }

    for (const ev of events) {
      const attacker = fighterMap.get(ev.attackerId);
      const victim = ev.victimId ? fighterMap.get(ev.victimId) : undefined;
      const isFocus =
        ev.attackerId === observedId ||
        (ev.victimId !== undefined && ev.victimId === observedId);
      const spatial = computeSpatialMix(
        this.listener,
        ev.x,
        ev.y,
        ev.z,
        isFocus
      );

      switch (ev.type) {
        case 'swing':
          this.playClassSwing(
            attacker?.classId ?? 'sword',
            Boolean(ev.isHeavy),
            spatial
          );
          break;
        case 'ability_cast':
          this.playAbilityCast(
            ev.abilityId,
            attacker?.classId ?? 'sword',
            Boolean(ev.isHeavy),
            spatial
          );
          break;
        case 'warcry_nova':
          this.playWarcryNova(spatial);
          break;
        case 'quake_slam':
          this.playQuakeSlam(spatial);
          break;
        case 'dagger_throw':
          this.playDaggerThrow(spatial);
          break;
        case 'dagger_hit':
          this.playWeaponHit('spear', victim?.classId ?? 'sword', false, spatial);
          break;
        case 'hit':
          this.playWeaponHit(
            attacker?.classId ?? 'sword',
            victim?.classId ?? 'sword',
            false,
            spatial
          );
          break;
        case 'heavy_hit':
          this.playWeaponHit(
            attacker?.classId ?? 'hammer',
            victim?.classId ?? 'sword',
            true,
            spatial
          );
          break;
        case 'blocked':
          this.playBlockClang(victim?.classId ?? 'sword', spatial);
          break;
        case 'parried':
          this.playParryRing(spatial);
          break;
        case 'guard_broken':
          this.playGuardBreak(spatial);
          break;
        case 'ground_slam':
          this.playGroundSlam(spatial);
          break;
        case 'deflect_push':
        case 'shield_shove':
          this.playShove(spatial);
          break;
        case 'evaded':
          this.playDodgeWhoosh(spatial);
          break;
        case 'death':
          this.playDeath(spatial);
          break;
      }
    }
  }

  public playFootstep(
    isFocusActor: boolean,
    x = 0,
    y = 0,
    z = 0,
    classId: KnightClassId = 'sword'
  ): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const spatial = computeSpatialMix(this.listener, x, y, z, isFocusActor);
    const onWood = isWoodenBridgeSurface(x, y, z);
    const bank: SfxBankId = onWood ? 'step_wood' : 'step_stone';

    const baseGain = isFocusActor ? 0.34 : 0.24;
    const rateBias =
      classId === 'hammer' ? 0.88 : classId === 'dual' ? 1.07 : 0.98;

    const ok = this.playSample(bank, {
      gain: baseGain,
      rateMin: rateBias - 0.05,
      rateMax: rateBias + 0.06,
      spatial,
    });

    // Subtle armor foley layer (plate clink for armored knights, light cloth for dual rogue)
    if (classId === 'dual') {
      this.playSample('cloth', {
        gain: baseGain * 0.36,
        rateMin: 0.98,
        rateMax: 1.1,
        spatial,
      });
    } else {
      const clankScale = classId === 'hammer' ? 0.42 : 0.26;
      this.playSample('plate_clank', {
        gain: baseGain * clankScale,
        rateMin: 0.94,
        rateMax: 1.08,
        delaySec: 0.018,
        spatial,
      });
    }

    if (!ok) {
      this.playNoiseBurst(
        0.045,
        onWood ? 260 : 380,
        120,
        (isFocusActor ? 0.1 : 0.04) * spatial.gain
      );
    }
  }

  public playJump(
    isFocusActor: boolean,
    x = 0,
    y = 0,
    z = 0,
    classId: KnightClassId = 'sword'
  ): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const spatial = computeSpatialMix(this.listener, x, y, z, isFocusActor);
    const baseGain = isFocusActor ? 0.48 : 0.32;
    const ok = this.playSample('cloth', {
      gain: baseGain,
      rateMin: 0.95,
      rateMax: 1.08,
      spatial,
    });
    this.playSample('dodge_whoosh', {
      gain: baseGain * 0.55,
      rateMin: 1.02,
      rateMax: 1.14,
      spatial,
    });
    if (classId !== 'dual') {
      this.playSample('plate_clank', {
        gain: baseGain * 0.35,
        rateMin: 0.96,
        rateMax: 1.06,
        spatial,
      });
    }
    if (!ok) {
      this.playNoiseBurst(0.09, 620, 260, (isFocusActor ? 0.15 : 0.06) * spatial.gain);
    }
  }

  public playLanding(
    isFocusActor: boolean,
    x = 0,
    y = 0,
    z = 0,
    classId: KnightClassId = 'sword'
  ): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const spatial = computeSpatialMix(this.listener, x, y, z, isFocusActor);
    const onWood = isWoodenBridgeSurface(x, y, z);
    const baseGain = isFocusActor ? 0.58 : 0.4;

    const ok = this.playSample(onWood ? 'step_wood' : 'step_stone', {
      gain: baseGain,
      rateMin: 0.78,
      rateMax: 0.88,
      spatial,
    });
    if (classId !== 'dual') {
      this.playSample('plate_clank', {
        gain: baseGain * (classId === 'hammer' ? 0.68 : 0.48),
        rateMin: 0.88,
        rateMax: 0.98,
        delaySec: 0.02,
        spatial,
      });
    } else {
      this.playSample('cloth', {
        gain: baseGain * 0.5,
        rateMin: 0.92,
        rateMax: 1.02,
        spatial,
      });
    }
    if (!ok) {
      this.playNoiseBurst(0.08, 220, 95, (isFocusActor ? 0.2 : 0.08) * spatial.gain);
    }
  }

  public playDodge(
    isFocusActor: boolean,
    x = 0,
    y = 0,
    z = 0,
    classId: KnightClassId = 'sword'
  ): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const spatial = computeSpatialMix(this.listener, x, y, z, isFocusActor);
    const baseGain = isFocusActor ? 0.56 : 0.38;

    if (classId === 'hammer' || classId === 'skeleton_knight') {
      // Heavy Shield dodge is an armored shield shove
      const ok = this.playSample('shield_thud', {
        gain: baseGain * 0.95,
        rateMin: 0.9,
        rateMax: 1.0,
        spatial,
      });
      this.playSample('plate_clank', {
        gain: baseGain * 0.55,
        rateMin: 0.88,
        rateMax: 0.98,
        delaySec: 0.025,
        spatial,
      });
      if (!ok) this.playNoiseBurst(0.11, 420, 150, 0.16 * spatial.gain);
      return;
    }

    const ok = this.playSample('dodge_whoosh', {
      gain: baseGain,
      rateMin: classId === 'dual' ? 1.06 : 0.94,
      rateMax: classId === 'dual' ? 1.18 : 1.04,
      spatial,
    });
    this.playSample('cloth', {
      gain: baseGain * 0.65,
      rateMin: 0.95,
      rateMax: 1.08,
      spatial,
    });
    if (!ok) {
      this.playNoiseBurst(0.11, 900, 320, 0.15 * spatial.gain);
    }
  }

  public playCountdownTick(isFinalGo: boolean): void {
    this.unlock();
    if (!this.ctx || this.volume <= 0.01) return;
    if (isFinalGo) {
      const ok = this.playSample('bell', {
        gain: 0.82,
        rateMin: 0.98,
        rateMax: 1.02,
      });
      this.playSample('unsheathe', {
        gain: 0.65,
        rateMin: 0.96,
        rateMax: 1.02,
        delaySec: 0.05,
      });
      if (!ok) this.playCountdownFallback(true);
    } else {
      const ok = this.playSample('shield_thud', {
        gain: 0.55,
        rateMin: 0.96,
        rateMax: 1.02,
      });
      this.playSample('anvil', {
        gain: 0.24,
        rateMin: 0.84,
        rateMax: 0.9,
      });
      if (!ok) this.playCountdownFallback(false);
    }
  }

  public playSuddenDeathBell(): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const ok = this.playSample('bell', {
      gain: 0.88,
      rateMin: 0.82,
      rateMax: 0.86,
    });
    this.playSample('anvil', {
      gain: 0.42,
      rateMin: 0.75,
      rateMax: 0.8,
      delaySec: 0.06,
    });
    if (!ok) this.playCountdownFallback(true);
  }

  public playMatchEnd(victory: boolean): void {
    if (!this.ctx || this.volume <= 0.01) return;
    this.playSample('bell', {
      gain: victory ? 0.78 : 0.62,
      rateMin: victory ? 1.02 : 0.76,
      rateMax: victory ? 1.05 : 0.8,
    });
    if (victory) {
      this.playSample('unsheathe', {
        gain: 0.6,
        rateMin: 0.98,
        rateMax: 1.04,
        delaySec: 0.08,
      });
      this.playSample('warcry_buff', {
        gain: 0.55,
        rateMin: 0.98,
        rateMax: 1.04,
        delaySec: 0.14,
      });
    } else {
      this.playSample('drop_weapon', {
        gain: 0.55,
        rateMin: 0.88,
        rateMax: 0.94,
        delaySec: 0.16,
      });
    }
  }

  private playClassSwing(
    classId: KnightClassId,
    heavy: boolean,
    spatial: SpatialMix
  ): void {
    let bank: SfxBankId = 'swing_sword';
    if (
      classId === 'hammer' ||
      classId === 'barbarian' ||
      classId === 'skeleton_berserker' ||
      (heavy && classId === 'sword')
    ) {
      bank = 'swing_hammer';
    } else if (classId === 'spear') {
      bank = 'swing_polearm';
    }

    const isFast =
      classId === 'dual' ||
      classId === 'duelist' ||
      classId === 'skeleton_reaper';
    const rateShift = heavy ? -0.12 : isFast ? 0.08 : 0;
    const ok = this.playSample(bank, {
      gain: heavy ? 0.82 : 0.64,
      rateMin: Math.max(0.72, 0.94 + rateShift),
      rateMax: Math.max(0.8, 1.05 + rateShift),
      spatial,
    });
    if (heavy) {
      this.playSample('cloth', {
        gain: 0.38,
        rateMin: 0.85,
        rateMax: 0.96,
        spatial,
      });
    }
    if (!ok) {
      this.playSwingFallback(heavy, spatial.gain);
    }
  }

  private playAbilityCast(
    abilityId: AbilityKind | undefined,
    classId: KnightClassId,
    heavy: boolean,
    spatial: SpatialMix
  ): void {
    switch (abilityId) {
      case 'sword_rush': {
        const ok = this.playSample('unsheathe', {
          gain: 0.72,
          rateMin: 0.94,
          rateMax: 1.02,
          spatial,
        });
        this.playSample('swing_hammer', {
          gain: 0.78,
          rateMin: 0.92,
          rateMax: 1.0,
          delaySec: 0.06,
          spatial,
        });
        this.playSample('warcry_voice', {
          gain: 0.46,
          rateMin: 0.94,
          rateMax: 1.04,
          spatial,
        });
        if (!ok) this.playSwingFallback(true, spatial.gain);
        return;
      }
      case 'sword_warcry':
      case 'hammer_forge':
      case 'barb_rage':
      case 'sb_undying_fury': {
        const ok = this.playSample('warcry_voice', {
          gain: 0.68,
          rateMin: abilityId === 'barb_rage' ? 0.82 : 0.9,
          rateMax: abilityId === 'barb_rage' ? 0.92 : 0.98,
          spatial,
        });
        this.playSample(abilityId === 'hammer_forge' ? 'anvil' : 'unsheathe', {
          gain: 0.55,
          rateMin: 0.92,
          rateMax: 1.02,
          spatial,
        });
        if (!ok) this.playSwingFallback(true, spatial.gain);
        return;
      }
      case 'dual_cyclone':
      case 'sr_bone_whirl': {
        const ok = this.playSample('swing_sword', {
          gain: 0.72,
          rateMin: 1.04,
          rateMax: 1.12,
          spatial,
        });
        this.playSample('swing_sword', {
          gain: 0.68,
          rateMin: 1.08,
          rateMax: 1.18,
          delaySec: 0.16,
          spatial,
        });
        this.playSample('swing_sword', {
          gain: 0.72,
          rateMin: 1.0,
          rateMax: 1.1,
          delaySec: 0.32,
          spatial,
        });
        if (!ok) this.playSwingFallback(false, spatial.gain);
        return;
      }
      case 'dual_dagger':
      case 'spear_javelin':
      case 'barb_hatchet':
      case 'duelist_bomb':
      case 'sr_bone_shard': {
        const ok = this.playSample(
          abilityId === 'spear_javelin' ? 'swing_polearm' : 'unsheathe',
          {
            gain: 0.6,
            rateMin: abilityId === 'barb_hatchet' ? 0.92 : 1.08,
            rateMax: abilityId === 'barb_hatchet' ? 1.02 : 1.2,
            spatial,
          }
        );
        this.playSample('dodge_whoosh', {
          gain: 0.5,
          rateMin: 0.98,
          rateMax: 1.12,
          spatial,
        });
        if (!ok) this.playSwingFallback(false, spatial.gain);
        return;
      }
      case 'spear_dragon': {
        const ok = this.playSample('swing_polearm', {
          gain: 0.85,
          rateMin: 0.84,
          rateMax: 0.94,
          spatial,
        });
        this.playSample('unsheathe', {
          gain: 0.52,
          rateMin: 0.98,
          rateMax: 1.08,
          spatial,
        });
        this.playSample('warcry_voice', {
          gain: 0.44,
          rateMin: 0.96,
          rateMax: 1.05,
          spatial,
        });
        if (!ok) this.playSwingFallback(true, spatial.gain);
        return;
      }
      case 'spear_sweep': {
        const ok = this.playSample('swing_polearm', {
          gain: 0.78,
          rateMin: 0.92,
          rateMax: 1.02,
          spatial,
        });
        this.playSample('dodge_whoosh', {
          gain: 0.58,
          rateMin: 0.98,
          rateMax: 1.08,
          delaySec: 0.12,
          spatial,
        });
        if (!ok) this.playSwingFallback(false, spatial.gain);
        return;
      }
      case 'hammer_ram':
      case 'sk_crypt_charge':
      case 'sb_shield_bash': {
        const ok = this.playSample('shield_thud', {
          gain: 0.82,
          rateMin: 0.86,
          rateMax: 0.95,
          spatial,
        });
        this.playSample('plate_clank', {
          gain: 0.62,
          rateMin: 0.85,
          rateMax: 0.95,
          delaySec: 0.04,
          spatial,
        });
        this.playSample('warcry_voice', {
          gain: 0.52,
          rateMin: 0.84,
          rateMax: 0.92,
          spatial,
        });
        if (!ok) this.playSwingFallback(true, spatial.gain);
        return;
      }
      case 'hammer_quake':
      case 'sword_judgment':
      case 'barb_leap':
      case 'sk_grave_slam':
      case 'sr_reaper_leap':
      case 'sb_execution': {
        const ok = this.playSample('swing_hammer', {
          gain: 0.85,
          rateMin: 0.78,
          rateMax: 0.9,
          spatial,
        });
        this.playSample('dodge_whoosh', {
          gain: 0.52,
          rateMin: 0.92,
          rateMax: 1.04,
          spatial,
        });
        this.playSample('warcry_voice', {
          gain: 0.54,
          rateMin: 0.82,
          rateMax: 0.94,
          spatial,
        });
        if (!ok) this.playSwingFallback(true, spatial.gain);
        return;
      }
      default:
        this.playClassSwing(classId, heavy, spatial);
    }
  }

  private playWarcryNova(spatial: SpatialMix): void {
    const ok = this.playSample('warcry_buff', {
      gain: 0.82,
      rateMin: 0.96,
      rateMax: 1.04,
      spatial,
    });
    this.playSample('anvil', {
      gain: 0.36,
      rateMin: 1.12,
      rateMax: 1.2,
      spatial,
    });
    if (!ok) {
      this.playSwingFallback(true, spatial.gain);
    }
  }

  private playDaggerThrow(spatial: SpatialMix): void {
    const ok = this.playSample('dagger_throw', {
      gain: 0.82,
      rateMin: 0.96,
      rateMax: 1.08,
      spatial,
    });
    this.playSample('unsheathe', {
      gain: 0.44,
      rateMin: 1.18,
      rateMax: 1.28,
      spatial,
    });
    if (!ok) {
      this.playNoiseBurst(0.08, 1800, 620, 0.2 * spatial.gain);
    }
  }

  private playWeaponHit(
    attackerClass: KnightClassId,
    victimClass: KnightClassId,
    heavy: boolean,
    spatial: SpatialMix
  ): void {
    let weaponBank: SfxBankId = 'hit_slash';
    if (heavy || attackerClass === 'hammer') {
      weaponBank = 'hit_crush';
    } else if (attackerClass === 'spear') {
      weaponBank = 'hit_pierce';
    }

    const armorBank: SfxBankId =
      victimClass === 'dual' ? 'hit_mail' : 'hit_plate';

    const ok = this.playSample(weaponBank, {
      gain: heavy ? 0.96 : 0.78,
      rateMin: heavy ? 0.86 : 0.94,
      rateMax: heavy ? 0.96 : 1.06,
      spatial,
    });
    this.playSample(armorBank, {
      gain: heavy ? 0.82 : 0.62,
      rateMin: victimClass === 'hammer' ? 0.86 : 0.95,
      rateMax: victimClass === 'hammer' ? 0.96 : 1.06,
      delaySec: 0.012,
      spatial,
    });
    if (heavy) {
      this.playSample('anvil', {
        gain: 0.32,
        rateMin: 0.82,
        rateMax: 0.94,
        delaySec: 0.018,
        spatial,
      });
    }

    if (!ok) {
      this.playArmorHitFallback(heavy, spatial.gain);
    }
  }

  private playBlockClang(victimClass: KnightClassId, spatial: SpatialMix): void {
    const ok = this.playSample('block', {
      gain: 0.86,
      rateMin: victimClass === 'hammer' ? 0.86 : 0.94,
      rateMax: victimClass === 'hammer' ? 0.96 : 1.05,
      spatial,
    });
    this.playSample('shield_thud', {
      gain: victimClass === 'hammer' ? 0.75 : 0.5,
      rateMin: 0.9,
      rateMax: 1.02,
      delaySec: 0.01,
      spatial,
    });
    if (!ok) {
      this.playBlockClangFallback(spatial.gain);
    }
  }

  private playParryRing(spatial: SpatialMix): void {
    const ok = this.playSample('parry_clash', {
      gain: 0.95,
      rateMin: 0.96,
      rateMax: 1.06,
      spatial,
    });
    this.playSample('anvil', {
      gain: 0.62,
      rateMin: 1.02,
      rateMax: 1.12,
      delaySec: 0.015,
      spatial,
    });
    if (!ok) {
      this.playBlockClangFallback(spatial.gain);
    }
  }

  private playGuardBreak(spatial: SpatialMix): void {
    const ok = this.playSample('hit_crush', {
      gain: 0.95,
      rateMin: 0.82,
      rateMax: 0.9,
      spatial,
    });
    this.playSample('shield_thud', {
      gain: 0.85,
      rateMin: 0.78,
      rateMax: 0.88,
      spatial,
    });
    this.playSample('anvil', {
      gain: 0.55,
      rateMin: 0.72,
      rateMax: 0.8,
      delaySec: 0.02,
      spatial,
    });
    if (!ok) {
      this.playArmorHitFallback(true, spatial.gain);
    }
  }

  private playGroundSlam(spatial: SpatialMix): void {
    const ok = this.playSample('slam', {
      gain: 0.94,
      rateMin: 0.88,
      rateMax: 0.98,
      spatial,
    });
    this.playSample('hit_crush', {
      gain: 0.72,
      rateMin: 0.82,
      rateMax: 0.92,
      spatial,
    });
    if (!ok) {
      this.playArmorHitFallback(true, spatial.gain);
    }
  }

  private playQuakeSlam(spatial: SpatialMix): void {
    const ok = this.playSample('quake', {
      gain: 1.0,
      rateMin: 0.86,
      rateMax: 0.95,
      spatial,
    });
    this.playSample('slam', {
      gain: 0.82,
      rateMin: 0.82,
      rateMax: 0.9,
      delaySec: 0.03,
      spatial,
    });
    this.playSample('anvil', {
      gain: 0.52,
      rateMin: 0.78,
      rateMax: 0.86,
      delaySec: 0.02,
      spatial,
    });
    if (!ok) {
      this.playArmorHitFallback(true, spatial.gain);
    }
  }

  private playShove(spatial: SpatialMix): void {
    const ok = this.playSample('shield_thud', {
      gain: 0.82,
      rateMin: 0.92,
      rateMax: 1.02,
      spatial,
    });
    this.playSample('plate_clank', {
      gain: 0.5,
      rateMin: 0.92,
      rateMax: 1.02,
      delaySec: 0.02,
      spatial,
    });
    if (!ok) {
      this.playNoiseBurst(0.12, 340, 110, 0.22 * spatial.gain);
    }
  }

  private playDodgeWhoosh(spatial: SpatialMix): void {
    const ok = this.playSample('dodge_whoosh', {
      gain: 0.65,
      rateMin: 0.98,
      rateMax: 1.12,
      spatial,
    });
    this.playSample('cloth', {
      gain: 0.52,
      rateMin: 0.96,
      rateMax: 1.08,
      spatial,
    });
    if (!ok) {
      this.playNoiseBurst(0.11, 900, 320, 0.16 * spatial.gain);
    }
  }

  private playDeath(spatial: SpatialMix): void {
    const ok = this.playSample('fall_armoured', {
      gain: 0.95,
      rateMin: 0.9,
      rateMax: 1.0,
      spatial,
    });
    this.playSample('plate_clank', {
      gain: 0.62,
      rateMin: 0.84,
      rateMax: 0.94,
      delaySec: 0.05,
      spatial,
    });
    this.playSample('drop_weapon', {
      gain: 0.76,
      rateMin: 0.92,
      rateMax: 1.04,
      delaySec: 0.16,
      spatial,
    });
    if (!ok) {
      this.playArmorHitFallback(true, spatial.gain);
    }
  }

  // --- Lightweight procedural fallbacks used only if AudioBuffers are still decoding ---

  private playSwingFallback(heavy: boolean, spatialGain = 1): void {
    const dur = heavy ? 0.22 : 0.13;
    this.playNoiseBurst(
      dur,
      heavy ? 480 : 880,
      heavy ? 160 : 280,
      (heavy ? 0.2 : 0.13) * spatialGain
    );
  }

  private playArmorHitFallback(heavy: boolean, spatialGain = 1): void {
    if (!this.ctx) return;
    const out = this.getOutputNode();
    if (!out) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 150 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + (heavy ? 0.2 : 0.12));
    gain.gain.setValueAtTime((heavy ? 0.3 : 0.2) * spatialGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.22 : 0.13));
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + (heavy ? 0.23 : 0.14));
  }

  private playBlockClangFallback(spatialGain = 1): void {
    if (!this.ctx) return;
    const out = this.getOutputNode();
    if (!out) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.16);
    gain.gain.setValueAtTime(0.22 * spatialGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  private playCountdownFallback(isFinalGo: boolean): void {
    if (!this.ctx) return;
    const out = this.getOutputNode();
    if (!out) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isFinalGo ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isFinalGo ? 330 : 220, now);
    gain.gain.setValueAtTime(isFinalGo ? 0.2 : 0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinalGo ? 0.35 : 0.15));
    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + (isFinalGo ? 0.36 : 0.16));
  }

  private playNoiseBurst(
    duration: number,
    startFreq: number,
    endFreq: number,
    ampScale: number
  ): void {
    if (!this.ctx) return;
    const out = this.getOutputNode();
    if (!out) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, endFreq),
      now + duration
    );

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(ampScale, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(now);
    src.stop(now + duration + 0.01);
  }
}
