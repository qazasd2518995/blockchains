import type { ImgHTMLAttributes } from 'react';

type ResponsivePreset = 'lobby-card' | 'hall-card' | 'hero' | 'game-stage';

const LOCAL_WIDTHS: Record<ResponsivePreset, number[]> = {
  'lobby-card': [480, 960],
  'hall-card': [720, 1600],
  hero: [960, 1600],
  'game-stage': [960, 1600],
};

const LOCAL_QUALITY: Record<ResponsivePreset, number> = {
  'lobby-card': 78,
  'hall-card': 80,
  hero: 82,
  'game-stage': 82,
};

const IMAGE_PROVIDER = import.meta.env.VITE_IMAGE_TRANSFORM_PROVIDER ?? 'local';
const IMAGE_CDN_BASE = (import.meta.env.VITE_IMAGE_CDN_BASE ?? '').replace(/\/$/, '');

export function getOptimizedImageUrl(src: string, width: number, preset: ResponsivePreset): string {
  if (!isLocalPublicAsset(src)) return src;

  if (IMAGE_PROVIDER === 'cloudflare') {
    const base = IMAGE_CDN_BASE || '';
    const options = [
      `width=${width}`,
      `quality=${LOCAL_QUALITY[preset]}`,
      'format=auto',
      'fit=scale-down',
      'metadata=none',
    ].join(',');
    return `${base}/cdn-cgi/image/${options}${src}`;
  }

  const normalized = src.replace(/^\//, '');
  const extensionIndex = normalized.lastIndexOf('.');
  const withoutExtension = extensionIndex > -1 ? normalized.slice(0, extensionIndex) : normalized;
  return `/_optimized/${withoutExtension}@${width}.webp`;
}

export function getOptimizedImageSrcSet(src: string, preset: ResponsivePreset): string | undefined {
  if (!isLocalPublicAsset(src)) return undefined;
  return LOCAL_WIDTHS[preset]
    .map((width) => `${getOptimizedImageUrl(src, width, preset)} ${width}w`)
    .join(', ');
}

export interface ResponsiveImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  preset?: ResponsivePreset;
  sizes: string;
}

export function ResponsiveImage({
  src,
  preset = 'lobby-card',
  sizes,
  loading = 'lazy',
  decoding = 'async',
  ...imgProps
}: ResponsiveImageProps): JSX.Element {
  const srcSet = getOptimizedImageSrcSet(src, preset);

  if (!srcSet) {
    return <img src={src} loading={loading} decoding={decoding} {...imgProps} />;
  }

  return (
    <picture>
      <source
        srcSet={srcSet}
        sizes={sizes}
        type={IMAGE_PROVIDER === 'cloudflare' ? undefined : 'image/webp'}
      />
      <img src={src} loading={loading} decoding={decoding} {...imgProps} />
    </picture>
  );
}

function isLocalPublicAsset(src: string): boolean {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false;
  if (/^https?:\/\//i.test(src)) return false;
  return /\.(avif|jpe?g|png|webp)$/i.test(src);
}
