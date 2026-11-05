const RELAY_HEALTH_TIMEOUT_MS = 5000;

/**
 * Check the actual multiplayer relay as soon as a Yandex Games build starts.
 * GET health does not create an online session or start polling. The result is
 * advisory: a failed cross-origin request must never prevent the solo game from loading.
 */
export function checkYandexRelayHealth(
  mode: string,
  baseUrl: string | undefined,
  fetchImpl?: typeof fetch
): Promise<boolean> | null {
  if (mode !== 'yandex' || !baseUrl?.trim()) return null;

  const endpoint = `${baseUrl.trim().replace(/\/+$/, '')}/api/mp.php?action=health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RELAY_HEALTH_TIMEOUT_MS);

  return (async () => {
    try {
      const response = await (fetchImpl ?? fetch)(endpoint, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const data: unknown = await response.json();
      return data !== null && typeof data === 'object' && 'ok' in data && data.ok === true;
    } catch {
      // Network failure, CSP, CORS, a timeout, or an invalid/HTML response.
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })();
}
