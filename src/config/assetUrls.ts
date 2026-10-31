/** URLs for public game assets must remain relative when the game is hosted under a subdirectory. */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || './';
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}
