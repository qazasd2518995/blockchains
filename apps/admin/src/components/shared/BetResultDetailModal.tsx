import type { ReactNode } from 'react';
import { getGameMeta } from '@bg/shared';
import type { BetDetailResponse } from '@bg/shared';
import { Modal } from './Modal';

type DisplayCard = {
  rank: number;
  suit: number;
};

interface Props {
  open: boolean;
  detail: BetDetailResponse | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
}

export function BetResultDetailModal({ open, detail, error, loading, onClose }: Props): JSX.Element | null {
  const gameName = detail ? (getGameMeta(detail.gameId)?.nameZh ?? detail.gameId) : '载入中';
  const resultItems = detail ? resultEntries(detail.resultData) : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="注单开奖详情"
      subtitle={detail ? `${gameName} · ${shortId(detail.id)}` : '载入中'}
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
                <Line label="局号" value={detail.roundNumber ? `#${detail.roundNumber}` : detail.roundId ?? '—'} />
                <Line label="状态" value={detail.status} />
                <Line label="下注时间" value={formatDateTime(detail.createdAt)} />
                <Line label="结算时间" value={detail.settledAt ? formatDateTime(detail.settledAt) : '—'} />
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
  const toneClass = tone === 'win' ? 'text-win' : tone === 'lose' ? 'text-[#D4574A]' : 'text-[#0F172A]';
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

function resultEntries(value: unknown): Array<{ key: string; label: string; value: ReactNode }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value === null || value === undefined
      ? []
      : [{ key: 'result', label: '结果', value: formatResultNode('result', value) }];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== null && child !== undefined)
    .map(([key, child]) => ({
      key,
      label: RESULT_LABELS[key] ?? key,
      value: formatResultNode(key, child),
    }));
}

const RESULT_LABELS: Record<string, string> = {
  roll: '掷出点数',
  target: '目标值',
  direction: '方向',
  winChance: '中奖机率',
  finalWon: '结果',
  drawn: '开奖号码',
  selected: '选择号码',
  hits: '命中号码',
  hitCount: '命中数',
  risk: '风险',
  segmentIndex: '落点段位',
  segments: '段数',
  multipliers: '倍率表',
  slot: '开奖格',
  bets: '下注内容',
  wins: '中奖项目',
  grid: '盘面',
  lines: '中奖线',
  path: '掉落路径',
  bucket: '落点槽',
  rows: '列数',
  mineCount: '地雷数',
  minePositions: '地雷位置',
  revealed: '已翻位置',
  hitMine: '是否踩雷',
  hitCell: '踩雷格',
  cashedOut: '是否收分',
  history: '牌序',
  lastGuess: '最后选择',
  correct: '是否正确',
  dealerHand: '庄家手牌',
  playerHands: '玩家手牌',
  playerCards: '闲家牌',
  bankerCards: '庄家牌',
  bankerHand: '庄家牌',
  dragonCard: '龙牌',
  tigerCard: '虎牌',
  totalPayout: '总派彩',
  rules: '规则',
  source: '来源',
  resultData: '牌局结果',
  roundNumber: '局号',
  crashPoint: '爆点',
  autoCashOut: '自动收分',
  cashoutAt: '收分倍率',
  payout: '派彩',
  status: '状态',
};

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
  hands: Array<{ id: string; cards: DisplayCard[]; score?: string; outcome?: string; payout?: string; bet?: string }>;
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
        <CardGroup title="闲家" subtitle={data.playerPoints !== undefined ? `${data.playerPoints} 点` : undefined} cards={data.playerCards} />
      ) : null}
      {data.bankerCards && data.bankerCards.length > 0 ? (
        <CardGroup title="庄家" subtitle={data.bankerPoints !== undefined ? `${data.bankerPoints} 点` : undefined} cards={data.bankerCards} />
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

function CardGroup({ title, subtitle, cards }: { title: string; subtitle?: string; cards: DisplayCard[] }): JSX.Element {
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

  const playerCards = getCardArray(record.playerCards ?? record.playerHand ?? record.player ?? record.idleCards);
  const bankerCards = getCardArray(record.bankerCards ?? record.bankerHand ?? record.banker ?? record.dealerCards);
  const dragonCard = normalizeCard(record.dragonCard ?? record.dragon);
  const tigerCard = normalizeCard(record.tigerCard ?? record.tiger);

  if (playerCards.length === 0 && bankerCards.length === 0 && !dragonCard && !tigerCard) return null;

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

function getBlackjackHands(value: unknown): Array<{ id: string; cards: DisplayCard[]; score?: string; outcome?: string; payout?: string; bet?: string }> {
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
  const cards = value.map((item) => normalizeCard(item)).filter((card): card is DisplayCard => Boolean(card));
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
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 13) return value;
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
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3) return value;
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

const CARD_FILE_RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'] as const;
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
    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      return value.map((item) => formatResultValue(item)).join(', ');
    }
    return safeJson(value);
  }
  if (value && typeof value === 'object') return safeJson(value);
  return String(value ?? '—');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
