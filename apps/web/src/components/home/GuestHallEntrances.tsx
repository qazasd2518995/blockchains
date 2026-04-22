import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { HALL_LIST, type HallMeta } from '@/data/halls';
import { getHallIcon } from '@/lib/platformIcons';

interface Props {
  showHeading?: boolean;
}

function GuestHallCard({ hall }: { hall: HallMeta }) {
  const Icon = getHallIcon(hall.iconKey);

  return (
    <Link
      to={`/login?from=${encodeURIComponent(`/hall/${hall.id}`)}`}
      className="group relative flex h-[280px] flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#186073] hover:shadow-[0_8px_20px_rgba(24,96,115,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#186073]/35 focus-visible:ring-offset-2"
    >
      <div
        className="relative flex flex-1 items-end overflow-hidden"
        style={{ background: hall.gradient }}
      >
        <img
          src={hall.artwork}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,30,43,0.12),rgba(5,30,43,0.08)_34%,rgba(5,30,43,0.52))]" />
        <div className="absolute right-4 top-4 flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/[0.12] shadow-[0_12px_24px_rgba(5,30,43,0.16),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
          <Icon className="h-7 w-7 text-white" aria-hidden="true" strokeWidth={1.8} />
        </div>
        <div className="relative z-10 p-5">
          <span className="inline-flex rounded-full border border-white/18 bg-black/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/86 backdrop-blur-sm">
            {hall.id}
          </span>
        </div>
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
