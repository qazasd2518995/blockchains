import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { FAKE_WIN_TICKER, type WinRecord } from '@/data/fakeStats';

function pickRandom(): WinRecord {
  const rec = FAKE_WIN_TICKER[Math.floor(Math.random() * FAKE_WIN_TICKER.length)];
  return rec as WinRecord;
}

export function WinTicker() {
  // 初始給 12 筆，每 5 秒從尾端推入新筆並丟棄前一筆
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
    <div className="flex h-9 items-center overflow-hidden bg-[#1A2530]">
      <div className="flex shrink-0 items-center gap-1 border-r border-white/10 px-3 text-[13px] font-semibold text-[#C9A247]">
        <Trophy className="h-4 w-4" />
        <span>即時戰報</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track">
          {doubled.map((rec, i) => (
            <span key={i} className="mx-6 whitespace-nowrap text-[13px] text-[#C9A247]">
              玩家 <span className="font-semibold">{rec.player}</span>
              <span className="mx-1 text-white/60">在</span>
              <span className="font-semibold">{rec.game}</span>
              <span className="mx-1 text-white/60">贏得</span>
              <span className="num font-semibold">{rec.win.toLocaleString()}</span>
              <span className="ml-1 text-white/60">點</span>
              <span className="num ml-2 text-white/80">(×{rec.mult.toFixed(2)})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
