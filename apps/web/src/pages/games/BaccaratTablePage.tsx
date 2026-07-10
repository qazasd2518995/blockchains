import { useState } from 'react';
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
  const profitValue = Number(result?.profit ?? 0);
  const statusLabel = busy ? '開牌中' : result?.outcomeLabel ?? '等待下注';
  const selectedOption = BET_OPTIONS.find((option) => option.side === side) ?? BET_OPTIONS[0]!;

  const handleBet = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount < MIN_BET_AMOUNT || amount > balance) return;

    Sfx.unlock();
    Sfx.tableCardFlip();
    setBusy(true);
    setError(null);
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    const previousBalance = useAuthStore.getState().debitBalance(amount);

    try {
      const payload: BaccaratTableBetRequest = { gameId, amount, side };
      const res = await api.post<BaccaratTableBetResult>('/games/baccarat/bet', payload);
      Sfx.tableCardFlip();
      setResult(res.data);
      setBalance(res.data.newBalance);
    } catch (err) {
      if (previousBalance) setBalance(previousBalance);
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
            className="game-stage-panel scanlines relative min-h-[660px] overflow-hidden rounded-[22px] border border-white/10 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.25)] sm:p-5"
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

            <div className="relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/58">
                  <Sparkles className="h-4 w-4" style={{ color: themeConfig.accent }} />
                  {themeConfig.dealerLabel}
                </div>
                <h2 className="mt-1 text-[26px] font-black text-white sm:text-[34px]">
                  {statusLabel}
                </h2>
              </div>
              <div className="rounded-[14px] border border-white/14 bg-black/32 px-4 py-2 text-right backdrop-blur">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/52">
                  派彩倍率
                </div>
                <div
                  className="data-num text-[26px] font-black"
                  style={{ color: result ? themeConfig.accent : '#FDE68A' }}
                >
                  {formatMultiplier(result?.multiplier ?? 0)}
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-4 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
              <BaccaratHandPanel
                title="閒家"
                hand={result?.player ?? null}
                active={side === 'player'}
                accent="#38BDF8"
                busy={busy}
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
                hand={result?.banker ?? null}
                active={side === 'banker'}
                accent={themeConfig.accent}
                busy={busy}
              />
            </div>

            <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-3">
              {BET_OPTIONS.map((option) => (
                <button
                  key={option.side}
                  type="button"
                  onClick={() => {
                    Sfx.tick();
                    setSide(option.side);
                  }}
                  disabled={busy}
                  className={`rounded-[18px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/70 disabled:cursor-not-allowed disabled:opacity-55 ${
                    side === option.side
                      ? 'border-[#FDE68A]/70 bg-[#FDE68A]/18 shadow-[0_14px_30px_rgba(245,158,11,0.18)]'
                      : 'border-white/12 bg-black/28 hover:border-white/24 hover:bg-black/38'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[18px] font-black text-white">{option.title}</span>
                    <span className="data-num rounded-full bg-black/32 px-2.5 py-1 text-[12px] font-black text-[#FDE68A]">
                      {option.payout}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold leading-5 text-white/58">
                    {option.hint}
                  </p>
                </button>
              ))}
            </div>

            <div className="relative z-10 mt-4 rounded-[18px] border border-white/12 bg-white/[0.92] p-4 text-[#172033] shadow-[0_16px_36px_rgba(0,0,0,0.16)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#64748B]">
                    Result
                  </div>
                  <div className="mt-1 text-[16px] font-black">
                    {result?.summary ??
                      `目前選擇：${selectedOption.title}。下注後依標準百家樂補牌表立即開牌。`}
                  </div>
                  {result ? (
                    <div className="mt-2 text-[12px] font-semibold text-[#64748B]">
                      閒 {result.playerPoints} 點 · 莊 {result.bankerPoints} 點
                      {result.natural ? ' · Natural' : ''}
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
                    {result ? formatAmount(result.profit) : '0.00'}
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
          <div className="game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={busy}
              gameId={gameId}
            />
            <div className="mt-4 rounded-[16px] border border-[#FDE68A]/24 bg-[#FDE68A]/10 p-3">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#FDE68A]">
                下注門
              </div>
              <div className="mt-1 text-[15px] font-black text-white">
                {selectedOption.title} · {selectedOption.payout}
              </div>
              <p className="mt-1 text-[12px] font-semibold leading-5 text-white/60">
                {selectedOption.hint}
              </p>
            </div>
            <button
              type="button"
              onClick={handleBet}
              disabled={busy || amount < MIN_BET_AMOUNT || amount > balance}
              className="mt-4 inline-flex h-14 w-full items-center justify-center rounded-[14px] bg-[#EA580C] text-[16px] font-black text-white shadow-[0_12px_28px_rgba(234,88,12,0.28)] transition hover:bg-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDE68A]/75 disabled:cursor-not-allowed disabled:opacity-45"
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
  active,
  accent,
  busy,
}: {
  title: string;
  hand: BaccaratTableHand | null;
  active: boolean;
  accent: string;
  busy: boolean;
}) {
  const cards = hand?.cards ?? [];
  return (
    <div
      className={`rounded-[20px] border p-4 backdrop-blur ${
        active ? 'border-white/28 bg-white/[0.16]' : 'border-white/12 bg-black/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-black text-white/60">{title}</div>
          <div className="mt-1 text-[28px] font-black text-white">
            {hand ? `${hand.points}點` : busy ? '發牌中' : '待開牌'}
          </div>
        </div>
        {hand?.drewThirdCard ? (
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-black"
            style={{ backgroundColor: `${accent}2B`, color: accent }}
          >
            補第三張
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex min-h-[118px] flex-wrap items-center gap-2">
        {cards.length > 0
          ? cards.map((card, index) => (
              <PlayingCard key={`${card.label}-${index}`} card={card} accent={accent} />
            ))
          : [0, 1].map((index) => <CardBack key={index} busy={busy} accent={accent} />)}
      </div>
    </div>
  );
}

function PlayingCard({ card, accent }: { card: BaccaratTableCard; accent: string }) {
  return (
    <img
      src={cardImageSrc(card)}
      alt={card.label}
      draggable={false}
      className="h-[112px] w-[76px] rounded-[8px] bg-white object-contain shadow-[0_12px_26px_rgba(0,0,0,0.35)]"
      style={{ border: `2px solid ${accent}` }}
    />
  );
}

function CardBack({ busy, accent }: { busy: boolean; accent: string }) {
  return (
    <div
      className={`flex h-[112px] w-[76px] items-center justify-center rounded-[8px] border bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03)),repeating-linear-gradient(135deg,rgba(255,255,255,0.12)_0,rgba(255,255,255,0.12)_8px,transparent_8px,transparent_16px)] text-[11px] font-black text-white/68 shadow-[0_12px_26px_rgba(0,0,0,0.30)] ${
        busy ? 'animate-pulse' : ''
      }`}
      style={{ borderColor: `${accent}77`, backgroundColor: `${accent}33` }}
    >
      待發
    </div>
  );
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
