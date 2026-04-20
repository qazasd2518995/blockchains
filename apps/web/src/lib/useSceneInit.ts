import { useEffect, useRef, useState, type MutableRefObject } from 'react';

/**
 * 通用 Pixi scene 初始化 hook：
 *   - 等 canvas layout 穩定（clientWidth/Height > 0）再 init
 *   - 用 rAF 等待、cancelled flag 避免 StrictMode 雙次呼叫衝突
 *   - 提供 sceneRef 與 sceneReady 兩個 state
 *
 * createScene: 每次 init 呼叫，回傳一個具 init/dispose 方法的 scene 物件
 * initScene: 使用 canvas + size 初始化 scene（因為不同 scene 簽章不一）
 */
export function useSceneInit<S extends { dispose: () => void }>(
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  factory: () => S,
  initializer: (scene: S, canvas: HTMLCanvasElement, w: number, h: number) => Promise<void>,
  deps: React.DependencyList = [],
): { sceneRef: MutableRefObject<S | null>; sceneReady: boolean } {
  const sceneRef = useRef<S | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: S | null = null;
    let rafId = 0;

    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = factory();
      sceneRef.current = scene;
      void initializer(scene, canvas, w, h).then(() => {
        if (!cancelled) setSceneReady(true);
      });
    };
    tryInit();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
      setSceneReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { sceneRef, sceneReady };
}
