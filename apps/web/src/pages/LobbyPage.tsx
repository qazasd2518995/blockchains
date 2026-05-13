import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Flame,
  Gift,
  History,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';
import { GAMES_REGISTRY, type GameMetadata, type GameIdType } from '@bg/shared';
import { api } from '@/lib/api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HallEntrances } from '@/components/home/HallEntrances';
import { TodayWinners } from '@/components/home/TodayWinners';
import { WinTicker } from '@/components/home/WinTicker';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { HALL_LIST, type HallId } from '@/data/halls';
import { FAKE_TODAY_TOP10, getDriftedOnlineCount } from '@/data/fakeStats';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { warmGameAssets } from '@/lib/gameAssetManifest';
import { getLobbyGameCover } from '@/lib/gameCoverAssets';
import { ResponsiveImage } from '@/lib/optimizedImages';
import { getGameIcon, getHallIcon } from '@/lib/platformIcons';
import { AudioMenu } from '@/components/layout/AudioMenu';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { getLocalizedHallName, getLocalizedHallShort } from '@/i18n/hallLabels';
import { useTranslation } from '@/i18n/useTranslation';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');
const visibleGameIds = Array.from(
  new Set(HALL_LIST.flatMap((hall) => hall.gameIds).filter((id) => GAMES_REGISTRY[id]?.enabled)),
);
const totalGames = visibleGameIds.length;
const topBoardWin = Math.max(...FAKE_TODAY_TOP10.map((row) => row.win));
const mobileGameIds = visibleGameIds;
const mobileGames = mobileGameIds
  .map((id: GameIdType) => GAMES_REGISTRY[id])
  .filter((game): game is NonNullable<typeof game> => Boolean(game?.enabled));
const gameHallMap = new Map<string, HallId>(
  HALL_LIST.flatMap((hall) => hall.gameIds.map((gameId) => [gameId, hall.id] as const)),
);
const hallMetaMap = new Map(HALL_LIST.map((hall) => [hall.id, hall]));

const MOBILE_CATEGORIES: Array<{
  id: 'all' | HallId;
  iconKey?: string;
}> = [
  { id: 'all' },
  { id: 'crash', iconKey: 'crash' },
  { id: 'tables', iconKey: 'tables' },
  { id: 'slots', iconKey: 'slots' },
  { id: 'roulette', iconKey: 'roulette' },
  { id: 'classic', iconKey: 'classic' },
  { id: 'strategy', iconKey: 'strategy' },
];

function mobileGamePath(gameId: string): string {
  return `/games/${gameId}`;
}

function mobileCategoryCount(categoryId: 'all' | HallId): number {
  if (categoryId === 'all') return mobileGames.length;
  return (
    hallMetaMap.get(categoryId)?.gameIds.filter((id) => GAMES_REGISTRY[id]?.enabled).length ?? 0
  );
}

function getMobileCategoryLabel(
  categoryId: 'all' | HallId,
  locale: ReturnType<typeof useTranslation>['locale'],
  t: ReturnType<typeof useTranslation>['t'],
): { label: string; shortLabel: string } {
  if (categoryId === 'all') {
    return { label: t.lobbyStats.mobileAllGames, shortLabel: t.lobbyStats.mobileAllShort };
  }
  const hall = hallMetaMap.get(categoryId);
  return {
    label: hall ? getLocalizedHallName(hall, locale) : categoryId,
    shortLabel: getLocalizedHallShort(categoryId, locale),
  };
}

