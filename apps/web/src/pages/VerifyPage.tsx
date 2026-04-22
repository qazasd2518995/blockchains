import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Play, ShieldCheck } from 'lucide-react';
import {
  crashPoint,
  diceMultiplier,
  diceRoll,
  diceWinChance,
  hiloDraw,
  hotlineEvaluate,
  hotlineSpin,
  kenoDraw,
  kenoEvaluate,
  kenoMultiplier,
  minesPositions,
  plinkoMultiplier,
  plinkoPath,
  rouletteSpin,
  towerLayout,
  wheelMultiplier,
  wheelSpin,
  type KenoRisk,
  type PlinkoRisk,
  type TowerDifficulty,
  type WheelRisk,
  type WheelSegmentCount,
} from '@bg/provably-fair';
import { HotlineSymbolIcon } from '@/components/game/HotlineSymbolIcon';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { getHotlineSymbolMeta } from '@/lib/hotlineSymbols';

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

type ReactResult =
  | { type: 'dice'; roll: number; target: number; direction: 'under' | 'over'; winChance: number; mult: number; won: boolean }
  | { type: 'mines'; positions: number[] }
  | { type: 'crash'; point: number }
  | { type: 'hilo'; rank: number; suit: number; cardIndex: number }
  | { type: 'keno'; draw: number[]; picks: number[]; risk: KenoRisk; hits: number[]; multiplier: number }
  | { type: 'wheel'; segmentIndex: number; mult: number; risk: WheelRisk; segments: WheelSegmentCount }
  | { type: 'plinko'; path: ('left' | 'right')[]; bucket: number; mult: number; risk: PlinkoRisk; rows: number }
  | { type: 'roulette'; slot: number }
  | { type: 'hotline'; grid: number[][]; lines: Array<unknown>; totalMultiplier: number }
  | { type: 'tower'; layout: number[][]; difficulty: TowerDifficulty };

const GAMES: Array<{ value: GameKey; label: string }> = [
  { value: 'dice', label: '骰子 Dice' },
  { value: 'mines', label: '掃雷 Mines' },
  { value: 'crash', label: 'Crash 飛行' },
  { value: 'hilo', label: '猜大小 HiLo' },
  { value: 'keno', label: '基諾 Keno' },
  { value: 'wheel', label: '彩色轉輪 Wheel' },
  { value: 'plinko', label: '彈珠台 Plinko' },
  { value: 'roulette', label: '迷你輪盤 Roulette' },
  { value: 'hotline', label: 'Hotline' },
  { value: 'tower', label: '疊塔 Tower' },
];

const GAME_GUIDE: Record<
  GameKey,
  {
    title: string;
    description: string;
    requiresClientSeed: boolean;
    requiresNonce: boolean;
    requiresSalt: boolean;
    note: string;
  }
