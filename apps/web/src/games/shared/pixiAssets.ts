import { Assets, Rectangle, Sprite, Texture, type Container } from 'pixi.js';

export async function loadTextureOrNull(src: string): Promise<Texture | null> {
  try {
    return await Assets.load<Texture>(src);
  } catch {
    return null;
  }
}

export function fitSpriteCover(sprite: Sprite, width: number, height: number): void {
  const textureWidth = sprite.texture.width || width;
  const textureHeight = sprite.texture.height || height;
  const scale = Math.max(width / textureWidth, height / textureHeight);
  sprite.scale.set(scale);
  sprite.x = (width - textureWidth * scale) / 2;
  sprite.y = (height - textureHeight * scale) / 2;
}

export function addCoverSprite(
  parent: Container,
  texture: Texture | null,
  width: number,
  height: number,
  alpha = 1,
): Sprite | null {
  if (!texture) return null;
  const sprite = new Sprite(texture);
  fitSpriteCover(sprite, width, height);
  sprite.alpha = alpha;
  parent.addChild(sprite);
  return sprite;
}

export function createGridTextures(
  sheet: Texture | null,
  columns: number,
  rows: number,
  count = columns * rows,
): Texture[] {
  if (!sheet) return [];
  const cellW = sheet.width / columns;
  const cellH = sheet.height / rows;
  return Array.from({ length: count }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return new Texture({
      source: sheet.source,
      frame: new Rectangle(col * cellW, row * cellH, cellW, cellH),
    });
  });
}
