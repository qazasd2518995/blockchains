import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { HALL_LIST, type HallMeta } from '@/data/halls';

interface Props {
  showHeading?: boolean;
}

function GuestHallCard({ hall }: { hall: HallMeta }) {
  return (
    <Link
      to={`/login?from=${encodeURIComponent(`/hall/${hall.id}`)}`}
      className="group relative flex h-[280px] flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#186073] hover:shadow-[0_8px_20px_rgba(24,96,115,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#186073]/35 focus-visible:ring-offset-2"
    >
      <div
        className="relative flex flex-1 items-center justify-center"
        style={{ background: hall.gradient }}
      >
        <span className="text-[140px] leading-none opacity-95 transition-transform duration-300 group-hover:scale-110">
          {hall.emoji}
        </span>
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex flex-col items-center gap-1 text-white">
            <Lock className="h-6 w-6" />
            <span className="text-[13px] font-semibold">登录后进入</span>
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-pretty text-[22px] font-bold text-[#0F172A]">{hall.nameZh}</h3>
          <span className="text-[12px] text-[#9CA3AF]">{hall.gameIds.length} 款游戏</span>
        </div>
        <p className="text-[13px] text-[#4A5568]">{hall.tagline}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#186073] transition group-hover:gap-2">
            登录进入 <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function GuestHallEntrances({ showHeading = true }: Props) {
  return (
    <section className="space-y-4">
      {showHeading ? (
        <header className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold text-[#0F172A]">三大游戏馆</h2>
        <span className="text-[12px] text-[#9CA3AF]">登录后即可进入</span>
        </header>
      ) : null}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {HALL_LIST.map((hall) => (
          <GuestHallCard key={hall.id} hall={hall} />
        ))}
      </div>
    </section>
  );
}
