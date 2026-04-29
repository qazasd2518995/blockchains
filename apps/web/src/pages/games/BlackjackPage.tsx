import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, BadgeDollarSign, ChevronsRight, Hand, Play, Scissors, Shield } from 'lucide-react';
import type { BlackjackCard, BlackjackRoundResult, BlackjackRoundState } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const CARD_FILE_RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'] as const;
const CARD_FILE_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

export function BlackjackPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [round, setRound] = useState<BlackjackRoundState | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ state: BlackjackRoundState | null }>('/games/blackjack/active')
      .then((res) => setRound(res.data.state))
      .catch(() => undefined);
  }, []);

  const activeHand = round?.playerHands[round.activeHandIndex] ?? null;
  const settled = round && round.status !== 'ACTIVE';
  const resultSummary = useMemo(() => summarizeRound(round), [round]);

  const applyResult = (result: BlackjackRoundResult, fallbackBet: number) => {
    setRound(result.state);
    if (result.newBalance) setBalance(result.newBalance);
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
    if (!round || busy) return;
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
    if (busy || amount <= 0 || amount > balance) return;
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
    setRound(null);
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

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,0.82fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines overflow-hidden p-3 sm:p-4">
            <div className="game-stage-bar -mx-3 -mt-3 mb-3 rounded-t-[22px] sm:-mx-4 sm:-mt-4 sm:mb-4">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">21点</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Blackjack</span>
              <span className="text-[#7EE0A4]">
                <span className="dot-online" />
                {round ? (round.status === 'ACTIVE' ? t.games.blackjack.dealing : t.common.ready) : t.games.hilo.idle}
              </span>
            </div>

            <div className="relative min-h-[580px] overflow-hidden rounded-[18px] border border-[#C9A247]/20 bg-[#08111E] sm:min-h-[620px]">
              <img
                src="/game-art/blackjack/background.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover opacity-70"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,71,0.14),transparent_34%),linear-gradient(180deg,rgba(5,10,19,0.58)_0%,rgba(5,10,19,0.88)_100%)]" />

              <div className="relative z-10 flex min-h-[580px] flex-col justify-between gap-5 p-3 sm:min-h-[620px] sm:p-5">
                <section>
                  <TableLabel
                    title={t.games.blackjack.dealer}
                    value={
                      round?.dealerScore
                        ? round.dealerHoleHidden
                          ? t.games.blackjack.holeHidden
                          : `${round.dealerScore.total}${round.dealerScore.soft ? ' SOFT' : ''}`
                        : '--'
                    }
                  />
                  <div className="mt-3 flex min-h-[150px] flex-wrap items-center justify-center gap-2 sm:gap-3">
                    {round ? (
                      <>
                        {round.dealerCards.map((card, index) => (
                          <CardImage key={`dealer-${index}-${card.rank}-${card.suit}`} card={card} />
                        ))}
                        {round.dealerHoleHidden && <CardBack />}
                      </>
                    ) : (
                      <EmptySeat label={t.games.blackjack.placeBetToDeal} />
                    )}
                  </div>
                </section>

                <div className="mx-auto grid w-full max-w-[720px] grid-cols-3 gap-2 rounded-full border border-[#C9A247]/20 bg-[#06101C]/70 p-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-white/60 backdrop-blur">
                  <div>
                    <span className="block text-[#E8D48A]">{formatAmount(round?.totalBetAmount ?? amount)}</span>
                    {t.bet.amount}
                  </div>
                  <div>
                    <span className="block text-[#7DD3FC]">{formatAmount(round?.potentialPayout ?? 0)}</span>
                    {t.bet.potentialPayout}
                  </div>
                  <div>
                    <span className="block text-[#6EE7B7]">{activeHand ? activeHand.score.total : '--'}</span>
                    {t.games.blackjack.handValue}
                  </div>
                </div>

                <section>
                  <TableLabel
                    title={t.games.blackjack.player}
                    value={activeHand ? `${t.games.blackjack.hand} ${round!.activeHandIndex + 1}` : '--'}
                  />
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {round ? (
                      round.playerHands.map((hand, index) => (
                        <div
                          key={hand.id}
                          className={`rounded-[18px] border p-3 backdrop-blur ${
                            index === round.activeHandIndex && round.status === 'ACTIVE'
                              ? 'border-[#E8D48A]/70 bg-[#0F1E2E]/84 shadow-[0_0_28px_rgba(232,212,138,0.12)]'
                              : 'border-white/10 bg-[#07111E]/64'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                              {t.games.blackjack.hand} {index + 1}
                            </div>
                            <div className="rounded-full bg-white/[0.08] px-2 py-1 text-[10px] font-bold text-[#E8D48A]">
                              {formatAmount(hand.bet)} · {hand.score.total}
                              {hand.score.soft ? ' SOFT' : ''}
                            </div>
                          </div>
                          <div className="flex min-h-[132px] flex-wrap items-center justify-center gap-2">
                            {hand.cards.map((card, cardIndex) => (
                              <CardImage key={`${hand.id}-${cardIndex}-${card.rank}-${card.suit}`} card={card} />
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
              disabled={Boolean(round && round.status === 'ACTIVE') || busy}
            />

            <div className="mt-6 grid grid-cols-2 gap-2">
              {!round && (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={busy || balance < amount}
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
                    disabled={busy || !round.canHit}
                    onClick={() => runAction('/games/blackjack/hit')}
                  />
                  <ActionButton
                    icon={<Hand className="h-4 w-4" aria-hidden="true" />}
                    label={t.games.blackjack.stand}
                    disabled={busy || !round.canStand}
                    onClick={() => runAction('/games/blackjack/stand')}
                  />
                  <ActionButton
                    icon={<BadgeDollarSign className="h-4 w-4" aria-hidden="true" />}
                    label={t.games.blackjack.double}
                    disabled={busy || !round.canDouble || balance < Number.parseFloat(activeHand?.bet ?? '0')}
                    onClick={() => runAction('/games/blackjack/double')}
                  />
                  <ActionButton
                    icon={<Scissors className="h-4 w-4" aria-hidden="true" />}
                    label={t.games.blackjack.split}
                    disabled={busy || !round.canSplit || balance < Number.parseFloat(activeHand?.bet ?? '0')}
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
                {t.bet.balance} <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
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

function CardImage({ card }: { card: BlackjackCard }) {
  const path = getCardAssetPath(card);
  const label = `${rankLabel(card.rank)} ${suitLabel(card.suit)}`;
  return (
    <img
      src={path}
      alt={label}
      className="h-[122px] w-[82px] rounded-[8px] object-contain shadow-[0_14px_28px_rgba(0,0,0,0.38)] sm:h-[148px] sm:w-[100px]"
      draggable={false}
    />
  );
}

function CardBack() {
  return (
    <div className="flex h-[122px] w-[82px] items-center justify-center rounded-[8px] border border-[#E8D48A]/50 bg-[radial-gradient(circle_at_50%_35%,rgba(232,212,138,0.34),transparent_30%),linear-gradient(135deg,#07111E,#143B4C_52%,#07111E)] shadow-[0_14px_28px_rgba(0,0,0,0.38)] sm:h-[148px] sm:w-[100px]">
      <div className="rounded-full border border-[#E8D48A]/45 px-3 py-2 text-[10px] font-black tracking-[0.22em] text-[#E8D48A]">
        BG
      </div>
    </div>
  );
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
