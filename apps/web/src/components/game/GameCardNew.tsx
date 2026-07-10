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
  'baccarat-dragon',
  'baccarat-panda',
  'baccarat-fox',
  'baccarat-tiger',
  'baccarat-phoenix',
  'blackjack',
  'twenty-one-half-doll',
  'twenty-one-half-bunny',
  'twenty-one-half-star',
  'tui-tongzi-dragon',
  'tui-tongzi-lion',
  'tui-tongzi-jade',
  'tui-tongzi-neon',
  'tui-tongzi-gold',
  'black-dot-tianjiu',
  'black-dot-royal',
  'black-dot-street',
  'black-dot-shadow',
  'black-dot-gold',
  'card-war',
  'card-war-neon',
  'card-war-gold',
  'card-war-crystal',
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
const COVER_CLIP_PATH =
  'polygon(5% 0, 90% 0, 100% 7%, 100% 68%, 105% 82%, 94% 100%, 7% 100%, -4% 90%, 0 8%)';

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
      className="group relative block overflow-visible rounded-[14px] transition-all duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA580C]/45 focus-visible:ring-offset-2"
    >
      {isHot && (
        <span className="absolute left-3 top-3 z-30 rounded-full bg-[#EC0E69] px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-[0_3px_8px_rgba(236,14,105,0.35)]">
          熱門
        </span>
      )}

      <div
        className="relative aspect-[3/4] bg-gradient-to-br from-[#EA580C] to-[#9A3412] shadow-[0_14px_28px_rgba(15,23,42,0.18)] transition duration-300 [filter:drop-shadow(0_12px_18px_rgba(15,23,42,0.18))] group-hover:[filter:drop-shadow(0_18px_28px_rgba(234,88,12,0.28))]"
        style={{ clipPath: COVER_CLIP_PATH }}
      >
        <span
          className="absolute right-2 top-2 z-20 inline-flex min-w-[58px] max-w-[88px] flex-col items-center rounded-[8px] bg-[linear-gradient(180deg,#FFE27A_0%,#F59E0B_100%)] px-1.5 py-1.5 text-center text-[#4B2600] shadow-[0_3px_8px_rgba(0,0,0,0.28)]"
          aria-label={`最高爆分 ${multiplierLabel}`}
        >
          <strong className="num max-w-full truncate text-[11px] font-black leading-none">
            {multiplierLabel}
          </strong>
          <small className="mt-0.5 text-[8px] font-black leading-none">最高爆分</small>
        </span>
        {cover ? (
          <ResponsiveImage
            src={cover}
            alt={title}
            preset="lobby-card"
            sizes="(min-width: 1280px) 190px, (min-width: 768px) 22vw, 46vw"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.045]"
            loading="lazy"
            width={1086}
            height={1448}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/15 bg-white/[0.1] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <GameIcon className="h-12 w-12 text-white" aria-hidden="true" strokeWidth={1.6} />
            </div>
          </div>
        )}
        <div className="absolute inset-x-3 bottom-[7.2%] z-20 min-w-0 rounded-[10px] bg-[linear-gradient(180deg,rgba(45,20,3,0)_0%,rgba(29,10,2,0.58)_100%)] px-2 py-1.5 text-center">
          <h3 className="truncate text-[25px] font-black leading-none text-[#FFF0A6] [text-shadow:0_2px_0_#5A1F05,0_4px_0_rgba(0,0,0,0.35),0_6px_14px_rgba(0,0,0,0.95)]">
            {title}
          </h3>
          <p className="mt-1 truncate text-[11px] font-black uppercase text-white/86 [text-shadow:0_2px_7px_rgba(0,0,0,0.92)]">
            {game.name}
          </p>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/42 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="rounded-[7px] border-2 border-white bg-[#EA580C] px-4 py-1.5 text-[13px] font-black text-white shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
            {t.bet.start}
          </span>
        </div>
      </div>
    </Link>
  );
}
