# Image Asset Pipeline

This project has hundreds of static game images under `apps/web/public`. The runtime path is:

1. `apps/web/src/lib/gameAssetManifest.ts` lists the assets each playable game needs.
2. React Router loaders call `preloadGameAssets(gameId)` before rendering the game screen.
3. Lobby cards use `ResponsiveImage`, which emits WebP `srcset` entries from `/_optimized`.
4. `apps/web/public/sw.js` keeps game images and Vite hashed assets in runtime caches after first load.
5. Production can switch image URLs to Cloudflare Image Transform by environment variable.

## Generate Local WebP Assets

Run this after adding or replacing images in `apps/web/public`:

```bash
pnpm --filter @bg/web run optimize:images
```

The script requires ImageMagick with WebP support and writes:

- `apps/web/public/_optimized/**@480.webp`
- `apps/web/public/_optimized/**@960.webp`
- `apps/web/public/_optimized/**@1600.webp`
- `apps/web/public/_optimized/manifest.json`

Use `--force` to regenerate everything:

```bash
pnpm --filter @bg/web run optimize:images -- --force
```

## Runtime Behavior

`ResponsiveImage` keeps the original PNG/JPG as the fallback `<img src>`, and adds WebP sources for browsers that can use them. Game route loaders preload critical assets first, then warm non-critical assets during idle time.

For Pixi games, manifest entries marked `pixi: true` are still preloaded as browser images before route render. The Pixi scene then creates GPU textures inside its own lazy-loaded chunk and reuses the warmed browser HTTP cache instead of forcing Pixi into the app shell bundle.

## CDN / Cloudflare

Default local behavior:

```env
VITE_IMAGE_TRANSFORM_PROVIDER=local
```

Cloudflare behavior:

```env
VITE_IMAGE_TRANSFORM_PROVIDER=cloudflare
VITE_IMAGE_CDN_BASE=https://your-cdn.example.com
```

When Cloudflare mode is enabled, image URLs are emitted as:

```text
https://your-cdn.example.com/cdn-cgi/image/width=960,quality=80,format=auto,fit=scale-down,metadata=none/path/to/image.png
```

Recommended Cloudflare Cache Rule:

```text
Path contains /_optimized/
or Path contains /game-art/
or Path contains /slots/
or Path contains /crash/
or Path contains /games/

Browser TTL: 1 year
Edge TTL: 1 year
Cache key: include query string
```

If you serve static files from a custom CDN, use immutable cache headers for generated assets:

```http
Cache-Control: public, max-age=31536000, immutable
```

Do not set immutable caching on `index.html` or `sw.js`; those must update quickly.
