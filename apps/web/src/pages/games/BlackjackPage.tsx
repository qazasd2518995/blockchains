import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, BadgeDollarSign, ChevronsRight, Hand, Play, Scissors, Shield } from 'lucide-react';
import type { BlackjackCard, BlackjackPlayerHand, BlackjackRoundResult, BlackjackRoundState } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { useRequireLogin } from '@/hooks/useRequireLogin';

const CARD_FILE_RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'] as const;
const CARD_FILE_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const DEAL_STEP_MS = 330;
const QUICK_FRAME_MS = 90;
const HOLE_FLIP_MS = 560;
const RESULT_REVEAL_MS = 280;
const DEALER_HOLE_KEY = 'dealer:hole';

interface BlackjackAnimationMeta {
  enteringCards: string[];
  flipDealerHole?: boolean;
  revealResult?: boolean;
}

interface BlackjackAnimationFrame {
  state: BlackjackRoundState;
  meta: BlackjackAnimationMeta;
  durationMs: number;
}

const IDLE_ANIMATION_META: BlackjackAnimationMeta = { enteringCards: [] };

export function BlackjackPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [round, setRound] = useState<BlackjackRoundState | null>(null);
  const [displayRound, setDisplayRound] = useState<BlackjackRoundState | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animationMeta, setAnimationMeta] = useState<BlackjackAnimationMeta>(IDLE_ANIMATION_META);
  const [error, setError] = useState<string | null>(null);
  const animationTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    void api
      .get<{ state: BlackjackRoundState | null }>('/games/blackjack/active')
      .then((res) => {
        setRound(res.data.state);
        setDisplayRound(res.data.state);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => () => clearAnimationTimers(animationTimers.current), []);

  const tableRound = displayRound ?? round;
  const activeHand = round?.playerHands[round.activeHandIndex] ?? null;
  const displayActiveHand = tableRound?.playerHands[tableRound.activeHandIndex] ?? null;
  const settled = round && round.status !== 'ACTIVE' && !animating;
  const resultSummary = useMemo(() => summarizeRound(round), [round]);
  const enteringCardKeys = useMemo(() => new Set(animationMeta.enteringCards), [animationMeta.enteringCards]);

  const playRoundAnimation = (nextRound: BlackjackRoundState) => {
    clearAnimationTimers(animationTimers.current);
    const previous = displayRound ?? round;
    const frames = buildBlackjackDealFrames(previous, nextRound);

    setAnimating(frames.length > 1);
    let elapsed = 0;
    frames.forEach((frame) => {
      const timer = setTimeout(() => {
        setDisplayRound(frame.state);
        setAnimationMeta(frame.meta);
      }, elapsed);
      animationTimers.current.push(timer);
      elapsed += frame.durationMs;
    });

    const finishTimer = setTimeout(() => {
      setAnimating(false);
      setAnimationMeta(IDLE_ANIMATION_META);
      setDisplayRound(nextRound);
    }, Math.max(0, elapsed));
    animationTimers.current.push(finishTimer);
  };

  const applyResult = (result: BlackjackRoundResult, fallbackBet: number) => {
    setRound(result.state);
    if (result.newBalance) setBalance(result.newBalance);
    playRoundAnimation(result.state);
    if (result.state.status !== 'ACTIVE') {
      const totalBet = Number.parseFloat(result.state.totalBetAmount);
      const payout = Number.parseFloat(result.state.potentialPayout);
      setHistory((prev) => [
        {
          id: result.state.roundId,
          timestamp: Date.now(),
          betAmount: Number.isFinite(totalBet) ? totalBet : fallbackBet,
          multiplier: totalBet > 0 ? payout / totalBet : 0,
          payout,
          won: payout > totalBet,
          detail: resultSummaryLabel(result.state),
        },
        ...prev,
      ].slice(0, 30));
    }
  };

  const runAction = async (path: string, fallbackBet = amount) => {
    if (!round || busy || animating) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<BlackjackRoundResult>(path, { roundId: round.roundId });
      applyResult(res.data, fallbackBet);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    if (busy || animating) return;
    if (!requireLogin()) return;
    if (amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<BlackjackRoundResult>('/games/blackjack/start', { amount });
      applyResult(res.data, amount);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    clearAnimationTimers(animationTimers.current);
    setRound(null);
    setDisplayRound(null);
    setAnimating(false);
    setAnimationMeta(IDLE_ANIMATION_META);
    setError(null);
  };

  return (
    <div>
      <GameHeader
        artwork="/game-art/blackjack/background.png"
        section="§ TABLE 04"
        breadcrumb="BLACKJACK_21"
        title={t.games.blackjack.title}
        titleSuffix={t.games.blackjack.suffix}
        titleSuffixColor="acid"
        description={t.games.blackjack.description}
        rtpLabel="RTP 99.5%"
        rtpAccent="acid"
      />

      <div className="game-play-grid game-play-grid--blackjack grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.82fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines overflow-hidden p-3 sm:p-4">
            <div className="game-stage-bar -mx-3 -mt-3 mb-3 rounded-t-[22px] sm:-mx-4 sm:-mt-4 sm:mb-4">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">21点</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Blackjack</span>
              <span className="text-[#7EE0A4]">
                <span className="dot-online" />
                {tableRound ? (tableRound.status === 'ACTIVE' ? t.games.blackjack.dealing : t.common.ready) : t.games.hilo.idle}
              </span>
            </div>

            <div className="blackjack-table-stage relative min-h-[580px] overflow-hidden rounded-[18px] border border-[#C9A247]/20 bg-[#08111E] sm:min-h-[620px]">
              <img
                src="/game-art/blackjack/background.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover opacity-70"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,71,0.14),transparent_34%),linear-gradient(180deg,rgba(5,10,19,0.58)_0%,rgba(5,10,19,0.88)_100%)]" />

              <div className="blackjack-table-body relative z-10 flex min-h-[580px] flex-col justify-between gap-5 p-3 sm:min-h-[620px] sm:p-5">
                <section>
                  <TableLabel
                    title={t.games.blackjack.dealer}
                    value={
                      tableRound?.dealerScore
                        ? tableRound.dealerHoleHidden
                          ? t.games.blackjack.holeHidden
                          : `${tableRound.dealerScore.total}${tableRound.dealerScore.soft ? ' SOFT' : ''}`
                        : '--'
                    }
                  />
                  <div className="mt-3 flex min-h-[150px] flex-wrap items-center justify-center gap-2 sm:gap-3">
                    {tableRound ? (
                      <>
                        {tableRound.dealerCards.map((card, index) => (
                          animationMeta.flipDealerHole && index === 1 ? (
                            <FlipCardImage
                              key={`dealer-flip-${card.rank}-${card.suit}`}
                              card={card}
                            />
                          ) : (
                            <CardImage
                              key={`dealer-${index}-${card.rank}-${card.suit}`}
                              card={card}
                              cardKey={dealerCardKey(index, card)}
                              isEntering={enteringCardKeys.has(dealerCardKey(index, card))}
                              lane="dealer"
                            />
                          )
                        ))}
                        {tableRound.dealerHoleHidden && (
                          <CardBack isEntering={enteringCardKeys.has(DEALER_HOLE_KEY)} />
                        )}
                      </>
                    ) : (
                      <EmptySeat label={t.games.blackjack.placeBetToDeal} />
                    )}
                  </div>
                </section>

                <div className="mx-auto grid w-full max-w-[720px] grid-cols-3 gap-2 rounded-full border border-[#C9A247]/20 bg-[#06101C]/70 p-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 backdrop-blur">
                  <div>
                    <span className="block text-[#E8D48A]">{formatAmount(tableRound?.totalBetAmount ?? amount)}</span>
                    {t.bet.amount}
                  </div>
                  <div>
                    <span className="block text-[#7DD3FC]">{formatAmount(tableRound?.potentialPayout ?? 0)}</span>
                    {t.bet.potentialPayout}
                  </div>
                  <div>
                    <span className="block text-[#6EE7B7]">
                      {displayActiveHand && displayActiveHand.cards.length > 0 ? displayActiveHand.score.total : '--'}
                    </span>
                    {t.games.blackjack.handValue}
                  </div>
                </div>

                <section>
                  <TableLabel
                    title={t.games.blackjack.player}
                    value={displayActiveHand ? `${t.games.blackjack.hand} ${tableRound!.activeHandIndex + 1}` : '--'}
                  />
                  <div className="mt-3 flex flex-wrap justify-center gap-3">
                    {tableRound ? (
                      tableRound.playerHands.map((hand, index) => (
                        <div
                          key={hand.id}
                          className={`w-full rounded-[18px] border p-3 backdrop-blur ${
                            tableRound.playerHands.length > 1 ? 'md:max-w-[360px] md:basis-[calc(50%-0.375rem)]' : 'max-w-[560px]'
                          } ${
                            index === tableRound.activeHandIndex && tableRound.status === 'ACTIVE'
                              ? 'border-[#E8D48A]/70 bg-[#0F1E2E]/84 shadow-[0_0_28px_rgba(232,212,138,0.12)]'
                              : 'border-white/10 bg-[#07111E]/64'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                              {t.games.blackjack.hand} {index + 1}
                            </div>
                            <div className="rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-bold text-[#E8D48A]">
                              {formatAmount(hand.bet)} · {hand.cards.length > 0 ? hand.score.total : '--'}
                              {hand.cards.length > 0 && hand.score.soft ? ' SOFT' : ''}
                            </div>
                          </div>
                          <div className="flex min-h-[132px] flex-wrap items-center justify-center gap-2">
                            {hand.cards.map((card, cardIndex) => (
                              <CardImage
                                key={`${hand.id}-${cardIndex}-${card.rank}-${card.suit}`}
                                card={card}
                                cardKey={playerCardKey(hand.id, cardIndex, card)}
                                isEntering={enteringCardKeys.has(playerCardKey(hand.id, cardIndex, card))}
                                isSettling={Boolean(animationMeta.revealResult && hand.outcome)}
                                lane="player"
                              />
                            ))}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.16em]">
                            <span className={hand.outcome === 'LOSE' ? 'text-[#FCA5A5]' : 'text-white/52'}>
                              {hand.outcome ? outcomeLabel(hand.outcome) : hand.status}
                            </span>
                            <span className="data-num text-[#6EE7B7]">
                              {hand.payout ? formatAmount(hand.payout) : '--'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptySeat label={t.games.blackjack.noCards} />
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>

          {settled && (
            <div
              className={`game-result-card ${
                Number.parseFloat(round.potentialPayout) > Number.parseFloat(round.totalBetAmount)
                  ? 'game-result-card-win'
                  : 'game-result-card-loss'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <div className="font-display text-4xl text-[#F3D67D]">{resultSummary.title}</div>
                  <div className="mt-1 text-[11px] tracking-[0.2em] text-white/65">{resultSummary.detail}</div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="data-num text-[11px] text-white/55">{t.games.dice.payout}</div>
                  <div className="data-num text-3xl font-black text-[#6EE7B7]">
                    {formatAmount(round.potentialPayout)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="game-control-stack space-y-4">
          <div className="game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              disabled={Boolean(round && round.status === 'ACTIVE') || busy}
            />

            <div className="mt-6 grid grid-cols-2 gap-2">
              {!round && (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={busy || animating || (!!user && balance < amount)}
                  className="btn-acid col-span-2 w-full py-4"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  {t.games.blackjack.deal} · {formatAmount(amount)}
                </button>
              )}

              {round?.status === 'ACTIVE' && (
                <>
                  <ActionButton
                    icon={<ChevronsRight className="h-4 w-4" aria-hidden="true" />}
                    label={t.games.blackjack.hit}
                    disabled={busy || animating || !round.canHit}
                    onClick={() => runAction('/games/blackjack/hit')}
                  />
                  <ActionButton
                    icon={<Hand className="h-4 w-4" aria-hidden="true" />}
                    label={t.games.blackjack.stand}
                    disabled={busy || animating || !round.canStand}
                    onClick={() => runAction('/games/blackjack/stand')}
                  />
                  <ActionButton
                    icon={<BadgeDollarSign className="h-4 w-4" aria-hidden="true" />}
                    label={t.games.blackjack.double}
                    disabled={busy || animating || !round.canDouble || balance < Number.parseFloat(activeHand?.bet ?? '0')}
                    onClick={() => runAction('/games/blackjack/double')}
                  />
                  <ActionButton
                    icon={<Scissors className="h-4 w-4" aria-hidden="true" />}
                    label={t.games.blackjack.split}
                    disabled={busy || animating || !round.canSplit || balance < Number.parseFloat(activeHand?.bet ?? '0')}
                    onClick={() => runAction('/games/blackjack/split')}
                  />
                </>
              )}

              {settled && (
                <button type="button" onClick={handleReset} className="btn-acid col-span-2 w-full py-4">
                  {t.bet.newRound}
                </button>
              )}
            </div>

            <div className="game-balance-strip mt-3">
              <span>
                {t.bet.balance} <span className="data-num ml-1 text-white">{user ? formatAmount(balance) : '登入後顯示'}</span>
              </span>
              <span>
                {t.bet.multiplier}{' '}
                <span className="data-num ml-1 text-[#7DD3FC]">
                  {round ? formatMultiplier(Number.parseFloat(round.potentialPayout) / Math.max(1, Number.parseFloat(round.totalBetAmount))) : '--'}
                </span>
              </span>
            </div>
          </div>

          <div className="game-side-card p-5">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-black text-white">
              <Shield className="h-4 w-4 text-[#E8D48A]" aria-hidden="true" />
              {t.games.blackjack.rules}
            </div>
            <div className="space-y-2 text-[11px] leading-relaxed text-white/62">
              <p>{t.games.blackjack.ruleBlackjack}</p>
              <p>{t.games.blackjack.ruleDealer}</p>
              <p>{t.games.blackjack.ruleDoubleSplit}</p>
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="game-choice-btn game-choice-btn-ice inline-flex items-center justify-center gap-2 py-3 disabled:opacity-35"
    >
      {icon}
      {label}
    </button>
  );
}

function TableLabel({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-full border border-white/10 bg-[#050A13]/58 px-3 py-2 backdrop-blur">
      <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#E8D48A]">{title}</div>
      <div className="data-num text-[11px] font-black uppercase tracking-[0.18em] text-white/70">{value}</div>
    </div>
  );
}

function EmptySeat({ label }: { label: string }) {
  return (
    <div className="flex min-h-[132px] w-full items-center justify-center rounded-[18px] border border-dashed border-white/12 bg-[#07111E]/42 text-[11px] font-bold uppercase tracking-[0.18em] text-white/36">
      {label}
    </div>
  );
}

function CardImage({
  card,
  cardKey,
  lane,
  isEntering = false,
  isSettling = false,
}: {
  card: BlackjackCard;
  cardKey: string;
  lane: 'dealer' | 'player';
  isEntering?: boolean;
  isSettling?: boolean;
}) {
  const path = getCardAssetPath(card);
  const label = `${rankLabel(card.rank)} ${suitLabel(card.suit)}`;
  return (
    <span
      className={`blackjack-card-shell blackjack-card-deal-${lane} ${
        isEntering ? 'blackjack-card-deal' : ''
      } ${isSettling ? 'blackjack-card-settle' : ''}`}
      data-card-key={cardKey}
    >
      <img
        src={path}
        alt={label}
        className="h-[122px] w-[82px] rounded-[8px] object-contain shadow-[0_14px_28px_rgba(0,0,0,0.38)] sm:h-[148px] sm:w-[100px]"
        draggable={false}
      />
    </span>
  );
}

function CardBack({ isEntering = false }: { isEntering?: boolean }) {
  return (
    <span className={`blackjack-card-shell blackjack-card-deal-dealer ${isEntering ? 'blackjack-card-deal' : ''}`}>
      <CardBackFace />
    </span>
  );
}

function FlipCardImage({ card }: { card: BlackjackCard }) {
  const path = getCardAssetPath(card);
  const label = `${rankLabel(card.rank)} ${suitLabel(card.suit)}`;
  return (
    <span className="blackjack-card-shell blackjack-card-flip-shell">
      <span className="blackjack-card-flip">
        <span className="blackjack-card-face blackjack-card-face-back">
          <CardBackFace />
        </span>
        <span className="blackjack-card-face blackjack-card-face-front">
          <img
            src={path}
            alt={label}
            className="h-full w-full rounded-[8px] object-contain shadow-[0_18px_34px_rgba(0,0,0,0.42)]"
            draggable={false}
          />
        </span>
      </span>
    </span>
  );
}

function CardBackFace() {
  return (
    <div className="flex h-[122px] w-[82px] items-center justify-center rounded-[8px] border border-[#E8D48A]/50 bg-[radial-gradient(circle_at_50%_35%,rgba(232,212,138,0.34),transparent_30%),linear-gradient(135deg,#07111E,#143B4C_52%,#07111E)] shadow-[0_14px_28px_rgba(0,0,0,0.38)] sm:h-[148px] sm:w-[100px]">
      <div className="rounded-full border border-[#E8D48A]/45 px-3 py-2 text-[10px] font-black tracking-[0.22em] text-[#E8D48A]">
        BG
      </div>
    </div>
  );
}

function clearAnimationTimers(timers: Array<ReturnType<typeof setTimeout>>): void {
  timers.splice(0).forEach((timer) => clearTimeout(timer));
}

function buildBlackjackDealFrames(
  previous: BlackjackRoundState | null,
  next: BlackjackRoundState,
): BlackjackAnimationFrame[] {
  if (!previous || previous.roundId !== next.roundId) {
    return compactFrames(buildOpeningFrames(next));
  }

  const splitFrames = buildSplitFrames(previous, next);
  if (splitFrames) return compactFrames(splitFrames);

  const frames: BlackjackAnimationFrame[] = [];
  const handCounts = buildTransitionHandCounts(previous, next);
  let dealerCount = Math.min(previous.dealerCards.length, next.dealerCards.length);
  let dealerHoleHidden = previous.dealerHoleHidden;

  frames.push(
    animationFrame(
      makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, next.status === 'ACTIVE'),
      {},
      QUICK_FRAME_MS,
    ),
  );

  next.playerHands.forEach((hand, index) => {
    while ((handCounts[index] ?? 0) < hand.cards.length) {
      handCounts[index] = (handCounts[index] ?? 0) + 1;
      const cardIndex = handCounts[index]! - 1;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, next.status === 'ACTIVE'),
          { enteringCards: [playerCardKey(hand.id, cardIndex, hand.cards[cardIndex]!)] },
          DEAL_STEP_MS,
        ),
      );
    }
  });

  if (next.dealerHoleHidden) {
    dealerHoleHidden = true;
    frames.push(
      animationFrame(
        makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, true),
        { enteringCards: previous.dealerHoleHidden ? [] : [DEALER_HOLE_KEY] },
        DEAL_STEP_MS,
      ),
    );
  } else {
    if (previous.dealerHoleHidden && next.dealerCards.length > 1) {
      dealerCount = Math.max(dealerCount, 2);
      dealerHoleHidden = false;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, false),
          { flipDealerHole: true },
          HOLE_FLIP_MS,
        ),
      );
    } else {
      dealerHoleHidden = false;
    }

    while (dealerCount < next.dealerCards.length) {
      dealerCount += 1;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, false),
          { enteringCards: [dealerCardKey(dealerCount - 1, next.dealerCards[dealerCount - 1]!)] },
          DEAL_STEP_MS,
        ),
      );
    }
  }

  frames.push(animationFrame(next, { revealResult: next.status !== 'ACTIVE' }, RESULT_REVEAL_MS));
  return compactFrames(frames);
}

