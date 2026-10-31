import type { GamePlatform } from './GamePlatform';

export interface CrazySdk {
  init(): Promise<void>;
  environment?: string;
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
  };
}

/** Basic Launch intentionally has no ads; progress uses localStorage / CrazyGames APS. */
export class CrazyGames implements GamePlatform {
  private sdk: CrazySdk | null = null;
  private readySent = false;
  private desiredGameplay = false;
  private gameplay = false;

  async initialize(loader: CrazySdk | undefined, timeoutMs = 10000): Promise<void> {
    if (!loader) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const initialized = await Promise.race([
        loader.init().then(() => true),
        new Promise<false>(resolve => { timeout = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
      if (!initialized || loader.environment === 'disabled') return;
      this.sdk = loader;
      loader.game.loadingStart();
    } catch (error) {
      this.sdk = null;
      console.warn('CrazyGames SDK initialization failed:', error);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  ready(): void {
    if (!this.sdk || this.readySent) return;
    this.readySent = true;
    try { this.sdk.game.loadingStop(); } catch (error) { console.warn('CrazyGames loading event failed:', error); }
    this.syncGameplay();
  }

  setGameplay(active: boolean): void {
    this.desiredGameplay = active;
    this.syncGameplay();
  }

  private syncGameplay(): void {
    if (!this.sdk || !this.readySent || this.gameplay === this.desiredGameplay) return;
    try {
      if (this.desiredGameplay) this.sdk.game.gameplayStart();
      else this.sdk.game.gameplayStop();
      this.gameplay = this.desiredGameplay;
    } catch (error) { console.warn('CrazyGames gameplay event failed:', error); }
  }

  async getPlayerName(): Promise<undefined> { return undefined; }
  showRewarded(): boolean { return false; }
}

/** Wait briefly for the async script; blocked SDKs must not prevent guest play. */
export async function findCrazySdk(timeoutMs = 5000): Promise<CrazySdk | undefined> {
  const get = () => (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
  if (get()) return get();
  const script = document.getElementById('crazygames-sdk');
  if (!script) return undefined;
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.removeEventListener('load', finish);
      script.removeEventListener('error', finish);
      resolve(get());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    script.addEventListener('load', finish);
    script.addEventListener('error', finish);
    if (get()) finish();
  });
}
