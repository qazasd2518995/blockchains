import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Flame, Gift, History, Megaphone, ShieldCheck, Users } from 'lucide-react';
import { GAMES_REGISTRY, type GameMetadata, type GameIdType } from '@bg/shared';
import { api } from '@/lib/api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HallEntrances } from '@/components/home/HallEntrances';
import { TodayWinners } from '@/components/home/TodayWinners';
import { WinTicker } from '@/components/home/WinTicker';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { getVisibleHallsForUsername, type HallId, type HallMeta } from '@/data/halls';
import {
  FAKE_TODAY_TOP10,
  getFloatingOnlineCount,
  getNextFloatingOnlineCount,
} from '@/data/fakeStats';
import { useAuthStore } from '@/stores/authStore';
import { warmGameAssets } from '@/lib/gameAssetManifest';
import { getLobbyGameCover } from '@/lib/gameCoverAssets';
import { ResponsiveImage } from '@/lib/optimizedImages';
import { getGameIcon, getHallIcon } from '@/lib/platformIcons';
import { AudioMenu } from '@/components/layout/AudioMenu';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { MobileAccountMenu } from '@/components/layout/MobileAccountMenu';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { getLocalizedHallName, getLocalizedHallShort } from '@/i18n/hallLabels';
import { useTranslation } from '@/i18n/useTranslation';
import { getGamePromoMultiplierLabel, isGamePromoHot } from '@/lib/gamePromos';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');
const topBoardWin = Math.max(...FAKE_TODAY_TOP10.map((row) => row.win));

const BASE_MOBILE_CATEGORIES: Array<{
  id: 'all' | HallId;
  iconKey?: string;
}> = [
  { id: 'all' },
  { id: 'crash', iconKey: 'crash' },
  { id: 'slots', iconKey: 'slots' },
  { id: 'roulette', iconKey: 'roulette' },
  { id: 'tables', iconKey: 'tables' },
  { id: 'classic', iconKey: 'classic' },
];
type MobileCardVariant = 'hero' | 'standard' | 'angled' | 'tall';
const MOBILE_COVER_CLIP_PATHS: Record<MobileCardVariant, string> = {
  hero: 'polygon(3% 0, 92% 0, 100% 9%, 100% 71%, 96% 100%, 6% 100%, 0 90%, 0 8%)',
  standard: 'polygon(5% 0, 90% 0, 100% 7%, 100% 70%, 94% 100%, 7% 100%, 0 90%, 0 8%)',
  angled: 'polygon(0 0, 94% 0, 100% 10%, 100% 100%, 12% 100%, 0 88%)',
  tall: 'polygon(8% 0, 100% 0, 100% 88%, 92% 100%, 0 100%, 0 10%)',
};

function mobileGamePath(gameId: string): string {
  return `/games/${gameId}`;
}

function mobileLobbyPathForCategory(categoryId: 'all' | HallId): string {
  return categoryId === 'all' ? '/lobby' : `/lobby?hall=${encodeURIComponent(categoryId)}`;
}

function buildVisibleGameIds(halls: readonly HallMeta[]): GameIdType[] {
  return Array.from(
    new Set(halls.flatMap((hall) => hall.gameIds).filter((id) => GAMES_REGISTRY[id]?.enabled)),
  );
}

function buildGameHallMap(halls: readonly HallMeta[]): Map<string, HallId> {
  return new Map(halls.flatMap((hall) => hall.gameIds.map((gameId) => [gameId, hall.id] as const)));
}

function buildHallMetaMap(halls: readonly HallMeta[]): Map<HallId, HallMeta> {
  return new Map(halls.map((hall) => [hall.id, hall]));
}

function getMobileCategories(hallMetaMap: Map<HallId, HallMeta>) {
  return BASE_MOBILE_CATEGORIES.filter(
    (category) => category.id === 'all' || hallMetaMap.has(category.id),
  );
}

function mobileCategoryCount(
  categoryId: 'all' | HallId,
  mobileGames: GameMetadata[],
  gameHallMap: Map<string, HallId>,
): number {
  if (categoryId === 'all') return mobileGames.length;
  return mobileGames.filter((game) => gameHallMap.get(game.id) === categoryId).length;
}