function buildOpeningFrames(next: BlackjackRoundState): BlackjackAnimationFrame[] {
  const frames: BlackjackAnimationFrame[] = [];
  const handCounts = next.playerHands.map(() => 0);
  let dealerCount = 0;

  frames.push(animationFrame(makeVisibleRound(next, 0, false, handCounts, false), {}, QUICK_FRAME_MS));

  if (next.playerHands[0]?.cards.length) {
    handCounts[0] = 1;
    frames.push(
      animationFrame(
        makeVisibleRound(next, dealerCount, false, handCounts, false),
        { enteringCards: [playerCardKey(next.playerHands[0].id, 0, next.playerHands[0].cards[0]!)] },
        DEAL_STEP_MS,
      ),
    );
  }

  if (next.dealerCards.length > 0) {
    dealerCount = 1;
    frames.push(
      animationFrame(
        makeVisibleRound(next, dealerCount, false, handCounts, false),
        { enteringCards: [dealerCardKey(0, next.dealerCards[0]!)] },
        DEAL_STEP_MS,
      ),
    );
  }

  const openingHand = next.playerHands[0];
  if (openingHand && openingHand.cards.length > 1) {
    handCounts[0] = 2;
    frames.push(
      animationFrame(
        makeVisibleRound(next, dealerCount, false, handCounts, next.status === 'ACTIVE'),
        { enteringCards: [playerCardKey(openingHand.id, 1, openingHand.cards[1]!)] },
        DEAL_STEP_MS,
      ),
    );
  }

  if (next.dealerHoleHidden || next.dealerCards.length > 1) {
    frames.push(
      animationFrame(
        makeVisibleRound(next, dealerCount, true, handCounts, next.status === 'ACTIVE'),
        { enteringCards: [DEALER_HOLE_KEY] },
        DEAL_STEP_MS,
      ),
    );
  }

  if (!next.dealerHoleHidden) {
    if (next.dealerCards.length > 1) {
      dealerCount = 2;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, false, handCounts, false),
          { flipDealerHole: true },
          HOLE_FLIP_MS,
        ),
      );
    }

    while (dealerCount < next.dealerCards.length) {
      dealerCount += 1;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, false, handCounts, false),
          { enteringCards: [dealerCardKey(dealerCount - 1, next.dealerCards[dealerCount - 1]!)] },
          DEAL_STEP_MS,
        ),
      );
    }
  }

  frames.push(animationFrame(next, { revealResult: next.status !== 'ACTIVE' }, RESULT_REVEAL_MS));
  return frames;
}

