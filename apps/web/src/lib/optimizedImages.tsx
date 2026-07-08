import type { ImgHTMLAttributes } from 'react';

export type ResponsivePreset = 'lobby-card' | 'hall-card' | 'hero' | 'game-stage';

const LOCAL_WIDTHS: Record<ResponsivePreset, number[]> = {
  'lobby-card': [480, 960],
  'hall-card': [720, 1600],
  hero: [960, 1600],
  'game-stage': [480, 720, 960, 1600],
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

type ImageFetchPriority = 'high' | 'low' | 'auto';

export interface ResponsiveImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'fetchPriority'> {
  src: string;
  preset?: ResponsivePreset;
  sizes: string;
  fetchPriority?: ImageFetchPriority;
}

export function ResponsiveImage({
  src,
  preset = 'lobby-card',
  sizes,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  ...imgProps
}: ResponsiveImageProps): JSX.Element {
  const srcSet = getOptimizedImageSrcSet(src, preset);
  const priorityProps = fetchPriority
    ? ({ fetchpriority: fetchPriority } as Record<'fetchpriority', ImageFetchPriority>)
    : {};

  if (!srcSet) {
    return (
      <img
        src={src}
        loading={loading}
        decoding={decoding}
        {...priorityProps}
        {...imgProps}
      />
    );
  }

  return (
    <picture>
      <source
        srcSet={srcSet}
        sizes={sizes}
        type={IMAGE_PROVIDER === 'cloudflare' ? undefined : 'image/webp'}
      />
      <img
        src={src}
        loading={loading}
        decoding={decoding}
        {...priorityProps}
        {...imgProps}
      />
    </picture>
  );
}

function isLocalPublicAsset(src: string): boolean {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return false;
  if (/^https?:\/\//i.test(src)) return false;
  return /\.(avif|jpe?g|png|webp)$/i.test(src);
}
