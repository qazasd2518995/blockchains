import { GameId, type GameIdType } from '@bg/shared';

export type BaccaratVariantId = 'royal' | 'nova' | 'imperial';

export interface BaccaratVariantConfig {
  id: BaccaratVariantId;
  gameId: GameIdType;
  provider: string;
  skin: string;
  title: string;
  englishTitle: string;
  loadingTitle: string;
  eyebrow: string;
  description: string;
  cover: string;
  background: string;
  backgroundPosition: string;
  screenBg: string;
  overlayClassName: string;
  badgeClassName: string;
  spinnerClassName: string;
  panelClassName: string;
  actionClassName: string;
}

export const BACCARAT_VARIANTS: Record<BaccaratVariantId, BaccaratVariantConfig> = {
  royal: {
    id: 'royal',
    gameId: GameId.BACCARAT,
    provider: 'Royal Crown Studios',
    skin: 'royal',
    title: '皇家百家',
    englishTitle: 'Royal Baccarat',
    loadingTitle: '進入皇家百家中',
    eyebrow: 'Royal Crown Studios',
    description: '正在連接皇家真人百家樂大廳，將直接切換到全螢幕遊戲畫面。',
    cover: '/game-art/baccarat/cover.png',
    background: '/game-art/baccarat/background.png',
    backgroundPosition: '62% center',
    screenBg: '#060B14',
    overlayClassName:
      'bg-[linear-gradient(90deg,rgba(3,8,18,0.94)_0%,rgba(3,8,18,0.74)_44%,rgba(3,8,18,0.28)_100%)]',
    badgeClassName: 'border-[#E8D48A]/35 bg-[#E8D48A]/12 text-[#E8D48A]',
    spinnerClassName: 'text-[#E8D48A]',
    panelClassName: 'border-white/12 bg-white/[0.08]',
    actionClassName: 'border-white/14 bg-black/25 text-white/82 hover:border-white/28 hover:bg-black/35 hover:text-white',
  },
  nova: {
    id: 'nova',
    gameId: GameId.BACCARAT_NOVA,
    provider: 'Nova Live',
    skin: 'nova',
    title: '星耀百家',
    englishTitle: 'Nova Baccarat',
    loadingTitle: '進入星耀百家中',
    eyebrow: 'Nova Live',
    description: '正在連接星耀影棚牌桌，將直接切換到全螢幕遊戲畫面。',
    cover: '/games/baccarat.jpg',
    background: '/games/baccarat.jpg',
    backgroundPosition: 'center center',
    screenBg: '#05131B',
    overlayClassName:
      'bg-[linear-gradient(90deg,rgba(2,8,16,0.96)_0%,rgba(7,22,32,0.74)_48%,rgba(36,12,70,0.30)_100%)]',
    badgeClassName: 'border-[#67E8F9]/35 bg-[#083344]/55 text-[#A5F3FC]',
    spinnerClassName: 'text-[#67E8F9]',
    panelClassName: 'border-cyan-200/14 bg-cyan-50/[0.08]',
    actionClassName:
      'border-cyan-100/16 bg-[#052E3B]/40 text-cyan-50/86 hover:border-cyan-100/32 hover:bg-[#064253]/52 hover:text-white',
  },
  imperial: {
    id: 'imperial',
    gameId: GameId.BACCARAT_IMPERIAL,
    provider: 'Imperial Dragon',
    skin: 'imperial',
    title: '御龍百家',
    englishTitle: 'Imperial Baccarat',
    loadingTitle: '進入御龍百家中',
    eyebrow: 'Imperial Dragon',
    description: '正在連接御龍紅金牌桌，將直接切換到全螢幕遊戲畫面。',
    cover: '/game-art/baccarat/background.png',
    background: '/game-art/baccarat/background.png',
    backgroundPosition: 'center center',
    screenBg: '#120707',
    overlayClassName:
      'bg-[linear-gradient(90deg,rgba(19,5,6,0.96)_0%,rgba(33,10,10,0.76)_45%,rgba(105,35,12,0.28)_100%)]',
    badgeClassName: 'border-[#F8C66A]/38 bg-[#7F1D1D]/35 text-[#FDE68A]',
    spinnerClassName: 'text-[#F8C66A]',
    panelClassName: 'border-amber-200/14 bg-red-950/[0.18]',
    actionClassName:
      'border-amber-100/16 bg-[#2A0808]/42 text-amber-50/86 hover:border-amber-100/34 hover:bg-[#3A0D0D]/55 hover:text-white',
  },
};

export function getBaccaratVariant(id: BaccaratVariantId = 'royal'): BaccaratVariantConfig {
  return BACCARAT_VARIANTS[id] ?? BACCARAT_VARIANTS.royal;
}

