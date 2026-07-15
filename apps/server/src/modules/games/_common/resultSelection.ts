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

/**
 * Select loss severity before selecting a concrete result. This prevents a
 * large number of zero-payout outcomes from drowning out the few legal
 * partial-loss outcomes in a game's paytable.
 *
 * Target distribution: 72% soft loss, 18% partial loss, 10% full loss. When a
 * game has no outcome in the requested band, fall back to the nearest legal
 * band rather than manufacturing an invalid multiplier.
 */
export function selectControlledLossBand<T extends { multiplier: number }>(
  pool: readonly T[],
): readonly T[] {
  const softLosses = pool.filter((item) => item.multiplier >= 0.5 && item.multiplier < 1);
  const partialLosses = pool.filter((item) => item.multiplier > 0 && item.multiplier < 0.5);
  const fullLosses = pool.filter((item) => item.multiplier === 0);
  const roll = Math.random();

  if (roll < 0.72) return firstNonEmpty(softLosses, partialLosses, fullLosses, pool);
  if (roll < 0.9) return firstNonEmpty(partialLosses, softLosses, fullLosses, pool);
  return firstNonEmpty(fullLosses, partialLosses, softLosses, pool);
}

function firstNonEmpty<T>(...groups: readonly (readonly T[])[]): readonly T[] {
  return groups.find((group) => group.length > 0) ?? [];
}
