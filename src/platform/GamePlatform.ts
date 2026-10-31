/** The small platform surface used by the game loop and UI. */
export interface GamePlatform {
  ready(): void;
  setGameplay(active: boolean): void;
  getPlayerName(): Promise<string | undefined>;
  showRewarded(onRewarded: () => void, onFinished: (rewarded: boolean) => void): boolean;
}
