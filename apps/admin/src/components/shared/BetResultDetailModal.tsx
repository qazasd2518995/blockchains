import type { ReactNode } from 'react';
import { SLOT_GAME_IDS } from '@bg/shared';
import type { BetDetailResponse } from '@bg/shared';
import { getAdminGameSubtitle, getAdminGameTitle, isAdminLocalTableGame } from '@/lib/gameDisplay';
import { useTranslation } from '@/i18n/useTranslation';
import type { Locale } from '@/i18n/types';
import { Modal } from './Modal';

type DisplayCard = {
  rank: number;
  suit: number;
};

type ResultEntry = {
  key: string;
  label: string;
  value: ReactNode;
};

interface Props {
  open: boolean;
  detail: BetDetailResponse | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
}

export function BetResultDetailModal({
  open,
  detail,
  error,
  loading,
  onClose,
}: Props): JSX.Element | null {
  const { locale } = useTranslation();
  const gameName = detail ? getAdminGameTitle(detail.gameId, locale) : '载入中';
  const resultItems = detail ? resultEntries(detail.gameId, detail.resultData, locale) : [];
  const gameSubtitle = detail ? getAdminGameSubtitle(detail.gameId, locale) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="注单开奖详情"
      subtitle={
        detail
          ? `${gameName}${gameSubtitle ? ` · ${gameSubtitle}` : ''} · ${shortId(detail.id)}`
          : '载入中'
      }
      width="lg"
    >
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 py-8 font-mono text-[12px] tracking-[0.22em] text-ink-500">
            <span className="dot-online" />
            正在载入开奖结果
            <span className="animate-blink">_</span>
          </div>
        )}

        {!loading && error && (
          <div className="border border-[#D4574A]/40 bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#D4574A]">
            ⚠ {error}
          </div>
        )}

        {!loading && detail && (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="下注" value={formatAmount(detail.amount)} />
              <Metric label="倍率" value={`${formatMultiplier(detail.multiplier)}x`} />
              <Metric label="派彩" value={formatAmount(detail.payout)} />
              <Metric
                label="盈亏"
                value={`${Number.parseFloat(detail.profit) >= 0 ? '+' : ''}${formatAmount(detail.profit)}`}
                tone={Number.parseFloat(detail.profit) >= 0 ? 'win' : 'lose'}
              />
            </div>

            <div className="border border-ink-200 bg-[#F8FBFD] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="font-semibold text-[#0F172A]">开奖结果</div>
                <div className="font-mono text-[10px] tracking-[0.18em] text-ink-500">
                  BET {detail.id.slice(-8).toUpperCase()}
                </div>
              </div>

              {resultItems.length > 0 ? (
                <div className="grid gap-2">
                  {resultItems.map((item) => (
                    <div
                      key={item.key}
                      className="grid gap-1 border border-white bg-white/85 px-3 py-2 sm:grid-cols-[120px_1fr]"
                    >
                      <div className="text-[11px] font-semibold text-[#186073]">{item.label}</div>
                      <div className="break-words font-mono text-[12px] leading-relaxed text-[#0F172A]">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white px-3 py-4 text-center text-[12px] text-ink-500">
                  这笔注单没有额外开奖资料。
                </div>
              )}
            </div>

            <div className="border border-ink-200 bg-white p-4">
              <div className="mb-3 font-semibold text-[#0F172A]">验证资料</div>
              <div className="grid gap-2 text-[12px] text-ink-600">
                <Line
                  label="局号"
                  value={detail.roundNumber ? `#${detail.roundNumber}` : (detail.roundId ?? '—')}
                />
                <Line label="状态" value={detail.status} />
                <Line label="下注时间" value={formatDateTime(detail.createdAt)} />
                <Line
                  label="结算时间"
                  value={detail.settledAt ? formatDateTime(detail.settledAt) : '—'}
                />
                <Line label="Server Seed Hash" value={detail.serverSeedHash ?? '—'} />
                <Line label="Client Seed" value={detail.clientSeed ?? '—'} />
                <Line label="Nonce" value={detail.nonce === null ? '—' : String(detail.nonce)} />
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'win' | 'lose';
}): JSX.Element {
  const toneClass =
    tone === 'win' ? 'text-win' : tone === 'lose' ? 'text-[#D4574A]' : 'text-[#0F172A]';
  return (
    <div className="border border-ink-200 bg-white p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-500">{label}</div>
      <div className={`mt-1 data-num text-[18px] font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="grid gap-1 border-b border-ink-100 pb-2 last:border-b-0 sm:grid-cols-[145px_1fr]">
      <span className="font-semibold text-[#186073]">{label}</span>
      <span className="break-all font-mono text-[#0F172A]">{value}</span>
    </div>
  );
}

function resultEntries(gameId: string, value: unknown, locale: Locale): ResultEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value === null || value === undefined
      ? []
      : [{ key: 'result', label: '結果', value: formatResultNode('result', value) }];
  }

  const record = value as Record<string, unknown>;
  const friendly = friendlyResultEntries(gameId, record, locale);
  if (friendly.length > 0) return friendly;

  return Object.entries(record)
    .filter(([key, child]) => child !== null && child !== undefined && !HIDDEN_RESULT_KEYS.has(key))
    .map(([key, child]) => ({
      key,
      label: RESULT_LABELS[key] ?? key,
      value: formatResultNode(key, child),
    }));
}

const HIDDEN_RESULT_KEYS = new Set([
  'raw',
  'rawRoll',
  'rawWon',
  'controlled',
  'flipReason',
  'controlId',
  'cascades',
  'features',
  'baseAmount',
  'buyFeature',
  'stakeAmount',
]);

const RESULT_LABELS: Record<string, string> = {
  roll: '擲出點數',
  target: '目標值',
  direction: '方向',
  winChance: '中獎機率',
  finalWon: '結果',
  drawn: '開獎號碼',
  selected: '選擇號碼',
  hits: '命中號碼',
  hitCount: '命中數',
  risk: '風險',
  segmentIndex: '落点段位',
  segments: '段數',
  multipliers: '倍率表',
  slot: '開獎格',
  bets: '下注內容',
  wins: '中獎項目',
  grid: '盤面',
  lines: '中獎線',
  path: '掉落路徑',
  bucket: '落點槽',
  rows: '列數',
  mineCount: '地雷數',
  minePositions: '地雷位置',
  revealed: '已翻位置',
  hitMine: '是否踩雷',
  hitCell: '踩雷格',
  cashedOut: '是否收分',
  history: '牌序',
  lastGuess: '最後選擇',
  correct: '是否正確',
  dealerHand: '莊家手牌',
  playerHands: '玩家手牌',
  playerCards: '閒家牌',
  bankerCards: '莊家牌',
  bankerHand: '莊家牌',
  dragonCard: '龍牌',
  tigerCard: '虎牌',
  totalPayout: '總派彩',
  rules: '規則',
  source: '来源',
  resultData: '牌局結果',
  roundNumber: '局號',
  crashPoint: '爆点',
  autoCashOut: '自動收分',
  cashoutAt: '收分倍率',
  payout: '派彩',
  status: '狀態',
};

function friendlyResultEntries(
  gameId: string,
  record: Record<string, unknown>,
  locale: Locale,
): ResultEntry[] {
  if (isAdminLocalTableGame(gameId) || isLocalTableResult(record)) {
    return localTableResultEntries(gameId, record, locale);
  }
  if (isSlotGame(gameId)) return slotResultEntries(record);
  if (gameId === 'dice') return diceResultEntries(record);
  if (gameId === 'plinko') return plinkoResultEntries(record);
  if (gameId === 'mines') return minesResultEntries(record);
  if (gameId === 'tower') return towerResultEntries(record);
  if (gameId === 'keno') return kenoResultEntries(record);
  if (gameId === 'wheel') return wheelResultEntries(record);
  if (gameId === 'mini-roulette' || gameId === 'carnival') return rouletteResultEntries(record);
  return [];
}

function localTableResultEntries(
  gameId: string,
  record: Record<string, unknown>,
  locale: Locale,
): ResultEntry[] {
  const kind = getStringScalar(record.kind);
  const roomName = getStringScalar(record.roomName);
  const outcome = getStringScalar(record.outcome);
  const outcomeLabel = getStringScalar(record.outcomeLabel);
  const summary = getStringScalar(record.summary);
  const multiplier = getNumber(record.multiplier);
  const payout = getNumber(record.payout);
  const player = getLocalTableHand(record.player);
  const banker = getLocalTableHand(record.banker);
  const extraHands = getLocalTableHands(record.extraHands);
  const rules = getStringArray(record.ruleSummary);

  return compactResultEntries([
    {
      key: 'local-table-summary',
      label: '本局結果',
      value: (
        <SummaryStack
          items={[
            roomName ? `房間：${roomName}` : getAdminGameTitle(gameId, locale),
            kind ? `玩法：${localTableKindLabel(kind)}` : null,
            outcomeLabel ?? (outcome ? `結果：${localTableOutcomeLabel(outcome)}` : null),
            summary ?? null,
            multiplier !== undefined ? `倍率 ${formatMultiplierValue(multiplier)}` : null,
            payout !== undefined ? `派彩 ${formatAmountValue(payout)}` : null,
          ]}
        />
      ),
    },
    player || banker || extraHands.length > 0
      ? {
          key: 'local-table-hands',
          label: '牌局內容',
          value: <LocalTableHandsView player={player} banker={banker} extraHands={extraHands} />,
        }
      : null,
    rules.length > 0
      ? {
          key: 'local-table-rules',
          label: '規則摘要',
          value: <StringChips values={rules} />,
        }
      : null,
  ]);
}

function slotResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const grid = getNumberGrid(record.grid);
  const lines = getSlotLines(record.lines);
  const cascades = Array.isArray(record.cascades) ? record.cascades.length : 0;
  const features = asRecord(record.features);
  const freeRounds = Array.isArray(features?.freeSpinRounds) ? features.freeSpinRounds : [];
  const winningFreeRounds = freeRounds.filter((round) => {
    const roundRecord = asRecord(round);
    const roundLines = Array.isArray(roundRecord?.lines) ? roundRecord.lines.length : 0;
    const roundCascades = Array.isArray(roundRecord?.cascades) ? roundRecord.cascades.length : 0;
    return (
      roundLines > 0 || roundCascades > 0 || (getNumber(roundRecord?.totalMultiplier) ?? 0) > 0
    );
  });
  const totalFreeCascades = freeRounds.reduce((sum, round) => {
    const roundRecord = asRecord(round);
    return sum + (Array.isArray(roundRecord?.cascades) ? roundRecord.cascades.length : 0);
  }, 0);
  const freeSpinsAwarded = getNumber(features?.freeSpinsAwarded);
  const freeSpinsPlayed = getNumber(features?.freeSpinsPlayed);
  const scatterCount = getNumber(features?.scatterCount);
  const baseAmount = getNumber(record.baseAmount);
  const stakeAmount = getNumber(record.stakeAmount);
  const buyFeature = getBoolean(record.buyFeature);
  const baseAppliedMultiplier = getNumber(features?.baseAppliedMultiplier);
  const freeSpinMultiplierBank = getNumber(features?.freeSpinMultiplierBank);
  const featureTotalMultiplier = getNumber(features?.totalMultiplier);
  const totalLineMultiplier = lines.reduce((sum, line) => sum + line.payout, 0);

  return compactResultEntries([
    baseAmount !== undefined || stakeAmount !== undefined || buyFeature !== null
      ? {
          key: 'slot-bet-mode',
          label: '投注模式',
          value: (
            <SummaryStack
              items={[
                buyFeature === true ? '購買免費遊戲' : buyFeature === false ? '一般旋轉' : null,
                baseAmount !== undefined ? `單次下注 ${formatAmountValue(baseAmount)}` : null,
                stakeAmount !== undefined ? `實際扣款 ${formatAmountValue(stakeAmount)}` : null,
              ]}
            />
          ),
        }
      : null,
    features || cascades > 0
      ? {
          key: 'slot-feature-summary',
          label: '特殊玩法',
          value: (
            <SummaryStack
              items={[
                scatterCount !== undefined ? `SCATTER ${Math.trunc(scatterCount)} 個` : null,
                cascades > 0 ? `一般消除 ${cascades} 次` : null,
                freeSpinsAwarded !== undefined
                  ? `免費遊戲 ${Math.trunc(freeSpinsPlayed ?? freeRounds.length)} / ${Math.trunc(freeSpinsAwarded)} 輪`
                  : null,
                winningFreeRounds.length > 0 ? `免費遊戲中獎 ${winningFreeRounds.length} 輪` : null,
                totalFreeCascades > 0 ? `免費遊戲消除 ${totalFreeCascades} 次` : null,
                baseAppliedMultiplier && baseAppliedMultiplier > 1
                  ? `本局倍數 ${formatPlainNumber(baseAppliedMultiplier)}x`
                  : null,
                freeSpinMultiplierBank && freeSpinMultiplierBank > 0
                  ? `免費遊戲累積倍數 ${formatPlainNumber(freeSpinMultiplierBank)}x`
                  : null,
                featureTotalMultiplier !== undefined
                  ? `總倍率 ${formatPlainNumber(featureTotalMultiplier)}x`
                  : null,
              ]}
            />
          ),
        }
      : null,
    grid.length > 0
      ? {
          key: 'slot-grid',
          label: '盤面',
          value: <SlotGridPreview grid={grid} />,
        }
      : null,
    {
      key: 'slot-lines',
      label: '中獎線',
      value: <SlotLinesSummary lines={lines} totalMultiplier={totalLineMultiplier} />,
    },
    winningFreeRounds.length > 0
      ? {
          key: 'slot-free-rounds',
          label: '免費遊戲摘要',
          value: <FreeSpinRoundSummary rounds={winningFreeRounds} />,
        }
      : null,
  ]);
}

function diceResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const roll = getNumber(record.roll);
  const target = getNumber(record.target);
  const direction = getStringScalar(record.direction);
  const finalWon = getBoolean(record.finalWon ?? record.won);
  const winChance = getNumber(record.winChance);

  return [
    {
      key: 'dice-summary',
      label: '本局結果',
      value: (
        <SummaryStack
          items={[
            target !== undefined && direction
              ? `投注 ${directionLabel(direction)} ${formatPlainNumber(target)} 點`
              : null,
            roll !== undefined ? `開出 ${formatPlainNumber(roll)} 點` : null,
            finalWon !== null ? (finalWon ? '結果：命中' : '結果：未命中') : null,
            winChance !== undefined ? `中獎機率 ${formatPlainNumber(winChance)}%` : null,
          ]}
        />
      ),
    },
  ];
}

function plinkoResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const path = getStringArray(record.path);
  const bucket = getNumber(record.bucket);
  const rows = getNumber(record.rows);
  const risk = getStringScalar(record.risk);
  const multipliers = getNumberArray(record.multipliers);
  const hitMultiplier = bucket !== undefined ? multipliers[Math.trunc(bucket)] : undefined;

  return compactResultEntries([
    {
      key: 'plinko-summary',
      label: '掉落結果',
      value: (
        <SummaryStack
          items={[
            rows !== undefined ? `${Math.trunc(rows)} 列釘盤` : null,
            risk ? `風險：${riskLabel(risk)}` : null,
            bucket !== undefined ? `落在從左數第 ${Math.trunc(bucket) + 1} 格` : null,
            hitMultiplier !== undefined ? `開出倍率 ${formatMultiplierValue(hitMultiplier)}` : null,
          ]}
        />
      ),
    },
    path.length > 0
      ? {
          key: 'plinko-path',
          label: '掉落路徑',
          value: <StringChips values={path.map(directionStepLabel)} />,
        }
      : null,
  ]);
}

function minesResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const mineCount = getNumber(record.mineCount);
  const revealed = getNumberArray(record.revealed);
  const minePositions = getNumberArray(record.minePositions);
  const hitMine = getBoolean(record.hitMine);
  const hitCell = getNumber(record.hitCell);
  const cashedOut = getBoolean(record.cashedOut);

  return compactResultEntries([
    {
      key: 'mines-summary',
      label: '本局結果',
      value: (
        <SummaryStack
          items={[
            mineCount !== undefined ? `本局共有 ${Math.trunc(mineCount)} 顆地雷` : null,
            revealed.length > 0 ? `已翻開 ${revealed.length} 格` : null,
            hitMine === true && hitCell !== undefined
              ? `踩到第 ${Math.trunc(hitCell) + 1} 格地雷`
              : null,
            hitMine === false ? '本次翻牌安全' : null,
            cashedOut === true ? '已成功收分' : null,
          ]}
        />
      ),
    },
    revealed.length > 0
      ? {
          key: 'mines-revealed',
          label: '已翻位置',
          value: <NumberChips numbers={revealed} offset={1} />,
        }
      : null,
    minePositions.length > 0
      ? {
          key: 'mines-positions',
          label: '地雷位置',
          value: <NumberChips numbers={minePositions} offset={1} tone="danger" />,
        }
      : null,
  ]);
}

function towerResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const difficulty = getStringScalar(record.difficulty);
  const picks = getNumberArray(record.picks);
  const bustedLevel = getNumber(record.bustedLevel);
  const cashedOut = getBoolean(record.cashedOut);
  return compactResultEntries([
    {
      key: 'tower-summary',
      label: '爬階梯結果',
      value: (
        <SummaryStack
          items={[
            difficulty ? `難度：${difficultyLabel(difficulty)}` : null,
            picks.length > 0 ? `已選擇 ${picks.length} 層` : null,
            bustedLevel !== undefined ? `第 ${Math.trunc(bustedLevel) + 1} 層踩到陷阱` : null,
            cashedOut === true ? '已成功收分' : null,
          ]}
        />
      ),
    },
    picks.length > 0
      ? { key: 'tower-picks', label: '選擇路徑', value: <NumberChips numbers={picks} offset={1} /> }
      : null,
  ]);
}

function kenoResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const drawn = getNumberArray(record.drawn);
  const selected = getNumberArray(record.selected);
  const hits = getNumberArray(record.hits);
  const risk = getStringScalar(record.risk);
  return compactResultEntries([
    {
      key: 'keno-summary',
      label: '命中結果',
      value: (
        <SummaryStack
          items={[
            risk ? `風險：${riskLabel(risk)}` : null,
            `命中 ${hits.length} / ${selected.length} 個號碼`,
          ]}
        />
      ),
    },
    selected.length > 0
      ? { key: 'keno-selected', label: '選擇號碼', value: <NumberChips numbers={selected} /> }
      : null,
    drawn.length > 0
      ? {
          key: 'keno-drawn',
          label: '開獎號碼',
          value: <NumberChips numbers={drawn} highlight={hits} />,
        }
      : null,
  ]);
}

function wheelResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const segmentIndex = getNumber(record.segmentIndex);
  const segments = getNumber(record.segments);
  const risk = getStringScalar(record.risk);
  const multipliers = getNumberArray(record.multipliers);
  const hitMultiplier =
    segmentIndex !== undefined ? multipliers[Math.trunc(segmentIndex)] : undefined;
  return [
    {
      key: 'wheel-summary',
      label: '轉輪結果',
      value: (
        <SummaryStack
          items={[
            segments !== undefined ? `${Math.trunc(segments)} 段轉輪` : null,
            risk ? `風險：${riskLabel(risk)}` : null,
            segmentIndex !== undefined ? `指針停在第 ${Math.trunc(segmentIndex) + 1} 段` : null,
            hitMultiplier !== undefined ? `開出倍率 ${formatMultiplierValue(hitMultiplier)}` : null,
          ]}
        />
      ),
    },
  ];
}

function rouletteResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const slot = getNumber(record.slot);
  const wins = Array.isArray(record.wins) ? record.wins : [];
  return [
    {
      key: 'roulette-summary',
      label: '輪盤結果',
      value: (
        <SummaryStack
          items={[
            slot !== undefined ? `開出 ${Math.trunc(slot)} 號` : null,
            wins.length > 0 ? `共有 ${wins.length} 筆下注中獎` : '本局未中獎',
          ]}
        />
      ),
    },
  ];
}

type LocalTablePieceView =
  | {
      kind: 'card';
      label: string;
      valueLabel?: string;
      card: DisplayCard | null;
    }
  | {
      kind: 'tube';
      label: string;
      value?: number;
      suit?: string | null;
      isWhite: boolean;
    }
  | {
      kind: 'domino';
      label: string;
      pips: [number, number] | null;
    };

type LocalTableHandView = {
  title: string;
  pieces: LocalTablePieceView[];
  scoreLabel?: string;
  rankLabel?: string;
  detail?: string;
};

function LocalTableHandsView({
  player,
  banker,
  extraHands,
}: {
  player: LocalTableHandView | null;
  banker: LocalTableHandView | null;
  extraHands: LocalTableHandView[];
}): JSX.Element {
  return (
    <div className="grid gap-3 font-sans">
      <div className="grid gap-3 md:grid-cols-2">
        {player ? <LocalTableHandCard hand={player} tone="player" /> : null}
        {banker ? <LocalTableHandCard hand={banker} tone="banker" /> : null}
      </div>
      {extraHands.length > 0 ? (
        <div className="grid gap-2">
          {extraHands.map((hand, index) => (
            <LocalTableHandCard key={`${hand.title}-${index}`} hand={hand} tone="extra" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LocalTableHandCard({
  hand,
  tone,
}: {
  hand: LocalTableHandView;
  tone: 'player' | 'banker' | 'extra';
}): JSX.Element {
  const toneClass =
    tone === 'player'
      ? 'border-[#17A34A]/25 bg-[#ECFDF3]'
      : tone === 'banker'
        ? 'border-[#D4574A]/25 bg-[#FDF0EE]'
        : 'border-[#C9A247]/30 bg-[#FFF8DF]';
  return (
    <section className={`rounded-[14px] border px-3 py-3 ${toneClass}`}>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-black text-[#0F172A]">{hand.title}</div>
          {hand.detail ? (
            <div className="mt-0.5 text-[11px] font-semibold text-ink-500">{hand.detail}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {hand.rankLabel ? (
            <span className="rounded-full border border-[#0F172A]/10 bg-white px-2 py-1 text-[11px] font-black text-[#0F172A]">
              {hand.rankLabel}
            </span>
          ) : null}
          {hand.scoreLabel ? (
            <span className="rounded-full border border-[#0F172A]/10 bg-white px-2 py-1 text-[11px] font-bold text-ink-600">
              {hand.scoreLabel}
            </span>
          ) : null}
        </div>
      </div>
      <LocalTablePieceStrip pieces={hand.pieces} />
    </section>
  );
}

function LocalTablePieceStrip({ pieces }: { pieces: LocalTablePieceView[] }): JSX.Element {
  if (pieces.length === 0) {
    return <div className="text-[12px] font-semibold text-ink-500">尚無牌面資料</div>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pieces.map((piece, index) => (
        <LocalTablePieceChip key={`${piece.kind}-${piece.label}-${index}`} piece={piece} />
      ))}
    </div>
  );
}

function LocalTablePieceChip({ piece }: { piece: LocalTablePieceView }): JSX.Element {
  if (piece.kind === 'card') {
    return piece.card ? (
      <div className="grid gap-1">
        <PlayingCardSvg card={piece.card} />
        {piece.valueLabel ? (
          <span className="text-center text-[10px] font-bold text-ink-500">{piece.valueLabel}</span>
        ) : null}
      </div>
    ) : (
      <span className="inline-flex h-[78px] min-w-[56px] items-center justify-center rounded-[8px] border border-[#D9E3EA] bg-white px-2 text-[14px] font-black text-[#0F172A]">
        {piece.label}
      </span>
    );
  }

  if (piece.kind === 'tube') {
    const imageSrc = tubeImageSrc(piece);
    return imageSrc ? (
      <span className="grid gap-1">
        <span className="inline-flex h-[78px] w-[56px] items-center justify-center overflow-hidden rounded-[10px] border border-[#D9E3EA] bg-white p-1.5 shadow-[0_8px_18px_rgba(15,23,42,0.18)]">
          <img
            src={imageSrc}
            alt={piece.label}
            className="h-full w-full object-contain"
            draggable={false}
            loading="lazy"
          />
        </span>
        {piece.value !== undefined ? (
          <em className="text-center text-[10px] font-bold not-italic text-ink-500">
            {piece.isWhite ? '白板' : piece.value}
          </em>
        ) : null}
      </span>
    ) : (
      <span
        className={`inline-flex h-[68px] min-w-[58px] flex-col items-center justify-center rounded-[12px] border-2 px-2 text-center shadow-sm ${
          piece.isWhite
            ? 'border-[#C9A247] bg-[linear-gradient(145deg,#fff,#F3F0E8)] text-[#8A6412]'
            : 'border-[#1D4ED8]/25 bg-[#EFF6FF] text-[#0F3E8A]'
        }`}
      >
        <strong className="text-[15px] leading-none">{piece.label}</strong>
        {piece.value !== undefined ? (
          <em className="mt-1 text-[10px] not-italic opacity-70">{piece.value} 點</em>
        ) : null}
      </span>
    );
  }

  const imageSrc = dominoImageSrc(piece);
  return imageSrc ? (
    <span className="grid gap-1">
      <span className="inline-flex h-[82px] w-[42px] items-center justify-center overflow-hidden rounded-[8px] border border-[#D9E3EA] bg-white p-0.5 shadow-[0_8px_18px_rgba(15,23,42,0.18)]">
        <img
          src={imageSrc}
          alt={piece.label}
          className="h-full w-full object-contain"
          draggable={false}
          loading="lazy"
        />
      </span>
      <em className="max-w-[54px] truncate text-center text-[10px] font-bold not-italic text-ink-500">
        {piece.label}
      </em>
    </span>
  ) : (
    <span className="inline-grid h-[76px] w-[48px] overflow-hidden rounded-[10px] border-2 border-[#0F172A]/20 bg-[#FFF7E5] shadow-sm">
      <span className="grid place-items-center border-b border-[#0F172A]/15">
        <DominoPips count={piece.pips?.[0] ?? 0} />
      </span>
      <span className="grid place-items-center">
        <DominoPips count={piece.pips?.[1] ?? 0} />
      </span>
      <span className="sr-only">{piece.label}</span>
    </span>
  );
}

function DominoPips({ count }: { count: number }): JSX.Element {
  const normalized = Math.max(0, Math.min(6, Math.trunc(count)));
  return (
    <span className="grid grid-cols-3 gap-[2px] px-1">
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          className={`h-1.5 w-1.5 rounded-full ${index < normalized ? 'bg-[#0F172A]' : 'bg-transparent'}`}
        />
      ))}
    </span>
  );
}

function tubeImageSrc(piece: Extract<LocalTablePieceView, { kind: 'tube' }>): string | null {
  if (piece.isWhite || piece.label.includes('白板')) return '/game-art/mahjong/WhiteDragon.svg';
  const value = normalizeTileValue(piece.value, piece.label);
  if (value === null) return null;
  const suitPrefix = normalizeTubeSuit(piece.suit, piece.label);
  return `/game-art/mahjong/${suitPrefix}${value}.svg`;
}

function normalizeTubeSuit(value: string | null | undefined, label: string): 'Pin' | 'Sou' | 'Man' {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'sou' ||
    normalized === 'suo' ||
    normalized === 'bamboo' ||
    normalized === 'bams' ||
    label.includes('索')
  ) {
    return 'Sou';
  }
  if (
    normalized === 'man' ||
    normalized === 'wan' ||
    normalized === 'character' ||
    normalized === 'characters' ||
    label.includes('萬') ||
    label.includes('万')
  ) {
    return 'Man';
  }
  return 'Pin';
}

function normalizeTileValue(value: number | undefined, label: string): number | null {
  if (value !== undefined) {
    const normalized = Math.trunc(value);
    if (normalized >= 1 && normalized <= 9) return normalized;
  }
  const numeric = label.match(/[1-9]/)?.[0];
  if (numeric) return Number.parseInt(numeric, 10);
  const chineseDigits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  for (const [digit, parsedValue] of Object.entries(chineseDigits)) {
    if (label.includes(digit)) return parsedValue;
  }
  return null;
}

function dominoImageSrc(piece: Extract<LocalTablePieceView, { kind: 'domino' }>): string | null {
  if (!piece.pips) return null;
  const first = Math.trunc(piece.pips[0]);
  const second = Math.trunc(piece.pips[1]);
  if (first < 1 || first > 6 || second < 1 || second > 6) return null;
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  return `/game-art/pai-gow/Domino-${low}+${high}.svg`;
}

function getLocalTableHand(value: unknown): LocalTableHandView | null {
  const record = asRecord(value);
  if (!record) return null;
  const pieces = Array.isArray(record.pieces)
    ? record.pieces
        .map(getLocalTablePiece)
        .filter((piece): piece is LocalTablePieceView => piece !== null)
    : [];
  const title = getStringScalar(record.title) ?? '牌組';
  const scoreLabel = getStringScalar(record.scoreLabel);
  const rankLabel = getStringScalar(record.rankLabel);
  const detail = getStringScalar(record.detail);
  if (pieces.length === 0 && !scoreLabel && !rankLabel && !detail) return null;
  return { title, pieces, scoreLabel, rankLabel, detail };
}

function getLocalTableHands(value: unknown): LocalTableHandView[] {
  if (!Array.isArray(value)) return [];
  return value.map(getLocalTableHand).filter((hand): hand is LocalTableHandView => hand !== null);
}

function getLocalTablePiece(value: unknown): LocalTablePieceView | null {
  const record = asRecord(value);
  if (!record) return null;
  const kind = getStringScalar(record.kind);
  if (kind === 'card') {
    const card = normalizeCard(record);
    return {
      kind: 'card',
      label: getStringScalar(record.label) ?? (card ? cardLabel(card) : '牌'),
      valueLabel: getStringScalar(record.valueLabel),
      card,
    };
  }
  if (kind === 'tube') {
    return {
      kind: 'tube',
      label: getStringScalar(record.label) ?? (record.isWhite === true ? '白板' : '牌'),
      value: getNumber(record.value),
      suit: getStringScalar(record.suit),
      isWhite: record.isWhite === true,
    };
  }
  if (kind === 'domino') {
    return {
      kind: 'domino',
      label: getStringScalar(record.name ?? record.label) ?? '天九牌',
      pips: getDominoPips(record.pips),
    };
  }
  return null;
}

function getDominoPips(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = getNumber(value[0]);
  const second = getNumber(value[1]);
  return first !== undefined && second !== undefined
    ? [Math.trunc(first), Math.trunc(second)]
    : null;
}

function isLocalTableResult(record: Record<string, unknown>): boolean {
  const kind = getStringScalar(record.kind);
  return (
    kind === 'twenty-one-half' ||
    kind === 'tui-tongzi' ||
    kind === 'black-dot' ||
    kind === 'card-war'
  );
}

function localTableKindLabel(kind: string): string {
  if (kind === 'twenty-one-half') return '十點半';
  if (kind === 'tui-tongzi') return '推牌';
  if (kind === 'black-dot') return '黑粒仔';
  if (kind === 'card-war') return '比大小';
  return kind;
}

function localTableOutcomeLabel(outcome: string): string {
  if (outcome === 'WIN') return '閒家勝';
  if (outcome === 'LOSE') return '莊家勝';
  if (outcome === 'PUSH') return '和局';
  return outcome;
}

function compactResultEntries(items: Array<ResultEntry | null>): ResultEntry[] {
  return items.filter((item): item is ResultEntry => item !== null);
}

function SummaryStack({ items }: { items: Array<string | null | undefined> }): JSX.Element {
  const visible = items.filter((item): item is string => Boolean(item));
  return (
    <div className="flex flex-wrap gap-2 font-sans">
      {visible.length > 0 ? (
        visible.map((item) => (
          <span
            key={item}
            className="rounded-full border border-[#D9E3EA] bg-white px-2.5 py-1 text-[12px] font-semibold text-[#0F172A]"
          >
            {item}
          </span>
        ))
      ) : (
        <span className="text-[12px] text-ink-500">沒有額外資料</span>
      )}
    </div>
  );
}

function StringChips({ values }: { values: string[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5 font-sans">
      {values.map((value, index) => (
        <span
          key={`${value}-${index}`}
          className="rounded-full border border-[#D9E3EA] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0F172A]"
        >
          {index + 1}. {value}
        </span>
      ))}
    </div>
  );
}

function NumberChips({
  numbers,
  highlight = [],
  offset = 0,
  tone = 'default',
}: {
  numbers: number[];
  highlight?: number[];
  offset?: number;
  tone?: 'default' | 'danger';
}): JSX.Element {
  const highlighted = new Set(highlight.map((number) => Math.trunc(number)));
  return (
    <div className="flex flex-wrap gap-1.5 font-sans">
      {numbers.map((number, index) => {
        const normalized = Math.trunc(number);
        const active = highlighted.has(normalized);
        const danger = tone === 'danger';
        return (
          <span
            key={`${normalized}-${index}`}
            className={`flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-[12px] font-bold ${
              danger
                ? 'border-[#D4574A]/35 bg-[#FDF0EE] text-[#B94538]'
                : active
                  ? 'border-[#17A34A]/35 bg-[#ECFDF3] text-[#12813A]'
                  : 'border-[#D9E3EA] bg-white text-[#0F172A]'
            }`}
          >
            {normalized + offset}
          </span>
        );
      })}
    </div>
  );
}

function SlotGridPreview({ grid }: { grid: number[][] }): JSX.Element {
  const rows = Math.max(0, ...grid.map((reel) => reel.length));
  const rowIndexes = Array.from({ length: rows }, (_, index) => index);
  return (
    <div className="grid max-w-full gap-1.5 overflow-x-auto font-sans">
      <div className="text-[11px] font-semibold text-ink-500">
        {grid.length} 軸 x {rows} 列
      </div>
      {rowIndexes.map((rowIndex) => (
        <div key={rowIndex} className="flex min-w-max items-center gap-1.5">
          <span className="w-10 shrink-0 text-[10px] font-bold text-ink-500">
            第 {rowIndex + 1} 列
          </span>
          {grid.map((reel, reelIndex) => (
            <SlotSymbolChip
              key={`${rowIndex}-${reelIndex}-${reel[rowIndex]}`}
              symbol={reel[rowIndex] ?? 0}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SlotLinesSummary({
  lines,
  totalMultiplier,
}: {
  lines: SlotWinLine[];
  totalMultiplier: number;
}): JSX.Element {
  if (lines.length === 0) {
    return (
      <div className="font-sans text-[12px] font-semibold text-ink-500">本局沒有形成一般線獎。</div>
    );
  }
  const visibleLines = lines.slice(0, 8);
  return (
    <div className="grid gap-2 font-sans">
      <div className="rounded-[10px] border border-[#C9A247]/30 bg-[#FFF8DF] px-3 py-2 text-[12px] font-bold text-[#765709]">
        共 {lines.length} 筆中獎，合計 {formatMultiplierValue(totalMultiplier)}
      </div>
      {visibleLines.map((line, index) => (
        <div
          key={`${line.lineId}-${line.symbol}-${index}`}
          className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[#E7EEF3] bg-white px-3 py-2 text-[12px]"
        >
          <SlotSymbolChip symbol={line.symbol} />
          <span className="font-semibold text-[#0F172A]">
            {line.ways > 0 ? `${line.ways} ways` : `連續 ${line.count} 個`}
          </span>
          <span className="font-bold text-[#12813A]">{formatMultiplierValue(line.payout)}</span>
        </div>
      ))}
      {lines.length > visibleLines.length ? (
        <div className="text-[11px] font-semibold text-ink-500">
          另有 {lines.length - visibleLines.length} 筆中獎已省略。
        </div>
      ) : null}
    </div>
  );
}

function FreeSpinRoundSummary({ rounds }: { rounds: unknown[] }): JSX.Element {
  const visibleRounds = rounds.slice(0, 10);
  return (
    <div className="grid gap-2 font-sans">
      {visibleRounds.map((round, index) => {
        const record = asRecord(round);
        const roundIndex = getNumber(record?.index);
        const lines = Array.isArray(record?.lines) ? record.lines.length : 0;
        const cascades = Array.isArray(record?.cascades) ? record.cascades.length : 0;
        const multiplier = getNumber(record?.totalMultiplier) ?? getNumber(record?.multiplierTotal);
        return (
          <div
            key={index}
            className="rounded-[10px] border border-[#E7EEF3] bg-white px-3 py-2 text-[12px] font-semibold text-[#0F172A]"
          >
            第 {Math.trunc(roundIndex ?? index) + 1} 輪
            {multiplier !== undefined ? ` · ${formatMultiplierValue(multiplier)}` : ''}
            {lines > 0 ? ` · ${lines} 筆中獎` : ''}
            {cascades > 0 ? ` · 消除 ${cascades} 次` : ''}
          </div>
        );
      })}
      {rounds.length > visibleRounds.length ? (
        <div className="text-[11px] font-semibold text-ink-500">
          另有 {rounds.length - visibleRounds.length} 輪已省略。
        </div>
      ) : null}
    </div>
  );
}

function SlotSymbolChip({ symbol }: { symbol: number }): JSX.Element {
  const palette = [
    '#EA580C',
    '#0F766E',
    '#2563EB',
    '#9333EA',
    '#C2410C',
    '#0E7490',
    '#BE123C',
    '#64748B',
  ];
  const color = palette[Math.abs(Math.trunc(symbol)) % palette.length] ?? '#64748B';
  return (
    <span
      className="inline-flex min-w-[54px] justify-center rounded-[8px] border px-2 py-1 text-[11px] font-bold"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}14`, color }}
    >
      符號 {Math.trunc(symbol)}
    </span>
  );
}

type SlotWinLine = {
  lineId: string;
  symbol: number;
  count: number;
  ways: number;
  payout: number;
};

function getSlotLines(value: unknown): SlotWinLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      return {
        lineId: getStringScalar(record.lineId) ?? 'line',
        symbol: Math.trunc(getNumber(record.symbol) ?? 0),
        count: Math.trunc(getNumber(record.count) ?? 0),
        ways: Math.trunc(getNumber(record.ways) ?? 0),
        payout: getNumber(record.payout) ?? 0,
      };
    })
    .filter((line): line is SlotWinLine => Boolean(line));
}

