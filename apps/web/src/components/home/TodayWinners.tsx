import { type ReactNode, useEffect, useState } from 'react';
import { Crown, Medal, Trophy } from 'lucide-react';
import { FAKE_TODAY_TOP10, reshuffleTop10, type RankedWinRecord } from '@/data/fakeStats';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');

function rankStyle(rank: number): string {
  if (rank === 1) return 'bg-gradient-to-r from-[#E8D48A] to-[#C9A247] text-[#5A471A]';
  if (rank === 2) return 'bg-gradient-to-r from-[#D1D5DB] to-[#C0C0C0] text-[#374151]';
  if (rank === 3) return 'bg-gradient-to-r from-[#E8B881] to-[#CD7F32] text-[#3E2300]';
  return '';
}

function rankIcon(rank: number): ReactNode {
  if (rank === 1) return <Crown className="mx-auto h-5 w-5" aria-hidden="true" />;
  if (rank === 2 || rank === 3) return <Medal className="mx-auto h-5 w-5" aria-hidden="true" />;
  return `${rank}`;
}

export function TodayWinners() {
  const [rows, setRows] = useState<RankedWinRecord[]>(FAKE_TODAY_TOP10);

  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => reshuffleTop10(prev));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="min-w-0 rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <header className="flex items-baseline justify-between border-b border-[#E5E7EB] px-5 py-4">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[#0F172A]">
          <Trophy className="h-5 w-5 text-[#C9A247]" />
          今日赢家榜
        </h2>
        <span className="text-[12px] text-[#9CA3AF]">每日 00:00 重置</span>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full" aria-label="今日赢家榜">
          <thead>
            <tr className="bg-[#186073] text-[13px] text-white">
              <th className="w-16 py-3 text-center font-medium">排名</th>
              <th className="py-3 text-left font-medium">玩家</th>
              <th className="py-3 text-left font-medium">游戏</th>
              <th className="w-24 py-3 text-right font-medium">倍率</th>
              <th className="w-32 py-3 pr-5 text-right font-medium">赢得点数</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.rank}-${row.player}`}
                className={`border-b border-[#E5E7EB] last:border-0 ${
                  row.rank <= 3 ? rankStyle(row.rank) : idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F7FA]'
                }`}
              >
                <td className="py-3 text-center text-[18px] font-bold">
                  {rankIcon(row.rank)}
                </td>
                <td className="py-3 text-[14px] font-medium">{row.player}</td>
                <td className="py-3 text-[14px]">{row.game}</td>
                <td className="py-3 text-right text-[14px] num font-semibold">
                  ×{row.mult.toFixed(2)}
                </td>
                <td className="py-3 pr-5 text-right text-[14px] num font-bold">
                  {numberFormatter.format(row.win)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
