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

export function pickWeightedRandom<T>(
  items: readonly T[],
  weight: (item: T) => number,
): T | undefined {
  const weighted = items
    .map((item) => ({ item, weight: Math.max(0, weight(item)) }))
    .filter((entry) => Number.isFinite(entry.weight) && entry.weight > 0);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return pickRandomItem(items);

  let roll = Math.random() * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted.at(-1)?.item ?? pickRandomItem(items);
}
