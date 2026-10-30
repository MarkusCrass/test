import { CLASS_ORDER, type KnightClassId } from '../config/classes';
import { DEFAULT_PROFILE, loadProfile, onProfileSaved, saveProfile, type PlayerProfile } from '../config/playerProfile';

export interface CloudPlayer {
  getUniqueID(): string;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}
const KEY = 'knightsProfileV1';
const BOUND = 'kls_cloud_profile_owner_v1';
const PENDING = 'kls_cloud_profile_pending_v1_';
const TIMEOUT_MS = 10000;

type Pending = { profile: PlayerProfile; base: string | null };

function validate(value: unknown): PlayerProfile | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<PlayerProfile>;
  const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!nonnegative(p.coins) || !Array.isArray(p.unlockedKnights) ||
      !p.unlockedKnights.every(id => CLASS_ORDER.includes(id as KnightClassId)) ||
      !CLASS_ORDER.includes(p.activeKnight as KnightClassId) || !p.totals ||
      !nonnegative(p.totals.gamesPlayed) || !nonnegative(p.totals.wins) || !nonnegative(p.totals.kills)) return null;
  const unlocked = [...new Set<KnightClassId>(['sword', 'dual', 'spear', ...p.unlockedKnights])];
  return { coins: p.coins, unlockedKnights: unlocked,
    activeKnight: unlocked.includes(p.activeKnight as KnightClassId) ? p.activeKnight as KnightClassId : 'sword',
    totals: { gamesPlayed: p.totals.gamesPlayed, wins: p.totals.wins, kills: p.totals.kills } };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Cloud request timed out')), TIMEOUT_MS);
    promise.then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
  });
}

/** Local pending writes are tied to a player ID; conflicts never overwrite either copy. */
export class CloudProfile {
  private readonly pendingKey: string;
  private pendingMemory: Pending | null = null;
  private base: string | null = null;
  private canSync = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;
  private paused = false;
  private unsubscribe: (() => void) | null = null;
  public conflict = false;
  private remoteProfile: PlayerProfile | null = null;
  private conflictListener: (() => void) | null = null;

  private constructor(private readonly player: CloudPlayer, id: string) {
    this.pendingKey = PENDING + encodeURIComponent(id);
  }

  static async start(player: CloudPlayer): Promise<CloudProfile | null> {
    let id: string;
    try { id = player.getUniqueID(); if (!id) return null; } catch { return null; }
    const cloud = new CloudProfile(player, id);
    const owner = cloud.read(BOUND);
    const pending = cloud.readPending();
    if (owner && owner !== id) {
      // Never carry one account's local profile into another account.
      saveProfile({ ...DEFAULT_PROFILE, unlockedKnights: [...DEFAULT_PROFILE.unlockedKnights], totals: { ...DEFAULT_PROFILE.totals } });
    }
    try {
      const data = await withTimeout(player.getData([KEY]));
      const raw = data[KEY];
      const remote = raw == null ? null : validate(raw);
      if (raw != null && !remote) throw new Error('Invalid cloud profile');
      cloud.base = remote ? JSON.stringify(remote) : null;
      cloud.remoteProfile = remote;
      if (pending && pending.base !== cloud.base) {
        // Both devices changed the profile. Keep the pending copy and do not write
        // until a future conflict-resolution mechanism can ask the player.
        cloud.conflict = true;
        saveProfile(pending.profile);
      } else if (pending) {
        saveProfile(pending.profile);
        cloud.canSync = true;
      } else if (remote) {
        saveProfile(remote);
        cloud.canSync = true;
      } else {
        cloud.canSync = true;
        // Import a local profile only if it is unbound or belongs to this account.
        if (!owner || owner === id) cloud.writePending(loadProfile());
      }
    } catch (error) {
      console.warn('Cloud profile unavailable; local changes are retained without overwriting cloud.', error);
      // A pending profile belongs only to this player. Do not write to cloud until
      // a successful read has established whether another device changed it.
      if (pending) saveProfile(pending.profile);
    }
    cloud.write(BOUND, id);
    cloud.unsubscribe = onProfileSaved(profile => {
      if (cloud.conflict) return; // Preserve both versions instead of silently overwriting either.
      cloud.writePending(profile);
      cloud.schedule();
    });
    if (cloud.canSync && cloud.readPending()) cloud.schedule();
    return cloud;
  }

  resolveConflict(choice: 'cloud' | 'local'): void {
    if (!this.conflict) return;
    const pending = this.readPending();
    if (pending) this.write(this.pendingKey + '_backup', JSON.stringify({ local: pending.profile, cloud: this.base ? JSON.parse(this.base) : null }));
    if (choice === 'local' && pending) saveProfile(pending.profile);
    else {
      saveProfile(this.remoteProfile ?? { ...DEFAULT_PROFILE, unlockedKnights: [...DEFAULT_PROFILE.unlockedKnights], totals: { ...DEFAULT_PROFILE.totals } });
      this.pendingMemory = null;
      try { localStorage.removeItem(this.pendingKey); } catch { /* storage unavailable */ }
    }
    this.conflict = false;
    this.canSync = true;
    if (choice === 'local' && pending) {
      this.writePending(pending.profile);
      this.schedule();
    }
  }

  onConflict(listener: () => void): void { this.conflictListener = listener; }

  private read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
  private write(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* local storage unavailable */ } }
  private readPending(): Pending | null {
    if (this.pendingMemory) return this.pendingMemory;
    try {
      const raw = this.read(this.pendingKey); if (!raw) return this.pendingMemory;
      const data = JSON.parse(raw) as Pending;
      const profile = validate(data.profile);
      return profile && (typeof data.base === 'string' || data.base === null) ? { profile, base: data.base } : null;
    } catch { return null; }
  }
  private writePending(profile: PlayerProfile): void {
    const clean = validate(profile);
    if (clean) {
      this.pendingMemory = { profile: clean, base: this.base };
      this.write(this.pendingKey, JSON.stringify(this.pendingMemory));
    }
  }
  private schedule(): void {
    if (!this.canSync || this.paused || this.timer || this.sending) return;
    // At most 75 writes per five minutes, below the platform's limit of 100.
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 4000);
  }
  async flush(): Promise<void> {
    if (!this.canSync || this.paused || this.sending) return;
    const pending = this.readPending(); if (!pending) return;
    this.sending = true;
    try {
      // Check the last known cloud revision before writing so another device's
      // completed changes are not silently overwritten by this session.
      const data = await withTimeout(this.player.getData([KEY]));
      if (this.paused) return;
      const raw = data[KEY];
      const current = raw == null ? null : validate(raw);
      if (raw != null && !current) throw new Error('Invalid cloud profile');
      const currentBase = current ? JSON.stringify(current) : null;
      if (currentBase !== pending.base) {
        this.remoteProfile = current;
        this.base = currentBase;
        this.canSync = false;
        this.conflict = true;
        this.conflictListener?.();
        return;
      }
      await this.player.setData({ [KEY]: pending.profile }, true);
      const sent = JSON.stringify(pending.profile);
      this.base = sent;
      const latest = this.readPending();
      if (latest && JSON.stringify(latest.profile) === sent) {
        this.pendingMemory = null;
        try { localStorage.removeItem(this.pendingKey); } catch { /* storage unavailable */ }
      } else if (latest) this.writePending(latest.profile);
    } catch (error) { console.warn('Cloud profile save failed; keeping local pending changes.', error); }
    finally { this.sending = false; if (this.readPending()) this.schedule(); }
  }
  pause(): void { this.paused = true; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  dispose(): void { this.pause(); this.unsubscribe?.(); this.unsubscribe = null; }
}
