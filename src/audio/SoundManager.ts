import { CombatEvent } from '../core/CombatSystem';

/**
 * Procedural WebAudio Sound Manager:
 * Synthesizes crisp medieval weapon swings, steel impacts, heavy hammer slams,
 * shield blocks, parry rings, footsteps on stone, death thuds, and match horns
 * with zero external audio asset dependencies.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private volume = 0.7;

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public unlock(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public handleCombatEvents(events: CombatEvent[]): void {
    if (this.volume <= 0.01) return;
    for (const ev of events) {
      switch (ev.type) {
        case 'swing':
          this.playSwing(Boolean(ev.isHeavy));
          break;
        case 'hit':
          this.playArmorHit(false);
          break;
        case 'heavy_hit':
          this.playArmorHit(true);
          break;
        case 'blocked':
          this.playBlockClang();
          break;
        case 'parried':
          this.playParryRing();
          break;
        case 'guard_broken':
          this.playGuardBreak();
          break;
        case 'ground_slam':
          this.playGroundSlam();
          break;
        case 'deflect_push':
        case 'shield_shove':
          this.playShove();
          break;
        case 'evaded':
          this.playDodgeWhoosh();
          break;
        case 'death':
          this.playDeath();
          break;
      }
    }
  }

  public playFootstep(isHuman: boolean): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const gainScale = isHuman ? 0.11 : 0.04;
    this.playNoiseBurst(0.045, 380, 120, gainScale);
  }

  public playJump(isHuman: boolean): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const scale = isHuman ? 0.16 : 0.06;
    this.playNoiseBurst(0.09, 620, 260, scale);
  }

  public playLanding(isHuman: boolean): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const scale = isHuman ? 0.22 : 0.08;
    this.playNoiseBurst(0.08, 220, 95, scale);
  }

  public playCountdownTick(isFinalGo: boolean): void {
    this.unlock();
    if (!this.ctx || this.volume <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isFinalGo ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isFinalGo ? 330 : 220, now);
    if (isFinalGo) {
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.25);
    }

    const amp = (isFinalGo ? 0.22 : 0.14) * this.volume;
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinalGo ? 0.42 : 0.16));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (isFinalGo ? 0.44 : 0.18));
  }

  public playMatchEnd(victory: boolean): void {
    if (!this.ctx || this.volume <= 0.01) return;
    const notes = victory ? [261.6, 329.6, 392.0, 523.2] : [293.6, 261.6, 220.0];
    notes.forEach((freq, idx) => {
      const start = this.ctx!.currentTime + idx * 0.13;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.18 * this.volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  }

  private playSwing(heavy: boolean): void {
    this.playNoiseBurst(
      heavy ? 0.18 : 0.11,
      heavy ? 480 : 880,
      heavy ? 180 : 320,
      heavy ? 0.18 : 0.12
    );
  }

  private playDodgeWhoosh(): void {
    this.playNoiseBurst(0.13, 620, 210, 0.11);
  }

  private playArmorHit(heavy: boolean): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Metallic crunch + low body thump
    this.playNoiseBurst(heavy ? 0.14 : 0.09, 1400, 340, heavy ? 0.28 : 0.2);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(heavy ? 145 : 195, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + (heavy ? 0.18 : 0.11));

    gain.gain.setValueAtTime((heavy ? 0.28 : 0.19) * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.2 : 0.12));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.22 : 0.13));
  }

  private playBlockClang(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const freq of [620, 930]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + 0.15);
      gain.gain.setValueAtTime(0.13 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    }
  }

  private playParryRing(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const freq of [980, 1480]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.04, now + 0.34);
      gain.gain.setValueAtTime(0.22 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    }
  }

  private playGuardBreak(): void {
    this.playNoiseBurst(0.22, 900, 140, 0.28);
  }

  private playGroundSlam(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(0.24, 340, 75, 0.3);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.28);
    gain.gain.setValueAtTime(0.32 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.31);
  }

  private playShove(): void {
    this.playNoiseBurst(0.11, 520, 160, 0.18);
  }

  private playDeath(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.playNoiseBurst(0.28, 600, 90, 0.26);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.36);
    gain.gain.setValueAtTime(0.24 * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  private playNoiseBurst(
    duration: number,
    startFreq: number,
    endFreq: number,
    baseAmp: number
  ): void {
    if (!this.ctx) return;
    const sampleCount = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const now = this.ctx.currentTime;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(40, endFreq),
      now + duration
    );
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(baseAmp * this.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.01);
  }
}
