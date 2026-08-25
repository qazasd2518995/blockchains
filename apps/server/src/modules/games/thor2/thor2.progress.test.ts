import { describe, expect, it } from 'vitest';
import { assertThor2FeatureComplete, nextThor2FeatureCursor } from './thor2.progress.js';

describe('Thor 2 deferred feature progress', () => {
  it('allows replayed progress and exactly one new completed round', () => {
    expect(nextThor2FeatureCursor(4, 4, 15)).toBe(4);
    expect(nextThor2FeatureCursor(4, 5, 15)).toBe(5);
  });

  it('rejects skipped rounds and progress past the stored sequence', () => {
    expect(() => nextThor2FeatureCursor(4, 6, 15)).toThrow('免費遊戲進度必須逐局更新');
    expect(() => nextThor2FeatureCursor(14, 16, 15)).toThrow('免費遊戲進度必須逐局更新');
  });

  it('only allows settlement after the final stored round', () => {
    expect(() => assertThor2FeatureComplete(14, 15)).toThrow('免費遊戲尚未播放完成');
    expect(() => assertThor2FeatureComplete(0, 0)).toThrow('免費遊戲尚未播放完成');
    expect(assertThor2FeatureComplete(15, 15)).toBeUndefined();
  });
});