function buildSplitFrames(
  previous: BlackjackRoundState,
  next: BlackjackRoundState,
): BlackjackAnimationFrame[] | null {
  if (next.playerHands.length <= previous.playerHands.length) return null;

  const splitIndex = previous.activeHandIndex;
  const previousSplitHand = previous.playerHands[splitIndex];
  const firstSplitHand = next.playerHands[splitIndex];
  const secondSplitHand = next.playerHands[splitIndex + 1];
  if (!previousSplitHand || !firstSplitHand || !secondSplitHand) return null;
  if (!firstSplitHand.id.startsWith(previousSplitHand.id) || !secondSplitHand.id.startsWith(previousSplitHand.id)) {
    return null;
  }

  const frames: BlackjackAnimationFrame[] = [];
  const handCounts = next.playerHands.map((hand, index) => {
    const previousHand = previous.playerHands.find((candidate) => candidate.id === hand.id);
    if (previousHand) return Math.min(previousHand.cards.length, hand.cards.length);
    if (index === splitIndex || index === splitIndex + 1) return Math.min(1, hand.cards.length);
    return 0;
  });
  let dealerCount = Math.min(previous.dealerCards.length, next.dealerCards.length);
  let dealerHoleHidden = previous.dealerHoleHidden;

  frames.push(
    animationFrame(
      makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, next.status === 'ACTIVE'),
      {},
      QUICK_FRAME_MS,
    ),
  );

  [splitIndex, splitIndex + 1].forEach((handIndex) => {
    const hand = next.playerHands[handIndex];
    if (!hand) return;
    while ((handCounts[handIndex] ?? 0) < hand.cards.length) {
      handCounts[handIndex] = (handCounts[handIndex] ?? 0) + 1;
      const cardIndex = handCounts[handIndex]! - 1;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, next.status === 'ACTIVE'),
          { enteringCards: [playerCardKey(hand.id, cardIndex, hand.cards[cardIndex]!)] },
          DEAL_STEP_MS,
        ),
      );
    }
  });

  if (next.status !== 'ACTIVE') {
    if (previous.dealerHoleHidden && next.dealerCards.length > 1) {
      dealerCount = 2;
      dealerHoleHidden = false;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, dealerHoleHidden, handCounts, false),
          { flipDealerHole: true },
          HOLE_FLIP_MS,
        ),
      );
    }

    while (dealerCount < next.dealerCards.length) {
      dealerCount += 1;
      frames.push(
        animationFrame(
          makeVisibleRound(next, dealerCount, false, handCounts, false),
          { enteringCards: [dealerCardKey(dealerCount - 1, next.dealerCards[dealerCount - 1]!)] },
          DEAL_STEP_MS,
        ),
      );
    }
  }

  frames.push(animationFrame(next, { revealResult: next.status !== 'ACTIVE' }, RESULT_REVEAL_MS));
  return frames;
}

