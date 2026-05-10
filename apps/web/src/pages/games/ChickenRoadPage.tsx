import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AlertCircle, Car, Flag, Gauge, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  MIN_BET_AMOUNT,
  type ChickenRoadCashoutResult,
  type ChickenRoadDifficulty,
  type ChickenRoadRoundState,
  type ChickenRoadStartRequest,
  type ChickenRoadStepResult,
} from '@bg/shared';
import { CHICKEN_ROAD_TOTAL_STEPS, chickenRoadMultiplier } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { BetControls } from '@/components/game/BetControls';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount, formatMultiplier } from '@/lib/utils';

const DESKTOP_VISIBLE_STEP_COUNT = 12;

type ViewportSize = {
  width: number;
  height: number;
};

function readViewportSize(): ViewportSize {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 };
  }

  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width ?? window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
  };
}

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

const TRAFFIC_SPEED_BY_DIFFICULTY: Record<ChickenRoadDifficulty, number> = {
  easy: 1.25,
  medium: 1,
  hard: 0.82,
  hardcore: 0.66,
};

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
  const [viewportSize, setViewportSize] = useState<ViewportSize>(readViewportSize);

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

  useEffect(() => {
    const updateViewportSize = () => {
      const next = readViewportSize();
      setViewportSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);
    window.addEventListener('orientationchange', updateViewportSize);
    window.visualViewport?.addEventListener('resize', updateViewportSize);

    return () => {
      window.removeEventListener('resize', updateViewportSize);
      window.removeEventListener('orientationchange', updateViewportSize);
      window.visualViewport?.removeEventListener('resize', updateViewportSize);
    };
  }, []);

  const currentStep = round?.currentStep ?? 0;
  const totalSteps = round?.totalSteps ?? CHICKEN_ROAD_TOTAL_STEPS;
  const isActive = round?.status === 'ACTIVE';
  const isBusted = round?.status === 'BUSTED';
  const isCashedOut = round?.status === 'CASHED_OUT';
  const currentMultiplier = round ? Number.parseFloat(round.currentMultiplier) : 1;
  const potentialPayout = round ? Number.parseFloat(round.potentialPayout) : amount;
  const visualStep = isBusted && round?.hitStep ? round.hitStep : currentStep;
  const chickenState = isBusted ? 'busted' : isCashedOut ? 'cashout' : busy ? 'hop' : 'idle';
  const selectedDifficulty =
    DIFFICULTIES.find((item) => item.id === difficulty) ?? DIFFICULTIES[1]!;
  const profitPreview = Math.max(
    0,
    potentialPayout - (round ? Number.parseFloat(round.amount) : amount),
  );
  const stepMultipliers = useMemo(
    () =>
      Array.from({ length: totalSteps }, (_, index) =>
        chickenRoadMultiplier(difficulty, index + 1),
      ),
    [difficulty, totalSteps],
  );
  const visibleStepCount = useMemo(() => {
    if (viewportSize.width <= 430) return 6;
    if (viewportSize.width <= 640) return 8;
    if (viewportSize.height <= 520 && viewportSize.width <= 980) return 8;
    if (viewportSize.width <= 980) return 10;
    return DESKTOP_VISIBLE_STEP_COUNT;
  }, [viewportSize.height, viewportSize.width]);
  const visibleStepStart = visualStep <= visibleStepCount ? 1 : visualStep - visibleStepCount + 1;
  const visibleSteps = useMemo(
    () => Array.from({ length: visibleStepCount }, (_, index) => visibleStepStart + index),
    [visibleStepCount, visibleStepStart],
  );
  const runnerSlot =
    visualStep <= 0
      ? -0.55
      : Math.min(visibleStepCount - 0.5, Math.max(0.5, visualStep - visibleStepStart + 0.5));
  const runnerLeft = visualStep <= 0 ? 8 : 12 + (runnerSlot / visibleStepCount) * 88;
  const cameraOffset = Math.max(0, visibleStepStart - 1);
  const visibleTraffic = useMemo(
    () =>
      visibleSteps.map((stepNumber) => {
        const cue = trafficCueForStep(stepNumber, difficulty);
        return {
          ...cue,
          stepNumber,
          left: laneCenterPercent(stepNumber, visibleStepStart, visibleStepCount),
        };
      }),
    [difficulty, visibleStepCount, visibleStepStart, visibleSteps],
  );
  const hitTraffic =
    isBusted && round?.hitStep
      ? {
          ...trafficCueForStep(round.hitStep, difficulty),
          left: laneCenterPercent(round.hitStep, visibleStepStart, visibleStepCount),
        }
      : null;

  const nextLaneLabel = useMemo(() => {
    if (!round) return `第一格 ${formatMultiplier(stepMultipliers[0] ?? 1)}`;
    if (!round.nextMultiplier) return '路線上限';
    return `下一步 ${formatMultiplier(round.nextMultiplier)}`;
  }, [round, stepMultipliers]);

  const start = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount < MIN_BET_AMOUNT || amount > balance) {
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
    setHistory((prev) =>
      [
        {
          id: `${state.roundId}-${Date.now()}`,
          timestamp: Date.now(),
          betAmount,
          multiplier,
          payout,
          won,
          detail: `第 ${state.currentStep} 格 · ${difficultyLabel(state.difficulty)}`,
        },
        ...prev,
      ].slice(0, 30),
    );
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
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={busy}
                  className="chicken-road-primary"
                >
                  投注
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void step()}
                    disabled={busy}
                    className="chicken-road-primary"
                  >
                    跳下一格
                  </button>
                  <button
                    type="button"
                    onClick={() => void cashout()}
                    disabled={busy || currentStep <= 0}
                    className="chicken-road-cashout"
                  >
                    <span>領取</span>
                    <strong>{formatAmount(potentialPayout)}</strong>
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
              <small>
                總利潤 {formatAmount(profitPreview)} · {formatMultiplier(currentMultiplier)}
              </small>
            </div>
          </div>
        </aside>

        <section className="chicken-road-road-panel">
          <div className="chicken-road-road-topbar">
            <div>
              <strong>小雞過馬路</strong>
              <span>CHICKEN ROAD</span>
            </div>
            <div className="chicken-road-status">{round ? `第 ${currentStep} 格` : 'READY'}</div>
          </div>

          <div
            className="chicken-road-road"
            style={{ '--chicken-road-camera': cameraOffset } as CSSProperties}
          >
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
              style={
                {
                  gridTemplateColumns: `repeat(${visibleStepCount}, minmax(0, 1fr))`,
                } as CSSProperties
              }
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
              {visibleTraffic.map((car) => (
                <span
                  key={`${car.stepNumber}-${car.sprite}`}
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
              {hitTraffic && (
                <span
                  className={`chicken-road-hit-car chicken-road-traffic-car--${hitTraffic.sprite} ${
                    hitTraffic.reverse ? 'chicken-road-hit-car--up' : 'chicken-road-hit-car--down'
                  }`}
                  style={{ left: `${hitTraffic.left}%` }}
                />
              )}
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
              <div
                className={`chicken-road-result ${isBusted ? 'chicken-road-result--loss' : 'chicken-road-result--win'}`}
              >
                <strong>{isBusted ? '闖關失敗' : '成功領取'}</strong>
                <span>
                  {isBusted
                    ? `-${formatAmount(round.amount)}`
                    : `+${formatAmount(round.potentialPayout)}`}
                </span>
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
          value={
            round?.nextMultiplier
              ? formatMultiplier(round.nextMultiplier)
              : formatMultiplier(stepMultipliers[0] ?? 1)
          }
        />
        <Stat icon={Trophy} label="可領取" value={formatAmount(potentialPayout)} />
        <Stat icon={Car} label="已通過" value={`${currentStep} 格`} />
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
            <p>每前進一格，倍率依難度提升，道路會持續往右延伸。</p>
            <p>玩家可隨時領取；若進入車流命中區，本局本金歸零。</p>
            <p>路段最長 500 格，玩法核心是撐越遠倍率越高，直到命中車流或自行領取。</p>
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

function trafficCueForStep(
  stepNumber: number,
  difficulty: ChickenRoadDifficulty,
): {
  sprite: number;
  reverse: boolean;
  duration: number;
  delay: number;
} {
  const seed = stepNumber * 1103515245 + difficulty.length * 2654435761;
  const sprite = Math.abs(seed) % 8;
  const reverse = stepNumber % 2 === 0;
  const speedFactor = TRAFFIC_SPEED_BY_DIFFICULTY[difficulty] ?? 1;
  const baseDuration = 4.9 + (Math.abs(seed >> 7) % 34) / 10;
  const duration = Number((baseDuration * speedFactor).toFixed(2));
  const delay = -Number((((Math.abs(seed >> 13) % 100) / 100) * duration).toFixed(2));
  return { sprite, reverse, duration, delay };
}

function laneCenterPercent(
  stepNumber: number,
  visibleStepStart: number,
  visibleStepCount: number,
): number {
  const slot = Math.min(visibleStepCount - 0.5, Math.max(0.5, stepNumber - visibleStepStart + 0.5));
  return Number(((slot / visibleStepCount) * 100).toFixed(3));
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
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
