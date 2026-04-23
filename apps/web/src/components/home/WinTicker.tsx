import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { FAKE_WIN_TICKER, type WinRecord } from '@/data/fakeStats';
import { TICKER_ICONS } from '@/lib/platformIcons';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');
const ROTATE_INTERVAL = 3000;
const VISIBLE_ROWS = 8;
const ROW_HEIGHT = 56;
const QUEUE_SIZE = 16;

function pickRandom(): WinRecord {
  const rec = FAKE_WIN_TICKER[Math.floor(Math.random() * FAKE_WIN_TICKER.length)];
  return rec as WinRecord;
}

export function WinTicker() {
  const Icon = TICKER_ICONS.live;
  const [queue, setQueue] = useState<WinRecord[]>(() =>
    Array.from({ length: QUEUE_SIZE }, () => pickRandom()),
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((prev) => prev + 1);
      setQueue((prev) => {
        const next = [...prev];
        next.shift();
        next.push(pickRandom());
        return next;
      });
    }, ROTATE_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const offset = tick % QUEUE_SIZE;
  const loop = [...queue, ...queue];

  return (
    <aside
      aria-label="即時戰報"
      className="pointer-events-none fixed left-2 top-1/2 z-30 hidden w-[210px] -translate-y-1/2 xl:block 2xl:left-4 2xl:w-[230px]"
    >
      <div className="pointer-events-auto overflow-hidden rounded-[16px] border border-white/10 bg-[#0F172A]/95 shadow-[0_18px_40px_rgba(2,6,23,0.42)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-white/10 bg-[#111C2E] px-3 py-2 text-[12px] font-semibold text-[#E8D48A]">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>即時戰報</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-300/80">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            LIVE
          </span>
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
                key={`${rec.player}-${rec.gameId}-${i}-${tick}`}
                className="flex flex-col justify-center gap-1 border-b border-white/[0.06] px-3 text-[11px] leading-tight text-[#E8D48A] last:border-b-0"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-[#D0AC4D]" aria-hidden="true" />
                  <span className="font-semibold text-white">{rec.player}</span>
                  <span className="text-white/55">在</span>
                  <span className="truncate font-semibold text-[#F3D67D]">{rec.game}</span>
                </div>
                <div className="flex items-center gap-1.5 pl-4 text-[11px]">
                  <span className="text-white/55">贏得</span>
                  <span className="num font-semibold text-[#F3D67D]">{numberFormatter.format(rec.win)}</span>
                  <span className="text-white/40">點</span>
                  <span className="num ml-auto text-white/70">×{rec.mult.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
