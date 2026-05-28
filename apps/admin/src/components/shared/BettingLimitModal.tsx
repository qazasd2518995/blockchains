import { useEffect, useMemo, useState } from 'react';
import {
  BETTING_LIMIT_RANGE_OPTIONS,
  GAMES_REGISTRY,
  normalizeBettingLimitRangeKey,
  normalizeBettingLimitsByGame,
  resolveBettingLimitRange,
  type BettingLimitsByGame,
} from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  targetType: 'agent' | 'member';
  targetId: string;
  targetUsername: string;
  currentLevel: string;
  currentLimits?: Record<string, string>;
  parentLevel?: string;
  parentLimits?: Record<string, string>;
  onDone: () => void;
}

export const BETTING_LIMIT_ENABLED_GAMES = Object.values(GAMES_REGISTRY).filter(
  (game) => game.enabled,
);

export function buildBettingLimitsSelection(
  limits: unknown,
  fallbackLevel: unknown,
): BettingLimitsByGame {
  const normalized = normalizeBettingLimitsByGame(limits);
  const fallback = normalizeBettingLimitRangeKey(fallbackLevel);
  return Object.fromEntries(
    BETTING_LIMIT_ENABLED_GAMES.map((game) => [game.id, normalized[game.id] ?? fallback]),
  );
}

export function summarizeBettingLimits(limits: Record<string, string>): string {
  const labels = new Set(
    Object.values(limits).map((value) => resolveBettingLimitRange(value).label),
  );
  return labels.size === 1 ? Array.from(labels)[0]! : `${labels.size} 種範圍`;
}

export function BettingLimitModal({
  open,
  onClose,
  targetType,
  targetId,
  targetUsername,
  currentLevel,
  currentLimits,
  parentLevel,
  parentLimits,
  onDone,
}: Props): JSX.Element {
  const parentResolved = useMemo(
    () => buildBettingLimitsSelection(parentLimits, parentLevel ?? 'range_5000_50000'),
    [parentLimits, parentLevel],
  );
  const [selected, setSelected] = useState<BettingLimitsByGame>(() =>
    buildBettingLimitsSelection(currentLimits, currentLevel),
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(buildBettingLimitsSelection(currentLimits, currentLevel));
    setErr(null);
  }, [open, currentLimits, currentLevel]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const path =
        targetType === 'agent'
          ? `/agents/${targetId}/betting-limit`
          : `/members/${targetId}/betting-limit`;
      await adminApi.patch(path, { bettingLimits: selected });
      onDone();
      onClose();
    } catch (e) {
      setErr(extractApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="限红设定"
      subtitle={`${targetType === 'agent' ? '代理' : '会员'} · ${targetUsername}`}
      width="xl"
    >
      <div className="mb-4 border border-[#D7B963]/50 bg-[#FFF8DF] p-3 text-[12px] leading-relaxed text-[#6D5520]">
        每个游戏独立选择限红范围；下级代理或会员只能设定为上级同等级或以下，超过上级的选项会被锁定。
      </div>

      <BettingLimitsInlineEditor
        value={selected}
        parentLimits={parentResolved}
        onChange={setSelected}
        className="max-h-[62vh] overflow-y-auto pr-1"
      />

      {err && (
        <div className="mt-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          {err}
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className="btn-acid">
          → 保存
        </button>
        <button type="button" onClick={onClose} className="btn-teal-outline">
          [取消]
        </button>
      </div>
    </Modal>
  );
}

export function BettingLimitsInlineEditor({
  value,
  parentLimits,
  onChange,
  className = '',
}: {
  value: BettingLimitsByGame;
  parentLimits: BettingLimitsByGame;
  onChange: (next: BettingLimitsByGame) => void;
  className?: string;
}): JSX.Element {
  return (
    <div className={`space-y-2 ${className}`}>
      {BETTING_LIMIT_ENABLED_GAMES.map((game) => {
        const parentRank = resolveBettingLimitRange(parentLimits[game.id]).rank;
        const selectedKey = normalizeBettingLimitRangeKey(value[game.id]);
        return (
          <div key={game.id} className="border border-ink-200 bg-white p-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div>
                <div className="font-display text-[13px] text-ink-900">{game.nameZh}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-500">
                  {game.id}
                </div>
              </div>
              <div className="font-mono text-[11px] text-[#186073]">
                {resolveBettingLimitRange(selectedKey).label}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {BETTING_LIMIT_RANGE_OPTIONS.map((option) => {
                const disabled = option.rank > parentRank;
                const active = selectedKey === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        [game.id]: option.key,
                      })
                    }
                    className={`border px-2 py-2 text-left text-[12px] transition ${
                      active
                        ? 'border-[#186073] bg-[#E6F2F4] text-[#186073]'
                        : disabled
                          ? 'cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400'
                          : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
                    }`}
                  >
                    <span className="mr-2 font-mono">{active ? '✓' : '□'}</span>
                    <span className="font-mono">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
