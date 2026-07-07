import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpDown,
  Bird,
  Building2,
  Circle,
  CircleDot,
  Crosshair,
  Dice1,
  Disc3,
  Flag,
  Gem,
  Hash,
  Landmark,
  Megaphone,
  PhoneCall,
  Plane,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  Wind,
  Zap,
} from 'lucide-react';

const FALLBACK_ICON = Sparkles;

export const HALL_ICONS: Record<string, LucideIcon> = {
  crash: Rocket,
  tables: CircleDot,
  slots: Sparkles,
  roulette: Disc3,
  classic: Crosshair,
  strategy: Gem,
};

export const HERO_ICONS: Record<string, LucideIcon> = {
  welcome: Sparkles,
  crash: Rocket,
  fair: ShieldCheck,
  strategy: Gem,
};

export const GAME_ICONS: Record<string, LucideIcon> = {
  baccarat: CircleDot,
  'baccarat-nova': CircleDot,
  'baccarat-imperial': CircleDot,
  blackjack: Landmark,
  'twenty-one-half-doll': Landmark,
  'twenty-one-half-bunny': Landmark,
  'twenty-one-half-star': Landmark,
  'tui-tongzi-dragon': Hash,
  'tui-tongzi-lion': Hash,
  'tui-tongzi-jade': Hash,
  'tui-tongzi-neon': Hash,
  'tui-tongzi-gold': Hash,
  'black-dot-tianjiu': CircleDot,
  'black-dot-royal': CircleDot,
  'black-dot-street': CircleDot,
  'black-dot-shadow': CircleDot,
  'black-dot-gold': CircleDot,
  'card-war': ArrowUpDown,
  dice: Dice1,
  mines: Gem,
  hilo: ArrowUpDown,
  keno: Hash,
  wheel: Disc3,
  'mini-roulette': CircleDot,
  plinko: Sparkles,
  hotline: PhoneCall,
  'fruit-slot': Circle,
  'fortune-slot': Gem,
  'ocean-slot': CircleDot,
  'temple-slot': Gem,
  'candy-slot': Circle,
  'sakura-slot': Sparkles,
  'thunder-slot': Zap,
  'dragon-mega-slot': Sparkles,
  'nebula-slot': Sparkles,
  'jungle-slot': Gem,
  'vampire-slot': Sparkles,
  tower: Building2,
  'chicken-road': Bird,
  rocket: Rocket,
  aviator: Plane,
  'space-fleet': Disc3,
  jetx: Wind,
  balloon: Circle,
  jetx3: Zap,
  'double-x': Sparkles,
  'plinko-x': Crosshair,
  carnival: Flag,
};

export const TICKER_ICONS = {
  announcement: Megaphone,
  live: Trophy,
};

export function getHallIcon(id: string): LucideIcon {
  return HALL_ICONS[id] ?? FALLBACK_ICON;
}

export function getHeroIcon(id: string): LucideIcon {
  return HERO_ICONS[id] ?? FALLBACK_ICON;
}

export function getGameIcon(id: string): LucideIcon {
  return GAME_ICONS[id] ?? FALLBACK_ICON;
}
