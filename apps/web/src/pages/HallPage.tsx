import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { HALLS, type HallId } from '@/data/halls';
import { FAKE_WIN_TICKER } from '@/data/fakeStats';
import { GameCardNew } from '@/components/game/GameCardNew';

export function HallPage() {
  const { hallId } = useParams<{ hallId: string }>();
  const hall = hallId && hallId in HALLS ? HALLS[hallId as HallId] : undefined;

  if (!hall) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-[24px] font-bold text-[#0F172A]">館別不存在</h1>
        <Link to="/lobby" className="mt-4 inline-block text-[#186073]">
          ← 回首頁
        </Link>
      </div>
    );
  }

  const games = hall.gameIds
    .map((id: GameIdType) => GAMES_REGISTRY[id])
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const liveWins = FAKE_WIN_TICKER.filter((w) => hall.gameIds.includes(w.gameId as GameIdType)).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link to="/lobby" className="inline-flex items-center gap-1 text-[13px] text-[#186073] hover:underline">
        <ArrowLeft className="h-4 w-4" /> 回首頁
      </Link>

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[10px] px-8 py-12 text-white"
        style={{ background: hall.gradient }}
      >
        <div className="relative z-10 max-w-[640px]">
          <div className="text-[72px] leading-none">{hall.emoji}</div>
          <h1 className="mt-3 text-[32px] font-bold md:text-[40px]">{hall.nameZh}</h1>
          <p className="mt-2 text-[15px] text-white/85">{hall.tagline}</p>
          <p className="mt-1 text-[12px] text-white/60">共 {games.length} 款遊戲</p>
        </div>
      </section>

      {/* Body: 遊戲網格 + 即時贏家側欄 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_280px]">
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((g) => (
              <GameCardNew key={g.id} game={g} />
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold text-[#0F172A]">
            <span className="dot-online" />
            即時戰報
          </h3>
          <div className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
            {liveWins.map((w, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[#0F172A]">
                    {w.player}
                  </div>
                  <div className="truncate text-[11px] text-[#9CA3AF]">{w.game}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-[13px] font-semibold text-[#C9A247]">
                    +{w.win.toLocaleString()}
                  </div>
                  <div className="num text-[10px] text-[#4A5568]">×{w.mult.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
