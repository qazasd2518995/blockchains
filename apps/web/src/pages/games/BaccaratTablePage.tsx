import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { Sfx } from '@bg/game-engine';
import {
  GameId,
  MIN_BET_AMOUNT,
  type BaccaratTableBetRequest,
  type BaccaratTableBetResult,
  type BaccaratTableBetSide,
  type BaccaratTableCard,
  type BaccaratTableGameIdType,
  type BaccaratTableHand,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { ResponsiveImage } from '@/lib/optimizedImages';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';
import { useAuthStore } from '@/stores/authStore';

interface BaccaratTablePageProps {
  gameId: BaccaratTableGameIdType;
}

interface BaccaratTheme {
  title: string;
  suffix: string;
  description: string;
  breadcrumb: string;
  dealerLabel: string;
  cover: string;
  accent: string;
  secondary: string;
  felt: string;
}

const BACCARAT_THEMES: Record<BaccaratTableGameIdType, BaccaratTheme> = {
  [GameId.BACCARAT_DRAGON]: theme(
    '龍姬百家',
    'DRAGON',
    '標準百家樂 · 閒莊和三門下注 · 莊勝 5% commission',
    'BACCARAT_DRAGON',
    '龍姬牌官',
    '/game-art/baccarat-table/dragon-cover.webp',
    '#F59E0B',
    '#EF4444',
    '#3B0A0A',
  ),
  [GameId.BACCARAT_PANDA]: theme(
    '熊貓百家',
    'PANDA',
    '標準百家樂 · 玉殿熊貓主題 · 閒莊遇和退回本金',
    'BACCARAT_PANDA',
    '熊貓牌官',
    '/game-art/baccarat-table/panda-cover.webp',
    '#34D399',
    '#FDE68A',
    '#063B2C',
  ),
  [GameId.BACCARAT_FOX]: theme(
    '狐姬百家',
    'FOX',
    '標準百家樂 · 月夜狐姬牌桌 · Natural 8/9 停牌',
    'BACCARAT_FOX',
    '狐姬牌官',
    '/game-art/baccarat-table/fox-cover.webp',
    '#FCA5A5',
    '#FDE68A',
    '#3D1324',
  ),
  [GameId.BACCARAT_TIGER]: theme(
    '虎爵百家',
    'TIGER',
    '標準百家樂 · 黑金虎爵主題 · 和局 8:1 淨利',
    'BACCARAT_TIGER',
    '虎爵牌官',
    '/game-art/baccarat-table/tiger-cover.webp',
    '#F59E0B',
    '#FDBA74',
    '#0F0B08',
  ),
  [GameId.BACCARAT_PHOENIX]: theme(
    '鳳凰百家',
    'PHOENIX',
    '標準百家樂 · 藍金鳳凰牌桌 · 依正式補牌表結算',
    'BACCARAT_PHOENIX',
    '鳳凰牌官',
    '/game-art/baccarat-table/phoenix-cover.webp',
    '#F97316',
    '#60A5FA',
    '#06142F',
  ),
};

const BET_OPTIONS: Array<{
  side: BaccaratTableBetSide;
  title: string;
  payout: string;
  hint: string;
}> = [
  { side: 'player', title: '閒家', payout: '1:1', hint: '閒勝派彩 2.00x，遇和退回本金' },
  { side: 'banker', title: '莊家', payout: '0.95:1', hint: '莊勝扣 5% commission，派彩 1.95x' },
  { side: 'tie', title: '和', payout: '8:1', hint: '閒莊同點派彩 9.00x' },
];

const BET_CONTROL_ORDER: BaccaratTableBetSide[] = ['player', 'tie', 'banker'];
const BET_CONTROL_OPTIONS = BET_CONTROL_ORDER.map(
  (side) => BET_OPTIONS.find((option) => option.side === side)!,
);

const BACCARAT_REVEAL_INITIAL_DELAY_MS = 280;
const BACCARAT_REVEAL_STEP_MS = 760;
const BACCARAT_REVEAL_THIRD_CARD_PAUSE_MS = 1180;
const BACCARAT_REVEAL_SETTLE_MS = 520;
const INITIAL_REVEAL_STATE: BaccaratRevealState = { player: 0, banker: 0, complete: false };

const CARD_FILE_RANKS = [
  'ace',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'jack',
  'queen',
  'king',
] as const;
const CARD_FILE_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

interface BaccaratRevealState {
  player: number;
  banker: number;
  complete: boolean;
}

interface BaccaratRevealStep extends BaccaratRevealState {
  isThirdCard?: boolean;
}

export function BaccaratTablePage({ gameId }: BaccaratTablePageProps) {
  const themeConfig = BACCARAT_THEMES[gameId];
  const { user, setBalance } = useAuthStore();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(100);
  const [side, setSide] = useState<BaccaratTableBetSide>('player');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BaccaratTableBetResult | null>(null);
  const [revealState, setRevealState] = useState<BaccaratRevealState>(INITIAL_REVEAL_STATE);
  const revealRunRef = useRef(0);
  const revealComplete = Boolean(result && revealState.complete);
  const playerHand = result ? visibleBaccaratHand(result.player, revealState.player) : null;
  const bankerHand = result ? visibleBaccaratHand(result.banker, revealState.banker) : null;
  const profitValue = revealComplete ? Number(result?.profit ?? 0) : 0;
  const statusLabel = revealComplete && result ? result.outcomeLabel : busy ? '逐張開牌' : '等待下注';
  const selectedOption = BET_OPTIONS.find((option) => option.side === side) ?? BET_OPTIONS[0]!;

  useEffect(() => {
    Sfx.preloadTableGames();
  }, []);

  useEffect(
    () => () => {
      revealRunRef.current += 1;
    },
    [],
  );

  const handleBet = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount < MIN_BET_AMOUNT || amount > balance) return;

    Sfx.unlock();
    Sfx.tick();
    setBusy(true);
    setError(null);
    setResult(null);
    setRevealState(INITIAL_REVEAL_STATE);
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    const previousBalance = useAuthStore.getState().debitBalance(amount);

    try {
      const payload: BaccaratTableBetRequest = { gameId, amount, side };
      const res = await api.post<BaccaratTableBetResult>('/games/baccarat/bet', payload);
      setResult(res.data);
      await revealBaccaratRound(res.data, revealRunRef, setRevealState);
      setBalance(res.data.newBalance);
    } catch (err) {
      if (previousBalance) setBalance(previousBalance);
      setResult(null);
      setRevealState(INITIAL_REVEAL_STATE);
      setError(extractApiError(err).message);
    } finally {
      releaseBalanceRefresh();
      setBusy(false);
    }
  };

  return (
    <div>
      <GameHeader
        section="§ BACCARAT"
        breadcrumb={themeConfig.breadcrumb}
        title={themeConfig.title}
        titleSuffix={themeConfig.suffix}
        titleSuffixColor="ember"
        description={themeConfig.description}
        rtpLabel="RTP 98.94%"
        rtpAccent="ember"
        artwork={themeConfig.cover}
        artworkPreset="game-stage"
        artworkSizes="(max-width: 480px) 360px, (min-width: 1024px) 720px, 100vw"
        artworkPosition="object-[65%_32%]"
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.82fr)]">
        <div className="game-main-stack space-y-4">
          <section
            className="game-stage-panel baccarat-stage-panel scanlines relative min-h-[560px] overflow-hidden rounded-[22px] border border-white/10 p-3 shadow-[0_24px_60px_rgba(0,0,0,0.25)] sm:min-h-[660px] sm:p-5"
            style={{
              background: `radial-gradient(circle at 50% 10%, ${themeConfig.accent}33, transparent 30%), linear-gradient(180deg, ${themeConfig.felt}, #050812 74%)`,
            }}
          >
            <ResponsiveImage
              src={themeConfig.cover}
              alt=""
              aria-hidden="true"
              preset="game-stage"
              sizes="(max-width: 480px) 420px, (min-width: 1024px) 720px, 100vw"
              loading="eager"
              fetchPriority="high"
              width={1024}
              height={1365}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_22%] opacity-55"
            />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,8,18,0.18)_0%,rgba(5,8,18,0.42)_36%,rgba(5,8,18,0.94)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.14),transparent_28%)]" />

            <div className="baccarat-stage-header relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/58">
                  <Sparkles className="h-4 w-4" style={{ color: themeConfig.accent }} />
                  {themeConfig.dealerLabel}
                </div>
                <h2 className="mt-1 text-[26px] font-black text-white sm:text-[34px]">
                  {statusLabel}
                </h2>
              </div>
              <div className="baccarat-multiplier-card rounded-[14px] border border-white/14 bg-black/32 px-4 py-2 text-right backdrop-blur">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/52">
                  派彩倍率
                </div>
                <div
                  className="data-num text-[26px] font-black"
                  style={{ color: revealComplete ? themeConfig.accent : '#FDE68A' }}
                >
                  {formatMultiplier(revealComplete ? (result?.multiplier ?? 0) : 0)}
                </div>
              </div>
            </div>

            <div className="baccarat-hands-grid relative z-10 mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
              <BaccaratHandPanel
                title="閒家"
                hand={playerHand}
                fullCardCount={result?.player.cards.length ?? 2}
                active={side === 'player'}
                accent="#38BDF8"
                busy={busy}
                roundKey={result?.betId ?? 'idle'}
              />
              <div className="hidden items-center justify-center md:flex">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/14 bg-black/34 text-[13px] font-black uppercase tracking-[0.18em] text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  style={{ color: themeConfig.secondary }}
                >
                  VS
                </div>
              </div>
              <BaccaratHandPanel
                title="莊家"
                hand={bankerHand}
                fullCardCount={result?.banker.cards.length ?? 2}
                active={side === 'banker'}
                accent={themeConfig.accent}
                busy={busy}
                roundKey={result?.betId ?? 'idle'}
              />
            </div>

            <div className="baccarat-result-card relative z-10 mt-auto rounded-[18px] border border-white/12 bg-white/[0.92] p-4 text-[#172033] shadow-[0_16px_36px_rgba(0,0,0,0.16)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#64748B]">
                    Result
                  </div>
                  <div className="baccarat-result-summary mt-1 text-[16px] font-black">
                    {revealComplete
                      ? result?.summary
                      : result
                        ? '牌局進行中，依序翻開閒莊前兩張，補牌最後揭曉。'
                        : `目前選擇：${selectedOption.title}。下注後立即開牌。`}
                  </div>
                  {revealComplete ? (
                    <div className="mt-2 text-[12px] font-semibold text-[#64748B]">
                      閒 {result?.playerPoints} 點 · 莊 {result?.bankerPoints} 點
                      {result?.natural ? ' · Natural' : ''}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-semibold text-[#64748B]">本局盈虧</div>
                  <div
                    className={`data-num text-[28px] font-black ${
                      profitValue > 0
                        ? 'text-[#15803D]'
                        : profitValue < 0
                          ? 'text-[#DC2626]'
                          : 'text-[#334155]'
                    }`}
                  >
                    {revealComplete ? formatAmount(result?.profit ?? 0) : '0.00'}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {error ? (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-relaxed">{error}</span>
            </div>
          ) : null}

          <section className="grid gap-3 md:grid-cols-4">
            {(
              result?.ruleSummary ?? [
                'A=1，2-9 照點，10/J/Q/K=0。',
                '任一方前兩張 8/9 為 Natural。',
                '閒 0-5 補、6-7 停；莊依第三張牌表。',
                '莊勝 1.95x，和勝 9.00x。',
              ]
            ).map((rule, index) => (
              <div
                key={`${rule}-${index}`}
                className="rounded-[16px] border border-[#E5E7EB] bg-white p-4 text-[12px] font-bold leading-relaxed text-[#243041] shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
              >
                {rule}
              </div>
            ))}
          </section>
        </div>

        <aside className="game-control-stack game-side-stack space-y-4">
          <div className="game-side-card baccarat-control-card p-5">
            <div className="baccarat-bet-panel mb-4 rounded-[18px] border border-[#F59E0B]/35 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,251,235,0.94))] p-3 text-[#172033] shadow-[0_12px_28px_rgba(15,23,42,0.13)]">
              <div className="baccarat-bet-option-grid grid grid-cols-3 gap-2">
                {BET_CONTROL_OPTIONS.map((option) => {
                  const selected = side === option.side;
                  return (
                    <button
                      key={`control-${option.side}`}
                      type="button"
                      onClick={() => {
                        Sfx.tick();
                        setSide(option.side);
                      }}
                      disabled={busy}
                      className={`baccarat-bet-button baccarat-bet-button--${option.side} flex flex-col items-center justify-center rounded-[14px] border px-2 py-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/85 disabled:cursor-not-allowed disabled:opacity-55 ${
                        selected
                          ? 'baccarat-bet-button--selected ring-2 ring-[#FDE68A]/80'
                          : 'hover:brightness-110'
                      }`}
                    >
                      <span className="block text-[15px] font-black text-white">
                        {option.title}
                      </span>
                      <span className="data-num mt-1 block text-[13px] font-black text-white/85">
                        {option.payout}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={busy}
              gameId={gameId}
            />
            <button
              type="button"
              onClick={handleBet}
              disabled={busy || amount < MIN_BET_AMOUNT || amount > balance}
              className="baccarat-submit-button mt-4 inline-flex h-14 w-full items-center justify-center rounded-[14px] bg-[#EA580C] text-[16px] font-black text-white shadow-[0_12px_28px_rgba(234,88,12,0.28)] transition hover:bg-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/75 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? '開牌中' : result ? '下一局下注' : '下注開牌'} · {formatAmount(amount)}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BaccaratHandPanel({
  title,
  hand,
  fullCardCount,
  active,
  accent,
  busy,
  roundKey,
}: {
  title: string;
  hand: BaccaratTableHand | null;
  fullCardCount: number;
  active: boolean;
  accent: string;
  busy: boolean;
  roundKey: string;
}) {
  const cards = hand?.cards ?? [];
  const slotCount = Math.max(2, cards.length >= 3 ? Math.min(fullCardCount, cards.length) : 2);
  const scoreLabel = cards.length > 0 ? `${hand?.points ?? 0}點` : busy ? '等待翻牌' : '待開牌';
  const hasThirdCard = slotCount >= 3;
  return (
    <div
      className={`baccarat-hand-panel rounded-[20px] border p-4 backdrop-blur ${
        active
          ? 'baccarat-hand-panel--active border-white/32 bg-slate-950/72'
          : 'baccarat-hand-panel--idle border-white/16 bg-slate-950/64'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="baccarat-hand-title text-[13px] font-black text-white/90">
            {title}
          </div>
          <div className="baccarat-hand-score mt-1 text-[28px] font-black text-white">
            {scoreLabel}
          </div>
        </div>
        {hand?.drewThirdCard ? (
          <span
            className="baccarat-third-card-badge rounded-full px-2.5 py-1 text-[11px] font-black"
            style={{ backgroundColor: `${accent}2B`, color: accent }}
          >
            補第三張
          </span>
        ) : null}
      </div>

      <div
        className={`baccarat-card-row mt-4 flex min-h-[118px] flex-wrap items-center gap-2 ${
          hasThirdCard ? 'baccarat-card-row--third' : ''
        }`}
      >
        {Array.from({ length: slotCount }, (_, index) => {
          const card = cards[index];
          const isThirdCard = index === 2;
          return card ? (
            <PlayingCard
              key={`${roundKey}-${card.label}-${index}`}
              card={card}
              accent={accent}
              index={index}
              isThirdCard={isThirdCard}
            />
          ) : (
            <CardBack key={`${roundKey}-back-${index}`} busy={busy} accent={accent} />
          );
        })}
      </div>
    </div>
  );
}

function PlayingCard({
  card,
  accent,
  index,
  isThirdCard = false,
}: {
  card: BaccaratTableCard;
  accent: string;
  index: number;
  isThirdCard?: boolean;
}) {
  return (
    <span
      className={`baccarat-playing-card baccarat-card-flip-shell h-[112px] w-[76px] ${
        isThirdCard ? 'baccarat-playing-card--third' : ''
      }`}
      style={{ '--baccarat-card-index': index, '--baccarat-card-accent': accent } as CSSProperties}
    >
      <span className="baccarat-card-flipper">
        <span className="baccarat-card-face baccarat-card-face-back">
          <CardBack busy={false} accent={accent} />
        </span>
        <span className="baccarat-card-face baccarat-card-face-front">
          <img
            src={cardImageSrc(card)}
            alt={card.label}
            draggable={false}
            className="h-full w-full rounded-[8px] bg-white object-contain shadow-[0_12px_26px_rgba(0,0,0,0.35)]"
            style={{ border: `2px solid ${accent}` }}
          />
        </span>
      </span>
    </span>
  );
}

function CardBack({ busy, accent }: { busy: boolean; accent: string }) {
  return (
    <div
      className={`flex h-[112px] w-[76px] items-center justify-center rounded-[8px] border bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03)),repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0,rgba(255,255,255,0.12)_8px,transparent_8px,transparent_16px)] text-[11px] font-black text-white/68 shadow-[0_12px_26px_rgba(0,0,0,0.30)] ${
        busy ? 'animate-pulse' : ''
      } baccarat-card-back`}
      style={{ borderColor: `${accent}77`, backgroundColor: `${accent}33` }}
    >
      待發
    </div>
  );
}

async function revealBaccaratRound(
  round: BaccaratTableBetResult,
  revealRunRef: { current: number },
  setRevealState: (state: BaccaratRevealState) => void,
): Promise<void> {
  const runId = (revealRunRef.current += 1);
  const steps = buildBaccaratRevealSteps(round);

  await wait(BACCARAT_REVEAL_INITIAL_DELAY_MS);
  for (const step of steps) {
    if (runId !== revealRunRef.current) return;
    if (step.isThirdCard) await wait(BACCARAT_REVEAL_THIRD_CARD_PAUSE_MS);
    if (runId !== revealRunRef.current) return;
    Sfx.tableCardFlip();
    setRevealState({ ...step, complete: false });
    await wait(BACCARAT_REVEAL_STEP_MS);
  }

  if (runId !== revealRunRef.current) return;
  await wait(BACCARAT_REVEAL_SETTLE_MS);
  if (runId !== revealRunRef.current) return;
  setRevealState({
    player: round.player.cards.length,
    banker: round.banker.cards.length,
    complete: true,
  });
}

function buildBaccaratRevealSteps(round: BaccaratTableBetResult): BaccaratRevealStep[] {
  const steps: BaccaratRevealStep[] = [];
  const playerMax = round.player.cards.length;
  const bankerMax = round.banker.cards.length;
  const push = (player: number, banker: number, isThirdCard = false) => {
    const next = {
      player: Math.min(player, playerMax),
      banker: Math.min(banker, bankerMax),
      complete: false,
      isThirdCard,
    };
    const previous = steps.at(-1);
    if (!previous || previous.player !== next.player || previous.banker !== next.banker) {
      steps.push(next);
    }
  };

  push(1, 0);
  push(1, 1);
  push(2, 1);
  push(2, 2);
  if (playerMax > 2) push(3, 2, true);
  if (bankerMax > 2) push(playerMax, 3, true);
  return steps;
}

function visibleBaccaratHand(hand: BaccaratTableHand, visibleCount: number): BaccaratTableHand {
  const cards = hand.cards.slice(0, Math.max(0, visibleCount));
  return {
    ...hand,
    cards,
    points: baccaratVisiblePoints(cards),
    drewThirdCard: hand.drewThirdCard && cards.length >= 3,
  };
}

function baccaratVisiblePoints(cards: BaccaratTableCard[]): number {
  return cards.reduce((sum, card) => sum + card.value, 0) % 10;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function cardImageSrc(card: BaccaratTableCard): string {
  const rank = CARD_FILE_RANKS[card.rank - 1] ?? 'ace';
  const suit = CARD_FILE_SUITS[card.suit] ?? 'spades';
  return `/cards/${rank}_of_${suit}.svg`;
}

function theme(
  title: string,
  suffix: string,
  description: string,
  breadcrumb: string,
  dealerLabel: string,
  cover: string,
  accent: string,
  secondary: string,
  felt: string,
): BaccaratTheme {
  return { title, suffix, description, breadcrumb, dealerLabel, cover, accent, secondary, felt };
}
