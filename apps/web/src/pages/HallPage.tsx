import { useLayoutEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import {
  getVisibleGameIdsForUsername,
  getVisibleHallById,
} from '@/data/halls';
import { FAKE_WIN_TICKER } from '@/data/fakeStats';
import { GameCardNew } from '@/components/game/GameCardNew';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { getHallIcon } from '@/lib/platformIcons';
import { isMobileLobbyViewport } from '@/lib/mobileViewport';
import { getLocalizedHallName, getLocalizedHallTagline } from '@/i18n/hallLabels';
import { useTranslation } from '@/i18n/useTranslation';
import { useAuthStore } from '@/stores/authStore';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');

export function HallPage() {
  const { locale, t } = useTranslation();
  const { hallId } = useParams<{ hallId: string }>();
  const navigate = useNavigate();
  const username = useAuthStore((state) => state.user?.username ?? null);
  const hall = getVisibleHallById(hallId, username);

  useLayoutEffect(() => {
    if (isMobileLobbyViewport()) {
      navigate(hall ? `/lobby?hall=${hall.id}` : '/lobby', { replace: true });
    }
  }, [hall, navigate]);

  if (!hall) {
    return (
      <div className="rounded-[28px] border border-white/[0.65] bg-white/[0.92] px-6 py-14 text-center shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="label">Missing Hall</div>
        <h1 className="mt-3 text-[30px] font-bold text-[#0F172A]">{t.hallPage.notFoundTitle}</h1>
        <p className="mt-3 text-[14px] text-[#4A5568]">{t.hallPage.notFoundDesc}</p>
        <Link to="/lobby" className="btn-teal mt-6 inline-flex text-[13px]">
          {t.common.lobby}
        </Link>
      </div>
    );
  }

  const hallName = getLocalizedHallName(hall, locale);
  const hallTagline = getLocalizedHallTagline(hall, locale);
  const games = getVisibleGameIdsForUsername(hall.gameIds, username)
    .map((id: GameIdType) => GAMES_REGISTRY[id])
    .filter((game): game is NonNullable<typeof game> => Boolean(game?.enabled));
  const HallIcon = getHallIcon(hall.iconKey);

  const liveWins = FAKE_WIN_TICKER.filter((record) =>
    hall.gameIds.includes(record.gameId as GameIdType),
  ).slice(0, 8);
  const hallPath = `/hall/${hall.id}`;

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
              aria-label={t.common.lobby}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-black/30 text-white/90 backdrop-blur transition hover:bg-black/45"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.1] backdrop-blur">
              <HallIcon className="h-6 w-6 text-white" aria-hidden="true" strokeWidth={1.7} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-pretty text-[22px] font-bold leading-tight md:text-[26px]">
                {hallName}
              </h1>
              <p className="mt-0.5 truncate text-[12px] text-white/80 md:text-[13px]">
                {hallTagline}．{games.length} {t.hallPage.popularGamesUnit}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 self-start md:self-auto">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur">
              <span className="dot-online" />
              {t.hallPage.hotNow}
            </span>
            <span className="hidden items-center rounded-full border border-[#C9A247]/45 bg-[#C9A247]/15 px-3 py-1.5 text-[11px] font-semibold text-[#F3D67D] backdrop-blur sm:inline-flex">
              {games.length} {t.common.gamesCountUnit}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="space-y-5 xl:col-span-8 2xl:col-span-9">
          <SectionHeading
            eyebrow="Game Floor"
            title={`${hallName} ${t.hallPage.hotGames}`}
            description={t.hallPage.description}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {games.map((game) => (
              <GameCardNew key={game.id} game={game} returnTo={hallPath} returnLabel={hallName} />
            ))}
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-4 xl:sticky xl:top-28 2xl:col-span-3">
          <div className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="label">Live Board</div>
                <h2 className="mt-2 text-[22px] font-bold text-[#0F172A]">
                  {t.hallPage.liveBoardTitle}
                </h2>
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
                      <div className="truncate text-[13px] font-semibold text-[#0F172A]">
                        {record.player}
                      </div>
                      <div className="truncate text-[11px] text-[#4A5568]">{record.game}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="data-num text-[13px] font-semibold text-[#C9A247]">
                        +{numberFormatter.format(record.win)}
                      </div>
                      <div className="num text-[11px] text-[#4A5568]">
                        ×{record.mult.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#E5E7EB] px-4 py-6 text-center text-[13px] text-[#4A5568]">
                  {t.hallPage.emptyLive}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] bg-[#0F172A] p-5 text-white shadow-[0_18px_38px_rgba(15,23,42,0.24)]">
            <div className="label !text-white/[0.55]">Tonight's Pick</div>
            <h3 className="mt-3 text-[22px] font-bold">
              {hallName} {t.hallPage.tonightPickTitle}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-white/[0.75]">
              {t.hallPage.tonightPickDesc}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