function getNumberGrid(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  const grid = value.map((reel) =>
    Array.isArray(reel)
      ? reel.map((cell) => getNumber(cell)).filter((cell): cell is number => cell !== undefined)
      : [],
  );
  return grid.length === value.length && grid.every((reel) => reel.length > 0) ? grid : [];
}

function isSlotGame(gameId: string): boolean {
  return (SLOT_GAME_IDS as readonly string[]).includes(gameId);
}

function formatResultNode(key: string, value: unknown): ReactNode {
  const baccarat = getBaccaratCards(value);
  if (baccarat) return <BaccaratCardsView data={baccarat} />;

  const blackjackHands = getBlackjackHands(value);
  if (key === 'playerHands' && blackjackHands.length > 0) {
    return <BlackjackHandsView hands={blackjackHands} />;
  }

  const cards = getCardArray(value);
  if (cards.length > 0) return <CardStrip cards={cards} />;

  const card = normalizeCard(value);
  if (card) return <CardStrip cards={[card]} />;

  return formatResultValue(value);
}

function CardStrip({ cards }: { cards: DisplayCard[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2 py-1">
      {cards.map((card, index) => (
        <PlayingCardSvg key={`${card.rank}-${card.suit}-${index}`} card={card} />
      ))}
    </div>
  );
}

function PlayingCardSvg({ card }: { card: DisplayCard }): JSX.Element {
  return (
    <img
      src={getCardAssetPath(card)}
      alt={cardLabel(card)}
      className="h-[86px] w-[58px] rounded-[6px] object-contain shadow-[0_8px_18px_rgba(15,23,42,0.22)] sm:h-[104px] sm:w-[70px]"
      draggable={false}
      loading="lazy"
    />
  );
}

function BlackjackHandsView({
  hands,
}: {
  hands: Array<{
    id: string;
    cards: DisplayCard[];
    score?: string;
    outcome?: string;
    payout?: string;
    bet?: string;
  }>;
}): JSX.Element {
  return (
    <div className="grid gap-3">
      {hands.map((hand, index) => (
        <div key={hand.id || `hand-${index}`} className="border border-ink-200 bg-white px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold text-[#186073]">手牌 {index + 1}</div>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] text-ink-500">
              {hand.score ? <span>点数 {hand.score}</span> : null}
              {hand.outcome ? <span>{hand.outcome}</span> : null}
              {hand.bet ? <span>下注 {formatAmount(hand.bet)}</span> : null}
              {hand.payout ? <span>派彩 {formatAmount(hand.payout)}</span> : null}
            </div>
          </div>
          <CardStrip cards={hand.cards} />
        </div>
      ))}
    </div>
  );
}