export function LobbyPage() {
  const { t } = useTranslation();

  useEffect(() => {
    void api.get('/health').catch(() => undefined);
  }, []);

  return (
    <>
      <MobileLobbyOnePage />

      <div className="hidden space-y-8 lg:block">
        <section className="grid gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8 2xl:col-span-9">
            <HeroBanner />
          </div>

          <aside className="grid gap-4 sm:grid-cols-3 xl:col-span-4 xl:grid-cols-1 2xl:col-span-3">
            <LobbyStatCard
              label={t.lobbyStats.hotHalls}
              value={String(HALL_LIST.length)}
              detail={t.lobbyStats.hotHallsDetail}
            />
            <LobbyStatCard
              label={t.lobbyStats.playableGames}
              value={String(totalGames)}
              detail={t.lobbyStats.playableGamesDetail}
            />
            <LobbyStatCard
              label={t.lobbyStats.topWin}
              value={numberFormatter.format(topBoardWin)}
              detail={t.lobbyStats.topWinDetail}
            />
          </aside>
        </section>

        <section className="space-y-5">
          <SectionHeading
            eyebrow="Game Floors"
            title={t.lobbyStats.hallTitle}
            description={t.lobbyStats.hallDescription}
            rightSlot={
              <Link
                to="/hall/tables"
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#186073] transition hover:text-[#0E4555]"
              >
                {t.lobbyStats.enterTables}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            }
          />
          <HallEntrances />
        </section>

        <section className="space-y-5">
          <SectionHeading
            eyebrow="Live Board"
            title={t.lobbyStats.liveBoardTitle}
            description={t.lobbyStats.liveBoardDescription}
          />

          <div className="grid min-w-0 items-start gap-4 [--live-board-height:clamp(560px,44vw,640px)] xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
            <WinTicker />
            <TodayWinners />
          </div>
        </section>
      </div>
    </>
  );
}

