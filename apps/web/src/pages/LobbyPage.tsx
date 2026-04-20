import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GAMES_REGISTRY, type GameMetadata, type GameIdType } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const GLYPHS: Record<string, string> = {
  dice: '⚅',
  mines: '♦',
  hilo: '♠',
  keno: '✦',
  wheel: '❂',
  'mini-roulette': '◉',
  plinko: '♣',
  hotline: '❖',
  tower: '♜',
  rocket: '✧',
  aviator: '✈',
  'space-fleet': '✺',
  jetx: '⟢',
  balloon: '◯',
  jetx3: '⫶',
  'double-x': '✦',
  'plinko-x': '♣',
  carnival: '❦',
};

// 已生成封面圖的遊戲 ID（其餘遊戲 fallback 用 GLYPHS emoji）
const HAS_COVER = new Set<string>([
  'dice',
  'mines',
  'hilo',
  'keno',
  'wheel',
  'mini-roulette',
  'plinko',
  'hotline',
  'rocket',
  'aviator',
  'space-fleet',
  'balloon',
  'jetx3',
  'double-x',
  'plinko-x',
]);

type TabKey = 'all' | 'popular' | 'new' | 'favorites';
type CatKey = 'all' | 'single-step' | 'multi-step' | 'realtime-crash';

const NEW_GAMES = new Set(['carnival', 'plinko-x', 'jetx3', 'double-x']);
const FAV_KEY = 'bg:favorites:v1';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}
function saveFavorites(s: Set<string>) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

const LIVE_WINS = [
  { player: '0x7a3f…92ef', game: 'AVIATOR', multi: '2.31×', win: '+18,420' },
  { player: 'MrRonaldo',   game: 'MINES',   multi: '14.22×', win: '+142,200' },
  { player: '0x9e4d…3210', game: 'JETX',    multi: '3.40×', win: '+6,800' },
  { player: 'LuckyStar',   game: 'DICE',    multi: '1.98×', win: '+980' },
  { player: '0x1a8c…f00a', game: 'PLINKO',  multi: '8.50×', win: '+42,500' },
  { player: 'HighRoller',  game: 'ROCKET',  multi: '16.07×', win: '+80,350' },
  { player: '0xb18c…5d01', game: 'HOTLINE', multi: '1000×', win: '+500,000' },
  { player: 'AceOfSpades', game: 'TOWER',   multi: '5.40×', win: '+16,200' },
];

const PROVIDERS = ['STAKE', 'EVOLUTION', 'PRAGMATIC', 'HACKSAW', 'NOLIMIT', 'SMARTSOFT'];