function BaccaratCardsView({
  data,
}: {
  data: {
    playerCards?: DisplayCard[];
    bankerCards?: DisplayCard[];
    dragonCard?: DisplayCard;
    tigerCard?: DisplayCard;
    playerPoints?: string | number;
    bankerPoints?: string | number;
    winner?: string;
    result?: string;
  };
}): JSX.Element {
  return (
    <div className="grid gap-3">
      {data.playerCards && data.playerCards.length > 0 ? (
        <CardGroup
          title="闲家"
          subtitle={data.playerPoints !== undefined ? `${data.playerPoints} 点` : undefined}
          cards={data.playerCards}
        />
      ) : null}
      {data.bankerCards && data.bankerCards.length > 0 ? (
        <CardGroup
          title="庄家"
          subtitle={data.bankerPoints !== undefined ? `${data.bankerPoints} 点` : undefined}
          cards={data.bankerCards}
        />
      ) : null}
      {data.dragonCard ? <CardGroup title="龙" cards={[data.dragonCard]} /> : null}
      {data.tigerCard ? <CardGroup title="虎" cards={[data.tigerCard]} /> : null}
      {data.winner || data.result ? (
        <div className="border border-[#C9A247]/25 bg-[#FFF8DF] px-3 py-2 text-[12px] font-semibold text-[#765709]">
          结果 {data.winner ?? data.result}
        </div>
      ) : null}
    </div>
  );
}

