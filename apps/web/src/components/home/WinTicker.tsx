import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { FAKE_WIN_TICKER, type WinRecord } from '@/data/fakeStats';
import { TICKER_ICONS } from '@/lib/platformIcons';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');

function pickRandom(): WinRecord {
  const rec = FAKE_WIN_TICKER[Math.floor(Math.random() * FAKE_WIN_TICKER.length)];
  return rec as WinRecord;
}

export function WinTicker() {
  const Icon = TICKER_ICONS.live;
  // 初始给 12 笔，每 5 秒从尾端推入新笔並丟棄前一笔
  const [queue, setQueue] = useState<WinRecord[]>(() => {
    return Array.from({ length: 12 }, () => pickRandom());
  });

  useEffect(() => {
    const id = setInterval(() => {
      setQueue((prev) => {
        const next = [...prev];
        next.shift();
        next.push(pickRandom());
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const doubled = [...queue, ...queue];

  return (
    <div className="flex h-10 items-center overflow-hidden border-b border-[#0F172A] bg-[#0F172A]">
      <div className="flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#111C2E] px-4 text-[13px] font-semibold text-[#E8D48A]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>即时战报</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track [--ticker-duration:32s]">
          {doubled.map((rec, i) => (
            <span key={`${rec.player}-${rec.gameId}-${i}`} className="ml-6 inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-[#E8D48A]">
              <Sparkles className="h-3.5 w-3.5 text-[#D0AC4D]" aria-hidden="true" />
              <span className="text-white/80">玩家</span>
              <span className="font-semibold text-white">{rec.player}</span>
              <span className="text-white/55">在</span>
              <span className="font-semibold text-[#F3D67D]">{rec.game}</span>
              <span className="text-white/55">赢得</span>
              <span className="num font-semibold text-[#F3D67D]">{numberFormatter.format(rec.win)}</span>
              <span className="text-white/55">点</span>
              <span className="num text-white/70">×{rec.mult.toFixed(2)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
