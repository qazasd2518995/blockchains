import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertCircle, Car, Flag, Gauge, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  ChickenRoadCashoutResult,
  ChickenRoadDifficulty,
  ChickenRoadRoundState,
  ChickenRoadStartRequest,
  ChickenRoadStepResult,
} from '@bg/shared';
import { chickenRoadMultiplier } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { BetControls } from '@/components/game/BetControls';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount, formatMultiplier } from '@/lib/utils';

const TOTAL_STEPS = 20;
const VISIBLE_STEP_COUNT = 12;

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

const TRAFFIC_CARS = [
  { id: 'taxi-a', sprite: 2, left: 23, delay: -0.7, duration: 5.8, reverse: false },
  { id: 'police-a', sprite: 3, left: 34, delay: -2.5, duration: 6.7, reverse: true },
  { id: 'red-a', sprite: 0, left: 46, delay: -1.2, duration: 5.4, reverse: false },
  { id: 'truck-a', sprite: 5, left: 57, delay: -3.6, duration: 8.4, reverse: true },
  { id: 'blue-a', sprite: 1, left: 68, delay: -0.4, duration: 6.2, reverse: false },
  { id: 'bus-a', sprite: 4, left: 79, delay: -4.1, duration: 9.1, reverse: true },
  { id: 'orange-a', sprite: 6, left: 90, delay: -1.9, duration: 5.2, reverse: false },
  { id: 'van-a', sprite: 7, left: 96, delay: -5.3, duration: 7.6, reverse: true },
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
  const visualStep = isBusted && round?.hitStep ? round.hitStep : currentStep;
  const chickenState = isBusted ? 'busted' : isCashedOut ? 'cashout' : busy ? 'hop' : 'idle';
  const selectedDifficulty = DIFFICULTIES.find((item) => item.id === difficulty) ?? DIFFICULTIES[1]!;
  const profitPreview = Math.max(0, potentialPayout - (round ? Number.parseFloat(round.amount) : amount));
  const stepMultipliers = useMemo(
    () => Array.from({ length: totalSteps }, (_, index) => chickenRoadMultiplier(difficulty, index + 1)),
    [difficulty, totalSteps],
  );
  const visibleStepCount = Math.min(totalSteps, VISIBLE_STEP_COUNT);
  const visibleStepStart = Math.min(
    Math.max(1, visualStep - (visibleStepCount - 4)),
    Math.max(1, totalSteps - visibleStepCount + 1),
  );
  const visibleSteps = useMemo(
    () => Array.from({ length: visibleStepCount }, (_, index) => visibleStepStart + index),
    [visibleStepCount, visibleStepStart],
  );
  const runnerSlot =
    visualStep <= 0
      ? -0.55
      : Math.min(visibleStepCount - 0.5, Math.max(0.5, visualStep - visibleStepStart + 0.5));
  const runnerLeft = visualStep <= 0 ? 8 : 12 + (runnerSlot / visibleStepCount) * 88;

  const nextLaneLabel = useMemo(() => {
    if (!round) return `第一格 ${formatMultiplier(stepMultipliers[0] ?? 1)}`;
    if (!round.nextMultiplier) return '終點';
    return `下一步 ${formatMultiplier(round.nextMultiplier)}`;
  }, [round, stepMultipliers]);

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
    <div className="chicken-road-page">
      <section className="chicken-road-arcade" aria-label="小雞過馬路遊戲">
        <aside className="chicken-road-control-panel">
          <div className="chicken-road-control-tabs" aria-label="投注模式">
            <span>手動投注</span>
          </div>

          <div className="chicken-road-control-body">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              disabled={isActive || busy}
            />

            <label className="chicken-road-select-label">
              <span>難度</span>
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as ChickenRoadDifficulty)}
                disabled={isActive || busy}
                className="chicken-road-select"
              >
                {DIFFICULTIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="chicken-road-difficulty-summary">
              <span>{selectedDifficulty.tone}</span>
              <strong>{selectedDifficulty.desc}</strong>
            </div>

            <div className="chicken-road-actions">
              {!isActive ? (
                <button type="button" onClick={() => void start()} disabled={busy} className="chicken-road-primary">
                  投注
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => void step()} disabled={busy} className="chicken-road-primary">
                    跳下一格
                  </button>
                  <button
                    type="button"
                    onClick={() => void cashout()}
                    disabled={busy || currentStep <= 0}
                    className="chicken-road-cashout"
                  >
                    領取
                  </button>
                </>
              )}
              {round && !isActive && (
                <button type="button" onClick={resetRound} className="chicken-road-reset">
                  再來一局
                </button>
              )}
            </div>

            <div className="chicken-road-profit-box">
              <span>可領取</span>
              <strong>{formatAmount(potentialPayout)}</strong>
              <small>總利潤 {formatAmount(profitPreview)} · {formatMultiplier(currentMultiplier)}</small>
            </div>
          </div>
        </aside>

        <section className="chicken-road-road-panel">
          <div className="chicken-road-road-topbar">
            <div>
              <strong>小雞過馬路</strong>
              <span>CHICKEN ROAD</span>
            </div>
            <div className="chicken-road-status">
              {round ? `${currentStep}/${totalSteps}` : 'READY'}
            </div>
          </div>

          <div className="chicken-road-road">
            <div className="chicken-road-sidewalk" aria-hidden="true">
              <div className="chicken-road-traffic-light">
                <span />
                <span />
              </div>
              <div className="chicken-road-start-zone" />
            </div>

            <div
              className="chicken-road-lanes"
              aria-label="過馬路進度"
              style={{ gridTemplateColumns: `repeat(${visibleStepCount}, minmax(0, 1fr))` } as CSSProperties}
            >
              {visibleSteps.map((stepNumber) => {
                const crossed = stepNumber <= currentStep;
                const isNext = isActive && stepNumber === currentStep + 1;
                const hit = round?.hitStep === stepNumber;
                const revealedSafe = round?.path?.[stepNumber - 1] === true;
                const multiplier = stepMultipliers[stepNumber - 1] ?? 1;
                return (
                  <div
                    key={stepNumber}
                    className={`chicken-road-lane ${crossed ? 'chicken-road-lane--crossed' : ''} ${isNext ? 'chicken-road-lane--next' : ''} ${hit ? 'chicken-road-lane--hit' : ''} ${revealedSafe && round?.path ? 'chicken-road-lane--safe' : ''}`}
                  >
                    <span className="chicken-road-lane__step">{stepNumber}</span>
                    <span className="chicken-road-lane__mult">{formatMultiplier(multiplier)}</span>
                  </div>
                );
              })}
            </div>

            <div className="chicken-road-traffic" aria-hidden="true">
              {TRAFFIC_CARS.map((car) => (
                <span
                  key={car.id}
                  className={`chicken-road-traffic-car chicken-road-traffic-car--${car.sprite} ${
                    car.reverse ? 'chicken-road-traffic-car--up' : 'chicken-road-traffic-car--down'
                  }`}
                  style={{
                    left: `${car.left}%`,
                    animationDelay: `${car.delay}s`,
                    animationDuration: `${car.duration}s`,
                  }}
                />
              ))}
            </div>

            <div
              className={`chicken-road-runner chicken-road-runner--${chickenState}`}
              style={{ left: `${runnerLeft}%` }}
              aria-hidden="true"
            />

            <div className="chicken-road-meter">
              <span>目前倍率</span>
              <strong>{formatMultiplier(currentMultiplier)}</strong>
              <small>{nextLaneLabel}</small>
            </div>

            {(isBusted || isCashedOut) && round && (
              <div className={`chicken-road-result ${isBusted ? 'chicken-road-result--loss' : 'chicken-road-result--win'}`}>
                <strong>{isBusted ? '撞車失敗' : '成功領取'}</strong>
                <span>{isBusted ? `-${formatAmount(round.amount)}` : `+${formatAmount(round.potentialPayout)}`}</span>
              </div>
            )}
          </div>
        </section>
      </section>

      <div className="chicken-road-info-grid">
        <Stat icon={Gauge} label="目前倍率" value={formatMultiplier(currentMultiplier)} />
        <Stat
          icon={Flag}
          label="下一步"
          value={round?.nextMultiplier ? formatMultiplier(round.nextMultiplier) : formatMultiplier(stepMultipliers[0] ?? 1)}
        />
        <Stat icon={Trophy} label="可領取" value={formatAmount(potentialPayout)} />
        <Stat icon={Car} label="進度" value={`${currentStep}/${totalSteps}`} />
      </div>

      {error && (
        <div className="game-alert mt-4 text-[12px]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="leading-relaxed">{error.toUpperCase()}</span>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
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
