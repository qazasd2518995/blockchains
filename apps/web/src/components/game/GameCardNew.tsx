import { Link } from 'react-router-dom';
import type { GameMetadata } from '@bg/shared';
import { warmGameAssets } from '@/lib/gameAssetManifest';
import { getLobbyGameCover } from '@/lib/gameCoverAssets';
import { ResponsiveImage } from '@/lib/optimizedImages';
import { getGameIcon } from '@/lib/platformIcons';
import { getLocalizedGameTitle } from '@/i18n/gameLabels';
import { useTranslation } from '@/i18n/useTranslation';
import { getGamePromoMultiplierLabel, isGamePromoHot } from '@/lib/gamePromos';

// 與 LobbyPage 現有的資料一致
const HAS_COVER = new Set<string>([
  'baccarat',
  'baccarat-nova',
  'baccarat-imperial',
  'blackjack',
  'dice',
  'mines',
  'hilo',
  'keno',
  'wheel',
  'mini-roulette',
  'plinko',
  'hotline',
  'fruit-slot',
  'fortune-slot',
  'ocean-slot',
  'temple-slot',
  'candy-slot',
  'sakura-slot',
  'rocket',
  'aviator',
  'space-fleet',
  'thunder-slot',
  'dragon-mega-slot',
  'nebula-slot',
  'jungle-slot',
  'vampire-slot',
  'jetx',
  'balloon',
  'jetx3',
  'double-x',
  'plinko-x',
  'tower',
  'chicken-road',
  'carnival',
]);

function gamePath(id: string): string {
  return `/games/${id}`;
}

interface GameCardNewProps {
  game: GameMetadata;
  returnTo?: string;
  returnLabel?: string;
}

export function GameCardNew({ game, returnTo, returnLabel }: GameCardNewProps) {
  const { locale, t } = useTranslation();
  const cover = HAS_COVER.has(game.id) ? getLobbyGameCover(game.id) : null;
  const GameIcon = getGameIcon(game.id);
  const isHot = isGamePromoHot(game.id);
  const multiplierLabel = getGamePromoMultiplierLabel(game.id);
  const routeState = returnTo ? { returnTo, returnLabel } : undefined;
  const warmAssets = () => warmGameAssets(game.id);
  const title = getLocalizedGameTitle(game.id, locale, game.nameZh);

  return (
    <Link
      to={gamePath(game.id)}
      state={routeState}
      onFocus={warmAssets}
      onPointerDown={warmAssets}
      onPointerEnter={warmAssets}
      className="group relative flex flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#EA580C] hover:shadow-[0_8px_20px_rgba(234,88,12,0.18)]"
    >
      {isHot && (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-[#EC0E69] px-2 py-1 text-[10px] font-black uppercase text-white shadow-[0_3px_8px_rgba(236,14,105,0.35)]">
          熱門
        </span>
      )}

      {/* 封面 */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-[#EA580C] to-[#9A3412]">
        <span
          className="absolute right-1.5 top-1.5 z-10 inline-flex min-w-[52px] max-w-[82px] flex-col items-center rounded-[6px] bg-[linear-gradient(180deg,#FFE27A_0%,#F59E0B_100%)] px-1.5 py-1 text-center text-[#4B2600] shadow-[0_3px_8px_rgba(0,0,0,0.28)]"
          aria-label={`最高爆分 ${multiplierLabel}`}
        >
          <strong className="num max-w-full truncate text-[10px] font-black leading-none">
            {multiplierLabel}
          </strong>
          <small className="mt-0.5 text-[8px] font-black leading-none tracking-[0.08em]">
            最高爆分
          </small>
        </span>
        {cover ? (
          <ResponsiveImage
            src={cover}
            alt={title}
            preset="lobby-card"
            sizes="(min-width: 1280px) 190px, (min-width: 768px) 22vw, 46vw"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-white/[0.1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <GameIcon className="h-12 w-12 text-white" aria-hidden="true" strokeWidth={1.6} />
            </div>
          </div>
        )}
        {/* Hover 覆蓋 */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#EA580C]/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="rounded-[6px] border-2 border-white bg-transparent px-4 py-1.5 text-[13px] font-semibold text-white">
            {t.bet.start}
          </span>
        </div>
      </div>

      {/* 資訊 */}
      <div className="flex flex-col gap-1 p-3">
        <div className="text-[14px] font-semibold text-[#0F172A]">{title}</div>
        <div className="text-[11px] text-[#9CA3AF]">{game.name}</div>
      </div>
    </Link>
  );
}
