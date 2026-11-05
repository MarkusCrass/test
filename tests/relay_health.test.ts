import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from 'vite';
import { checkYandexRelayHealth } from '../src/net/relayHealth';

afterEach(() => vi.useRealTimers());

describe('Yandex Games multiplayer relay availability', () => {
  it('builds with the HTTPS host registered in the Yandex CSP request', () => {
    const configured = loadEnv('yandex', path.resolve(__dirname, '..'), 'VITE_').VITE_MULTIPLAYER_BASE_URL;
    expect(configured).toBe('https://ezegames.ru');
  });

  it('checks the configured host at boot with a single session-free CORS GET', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, relayMode: 'host_sim' }), { status: 200 }));
    const check = checkYandexRelayHealth('yandex', 'https://ezegames.ru/', fetcher);

    // The request starts immediately, without waiting for SDK, player account, or an Online click.
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      'https://ezegames.ru/api/mp.php?action=health',
      expect.objectContaining({
        method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit', signal: expect.any(AbortSignal),
      })
    );
    expect(await check).toBe(true);
  });

  it('does not call the external host in standalone, CrazyGames, development, or without a configured URL', () => {
    const fetcher = vi.fn(async () => new Response('{"ok":true}'));
    for (const mode of ['site', 'crazygames', 'development']) {
      expect(checkYandexRelayHealth(mode, 'https://ezegames.ru', fetcher)).toBeNull();
    }
    expect(checkYandexRelayHealth('yandex', '  ', fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['HTTP failure', new Response('{"ok":false}', { status: 503 })],
    ['unhealthy JSON', new Response('{"ok":false}', { status: 200 })],
    ['anti-bot HTML', new Response('<html>challenge</html>', { status: 200 })],
  ])('treats %s as unavailable without blocking game startup', async (_description, response) => {
    expect(await checkYandexRelayHealth('yandex', 'https://ezegames.ru', vi.fn(async () => response))).toBe(false);
  });

  it('handles a rejected request (network, CORS, or CSP) without an unhandled rejection', async () => {
    const fetcher = vi.fn(async (): Promise<Response> => { throw new TypeError('Failed to fetch'); });
    expect(await checkYandexRelayHealth('yandex', 'https://ezegames.ru', fetcher)).toBe(false);
  });

  it('aborts a stalled relay and resolves as unavailable after five seconds', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const check = checkYandexRelayHealth('yandex', 'https://ezegames.ru', fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await check).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts before awaiting the Yandex SDK and passes the result to the multiplayer UI', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '../src/main.ts'), 'utf8');
    const boot = main.indexOf('async function startGame(): Promise<void>');
    const preflight = main.indexOf('const relayHealth = checkYandexRelayHealth(', boot);
    const sdk = main.indexOf('await bounded(yandex.initialize(', boot);
    expect(boot).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(boot);
    expect(preflight).toBeLessThan(sdk);
    expect(main).toContain('loadingScreen, relayHealth);');
    expect(main).toContain('this.ui.showMultiplayerNotice(RELAY_HEALTH_NOTICE)');
  });
});