function CardGroup({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle?: string;
  cards: DisplayCard[];
}): JSX.Element {
  return (
    <div className="border border-ink-200 bg-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold text-[#186073]">{title}</div>
        {subtitle ? <div className="font-mono text-[10px] text-ink-500">{subtitle}</div> : null}
      </div>
      <CardStrip cards={cards} />
    </div>
  );
}

function getBaccaratCards(value: unknown): {
  playerCards?: DisplayCard[];
  bankerCards?: DisplayCard[];
  dragonCard?: DisplayCard;
  tigerCard?: DisplayCard;
  playerPoints?: string | number;
  bankerPoints?: string | number;
  winner?: string;
  result?: string;
} | null {
  const record = asRecord(value);
  if (!record) return null;

  const playerCards = getCardArray(
    record.playerCards ?? record.playerHand ?? record.player ?? record.idleCards,
  );
  const bankerCards = getCardArray(
    record.bankerCards ?? record.bankerHand ?? record.banker ?? record.dealerCards,
  );
  const dragonCard = normalizeCard(record.dragonCard ?? record.dragon);
  const tigerCard = normalizeCard(record.tigerCard ?? record.tiger);

  if (playerCards.length === 0 && bankerCards.length === 0 && !dragonCard && !tigerCard)
    return null;

  return {
    playerCards: playerCards.length > 0 ? playerCards : undefined,
    bankerCards: bankerCards.length > 0 ? bankerCards : undefined,
    dragonCard: dragonCard ?? undefined,
    tigerCard: tigerCard ?? undefined,
    playerPoints: getScalar(record.playerPoints ?? record.playerScore ?? record.playerPoint),
    bankerPoints: getScalar(record.bankerPoints ?? record.bankerScore ?? record.bankerPoint),
    winner: getStringScalar(record.winner ?? record.outcome),
    result: getStringScalar(record.result),
  };
}