> = {
  dice: {
    title: '骰子 Dice',
    description: '用 server seed、client seed 與 nonce 重算 roll，再對照目標值與方向。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '適合用來確認單局倍率、目標值與輸贏是否一致。',
  },
  mines: {
    title: '掃雷 Mines',
    description: '重算該局雷位分布，對照實際翻開的格子與局面。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '結果會直接列出 25 格中的雷位索引。',
  },
  crash: {
    title: 'Crash 飛行',
    description: 'Crash 只使用 server seed 與該局 salt，不使用 client seed 與 nonce。',
    requiresClientSeed: false,
    requiresNonce: false,
    requiresSalt: true,
    note: '這也是原本頁面邏輯缺口最大的地方，現在已經獨立處理。',
  },
  hilo: {
    title: '猜大小 HiLo',
    description: '可驗證指定抽牌序號對應的牌面與花色。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: 'Card Index 代表該局第幾次抽牌，會回傳 rank 與 suit。',
  },
  keno: {
    title: '基諾 Keno',
    description: '重算開獎號碼，再比對玩家選號與命中數。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '頁面會同步算出對應風險等級下的倍率。',
  },
  wheel: {
    title: '彩色轉輪 Wheel',
    description: '重算落點 segment，再依風險與段數回推倍率。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '同一組 seed 只要段數不同，結果也會不同。',
  },
  plinko: {
    title: '彈珠台 Plinko',
    description: '重算路徑、落點 bucket 與最終倍率。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '結果區會直接列出左右路徑序列。',
  },
  roulette: {
    title: '迷你輪盤 Roulette',
    description: '回算該局 winning slot，確認最終號碼是否一致。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '適合核對單局開獎號碼與下注結果。',
  },
  hotline: {
    title: 'Hotline',
    description: '生成 5 軸 3 列的符號盤面，並重新計算中線與總倍率。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '結果區會保留 grid，方便直接對照畫面。',
  },
  tower: {
    title: '疊塔 Tower',
    description: '重算每層的陷阱位置陣列，確認局面是否合理。',
    requiresClientSeed: true,
    requiresNonce: true,
    requiresSalt: false,
    note: '每一層的數值都代表陷阱位置索引。',
  },
};

const RESULT_TITLES: Record<ReactResult['type'], string> = {
  dice: '骰子結果',
  mines: '掃雷結果',
  crash: 'Crash 結果',
  hilo: 'HiLo 結果',
  keno: 'Keno 結果',
  wheel: 'Wheel 結果',
  plinko: 'Plinko 結果',
  roulette: '輪盤結果',
  hotline: 'Hotline 結果',
  tower: 'Tower 結果',
};

const VERIFICATION_STEPS = [
  '先拿到揭曉後的 server seed，若是 Crash 還要拿到該局 salt。',
  '輸入 client seed 與 nonce；只有 Crash 不需要這兩個欄位。',
  '補上遊戲專屬參數，例如風險、段數、目標值或牌序。',
  '按下驗證後，結果會直接在瀏覽器內重算，不呼叫任何 API。',
];

const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_SUITS = ['♠', '♥', '♦', '♣'];

