export interface LifecyclePathOptions {
  stageCount: number;
  recoveryCount: number;
  random?: () => number;
}

export function maxLifecycleRecoveryCount(stageCount: number): number {
  const normalized = clampInteger(stageCount, 1, 100);
  return Math.floor((normalized - 1) / 2);
}

export function generateLifecyclePath({
  stageCount,
  recoveryCount,
  random = Math.random,
}: LifecyclePathOptions): number[] {
  const stages = clampInteger(stageCount, 1, 100);
  if (stages === 1) return [0];

  const recoveries = clampInteger(recoveryCount, 0, maxLifecycleRecoveryCount(stages));
  const recoveryIndexes = selectRecoveryIndexes(stages, recoveries);
  const baseDrop = 100 / stages;
  const steps: number[] = [];

  for (let index = 0; index < stages - 1; index += 1) {
    if (recoveryIndexes.has(index)) {
      steps.push(100);
      continue;
    }

    const baseline = 100 - baseDrop * (index + 1);
    const amplitude = baseDrop * (0.55 + clampRandom(random()) * 0.2);
    const wave = index % 2 === 0 ? -amplitude : amplitude;
    const jitter = (clampRandom(random()) - 0.5) * Math.min(1.5, baseDrop * 0.2);
    let value = roundPercent(Math.min(99, Math.max(0.25, baseline + wave + jitter)));

    const previous = steps.at(-1) ?? 100;
    if (value === previous) {
      value = roundPercent(value >= 99 ? value - 0.01 : value + 0.01);
    }
    steps.push(value);
  }

  steps.push(0);
  return steps;
}

function selectRecoveryIndexes(stageCount: number, recoveryCount: number): Set<number> {
  if (recoveryCount <= 0) return new Set<number>();
  const candidates: number[] = [];
  for (let index = 1; index <= stageCount - 2; index += 2) {
    candidates.push(index);
  }

  const selected = new Set<number>();
  for (let index = 0; index < recoveryCount; index += 1) {
    const candidateIndex = Math.min(
      candidates.length - 1,
      Math.floor(((index + 0.5) * candidates.length) / recoveryCount),
    );
    const candidate = candidates[candidateIndex];
    if (candidate !== undefined) selected.add(candidate);
  }
  return selected;
}

function clampInteger(value: number, min: number, max: number): number {
  const parsed = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, parsed));
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.999999, Math.max(0, value));
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2));
}
