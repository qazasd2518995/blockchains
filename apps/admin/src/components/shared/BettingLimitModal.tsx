import { useEffect, useMemo, useState } from 'react';
import {
  BETTING_LIMIT_RANGE_OPTIONS,
  GameId,
  GAMES_REGISTRY,
  SLOT_GAME_IDS,
  bettingLimitRangesAtOrBelow,
  isBettingLimitManagedGameId,
  isBettingLimitOptionAllowed,
  normalizeBettingLimitOptionsByGame,
  normalizeBettingLimitRangeKey,
  normalizeBettingLimitsByGame,
  resolveBettingLimitRange,
  type BettingLimitOptionsByGame,
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
  currentLimits?: Record<string, string | string[]>;
  parentLevel?: string;
  parentLimits?: Record<string, string | string[]>;
  onDone: () => void;
}

export const BETTING_LIMIT_ENABLED_GAMES = Object.values(GAMES_REGISTRY).filter((game) =>
  isBettingLimitManagedGameId(game.id),
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

const RANGE_ORDER = new Map(
  BETTING_LIMIT_RANGE_OPTIONS.map((option, index) => [option.key, index] as const),
);

export function buildBettingLimitsSelection(
  limits: unknown,
  fallbackLevel: unknown,
  allowedOptions?: BettingLimitOptionsByGame,
): BettingLimitsByGame {
  const normalized = normalizeBettingLimitsByGame(limits);
  const fallback = normalizeBettingLimitRangeKey(fallbackLevel);
  return Object.fromEntries(
    BETTING_LIMIT_ENABLED_GAMES.map((game) => {
      const allowed = allowedOptions?.[game.id] ?? [];
      const candidate = normalized[game.id] ?? fallback;
      const selected =
        allowed.length === 0 || isBettingLimitOptionAllowed(candidate, allowed)
          ? candidate
          : (allowed[0] ?? fallback);
      return [game.id, selected];
    }),
  );
}

export function buildAgentBettingLimitOptionsSelection(
  limits: unknown,
  fallbackLevel: unknown,
  parentOptions?: BettingLimitOptionsByGame,
): BettingLimitOptionsByGame {
  const normalized = normalizeBettingLimitOptionsByGame(limits);
  const fallback = bettingLimitRangesAtOrBelow(fallbackLevel);
  return Object.fromEntries(
    BETTING_LIMIT_ENABLED_GAMES.map((game) => {
      const normalizedForGame = normalized[game.id];
      const requested =
        normalizedForGame && normalizedForGame.length > 0 ? normalizedForGame : fallback;
      const parent = parentOptions?.[game.id];
      const selected = parent?.length
        ? requested.filter((range) => isBettingLimitOptionAllowed(range, parent))
        : requested;
      return [
        game.id,
        selected.length > 0 ? sortRangeKeys(selected) : sortRangeKeys(parent ?? fallback),
      ];
    }),
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

export function summarizeAgentBettingLimitOptions(limits: BettingLimitOptionsByGame): string {
  const summaries = BETTING_LIMIT_GROUPS.map((group) => {
    const signatures = new Set(
      group.gameIds.map((gameId) => sortRangeKeys(limits[gameId] ?? []).join('|')),
    );
    if (signatures.size !== 1) return `${group.label} 混合`;
    const keys = Array.from(signatures)[0]?.split('|').filter(Boolean) ?? [];
    return `${group.label} ${keys.length} 種`;
  });
  return summaries.join(' / ');
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
    () => buildAgentBettingLimitOptionsSelection(parentLimits, parentLevel ?? 'range_5000_50000'),
    [parentLimits, parentLevel],
  );
  const [agentSelected, setAgentSelected] = useState<BettingLimitOptionsByGame>(() =>
    buildAgentBettingLimitOptionsSelection(currentLimits, currentLevel, parentResolved),
  );
  const [memberSelected, setMemberSelected] = useState<BettingLimitsByGame>(() =>
    buildBettingLimitsSelection(currentLimits, currentLevel, parentResolved),
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAgentSelected(
      buildAgentBettingLimitOptionsSelection(currentLimits, currentLevel, parentResolved),
    );
    setMemberSelected(buildBettingLimitsSelection(currentLimits, currentLevel, parentResolved));
    setErr(null);
  }, [open, currentLimits, currentLevel, parentResolved]);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    try {
      const path =
        targetType === 'agent'
          ? `/agents/${targetId}/betting-limit`
          : `/members/${targetId}/betting-limit`;
      await adminApi.patch(path, {
        bettingLimits: targetType === 'agent' ? agentSelected : memberSelected,
      });
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
        {targetType === 'agent'
          ? '可為代理複選多個限紅方案；該代理建立會員時，只能從這些授權方案中選擇一種。'
          : '每個遊戲只能選擇一種限紅，且只能使用所屬代理已授權的方案。'}
      </div>

      {targetType === 'agent' ? (
        <AgentBettingLimitOptionsInlineEditor
          value={agentSelected}
          parentOptions={parentResolved}
          onChange={setAgentSelected}
          className="max-h-[62vh] overflow-y-auto overscroll-contain pr-1"
        />
      ) : (
        <BettingLimitsInlineEditor
          value={memberSelected}
          parentOptions={parentResolved}
          onChange={setMemberSelected}
          className="max-h-[62vh] overflow-y-auto overscroll-contain pr-1"
        />
      )}

      {err ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]"
        >
          {err}
        </div>
      ) : null}

      <div className="mt-5 flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy} className="btn-acid">
          {busy ? '保存中…' : '保存限紅'}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className="btn-teal-outline">
          取消
        </button>
      </div>
    </Modal>
  );
}

