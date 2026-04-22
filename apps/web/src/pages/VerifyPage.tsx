import { useMemo, useState } from 'react';
import { ShieldCheck, Play, AlertCircle } from 'lucide-react';
import {
  diceRoll,
  diceWinChance,
  diceMultiplier,
  minesPositions,
  crashPoint,
  hiloDraw,
  kenoDraw,
  kenoEvaluate,
  kenoMultiplier,
  wheelSpin,
  wheelMultiplier,
  plinkoPath,
  plinkoMultiplier,
  rouletteSpin,
  hotlineSpin,
  hotlineEvaluate,
  towerLayout,
  type KenoRisk,
  type PlinkoRisk,
  type WheelRisk,
  type WheelSegmentCount,
  type TowerDifficulty,
} from '@bg/provably-fair';

type GameKey =
  | 'dice'
  | 'mines'
  | 'crash'
  | 'hilo'
  | 'keno'
  | 'wheel'
  | 'plinko'
  | 'roulette'
  | 'hotline'
  | 'tower';

const GAMES: { value: GameKey; label: string }[] = [
  { value: 'dice', label: '骰子 Dice' },
  { value: 'mines', label: '扫雷 Mines' },
  { value: 'crash', label: 'Crash 飞行' },
  { value: 'hilo', label: '猜大小 HiLo' },
  { value: 'keno', label: '基诺 Keno' },
  { value: 'wheel', label: '彩色转轮 Wheel' },
  { value: 'plinko', label: '弹珠台 Plinko' },
  { value: 'roulette', label: '迷你轮盘 Roulette' },
  { value: 'hotline', label: '热线 Hotline' },
  { value: 'tower', label: '叠塔 Tower' },
];

const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_SUITS = ['♠', '♥', '♦', '♣'];