export function LobbyPage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const urlTab = (params.get('tab') as TabKey | null) ?? 'all';
  const urlCat = (params.get('cat') as CatKey | null) ?? 'all';

  const [tab, setTab] = useState<TabKey>(urlTab);
  const [cat, setCat] = useState<CatKey>(urlCat);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'default' | 'rtp' | 'name'>('default');
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => setTab(urlTab), [urlTab]);
  useEffect(() => setCat(urlCat), [urlCat]);

  // warm server
  useEffect(() => {
    void api.get('/health').catch(() => undefined);
  }, []);

  // hero auto-rotate
  useEffect(() => {
    const id = setInterval(() => setHeroIndex((i) => (i + 1) % 3), 6000);
    return () => clearInterval(id);
  }, []);

  const toggleFavorite = (gameId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      saveFavorites(next);
      return next;
    });
  };

  const allGames = Object.values(GAMES_REGISTRY);

  const filtered = useMemo(() => {
    let list = [...allGames];
    if (cat !== 'all') list = list.filter((g) => g.category === cat);
    if (tab === 'popular') list = list.filter((g) => g.rtp >= 0.98);
    if (tab === 'new') list = list.filter((g) => NEW_GAMES.has(g.id));
    if (tab === 'favorites') list = list.filter((g) => favorites.has(g.id));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (g) => g.id.includes(q) || g.name.toLowerCase().includes(q) || g.nameZh.includes(q),
      );
    }
    if (sort === 'rtp') list.sort((a, b) => b.rtp - a.rtp);
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [allGames, cat, tab, query, sort, favorites]);

  const heroSlides = [
    {
      eyebrow: t.lobby.heroWelcomeEyebrow,
      title: t.lobby.heroWelcomeTitle,
      desc: t.lobby.heroWelcomeDesc,
      cta: t.lobby.heroWelcomeCta,
      to: '/profile',
      bg: 'linear-gradient(135deg, #14563E 0%, #0C4632 55%, #073026 100%)',
      ornament: '♦',
      accent: 'brass',
    },
    {
      eyebrow: t.lobby.heroFairEyebrow,
      title: t.lobby.heroFairTitle,
      desc: t.lobby.heroFairDesc,
      cta: t.lobby.heroFairCta,
      to: '/profile',
      bg: 'linear-gradient(135deg, #8B1A2A 0%, #6B0F1A 55%, #40080F 100%)',
      ornament: '♠',
      accent: 'ivory',
    },
    {
      eyebrow: t.lobby.heroJackpotEyebrow,
      title: t.lobby.heroJackpotTitle,
      desc: t.lobby.heroJackpotDesc,
      cta: t.lobby.heroJackpotCta,
      to: '/games/rocket',
      bg: 'linear-gradient(135deg, #1E6B4A 0%, #0C4632 50%, #8A6B2A 100%)',
      ornament: '✦',
      accent: 'brass',
    },
  ];
  const hero = heroSlides[heroIndex]!;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      {/* ======= main ======= */}
      <div className="min-w-0 space-y-8">
        {/* HERO CAROUSEL */}
        <section className="relative overflow-hidden rounded-sm border-2 border-brass-500 shadow-[0_0_0_1px_#8A6B2A,0_14px_30px_-10px_rgba(10,8,6,0.28)]">
          <div
            className="relative flex h-[240px] items-stretch md:h-[280px]"
            style={{ background: hero.bg }}
          >
            {/* ornamental number */}
            <div className="pointer-events-none absolute -right-6 top-0 font-serif text-[300px] leading-none text-brass-400/15 md:text-[420px]">
              {hero.ornament}
            </div>
            <div className="relative z-10 flex flex-1 flex-col justify-center p-8 md:p-12">
              <div className="flex items-center gap-2">
                <span className="font-script text-base text-brass-300">{hero.eyebrow}</span>
                <span className="text-brass-400 text-xs">◆</span>
              </div>
              <h2 className="mt-2 font-serif text-4xl italic text-ivory-100 md:text-6xl">
                {hero.title}
              </h2>
              <p className="mt-3 max-w-md text-[13px] text-ivory-100/85 md:text-[15px]">
                {hero.desc}
              </p>
              <div className="mt-6">
                <Link to={hero.to} className="btn-brass">
                  → {hero.cta}
                </Link>
              </div>
            </div>

            {/* mini balance card (right side) */}
            <div className="relative z-10 hidden w-[260px] border-l border-brass-500/40 bg-felt-900/40 p-6 backdrop-blur-sm md:flex md:flex-col md:justify-center">
              <div className="label text-brass-300">{t.common.credits}</div>
              <div className="mt-2 big-num big-num-brass text-4xl">
                {formatAmount(user?.balance ?? '0')}
              </div>
              <div className="mt-6 divider-suit opacity-70"><span>♠◆♥</span></div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-ivory-100/80">
                <span className="font-script text-base text-brass-300">Salon Status</span>
                <span className="flex items-center text-win">
                  <span className="status-dot status-dot-live" />
                  {t.common.live}
                </span>
              </div>
            </div>
          </div>
          {/* dots */}
          <div className="absolute bottom-4 left-8 z-10 flex gap-2 md:left-12">
            {heroSlides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setHeroIndex(i)}
                aria-label={`slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === heroIndex ? 'w-10 bg-brass-400' : 'w-4 bg-brass-300/35 hover:bg-brass-300/60'
                }`}
              />
            ))}
          </div>
        </section>

        {/* FILTER BAR */}
        <section className="panel-salon-soft sticky top-[73px] z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TabBtn active={tab === 'all'} onClick={() => setTab('all')} icon="◆" label={t.lobby.filterAll} />
            <TabBtn active={tab === 'popular'} onClick={() => setTab('popular')} icon="🔥" label={t.lobby.filterPopular} />
            <TabBtn active={tab === 'new'} onClick={() => setTab('new')} icon="✨" label={t.lobby.filterNew} />
            <TabBtn active={tab === 'favorites'} onClick={() => setTab('favorites')} icon="★" label={t.lobby.filterFavorites} />
            <span className="mx-2 h-6 w-px bg-brass-500/40" />
            <CatPill active={cat === 'all'} onClick={() => setCat('all')} label={t.lobby.allGames} suit="◆" />
            <CatPill active={cat === 'single-step'} onClick={() => setCat('single-step')} label={t.lobby.classic} suit="♠" />
            <CatPill active={cat === 'multi-step'} onClick={() => setCat('multi-step')} label={t.lobby.strategy} suit="♣" />
            <CatPill active={cat === 'realtime-crash'} onClick={() => setCat('realtime-crash')} label={t.lobby.crash} suit="♥" />
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.lobby.searchPlaceholder}
                className="w-44 rounded-sm border border-brass-500/50 bg-ivory-50 px-3 py-1.5 pl-8 font-mono text-[12px] text-ivory-950 placeholder:text-ivory-500 focus:border-brass-500 focus:shadow-[0_0_0_3px_rgba(201,162,76,0.2)] focus:outline-none"
              />
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brass-600 text-sm">
                ⌕
              </span>
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-sm border border-brass-500/50 bg-ivory-50 px-2.5 py-1.5 font-serif text-[12px] text-ivory-900 focus:border-brass-500 focus:outline-none"
            >
              <option value="default">—</option>
              <option value="rtp">{t.lobby.sortByRtp}</option>
              <option value="name">{t.lobby.sortByName}</option>
            </select>
          </div>
        </section>

        {/* GAMES GRID */}
        <section>
          <div className="mb-4 flex items-baseline justify-between px-1">
            <div>
              <span className="font-script text-xl text-brass-700">
                {tab === 'popular'
                  ? t.lobby.popular
                  : tab === 'new'
                    ? t.lobby.newGames
                    : tab === 'favorites'
                      ? t.lobby.favorites
                      : t.lobby.allGames}
              </span>
              <span className="ml-3 font-mono text-[12px] text-ivory-600">
                {filtered.length} {t.lobby.games}
              </span>
            </div>
            <div className="font-script text-sm text-ivory-600">· all tables ·</div>
          </div>

          {filtered.length === 0 ? (
            <div className="panel-salon-soft flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="font-serif text-5xl italic text-ivory-400">—</span>
              <div className="font-script text-lg text-ivory-700">No tables match.</div>
              <button
                type="button"
                onClick={() => {
                  setTab('all');
                  setCat('all');
                  setQuery('');
                }}
                className="btn-ghost text-[11px]"
              >
                ↻ RESET
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filtered.map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  isFavorite={favorites.has(g.id)}
                  onToggleFav={() => toggleFavorite(g.id)}
                  isNew={NEW_GAMES.has(g.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* PROVIDERS STRIP */}
        <section className="panel-salon-soft px-6 py-5">
          <div className="flex items-baseline gap-3">
            <span className="font-script text-base text-brass-700">{t.lobby.providersTitle}</span>
            <span className="text-brass-500 text-xs">◆</span>
            <span className="label label-brass">{t.lobby.providersSub}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 md:grid-cols-6">
            {PROVIDERS.map((p) => (
              <div
                key={p}
                className="group flex items-center justify-center rounded-sm border border-brass-500/30 bg-ivory-50 px-3 py-4 font-serif text-sm tracking-[0.24em] text-ivory-700 transition hover:border-brass-500 hover:bg-ivory-100 hover:text-brass-700"
              >
                {p}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ======= right aside (xl+) ======= */}
      <aside className="hidden space-y-5 xl:block">
        <div className="panel-felt sticky top-[90px] scanlines p-5">
          <div className="flex items-center justify-between border-b border-brass-500/40 pb-3">
            <div className="flex items-baseline gap-2">
              <span className="font-script text-lg text-brass-300">À la Table</span>
              <span className="text-brass-500 text-xs">◆</span>
            </div>
            <div className="seal seal-live seal-breath !h-8 !w-8 !text-[8px]">LIVE</div>
          </div>
          <div className="mt-4">
            <div className="font-serif text-xl text-ivory-100">{t.lobby.liveWinnersTitle}</div>
            <div className="mt-1 font-script text-sm text-brass-300">{t.lobby.liveWinnersSub}</div>
          </div>
          <ul className="mt-4 space-y-3 text-[12px]">
            {LIVE_WINS.map((w, i) => (
              <li
                key={i}
                className="flex items-center justify-between border-b border-brass-500/20 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-ivory-100">{w.player}</div>
                  <div className="mt-0.5 font-script text-[12px] text-brass-300">
                    {w.game}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="data-num text-base text-brass-200">{w.multi}</div>
                  <div className="data-num text-[11px] text-win">{w.win}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-serif text-[12px] tracking-[0.08em] transition ${
        active
          ? 'border border-brass-500 bg-gradient-to-b from-brass-200 to-brass-400 text-ivory-950 shadow-[inset_0_1px_0_0_rgba(255,253,248,0.4)]'
          : 'border border-transparent text-ivory-800 hover:bg-brass-50'
      }`}
    >
      <span className="text-sm">{icon}</span>
      <span className="uppercase">{label}</span>
    </button>
  );
}

function CatPill({
  active,
  onClick,
  label,
  suit,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  suit: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-serif text-[12px] transition ${
        active
          ? 'border border-brass-500 bg-felt-600 text-brass-200'
          : 'border border-brass-500/40 text-ivory-800 hover:bg-brass-50'
      }`}
    >
      <span className="text-sm">{suit}</span>
      <span>{label}</span>
    </button>
  );
}

function GameCard({
  game,
  isFavorite,
  onToggleFav,
  isNew,
}: {
  game: GameMetadata;
  isFavorite: boolean;
  onToggleFav: () => void;
  isNew: boolean;
}) {
  const { t } = useTranslation();
  const glyph = GLYPHS[game.id] ?? '◆';
  const disabled = !game.enabled;
  const meta = t.gameMeta[game.id as GameIdType];
  const isVip = game.rtp >= 0.99;

  const content = (
    <div
      className={`group relative overflow-hidden rounded-sm transition-all duration-300 ${
        disabled
          ? 'border border-brass-500/30 bg-ivory-200/40 opacity-55'
          : 'border-2 border-brass-500/70 bg-gradient-to-br from-felt-600 via-felt-700 to-felt-800 hover:-translate-y-0.5 hover:border-brass-400 hover:shadow-[0_0_0_1px_#8A6B2A,0_14px_26px_-8px_rgba(10,8,6,0.35),0_0_30px_-6px_rgba(224,191,110,0.35)]'
      }`}
    >
      {/* corner seals */}
      <div className="absolute left-2 top-2 z-10 flex gap-1">
        {isVip && !disabled && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-brass-400/60 bg-wine-500/80 px-1.5 py-0.5 font-serif text-[9px] tracking-[0.12em] text-brass-200 backdrop-blur">
            VIP
          </span>
        )}
        {isNew && !disabled && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-brass-400/60 bg-felt-500/80 px-1.5 py-0.5 font-serif text-[9px] tracking-[0.12em] text-ivory-100 backdrop-blur">
            NEW
          </span>
        )}
      </div>

      {/* favorite star */}
      {!disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFav();
          }}
          className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-brass-400/60 bg-felt-900/60 text-base transition ${
            isFavorite ? 'text-brass-300' : 'text-ivory-300/60 hover:text-brass-300'
          }`}
          aria-label="favorite"
        >
          ★
        </button>
      )}

      {disabled && (
        <div className="absolute right-2 top-2 z-10">
          <span className="tag text-[9px]">{t.lobby.soon}</span>
        </div>
      )}

      {/* central art */}
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden">
        {HAS_COVER.has(game.id) ? (
          <>
            <img
              src={`/games/${game.id}.jpg`}
              alt={meta?.nameZh ?? game.nameZh}
              loading="lazy"
              className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
                disabled ? 'grayscale' : 'group-hover:scale-[1.04]'
              }`}
            />
            {!disabled && (
              <div className="absolute inset-0 bg-gradient-to-t from-felt-900/75 via-transparent to-transparent" />
            )}
            {!disabled && (
              <div className="absolute inset-0 opacity-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,rgba(224,191,110,0.35),transparent_65%)] transition-opacity duration-500 group-hover:opacity-100" />
            )}
          </>
        ) : (
          <>
            {!disabled && (
              <>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,rgba(224,191,110,0.28),transparent_65%)]" />
                <div className="absolute inset-0 opacity-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,rgba(224,191,110,0.55),transparent_70%)] transition-opacity duration-500 group-hover:opacity-100" />
              </>
            )}
            <div
              className={`relative font-serif leading-none transition-all duration-500 ${
                disabled
                  ? 'text-ivory-500 text-[80px]'
                  : 'text-brass-300 text-[96px] group-hover:scale-110 group-hover:text-brass-200 drop-shadow-[0_6px_14px_rgba(10,8,6,0.45)]'
              }`}
            >
              {glyph}
            </div>
          </>
        )}
      </div>

      {/* caption */}
      <div
        className={`flex items-center justify-between gap-2 px-3 py-2.5 ${
          disabled ? 'border-t border-brass-500/20 bg-ivory-200/40' : 'border-t border-brass-500/35 bg-felt-900/60'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-serif text-[14px] leading-tight ${
              disabled ? 'text-ivory-700' : 'text-ivory-100'
            }`}
          >
            {meta?.nameZh ?? game.nameZh}
          </div>
          <div
            className={`mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.18em] ${
              disabled ? 'text-ivory-500' : 'text-brass-300/80'
            }`}
          >
            {game.name}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${
            disabled
              ? 'bg-ivory-300/50 text-ivory-600'
              : 'bg-brass-500/20 text-brass-200'
          }`}
        >
          {(game.rtp * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );

  if (disabled) return content;
  return <Link to={`/games/${game.id}`}>{content}</Link>;
}
