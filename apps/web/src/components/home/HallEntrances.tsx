import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { HALL_LIST, type HallMeta } from '@/data/halls';

function HallCard({ hall }: { hall: HallMeta }) {
  return (
    <Link
      to={`/hall/${hall.id}`}
      className="group relative flex h-[280px] flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#186073] hover:shadow-[0_8px_20px_rgba(24,96,115,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#186073]/35 focus-visible:ring-offset-2"
    >
      <div
        className="relative flex flex-1 items-center justify-center"
        style={{ background: hall.gradient }}
      >
        <span className="text-[140px] leading-none opacity-95 transition-transform duration-300 group-hover:scale-110">
          {hall.emoji}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-2 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-pretty text-[22px] font-bold text-[#0F172A]">{hall.nameZh}</h3>
          <span className="text-[12px] text-[#9CA3AF]">{hall.gameIds.length} 款游戏</span>
        </div>
        <p className="text-[13px] text-[#4A5568]">{hall.tagline}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#186073] transition group-hover:gap-2">
            立即进入 <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function HallEntrances() {
  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {HALL_LIST.map((hall) => (
        <HallCard key={hall.id} hall={hall} />
      ))}
    </section>
  );
}
