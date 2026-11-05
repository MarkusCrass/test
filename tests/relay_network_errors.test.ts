import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerClient, type NetConnectionStatus } from '../src/net/MultiplayerClient';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stalledFetch(_url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Timeout', 'AbortError')));
  });
}

describe('external multiplayer relay failures', () => {
  it('stops waiting for a stalled connect and reports an error to the online lobby', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(stalledFetch);
    vi.stubGlobal('fetch', fetcher);
    const onStatusChange = vi.fn();
    const client = new MultiplayerClient({ onStatusChange }, 'https://ezegames.ru');

    const result = client.connect();
    expect(client.getStatus()).toBe('connecting');
    await vi.advanceTimersByTimeAsync(13_050); // PHP and REST fallback each have a 6.5s deadline.
    expect(await result).toBe(false);
    expect(client.getStatus()).toBe('error');
    expect(onStatusChange).toHaveBeenCalledWith('error', expect.stringContaining('Не удалось подключиться'));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe('https://ezegames.ru/api/mp.php?action=connect');
    client.disconnect();
  });

  it('leaves a frozen match after two timed-out syncs instead of staying connected forever', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('action=connect')) {
        return Promise.resolve(new Response('{"clientId":"c_1","messages":[],"relayMode":"host_sim"}', { status: 200 }));
      }
      return stalledFetch(url, init);
    });
    vi.stubGlobal('fetch', fetcher);
    const statuses: Array<{ status: NetConnectionStatus; error?: string }> = [];
    const client = new MultiplayerClient({
      onStatusChange: (status, error) => statuses.push({ status, error }),
    }, 'https://ezegames.ru');

    expect(await client.connect()).toBe(true);
    expect(client.getStatus()).toBe('connected');
    await vi.advanceTimersByTimeAsync(13_500);
    expect(client.getStatus()).toBe('error');
    expect(statuses.at(-1)?.error).toBe('Потеряна связь с сервером арены.');
    client.disconnect();
  });
});
