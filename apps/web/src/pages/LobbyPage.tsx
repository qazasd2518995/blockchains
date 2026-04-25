import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Crown,
  Flame,
  Gift,
  Mail,
  Megaphone,
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
import { getGameIcon, getHallIcon } from '@/lib/platformIcons';

const numberFormatter = new Intl.NumberFormat('zh-Hant-TW');
const totalGames = new Set(HALL_LIST.flatMap((hall) => hall.gameIds)).size;
const topBoardWin = Math.max(...FAKE_TODAY_TOP10.map((row) => row.win));
const mobileGameIds = Array.from(new Set(HALL_LIST.flatMap((hall) => hall.gameIds)));
const mobileGames = mobileGameIds
  .map((id: GameIdType) => GAMES_REGISTRY[id])
  .filter((game): game is NonNullable<typeof game> => Boolean(game));
const gameHallMap = new Map<string, HallId>(
  HALL_LIST.flatMap((hall) => hall.gameIds.map((gameId) => [gameId, hall.id] as const)),
);
const hallMetaMap = new Map(HALL_LIST.map((hall) => [hall.id, hall]));

const MOBILE_CATEGORIES: Array<{
  id: 'all' | HallId;
  label: string;
  shortLabel: string;
  iconKey?: string;
}> = [
  { id: 'all', label: '熱門遊戲', shortLabel: '熱門' },
  { id: 'tables', label: '真人牌桌', shortLabel: '真人', iconKey: 'tables' },
  { id: 'classic', label: '電子遊戲', shortLabel: '電子', iconKey: 'classic' },
  { id: 'crash', label: '跑馬燈', shortLabel: '跑馬', iconKey: 'crash' },
  { id: 'strategy', label: '策略遊戲', shortLabel: '策略', iconKey: 'strategy' },
];

const MOBILE_HALL_LABEL: Record<HallId, string> = {
  tables: '真人',
  classic: '電子',
  crash: '跑馬',
  strategy: '策略',
};

const MOBILE_GAME_NAME: Record<string, string> = {
  baccarat: '百家樂',
  dice: '骰子',
  mines: '踩地雷',
  hilo: '猜大小',
  keno: '基諾',
  wheel: '彩色轉輪',
  'mini-roulette': '迷你輪盤',
  plinko: '彈珠台',
  hotline: '熱線',
  tower: '疊塔',
  rocket: '火箭',
  aviator: '飛行員',
  'space-fleet': '太空艦隊',
  jetx: '飆速X',
  balloon: '氣球',
  jetx3: '飆速X3',
  'double-x': '雙倍X',
  'plinko-x': '掉珠挑戰X',
  carnival: '狂歡節',
};

function mobileGameName(game: GameMetadata): string {
  return MOBILE_GAME_NAME[game.id] ?? game.nameZh;
}

function mobileGamePath(gameId: string): string {
  return `/games/${gameId}`;
}

function mobileCategoryCount(categoryId: 'all' | HallId): number {
  if (categoryId === 'all') return mobileGames.length;
  return hallMetaMap.get(categoryId)?.gameIds.length ?? 0;
}

export function LobbyPage() {
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
          <LobbyStatCard label="熱門館別" value={String(HALL_LIST.length)} detail="四種館別任你切，想衝倍數、拚手感、玩策略，或直接坐上牌桌都能進場。" />
          <LobbyStatCard label="可玩遊戲" value={String(totalGames)} detail="從 Crash 到百家樂，今晚主場一次排開。" />
          <LobbyStatCard label="今日最高爆分" value={numberFormatter.format(topBoardWin)} detail="看看今天誰最火，再挑一館跟著開衝。" />
        </aside>
      </section>

      <section className="space-y-5">
        <SectionHeading
          eyebrow="Game Floors"
          title="今晚先衝哪一館？"
          description="想玩心跳拉滿就進 Crash，想快節奏連玩就去經典館，想靠判斷放大倍率就挑策略館，想專注桌面對局就進牌桌館。照你的手感直接進場。"
          rightSlot={
            <Link
              to="/hall/tables"
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#186073] transition hover:text-[#0E4555]"
            >
              先進牌桌館
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

        <div className="grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)] 2xl:grid-cols-[360px_minmax(0,1fr)]">
          <WinTicker />
          <TodayWinners />
        </div>
      </section>
      </div>
    </>
  );
}