export function VerifyPage() {
  const [game, setGame] = useState<GameKey>('dice');
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('0');
  const [salt, setSalt] = useState('');

  // 遊戲特定參數
  const [diceTarget, setDiceTarget] = useState('50');
  const [diceDirection, setDiceDirection] = useState<'under' | 'over'>('under');
  const [minesCount, setMinesCount] = useState('3');
  const [hiloCardIndex, setHiloCardIndex] = useState('0');
  const [kenoRisk, setKenoRisk] = useState<KenoRisk>('medium');
  const [kenoPicks, setKenoPicks] = useState('1,2,3,4,5');
  const [wheelRisk, setWheelRisk] = useState<WheelRisk>('medium');
  const [wheelSegments, setWheelSegments] = useState<WheelSegmentCount>(20);
  const [plinkoRisk, setPlinkoRisk] = useState<PlinkoRisk>('medium');
  const [plinkoRows, setPlinkoRows] = useState('12');
  const [towerDifficulty, setTowerDifficulty] = useState<TowerDifficulty>('easy');

  const [result, setResult] = useState<ReactResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canVerify = useMemo(() => {
    if (!serverSeed || !clientSeed) return false;
    if (game === 'crash' && !salt) return false;
    if (game !== 'crash' && !nonce) return false;
    return true;
  }, [game, serverSeed, clientSeed, nonce, salt]);

  const handleVerify = () => {
    setError(null);
    setResult(null);
    try {
      const n = Number(nonce);
      if (game !== 'crash' && (!Number.isInteger(n) || n < 0)) {
        throw new Error('Nonce 必须是非负整数');
      }

      if (game === 'dice') {
        const target = Number(diceTarget);
        if (Number.isNaN(target) || target <= 0 || target >= 100) {
          throw new Error('Target 必须介于 0~100');
        }
        const { roll } = diceRoll(serverSeed, clientSeed, n);
        const winChance = diceWinChance(target, diceDirection);
        const mult = diceMultiplier(winChance);
        const won = diceDirection === 'under' ? roll < target : roll > target;
        setResult({
          type: 'dice',
          roll,
          target,
          direction: diceDirection,
          winChance,
          mult,
          won,
        });
      } else if (game === 'mines') {
        const count = Number(minesCount);
        if (!Number.isInteger(count) || count < 1 || count > 24) {
          throw new Error('Mine count 必须是 1~24 的整数');
        }
        const positions = minesPositions(serverSeed, clientSeed, n, count);
        setResult({ type: 'mines', positions });
      } else if (game === 'crash') {
        const point = crashPoint(serverSeed, salt);
        setResult({ type: 'crash', point });
      } else if (game === 'hilo') {
        const idx = Number(hiloCardIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx > 52) {
          throw new Error('Card index 必须是 0~52 的整数');
        }
        const { rank, suit } = hiloDraw(serverSeed, clientSeed, n, idx);
        setResult({ type: 'hilo', rank, suit, cardIndex: idx });
      } else if (game === 'keno') {
        const picks = kenoPicks
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((x) => Number.isInteger(x) && x >= 1 && x <= 40);
        if (picks.length < 1 || picks.length > 10) {
          throw new Error('Keno picks 要 1~10 个数字，每个介于 1~40（以逗号分隔）');
        }
        const draw = kenoDraw(serverSeed, clientSeed, n);
        const { hits } = kenoEvaluate(draw, picks);
        const multiplier = kenoMultiplier(kenoRisk, picks.length, hits.length);
        setResult({ type: 'keno', draw, picks, risk: kenoRisk, hits, multiplier });
      } else if (game === 'wheel') {
        const { segmentIndex } = wheelSpin(serverSeed, clientSeed, n, wheelSegments);
        const mult = wheelMultiplier(wheelRisk, wheelSegments, segmentIndex);
        setResult({
          type: 'wheel',
          segmentIndex,
          mult,
          risk: wheelRisk,
          segments: wheelSegments,
        });
      } else if (game === 'plinko') {
        const rows = Number(plinkoRows);
        if (!Number.isInteger(rows) || rows < 8 || rows > 16) {
          throw new Error('Plinko rows 必须是 8~16 的整数');
        }
        const { path, bucket } = plinkoPath(serverSeed, clientSeed, n, rows);
        const mult = plinkoMultiplier(plinkoRisk, rows, bucket);
        setResult({ type: 'plinko', path, bucket, mult, risk: plinkoRisk, rows });
      } else if (game === 'roulette') {
        const { slot } = rouletteSpin(serverSeed, clientSeed, n);
        setResult({ type: 'roulette', slot });
      } else if (game === 'hotline') {
        const grid = hotlineSpin(serverSeed, clientSeed, n);
        const evalResult = hotlineEvaluate(grid);
        setResult({ type: 'hotline', grid, ...evalResult });
      } else if (game === 'tower') {
        const layout = towerLayout(serverSeed, clientSeed, n, towerDifficulty);
        setResult({ type: 'tower', layout, difficulty: towerDifficulty });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto max-w-[960px] space-y-6 py-8">
      {/* 標題 */}
      <header className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-[#186073]" />
        <div>
          <h1 className="text-[24px] font-bold text-[#0F172A]">Provably Fair 验证工具</h1>
          <p className="text-[13px] text-[#4A5568]">
            纯前端计算 · 使用 HMAC-SHA256 重现游戏结果 · 不访问任何 API
          </p>
        </div>
      </header>

      {/* 說明 */}
      <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F5F7FA] p-4 text-[13px] text-[#4A5568]">
        <strong className="text-[#0F172A]">使用方式：</strong>
        选择游戏 → 输入 Server Seed（揭晓后）+ Client Seed + Nonce → 填入遊戏特定参数 → 点击「验证」。
        所有计算都在浏览器内完成，结果应与官方记录完全一致。
      </div>

      {/* 表單 */}
      <div className="space-y-4 rounded-[10px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <Field label="选择游戏">
          <select
            value={game}
            onChange={(e) => {
              setGame(e.target.value as GameKey);
              setResult(null);
              setError(null);
            }}
            className="w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2.5 text-[14px] focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
          >
            {GAMES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Server Seed（揭晓后公开）">
            <input
              value={serverSeed}
              onChange={(e) => setServerSeed(e.target.value)}
              placeholder="64 字符 hex string"
              className={inputClass}
            />
          </Field>
          <Field label="Client Seed">
            <input
              value={clientSeed}
              onChange={(e) => setClientSeed(e.target.value)}
              placeholder="玩家设定的 client seed"
              className={inputClass}
            />
          </Field>
        </div>

        {game === 'crash' ? (
          <Field label="Salt（Crash 专用，该局的 salt 字符串）">
            <input
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              placeholder="blockchain salt"
              className={inputClass}
            />
          </Field>
        ) : (
          <Field label="Nonce（从 0 开始的整数）">
            <input
              type="number"
              min={0}
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {/* 遊戲特定參數 */}
        {game === 'dice' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Target (0.01 ~ 99.99)">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="99.99"
                value={diceTarget}
                onChange={(e) => setDiceTarget(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Direction">
              <select
                value={diceDirection}
                onChange={(e) => setDiceDirection(e.target.value as 'under' | 'over')}
                className={inputClass}
              >
                <option value="under">Under (小于)</option>
                <option value="over">Over (大于)</option>
              </select>
            </Field>
          </div>
        )}

        {game === 'mines' && (
          <Field label="Mine Count (1 ~ 24)">
            <input
              type="number"
              min={1}
              max={24}
              value={minesCount}
              onChange={(e) => setMinesCount(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {game === 'hilo' && (
          <Field label="Card Index (0 ~ 52)">
            <input
              type="number"
              min={0}
              max={52}
              value={hiloCardIndex}
              onChange={(e) => setHiloCardIndex(e.target.value)}
              className={inputClass}
            />
          </Field>
        )}

        {game === 'keno' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Risk">
              <select
                value={kenoRisk}
                onChange={(e) => setKenoRisk(e.target.value as KenoRisk)}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Picks (1~10 个，逗号分隔)">
              <input
                value={kenoPicks}
                onChange={(e) => setKenoPicks(e.target.value)}
                placeholder="例如: 1,5,10,20"
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {game === 'wheel' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Risk">
              <select
                value={wheelRisk}
                onChange={(e) => setWheelRisk(e.target.value as WheelRisk)}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Segments">
              <select
                value={wheelSegments}
                onChange={(e) =>
                  setWheelSegments(Number(e.target.value) as WheelSegmentCount)
                }
                className={inputClass}
              >
                {[10, 20, 30, 40, 50].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {game === 'plinko' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Risk">
              <select
                value={plinkoRisk}
                onChange={(e) => setPlinkoRisk(e.target.value as PlinkoRisk)}
                className={inputClass}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Rows (8 ~ 16)">
              <input
                type="number"
                min={8}
                max={16}
                value={plinkoRows}
                onChange={(e) => setPlinkoRows(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {game === 'tower' && (
          <Field label="Difficulty">
            <select
              value={towerDifficulty}
              onChange={(e) => setTowerDifficulty(e.target.value as TowerDifficulty)}
              className={inputClass}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="expert">Expert</option>
              <option value="master">Master</option>
            </select>
          </Field>
        )}

        {/* 驗證按鈕 */}
        <button
          type="button"
          onClick={handleVerify}
          disabled={!canVerify}
          className="inline-flex items-center gap-2 rounded-[6px] bg-[#186073] px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1E7A90] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
          验证
        </button>
      </div>

      {/* 錯誤 */}
      {error && (
        <div className="flex items-start gap-2 rounded-[10px] border border-[#D4574A]/40 bg-[#FDF0EE] p-4 text-[13px] text-[#B94538]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">验证失败</div>
            <div className="mt-1">{error}</div>
          </div>
        </div>
      )}

      {/* 結果 */}
      {result && <ResultPanel result={result} />}
    </div>
  );
}

type ReactResult =
  | { type: 'dice'; roll: number; target: number; direction: 'under' | 'over'; winChance: number; mult: number; won: boolean }
  | { type: 'mines'; positions: number[] }
  | { type: 'crash'; point: number }
  | { type: 'hilo'; rank: number; suit: number; cardIndex: number }
  | { type: 'keno'; draw: number[]; picks: number[]; risk: KenoRisk; hits: number[]; multiplier: number }
  | { type: 'wheel'; segmentIndex: number; mult: number; risk: WheelRisk; segments: WheelSegmentCount }
  | { type: 'plinko'; path: ('left' | 'right')[]; bucket: number; mult: number; risk: PlinkoRisk; rows: number }
  | { type: 'roulette'; slot: number }
  | { type: 'hotline'; grid: number[][]; lines: unknown[]; totalMultiplier: number }
  | { type: 'tower'; layout: number[][]; difficulty: TowerDifficulty };

function ResultPanel({ result }: { result: ReactResult }) {
  return (
    <div className="rounded-[10px] border border-[#186073]/30 bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <h3 className="mb-3 text-[16px] font-semibold text-[#186073]">验证结果</h3>
      {result.type === 'dice' && (
        <div className="space-y-2 text-[14px]">
          <KV k="Roll" v={<span className="num text-[#C9A247]">{result.roll.toFixed(2)}</span>} />
          <KV k="Target" v={`${result.direction === 'under' ? '<' : '>'} ${result.target}`} />
          <KV k="Win Chance" v={`${result.winChance.toFixed(2)}%`} />
          <KV k="Multiplier" v={<span className="num">×{result.mult.toFixed(4)}</span>} />
          <KV
            k="Result"
            v={
              <span className={result.won ? 'font-bold text-[#09B826]' : 'font-bold text-[#D4574A]'}>
                {result.won ? '赢' : '输'}
              </span>
            }
          />
        </div>
      )}
      {result.type === 'mines' && (
        <div>
          <KV k="Mine Positions (0-24)" v={<span className="num">{result.positions.join(', ')}</span>} />
          <div className="mt-4 grid grid-cols-5 gap-1 text-center text-[12px]">
            {Array.from({ length: 25 }, (_, i) => (
              <div
                key={i}
                className={`rounded p-2 ${
                  result.positions.includes(i)
                    ? 'bg-[#D4574A] text-white'
                    : 'bg-[#F5F7FA] text-[#4A5568]'
                }`}
              >
                {result.positions.includes(i) ? '💣' : i}
              </div>
            ))}
          </div>
        </div>
      )}
      {result.type === 'crash' && (
        <KV
          k="Crash Point"
          v={<span className="num text-[24px] font-bold text-[#C9A247]">×{result.point.toFixed(2)}</span>}
        />
      )}
      {result.type === 'hilo' && (
        <div className="space-y-2 text-[14px]">
          <KV k="Card Index" v={String(result.cardIndex)} />
          <KV
            k="Card"
            v={
              <span className="text-[24px]">
                {CARD_RANKS[result.rank - 1]}
                {CARD_SUITS[result.suit]}
              </span>
            }
          />
          <KV k="Rank" v={`${result.rank} (1=A, 13=K)`} />
          <KV k="Suit" v={`${result.suit} (${CARD_SUITS[result.suit]})`} />
        </div>
      )}
      {result.type === 'keno' && (
        <div className="space-y-2 text-[14px]">
          <KV k="Risk" v={result.risk} />
          <KV k="Your Picks" v={<span className="num">{result.picks.join(', ')}</span>} />
          <KV k="Drawn Numbers" v={<span className="num">{result.draw.join(', ')}</span>} />
          <KV k="Hits" v={<span className="num text-[#09B826]">{result.hits.join(', ') || '无'}</span>} />
          <KV k="Multiplier" v={<span className="num">×{result.multiplier.toFixed(2)}</span>} />
        </div>
      )}
      {result.type === 'wheel' && (
        <div className="space-y-2 text-[14px]">
          <KV k="Segment Index" v={<span className="num">{result.segmentIndex}</span>} />
          <KV k="Risk / Segments" v={`${result.risk} / ${result.segments}`} />
          <KV k="Multiplier" v={<span className="num text-[#C9A247]">×{result.mult.toFixed(2)}</span>} />
        </div>
      )}
      {result.type === 'plinko' && (
        <div className="space-y-2 text-[14px]">
          <KV k="Risk / Rows" v={`${result.risk} / ${result.rows}`} />
          <KV k="Bucket" v={<span className="num">{result.bucket}</span>} />
          <KV
            k="Path"
            v={
              <span className="font-mono text-[11px] text-[#4A5568]">
                {result.path.map((p) => (p === 'left' ? 'L' : 'R')).join('')}
              </span>
            }
          />
          <KV k="Multiplier" v={<span className="num text-[#C9A247]">×{result.mult.toFixed(2)}</span>} />
        </div>
      )}
      {result.type === 'roulette' && (
        <KV
          k="Winning Slot"
          v={<span className="num text-[24px] font-bold text-[#C9A247]">{result.slot}</span>}
        />
      )}
      {result.type === 'hotline' && (
        <div className="space-y-3 text-[14px]">
          <KV k="Total Multiplier" v={<span className="num text-[#C9A247]">×{result.totalMultiplier.toFixed(2)}</span>} />
          <KV k="Win Lines" v={<span className="num">{result.lines.length}</span>} />
          <div className="mt-3">
            <div className="mb-1 text-[12px] font-semibold text-[#0F172A]">Grid (5 reels × 3 rows)</div>
            <div className="flex gap-1">
              {result.grid.map((col, r) => (
                <div key={r} className="flex flex-col gap-1">
                  {col.map((sym, i) => (
                    <div
                      key={i}
                      className="flex h-10 w-10 items-center justify-center rounded bg-[#F5F7FA] text-[14px] font-semibold text-[#186073]"
                    >
                      {sym}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {result.type === 'tower' && (
        <div className="space-y-2 text-[14px]">
          <KV k="Difficulty" v={result.difficulty} />
          <div className="mt-3">
            <div className="mb-1 text-[12px] font-semibold text-[#0F172A]">Layout (bottom = level 0)</div>
            <div className="flex flex-col-reverse gap-1">
              {result.layout.map((row, lvl) => (
                <div key={lvl} className="flex gap-1">
                  <span className="w-8 text-right text-[10px] text-[#9CA3AF]">L{lvl}</span>
                  {row.map((col, i) => (
                    <div
                      key={i}
                      className="flex h-8 w-8 items-center justify-center rounded bg-[#F5F7FA] text-[11px] text-[#186073]"
                    >
                      {col}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-[#9CA3AF]">每列的数字代表该层的陷阱位置索引</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]">{label}</span>
      {children}
    </label>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[#F5F7FA] pb-1 last:border-0">
      <span className="text-[12px] font-semibold text-[#4A5568]">{k}</span>
      <span className="text-[13px] text-[#0F172A]">{v}</span>
    </div>
  );
}

const inputClass =
  'w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25';
