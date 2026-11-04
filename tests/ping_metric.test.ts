import { describe, expect, it, vi } from 'vitest';
import { MultiplayerClient } from '../src/net/MultiplayerClient';
import { ServerMsg } from '../src/net/protocol';

describe('Displayed multiplayer response time', () => {
  it('does not count HTTP polling queue time as ping, but still measures WebSocket pong RTT', () => {
    const onPingUpdate = vi.fn();
    const client = new MultiplayerClient({ onPingUpdate });
    const internals = client as unknown as {
      transport: 'http' | 'ws';
      handleServerMessage(message: ServerMsg): void;
    };
    const now = vi.spyOn(performance, 'now').mockReturnValue(2000);
    try {
      client.pingMs = 200; // Already measured from the HTTP fetch round-trip.
      internals.transport = 'http';
      // A ping queued at 500ms arrives after a 200ms HTTP request at 2000ms.
      // Its timestamp measures 1300ms of queue time, not just network latency.
      internals.handleServerMessage({ type: 'pong', clientTime: 500, serverTime: 0 });
      expect(client.pingMs).toBe(200);
      expect(onPingUpdate).not.toHaveBeenCalled();

      internals.transport = 'ws';
      internals.handleServerMessage({ type: 'pong', clientTime: 1900, serverTime: 0 });
      expect(client.pingMs).toBe(165); // 0.65 * 200 + 0.35 * 100
      expect(onPingUpdate).toHaveBeenCalledTimes(1);
      expect(onPingUpdate).toHaveBeenCalledWith(165);
    } finally {
      now.mockRestore();
    }
  });
});
