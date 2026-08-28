import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const realm = env.VITE_ADMIN_REALM === 'qmoney' ? 'qmoney' : 'legacy';
  const apiRealm = env.VITE_API_REALM || realm;

  if (command === 'build' && apiRealm !== realm) {
    throw new Error(`VITE_API_REALM (${apiRealm}) must match VITE_ADMIN_REALM (${realm})`);
  }
  if (command === 'build' && realm === 'qmoney') {
    assertQmoneyApiBase(env.VITE_API_BASE);
  }

  return {
    plugins: [react(), adminBrandHtmlPlugin(realm)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@admin-brand': path.resolve(__dirname, `./src/brand/${realm}.ts`),
      },
    },
    server: {
      port: 5174,
      proxy: {
        '/api': 'http://localhost:3000',
      },
    },
  };
});

function adminBrandHtmlPlugin(realm: 'legacy' | 'qmoney'): Plugin {
  const isQmoney = realm === 'qmoney';
  const title = isQmoney ? '金寶寶代理後台' : '八千代代理後台';
  const icon = isQmoney ? '/brand/jin-baobao-avatar.webp' : '/brand/yachiyo-emblem.png';
  const iconType = isQmoney ? 'image/webp' : 'image/png';
  const themeColor = isQmoney ? '#7447d8' : '#093040';

  return {
    name: 'admin-brand-html',
    transformIndexHtml(html) {
      return html
        .replace('<title>代理後台</title>', `<title>${title}</title>`)
        .replace(
          '<link rel="icon" data-admin-brand-icon href="/favicon.png" />',
          `<link rel="icon" data-admin-brand-icon type="${iconType}" href="${icon}" />`,
        )
        .replace(
          '<meta name="theme-color" content="#093040" />',
          `<meta name="theme-color" content="${themeColor}" />`,
        );
    },
  };
}

function assertQmoneyApiBase(value: string | undefined): void {
  if (!value) throw new Error('VITE_API_BASE is required for the Qmoney admin build');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_BASE must be an absolute URL for the Qmoney admin build');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('VITE_API_BASE must use HTTPS for the Qmoney admin build');
  }
}