function buildTransitionHandCounts(previous: BlackjackRoundState, next: BlackjackRoundState): number[] {
  return next.playerHands.map((hand, index) => {
    const previousHand = previous.playerHands.find((candidate) => candidate.id === hand.id) ?? previous.playerHands[index];
    return Math.min(previousHand?.cards.length ?? 0, hand.cards.length);
  });
}

function animationFrame(
  state: BlackjackRoundState,
  meta: Partial<BlackjackAnimationMeta> = {},
  durationMs = DEAL_STEP_MS,
): BlackjackAnimationFrame {
  return {
    state,
    meta: {
      enteringCards: meta.enteringCards ?? [],
      flipDealerHole: meta.flipDealerHole,
      revealResult: meta.revealResult,
    },
    durationMs,
  };
}

function makeVisibleRound(
  source: BlackjackRoundState,
  dealerCount: number,
  dealerHoleHidden: boolean,
  handCounts: number[],
  revealHandMeta: boolean,
): BlackjackRoundState {
  const dealerCards = source.dealerCards.slice(0, dealerCount);
  return {
    ...source,
    dealerCards,
    dealerHoleHidden,
    dealerScore: dealerCards.length > 0 ? scoreCards(dealerCards) : null,
    playerHands: source.playerHands.map((hand, index) => {
      const visibleCount = Math.min(handCounts[index] ?? hand.cards.length, hand.cards.length);
      return maskHand(hand, visibleCount, revealHandMeta || source.status === 'ACTIVE');
    }),
  };
}

