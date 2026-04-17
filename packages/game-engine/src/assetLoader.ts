import { Assets } from 'pixi.js';
import type { AssetItem } from './types.js';

export async function loadAssets(items: AssetItem[]): Promise<void> {
  for (const item of items) {
    Assets.add({ alias: item.alias, src: item.src });
  }
  await Assets.load(items.map((i) => i.alias));
}

export function unloadAssets(aliases: string[]): void {
  for (const alias of aliases) {
    Assets.unload(alias).catch(() => {
      // ignore
    });
  }
}
