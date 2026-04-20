import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GAMES_REGISTRY, type GameMetadata, type GameIdType } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
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

  // B：進大廳立刻 ping server 叫醒 Render（若冷啟動就用這 2-10s 讓它 warm，玩家還在挑遊戲）
  useEffect(() => {
    void api.get('/health').catch(() => undefined);
  }, []);
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
          <div className="mt-1 big-num big-num-grad text-4xl">
            {formatAmount(user?.balance ?? '0')}
          </div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.lobby.activeGames}</div>
          <div className="mt-1 big-num text-4xl text-ink-900">
            {games.filter((g) => g.enabled).length}
            <span className="text-ink-400 text-xl"> / {games.length}</span>
          </div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.lobby.avgRtp}</div>
          <div className="mt-1 big-num text-4xl text-ink-900">
            {((games.reduce((s, g) => s + g.rtp, 0) / games.length) * 100).toFixed(1)}%
          </div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.lobby.systemStatus}</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="status-dot status-dot-live" />
            <span className="big-num big-num-win text-4xl">{t.common.live.toUpperCase()}</span>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between border-b border-ink-200 pb-6">
          <div>
            <div className="label">§ {t.lobby.terminal}</div>
            <h1 className="mt-2 font-serif text-5xl font-black italic text-ink-900">
              {t.lobby.pickYour}{' '}
              <span className="text-neon-acid not-italic">{t.lobby.poison}</span>
            </h1>
          </div>
          <div className="hidden text-right md:block">
            <div className="label">{t.lobby.lastSync}</div>
            <div className="mt-1 data-num text-sm text-ink-700">
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
              <div className="flex-1 border-b border-ink-200 pb-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-3xl tracking-wider text-ink-900">
                    {meta.label}
                  </h2>
                  <span className="data-num text-[12px] text-ink-500">
                    {items.length.toString().padStart(2, '0')} {t.lobby.games}
                  </span>
                </div>
                <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-600">
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
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        disabled
          ? 'cursor-not-allowed border-ink-200 bg-ink-100/40 opacity-60'
          : 'cursor-pointer border-ink-200 bg-white/80 backdrop-blur hover:-translate-y-1 hover:border-neon-acid/50 hover:shadow-lift'
      }`}
    >
      {/* Gradient accent bar on top */}
      {!disabled && (
        <div className="absolute inset-x-0 top-0 h-1 bg-grad-primary opacity-70" />
      )}

      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="data-num text-[9px] tracking-[0.25em] text-ink-500">
          #{game.id.toUpperCase().slice(0, 6)}
        </span>
        <span className={`tag text-[8px] ${disabled ? '' : 'tag-toxic'}`}>
          {disabled ? t.lobby.soon : t.lobby.live}
        </span>
      </div>

      <div className="relative flex aspect-square items-center justify-center overflow-hidden">
        {/* 卡片內部 radial gradient 光暈 */}
        {!disabled && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(91,77,248,0.08),transparent_70%)] transition-opacity duration-500 group-hover:opacity-0" />
        )}
        {!disabled && (
          <div className="absolute inset-0 opacity-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(91,77,248,0.2),transparent_70%)] transition-opacity duration-500 group-hover:opacity-100" />
        )}
        <div
          className={`relative font-display text-[110px] leading-none transition-all duration-500 ${
            disabled
              ? 'text-ink-300'
              : 'text-ink-900 group-hover:scale-110 group-hover:drop-shadow-[0_8px_24px_rgba(91,77,248,0.5)]'
          }`}
          style={{ fontFamily: "'Orbitron', 'Chakra Petch', sans-serif" }}
        >
          {glyph}
        </div>
      </div>

      <div className="border-t border-ink-200/70 bg-ink-100/40 px-3.5 pb-3 pt-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-display text-xl tracking-wide text-ink-900">
              {game.name.toUpperCase()}
            </div>
            <div className="text-[10px] text-ink-500">{meta?.nameZh ?? game.nameZh}</div>
          </div>
          <div className="tag tag-gold text-[9px] font-bold">
            {(game.rtp * 100).toFixed(0)}%
          </div>
        </div>
        {!disabled && (
          <div className="mt-3 flex items-center justify-between border-t border-ink-200 pt-2 text-[10px] font-semibold tracking-[0.2em] text-ink-500 transition group-hover:text-neon-acid">
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
