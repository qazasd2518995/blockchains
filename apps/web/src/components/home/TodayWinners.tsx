import { type ReactNode, useEffect, useState } from 'react';
import { Crown, Flame, Medal, Trophy, Zap } from 'lucide-react';
import { FAKE_TODAY_TOP10, reshuffleTop10, type RankedWinRecord } from '@/data/fakeStats';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { useTranslation } from '@/i18n/useTranslation';

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

function tierBadge(row: RankedWinRecord, label: string): ReactNode {
  if (row.tier === 'jackpot') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#F3D67D]/40 bg-[#F3D67D]/20 px-2 py-1 text-[10px] font-black text-[#6A4B00]">
        <Zap className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
    );
  }
  if (row.tier === 'mega') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#38BDF8]/35 bg-[#E0F2FE] px-2 py-1 text-[10px] font-black text-[#075985]">
        <Flame className="h-3 w-3" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return null;
}

export function TodayWinners() {
  const { locale, t } = useTranslation();
  const numberFormatter = new Intl.NumberFormat(locale);
  const [rows, setRows] = useState<RankedWinRecord[]>(FAKE_TODAY_TOP10);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => reshuffleTop10(prev));
      setRefresh((prev) => prev + 1);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="flex h-[var(--live-board-height)] min-w-0 flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <header className="flex items-baseline justify-between border-b border-[#E5E7EB] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[#0F172A]">
            <Trophy className="h-5 w-5 text-[#C9A247]" />
            {t.feed.todayWinners}
          </h2>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-[#64748B]">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            {t.feed.continuousRefresh}
          </div>
        </div>
        <div className="text-right">
          <span className="text-[12px] text-[#9CA3AF]">{t.feed.dailyReset}</span>
          <div className="num mt-1 text-[11px] font-bold text-[#EA580C]">
            HOT {String(refresh % 100).padStart(2, '0')}
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-[720px] w-full" aria-label={t.feed.todayWinners}>
          <thead>
            <tr className="bg-[#EA580C] text-[13px] text-white">
              <th className="w-16 py-3 text-center font-medium">{t.feed.ranking}</th>
              <th className="py-3 text-left font-medium">{t.feed.player}</th>
              <th className="py-3 text-left font-medium">{t.feed.game}</th>
              <th className="w-24 py-3 text-right font-medium">{t.feed.multiplier}</th>
              <th className="w-32 py-3 pr-5 text-right font-medium">{t.feed.pointsWon}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.rank}-${row.player}-${row.gameId}-${row.win}`}
                className={`border-b border-[#E5E7EB] transition-colors duration-500 last:border-0 ${
                  row.rank <= 3 ? rankStyle(row.rank) : idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F7FA]'
                } ${row.tier === 'jackpot' ? 'shadow-[inset_4px_0_0_#C9A247]' : row.tier === 'mega' ? 'shadow-[inset_4px_0_0_#38BDF8]' : ''}`}
              >
                <td className="py-3 text-center text-[18px] font-bold">{rankIcon(row.rank)}</td>
                <td className="py-3 text-[14px] font-medium">
                  <div className="flex items-center gap-2">
                    <span>{row.player}</span>
                    {tierBadge(
                      row,
                      row.tier === 'jackpot' ? t.feed.jackpot : t.feed.highMultiplier,
                    )}
                  </div>
                </td>
                <td className="py-3 text-[14px]">
                  {getLocalizedGameTitle(row.gameId, locale, row.game)}
                </td>
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
