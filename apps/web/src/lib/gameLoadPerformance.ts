export type GameLoadMilestone = 'iframe-loaded' | 'session-ready' | 'visual-ready';

interface ActiveGameLoad {
  startedAt: number;
  recorded: Set<GameLoadMilestone>;
}

interface StoredGameLoadMetric {
  gameId: string;
  milestone: GameLoadMilestone;
  durationMs: number;
  recordedAt: string;
}

const STORAGE_KEY = 'bg.game-load-metrics.v1';
const MAX_STORED_METRICS = 40;
const activeLoads = new Map<string, ActiveGameLoad>();

export function markGameNavigationStart(gameId: string): void {
  if (typeof window === 'undefined') return;
  activeLoads.set(gameId, { startedAt: performance.now(), recorded: new Set() });
  performance.mark(markName(gameId, 'start'));
}

export function ensureGameLoadStarted(gameId: string): void {
  if (activeLoads.has(gameId)) return;
  markGameNavigationStart(gameId);
}

export function recordGameLoadMilestone(gameId: string, milestone: GameLoadMilestone): void {
  if (typeof window === 'undefined') return;
  ensureGameLoadStarted(gameId);
  const active = activeLoads.get(gameId);
  if (!active || active.recorded.has(milestone)) return;
  active.recorded.add(milestone);

  const durationMs = Math.max(0, Math.round(performance.now() - active.startedAt));
  performance.mark(markName(gameId, milestone));
  try {
    performance.measure(
      `bg-game-load:${gameId}:${milestone}`,
      markName(gameId, 'start'),
      markName(gameId, milestone),
    );
  } catch {
    // A browser may evict old marks; the locally recorded duration remains valid.
  }

  const metric: StoredGameLoadMetric = {
    gameId,
    milestone,
    durationMs,
    recordedAt: new Date().toISOString(),
  };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as unknown) : [];
    const entries = Array.isArray(stored) ? stored : [];
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...entries.slice(-(MAX_STORED_METRICS - 1)), metric]),
    );
  } catch {
    // Private browsing/storage quotas must never interrupt a game launch.
  }
}

function markName(gameId: string, milestone: GameLoadMilestone | 'start'): string {
  return `bg-game-load-mark:${gameId}:${milestone}`;
}
