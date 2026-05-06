import { hmacFloatStream } from './hmac.js';

export type ChickenRoadDifficulty = 'easy' | 'medium' | 'hard' | 'hardcore';

export const CHICKEN_ROAD_TOTAL_STEPS = 500;
export const CHICKEN_ROAD_HOUSE_EDGE = 0.03;
export const CHICKEN_ROAD_MAX_MULTIPLIER = 50000;

export const CHICKEN_ROAD_CONFIG: Record<
  ChickenRoadDifficulty,
  { survivalRate: number; label: string }
> = {
  easy: { survivalRate: 0.92, label: '慢速車流' },
  medium: { survivalRate: 0.84, label: '普通車流' },
  hard: { survivalRate: 0.72, label: '高速車流' },
  hardcore: { survivalRate: 0.58, label: '瘋狂車流' },
};

export function chickenRoadPath(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  difficulty: ChickenRoadDifficulty,
): boolean[] {
  const config = CHICKEN_ROAD_CONFIG[difficulty];
  if (!config) throw new Error(`Unknown chicken road difficulty: ${difficulty}`);

  const floats = hmacFloatStream(serverSeed, clientSeed, nonce);
  return Array.from({ length: CHICKEN_ROAD_TOTAL_STEPS }, () => {
    const next = floats.next();
    if (next.done) throw new Error('Chicken Road HMAC stream exhausted');
    return next.value < config.survivalRate;
  });
}

export function chickenRoadMultiplier(
  difficulty: ChickenRoadDifficulty,
  currentStep: number,
): number {
  if (currentStep <= 0) return 1;
  if (currentStep > CHICKEN_ROAD_TOTAL_STEPS) {
    throw new Error(`Step ${currentStep} exceeds total steps ${CHICKEN_ROAD_TOTAL_STEPS}`);
  }

  const config = CHICKEN_ROAD_CONFIG[difficulty];
  if (!config) throw new Error(`Unknown chicken road difficulty: ${difficulty}`);
  const fair = Math.pow(1 / config.survivalRate, currentStep);
  const multiplier = Math.min(CHICKEN_ROAD_MAX_MULTIPLIER, fair * (1 - CHICKEN_ROAD_HOUSE_EDGE));
  return Math.floor(multiplier * 10000) / 10000;
}

export function chickenRoadNextMultiplier(
  difficulty: ChickenRoadDifficulty,
  currentStep: number,
): number | null {
  if (currentStep >= CHICKEN_ROAD_TOTAL_STEPS) return null;
  return chickenRoadMultiplier(difficulty, currentStep + 1);
}