export function VerifyPage() {
  const [game, setGame] = useState<GameKey>('dice');
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('0');
  const [salt, setSalt] = useState('');

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

  const selectedGuide = GAME_GUIDE[game];
  const requiresClientSeed = selectedGuide.requiresClientSeed;
  const requiresNonce = selectedGuide.requiresNonce;
  const requiresSalt = selectedGuide.requiresSalt;

  const canVerify = useMemo(() => {
    if (!serverSeed.trim()) return false;
    if (requiresSalt) return Boolean(salt.trim());
    if (requiresClientSeed && !clientSeed.trim()) return false;
    if (!requiresNonce) return true;
    const numericNonce = Number(nonce);
    return nonce.trim() !== '' && Number.isInteger(numericNonce) && numericNonce >= 0;
  }, [clientSeed, nonce, requiresClientSeed, requiresNonce, requiresSalt, salt, serverSeed]);

  const handleVerify = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setResult(null);

    const normalizedServerSeed = serverSeed.trim();
    const normalizedClientSeed = clientSeed.trim();
    const normalizedSalt = salt.trim();

    try {
      if (!normalizedServerSeed) {
        throw new Error('請輸入 Server Seed。');
      }

      if (requiresClientSeed && !normalizedClientSeed) {
        throw new Error('這個遊戲需要 Client Seed。');
      }

      const numericNonce = Number(nonce);
      if (requiresNonce && (!Number.isInteger(numericNonce) || numericNonce < 0)) {
        throw new Error('Nonce 必須是從 0 開始的非負整數。');
      }

      if (requiresSalt && !normalizedSalt) {
        throw new Error('Crash 需要輸入該局 Salt。');
      }

      if (game === 'dice') {
        const target = Number(diceTarget);
        if (Number.isNaN(target) || target <= 0 || target >= 100) {
          throw new Error('Target 必須介於 0 到 100 之間。');
        }
        const { roll } = diceRoll(normalizedServerSeed, normalizedClientSeed, numericNonce);
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
        return;
      }

      if (game === 'mines') {
        const count = Number(minesCount);
        if (!Number.isInteger(count) || count < 1 || count > 24) {
          throw new Error('Mine Count 必須是 1 到 24 的整數。');
        }
        setResult({
          type: 'mines',
          positions: minesPositions(normalizedServerSeed, normalizedClientSeed, numericNonce, count),
        });
        return;
      }

      if (game === 'crash') {
        setResult({ type: 'crash', point: crashPoint(normalizedServerSeed, normalizedSalt) });
        return;
      }

      if (game === 'hilo') {
        const cardIndex = Number(hiloCardIndex);
        if (!Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex > 52) {
          throw new Error('Card Index 必須是 0 到 52 的整數。');
        }
        const { rank, suit } = hiloDraw(normalizedServerSeed, normalizedClientSeed, numericNonce, cardIndex);
        setResult({ type: 'hilo', rank, suit, cardIndex });
        return;
      }

      if (game === 'keno') {
        const picks = Array.from(
          new Set(
            kenoPicks
              .split(',')
              .map((value) => Number(value.trim()))
              .filter((value) => Number.isInteger(value) && value >= 1 && value <= 40),
          ),
        );
        if (picks.length < 1 || picks.length > 10) {
          throw new Error('Keno Picks 需要 1 到 10 個數字，每個數字介於 1 到 40。');
        }
        const draw = kenoDraw(normalizedServerSeed, normalizedClientSeed, numericNonce);
        const { hits } = kenoEvaluate(draw, picks);
        setResult({
          type: 'keno',
          draw,
          picks,
          risk: kenoRisk,
          hits,
          multiplier: kenoMultiplier(kenoRisk, picks.length, hits.length),
        });
        return;
      }

      if (game === 'wheel') {
        const { segmentIndex } = wheelSpin(normalizedServerSeed, normalizedClientSeed, numericNonce, wheelSegments);
        setResult({
          type: 'wheel',
          segmentIndex,
          mult: wheelMultiplier(wheelRisk, wheelSegments, segmentIndex),
          risk: wheelRisk,
          segments: wheelSegments,
        });
        return;
      }

      if (game === 'plinko') {
        const rows = Number(plinkoRows);
        if (!Number.isInteger(rows) || rows < 8 || rows > 16) {
          throw new Error('Plinko Rows 必須是 8 到 16 的整數。');
        }
        const { path, bucket } = plinkoPath(normalizedServerSeed, normalizedClientSeed, numericNonce, rows);
        setResult({
          type: 'plinko',
          path,
          bucket,
          mult: plinkoMultiplier(plinkoRisk, rows, bucket),
          risk: plinkoRisk,
          rows,
        });
        return;
      }

      if (game === 'roulette') {
        setResult({ type: 'roulette', slot: rouletteSpin(normalizedServerSeed, normalizedClientSeed, numericNonce).slot });
        return;
      }

      if (game === 'hotline') {
        const grid = hotlineSpin(normalizedServerSeed, normalizedClientSeed, numericNonce);
        setResult({ type: 'hotline', grid, ...hotlineEvaluate(grid) });
        return;
      }

      if (game === 'tower') {
        setResult({
          type: 'tower',
          layout: towerLayout(normalizedServerSeed, normalizedClientSeed, numericNonce, towerDifficulty),
          difficulty: towerDifficulty,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="rounded-[28px] bg-[#0F172A] p-6 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)] md:p-8 xl:col-span-8 2xl:col-span-9">
          <div className="label !text-white/[0.55]">Provably Fair</div>
          <div className="mt-4 flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-white/10">
              <ShieldCheck className="h-6 w-6 text-[#E8D48A]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-pretty text-[32px] font-bold leading-tight md:text-[40px]">
                在瀏覽器內重算每一局結果。
              </h1>
              <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-white/[0.78]">
                這個頁面只做一件事：把公開 seed 與局內參數重新餵給 `@bg/provably-fair`，直接在前端算出同一個結果。現在 Crash 也已經從一般流程拆開，不再錯誤要求 Client Seed 與 Nonce。
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-white/[0.85]">純前端計算</span>
            <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-white/[0.85]">不呼叫 API</span>
            <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1.5 text-white/[0.85]">支援 10 種遊戲</span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/history"
              className="btn-chip border-white/15 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/[0.12]"
            >
              查看我的記錄
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <aside className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur xl:col-span-4 2xl:col-span-3">
          <div className="label">Current Game</div>
          <h2 className="mt-3 text-[24px] font-bold text-[#0F172A]">{selectedGuide.title}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{selectedGuide.description}</p>

          <div className="mt-5 space-y-2">
            <RequirementRow label="Server Seed" active />
            <RequirementRow label="Client Seed" active={requiresClientSeed} />
            <RequirementRow label="Nonce" active={requiresNonce} />
            <RequirementRow label="Salt" active={requiresSalt} />
          </div>

          <div className="mt-5 rounded-[18px] bg-[#F5F7FA] p-4 text-[12px] leading-relaxed text-[#4A5568]">
            <strong className="text-[#0F172A]">提示：</strong> {selectedGuide.note}
          </div>
        </aside>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        <form
          onSubmit={handleVerify}
          noValidate
          className="rounded-[28px] border border-white/[0.65] bg-white/[0.92] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur xl:col-span-8 2xl:col-span-9"
        >
          <SectionHeading
            eyebrow="Verification Form"
            title="輸入該局公開資料"
            description="欄位只保留驗證所需的最小集合。Crash 會自動切成 server seed + salt 的模式，其餘遊戲則使用 server seed + client seed + nonce。"
          />

          <div className="mt-6 space-y-6">
            <Field id="verify-game" label="選擇遊戲" hint="先切換玩法，再輸入對應欄位。">
              <select
                id="verify-game"
                name="game"
                value={game}
                onChange={(event) => {
                  setGame(event.target.value as GameKey);
                  setResult(null);
                  setError(null);
                }}
                className={inputClass}
                aria-describedby="verify-game-hint"
              >
                {GAMES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="verify-server-seed"
                label="Server Seed"
                hint="揭曉後公開的原始 seed。"
              >
                <input
                  id="verify-server-seed"
                  name="serverSeed"
                  value={serverSeed}
                  onChange={(event) => setServerSeed(event.target.value)}
                  placeholder="輸入揭曉後的 server seed…"
                  className={inputClass}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="verify-server-seed-hint"
                />
              </Field>

              {requiresClientSeed ? (
                <Field
                  id="verify-client-seed"
                  label="Client Seed"
                  hint="玩家當局設定的 client seed。"
                >
                  <input
                    id="verify-client-seed"
                    name="clientSeed"
                    value={clientSeed}
                    onChange={(event) => setClientSeed(event.target.value)}
                    placeholder="輸入該局的 client seed…"
                    className={inputClass}
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="verify-client-seed-hint"
                  />
                </Field>
              ) : (
                <StaticField
                  label="Client Seed"
                  description="Crash 不使用 Client Seed。切換到其他遊戲時，這個欄位才會出現。"
                />
              )}
            </div>

            {requiresSalt ? (
              <Field id="verify-salt" label="Salt" hint="Crash 專用 salt 字串。">
                <input
                  id="verify-salt"
                  name="salt"
                  value={salt}
                  onChange={(event) => setSalt(event.target.value)}
                  placeholder="輸入該局 salt…"
                  className={inputClass}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="verify-salt-hint"
                />
              </Field>
            ) : (
              <Field id="verify-nonce" label="Nonce" hint="從 0 開始累加的整數。">
                <input
                  id="verify-nonce"
                  name="nonce"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={nonce}
                  onChange={(event) => setNonce(event.target.value)}
                  className={inputClass}
                  autoComplete="off"
                  aria-describedby="verify-nonce-hint"
                />
              </Field>
            )}

            <div className="space-y-4 rounded-[24px] border border-[#E5E7EB] bg-[#F8FAFB] p-5">
              <div>
                <div className="label">Game Params</div>
                <h3 className="mt-2 text-[20px] font-bold text-[#0F172A]">遊戲專屬參數</h3>
              </div>

              {game === 'dice' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="verify-dice-target" label="Target" hint="Dice 的判斷基準值。">
                    <input
                      id="verify-dice-target"
                      name="diceTarget"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="99.99"
                      inputMode="decimal"
                      value={diceTarget}
                      onChange={(event) => setDiceTarget(event.target.value)}
                      className={inputClass}
                      autoComplete="off"
                      aria-describedby="verify-dice-target-hint"
                    />
                  </Field>
                  <Field id="verify-dice-direction" label="Direction" hint="確認這局是比大還是比小。">
                    <select
                      id="verify-dice-direction"
                      name="diceDirection"
                      value={diceDirection}
                      onChange={(event) => setDiceDirection(event.target.value as 'under' | 'over')}
                      className={inputClass}
                      aria-describedby="verify-dice-direction-hint"
                    >
                      <option value="under">Under（小於）</option>
                      <option value="over">Over（大於）</option>
                    </select>
                  </Field>
                </div>
              ) : null}

              {game === 'mines' ? (
                <Field id="verify-mines-count" label="Mine Count" hint="本局地雷數量。">
                  <input
                    id="verify-mines-count"
                    name="minesCount"
                    type="number"
                    min={1}
                    max={24}
                    inputMode="numeric"
                    value={minesCount}
                    onChange={(event) => setMinesCount(event.target.value)}
                    className={inputClass}
                    autoComplete="off"
                    aria-describedby="verify-mines-count-hint"
                  />
                </Field>
              ) : null}

              {game === 'hilo' ? (
                <Field id="verify-hilo-card-index" label="Card Index" hint="指定這局第幾次抽牌。">
                  <input
                    id="verify-hilo-card-index"
                    name="hiloCardIndex"
                    type="number"
                    min={0}
                    max={52}
                    inputMode="numeric"
                    value={hiloCardIndex}
                    onChange={(event) => setHiloCardIndex(event.target.value)}
                    className={inputClass}
                    autoComplete="off"
                    aria-describedby="verify-hilo-card-index-hint"
                  />
                </Field>
              ) : null}

              {game === 'keno' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="verify-keno-risk" label="Risk" hint="選擇該局使用的風險等級。">
                    <select
                      id="verify-keno-risk"
                      name="kenoRisk"
                      value={kenoRisk}
                      onChange={(event) => setKenoRisk(event.target.value as KenoRisk)}
                      className={inputClass}
                      aria-describedby="verify-keno-risk-hint"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </Field>
                  <Field id="verify-keno-picks" label="Picks" hint="輸入 1 到 10 個號碼，以逗號分隔。">
                    <input
                      id="verify-keno-picks"
                      name="kenoPicks"
                      value={kenoPicks}
                      onChange={(event) => setKenoPicks(event.target.value)}
                      placeholder="例如：1,5,10,20…"
                      className={inputClass}
                      autoComplete="off"
                      spellCheck={false}
                      aria-describedby="verify-keno-picks-hint"
                    />
                  </Field>
                </div>
              ) : null}

              {game === 'wheel' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="verify-wheel-risk" label="Risk" hint="同一 seed 在不同風險下倍率不同。">
                    <select
                      id="verify-wheel-risk"
                      name="wheelRisk"
                      value={wheelRisk}
                      onChange={(event) => setWheelRisk(event.target.value as WheelRisk)}
                      className={inputClass}
                      aria-describedby="verify-wheel-risk-hint"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </Field>
                  <Field id="verify-wheel-segments" label="Segments" hint="輪盤分段數。">
                    <select
                      id="verify-wheel-segments"
                      name="wheelSegments"
                      value={wheelSegments}
                      onChange={(event) => setWheelSegments(Number(event.target.value) as WheelSegmentCount)}
                      className={inputClass}
                      aria-describedby="verify-wheel-segments-hint"
                    >
                      {[10, 20, 30, 40, 50].map((segment) => (
                        <option key={segment} value={segment}>
                          {segment}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : null}

              {game === 'plinko' ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field id="verify-plinko-risk" label="Risk" hint="Plinko 風險等級。">
                    <select
                      id="verify-plinko-risk"
                      name="plinkoRisk"
                      value={plinkoRisk}
                      onChange={(event) => setPlinkoRisk(event.target.value as PlinkoRisk)}
                      className={inputClass}
                      aria-describedby="verify-plinko-risk-hint"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </Field>
                  <Field id="verify-plinko-rows" label="Rows" hint="Rows 介於 8 到 16。">
                    <input
                      id="verify-plinko-rows"
                      name="plinkoRows"
                      type="number"
                      min={8}
                      max={16}
                      inputMode="numeric"
                      value={plinkoRows}
                      onChange={(event) => setPlinkoRows(event.target.value)}
                      className={inputClass}
                      autoComplete="off"
                      aria-describedby="verify-plinko-rows-hint"
                    />
                  </Field>
                </div>
              ) : null}

              {game === 'tower' ? (
                <Field id="verify-tower-difficulty" label="Difficulty" hint="Tower 目前支援五種難度。">
                  <select
                    id="verify-tower-difficulty"
                    name="towerDifficulty"
                    value={towerDifficulty}
                    onChange={(event) => setTowerDifficulty(event.target.value as TowerDifficulty)}
                    className={inputClass}
                    aria-describedby="verify-tower-difficulty-hint"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="expert">Expert</option>
                    <option value="master">Master</option>
                  </select>
                </Field>
              ) : null}

              {game === 'crash' || game === 'roulette' || game === 'hotline' ? (
                <p className="text-[12px] leading-relaxed text-[#4A5568]">
                  {game === 'crash'
                    ? 'Crash 不需要額外局內參數，只要 server seed 與 salt。'
                    : game === 'roulette'
                      ? '迷你輪盤只需要回算 winning slot，不需要額外參數。'
                      : 'Hotline 會直接重算整個盤面與中線。'}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 border-t border-[#E5E7EB] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[12px] leading-relaxed text-[#4A5568]">
                所有計算都在瀏覽器完成；按鈕會在必要欄位齊全前保持停用。
              </p>
              <button type="submit" disabled={!canVerify} className="btn-teal justify-center text-[14px] disabled:cursor-not-allowed disabled:opacity-60">
                <Play className="h-4 w-4" aria-hidden="true" />
                驗證結果
              </button>
            </div>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="label">How To Verify</div>
            <div className="mt-4 space-y-3">
              {VERIFICATION_STEPS.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#186073] text-[11px] font-bold text-white">
                    {index + 1}
                  </div>
                  <p className="text-[13px] leading-relaxed text-[#4A5568]">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div aria-live="polite" className="space-y-4 xl:col-span-4 xl:sticky xl:top-28 2xl:col-span-3">
            {error ? (
              <div className="flex items-start gap-3 rounded-[24px] border border-[#D4574A]/30 bg-[#FDF0EE] p-5 text-[#B94538]">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="text-[14px] font-semibold">驗證失敗</div>
                  <p className="mt-1 text-[13px] leading-relaxed">{error}</p>
                </div>
              </div>
            ) : null}

            {result ? <ResultPanel result={result} /> : <ResultPlaceholder />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: ReactResult }) {
  return (
    <div className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="label">Verification Result</div>
      <h3 className="mt-2 text-[22px] font-bold text-[#0F172A]">{RESULT_TITLES[result.type]}</h3>

      <div className="mt-4 space-y-3 text-[14px]">
        {result.type === 'dice' ? (
          <>
            <KV label="Roll" value={<span className="num text-[#C9A247]">{result.roll.toFixed(2)}</span>} />
            <KV label="Target" value={`${result.direction === 'under' ? '<' : '>'} ${result.target}`} />
            <KV label="Win Chance" value={`${result.winChance.toFixed(2)}%`} />
            <KV label="Multiplier" value={<span className="num">×{result.mult.toFixed(4)}</span>} />
            <KV
              label="Result"
              value={
                <span className={result.won ? 'font-bold text-[#09B826]' : 'font-bold text-[#D4574A]'}>
                  {result.won ? '贏' : '輸'}
                </span>
              }
            />
          </>
        ) : null}

        {result.type === 'mines' ? (
          <>
            <KV label="Mine Positions" value={<span className="num">{result.positions.join(', ')}</span>} />
            <div className="grid grid-cols-5 gap-1 text-center text-[12px]">
              {Array.from({ length: 25 }, (_, index) => (
                <div
                  key={index}
                  className={`flex items-center justify-center rounded-[10px] p-2 ${
                    result.positions.includes(index)
                      ? 'bg-[#D4574A] text-white'
                      : 'bg-[#F5F7FA] text-[#4A5568]'
                  }`}
                >
                  {result.positions.includes(index) ? (
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    index
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {result.type === 'crash' ? (
          <KV label="Crash Point" value={<span className="num text-[24px] font-bold text-[#C9A247]">×{result.point.toFixed(2)}</span>} />
        ) : null}

        {result.type === 'hilo' ? (
          <>
            <KV label="Card Index" value={String(result.cardIndex)} />
            <KV
              label="Card"
              value={
                <span className="text-[24px]">
                  {CARD_RANKS[result.rank - 1]}
                  {CARD_SUITS[result.suit]}
                </span>
              }
            />
            <KV label="Rank" value={`${result.rank}（1 = A, 13 = K）`} />
            <KV label="Suit" value={`${result.suit}（${CARD_SUITS[result.suit]}）`} />
          </>
        ) : null}

        {result.type === 'keno' ? (
          <>
            <KV label="Risk" value={result.risk} />
            <KV label="Your Picks" value={<span className="num">{result.picks.join(', ')}</span>} />
            <KV label="Drawn Numbers" value={<span className="num">{result.draw.join(', ')}</span>} />
            <KV
              label="Hits"
              value={<span className="num text-[#09B826]">{result.hits.length ? result.hits.join(', ') : '無'}</span>}
            />
            <KV label="Multiplier" value={<span className="num">×{result.multiplier.toFixed(2)}</span>} />
          </>
        ) : null}

        {result.type === 'wheel' ? (
          <>
            <KV label="Segment Index" value={<span className="num">{result.segmentIndex}</span>} />
            <KV label="Risk / Segments" value={`${result.risk} / ${result.segments}`} />
            <KV label="Multiplier" value={<span className="num text-[#C9A247]">×{result.mult.toFixed(2)}</span>} />
          </>
        ) : null}

        {result.type === 'plinko' ? (
          <>
            <KV label="Risk / Rows" value={`${result.risk} / ${result.rows}`} />
            <KV label="Bucket" value={<span className="num">{result.bucket}</span>} />
            <KV
              label="Path"
              value={
                <span className="font-mono text-[11px] text-[#4A5568]">
                  {result.path.map((step) => (step === 'left' ? 'L' : 'R')).join('')}
                </span>
              }
            />
            <KV label="Multiplier" value={<span className="num text-[#C9A247]">×{result.mult.toFixed(2)}</span>} />
          </>
        ) : null}

        {result.type === 'roulette' ? (
          <KV
            label="Winning Slot"
            value={<span className="num text-[24px] font-bold text-[#C9A247]">{result.slot}</span>}
          />
        ) : null}

        {result.type === 'hotline' ? (
          <>
            <KV label="Total Multiplier" value={<span className="num text-[#C9A247]">×{result.totalMultiplier.toFixed(2)}</span>} />
            <KV label="Win Lines" value={<span className="num">{result.lines.length}</span>} />
            <div className="mt-3">
              <div className="mb-2 text-[12px] font-semibold text-[#0F172A]">Grid（5 軸 × 3 列）</div>
              <div className="flex gap-1">
                {result.grid.map((column, columnIndex) => (
                  <div key={columnIndex} className="flex flex-col gap-1">
                    {column.map((symbol, symbolIndex) => {
                      const meta = getHotlineSymbolMeta(symbol);
                      return (
                        <div
                          key={symbolIndex}
                          className="flex h-10 w-10 items-center justify-center rounded-[10px] border bg-white"
                          style={{
                            borderColor: `${meta.accentHex}2b`,
                            backgroundColor: `${meta.accentHex}12`,
                            color: meta.accentHex,
                          }}
                        >
                          <HotlineSymbolIcon symbol={symbol} className="h-4.5 w-4.5" title={meta.label} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {result.type === 'tower' ? (
          <>
            <KV label="Difficulty" value={result.difficulty} />
            <div className="mt-3">
              <div className="mb-2 text-[12px] font-semibold text-[#0F172A]">Layout（bottom = level 0）</div>
              <div className="flex flex-col-reverse gap-1">
                {result.layout.map((row, level) => (
                  <div key={level} className="flex gap-1">
                    <span className="w-8 text-right text-[10px] text-[#9CA3AF]">L{level}</span>
                    {row.map((column, columnIndex) => (
                      <div
                        key={columnIndex}
                        className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F5F7FA] text-[11px] text-[#186073]"
                      >
                        {column}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-[#9CA3AF]">每列數字都代表該層的陷阱位置索引。</div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ResultPlaceholder() {
  return (
    <div className="rounded-[24px] border border-dashed border-[#D7DEE4] bg-white/72 p-5 text-[13px] leading-relaxed text-[#4A5568]">
      <div className="label">Verification Result</div>
      <h3 className="mt-2 text-[22px] font-bold text-[#0F172A]">結果會固定顯示在這裡。</h3>
      <p className="mt-2">
        輸入必要欄位後按下「驗證結果」，右側區塊會維持同一個位置，避免在長表單裡來回找結果。
      </p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[13px] font-semibold text-[#0F172A]">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-[12px] leading-relaxed text-[#4A5568]">
        {hint}
      </p>
      {children}
    </div>
  );
}

function StaticField({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#D7DEE4] bg-[#F8FAFB] p-4">
      <div className="text-[13px] font-semibold text-[#0F172A]">{label}</div>
      <p className="mt-2 text-[12px] leading-relaxed text-[#4A5568]">{description}</p>
    </div>
  );
}

function RequirementRow({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-full border border-[#E5E7EB] px-4 py-2 text-[12px]">
      <span className="font-semibold text-[#0F172A]">{label}</span>
      <span className={active ? 'text-[#186073]' : 'text-[#9CA3AF]'}>
        {active ? '需要' : '不需要'}
      </span>
    </div>
  );
}

function KV({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-[#F1F5F9] pb-2 last:border-0">
      <span className="text-[12px] font-semibold text-[#4A5568]">{label}</span>
      <span className="min-w-0 text-right text-[13px] text-[#0F172A]">{value}</span>
    </div>
  );
}

const inputClass =
  'w-full rounded-[14px] border border-[#D7DEE4] bg-white px-3 py-3 text-[14px] text-[#0F172A] transition focus-visible:border-[#186073] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#186073]/20';
