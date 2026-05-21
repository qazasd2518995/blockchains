const MODULE_RELOAD_KEY = 'yachiyo:module-reload-attempted-at';
const MODULE_RELOAD_COOLDOWN_MS = 30_000;
const MODULE_ERROR_PATTERNS = [
  'Importing a module script failed',
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Unable to preload CSS',
  'Missing lazy page export',
];
const MODULE_ERROR_REGEX = [
  /Cannot read (?:properties|property) of undefined \(reading ['"][A-Z][A-Za-z]+Page['"]\)/,
  /undefined is not an object \(evaluating ['"][^'"]+\.[A-Z][A-Za-z]+Page['"]\)/,
];

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error ?? '');
}

export function isRecoverableRuntimeError(error: unknown): boolean {
  const message = errorMessage(error);
  if (!message) return false;
  return (
    MODULE_ERROR_PATTERNS.some((pattern) => message.includes(pattern)) ||
    MODULE_ERROR_REGEX.some((pattern) => pattern.test(message))
  );
}

export function clearRuntimeRecoveryFlag(): void {
  try {
    sessionStorage.removeItem(MODULE_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

async function clearRuntimeCaches(): Promise<void> {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update()));
  }
}

function recentlyAttemptedReload(): boolean {
  try {
    const attemptedAt = Number(sessionStorage.getItem(MODULE_RELOAD_KEY) ?? 0);
    return Number.isFinite(attemptedAt) && Date.now() - attemptedAt < MODULE_RELOAD_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function markReloadAttempted(): void {
  try {
    sessionStorage.setItem(MODULE_RELOAD_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function reloadAfterRuntimeFailure(error: unknown): boolean {
  if (!isRecoverableRuntimeError(error)) return false;
  if (recentlyAttemptedReload()) return false;
  markReloadAttempted();
  void clearRuntimeCaches().finally(() => {
    window.location.reload();
  });
  return true;
}
