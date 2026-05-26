export function pickRandomItem<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

export function pickRandomBest<T>(
  items: readonly T[],
  score: (item: T) => number,
  maxPoolSize = 5,
): T | undefined {
  if (items.length === 0) return undefined;
  const ranked = items
    .map((item) => ({ item, score: score(item) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score);
  if (ranked.length === 0) return pickRandomItem(items);
  const poolSize = Math.max(1, Math.min(maxPoolSize, ranked.length));
  return pickRandomItem(ranked.slice(0, poolSize).map((entry) => entry.item));
}
