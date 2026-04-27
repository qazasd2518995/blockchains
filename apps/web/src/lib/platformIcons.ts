import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpDown,
  Building2,
  Circle,
  CircleDot,
  Crosshair,
  Dice1,
  Disc3,
  Flag,
  Gem,
  Hash,
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
  classic: Crosshair,
  strategy: Gem,
  tables: CircleDot,
};

export const HERO_ICONS: Record<string, LucideIcon> = {
  welcome: Sparkles,
  crash: Rocket,
  fair: ShieldCheck,
  strategy: Gem,
};

export const GAME_ICONS: Record<string, LucideIcon> = {
  baccarat: CircleDot,
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
  tower: Building2,
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
