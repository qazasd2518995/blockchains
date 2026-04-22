import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HallEntrances } from '@/components/home/HallEntrances';
import { TodayWinners } from '@/components/home/TodayWinners';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { HALL_LIST } from '@/data/halls';
import { FAKE_TODAY_TOP10 } from '@/data/fakeStats';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');
const totalGames = new Set(HALL_LIST.flatMap((hall) => hall.gameIds)).size;
const topBoardWin = Math.max(...FAKE_TODAY_TOP10.map((row) => row.win));

export function LobbyPage() {
  useEffect(() => {
    void api.get('/health').catch(() => undefined);
  }, []);

  return (
    <div className="space-y-8">
      <section className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8 2xl:col-span-9">
          <HeroBanner />
        </div>

        <aside className="grid gap-4 sm:grid-cols-3 xl:col-span-4 xl:grid-cols-1 2xl:col-span-3">
          <LobbyStatCard label="熱門館別" value={String(HALL_LIST.length)} detail="三種館別任你切，想衝倍數、拚手感、玩策略都能進場。" />
          <LobbyStatCard label="可玩遊戲" value={String(totalGames)} detail="從 Crash 到經典熱桌，今晚主場一次排開。" />
          <LobbyStatCard label="今日最高爆分" value={numberFormatter.format(topBoardWin)} detail="看看今天誰最火，再挑一館跟著開衝。" />
        </aside>
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Game Floors"
          title="今晚先衝哪一館？"
          description="想玩心跳拉滿就進 Crash，想快節奏連玩就去經典館，想靠判斷放大倍率就挑策略館。照你的手感直接進場。"
          rightSlot={
            <Link
              to="/hall/crash"
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#186073] transition hover:text-[#0E4555]"
            >
              先衝 Crash 館
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        />
        <HallEntrances />
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Live Board"
          title="今天誰在爆分"
          description="熱門戰報持續刷新，看看哪個館別現在最熱，手感到了就直接跟上。"
        />

        <TodayWinners />
      </section>
    </div>
  );
}

function LobbyStatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="label">{label}</div>
      <div className="mt-3 data-num text-[30px] font-bold text-[#186073]">{value}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{detail}</p>
    </article>
  );
}