function MobileLobbyOnePage() {
  const { t, locale } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isGuest = !user;
  const [onlineCount] = useState(() => getDriftedOnlineCount() + 5200);
  const [activeCategory, setActiveCategory] = useState<'all' | HallId>('all');
  const activeCategoryMeta = getMobileCategoryLabel(activeCategory, locale, t);

  const games = useMemo(() => {
    if (activeCategory === 'all') return mobileGames;
    return mobileGames.filter((game) => gameHallMap.get(game.id) === activeCategory);
  }, [activeCategory]);

  return (
    <div className="min-h-[100svh] bg-[#EDF4F7] pb-[calc(env(safe-area-inset-bottom)+18px)] lg:hidden">
      <section className="sticky top-0 z-30 border-b border-[#C9D9E2] bg-white pt-[env(safe-area-inset-top)] shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
        <div className="flex h-[58px] items-center gap-1 px-2 min-[380px]:gap-1.5 min-[380px]:px-2.5">
          <Link
            to="/lobby"
            className="flex min-h-11 shrink-0 items-center gap-1.5"
            aria-label={t.common.lobby}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#E9F8F8] text-[17px] font-black text-[#0992A8] max-[360px]:text-[15px]">
              BG
            </span>
            <span className="hidden min-w-0 truncate text-[13px] font-black leading-tight text-[#08A6B3] min-[460px]:inline">
              {t.landing.brandName.replace(/^BG\s*/, '')}
            </span>
          </Link>

          <div className="flex h-8 shrink-0 items-center gap-1 rounded-[8px] bg-[#1479A8] px-2 text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)] max-[370px]:px-1.5">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="shrink-0 text-[11px] font-bold max-[370px]:hidden">
              {t.common.live}
            </span>
            <span className="num shrink-0 text-[12px] font-black">
              {numberFormatter.format(onlineCount)}
            </span>
          </div>

          {isGuest && (
            <div className="flex min-w-[38px] flex-1 items-center justify-center">
              <span className="truncate text-[11px] font-black text-[#6B7280]">
                {t.lobbyStats.guestBrowsing}
              </span>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-end gap-1">
            {isGuest ? (
              <>
                <AudioMenu
                  variant="light"
                  className="h-11 w-11 rounded-[10px] border-[#D6E5EC] bg-[#F7FCFE] text-[#17657D]"
                />
                <LanguageSwitcher
                  variant="light"
                  compact
                  className="h-11 w-11 rounded-[10px] border-[#D6E5EC] bg-[#F7FCFE] text-[#17657D]"
                />
                <Link
                  to="/login?from=%2Flobby&reason=lobby"
                  className="inline-flex h-11 shrink-0 items-center justify-center rounded-[10px] border border-[#D6B75B] bg-[#FFF1B4] px-3 text-[12px] font-black text-[#765709]"
                >
                  {t.common.login}
                </Link>
              </>
            ) : (
              <>
                <AudioMenu
                  variant="light"
                  className="h-11 w-11 rounded-[10px] border-[#D6E5EC] bg-[#F7FCFE] text-[#17657D]"
                />
                <LanguageSwitcher
                  variant="light"
                  compact
                  className="h-11 w-11 rounded-[10px] border-[#D6E5EC] bg-[#F7FCFE] text-[#17657D]"
                />
                <div
                  className="flex h-10 w-[94px] min-w-0 items-center gap-1 rounded-[9px] border border-[#D6B75B] bg-[#FFF8DF] px-1.5 text-[#684F12] min-[390px]:h-11 min-[390px]:w-[116px]"
                  aria-label={`${t.common.account} ${user.username}，${t.common.balance} ${formatAmount(user.balance ?? '0')}`}
                >
                  <WalletCards className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-black leading-none text-[#5F4A14]">
                    {user.username}
                  </span>
                  <span className="data-num max-w-[50px] shrink-0 truncate text-[11px] font-black min-[390px]:max-w-[58px]">
                    {formatAmount(user.balance ?? '0')}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
          <Link
            to={isGuest ? '/login?from=%2Fhistory&reason=history' : '/history'}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-[#D8E7EE] bg-[#F7FCFE] text-[12px] font-black text-[#17657D] shadow-[0_4px_10px_rgba(15,23,42,0.06)] active:scale-[0.99]"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            {t.common.history}
          </Link>
          <Link
            to="/verify"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-[#D8E7EE] bg-[#F7FCFE] text-[12px] font-black text-[#17657D] shadow-[0_4px_10px_rgba(15,23,42,0.06)] active:scale-[0.99]"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t.common.gameGuide}
          </Link>
        </div>
      </section>

      <section className="border-b border-[#D1E0E7] bg-white">
        <Link
          to="/promos"
          className="relative block min-h-[118px] overflow-hidden bg-[#1B2030] active:opacity-95"
          aria-label={t.common.promos}
        >
          <ResponsiveImage
            src="/banners/hero-crash-dealer.png"
            alt=""
            aria-hidden="true"
            preset="hero"
            sizes="100vw"
            className="absolute inset-0 h-full w-full object-cover object-[72%_center] opacity-[0.82]"
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,34,0.92)_0%,rgba(5,18,34,0.72)_47%,rgba(5,18,34,0.12)_100%)]" />
          <div className="relative z-10 flex min-h-[118px] flex-col justify-center px-4 py-3">
            <span className="inline-flex w-fit items-center gap-1 rounded-[8px] bg-[#F7D568] px-2 py-1 text-[10px] font-black text-[#4B3600] shadow-sm">
              <Gift className="h-3.5 w-3.5" aria-hidden="true" />
              {t.lobbyStats.promoEyebrow}
            </span>
            <h1 className="mt-2 max-w-[230px] text-[26px] font-black leading-tight text-white">
              {t.lobbyStats.promoTitle}
            </h1>
            <p className="mt-1 max-w-[236px] text-[12px] font-semibold leading-5 text-white/78">
              {t.lobbyStats.promoDescription}
            </p>
          </div>
        </Link>
      </section>

      <section className="flex h-9 overflow-hidden border-b border-[#CFE0E8] bg-white">
        <div className="flex w-[58px] shrink-0 items-center justify-center gap-1 bg-[#1681B1] text-[14px] font-black text-white">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          {t.announcements.latest}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden px-3">
          <div className="ticker-track h-full items-center gap-8 [--ticker-duration:30s]">
            {[...t.announcements.items.slice(0, 4), ...t.announcements.items.slice(0, 4)].map(
              (msg, idx) => (
                <span
                  key={`${msg}-${idx}`}
                  className="inline-flex text-[13px] font-bold text-[#22718A]"
                >
                  {msg}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[66px_minmax(0,1fr)] gap-2 px-2 py-2">
        <aside className="sticky top-[calc(env(safe-area-inset-top)+58px)] self-start space-y-1.5">
          {MOBILE_CATEGORIES.map((category) => {
            const Icon = category.iconKey ? getHallIcon(category.iconKey) : Sparkles;
            const selected = activeCategory === category.id;
            const categoryLabel = getMobileCategoryLabel(category.id, locale, t);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`flex h-[58px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border text-[11px] font-black shadow-[0_6px_14px_rgba(15,23,42,0.08)] transition active:scale-[0.98] ${
                  selected
                    ? 'border-[#0F76A3] bg-[linear-gradient(180deg,#22AADA_0%,#1576A2_100%)] text-white'
                    : 'border-[#D8E7EE] bg-white text-[#1D6B83]'
                }`}
                aria-pressed={selected}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" strokeWidth={2} />
                <span className="leading-none">{categoryLabel.shortLabel}</span>
                <span
                  className={`num rounded-full px-1.5 py-0.5 text-[9px] leading-none ${
                    selected ? 'bg-white/20 text-white' : 'bg-[#E9F5F8] text-[#4D8798]'
                  }`}
                >
                  {mobileCategoryCount(category.id)}
                </span>
              </button>
            );
          })}
          <Link
            to="/promos"
            className="flex h-[58px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border border-[#D5B75E] bg-[#FFF1B4] text-[11px] font-black text-[#765709] shadow-[0_6px_14px_rgba(15,23,42,0.08)] active:scale-[0.98]"
          >
            <Gift className="h-5 w-5" aria-hidden="true" />
            {t.common.promos}
          </Link>
        </aside>

        <div className="min-w-0 space-y-2">
          <div className="flex h-9 items-center justify-between rounded-[10px] border border-[#D6E5EC] bg-white px-2.5 shadow-[0_6px_14px_rgba(15,23,42,0.06)]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-[#1DA6D2]" />
              <span className="truncate text-[14px] font-black text-[#12333E]">
                {activeCategoryMeta.label}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-1 text-[11px] font-bold text-[#15803D]">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              {t.common.live}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {games.map((game) => (
              <MobileGameCard key={game.id} game={game} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MobileGameCard({ game }: { game: GameMetadata }) {
  const { locale, t } = useTranslation();
  const GameIcon = getGameIcon(game.id);
  const cover = getLobbyGameCover(game.id);
  const hall = gameHallMap.get(game.id);
  const hallLabel = hall ? getLocalizedHallShort(hall, locale) : t.lobbyStats.mobileAllShort;
  const routeState = { returnTo: '/lobby', returnLabel: t.common.lobby };
  const warmAssets = () => warmGameAssets(game.id);
  const title = getLocalizedGameTitle(game.id, locale, game.nameZh);

  return (
    <Link
      to={mobileGamePath(game.id)}
      state={routeState}
      onFocus={warmAssets}
      onPointerDown={warmAssets}
      onPointerEnter={warmAssets}
      className="group relative min-h-[116px] overflow-hidden rounded-[13px] border border-[#D6E5EC] bg-[#F7FCFE] shadow-[0_6px_14px_rgba(15,23,42,0.08)] active:scale-[0.99]"
    >
      <ResponsiveImage
        src={cover}
        alt={title}
        preset="lobby-card"
        sizes="50vw"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.84] transition duration-300 group-active:scale-[1.03]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.76)_42%,rgba(255,255,255,0.2)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-[linear-gradient(0deg,rgba(4,28,42,0.46),transparent)]" />
      <div className="relative z-10 flex h-full min-h-[116px] flex-col justify-between p-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-black leading-tight text-[#17343F]">{title}</h3>
          <span className="mt-1 inline-flex rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-black text-[#1681A5] shadow-sm">
            {hallLabel}
          </span>
        </div>
        <div className="flex items-end justify-between gap-1">
          <p className="min-w-0 truncate text-[10px] font-semibold text-[#315967]">{game.name}</p>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0C6386] text-white shadow-[0_6px_12px_rgba(12,99,134,0.24)]">
            <GameIcon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function LobbyStatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-[24px] border border-white/[0.65] bg-white/[0.92] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="label">{label}</div>
      <div className="mt-3 data-num text-[30px] font-bold text-[#186073]">{value}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{detail}</p>
    </article>
  );
}
