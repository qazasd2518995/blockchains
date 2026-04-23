import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
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
  const liveWinTotal = liveWins.reduce((sum, record) => sum + record.win, 0);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-black/5 shadow-[0_18px_38px_rgba(15,23,42,0.14)]">
        <div className="relative px-6 py-8 text-white md:px-8 md:py-10" style={{ background: hall.gradient }}>
          <img
            src={hall.artwork}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[52%] max-w-[760px] object-cover opacity-[0.82] xl:block"
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[62%] bg-[linear-gradient(270deg,rgba(5,18,34,0.08),rgba(5,18,34,0.24)_38%,rgba(5,18,34,0.78)_100%)] xl:block" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,34,0.86)_0%,rgba(5,18,34,0.72)_34%,rgba(5,18,34,0.32)_62%,rgba(5,18,34,0.1)_100%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_42%)]" />

          <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1.3fr)_360px]">
            <div className="min-w-0">
              <Link
                to="/lobby"
                className="inline-flex items-center gap-2 rounded-full border border-white/28 bg-[#071523]/72 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(2,6,23,0.24)] backdrop-blur-md transition hover:bg-[#0A1B2D]/84 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                回到大廳
              </Link>

              <div className="mt-6 flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/20 bg-white/[0.12] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] md:h-28 md:w-28">
                <HallIcon className="h-12 w-12 text-white md:h-14 md:w-14" aria-hidden="true" strokeWidth={1.6} />
              </div>
              <h1 className="mt-3 text-pretty text-[32px] font-bold leading-tight md:text-[42px]">
                {hall.nameZh}
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/[0.85]">
                {hall.tagline}。{games.length} 款人氣玩法已經就位，最適合 {hallNarrative(hall.id)}
              </p>

              <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded-full border border-white/20 bg-black/[0.15] px-3 py-1.5 text-white/[0.85]">
                  {games.length} 款人氣遊戲
                </span>
                <span className="rounded-full border border-white/20 bg-black/[0.15] px-3 py-1.5 text-white/[0.85]">
                  熱門戰報持續刷新
                </span>
                <span className="rounded-full border border-white/20 bg-black/[0.15] px-3 py-1.5 text-white/[0.85]">
                  今晚就從這一館開玩
                </span>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to="/verify"
                  className="inline-flex items-center gap-2 rounded-full border border-white/28 bg-[#071523]/72 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(2,6,23,0.24)] backdrop-blur-md transition hover:border-white/36 hover:bg-[#0A1B2D]/84 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  驗證最近一局
                </Link>
                <Link
                  to="/history"
                  className="inline-flex items-center gap-2 rounded-full border border-white/28 bg-[#071523]/72 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(2,6,23,0.24)] backdrop-blur-md transition hover:bg-[#0A1B2D]/84 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  查看我的記錄
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <HallMetaCard label="館內遊戲" value={String(games.length)} detail="把同節奏的遊戲收成單一入口。" />
              <HallMetaCard label="即時戰報" value={String(liveWins.length)} detail="側欄只放這一館的近期戰報，不混館。" />
              <HallMetaCard label="戰報總額" value={numberFormatter.format(liveWinTotal)} detail="用較大的數字驗證版面與字體穩定性。" />
            </div>
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

function HallMetaCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-[20px] border border-white/20 bg-black/[0.15] px-4 py-4 backdrop-blur">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/[0.55]">{label}</div>
      <div className="mt-2 data-num text-[28px] font-bold text-white">{value}</div>
      <p className="mt-2 text-[12px] leading-relaxed text-white/[0.75]">{detail}</p>
    </article>
  );
}