function MobileLobbyOnePage() {
  const user = useAuthStore((state) => state.user);
  const [onlineCount] = useState(() => getDriftedOnlineCount() + 5200);
  const [activeCategory, setActiveCategory] = useState<'all' | HallId>('all');
  const activeCategoryMeta =
    MOBILE_CATEGORIES.find((category) => category.id === activeCategory) ?? MOBILE_CATEGORIES[0]!;

  const games = useMemo(() => {
    if (activeCategory === 'all') return mobileGames;
    return mobileGames.filter((game) => gameHallMap.get(game.id) === activeCategory);
  }, [activeCategory]);

  return (
    <div className="min-h-[100svh] bg-[#EDF4F7] pb-[calc(env(safe-area-inset-bottom)+18px)] lg:hidden">
      <section className="sticky top-0 z-30 border-b border-[#C9D9E2] bg-white pt-[env(safe-area-inset-top)] shadow-[0_4px_14px_rgba(15,23,42,0.08)]">
        <div className="grid min-h-[50px] grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2 px-2.5">
          <Link to="/lobby" className="flex min-w-0 items-center gap-1.5" aria-label="返回大廳">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#E9F8F8] text-[16px] font-black text-[#0992A8]">
              BG
            </span>
            <span className="hidden min-w-0 truncate text-[13px] font-black leading-tight text-[#08A6B3] min-[360px]:inline">
              娛樂城
            </span>
          </Link>

          <div className="min-w-0">
            <div className="mx-auto flex w-fit max-w-full items-center gap-1 rounded-[8px] bg-[#1479A8] px-2 py-1 text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)]">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="shrink-0 text-[11px] font-bold">在線</span>
              <span className="num shrink-0 text-[12px] font-black">
                {numberFormatter.format(onlineCount)}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center justify-center gap-1">
              <span className="max-w-[74px] truncate text-[11px] font-bold text-[#344154]">
                {user?.username ?? 'guest'}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-[6px] bg-[#4B5563] px-1.5 py-0.5 text-[10px] font-black text-white">
                <Crown className="h-2.5 w-2.5" aria-hidden="true" />
                VIP1
              </span>
            </div>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#FFEEA6] text-[#6A4B00]">
              <Mail className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 items-center gap-1 rounded-[8px] border border-[#D6B75B] bg-[#FFF8DF] px-1.5 py-1 text-[#684F12]">
              <WalletCards className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="data-num max-w-[66px] truncate text-[11px] font-black">
                {formatAmount(user?.balance ?? '0')}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#D1E0E7] bg-white">
        <Link
          to="/promos"
          className="relative block min-h-[132px] overflow-hidden bg-[#1B2030] active:opacity-95"
          aria-label="查看優惠活動"
        >
          <img
            src="/banners/hero-crash-dealer.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover object-[72%_center] opacity-[0.82]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,18,34,0.92)_0%,rgba(5,18,34,0.72)_47%,rgba(5,18,34,0.12)_100%)]" />
          <div className="relative z-10 flex min-h-[132px] flex-col justify-center px-4 py-3">
            <span className="inline-flex w-fit items-center gap-1 rounded-[8px] bg-[#F7D568] px-2 py-1 text-[10px] font-black text-[#4B3600] shadow-sm">
              <Gift className="h-3.5 w-3.5" aria-hidden="true" />
              廣告 · 介紹 · 活動
            </span>
            <h1 className="mt-2 max-w-[230px] text-[26px] font-black leading-tight text-white">
              老玩家投注滿額送
            </h1>
            <p className="mt-1 max-w-[236px] text-[12px] font-semibold leading-5 text-white/78">
              熱門玩法、限時任務、會員優惠集中展示。
            </p>
          </div>
        </Link>
      </section>

      <section className="flex h-9 overflow-hidden border-b border-[#CFE0E8] bg-white">
        <div className="flex w-[58px] shrink-0 items-center justify-center gap-1 bg-[#1681B1] text-[14px] font-black text-white">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          公告
        </div>
        <div className="min-w-0 flex-1 overflow-hidden px-3">
          <div className="ticker-track h-full items-center gap-8 [--ticker-duration:30s]">
            {[...['系統維護升級公告', '新遊戲 JetX3 震撼上架', '每週倍率王活動開跑', '理性遊戲，量力而為'], ...['系統維護升級公告', '新遊戲 JetX3 震撼上架', '每週倍率王活動開跑', '理性遊戲，量力而為']].map((msg, idx) => (
              <span key={`${msg}-${idx}`} className="inline-flex text-[13px] font-bold text-[#22718A]">
                {msg}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[66px_minmax(0,1fr)] gap-2 px-2 py-2">
        <aside className="sticky top-[calc(env(safe-area-inset-top)+58px)] self-start space-y-1.5">
          {MOBILE_CATEGORIES.map((category) => {
            const Icon = category.iconKey ? getHallIcon(category.iconKey) : Sparkles;
            const selected = activeCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(category.id)}
                className={`flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-[10px] border text-[12px] font-black shadow-[0_6px_14px_rgba(15,23,42,0.08)] transition active:scale-[0.98] ${
                  selected
                    ? 'border-[#0F76A3] bg-[linear-gradient(180deg,#22AADA_0%,#1576A2_100%)] text-white'
                    : 'border-[#D8E7EE] bg-white text-[#1D6B83]'
                }`}
                aria-pressed={selected}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" strokeWidth={2} />
                <span className="leading-none">{category.shortLabel}</span>
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
            className="flex h-[68px] w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-[#D5B75E] bg-[#FFF1B4] text-[12px] font-black text-[#765709] shadow-[0_6px_14px_rgba(15,23,42,0.08)] active:scale-[0.98]"
          >
            <Gift className="h-5 w-5" aria-hidden="true" />
            優惠
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
              LIVE
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
  const GameIcon = getGameIcon(game.id);
  const cover = `/games/${game.id}.jpg`;
  const hall = gameHallMap.get(game.id);
  const hallLabel = hall ? MOBILE_HALL_LABEL[hall] : '熱門';

  return (
    <Link
      to={mobileGamePath(game.id)}
      className="group relative min-h-[116px] overflow-hidden rounded-[13px] border border-[#D6E5EC] bg-[#F7FCFE] shadow-[0_6px_14px_rgba(15,23,42,0.08)] active:scale-[0.99]"
    >
      <img
        src={cover}
        alt={mobileGameName(game)}
        className="absolute inset-0 h-full w-full object-cover object-center opacity-[0.84] transition duration-300 group-active:scale-[1.03]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.76)_42%,rgba(255,255,255,0.2)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-[linear-gradient(0deg,rgba(4,28,42,0.46),transparent)]" />
      <div className="relative z-10 flex h-full min-h-[116px] flex-col justify-between p-2.5">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-black leading-tight text-[#17343F]">
            {mobileGameName(game)}
          </h3>
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
