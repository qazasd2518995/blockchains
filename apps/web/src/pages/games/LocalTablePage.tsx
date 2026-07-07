import { useEffect, useState, type CSSProperties } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import {
  BLACK_DOT_GAME_IDS,
  GameId,
  MIN_BET_AMOUNT,
  TUI_TONGZI_GAME_IDS,
  TWENTY_ONE_HALF_GAME_IDS,
  type LocalTableBetResult,
  type LocalTableCard,
  type LocalTableDominoTile,
  type LocalTableGameIdType,
  type LocalTableHand,
  type LocalTablePiece,
  type LocalTableRoundState,
  type LocalTableTubeTile,
  type TwentyOneHalfRoundState,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';
import { getLobbyGameCover } from '@/lib/gameCoverAssets';
import { ResponsiveImage } from '@/lib/optimizedImages';

interface LocalTablePageProps {
  gameId: LocalTableGameIdType;
}

interface RoomTheme {
  title: string;
  suffix: string;
  description: string;
  breadcrumb: string;
  accent: string;
  glow: string;
  felt: string;
  mascot: string;
  mascotLabel: string;
  stageArt: string;
}

const ROOM_THEMES: Record<LocalTableGameIdType, RoomTheme> = {
  [GameId.TWENTY_ONE_HALF_DOLL]: roomTheme(
    '萌娃十點半',
    'DOLLY',
    '可愛娃娃牌桌 · JQK 半點 · 接近 10.5 不爆即勝',
    '10H_DOLL',
    '#F472B6',
    '#FDE68A',
    '#5B153E',
    '娃',
    '甜心娃娃',
    '/game-art/local-table/stages/ten-half-stage.webp',
  ),
  [GameId.TWENTY_ONE_HALF_BUNNY]: roomTheme(
    '兔糖十點半',
    'BUNNY',
    '糖果系半點牌桌 · 滿點與五張未爆特別高亮',
    '10H_BUNNY',
    '#FB923C',
    '#F9A8D4',
    '#4A1D2F',
    '兔',
    '糖心娃娃',
    '/game-art/local-table/stages/ten-half-stage.webp',
  ),
  [GameId.TWENTY_ONE_HALF_STAR]: roomTheme(
    '星願十點半',
    'STAR',
    '星光娃娃半點牌桌 · 莊家補到大於閒家或爆牌',
    '10H_STAR',
    '#A78BFA',
    '#FACC15',
    '#25134A',
    '星',
    '星願娃娃',
    '/game-art/local-table/stages/ten-half-stage.webp',
  ),
  [GameId.TUI_TONGZI_DRAGON]: roomTheme(
    '龍門推筒',
    'TONGZI',
    '筒子牌型比點 · 白板對、對子、二八槓、點數',
    'TONGZI_DRAGON',
    '#F97316',
    '#FACC15',
    '#3B1606',
    '龍',
    '龍門牌官',
    '/game-art/local-table/stages/tui-tongzi-stage.webp',
  ),
  [GameId.TUI_TONGZI_LION]: roomTheme(
    '醒獅推筒',
    'TONGZI',
    '醒獅金鼓風格 · 莊閒各兩張，即開比牌',
    'TONGZI_LION',
    '#EF4444',
    '#FDE047',
    '#4B1010',
    '獅',
    '醒獅牌官',
    '/game-art/local-table/stages/tui-tongzi-stage.webp',
  ),
  [GameId.TUI_TONGZI_JADE]: roomTheme(
    '玉兔推筒',
    'TONGZI',
    '玉石仙境風格 · 筒子與白板牌型高亮',
    'TONGZI_JADE',
    '#10B981',
    '#FDE68A',
    '#073B2B',
    '玉',
    '玉兔牌官',
    '/game-art/local-table/stages/tui-tongzi-stage.webp',
  ),
  [GameId.TUI_TONGZI_NEON]: roomTheme(
    '霓虹推筒',
    'TONGZI',
    '夜市霓虹風格 · 快速翻牌比點',
    'TONGZI_NEON',
    '#22D3EE',
    '#F472B6',
    '#092B3A',
    '霓',
    '霓虹牌官',
    '/game-art/local-table/stages/tui-tongzi-stage.webp',
  ),
  [GameId.TUI_TONGZI_GOLD]: roomTheme(
    '金殿推筒',
    'TONGZI',
    '金殿筒子牌桌 · 特殊牌型加強展示',
    'TONGZI_GOLD',
    '#F59E0B',
    '#FDE68A',
    '#3A2604',
    '金',
    '金殿牌官',
    '/game-art/local-table/stages/tui-tongzi-stage.webp',
  ),
  [GameId.BLACK_DOT_TIANJIU]: roomTheme(
    '天九黑粒',
    'BLACK DOT',
    '天九牌四張兩墩 · 高低兩墩皆勝才贏',
    'BLACK_DOT_TK',
    '#38BDF8',
    '#FACC15',
    '#071F35',
    '九',
    '天九牌官',
    '/game-art/local-table/stages/black-dot-stage.webp',
  ),
  [GameId.BLACK_DOT_ROYAL]: roomTheme(
    '御殿黑粒',
    'BLACK DOT',
    '御殿風格黑粒仔 · 對子大於點數',
    'BLACK_DOT_ROYAL',
    '#C084FC',
    '#FDE68A',
    '#26113D',
    '御',
    '御殿牌官',
    '/game-art/local-table/stages/black-dot-stage.webp',
  ),
  [GameId.BLACK_DOT_STREET]: roomTheme(
    '街頭黑粒',
    'BLACK DOT',
    '街頭風格天九牌 · 平點莊吃',
    'BLACK_DOT_STREET',
    '#FB7185',
    '#67E8F9',
    '#33101A',
    '街',
    '街頭牌官',
    '/game-art/local-table/stages/black-dot-stage.webp',
  ),
  [GameId.BLACK_DOT_SHADOW]: roomTheme(
    '影武黑粒',
    'BLACK DOT',
    '影武主題黑粒仔 · 四張分墩公比',
    'BLACK_DOT_SHADOW',
    '#818CF8',
    '#F97316',
    '#141735',
    '影',
    '影武牌官',
    '/game-art/local-table/stages/black-dot-stage.webp',
  ),
  [GameId.BLACK_DOT_GOLD]: roomTheme(
    '金礦黑粒',
    'BLACK DOT',
    '金礦風格天九牌 · 至尊寶最大對',
    'BLACK_DOT_GOLD',
    '#F59E0B',
    '#FACC15',
    '#3A2205',
    '礦',
    '金礦牌官',
    '/game-art/local-table/stages/black-dot-stage.webp',
  ),
  [GameId.CARD_WAR]: roomTheme(
    '王牌比大小',
    'CARD WAR',
    '撲克牌單張比大小 · A 最大 · 平手退回本金',
    'CARD_WAR',
    '#F97316',
    '#38BDF8',
    '#111827',
    'A',
    '王牌荷官',
    '/game-art/local-table/stages/card-war-stage.webp',
  ),
};

const TWENTY_ONE_HALF_PAGE_IDS = new Set<LocalTableGameIdType>([
  ...TWENTY_ONE_HALF_GAME_IDS,
]);
const STAGED_TABLE_PAGE_IDS = new Set<LocalTableGameIdType>([
  ...TUI_TONGZI_GAME_IDS,
  ...BLACK_DOT_GAME_IDS,
  GameId.CARD_WAR,
]);

export function LocalTablePage({ gameId }: LocalTablePageProps) {
  const theme = ROOM_THEMES[gameId];
  const { user, setBalance } = useAuthStore();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const userId = user?.id ?? null;
  const [amount, setAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalTableBetResult | null>(null);
  const [tenHalfState, setTenHalfState] = useState<TwentyOneHalfRoundState | null>(null);
  const [stagedState, setStagedState] = useState<LocalTableRoundState | null>(null);
  const isTwentyOneHalf = TWENTY_ONE_HALF_PAGE_IDS.has(gameId);
  const isStagedTable = STAGED_TABLE_PAGE_IDS.has(gameId);
  const isBlackDot = BLACK_DOT_GAME_IDS.includes(gameId as (typeof BLACK_DOT_GAME_IDS)[number]);
  const displayRound = isTwentyOneHalf ? tenHalfState : isStagedTable ? stagedState : result;
  const extraHands =
    displayRound && 'extraHands' in displayRound ? displayRound.extraHands : undefined;
  const isTenHalfActive = isTwentyOneHalf && tenHalfState?.status === 'ACTIVE';
  const isStagedActive = isStagedTable && stagedState?.status === 'ACTIVE';
  const tableActive = busy || isTenHalfActive || isStagedActive;
  const profitValue = Number(displayRound?.profit ?? 0);
  const isSettledRound = displayRound
    ? isTwentyOneHalf
      ? tenHalfState?.status === 'SETTLED'
      : isStagedTable
        ? stagedState?.status === 'SETTLED'
        : true
    : false;
  const stageToneClass = busy
    ? 'local-table-stage-panel--busy'
    : isSettledRound
      ? profitValue > 0
        ? 'local-table-stage-panel--win'
        : profitValue < 0
          ? 'local-table-stage-panel--loss'
          : 'local-table-stage-panel--push'
      : '';
  const statusLabel = busy
    ? isTwentyOneHalf || isStagedTable
      ? '處理中'
      : '開牌中'
    : isTenHalfActive
      ? '玩家回合'
      : isStagedActive && stagedState
        ? stagedStatusLabel(stagedState)
      : displayRound
        ? (displayRound.outcomeLabel ?? '已結算')
        : isTwentyOneHalf
          ? '等待發牌'
          : isStagedTable
            ? '等待入局'
          : '等待開牌';

  useEffect(() => {
    let cancelled = false;

    if (!isTwentyOneHalf || !userId) {
      setTenHalfState(null);
      return () => {
        cancelled = true;
      };
    }

    api
      .get<{ state: TwentyOneHalfRoundState | null }>('/games/table-games/twenty-one-half/active', {
        params: { gameId },
      })
      .then((res) => {
        if (!cancelled) setTenHalfState(res.data.state);
      })
      .catch(() => {
        if (!cancelled) setTenHalfState(null);
      });

    return () => {
      cancelled = true;
    };
  }, [gameId, isTwentyOneHalf, userId]);

  useEffect(() => {
    let cancelled = false;

    if (!isStagedTable || !userId) {
      setStagedState(null);
      return () => {
        cancelled = true;
      };
    }

    api
      .get<{ state: LocalTableRoundState | null }>('/games/table-games/round/active', {
        params: { gameId },
      })
      .then((res) => {
        if (!cancelled) setStagedState(res.data.state);
      })
      .catch(() => {
        if (!cancelled) setStagedState(null);
      });

    return () => {
      cancelled = true;
    };
  }, [gameId, isStagedTable, userId]);

  const handleBet = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (isTenHalfActive || isStagedActive) return;
    if (amount < MIN_BET_AMOUNT || amount > balance) return;
    setBusy(true);
    setError(null);
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    const previousBalance = isTwentyOneHalf || isStagedTable
      ? null
      : useAuthStore.getState().debitBalance(amount);
    try {
      if (isTwentyOneHalf) {
        const res = await api.post<TwentyOneHalfRoundState>(
          '/games/table-games/twenty-one-half/start',
          {
            gameId,
            amount,
          },
        );
        setResult(null);
        setTenHalfState(res.data);
        setStagedState(null);
        if (res.data.newBalance) setBalance(res.data.newBalance);
        return;
      }

      if (isStagedTable) {
        const res = await api.post<LocalTableRoundState>('/games/table-games/round/start', {
          gameId,
          amount,
        });
        setResult(null);
        setTenHalfState(null);
        setStagedState(res.data);
        if (res.data.newBalance) setBalance(res.data.newBalance);
        return;
      }

      const res = await api.post<LocalTableBetResult>('/games/table-games/bet', {
        gameId,
        amount,
      });
      setResult(res.data);
      setTenHalfState(null);
      setStagedState(null);
      setBalance(res.data.newBalance);
    } catch (err) {
      if (previousBalance) setBalance(previousBalance);
      setError(extractApiError(err).message);
    } finally {
      releaseBalanceRefresh();
      setBusy(false);
    }
  };

  const handleStagedReveal = async () => {
    if (busy || !stagedState || stagedState.status !== 'ACTIVE' || !stagedState.canReveal) return;
    setBusy(true);
    setError(null);
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    try {
      const res = await api.post<LocalTableRoundState>('/games/table-games/round/reveal', {
        roundId: stagedState.roundId,
      });
      setStagedState(res.data);
      if (res.data.newBalance) setBalance(res.data.newBalance);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      releaseBalanceRefresh();
      setBusy(false);
    }
  };

  const handleStagedSplit = async (splitId: string) => {
    if (busy || !stagedState || stagedState.status !== 'ACTIVE' || !stagedState.canSplit) return;
    setBusy(true);
    setError(null);
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    try {
      const res = await api.post<LocalTableRoundState>('/games/table-games/round/split', {
        roundId: stagedState.roundId,
        splitId,
      });
      setStagedState(res.data);
      if (res.data.newBalance) setBalance(res.data.newBalance);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      releaseBalanceRefresh();
      setBusy(false);
    }
  };

  const handleTenHalfAction = async (action: 'hit' | 'stand') => {
    if (busy || !tenHalfState || tenHalfState.status !== 'ACTIVE') return;
    setBusy(true);
    setError(null);
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    try {
      const res = await api.post<TwentyOneHalfRoundState>(
        `/games/table-games/twenty-one-half/${action}`,
        { roundId: tenHalfState.roundId },
      );
      setTenHalfState(res.data);
      if (res.data.newBalance) setBalance(res.data.newBalance);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      releaseBalanceRefresh();
      setBusy(false);
    }
  };

  return (
    <div>
      <GameHeader
        artwork={getLobbyGameCover(gameId)}
        section="§ TABLE"
        breadcrumb={theme.breadcrumb}
        title={theme.title}
        titleSuffix={theme.suffix}
        titleSuffixColor="ember"
        description={theme.description}
        rtpLabel="RTP 95%+"
        rtpAccent="ember"
      />

      <div className="game-play-grid game-play-grid--local-table grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.82fr)]">
        <div className="game-main-stack space-y-4">
          <section
            className={`local-table-stage-panel game-stage-panel scanlines relative overflow-hidden rounded-[22px] border border-white/10 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.24)] ${stageToneClass} ${isBlackDot ? 'local-table-stage-panel--black-dot' : ''}`}
            style={{
              background: `radial-gradient(circle at 18% 10%, ${theme.glow}55, transparent 30%), linear-gradient(135deg, ${theme.felt} 0%, #060B12 100%)`,
            }}
          >
            <ResponsiveImage
              src={theme.stageArt}
              alt=""
              aria-hidden="true"
              preset="game-stage"
              sizes="(min-width: 1024px) 70vw, 100vw"
              loading="eager"
              fetchPriority="high"
              width={941}
              height={1672}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-85"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,10,19,0.18)_0%,rgba(5,10,19,0.42)_42%,rgba(5,10,19,0.82)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.12),transparent_30%),radial-gradient(circle_at_20%_12%,rgba(253,230,138,0.22),transparent_30%)]" />
            <div className="local-table-ambient-light" aria-hidden="true" />
            <div className="local-table-result-burst" aria-hidden="true" />
            {busy ? (
              <div className="local-table-deal-overlay" aria-hidden="true">
                <div className="local-table-deal-card local-table-deal-card--one" />
                <div className="local-table-deal-card local-table-deal-card--two" />
                <div className="local-table-deal-card local-table-deal-card--three" />
                <div className="local-table-deal-chip local-table-deal-chip--one" />
                <div className="local-table-deal-chip local-table-deal-chip--two" />
              </div>
            ) : null}
            <div
              className="pointer-events-none absolute -right-8 -top-10 flex h-44 w-44 items-center justify-center rounded-full border border-white/10 text-[96px] font-black text-white/12"
              aria-hidden="true"
            >
              {theme.mascot}
            </div>
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
                  <Sparkles className="h-4 w-4" style={{ color: theme.glow }} />
                  {theme.mascotLabel}
                </div>
                <h2 key={statusLabel} className="local-table-status-label mt-1 text-[24px] font-black text-white sm:text-[30px]">
                  {statusLabel}
                </h2>
              </div>
              <div className="rounded-[14px] border border-white/12 bg-black/24 px-4 py-2 text-right">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
                  派彩倍率
                </div>
                <div className="data-num text-[22px] font-black text-[#FDE68A]">
                  {formatMultiplier(displayRound?.multiplier ?? 0)}
                </div>
              </div>
            </div>

            {isBlackDot ? (
              <div className="relative z-10 mt-3 sm:mt-4">
                {displayRound ? (
                  <BlackDotBoard
                    round={displayRound as LocalTableBetResult | LocalTableRoundState}
                    busy={busy}
                    active={tableActive}
                  />
                ) : (
                  <BlackDotEmptyBoard busy={busy} />
                )}
              </div>
            ) : (
              <div className="relative z-10 mt-3 grid gap-3 sm:mt-4 sm:gap-4 xl:grid-cols-2">
                {displayRound ? (
                <>
                  <HandPanel hand={displayRound.player} tone="player" active={tableActive} />
                  <HandPanel hand={displayRound.banker} tone="banker" active={tableActive} />
                </>
                ) : (
                <>
                  <EmptyHand title="閒家" busy={busy} />
                  <EmptyHand title="莊家" busy={busy} />
                </>
                )}
              </div>
            )}

            {!isBlackDot && extraHands?.length ? (
              <div className="relative z-10 mt-3 grid gap-3 sm:mt-4 md:grid-cols-2 xl:grid-cols-4">
                {extraHands.map((hand) => (
                  <HandPanel key={hand.title} hand={hand} compact />
                ))}
              </div>
            ) : null}

            <div className="local-table-result-card relative z-10 mt-3 rounded-[18px] border border-white/10 bg-black/24 p-3 sm:mt-4 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45">
                    Result
                  </div>
                  <div className="mt-1 text-[16px] font-bold text-white">
                    {displayRound?.summary ??
                      (isTwentyOneHalf
                        ? '下注後先發一張牌，請選擇補牌或停牌。'
                        : isStagedTable
                          ? stagedEmptySummary(gameId)
                        : '下注後立即開牌，結果會顯示在這裡。')}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-white/45">本局盈虧</div>
                  <div
                    className={`local-table-profit data-num text-[24px] font-black ${
                      profitValue > 0
                        ? 'text-[#86EFAC]'
                        : profitValue < 0
                          ? 'text-[#FCA5A5]'
                          : 'text-white/70'
                    }`}
                  >
                    {displayRound ? formatAmount(displayRound.profit) : '0.00'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <section className="grid gap-3 md:grid-cols-3">
            {(displayRound?.ruleSummary ?? ROOM_THEMES[gameId].description.split(' · ')).map(
              (rule, index) => (
                <div
                  key={`${rule}-${index}`}
                  className="rounded-[16px] border border-[#E5E7EB] bg-white p-4 text-[13px] font-semibold leading-relaxed text-[#243041] shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                >
                  {rule}
                </div>
              ),
            )}
          </section>
        </div>

        <aside className="game-control-stack game-side-stack space-y-4">
          <div className="game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={busy || isTenHalfActive || isStagedActive}
              gameId={gameId}
            />
            {isTwentyOneHalf && tenHalfState?.status === 'ACTIVE' ? (
              <div className="mt-4 rounded-[16px] border border-[#FDE68A]/30 bg-[#FDE68A]/10 p-3">
                <div className="text-[12px] font-bold leading-relaxed text-[#FDE68A]">
                  {tenHalfActionHint(tenHalfState)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTenHalfAction('hit')}
                    disabled={busy || !tenHalfState.canHit}
                    className="local-table-action-button h-12 rounded-[14px] border border-white/12 bg-white/10 text-[15px] font-black text-white transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    補牌
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTenHalfAction('stand')}
                    disabled={busy || !tenHalfState.canStand}
                    className="local-table-action-button h-12 rounded-[14px] border border-[#F59E0B]/45 bg-[#78350F]/55 text-[15px] font-black text-[#FDE68A] transition hover:bg-[#92400E]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    停牌
                  </button>
                </div>
              </div>
            ) : null}
            {isStagedTable && stagedState?.status === 'ACTIVE' ? (
              <div className="mt-4 rounded-[16px] border border-[#93C5FD]/30 bg-[#93C5FD]/10 p-3">
                <div className="text-[12px] font-bold leading-relaxed text-[#BFDBFE]">
                  {stagedActionHint(stagedState)}
                </div>
                {stagedState.canReveal ? (
                  <button
                    type="button"
                    onClick={() => void handleStagedReveal()}
                    disabled={busy}
                    className="local-table-action-button mt-3 h-12 w-full rounded-[14px] border border-[#F59E0B]/45 bg-[#78350F]/55 text-[15px] font-black text-[#FDE68A] transition hover:bg-[#92400E]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/70 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {stagedState.revealLabel ?? '開牌'}
                  </button>
                ) : null}
                {stagedState.canSplit && stagedState.splitOptions?.length ? (
                  <div className="mt-3 grid gap-2">
                    {stagedState.splitOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => void handleStagedSplit(option.id)}
                        disabled={busy}
                        className="local-table-split-option rounded-[14px] border border-white/12 bg-white/10 p-3 text-left text-white transition hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#93C5FD]/70 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <div className="text-[14px] font-black text-[#FDE68A]">
                          {option.label}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold leading-relaxed text-white/60">
                          低墩：{option.low.rankLabel} · 高墩：{option.high.rankLabel}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleBet}
              disabled={busy || isTenHalfActive || isStagedActive || amount < MIN_BET_AMOUNT || amount > balance}
              className="local-table-main-button mt-4 inline-flex h-14 w-full items-center justify-center rounded-[14px] bg-[#EA580C] text-[16px] font-black text-white shadow-[0_12px_28px_rgba(234,88,12,0.28)] transition hover:bg-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/75 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy
                ? isTwentyOneHalf || isStagedTable
                  ? '處理中'
                  : '開牌中'
                : isTenHalfActive || isStagedActive
                  ? '牌局進行中'
                  : isTwentyOneHalf
                    ? tenHalfState?.status === 'SETTLED'
                      ? '下一局發牌'
                      : '下注發牌'
                    : isStagedTable
                      ? stagedState?.status === 'SETTLED'
                        ? '下一局入局'
                        : '下注入局'
                    : '下注開牌'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function tenHalfActionHint(state: TwentyOneHalfRoundState): string {
  if (state.forcedAction === 'hit') return '4 點以下必須補牌，補到可停牌區間後才能停牌。';
  if (state.forcedAction === 'stand') return '8 點以上必須停牌，系統會立即進入莊家補牌。';
  return '可選擇補牌或停牌；超過 10 點半爆牌，平點莊家勝。';
}

function stagedStatusLabel(state: LocalTableRoundState): string {
  if (state.stage === 'AWAIT_SPLIT') return '玩家擺牌';
  if (state.stage === 'AWAIT_FIRST_REVEAL') return '等待開第一張';
  if (state.stage === 'AWAIT_FINAL_REVEAL') return '等待開第二張';
  if (state.stage === 'AWAIT_PLAYER_REVEAL') return '等待開閒家牌';
  if (state.stage === 'AWAIT_BANKER_REVEAL') return '等待開莊家牌';
  return state.outcomeLabel ?? '已結算';
}

function stagedActionHint(state: LocalTableRoundState): string {
  if (state.stage === 'AWAIT_SPLIT') return '請選一組高低墩；高低兩墩都大於莊家才算勝。';
  if (state.stage === 'AWAIT_FIRST_REVEAL') return '先開莊閒第一張筒子，第二張會保留到下一步比牌。';
  if (state.stage === 'AWAIT_FINAL_REVEAL') return '開第二張後立即依牌型與點數結算。';
  if (state.stage === 'AWAIT_PLAYER_REVEAL') return '先開閒家牌，再開莊家牌比大小。';
  if (state.stage === 'AWAIT_BANKER_REVEAL') return '閒家牌已開，開莊家牌後立即結算。';
  return '牌局已結算。';
}

function stagedEmptySummary(gameId: LocalTableGameIdType): string {
  if (TUI_TONGZI_GAME_IDS.includes(gameId as (typeof TUI_TONGZI_GAME_IDS)[number])) {
    return '下注後先開第一張筒子，再開第二張比牌。';
  }
  if (BLACK_DOT_GAME_IDS.includes(gameId as (typeof BLACK_DOT_GAME_IDS)[number])) {
    return '下注後取得四張天九牌，請自行選擇高低兩墩。';
  }
  return '下注後先開閒家牌，再開莊家牌比大小。';
}

function roomTheme(
  title: string,
  suffix: string,
  description: string,
  breadcrumb: string,
  accent: string,
  glow: string,
  felt: string,
  mascot: string,
  mascotLabel: string,
  stageArt: string,
): RoomTheme {
  return {
    title,
    suffix,
    description,
    breadcrumb,
    accent,
    glow,
    felt,
    mascot,
    mascotLabel,
    stageArt,
  };
}

function BlackDotBoard({
  round,
  busy,
  active,
}: {
  round: LocalTableBetResult | LocalTableRoundState;
  busy: boolean;
  active: boolean;
}) {
  const pairs = getBlackDotPairs(round.extraHands);
  const hasSplitHands = Boolean(
    pairs.playerHigh || pairs.playerLow || pairs.bankerHigh || pairs.bankerLow,
  );

  return (
    <div
      className={`black-dot-table ${hasSplitHands ? 'black-dot-table--split' : 'black-dot-table--pending'} ${active ? 'black-dot-table--active' : ''}`}
    >
      <div className="black-dot-table__halo" aria-hidden="true" />
      <div className="black-dot-table__scorebar">
        <BlackDotScorePill label="閒家" hand={round.player} tone="player" />
        <div className="black-dot-table__versus" aria-hidden="true">VS</div>
        <BlackDotScorePill label="莊家" hand={round.banker} tone="banker" />
      </div>

      {hasSplitHands ? (
        <div className="black-dot-table__seats">
          <BlackDotSeat
            label="閒家"
            summary={round.player.detail ?? '玩家擺牌'}
            high={pairs.playerHigh}
            low={pairs.playerLow}
            tone="player"
          />
          <BlackDotSeat
            label="莊家"
            summary={round.banker.detail ?? '莊家最佳擺牌'}
            high={pairs.bankerHigh}
            low={pairs.bankerLow}
            tone="banker"
          />
        </div>
      ) : (
        <div className="black-dot-table__pending">
          <BlackDotRack
            title="閒家四張"
            subtitle={round.player.rankLabel}
            hand={round.player}
            tone="player"
            active={active}
          />
          <BlackDotRack
            title="莊家暗牌"
            subtitle={round.banker.rankLabel}
            hand={round.banker}
            tone="banker"
            active={busy}
            hidden={!round.banker.pieces.length}
          />
        </div>
      )}
    </div>
  );
}

function BlackDotEmptyBoard({ busy }: { busy: boolean }) {
  return (
    <div className={`black-dot-table black-dot-table--empty ${busy ? 'black-dot-table--active' : ''}`}>
      <div className="black-dot-table__halo" aria-hidden="true" />
      <div className="black-dot-table__scorebar">
        <div className="black-dot-score-pill black-dot-score-pill--player">
          <span>閒家</span>
          <strong>等待入局</strong>
        </div>
        <div className="black-dot-table__versus" aria-hidden="true">VS</div>
        <div className="black-dot-score-pill black-dot-score-pill--banker">
          <span>莊家</span>
          <strong>暗牌待開</strong>
        </div>
      </div>
      <div className="black-dot-table__pending">
        <BlackDotRack title="閒家四張" subtitle="下注後發牌" hand={null} tone="player" active={busy} />
        <BlackDotRack title="莊家暗牌" subtitle="擺牌後開牌" hand={null} tone="banker" active={busy} hidden />
      </div>
    </div>
  );
}

function BlackDotScorePill({
  label,
  hand,
  tone,
}: {
  label: string;
  hand: LocalTableHand;
  tone: 'player' | 'banker';
}) {
  return (
    <div className={`black-dot-score-pill black-dot-score-pill--${tone}`}>
      <span>{label}</span>
      <strong>{hand.scoreLabel}</strong>
      <em>{hand.rankLabel}</em>
    </div>
  );
}

function BlackDotSeat({
  label,
  summary,
  high,
  low,
  tone,
}: {
  label: string;
  summary: string;
  high?: LocalTableHand;
  low?: LocalTableHand;
  tone: 'player' | 'banker';
}) {
  return (
    <section className={`black-dot-seat black-dot-seat--${tone}`}>
      <div className="black-dot-seat__header">
        <div>
          <span>{label}</span>
          <strong>{summary}</strong>
        </div>
      </div>
      <div className="black-dot-seat__mounds">
        <BlackDotMound title="高墩" hand={high} tone={tone} />
        <BlackDotMound title="低墩" hand={low} tone={tone} />
      </div>
    </section>
  );
}

function BlackDotMound({
  title,
  hand,
  tone,
}: {
  title: string;
  hand?: LocalTableHand;
  tone: 'player' | 'banker';
}) {
  return (
    <div className="black-dot-mound">
      <div className="black-dot-mound__header">
        <span>{title}</span>
        <strong>{hand?.scoreLabel ?? '--'}</strong>
        <em>{hand?.rankLabel ?? '待開'}</em>
      </div>
      <div className="black-dot-mound__tiles">
        {hand?.pieces.length ? (
          hand.pieces.map((piece, index) => (
            <PieceView key={pieceKey(piece, index)} piece={piece} index={index} tone={tone} />
          ))
        ) : (
          <>
            <BlackDotTileBack active={false} />
            <BlackDotTileBack active={false} />
          </>
        )}
      </div>
    </div>
  );
}

function BlackDotRack({
  title,
  subtitle,
  hand,
  tone,
  active,
  hidden = false,
}: {
  title: string;
  subtitle: string;
  hand: LocalTableHand | null;
  tone: 'player' | 'banker';
  active: boolean;
  hidden?: boolean;
}) {
  const pieces = hidden ? [] : (hand?.pieces ?? []);

  return (
    <section className={`black-dot-rack black-dot-rack--${tone}`}>
      <div className="black-dot-rack__copy">
        <span>{title}</span>
        <strong>{hand?.scoreLabel ?? subtitle}</strong>
        <em>{subtitle}</em>
      </div>
      <div className="black-dot-rack__tiles">
        {pieces.length ? (
          pieces.map((piece, index) => (
            <PieceView key={pieceKey(piece, index)} piece={piece} index={index} tone={tone} />
          ))
        ) : (
          Array.from({ length: 4 }, (_, index) => (
            <BlackDotTileBack key={index} active={active} />
          ))
        )}
      </div>
    </section>
  );
}

function BlackDotTileBack({ active }: { active: boolean }) {
  return <div className={`black-dot-tile-back ${active ? 'black-dot-tile-back--active' : ''}`} />;
}

function getBlackDotPairs(extraHands?: LocalTableHand[]) {
  const findHand = (owner: '閒家' | '莊家', mound: '高墩' | '低墩') =>
    extraHands?.find((hand) => hand.title.includes(owner) && hand.title.includes(mound));

  return {
    playerHigh: findHand('閒家', '高墩'),
    playerLow: findHand('閒家', '低墩'),
    bankerHigh: findHand('莊家', '高墩'),
    bankerLow: findHand('莊家', '低墩'),
  };
}

function HandPanel({
  hand,
  tone = 'neutral',
  compact = false,
  active = false,
}: {
  hand: LocalTableHand;
  tone?: 'player' | 'banker' | 'neutral';
  compact?: boolean;
  active?: boolean;
}) {
  const pieceColumns = compact
    ? 'grid-cols-2'
    : hand.pieces.length >= 4
      ? 'grid-cols-4'
      : hand.pieces.length >= 3
        ? 'grid-cols-3'
        : hand.pieces.length === 1
          ? 'grid-cols-1'
          : 'grid-cols-2';
  const border =
    tone === 'player'
      ? 'border-[#FDE68A]/35 bg-[#FDE68A]/[0.08]'
      : tone === 'banker'
        ? 'border-[#93C5FD]/25 bg-[#93C5FD]/[0.06]'
        : 'border-white/10 bg-white/[0.045]';

  return (
    <div className={`local-table-hand-panel ${active ? 'local-table-hand-panel--active' : ''} rounded-[18px] border ${border} bg-black/25 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_34px_rgba(0,0,0,0.22)] backdrop-blur-sm sm:p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-black uppercase tracking-[0.16em] text-white/55">
            {hand.title}
          </div>
          <div className="mt-1 text-[22px] font-black text-white">{hand.scoreLabel}</div>
        </div>
        <div className="rounded-[10px] border border-white/10 bg-black/20 px-3 py-1.5 text-right">
          <div className="max-w-[140px] truncate text-[12px] font-black text-[#FDE68A]">
            {hand.rankLabel}
          </div>
        </div>
      </div>

      <div className={`mt-3 grid gap-2 sm:mt-4 ${pieceColumns}`}>
        {hand.pieces.length ? (
          hand.pieces.map((piece, index) => (
            <PieceView key={pieceKey(piece, index)} piece={piece} index={index} tone={tone} />
          ))
        ) : (
          <>
            <div className="h-20 rounded-[14px] border border-dashed border-white/22 bg-black/24 sm:h-32" />
            <div className="h-20 rounded-[14px] border border-dashed border-white/22 bg-black/24 sm:h-32" />
          </>
        )}
      </div>
      {hand.detail ? <div className="mt-3 text-[12px] text-white/50">{hand.detail}</div> : null}
    </div>
  );
}

function EmptyHand({ title, busy }: { title: string; busy: boolean }) {
  return (
    <div className="rounded-[18px] border border-white/12 bg-black/24 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_34px_rgba(0,0,0,0.2)] backdrop-blur-sm sm:p-4">
      <div className="text-[12px] font-black uppercase tracking-[0.16em] text-white/55">
        {title}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={`local-table-card-slot h-20 rounded-[14px] border border-dashed border-white/22 bg-black/24 sm:h-32 ${busy ? 'local-table-card-slot--dealing' : ''}`} />
        <div className={`local-table-card-slot h-20 rounded-[14px] border border-dashed border-white/22 bg-black/24 sm:h-32 ${busy ? 'local-table-card-slot--dealing' : ''}`} />
      </div>
    </div>
  );
}

function PieceView({
  piece,
  index,
  tone,
}: {
  piece: LocalTablePiece;
  index: number;
  tone: 'player' | 'banker' | 'neutral';
}) {
  const dealClass =
    tone === 'player'
      ? 'local-table-piece-shell--player'
      : tone === 'banker'
        ? 'local-table-piece-shell--banker'
        : 'local-table-piece-shell--neutral';
  return (
    <div
      className={`local-table-piece-shell ${dealClass}`}
      style={{ '--local-table-piece-index': index } as CSSProperties}
    >
      <div className="local-table-piece-flipper">
        <div className="local-table-piece-back" aria-hidden="true" />
        <div className="local-table-piece-face">
          {piece.kind === 'card' ? (
            <CardPiece card={piece} />
          ) : piece.kind === 'tube' ? (
            <TubePiece tile={piece} />
          ) : (
            <DominoPiece tile={piece} />
          )}
        </div>
      </div>
    </div>
  );
}

function pieceKey(piece: LocalTablePiece, index: number): string {
  if (piece.kind === 'card') return `${piece.kind}-${piece.rank}-${piece.suit}-${index}`;
  if (piece.kind === 'tube') return `${piece.kind}-${piece.id}`;
  return `${piece.kind}-${piece.id}`;
}

function CardPiece({ card }: { card: LocalTableCard }) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds';
  return (
    <div className="relative flex h-20 min-w-0 flex-col justify-between overflow-hidden rounded-[14px] border border-white/90 bg-[linear-gradient(145deg,#FFFFFF_0%,#FFF7E6_100%)] p-2 shadow-[0_14px_30px_rgba(0,0,0,0.32)] sm:h-32 sm:p-3">
      <div className="pointer-events-none absolute inset-0 rounded-[14px] border border-[#F8D57B]/40" />
      <div className={`text-[18px] font-black sm:text-[20px] ${red ? 'text-[#DC2626]' : 'text-[#0F172A]'}`}>
        {card.rank}
      </div>
      <div className={`self-center text-[24px] sm:text-[34px] ${red ? 'text-[#DC2626]' : 'text-[#0F172A]'}`}>
        {suitSymbol(card.suit)}
      </div>
      <div className="data-num text-right text-[11px] font-black text-[#64748B]">
        {card.valueLabel}
      </div>
    </div>
  );
}

function TubePiece({ tile }: { tile: LocalTableTubeTile }) {
  const imageSrc = `/game-art/mahjong/Pin${tile.value}.svg`;
  return (
    <div className={`local-table-tube-piece ${tile.isWhite ? 'local-table-tube-piece--white' : ''} relative flex h-20 min-w-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#FDE68A]/55 bg-[linear-gradient(145deg,#FFFBEA_0%,#F7E2A0_44%,#D6A83F_100%)] p-1.5 text-[#422006] shadow-[0_14px_30px_rgba(0,0,0,0.32)] sm:h-32 sm:p-2`}>
      <div className="absolute inset-1 rounded-[12px] border border-[#7C2D12]/10 bg-white/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]" />
      {tile.isWhite ? (
        <div className="local-table-white-tile-mark" aria-label={tile.label}>
          <span className="local-table-white-tile-mark__corner">白</span>
          <span className="local-table-white-tile-mark__frame" aria-hidden="true" />
          <span className="local-table-white-tile-mark__label">白板</span>
        </div>
      ) : (
        <img
          src={imageSrc}
          alt={tile.label}
          width={96}
          height={120}
          decoding="async"
          className="relative z-10 h-[88%] w-[88%] object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.16)]"
        />
      )}
      <div className="absolute bottom-1 right-2 z-10 data-num text-[10px] font-black text-[#7C2D12]/70">
        {tile.isWhite ? '白' : tile.value}
      </div>
    </div>
  );
}

function DominoPiece({ tile }: { tile: LocalTableDominoTile }) {
  return (
    <div className="local-table-domino-piece flex h-20 min-w-0 flex-col overflow-hidden rounded-[14px] border border-white/12 bg-[#101827] shadow-[0_12px_24px_rgba(0,0,0,0.22)] sm:h-32">
      <div className="flex flex-1 items-center justify-center border-b border-white/10">
        <DotGrid count={tile.pips[0]} />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <DotGrid count={tile.pips[1]} />
      </div>
      <div className="truncate bg-black/30 px-1.5 py-1 text-center text-[10px] font-black text-[#FDE68A]">
        {tile.name}
      </div>
    </div>
  );
}

const DOMINO_DOT_POSITIONS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DotGrid({ count }: { count: number }) {
  const visibleDots = new Set(DOMINO_DOT_POSITIONS[count] ?? DOMINO_DOT_POSITIONS[1]);

  return (
    <div className="local-table-domino-dot-grid">
      {Array.from({ length: 9 }, (_, index) => {
        const visible = visibleDots.has(index);
        const red = visible && (count === 1 || count === 4);

        return (
        <span
          key={index}
            className={`local-table-domino-pip ${visible ? 'local-table-domino-pip--visible' : ''} ${red ? 'local-table-domino-pip--red' : ''}`}
        />
        );
      })}
    </div>
  );
}

function suitSymbol(suit: LocalTableCard['suit']): string {
  if (suit === 'spades') return '♠';
  if (suit === 'hearts') return '♥';
  if (suit === 'diamonds') return '♦';
  return '♣';
}
