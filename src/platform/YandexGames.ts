import type { CloudPlayer } from './CloudProfile';

/** Minimal surface of the official Yandex Games SDK used by the game. */
export interface YandexSdk {
  environment?: { i18n?: { lang?: string } };
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv?: { showRewardedVideo(options: { callbacks: {
    onOpen(): void; onRewarded(): void; onClose(wasShown: boolean): void; onError(error: unknown): void;
  } }): void };
  getPlayer?(): Promise<Partial<CloudPlayer> & { getName(): string }>;
  on?(event: 'game_api_pause' | 'game_api_resume' | 'ACCOUNT_SELECTION_DIALOG_OPENED' | 'ACCOUNT_SELECTION_DIALOG_CLOSED', callback: () => void): void;
}
export interface YandexLoader { init(): Promise<YandexSdk> }

/** Independent from the app so rewards and lifecycle can be tested without the platform. */
export class YandexGames {
  private sdk: YandexSdk | null = null;
  private gameplay = false;
  private readySent = false;
  private adActive = false;
  private playerPromise: ReturnType<NonNullable<YandexSdk['getPlayer']>> | null = null;
  constructor(private readonly setPlatformPause: (paused: boolean) => void) {}

  async initialize(loader: YandexLoader | undefined, onLanguage: (language: string) => void): Promise<void> {
    if (!loader) return;
    try {
      const sdk = await loader.init();
      this.sdk = sdk;
      const language = sdk.environment?.i18n?.lang;
      if (language) onLanguage(language);
      sdk.on?.('game_api_pause', () => this.setPlatformPause(true));
      sdk.on?.('game_api_resume', () => this.setPlatformPause(false));
    } catch (error) { console.warn('Yandex Games SDK initialization failed:', error); }
  }

  async getPlayer(): Promise<(Partial<CloudPlayer> & { getName(): string }) | undefined> {
    try {
      if (!this.sdk?.getPlayer) return undefined;
      this.playerPromise ??= this.sdk.getPlayer();
      return await this.playerPromise;
    } catch { return undefined; }
  }

  async getPlayerName(): Promise<string | undefined> {
    try { return (await this.getPlayer())?.getName()?.trim() || undefined; } catch { return undefined; }
  }

  watchAccountSelection(onOpen: () => void, onClose: () => void): void {
    this.sdk?.on?.('ACCOUNT_SELECTION_DIALOG_OPENED', onOpen);
    this.sdk?.on?.('ACCOUNT_SELECTION_DIALOG_CLOSED', onClose);
  }

  ready(): void {
    if (!this.sdk || this.readySent) return;
    try { this.sdk.features?.LoadingAPI?.ready(); this.readySent = true; }
    catch (error) { console.warn('Yandex Games ready failed:', error); }
  }

  setGameplay(active: boolean): void {
    if (!this.sdk || this.gameplay === active) return;
    this.gameplay = active;
    try {
      if (active) this.sdk.features?.GameplayAPI?.start();
      else this.sdk.features?.GameplayAPI?.stop();
    } catch (error) { console.warn('Yandex Games gameplay event failed:', error); }
  }

  showRewarded(onRewarded: () => void, onFinished: (rewarded: boolean) => void): boolean {
    const adv = this.sdk?.adv;
    if (!adv?.showRewardedVideo || this.adActive) return false;
    this.adActive = true;
    let rewarded = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.adActive = false;
      onFinished(rewarded);
    };
    try {
      adv.showRewardedVideo({ callbacks: {
        onOpen: () => {},
        onRewarded: () => { if (!finished && !rewarded) { rewarded = true; onRewarded(); } },
        onClose: () => finish(),
        onError: (error) => { console.warn('Yandex rewarded ad failed:', error); finish(); },
      } });
      return true;
    } catch (error) { console.warn('Yandex rewarded ad failed:', error); finish(); return false; }
  }
}
