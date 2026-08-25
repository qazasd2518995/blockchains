import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FastForward, ShieldCheck, Sparkles, Volume2, X, Zap } from 'lucide-react';
import { Sfx } from '@bg/game-engine';
import {
  THOR2_BUY_COST_MULTIPLIERS,
  type Thor2Cascade,
  type Thor2Cell,
  type Thor2Round,
  type Thor2SessionResult,
  type Thor2SpinAction,
  type Thor2SpinResult,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import './PowerOfThor2Page.css';

const ASSET_ROOT = '/games/power-of-thor-2/ui';
const DEFAULT_GRID: Thor2Cell[] = Array.from({ length: 30 }, (_, index) => ({
  symbol: [3, 4, 5, 6, 9, 10, 11, 12, 13][index % 9] ?? 13,
}));
const BETS = [1, 2, 5, 10, 20] as const;
const SYMBOL_IMAGES: Partial<Record<number, string>> = {
  1: 'base_symbolB1.png',
  3: 'base_symbolM1.png',
  4: 'base_symbolM2.png',
  5: 'base_symbolM3.png',
  6: 'base_symbolM4.png',
  9: 'base_symbolA.png',
  10: 'base_symbolK.png',
  11: 'base_symbolQ.png',
  12: 'base_symbolJ.png',
  20: 'base_symbolB2.png',
};
const AUDIO_FILES = {
  spin: 'spin.mp3',
  win: 'win.mp3',
  collect: 'multiplier-collect.mp3',
  hit: 'multiplier-hit.mp3',
  big: 'big-win.mp3',
  legend: 'legend-win.mp3',
} as const;

type SoundName = keyof typeof AUDIO_FILES;
type BuyAction = 'regular' | 'super' | 'lucky';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function operationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `thor2_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
}

function displayCells(grid: readonly Thor2Cell[]) {
  return Array.from({ length: 30 }, (_, displayIndex) => {
    const row = Math.floor(displayIndex / 6);
    const reel = displayIndex % 6;
    const position = reel * 5 + row;
    return { cell: grid[position] ?? { symbol: 13 }, position };
  });
}

function multiplierClass(value: number): string {
  if (value >= 1_000) return 'thor2-ball--white';
  if (value >= 100) return 'thor2-ball--red';
  if (value >= 50) return 'thor2-ball--purple';
  if (value >= 10) return 'thor2-ball--blue';
  return 'thor2-ball--green';
}

function SymbolCell({
  value,
  position,
  winning,
  upgrading,
}: {
  value: Thor2Cell;
  position: number;
  winning: boolean;
  upgrading: boolean;
}) {
  if (value.multiplier) {
    return (
      <div
        className={`thor2-symbol thor2-ball ${multiplierClass(value.multiplier)}${upgrading ? ' thor2-symbol--upgrade' : ''}`}
        data-position={position}
      >
        <span>{value.multiplier}×</span>
      </div>
    );
  }
  const image = SYMBOL_IMAGES[value.symbol];
  return (
    <div className={`thor2-symbol${winning ? ' thor2-symbol--win' : ''}`} data-position={position}>
      {image ? (
        <img src={`${ASSET_ROOT}/symbols/${image}`} alt="" draggable={false} />
      ) : (
        <span className="thor2-ten">10</span>
      )}
    </div>
  );
}

export function PowerOfThor2Page() {
  const user = useAuthStore((state) => state.user);
  const setBalance = useAuthStore((state) => state.setBalance);
  const [grid, setGrid] = useState<Thor2Cell[]>(DEFAULT_GRID);
  const [amount, setAmount] = useState(1);
  const [extraBet, setExtraBet] = useState(false);
  const [busy, setBusy] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Thor2SpinResult | null>(null);
  const [featureRound, setFeatureRound] = useState<{ current: number; total: number } | null>(null);
  const [featureKind, setFeatureKind] = useState<string | null>(null);
  const [winningPositions, setWinningPositions] = useState<Set<number>>(new Set());
  const [upgradingPositions, setUpgradingPositions] = useState<Set<number>>(new Set());
  const [roundWin, setRoundWin] = useState(0);
  const [fastMode, setFastMode] = useState(false);
  const fastModeRef = useRef(false);
  const playbackRef = useRef(0);
  const audioRef = useRef(new Map<SoundName, HTMLAudioElement>());
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicModeRef = useRef<'base' | 'free'>('base');

  useEffect(() => {
    fastModeRef.current = fastMode;
  }, [fastMode]);

  const playSound = useCallback((name: SoundName) => {
    if (Sfx.isMuted()) return;
    let audio = audioRef.current.get(name);
    if (!audio) {
      audio = new Audio(`${ASSET_ROOT}/audio/${AUDIO_FILES[name]}`);
      audio.preload = 'auto';
      audioRef.current.set(name, audio);
    }
    audio.volume = Math.min(1, Sfx.getVolume());
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
  }, []);

  const playMusic = useCallback((mode: 'base' | 'free') => {
    musicModeRef.current = mode;
    if (Sfx.isMuted()) return;
    const src = `${ASSET_ROOT}/audio/${mode === 'free' ? 'free-music.mp3' : 'base-music.mp3'}`;
    let audio = musicRef.current;
    if (!audio) {
      audio = new Audio(src);
      audio.loop = true;
      audio.preload = 'auto';
      musicRef.current = audio;
    }
    if (!audio.src.endsWith(src)) {
      audio.pause();
      audio.src = src;
    }
    audio.volume = Math.min(0.55, Sfx.getVolume());
    void audio.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    const unsubscribe = Sfx.subscribe((prefs) => {
      const music = musicRef.current;
      if (!music) return;
      if (prefs.muted) music.pause();
      else playMusic(musicModeRef.current);
    });
    return () => {
      playbackRef.current += 1;
      unsubscribe();
      musicRef.current?.pause();
      audioRef.current.forEach((audio) => audio.pause());
    };
  }, [playMusic]);

  const animateCascade = useCallback(
    async (cascade: Thor2Cascade, token: number) => {
      if (token !== playbackRef.current) return false;
      setGrid(cascade.before);
      setSpinning(true);
      await wait(fastModeRef.current ? 90 : 230);
      if (token !== playbackRef.current) return false;
      setSpinning(false);
      setWinningPositions(new Set(cascade.wins.flatMap((win) => win.positions)));
      setUpgradingPositions(new Set(cascade.upgrades.map((upgrade) => upgrade.position)));
      setRoundWin(cascade.payoutMultiplier);
      if (cascade.upgrades.length) playSound('hit');
      if (cascade.collectedMultiplier > 0) playSound('collect');
      else playSound('win');
      await wait(fastModeRef.current ? 130 : 480);
      if (token !== playbackRef.current) return false;
      setGrid(cascade.after);
      setWinningPositions(new Set());
      setUpgradingPositions(new Set());
      await wait(fastModeRef.current ? 80 : 260);
      return token === playbackRef.current;
    },
    [playSound],
  );

  const animateRound = useCallback(
    async (round: Thor2Round, token: number) => {
      setGrid(round.grid);
      setRoundWin(0);
      if (round.cascades.length === 0) {
        setSpinning(true);
        await wait(fastModeRef.current ? 120 : 420);
        setSpinning(false);
      } else {
        for (const cascade of round.cascades) {
          if (!(await animateCascade(cascade, token))) return false;
        }
      }
      if (token !== playbackRef.current) return false;
      setGrid(round.finalGrid);
      setRoundWin(round.payoutMultiplier);
      if (round.superBonusMultiplier > 0) playSound('legend');
      await wait(fastModeRef.current ? 90 : 280);
      return token === playbackRef.current;
    },
    [animateCascade, playSound],
  );

  const playResult = useCallback(
    async (spinResult: Thor2SpinResult, startCursor = 0, recovered = false) => {
      const token = ++playbackRef.current;
      setBusy(true);
      setResult(spinResult);
      setFeatureKind(spinResult.feature?.kind ?? null);
      try {
        if (!recovered && spinResult.feature?.kind !== 'lucky') {
          playMusic('base');
          playSound('spin');
          if (spinResult.cascades.length === 0) {
            setSpinning(true);
            await wait(fastModeRef.current ? 160 : 520);
            setGrid(spinResult.grid);
            setSpinning(false);
          } else {
            for (const cascade of spinResult.cascades) {
              if (!(await animateCascade(cascade, token))) return;
            }
          }
        }

        const feature = spinResult.feature;
        if (feature?.rounds.length) {
          playMusic('free');
          setFeatureRound({ current: startCursor, total: feature.rounds.length });
          if (!recovered) await wait(fastModeRef.current ? 180 : 780);
          for (let index = startCursor; index < feature.rounds.length; index += 1) {
            const round = feature.rounds[index];
            if (!round || !(await animateRound(round, token))) return;
            if (token !== playbackRef.current) return;
            const cursor = index + 1;
            setFeatureRound({ current: cursor, total: feature.rounds.length });
            await api.post('/games/thor2/feature/progress', { betId: spinResult.betId, cursor });
          }
          if (token !== playbackRef.current) return;
          const completed = await api.post<{ newBalance: string }>(
            '/games/thor2/feature/complete',
            {
              betId: spinResult.betId,
            },
          );
          setBalance(completed.data.newBalance);
          setFeatureRound(null);
          setFeatureKind(null);
          playMusic('base');
          if (spinResult.multiplier >= 1_000) playSound('legend');
          else if (spinResult.multiplier >= 50) playSound('big');
          else if (Number(spinResult.payout) > 0) playSound('win');
        } else if (Number(spinResult.payout) > 0) {
          playSound(spinResult.multiplier >= 50 ? 'big' : 'win');
        }
      } catch (cause) {
        if (token === playbackRef.current) setError(extractApiError(cause).message);
      } finally {
        if (token === playbackRef.current) {
          setSpinning(false);
          setBusy(false);
        }
      }
    },
    [animateCascade, animateRound, playMusic, playSound, setBalance],
  );

  useEffect(() => {
    let active = true;
    void api
      .get<Thor2SessionResult>('/games/thor2/session')
      .then(async ({ data }) => {
        if (!active) return;
        setBalance(data.balance);
        if (data.pendingFeature) {
          await playResult(data.pendingFeature, data.pendingFeature.featureCursor ?? 0, true);
        } else {
          setBusy(false);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(extractApiError(cause).message);
          setBusy(false);
        }
      });
    return () => {
      active = false;
      playbackRef.current += 1;
    };
  }, [playResult, setBalance]);

  const submit = useCallback(
    async (action: Thor2SpinAction) => {
      if (!user || busy) return;
      setBuyOpen(false);
      setError('');
      setRoundWin(0);
      setBusy(true);
      Sfx.unlock();
      playMusic('base');
      try {
        const response = await api.post<Thor2SpinResult>('/games/thor2/spin', {
          action,
          amount,
          operationId: operationId(),
        });
        setBalance(response.data.newBalance);
        await playResult(response.data);
      } catch (cause) {
        setError(extractApiError(cause).message);
        setBusy(false);
      }
    },
    [amount, busy, playMusic, playResult, setBalance, user],
  );

  const cells = useMemo(() => displayCells(grid), [grid]);
  const chargedAmount = amount * (extraBet ? 1.25 : 1);

  return (
    <section className={`thor2-game${featureRound ? ' thor2-game--free' : ''}`}>
      <div className="thor2-sky" aria-hidden="true" />
      <div className="thor2-stage">
        <div className="thor2-topline">
          <div>
            <span>POWER OF</span>
            <strong>THOR II</strong>
            <small>THUNDER STORM</small>
          </div>
          <div className="thor2-trust">
            <ShieldCheck /> 本地可驗證結算 · 最高 25,000×
          </div>
          <button type="button" onClick={() => setRulesOpen(true)} aria-label="開啟遊戲規則">
            <BookOpen />
          </button>
        </div>

        <div className="thor2-main">
          <aside className="thor2-side thor2-side--left">
            <button type="button" disabled={busy} onClick={() => setBuyOpen(true)}>
              <Sparkles />
              <span>購買免費遊戲</span>
            </button>
            <button
              type="button"
              disabled={busy}
              className={extraBet ? 'is-active' : ''}
              onClick={() => setExtraBet((value) => !value)}
            >
              <Zap />
              <span>額外下注 +25%</span>
            </button>
            <div className="thor2-meter">
              <span>總倍數</span>
              <strong>{result?.feature?.accumulatedMultiplier ?? 0}×</strong>
            </div>
          </aside>

          <div className="thor2-board-wrap">
            {featureRound && (
              <div className="thor2-free-banner">
                <span>{featureKind === 'super' ? 'SUPER FREE GAMES' : 'FREE GAMES'}</span>
                <strong>{Math.max(0, featureRound.total - featureRound.current)}</strong>
                <small>剩餘免費旋轉</small>
              </div>
            )}
            <div className={`thor2-board${spinning ? ' is-spinning' : ''}`}>
              {cells.map(({ cell, position }) => (
                <SymbolCell
                  key={position}
                  value={cell}
                  position={position}
                  winning={winningPositions.has(position)}
                  upgrading={upgradingPositions.has(position)}
                />
              ))}
            </div>
            <div className="thor2-winbar">
              <span>{busy ? '雷霆能量運轉中' : '本局派彩'}</span>
              <strong>{roundWin.toFixed(2)}×</strong>
            </div>
          </div>

          <aside className="thor2-side thor2-side--right">
            <img src={`${ASSET_ROOT}/help_feature_0.png`} alt="合法倍數球色階" />
            <div>
              <Volume2 /> 原始音效已接上
            </div>
            <button
              type="button"
              className={fastMode ? 'is-active' : ''}
              onClick={() => setFastMode((value) => !value)}
            >
              <FastForward /> 快速動畫
            </button>
          </aside>
        </div>

        <div className="thor2-controls">
          <div className="thor2-balance">
            <span>遊戲餘額</span>
            <strong>
              {Number(user?.balance ?? 0).toLocaleString('zh-TW', { minimumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="thor2-bet-picker">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAmount(
                  (current) =>
                    BETS[Math.max(0, BETS.indexOf(current as (typeof BETS)[number]) - 1)] ?? 1,
                )
              }
            >
              −
            </button>
            <div>
              <span>基本下注</span>
              <strong>{amount.toFixed(2)}</strong>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAmount(
                  (current) =>
                    BETS[
                      Math.min(BETS.length - 1, BETS.indexOf(current as (typeof BETS)[number]) + 1)
                    ] ?? 1,
                )
              }
            >
              ＋
            </button>
          </div>
          <div className="thor2-last-win">
            <span>上局總派彩</span>
            <strong>{result ? Number(result.payout).toFixed(2) : '0.00'}</strong>
          </div>
          <button
            type="button"
            className="thor2-spin"
            disabled={busy}
            onClick={() => void submit(extraBet ? 'extra' : 'spin')}
          >
            <span>{busy ? '播放中' : '旋轉'}</span>
            <small>{chargedAmount.toFixed(2)}</small>
          </button>
        </div>
        {error && (
          <div className="thor2-error" role="alert">
            {error}
          </div>
        )}
      </div>

      {buyOpen && (
        <div className="thor2-modal" role="dialog" aria-modal="true" aria-label="購買免費遊戲">
          <div className="thor2-buy-panel">
            <button className="thor2-modal-close" type="button" onClick={() => setBuyOpen(false)}>
              <X />
            </button>
            <h2>購買免費遊戲</h2>
            <p>
              目前基本下注 <strong>{amount.toFixed(2)}</strong>
              。購買時先扣費，所有免費局動畫播放完畢後才將派彩加入餘額。
            </p>
            <div className="thor2-buy-grid">
              {(
                [
                  ['regular', '免費遊戲', '15 局，標準倍數球與升級機率'],
                  ['super', 'Super 免費遊戲', '15 局，提高倍數球升級機率'],
                  [
                    'lucky',
                    'Lucky Strike',
                    '只轉 1 局；所有倍數球為 1000×，結果為 0 或最高獎（約 1/6.44）',
                  ],
                ] as const
              ).map(([action, title, detail]) => (
                <button key={action} type="button" onClick={() => void submit(action)}>
                  <span>{title}</span>
                  <small>{detail}</small>
                  <strong>{(amount * THOR2_BUY_COST_MULTIPLIERS[action]).toFixed(2)}</strong>
                  <em>{THOR2_BUY_COST_MULTIPLIERS[action]}× 基本下注</em>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
    </section>
  );
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="thor2-modal" role="dialog" aria-modal="true" aria-label="雷神之錘 2 遊戲規則">
      <div className="thor2-rules">
        <button className="thor2-modal-close" type="button" onClick={onClose}>
          <X />
        </button>
        <h2>雷神之錘 2：雷霆風暴</h2>
        <p>
          6×5 全盤消除玩法；同一普通符號在任意位置出現 8
          個以上即得獎，得獎符號消除後新符號落下並繼續連消。
        </p>
        <div className="thor2-rule-columns">
          <article>
            <h3>免費遊戲</h3>
            <ul>
              <li>4／5／6 個 Bonus 分別支付 3×／5×／100×，並觸發 15 局。</li>
              <li>免費遊戲內 3–6 個 Bonus 再送 5 局，總局數最多 100 局。</li>
              <li>倍數球會累積；Super 模式提高倍數升級機率。</li>
              <li>
                Bonus 觸發時同時出現 1／2／3／4 個 Super Bonus，另得 100×／500×／5,000×／25,000×。
              </li>
            </ul>
          </article>
          <article>
            <h3>購買與封頂</h3>
            <ul>
              <li>免費遊戲 100×；Super 免費遊戲 500×；Lucky Strike 4,000×。</li>
              <li>Lucky Strike 只轉 1 局，所有倍數球為 1000×；結果為 0 或 25,000×。</li>
              <li>額外下注為 1.25×，提高免費遊戲觸發機率；獎金仍依基本下注計算。</li>
              <li>合法倍數為 2、3、4、5、6、8、10、12、15、20、25、50、100、250、500、1000。</li>
              <li>單次遊戲總派彩最高為基本下注 25,000×。</li>
            </ul>
          </article>
        </div>
        <div className="thor2-paytable">
          <h3>普通符號賠率（8–9／10–11／12+）</h3>
          <div>M1：2×／5×／10×　M2：0.5×／2×／5×　M3：0.4×／1×／3×　M4：0.3×／0.4×／2.4×</div>
          <div>
            A：0.2×／0.3×／2×　K：0.16×／0.24×／1.6×　Q：0.1×／0.2×／1×　J：0.08×／0.18×／0.8×　10：0.05×／0.15×／0.4×
          </div>
        </div>
        <p className="thor2-rules-note">
          此頁依已保存的原始規則、介面與實際 1
          元測試流程製作；本地結算採可驗證種子模型，不宣稱複製第三方私有亂數或伺服器演算法。
        </p>
      </div>
    </div>
  );
}