function getBlackjackHands(value: unknown): Array<{
  id: string;
  cards: DisplayCard[];
  score?: string;
  outcome?: string;
  payout?: string;
  bet?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;
      const cards = getCardArray(record.cards);
      if (cards.length === 0) return null;
      const score = asRecord(record.score);
      const total = getScalar(score?.total);
      const soft = score?.soft === true ? ' SOFT' : '';
      return {
        id: getStringScalar(record.id) ?? `hand-${index}`,
        cards,
        score: total !== undefined ? `${total}${soft}` : undefined,
        outcome: getStringScalar(record.outcome ?? record.status),
        payout: getStringScalar(record.payout),
        bet: getStringScalar(record.bet),
      };
    })
    .filter((hand): hand is NonNullable<typeof hand> => Boolean(hand));
}

function getCardArray(value: unknown): DisplayCard[] {
  if (!Array.isArray(value)) return [];
  const cards = value
    .map((item) => normalizeCard(item))
    .filter((card): card is DisplayCard => Boolean(card));
  return cards.length === value.length ? cards : [];
}

function normalizeCard(value: unknown): DisplayCard | null {
  const record = asRecord(value);
  if (!record) return null;
  const rank = normalizeRank(record.rank ?? record.value ?? record.cardRank);
  const suit = normalizeSuit(record.suit ?? record.cardSuit);
  if (rank === null || suit === null) return null;
  return { rank, suit };
}

