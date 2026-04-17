import { Link } from 'react-router-dom';
import { GAMES_REGISTRY, type GameMetadata, type GameIdType } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const GLYPHS: Record<string, string> = {
  dice: '⚀',
  mines: '✦',
  hilo: '♠',
  keno: '⬚',
  wheel: '◎',
  'mini-roulette': '◉',
  plinko: '▽',
  hotline: '❖',
  tower: '⌸',
  rocket: '▲',
  aviator: '◣',
  'space-fleet': '✺',
  jetx: '◢',
  balloon: '◯',
  jetx3: '⧨',
  'double-x': '⊞',
  'plinko-x': '▼',
  carnival: '✹',
};

export function LobbyPage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const games = Object.values(GAMES_REGISTRY);
  const byCategory = games.reduce<Record<string, GameMetadata[]>>((acc, g) => {
    (acc[g.category] ||= []).push(g);
    return acc;
  }, {});

  const categoryMeta = {
    'single-step': { code: 'I', label: t.lobby.classic, desc: t.lobby.classicDesc },
    'multi-step': { code: 'II', label: t.lobby.strategy, desc: t.lobby.strategyDesc },
    'realtime-crash': { code: 'III', label: t.lobby.crash, desc: t.lobby.crashDesc },
  } as const;

  return (
    <div className="space-y-12">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="crt-panel p-5">
          <div className="label">{t.common.credits}</div>
          <div className="mt-1 big-num text-4xl text-neon-acid">
            {formatAmount(user?.balance ?? '0')}
          </div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.lobby.activeGames}</div>
          <div className="mt-1 big-num text-4xl text-bone">
            {games.filter((g) => g.enabled).length}
            <span className="text-ink-600 text-xl"> / {games.length}</span>
          </div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.lobby.avgRtp}</div>
          <div className="mt-1 big-num text-4xl text-bone">
            {((games.reduce((s, g) => s + g.rtp, 0) / games.length) * 100).toFixed(1)}%
          </div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.lobby.systemStatus}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="status-dot status-dot-live" />
            <span className="big-num text-4xl text-neon-toxic">{t.common.live.toUpperCase()}</span>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between border-b border-white/10 pb-6">
          <div>
            <div className="label">§ {t.lobby.terminal}</div>
            <h1 className="mt-2 font-serif text-5xl font-black italic text-bone">
              {t.lobby.pickYour}{' '}
              <span className="text-neon-acid not-italic">{t.lobby.poison}</span>
            </h1>
          </div>
          <div className="hidden text-right md:block">
            <div className="label">{t.lobby.lastSync}</div>
            <div className="mt-1 data-num text-sm text-ink-300">
              {new Date().toLocaleTimeString('en-US', { hour12: false })}
            </div>
          </div>
        </div>
      </section>

      {Object.entries(byCategory).map(([category, items]) => {
        const meta = categoryMeta[category as keyof typeof categoryMeta] ?? {
          code: '?',
          label: category,
          desc: '',
        };
        return (
          <section key={category} className="space-y-5">
            <div className="flex items-baseline gap-5">
              <div className="font-display text-7xl leading-none text-neon-acid/40">
                {meta.code}
              </div>
              <div className="flex-1 border-b border-white/10 pb-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-3xl tracking-wider text-bone">
                    {meta.label}
                  </h2>
                  <span className="data-num text-[12px] text-ink-500">
                    {items.length.toString().padStart(2, '0')} {t.lobby.games}
                  </span>
                </div>
                <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-400">
                  {meta.desc}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {items.map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function GameCard({ game }: { game: GameMetadata }) {
  const { t } = useTranslation();
  const glyph = GLYPHS[game.id] ?? '◆';
  const disabled = !game.enabled;
  const meta = t.gameMeta[game.id as GameIdType];

  const content = (
    <div
      className={`group relative overflow-hidden border transition ${
        disabled
          ? 'cursor-not-allowed border-white/5 bg-ink-950/30'
          : 'cursor-pointer border-white/10 bg-gradient-to-b from-ink-800 to-ink-900 hover:border-neon-acid'
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="data-num text-[9px] tracking-[0.25em] text-ink-500">
          ID:{game.id.toUpperCase().slice(0, 6)}
        </span>
        <span className={`tag text-[8px] ${disabled ? '' : 'tag-acid'}`}>
          {disabled ? t.lobby.soon : t.lobby.live}
        </span>
      </div>

      <div className="relative flex aspect-square items-center justify-center">
        <div
          className={`font-display text-[100px] leading-none transition-all duration-500 ${
            disabled
              ? 'text-ink-700'
              : 'text-bone group-hover:text-neon-acid group-hover:drop-shadow-[0_0_20px_rgba(212,255,58,0.6)]'
          }`}
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          {glyph}
        </div>
        {!disabled && (
          <div className="absolute inset-0 bg-gradient-to-t from-neon-acid/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      <div className="border-t border-white/5 px-3 pb-3 pt-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-display text-xl tracking-wider text-bone">
              {game.name.toUpperCase()}
            </div>
            <div className="text-[10px] text-ink-500">{meta?.nameZh ?? game.nameZh}</div>
          </div>
          <div className="data-num text-[10px] text-neon-acid">
            {(game.rtp * 100).toFixed(0)}%
          </div>
        </div>
        {!disabled && (
          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[10px] tracking-[0.2em] text-ink-400 transition group-hover:text-neon-acid">
            <span>{t.lobby.enter}</span>
            <span className="transition group-hover:translate-x-1">→</span>
          </div>
        )}
      </div>
    </div>
  );

  if (disabled) return content;
  return <Link to={`/games/${game.id}`}>{content}</Link>;
}
