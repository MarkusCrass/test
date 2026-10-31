import type { LoadingManager } from 'three';

/** Track Three.js texture/model loads without losing pre-existing manager listeners. */
export class LoadingTracker {
  private active = false;
  private failed = false;
  private waiters: Array<() => void> = [];
  private readonly oldStart: LoadingManager['onStart'];
  private readonly oldLoad: LoadingManager['onLoad'];
  private readonly oldError: LoadingManager['onError'];
  private readonly onStart: NonNullable<LoadingManager['onStart']>;
  private readonly onLoad: NonNullable<LoadingManager['onLoad']>;
  private readonly onError: NonNullable<LoadingManager['onError']>;

  constructor(private readonly manager: LoadingManager) {
    this.oldStart = manager.onStart;
    this.oldLoad = manager.onLoad;
    this.oldError = manager.onError;
    this.onStart = (url, loaded, total) => { this.active = true; this.oldStart?.(url, loaded, total); };
    this.onLoad = () => { this.active = false; this.oldLoad?.(); const waiters = this.waiters.splice(0); waiters.forEach(resolve => resolve()); };
    this.onError = url => { this.failed = true; this.oldError?.(url); };
    manager.onStart = this.onStart;
    manager.onLoad = this.onLoad;
    manager.onError = this.onError;
  }
  waitForIdle(): Promise<void> { return this.active ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve(); }
  get hasFailures(): boolean { return this.failed; }
  dispose(): void {
    if (this.manager.onStart === this.onStart) this.manager.onStart = this.oldStart;
    if (this.manager.onLoad === this.onLoad) this.manager.onLoad = this.oldLoad;
    if (this.manager.onError === this.onError) this.manager.onError = this.oldError;
  }
}
