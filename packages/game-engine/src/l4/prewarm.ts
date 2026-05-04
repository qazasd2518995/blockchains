import { Application, Container, Graphics, BlurFilter } from 'pixi.js';
import { gsap } from 'gsap';

/**
 * Pixi/GSAP 預熱：
 *   - BlurFilter 首次使用會 compile GPU shader（30-100ms pause）
 *   - GSAP ticker 首次註冊有 2-3ms 初始化
 *   - 在 scene init 完就跑一個不可見的 burst，把這些成本提前到 loading 階段
 *
 * 對使用者：首局按鈕按下不再卡頓。
 */
export function prewarmShaders(app: Application): void {
  try {
    const layer = new Container();
    layer.visible = false;
    layer.alpha = 0;
    app.stage.addChild(layer);

    // 一個 blur 過的 graphic 強制 shader compile
    const g = new Graphics().circle(0, 0, 20).fill({ color: 0xffffff });
    const blur = new BlurFilter({ strength: 4, quality: 2 });
    g.filters = [blur];
    layer.addChild(g);

    // 跑一個 gsap tween 讓 GSAP 跟 Pixi ticker 綁定
    gsap.to(g, { alpha: 1, duration: 0.05, onComplete: () => {
      if (layer.parent) layer.parent.removeChild(layer);
      if (!g.destroyed) g.destroy();
      if (!layer.destroyed) layer.destroy({ children: true });
    } });
  } catch {
    // prewarm 失敗也不影響遊戲，靜默
  }
}
