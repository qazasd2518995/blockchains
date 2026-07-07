import { useEffect, useMemo, useState } from 'react';
import {
  BETTING_LIMIT_RANGE_OPTIONS,
  GameId,
  GAMES_REGISTRY,
  SLOT_GAME_IDS,
  isBettingLimitManagedGameId,
  normalizeBettingLimitRangeKey,
  normalizeBettingLimitsByGame,
  resolveBettingLimitRange,
  type BettingLimitRangeKey,
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
  (game) => isBettingLimitManagedGameId(game.id),
);

const CRASH_LIMIT_GAME_IDS = [
  GameId.ROCKET,
  GameId.AVIATOR,
  GameId.SPACE_FLEET,
  GameId.JETX,
  GameId.BALLOON,
  GameId.JETX3,
  GameId.DOUBLE_X,
] as const;

const SLOT_LIMIT_GAME_IDS = SLOT_GAME_IDS;

const INSTANT_LIMIT_GAME_IDS = BETTING_LIMIT_ENABLED_GAMES.map((game) => game.id).filter(
  (gameId) =>
    !(CRASH_LIMIT_GAME_IDS as readonly string[]).includes(gameId) &&
    !(SLOT_LIMIT_GAME_IDS as readonly string[]).includes(gameId),
);

const BETTING_LIMIT_GROUPS = [
  {
    key: 'crash',
    label: '飛行類',
    description: '火箭、飛機、太空艦隊等倍率飛行遊戲',
    gameIds: [...CRASH_LIMIT_GAME_IDS],
  },
  {
    key: 'slots',
    label: '拉霸類',
    description: '9 輪、15 輪、30 輪與 Mega 拉霸',
    gameIds: [...SLOT_LIMIT_GAME_IDS],
  },
  {
    key: 'instant',
    label: '電子即開類',
    description: '骰子、踩地雷、彈珠、輪盤、爬階梯等電子即開遊戲',
    gameIds: INSTANT_LIMIT_GAME_IDS,
  },
] as const;

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
  const labels = BETTING_LIMIT_GROUPS.map((group) => {
    const groupLabels = new Set(
      group.gameIds.map((gameId) => resolveBettingLimitRange(limits[gameId]).label),
    );
    return groupLabels.size === 1 ? Array.from(groupLabels)[0]! : '混合';
  });
  const uniqueLabels = new Set(labels);
  return uniqueLabels.size === 1
    ? Array.from(uniqueLabels)[0]!
    : BETTING_LIMIT_GROUPS.map((group, index) => `${group.label} ${labels[index]}`).join(' / ');
}

function groupSelectedKey(limits: BettingLimitsByGame, gameIds: readonly string[]): string {
  const keys = new Set(gameIds.map((gameId) => normalizeBettingLimitRangeKey(limits[gameId])));
  return keys.size === 1 ? Array.from(keys)[0]! : 'mixed';
}

function groupParentRank(parentLimits: BettingLimitsByGame, gameIds: readonly string[]): number {
  return Math.min(
    ...gameIds.map((gameId) => resolveBettingLimitRange(parentLimits[gameId]).rank),
  );
}

function applyGroupLimit(
  limits: BettingLimitsByGame,
  gameIds: readonly string[],
  rangeKey: BettingLimitRangeKey,
): BettingLimitsByGame {
  return {
    ...limits,
    ...Object.fromEntries(gameIds.map((gameId) => [gameId, rangeKey])),
  };
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
        依遊戲大類選擇限紅範圍；下級代理或會員只能設為上級同等級或以下，超過上級的選項會被鎖定。
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
      {BETTING_LIMIT_GROUPS.map((group) => {
        const parentRank = groupParentRank(parentLimits, group.gameIds);
        const selectedKey = groupSelectedKey(value, group.gameIds);
        return (
          <div key={group.key} className="border border-ink-200 bg-white p-3">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div>
                <div className="font-display text-[13px] text-ink-900">{group.label}</div>
                <div className="mt-1 text-[11px] text-ink-500">{group.description}</div>
              </div>
              <div className="font-mono text-[11px] text-[#186073]">
                {selectedKey === 'mixed' ? '混合' : resolveBettingLimitRange(selectedKey).label}
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
                      onChange(applyGroupLimit(value, group.gameIds, option.key))
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