export function AgentBettingLimitOptionsInlineEditor({
  value,
  parentOptions,
  onChange,
  className = '',
}: {
  value: BettingLimitOptionsByGame;
  parentOptions: BettingLimitOptionsByGame;
  onChange: (next: BettingLimitOptionsByGame) => void;
  className?: string;
}): JSX.Element {
  return (
    <div className={`space-y-2 ${className}`}>
      {BETTING_LIMIT_GROUPS.map((group) => {
        const groupKeys = sharedGroupOptionKeys(value, group.gameIds);
        return (
          <LimitGroup key={group.key} label={group.label} description={group.description}>
            <div className="mb-2 font-mono text-[11px] text-[#186073]">
              {groupKeys === null ? '各遊戲設定不同' : `已選 ${groupKeys.length} 種`}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {BETTING_LIMIT_RANGE_OPTIONS.map((option) => {
                const parentAllows = group.gameIds.every((gameId) =>
                  isBettingLimitOptionAllowed(option.key, parentOptions[gameId] ?? []),
                );
                const active = group.gameIds.every((gameId) =>
                  isBettingLimitOptionAllowed(option.key, value[gameId] ?? []),
                );
                const canRemove = group.gameIds.every((gameId) => (value[gameId]?.length ?? 0) > 1);
                const disabled = !parentAllows || (active && !canRemove);
                return (
                  <LimitOptionButton
                    key={option.key}
                    label={option.label}
                    active={active}
                    disabled={disabled}
                    onClick={() =>
                      onChange(applyGroupAgentOption(value, group.gameIds, option.key, !active))
                    }
                  />
                );
              })}
            </div>
          </LimitGroup>
        );
      })}
    </div>
  );
}

export function BettingLimitsInlineEditor({
  value,
  parentOptions,
  onChange,
  className = '',
}: {
  value: BettingLimitsByGame;
  parentOptions: BettingLimitOptionsByGame;
  onChange: (next: BettingLimitsByGame) => void;
  className?: string;
}): JSX.Element {
  return (
    <div className={`space-y-2 ${className}`}>
      {BETTING_LIMIT_GROUPS.map((group) => {
        const selectedKey = groupSelectedKey(value, group.gameIds);
        return (
          <LimitGroup key={group.key} label={group.label} description={group.description}>
            <div className="mb-2 font-mono text-[11px] text-[#186073]">
              {selectedKey === 'mixed'
                ? '各遊戲設定不同'
                : resolveBettingLimitRange(selectedKey).label}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {BETTING_LIMIT_RANGE_OPTIONS.map((option) => {
                const disabled = group.gameIds.some(
                  (gameId) => !isBettingLimitOptionAllowed(option.key, parentOptions[gameId] ?? []),
                );
                return (
                  <LimitOptionButton
                    key={option.key}
                    label={option.label}
                    active={selectedKey === option.key}
                    disabled={disabled}
                    onClick={() => onChange(applyGroupLimit(value, group.gameIds, option.key))}
                  />
                );
              })}
            </div>
          </LimitGroup>
        );
      })}
    </div>
  );
}

function LimitGroup({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <fieldset className="border border-ink-200 bg-white p-3">
      <legend className="sr-only">{label}</legend>
      <div className="mb-2">
        <div className="font-display text-[13px] text-ink-900">{label}</div>
        <div className="mt-1 text-[11px] text-ink-500">{description}</div>
      </div>
      {children}
    </fieldset>
  );
}

function LimitOptionButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={`border px-2 py-2 text-left text-[12px] transition-colors ${
        active
          ? 'border-[#186073] bg-[#E6F2F4] text-[#186073]'
          : disabled
            ? 'cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400'
            : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400'
      }`}
    >
      <span className="mr-2 font-mono">{active ? '✓' : '□'}</span>
      <span className="font-mono">{label}</span>
    </button>
  );
}

function groupSelectedKey(limits: BettingLimitsByGame, gameIds: readonly string[]): string {
  const keys = new Set(gameIds.map((gameId) => normalizeBettingLimitRangeKey(limits[gameId])));
  return keys.size === 1 ? Array.from(keys)[0]! : 'mixed';
}

function sharedGroupOptionKeys(
  limits: BettingLimitOptionsByGame,
  gameIds: readonly string[],
): BettingLimitRangeKey[] | null {
  const signatures = new Set(
    gameIds.map((gameId) => sortRangeKeys(limits[gameId] ?? []).join('|')),
  );
  if (signatures.size !== 1) return null;
  return (Array.from(signatures)[0]?.split('|').filter(Boolean) ?? []) as BettingLimitRangeKey[];
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

function applyGroupAgentOption(
  limits: BettingLimitOptionsByGame,
  gameIds: readonly string[],
  rangeKey: BettingLimitRangeKey,
  enabled: boolean,
): BettingLimitOptionsByGame {
  return {
    ...limits,
    ...Object.fromEntries(
      gameIds.map((gameId) => {
        const next = new Set(limits[gameId] ?? []);
        if (enabled) next.add(rangeKey);
        else if (next.size > 1) next.delete(rangeKey);
        return [gameId, sortRangeKeys(Array.from(next))];
      }),
    ),
  };
}

function sortRangeKeys(ranges: readonly BettingLimitRangeKey[]): BettingLimitRangeKey[] {
  return Array.from(new Set(ranges)).sort(
    (left, right) => (RANGE_ORDER.get(left) ?? 0) - (RANGE_ORDER.get(right) ?? 0),
  );
}