function maskHand(hand: BlackjackPlayerHand, visibleCount: number, revealMeta: boolean): BlackjackPlayerHand {
  const cards = hand.cards.slice(0, visibleCount);
  const complete = cards.length >= hand.cards.length;
  const masked: BlackjackPlayerHand = {
    ...hand,
    cards,
    score: scoreCards(cards),
    status: complete ? hand.status : 'PLAYING',
  };

  if (!complete || !revealMeta) {
    delete masked.outcome;
    delete masked.payout;
    delete masked.multiplier;
  }

  return masked;
}

function scoreCards(cards: BlackjackCard[]) {
  let total = 0;
  let aces = 0;
  cards.forEach((card) => {
    if (card.rank === 1) {
      aces += 1;
      total += 11;
    } else {
      total += Math.min(card.rank, 10);
    }
  });
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return {
    total,
    soft: aces > 0,
    isBust: total > 21,
    isBlackjack: cards.length === 2 && total === 21,
  };
}

function compactFrames(frames: BlackjackAnimationFrame[]): BlackjackAnimationFrame[] {
  const compacted: BlackjackAnimationFrame[] = [];
  frames.forEach((frame) => {
    if (animationFrameFingerprint(compacted[compacted.length - 1]) !== animationFrameFingerprint(frame)) {
      compacted.push(frame);
    }
  });
  return compacted.length > 0 ? compacted : frames;
}

