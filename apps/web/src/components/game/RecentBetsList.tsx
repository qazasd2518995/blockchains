import { History } from 'lucide-react';
import { formatAmount, formatMultiplier } from '@/lib/utils';

export interface RecentBetRecord {
  /** 唯一 id（通常用 betId 或 roundId） */
  id: string;
  /** 下注時的 unix ms — 用來顯示時間 */
  timestamp: number;
  /** 下注金額（實際本金） */
  betAmount: number;
  /** 結算倍率 */
  multiplier: number;
  /** 派彩金額（含本金） */
  payout: number;
  /** 是否中獎 */
  won: boolean;
  /** 可選：遊戲特定資訊（一行短描述，例如 "Roll 35.21" / "5/10 hits" / "Bucket 7"） */
  detail?: string;
}

interface Props {
  title?: string;
  records: RecentBetRecord[];
  /** 顯示上限，預設 12 */
  limit?: number;
  /** 空狀態文字 */
  emptyText?: string;
  /** 卡片外層額外 className */
  className?: string;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  const ss = d.getSeconds().toString().padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function RecentBetsList({
  title = '最近注單',
  records,
  limit = 12,
  emptyText = '尚無記錄，先下一注開局。',
  className = '',
}: Props): JSX.Element {
  const visible = records.slice(0, limit);

  return (
    <div className={`game-side-card p-5 ${className}`}>
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[#E8D48A]" aria-hidden="true" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#E8D48A]">
            {title}
          </span>
        </div>
        <span className="data-num text-[10px] text-white/55">
          {visible.length} / {records.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-white/45">{emptyText}</div>
      ) : (
        <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
          <div className="grid grid-cols-[58px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-2 px-3 pb-1.5 text-[10px] uppercase tracking-[0.14em] text-white/40">
            <span>時間</span>
            <span className="text-right">下注</span>
            <span className="text-right">倍率</span>
            <span className="text-right">派彩</span>
            <span />
          </div>
          {visible.map((rec) => (
            <div
              key={rec.id}
              className={`grid grid-cols-[58px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_24px] items-center gap-2 rounded-[12px] border px-3 py-2 text-[12px] transition ${
                rec.won
                  ? 'border-[#E8D48A]/25 bg-[#E8D48A]/[0.06] hover:border-[#E8D48A]/40'
                  : 'border-white/8 bg-white/[0.03] hover:border-white/15'
              }`}
            >
              <span className="data-num text-[10px] text-white/55">{fmtTime(rec.timestamp)}</span>
              <span className="data-num text-right text-white/85">{formatAmount(rec.betAmount)}</span>
              <span
                className={`data-num text-right font-semibold ${
                  rec.won ? 'text-[#F3D67D]' : 'text-white/55'
                }`}
              >
                {formatMultiplier(rec.multiplier)}
              </span>
              <span
                className={`data-num text-right font-semibold ${
                  rec.won ? 'text-[#F3D67D]' : 'text-[#FCA5A5]'
                }`}
              >
                {rec.won ? '+' : '−'}
                {formatAmount(Math.abs(rec.payout - rec.betAmount))}
              </span>
              <span
                className={`flex h-2 w-2 shrink-0 items-center justify-center self-center rounded-full ${
                  rec.won ? 'bg-[#F3D67D]' : 'bg-[#FCA5A5]/55'
                }`}
                aria-label={rec.won ? '贏' : '輸'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
