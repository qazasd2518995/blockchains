import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { HALLS, type HallId } from '@/data/halls';
import { FAKE_WIN_TICKER } from '@/data/fakeStats';
import { GameCardNew } from '@/components/game/GameCardNew';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { getHallIcon } from '@/lib/platformIcons';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');

function hallNarrative(hallId: HallId): string {
  if (hallId === 'crash') return '想追高倍、看準時機一鍵收分的玩家。';
  if (hallId === 'classic') return '喜歡節奏快、連開幾局都不膩的玩家。';
  if (hallId === 'tables') return '想看牌路、換桌追節奏，專注桌面對局的玩家。';
  return '想邊判斷邊拚高倍，把手感和腦力一起拉滿的玩家。';
}

export function HallPage() {
  const { hallId } = useParams<{ hallId: string }>();
  const hall = hallId && hallId in HALLS ? HALLS[hallId as HallId] : undefined;

  if (!hall) {
    return (
      <div className="rounded-[28px] border border-white/[0.65] bg-white/[0.92] px-6 py-14 text-center shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="label">Missing Hall</div>
        <h1 className="mt-3 text-[30px] font-bold text-[#0F172A]">館別不存在</h1>
        <p className="mt-3 text-[14px] text-[#4A5568]">請回到大廳重新選擇館別。</p>
        <Link to="/lobby" className="btn-teal mt-6 inline-flex text-[13px]">
          返回大廳
        </Link>
      </div>
    );
  }

  const games = hall.gameIds
    .map((id: GameIdType) => GAMES_REGISTRY[id])
    .filter((game): game is NonNullable<typeof game> => Boolean(game));
  const HallIcon = getHallIcon(hall.iconKey);

  const liveWins = FAKE_WIN_TICKER.filter((record) => hall.gameIds.includes(record.gameId as GameIdType)).slice(0, 8);

  return (
    <div className="space-y-6">
      <section
        className="relative overflow-hidden rounded-[24px] border border-black/5 shadow-[0_18px_38px_rgba(15,23,42,0.14)]"
        style={{ background: hall.gradient }}
      >
        <img
          src={hall.artwork}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,34,0.86)_0%,rgba(5,18,34,0.55)_45%,rgba(5,18,34,0.18)_80%,rgba(5,18,34,0.05)_100%)]" />

        <div className="relative z-10 flex flex-col gap-3 px-5 py-5 text-white md:flex-row md:items-center md:justify-between md:px-7 md:py-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/lobby"
              aria-label="回到大廳"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/30 text-white/90 backdrop-blur transition hover:bg-black/45"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.1] backdrop-blur">
              <HallIcon className="h-6 w-6 text-white" aria-hidden="true" strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-pretty text-[22px] font-bold leading-tight md:text-[26px]">
                {hall.nameZh}
              </h1>
              <p className="mt-0.5 truncate text-[12px] text-white/80 md:text-[13px]">
                {hall.tagline}．{games.length} 款人氣玩法
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-start md:self-auto">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur">
              <span className="dot-online" />
              熱門出分中
            </span>
            <span className="hidden items-center rounded-full border border-[#C9A247]/45 bg-[#C9A247]/15 px-3 py-1.5 text-[11px] font-semibold text-[#F3D67D] backdrop-blur sm:inline-flex">
              {games.length} 款 · 適合 {hallNarrative(hall.id).replace('的玩家。', '')}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="space-y-5 xl:col-span-8 2xl:col-span-9">
          <SectionHeading
            eyebrow="Game Floor"
            title={`${hall.nameZh} 熱門遊戲`}
            description="這一館把最對味的玩法都排好了，想直衝熱桌、連開幾局，往下挑就對了。"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {games.map((game) => (
              <GameCardNew key={game.id} game={game} />
            ))}
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-4 xl:sticky xl:top-28 2xl:col-span-3">
          <div className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="label">Live Board</div>
                <h2 className="mt-2 text-[22px] font-bold text-[#0F172A]">這一館正在出分</h2>
              </div>
              <span className="dot-online" />
            </div>

            <div className="mt-4 space-y-2">
              {liveWins.length ? (
                liveWins.map((record) => (
                  <div
                    key={`${record.player}-${record.gameId}-${record.win}`}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-[#E5E7EB] bg-[#F8FAFB] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-[#0F172A]">{record.player}</div>
                      <div className="truncate text-[11px] text-[#4A5568]">{record.game}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="data-num text-[13px] font-semibold text-[#C9A247]">
                        +{numberFormatter.format(record.win)}
                      </div>
                      <div className="num text-[11px] text-[#4A5568]">×{record.mult.toFixed(2)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#E5E7EB] px-4 py-6 text-center text-[13px] text-[#4A5568]">
                  戰報稍後刷新，先往下挑一款你今晚想衝的遊戲。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-[#0F172A] p-5 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)]">
            <div className="label !text-white/[0.55]">Tonight's Pick</div>
            <h3 className="mt-3 text-[22px] font-bold">{hall.nameZh} 今晚正燙。</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/[0.75]">
              先看哪幾款正在出分，再往下直接挑桌開玩。手感來了，就別讓節奏斷掉。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
