import { ApiError } from '../../../utils/errors.js';

export function nextThor2FeatureCursor(
  previous: number,
  requested: number,
  rounds: number,
): number {
  const safePrevious = Math.max(0, previous);
  if (requested > rounds || requested > safePrevious + 1) {
    throw new ApiError('INVALID_ACTION', '免費遊戲進度必須逐局更新');
  }
  return Math.max(safePrevious, requested);
}

export function assertThor2FeatureComplete(cursor: number, rounds: number): void {
  if (rounds === 0 || cursor < rounds) {
    throw new ApiError('INVALID_ACTION', '免費遊戲尚未播放完成');
  }
}
