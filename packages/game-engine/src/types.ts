export type GameState = 'idle' | 'loading' | 'ready' | 'playing' | 'resolving' | 'disposed';

export interface AssetItem {
  alias: string;
  src: string;
}

export interface GameConfig {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  assets?: AssetItem[];
  backgroundColor?: number;
  backgroundAlpha?: number;
  resolution?: number;
}

export interface GameLifecycle {
  init(): Promise<void>;
  start(): void;
  dispose(): void;
}

export interface SingleStepGame<TBet, TResult> extends GameLifecycle {
  placeBet(bet: TBet): Promise<TResult>;
  playResult(result: TResult): Promise<void>;
}

export interface MultiStepGame<TBet, TAction, TResult> extends GameLifecycle {
  startRound(bet: TBet): Promise<void>;
  performAction(action: TAction): Promise<void>;
  cashOut(): Promise<TResult>;
}

export interface RealtimeGame<TBet, TResult> extends GameLifecycle {
  joinRoom(): Promise<void>;
  placeBet(bet: TBet): Promise<void>;
  cashOut(): Promise<TResult>;
  onTick(cb: (multiplier: number) => void): void;
  onCrash(cb: (finalMultiplier: number) => void): void;
}