function animationFrameFingerprint(frame: BlackjackAnimationFrame | undefined): string {
  if (!frame) return '';
  return JSON.stringify({
    state: frameFingerprint(frame.state),
    meta: frame.meta,
  });
}

function frameFingerprint(frame: BlackjackRoundState | undefined): string {
  if (!frame) return '';
  return JSON.stringify({
    status: frame.status,
    dealer: frame.dealerCards.map((card) => `${card.rank}-${card.suit}`),
    dealerHoleHidden: frame.dealerHoleHidden,
    activeHandIndex: frame.activeHandIndex,
    hands: frame.playerHands.map((hand) => ({
      id: hand.id,
      cards: hand.cards.map((card) => `${card.rank}-${card.suit}`),
      status: hand.status,
      outcome: hand.outcome,
      payout: hand.payout,
    })),
  });
}

function dealerCardKey(index: number, card: BlackjackCard): string {
  return `dealer:${index}:${card.rank}:${card.suit}`;
}

function playerCardKey(handId: string, index: number, card: BlackjackCard): string {
  return `player:${handId}:${index}:${card.rank}:${card.suit}`;
}

function getCardAssetPath(card: BlackjackCard): string {
  const rank = CARD_FILE_RANKS[card.rank - 1] ?? 'ace';
  const suit = CARD_FILE_SUITS[card.suit] ?? 'spades';
  return `/cards/${rank}_of_${suit}.svg`;
}

function rankLabel(rank: number): string {
  return CARD_FILE_RANKS[rank - 1] ?? String(rank);
}

function suitLabel(suit: number): string {
  return CARD_FILE_SUITS[suit] ?? 'spades';
}

function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'BLACKJACK':
      return 'BLACKJACK';
    case 'WIN':
      return 'WIN';
    case 'PUSH':
      return 'PUSH';
    default:
      return 'LOSE';
  }
}

function summarizeRound(round: BlackjackRoundState | null): { title: string; detail: string } {
  if (!round) return { title: '--', detail: '' };
  const totalBet = Number.parseFloat(round.totalBetAmount);
  const payout = Number.parseFloat(round.potentialPayout);
  if (payout > totalBet) {
    return { title: 'PLAYER WIN', detail: `+${formatAmount(payout - totalBet)} · ${resultSummaryLabel(round)}` };
  }
  if (payout === totalBet) {
    return { title: 'PUSH', detail: resultSummaryLabel(round) };
  }
  return { title: 'DEALER WIN', detail: resultSummaryLabel(round) };
}

function resultSummaryLabel(round: BlackjackRoundState): string {
  return round.playerHands
    .map((hand, index) => `${index + 1}:${hand.outcome ?? hand.status}`)
    .join(' · ');
}
