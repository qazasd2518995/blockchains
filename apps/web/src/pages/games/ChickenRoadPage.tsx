import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Car, Flag, Gauge, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  ChickenRoadCashoutResult,
  ChickenRoadDifficulty,
  ChickenRoadRoundState,
  ChickenRoadStartRequest,
  ChickenRoadStepResult,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount, formatMultiplier } from '@/lib/utils';

const TOTAL_STEPS = 20;

const DIFFICULTIES: Array<{
  id: ChickenRoadDifficulty;
  label: string;
  desc: string;
  tone: string;
}> = [
  { id: 'easy', label: '簡單', desc: '慢速車流，倍率穩定累積', tone: 'LOW' },
  { id: 'medium', label: '普通', desc: '標準車流，風險與倍率均衡', tone: 'MID' },
  { id: 'hard', label: '困難', desc: '高速車流，倍率成長更快', tone: 'HIGH' },
  { id: 'hardcore', label: '瘋狂', desc: '極高波動，單步倍率暴衝', tone: 'MAX' },
];

export function ChickenRoadPage() {
  const { user, setBalance } = useAuthStore();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [difficulty, setDifficulty] = useState<ChickenRoadDifficulty>('medium');
  const [round, setRound] = useState<ChickenRoadRoundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

  useEffect(() => {
    void api
      .get<{ state: ChickenRoadRoundState | null }>('/games/chicken-road/active')
      .then((res) => {
        if (res.data.state) {
          setRound(res.data.state);
          setDifficulty(res.data.state.difficulty);
        }
      })
      .catch(() => undefined);
  }, []);

  const currentStep = round?.currentStep ?? 0;
  const totalSteps = round?.totalSteps ?? TOTAL_STEPS;
  const isActive = round?.status === 'ACTIVE';
  const isBusted = round?.status === 'BUSTED';
  const isCashedOut = round?.status === 'CASHED_OUT';
  const currentMultiplier = round ? Number.parseFloat(round.currentMultiplier) : 1;
  const potentialPayout = round ? Number.parseFloat(round.potentialPayout) : amount;
  const progress = Math.min(1, Math.max(0, currentStep / totalSteps));
  const chickenState = isBusted ? 'busted' : busy ? 'hop' : 'idle';

  const nextLaneLabel = useMemo(() => {
    if (!round || !round.nextMultiplier) return '終點';
    return `下一步 ${formatMultiplier(round.nextMultiplier)}`;
  }, [round]);

  const start = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount <= 0 || amount > balance) {
      setError('餘額不足');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: ChickenRoadStartRequest = { amount, difficulty };
      const res = await api.post<ChickenRoadRoundState>('/games/chicken-road/start', payload);
      setRound(res.data);
      setBalance((balance - amount).toFixed(2));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const step = async () => {
    if (!round || round.status !== 'ACTIVE' || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ChickenRoadStepResult>('/games/chicken-road/step', {
        roundId: round.roundId,
      });
      setRound(res.data.state);
      if (res.data.newBalance) setBalance(res.data.newBalance);
      if (res.data.hit) {
        pushHistory(res.data.state, false, 0, 0);
      } else if (res.data.autoCashedOut) {
        const mult = Number.parseFloat(res.data.state.currentMultiplier);
        const payout = Number.parseFloat(res.data.payout ?? res.data.state.potentialPayout);
        pushHistory(res.data.state, true, mult, payout);
      }
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const cashout = async () => {
    if (!round || round.status !== 'ACTIVE' || round.currentStep <= 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<ChickenRoadCashoutResult>('/games/chicken-road/cashout', {
        roundId: round.roundId,
      });
      setRound(res.data.state);
      setBalance(res.data.newBalance);
      if (res.data.state.status === 'BUSTED') {
        pushHistory(res.data.state, false, 0, 0);
      } else {
        pushHistory(
          res.data.state,
          true,
          Number.parseFloat(res.data.state.currentMultiplier),
          Number.parseFloat(res.data.payout),
        );
      }
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const resetRound = () => {
    if (isActive) return;
    setRound(null);
    setError(null);
  };

  const pushHistory = (
    state: ChickenRoadRoundState,
    won: boolean,
    multiplier: number,
    payout: number,
  ) => {
    const betAmount = Number.parseFloat(state.amount);
    setHistory((prev) => [
      {
        id: `${state.roundId}-${Date.now()}`,
        timestamp: Date.now(),
        betAmount,
        multiplier,
        payout,
        won,
        detail: `${state.currentStep}/${state.totalSteps} 車道 · ${difficultyLabel(state.difficulty)}`,
      },
      ...prev,
    ].slice(0, 30));
  };

  return (
    <div>
      <GameHeader
        artwork="/game-art/chicken-road/background.png"
        section="§ GAME 30"
        breadcrumb="CHICKEN_30"
        title="小雞過馬路"
        titleSuffix="CHICKEN ROAD"
        titleSuffixColor="ember"
        description="一步一步穿越車道，倍率會越過越高；在車子撞到前隨時領取。"
        rtpLabel="RTP 97%"
        rtpAccent="ember"
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="chicken-road-stage game-stage-panel scanlines">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">小雞過馬路</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Chicken Road</span>
              <div className="flex items-center gap-3 text-white/72">
                <span>{round ? `${currentStep}/${totalSteps} 車道` : 'READY'}</span>
                {isActive && <span className="text-[#7DD3FC]"><span className="dot-online" /> LIVE</span>}
                {isBusted && <span className="text-[#FCA5A5]">撞車</span>}
                {isCashedOut && <span className="text-[#6EE7B7]">已領取</span>}
              </div>
            </div>

            <div className="chicken-road-arena">
              <div className="chicken-road-road-bg" aria-hidden="true" />
              <div className="chicken-road-cars" aria-hidden="true">
                {Array.from({ length: 10 }, (_, index) => (
                  <span
                    key={index}
                    className={`chicken-road-car chicken-road-car--${index % 4}`}
                    style={{
                      top: `${12 + index * 7.8}%`,
                      animationDelay: `${-(index * 0.62)}s`,
                      animationDuration: `${5.6 + (index % 4) * 0.7}s`,
                    }}
                  />
                ))}
              </div>

              <div className="chicken-road-track" aria-label="過馬路進度">
                {Array.from({ length: totalSteps }, (_, rawIndex) => {
                  const stepNumber = totalSteps - rawIndex;
                  const crossed = stepNumber <= currentStep;
                  const isNext = isActive && stepNumber === currentStep + 1;
                  const hit = round?.hitStep === stepNumber;
                  const revealedSafe = round?.path?.[stepNumber - 1] === true;
                  return (
                    <div
                      key={stepNumber}
                      className={`chicken-road-tile ${crossed ? 'chicken-road-tile--crossed' : ''} ${isNext ? 'chicken-road-tile--next' : ''} ${hit ? 'chicken-road-tile--hit' : ''} ${revealedSafe && round?.path ? 'chicken-road-tile--safe' : ''}`}
                    >
                      <span>{stepNumber}</span>
                    </div>
                  );
                })}
              </div>

              <div
                className={`chicken-road-chicken chicken-road-chicken--${chickenState}`}
                style={{ bottom: `${6 + progress * 84}%` }}
                aria-hidden="true"
              />

              <div className="chicken-road-meter">
                <span>目前倍率</span>
                <strong>{formatMultiplier(currentMultiplier)}</strong>
                <small>{nextLaneLabel}</small>
              </div>
            </div>
          </div>

          {round && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Stat icon={Gauge} label="目前倍率" value={formatMultiplier(round.currentMultiplier)} />
              <Stat icon={Flag} label="下一步" value={round.nextMultiplier ? formatMultiplier(round.nextMultiplier) : '終點'} />
              <Stat icon={Trophy} label="可領取" value={formatAmount(round.potentialPayout)} />
              <Stat icon={Car} label="進度" value={`${round.currentStep}/${round.totalSteps}`} />
            </div>
          )}

          {isBusted && round && (
            <div className="game-result-card game-result-card-loss">
              <div className="font-display text-4xl text-[#FCA5A5]">小雞被車撞到了</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                本局虧損 -{formatAmount(round.amount)}
              </div>
            </div>
          )}
          {isCashedOut && round && (
            <div className="game-result-card game-result-card-win">
              <div className="font-display text-4xl text-[#7DD3FC]">成功過馬路</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                派彩 +{formatAmount(round.potentialPayout)}
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
              disabled={isActive || busy}
            />

            <div className="mt-6">
              <div className="label">難度</div>
              <div className="mt-2 grid gap-2">
                {DIFFICULTIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDifficulty(item.id)}
                    disabled={isActive || busy}
                    className={`chicken-road-difficulty ${difficulty === item.id ? 'chicken-road-difficulty--active' : ''}`}
                  >
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.desc}</small>
                    </span>
                    <em>{item.tone}</em>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-2">
              {!isActive ? (
                <button type="button" onClick={() => void start()} disabled={busy} className="btn-primary w-full">
                  → 開始穿越 · {formatAmount(amount)}
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => void step()} disabled={busy} className="btn-primary w-full">
                    → 前進一步 {round?.nextMultiplier ? `· ${formatMultiplier(round.nextMultiplier)}` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => void cashout()}
                    disabled={busy || currentStep <= 0}
                    className="game-choice-btn game-choice-btn-acid min-h-[46px]"
                  >
                    領取 · {formatAmount(potentialPayout)}
                  </button>
                </>
              )}
              {round && !isActive && (
                <button type="button" onClick={resetRound} className="game-choice-btn min-h-[44px]">
                  再來一局
                </button>
              )}
            </div>
          </div>

          <div className="game-side-card p-5">
            <div className="label">玩法邏輯</div>
            <div className="mt-3 space-y-2 text-[12px] leading-6 text-white/68">
              <p>每前進一格，倍率依難度提升。</p>
              <p>玩家可隨時領取；若該格被車撞到，本局本金歸零。</p>
              <p>難度只調整波動，整體 RTP 固定 97%。</p>
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}

function difficultyLabel(difficulty: ChickenRoadDifficulty): string {
  return DIFFICULTIES.find((item) => item.id === difficulty)?.label ?? difficulty;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-[#07131F]/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
        <Icon className="h-3.5 w-3.5 text-[#E8D48A]" aria-hidden="true" />
        {label}
      </div>
      <div className="data-num mt-2 text-xl font-black text-white">{value}</div>
    </div>
  );
}
