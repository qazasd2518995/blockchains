import type { CrashVariant } from '@/games/crash/CrashScene';

export interface CrashGameConfig {
  gameId: string;
  breadcrumb: string;
  section: string;
  accent: 'acid' | 'ember' | 'toxic' | 'ice';
  glyph: string;
  variant?: CrashVariant;
  runningLabel?: string;
}

export const CRASH_CONFIGS: Record<string, CrashGameConfig> = {
  rocket: { gameId: 'rocket', breadcrumb: 'ROCKET_10', section: '§ GAME 10', accent: 'acid', glyph: '▲', variant: 'rocket' },
  aviator: { gameId: 'aviator', breadcrumb: 'AVIATOR_11', section: '§ GAME 11', accent: 'ember', glyph: '◣', variant: 'aviator' },
  'space-fleet': { gameId: 'space-fleet', breadcrumb: 'FLEET_12', section: '§ GAME 12', accent: 'ice', glyph: '✺', variant: 'fleet' },
  jetx: { gameId: 'jetx', breadcrumb: 'JETX_13', section: '§ GAME 13', accent: 'acid', glyph: '◢', variant: 'jet' },
  balloon: { gameId: 'balloon', breadcrumb: 'BALLOON_14', section: '§ GAME 14', accent: 'ember', glyph: '◯', variant: 'balloon' },
  jetx3: { gameId: 'jetx3', breadcrumb: 'JETX3_15', section: '§ GAME 15', accent: 'toxic', glyph: '⧨', variant: 'jet3' },
  'double-x': { gameId: 'double-x', breadcrumb: 'DOUBLEX_16', section: '§ GAME 16', accent: 'ice', glyph: '⊞', variant: 'double' },
  'plinko-x': { gameId: 'plinko-x', breadcrumb: 'PLINKOX_17', section: '§ GAME 17', accent: 'acid', glyph: '▼', variant: 'plinko', runningLabel: '弹射中' },
};
