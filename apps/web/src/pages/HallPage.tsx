import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { HALLS, type HallId } from '@/data/halls';
import { FAKE_WIN_TICKER } from '@/data/fakeStats';
import { GameCardNew } from '@/components/game/GameCardNew';
import { SectionHeading } from '@/components/layout/SectionHeading';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');

function hallNarrative(hallId: HallId): string {
  if (hallId === 'crash') return '喜歡看倍率拉升、自己決定什麼時候收手的玩家。';
  if (hallId === 'classic') return '偏好短局高頻、規則直覺、可以快速切換玩法的玩家。';
  return '願意讀資訊、拆風險、靠選擇而不是純運氣推進局勢的玩家。';
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

  const liveWins = FAKE_WIN_TICKER.filter((record) => hall.gameIds.includes(record.gameId as GameIdType)).slice(0, 8);
  const liveWinTotal = liveWins.reduce((sum, record) => sum + record.win, 0);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-black/5 shadow-[0_18px_38px_rgba(15,23,42,0.14)]">
        <div className="relative px-6 py-8 text-white md:px-8 md:py-10" style={{ background: hall.gradient }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_42%)]" />

          <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0">
              <Link
                to="/lobby"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/[0.15] px-3 py-1.5 text-[12px] font-semibold text-white/[0.85] transition hover:bg-black/[0.25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                回到大廳
              </Link>

              <div className="mt-6 text-[64px] leading-none md:text-[84px]">{hall.emoji}</div>
              <h1 className="mt-3 text-pretty text-[32px] font-bold leading-tight md:text-[42px]">
                {hall.nameZh}
              </h1>
              <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-white/[0.85]">
                {hall.tagline} 這一館目前收進 {games.length} 款遊戲，主要適合 {hallNarrative(hall.id)}
              </p>

              <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
                <span className="rounded-full border border-white/20 bg-black/[0.15] px-3 py-1.5 text-white/[0.85]">
                  {games.length} 款遊戲
                </span>
                <span className="rounded-full border border-white/20 bg-black/[0.15] px-3 py-1.5 text-white/[0.85]">
                  近 8 筆即時戰報
                </span>
                <span className="rounded-full border border-white/20 bg-black/[0.15] px-3 py-1.5 text-white/[0.85]">
                  結果可驗證
                </span>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  to="/verify"
                  className="btn-chip border-white/20 bg-white/[0.08] text-white hover:border-white/35 hover:bg-white/[0.14]"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  驗證最近一局
                </Link>
                <Link
                  to="/history"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/[0.15] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-black/[0.25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-5">
          <SectionHeading
            eyebrow="Game Floor"
            title={`${hall.nameZh} 遊戲清單`}
            description="進館後就只看該館內容，避免館別切換時還要重新掃描大量不相關的遊戲卡片。"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((game) => (
              <GameCardNew key={game.id} game={game} />
            ))}
          </div>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-28">
          <div className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="label">Live Board</div>
                <h2 className="mt-2 text-[22px] font-bold text-[#0F172A]">即時戰報</h2>
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
                  這一館目前沒有可展示的即時戰報。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-[#0F172A] p-5 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)]">
            <div className="label !text-white/[0.55]">Provably Fair</div>
            <h3 className="mt-3 text-[22px] font-bold">卡片之外，還是能追到每局結果。</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/[0.75]">
              如果這一館剛好是你主要遊玩的區域，直接用驗證頁輸入公開資料，就能在瀏覽器內重算對應結果。
            </p>
            <Link
              to="/verify"
              className="btn-chip mt-5 border-white/15 bg-white/[0.06] text-white hover:border-white/30 hover:bg-white/[0.12]"
            >
              前往公平驗證
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
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