function getMobileCategoryLabel(
  categoryId: 'all' | HallId,
  locale: ReturnType<typeof useTranslation>['locale'],
  t: ReturnType<typeof useTranslation>['t'],
  hallMetaMap: Map<HallId, HallMeta>,
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

function getMobileCardVariant(index: number): MobileCardVariant {
  if (index === 0) return 'hero';
  if (index % 6 === 3) return 'tall';
  if (index % 4 === 2) return 'angled';
  return 'standard';
}

function getMobileCategoryFromSearch(
  searchParams: URLSearchParams,
  hallMetaMap: Map<HallId, HallMeta>,
  mobileCategories: Array<{ id: 'all' | HallId; iconKey?: string }>,
): 'all' | HallId {
  const hallParam = searchParams.get('hall');
  if (
    hallParam &&
    hallMetaMap.has(hallParam as HallId) &&
    mobileCategories.some((category) => category.id === hallParam)
  ) {
    return hallParam as HallId;
  }
  return 'all';
}

export function LobbyPage() {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.user?.username ?? null);
  const visibleHalls = useMemo(() => getVisibleHallsForUsername(username), [username]);
  const visibleGameIds = useMemo(() => buildVisibleGameIds(visibleHalls), [visibleHalls]);
  const canEnterTables = visibleHalls.some((hall) => hall.id === 'tables');

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
              value={String(visibleHalls.length)}
              detail={t.lobbyStats.hotHallsDetail}
            />
            <LobbyStatCard
              label={t.lobbyStats.playableGames}
              value={String(visibleGameIds.length)}
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
              canEnterTables ? (
                <Link
                  to="/hall/tables"
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#EA580C] transition hover:text-[#9A3412]"
                >
                  {t.lobbyStats.enterTables}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : null
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
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const username = user?.username ?? null;
  const isGuest = !user;
  const visibleHalls = useMemo(() => getVisibleHallsForUsername(username), [username]);
  const visibleGameIds = useMemo(() => buildVisibleGameIds(visibleHalls), [visibleHalls]);
  const mobileGames = useMemo(
    () =>
      visibleGameIds
        .map((id: GameIdType) => GAMES_REGISTRY[id])
        .filter((game): game is NonNullable<typeof game> => Boolean(game?.enabled)),
    [visibleGameIds],
  );
  const gameHallMap = useMemo(() => buildGameHallMap(visibleHalls), [visibleHalls]);
  const hallMetaMap = useMemo(() => buildHallMetaMap(visibleHalls), [visibleHalls]);
  const mobileCategories = useMemo(() => getMobileCategories(hallMetaMap), [hallMetaMap]);
  const [onlineCount, setOnlineCount] = useState(() => getFloatingOnlineCount());
  const [activeCategory, setActiveCategory] = useState<'all' | HallId>(() =>
    getMobileCategoryFromSearch(searchParams, hallMetaMap, mobileCategories),
  );
  const activeCategoryMeta = getMobileCategoryLabel(activeCategory, locale, t, hallMetaMap);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setOnlineCount((current) => getNextFloatingOnlineCount(current));
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setActiveCategory(getMobileCategoryFromSearch(searchParams, hallMetaMap, mobileCategories));
  }, [hallMetaMap, mobileCategories, searchParams]);

  const handleCategorySelect = useCallback(
    (categoryId: 'all' | HallId) => {
      setActiveCategory(categoryId);
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (categoryId === 'all') {
            next.delete('hall');
          } else {
            next.set('hall', categoryId);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const games = useMemo(() => {
    if (activeCategory === 'all') return mobileGames;
    return mobileGames.filter((game) => gameHallMap.get(game.id) === activeCategory);
  }, [activeCategory]);

  return (
    <div className="mobile-lobby-surface min-h-[100svh] pb-[calc(env(safe-area-inset-bottom)+18px)] lg:hidden">
      <section className="sticky top-0 z-30 border-b border-[#C4B5FD]/60 bg-[#F7F2FF]/95 pt-[env(safe-area-inset-top)] shadow-[0_4px_14px_rgba(88,28,135,0.10)] backdrop-blur">
        <div className="flex h-[52px] items-center gap-1 px-2 min-[380px]:gap-1.5 min-[380px]:px-2.5">
          <Link
            to="/lobby"
            className="flex min-h-10 shrink-0 items-center gap-1.5"
            aria-label={t.common.lobby}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-[#C084FC]/34 bg-[#F5F0FF]">
              <ResponsiveImage
                src="/brand/yachiyo-emblem.png"
                alt=""
                preset="lobby-card"
                sizes="40px"
                loading="eager"
                width={824}
                height={824}
                className="h-9 w-9 object-contain"
                draggable={false}
              />
            </span>
            <span className="hidden min-w-0 truncate text-[13px] font-black leading-tight text-[#B45309] min-[460px]:inline">
              {t.landing.brandName}
            </span>
          </Link>

          <div className="flex h-9 shrink-0 items-center gap-1 rounded-[9px] bg-[#EA580C] px-2 text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)] max-[370px]:px-1.5">
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
                  className="h-10 w-10 rounded-[10px] border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412]"
                />
                <LanguageSwitcher
                  variant="light"
                  compact
                  className="h-10 w-10 rounded-[10px] border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412]"
                />
                <Link
                  to="/login?from=%2Flobby&reason=lobby"
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-[10px] border border-[#D6B75B] bg-[#FFF1B4] px-3 text-[12px] font-black text-[#765709]"
                >
                  {t.common.login}
                </Link>
              </>
            ) : (
              <>
                <AudioMenu
                  variant="light"
                  className="h-10 w-10 rounded-[10px] border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412]"
                />
                <LanguageSwitcher
                  variant="light"
                  compact
                  className="h-10 w-10 rounded-[10px] border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412]"
                />
                <MobileAccountMenu className="h-10 w-[112px] min-[390px]:w-[124px]" />
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 px-2 pb-1.5">
          <Link
            to={isGuest ? '/login?from=%2Fhistory&reason=history' : '/history'}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-[#FED7AA] bg-[#FFF7ED] text-[12px] font-black text-[#9A3412] shadow-[0_4px_10px_rgba(15,23,42,0.06)] active:scale-[0.99]"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            {t.common.history}
          </Link>
          <Link
            to="/verify"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-[#FED7AA] bg-[#FFF7ED] text-[12px] font-black text-[#9A3412] shadow-[0_4px_10px_rgba(15,23,42,0.06)] active:scale-[0.99]"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t.common.gameGuide}
          </Link>
        </div>
      </section>

      <section className="border-b border-[#EBD4B0] bg-[#FFF3E0]/88">
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

      <section className="flex h-9 overflow-hidden border-b border-[#EBD4B0] bg-[#FFF9EE]/92">
        <div className="flex w-[58px] shrink-0 items-center justify-center gap-1 bg-[#EA580C] text-[14px] font-black text-white">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          {t.announcements.latest}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden px-3">
          <div className="ticker-track h-full items-center gap-8 [--ticker-duration:30s]">
            {[...t.announcements.items.slice(0, 4), ...t.announcements.items.slice(0, 4)].map(
              (msg, idx) => (
                <span
                  key={`${msg}-${idx}`}
                  className="inline-flex text-[13px] font-bold text-[#B45309]"
                >
                  {msg}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[66px_minmax(0,1fr)] gap-2 px-2 py-2">
        <aside className="mobile-lobby-category-rail sticky top-[calc(env(safe-area-inset-top)+58px)] self-start space-y-1.5">
          {mobileCategories.map((category) => {
            const Icon = getHallIcon(category.iconKey ?? 'classic');
            const selected = activeCategory === category.id;
            const categoryLabel = getMobileCategoryLabel(category.id, locale, t, hallMetaMap);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleCategorySelect(category.id)}
                className={`mobile-lobby-category-button flex h-[58px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border text-[11px] font-black shadow-[0_6px_14px_rgba(15,23,42,0.08)] transition active:scale-[0.98] ${
                  selected
                    ? 'mobile-lobby-category-button--active border-[#EA580C] text-white'
                    : 'border-[#D8C6FF]/90 text-[#6B3E95]'
                }`}
                aria-pressed={selected}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" strokeWidth={2} />
                <span className="leading-none">{categoryLabel.shortLabel}</span>
                <span
                  className={`num rounded-full px-1.5 py-0.5 text-[9px] leading-none ${
                    selected ? 'bg-white/20 text-white' : 'bg-white/70 text-[#6D28D9]'
                  }`}
                >
                  {mobileCategoryCount(category.id, mobileGames, gameHallMap)}
                </span>
              </button>
            );
          })}
          <Link
            to="/promos"
            className="mobile-lobby-promo-button flex h-[58px] w-full flex-col items-center justify-center gap-0.5 rounded-[10px] border text-[11px] font-black shadow-[0_6px_14px_rgba(15,23,42,0.08)] active:scale-[0.98]"
          >
            <Gift className="h-5 w-5" aria-hidden="true" />
            {t.common.promos}
          </Link>
        </aside>

        <div className="min-w-0 space-y-2">
          <div className="flex h-9 items-center justify-between rounded-[10px] border border-[#DDD6FE] bg-[#FBF7FF]/92 px-2.5 shadow-[0_6px_14px_rgba(88,28,135,0.08)] backdrop-blur">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-4 w-1 rounded-full bg-[#F97316]" />
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
            {games.map((game, index) => (
              <MobileGameCard
                key={game.id}
                game={game}
                hallId={gameHallMap.get(game.id)}
                returnTo={mobileLobbyPathForCategory(activeCategory)}
                variant={getMobileCardVariant(index)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MobileGameCard({
  game,
  hallId,
  returnTo,
  variant = 'standard',
}: {
  game: GameMetadata;
  hallId?: HallId;
  returnTo: string;
  variant?: MobileCardVariant;
}) {
  const { locale, t } = useTranslation();
  const GameIcon = getGameIcon(game.id);
  const cover = getLobbyGameCover(game.id);
  const hallLabel = hallId ? getLocalizedHallShort(hallId, locale) : t.lobbyStats.mobileAllShort;
  const routeState = { returnTo, returnLabel: t.common.lobby };
  const warmAssets = () => warmGameAssets(game.id);
  const title = getLocalizedGameTitle(game.id, locale, game.nameZh);
  const multiplierLabel = getGamePromoMultiplierLabel(game.id);
  const isHot = isGamePromoHot(game.id);
  const featured = variant === 'hero';
  const tall = variant === 'tall';
  const clipPath = MOBILE_COVER_CLIP_PATHS[variant];

  return (
    <Link
      to={mobileGamePath(game.id)}
      state={routeState}
      onFocus={warmAssets}
      onPointerDown={warmAssets}
      onPointerEnter={warmAssets}
      className={`group relative overflow-visible rounded-[13px] bg-transparent shadow-[0_8px_16px_rgba(15,23,42,0.12)] active:scale-[0.99] ${
        featured ? 'col-span-2 min-h-[190px]' : tall ? 'min-h-[150px]' : 'min-h-[132px]'
      }`}
      style={{ clipPath }}
    >
      <div className="absolute inset-0 bg-[#1B1307]" />
      <ResponsiveImage
        src={cover}
        alt={title}
        preset="lobby-card"
        sizes={featured ? '100vw' : '50vw'}
        className="absolute inset-0 h-full w-full object-cover object-center opacity-100 transition duration-300 group-active:scale-[1.03]"
        loading={featured ? 'eager' : 'lazy'}
        fetchPriority={featured ? 'high' : 'auto'}
        width={1086}
        height={1448}
      />
      {featured && (
        <div className="absolute inset-x-0 top-0 z-10 h-14 bg-[linear-gradient(180deg,rgba(0,0,0,0.46),rgba(0,0,0,0))]" />
      )}
      {isHot && (
        <span className="absolute left-2 top-2 z-20 rounded-full bg-[#EC0E69] px-2 py-1 text-[10px] font-black leading-none text-white shadow-[0_3px_8px_rgba(236,14,105,0.35)]">
          熱門
        </span>
      )}
      <span
        className="absolute right-1.5 top-1.5 z-20 inline-flex min-w-[52px] max-w-[78px] flex-col items-center rounded-[6px] bg-[linear-gradient(180deg,#FFE27A_0%,#F59E0B_100%)] px-1.5 py-1 text-center text-[#4B2600] shadow-[0_3px_8px_rgba(0,0,0,0.22)]"
        aria-label={`最高爆分 ${multiplierLabel}`}
      >
        <strong className="num max-w-full truncate text-[10px] font-black leading-none">
          {multiplierLabel}
        </strong>
        <small className="mt-0.5 text-[8px] font-black leading-none tracking-[0.08em]">
          最高爆分
        </small>
      </span>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.02)_0%,rgba(0,0,0,0)_42%,rgba(16,7,2,0.76)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-[linear-gradient(0deg,rgba(0,0,0,0.94),rgba(0,0,0,0.6)_44%,rgba(0,0,0,0))]" />
      <div
        className={`relative z-10 flex h-full flex-col justify-between p-2.5 ${
          featured ? 'min-h-[190px]' : tall ? 'min-h-[150px]' : 'min-h-[132px]'
        }`}
      >
        <div className="min-w-0 pt-10">
          <span className="inline-flex rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-black text-[#FFE27A] shadow-[0_2px_8px_rgba(0,0,0,0.24)] backdrop-blur-[2px]">
            {hallLabel}
          </span>
        </div>
        <div className="flex items-end justify-between gap-1">
          <div className="min-w-0">
            <h3
              className={`truncate font-black leading-none text-[#FFF0A6] [text-shadow:0_2px_0_#5A1F05,0_4px_0_rgba(0,0,0,0.35),0_6px_12px_rgba(0,0,0,0.95)] ${
                featured ? 'text-[31px]' : 'text-[20px]'
              }`}
            >
              {title}
            </h3>
            <p
              className={`min-w-0 truncate font-black uppercase text-white/84 [text-shadow:0_2px_7px_rgba(0,0,0,0.9)] ${
                featured ? 'mt-1 text-[12px]' : 'mt-0.5 text-[10px]'
              }`}
            >
              {game.name}
            </p>
          </div>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#FFE27A]/70 bg-[#EA580C] text-white shadow-[0_6px_12px_rgba(234,88,12,0.34)]">
            <GameIcon className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function LobbyStatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-[24px] border border-[#DDD6FE]/80 bg-[#FBF7FF]/88 p-5 shadow-[0_12px_30px_rgba(88,28,135,0.10)] backdrop-blur">
      <div className="label">{label}</div>
      <div className="mt-3 data-num text-[30px] font-bold text-[#EA580C]">{value}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-[#4A5568]">{detail}</p>
    </article>
  );
}