function normalizeRank(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 13)
    return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'a' || normalized === 'ace') return 1;
  if (normalized === 'j' || normalized === 'jack') return 11;
  if (normalized === 'q' || normalized === 'queen') return 12;
  if (normalized === 'k' || normalized === 'king') return 13;
  const numeric = Number.parseInt(normalized, 10);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 13 ? numeric : null;
}

function normalizeSuit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3)
    return value;
  if (typeof value !== 'string') return null;
  const aliases: Record<string, number> = {
    spade: 0,
    spades: 0,
    s: 0,
    '♠': 0,
    heart: 1,
    hearts: 1,
    h: 1,
    '♥': 1,
    diamond: 2,
    diamonds: 2,
    d: 2,
    '♦': 2,
    club: 3,
    clubs: 3,
    c: 3,
    '♣': 3,
  };
  return aliases[value.trim().toLowerCase()] ?? null;
}

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

function getCardAssetPath(card: DisplayCard): string {
  const rank = CARD_FILE_RANKS[card.rank - 1] ?? 'ace';
  const suit = CARD_FILE_SUITS[card.suit] ?? 'spades';
  return `/cards/${rank}_of_${suit}.svg`;
}

function cardLabel(card: DisplayCard): string {
  const rank = CARD_FILE_RANKS[card.rank - 1] ?? String(card.rank);
  const suit = CARD_FILE_SUITS[card.suit] ?? String(card.suit);
  return `${rank} of ${suit}`;
}

function formatResultValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (
      value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
    ) {
      return value.map((item) => formatResultValue(item)).join(', ');
    }
    return `${value.length} 筆資料`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 ? `${keys.length} 個欄位資料` : '空資料';
  }
  return String(value ?? '—');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getScalar(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function getStringScalar(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function getBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
}

function getNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => getNumber(item)).filter((item): item is number => item !== undefined);
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' || typeof item === 'number' ? String(item) : null))
    .filter((item): item is string => Boolean(item));
}

function directionLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === 'over' || normalized === 'above' || normalized === 'high') return '大於';
  if (normalized === 'under' || normalized === 'below' || normalized === 'low') return '小於';
  return value;
}

function directionStepLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === 'left' || normalized === 'l') return '左';
  if (normalized === 'right' || normalized === 'r') return '右';
  return value;
}

function riskLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === 'low') return '低';
  if (normalized === 'medium') return '中';
  if (normalized === 'high') return '高';
  return value;
}

function difficultyLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === 'easy') return '簡單';
  if (normalized === 'medium') return '中等';
  if (normalized === 'hard') return '困難';
  if (normalized === 'expert') return '專家';
  if (normalized === 'master') return '大師';
  return value;
}

function formatPlainNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function formatMultiplierValue(value: number): string {
  return `${formatPlainNumber(value)}x`;
}

function formatAmountValue(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAmount(value: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMultiplier(value: string): string {
  const n = Number.parseFloat(value);
  if (Number.isNaN(n)) return '0.0000';
  return n.toFixed(4);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}
