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
      className="group relative flex min-h-[410px] flex-col overflow-hidden rounded-[12px] border border-white/80 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-1 hover:border-[#186073]/40 hover:shadow-[0_22px_46px_rgba(24,96,115,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#186073]/35 focus-visible:ring-offset-2"
    >
      <div
        className="relative h-[260px] shrink-0 overflow-hidden sm:h-[300px] 2xl:h-[330px]"
        style={{ background: hall.gradient }}
      >
        <img
          src={hall.artwork}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,30,43,0.08),rgba(5,30,43,0.12)_44%,rgba(5,30,43,0.72))]" />
        <div className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(5,16,28,0.56),transparent)]" />
        <div className="absolute right-5 top-5 flex h-16 w-16 items-center justify-center rounded-full border border-white/26 bg-[#071523]/56 shadow-[0_16px_30px_rgba(5,30,43,0.24),inset_0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-md transition-transform duration-300 group-hover:scale-105">
          <Icon className="h-7 w-7 text-white" aria-hidden="true" strokeWidth={1.8} />
        </div>
        <div className="absolute bottom-5 left-5 z-10">
          <span className="inline-flex rounded-full border border-white/32 bg-[#071523]/74 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.24em] text-white shadow-[0_10px_24px_rgba(2,6,23,0.22)] backdrop-blur-md">
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
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-pretty text-[26px] font-black leading-tight text-[#0F172A]">
            {hall.nameZh}
          </h3>
          <span className="shrink-0 rounded-full bg-[#EDF4F7] px-3 py-1 text-[12px] font-semibold text-[#557083]">
            {hall.gameIds.length} 款遊戲
          </span>
        </div>
        <p className="text-[15px] leading-7 text-[#4A5568]">{hall.tagline}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-2 text-[14px] font-bold text-[#186073] transition group-hover:gap-3">
            登入進入 <ArrowRight className="h-4 w-4" />
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
      <div className="grid grid-cols-1 gap-7 md:grid-cols-2">
        {HALL_LIST.map((hall) => (
          <GuestHallCard key={hall.id} hall={hall} />
        ))}
      </div>
    </section>
  );
}
