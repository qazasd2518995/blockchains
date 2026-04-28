import { useEffect, useState } from 'react';
import { Flame, Sparkles, Zap } from 'lucide-react';
import { createSimulatedWinRecord, createSimulatedWinFeed, type WinRecord } from '@/data/fakeStats';
import { TICKER_ICONS } from '@/lib/platformIcons';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');
const ROTATE_INTERVAL = 1350;
const VISIBLE_ROWS = 6;
const ROW_HEIGHT = 68;
const QUEUE_SIZE = 28;

function tierClass(record: WinRecord): string {
  if (record.tier === 'jackpot') return 'border-[#F3D67D]/30 bg-[#F3D67D]/10 text-[#F3D67D]';
  if (record.tier === 'mega') return 'border-[#38BDF8]/25 bg-[#0EA5E9]/10 text-[#7DD3FC]';
  return 'border-white/10 bg-white/[0.06] text-white/72';
}

export function WinTicker() {
  const Icon = TICKER_ICONS.live;
  const [queue, setQueue] = useState<WinRecord[]>(() => createSimulatedWinFeed(QUEUE_SIZE));
  const [tick, setTick] = useState(0);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
      setQueue((prev) => {
        const next = [...prev];
        const recentPlayers = new Set(next.slice(-12).map((record) => record.player));
        next.shift();
        next.push(createSimulatedWinRecord(recentPlayers));
        return next;
      });
      setBurst((prev) => (prev + Math.floor(Math.random() * 4) + 3) % 99);
    }, ROTATE_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const offset = tick % QUEUE_SIZE;
  const loop = [...queue, ...queue];

  return (
    <article
      aria-label="即時戰報"
      className="min-w-0 self-start overflow-hidden rounded-[10px] border border-[#162238] bg-[#0F172A] shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
    >
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#111C2E] px-4 py-3 text-[13px] font-semibold text-[#E8D48A]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>熱門戰報</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-300/80">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          HOT LIVE
        </span>
      </div>
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#0B1424] px-4 py-2 text-[10px] text-white/58">
        <span className="inline-flex items-center gap-1">
          <Flame className="h-3 w-3 text-[#F3D67D]" aria-hidden="true" />
          高倍刷新中
        </span>
        <span className="num text-[#7DD3FC]">+{burst.toString().padStart(2, '0')} NEW</span>
      </div>
      <div
        className="relative overflow-hidden"
        style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}
      >
        <div
          className="flex flex-col transition-transform duration-700 ease-out"
          style={{ transform: `translateY(-${offset * ROW_HEIGHT}px)` }}
        >
          {loop.map((rec, i) => (
            <div
              key={`${rec.player}-${rec.gameId}-${i}`}
              className="flex flex-col justify-center gap-1.5 border-b border-white/[0.06] px-4 leading-tight text-[#E8D48A] last:border-b-0"
              style={{ height: ROW_HEIGHT }}
            >
              <div className="flex items-center gap-1.5 text-[12px]">
                {rec.tier === 'jackpot' ? (
                  <Zap className="h-3 w-3 shrink-0 text-[#F3D67D]" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3 w-3 shrink-0 text-[#D0AC4D]" aria-hidden="true" />
                )}
                <span className="font-semibold text-white">{rec.player}</span>
                <span className="text-white/55">在</span>
                <span className="truncate font-semibold text-[#F3D67D]">{rec.game}</span>
              </div>
              <div className="flex items-baseline gap-1.5 pl-[18px] text-[12px]">
                <span className="num font-semibold text-[#F3D67D]">
                  {numberFormatter.format(rec.win)}
                </span>
                <span className="text-[10px] text-white/40">點</span>
                <span className={`num ml-auto rounded-full border px-2 py-0.5 text-[10px] ${tierClass(rec)}`}>
                  ×{rec.mult.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
