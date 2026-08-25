import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Keep local development aligned with apps/server/.env and the project README.
// Port 3001 is also commonly used by unrelated local tools, which can make an
// original game iframe appear broken even though its assets loaded correctly.
const localApiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': localApiTarget,
      '/socket.io': {
        target: localApiTarget,
        ws: true,
      },
    },
  },
});
