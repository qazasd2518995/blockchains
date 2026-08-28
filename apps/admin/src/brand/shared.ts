export function resolveUrlList(raw: string | undefined, fallback: readonly string[]): string[] {
  const values = String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/\/$/, ''));
  return values.length > 0 ? [...new Set(values)] : [...fallback];
}

export function displayUrl(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}
