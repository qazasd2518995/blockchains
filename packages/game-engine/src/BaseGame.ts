import { Application, Assets, Container } from 'pixi.js';
import type { AssetItem, GameConfig, GameLifecycle, GameState } from './types.js';

export abstract class BaseGame implements GameLifecycle {
  protected app: Application | null = null;
  protected scene: Container | null = null;
  protected state: GameState = 'idle';
  private disposed = false;

  constructor(protected readonly config: GameConfig) {}

  async init(): Promise<void> {
    if (this.state !== 'idle') return;
    this.state = 'loading';

    const app = new Application();
    await app.init({
      canvas: this.config.canvas,
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor ?? 0x0b0b1a,
      backgroundAlpha: this.config.backgroundAlpha ?? 1,
      resolution: this.config.resolution ?? window.devicePixelRatio ?? 1,
      autoDensity: true,
      antialias: true,
    });
    this.app = app;

    if (this.config.assets && this.config.assets.length > 0) {
      await this.loadAssets(this.config.assets);
    }

    this.scene = new Container();
    app.stage.addChild(this.scene);

    await this.onInit();
    this.state = 'ready';
  }

  protected async loadAssets(assets: AssetItem[]): Promise<void> {
    for (const asset of assets) {
      Assets.add({ alias: asset.alias, src: asset.src });
    }
    await Assets.load(assets.map((a) => a.alias));
  }

  start(): void {
    if (this.state !== 'ready') return;
    this.state = 'playing';
    this.onStart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.state = 'disposed';
    this.onDispose();
    this.app?.destroy(true, { children: true, texture: false });
    this.app = null;
    this.scene = null;
  }

  getState(): GameState {
    return this.state;
  }

  protected abstract onInit(): Promise<void>;
  protected abstract onStart(): void;
  protected abstract onDispose(): void;
}
