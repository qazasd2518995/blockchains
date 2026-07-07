import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const localApiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:3001';

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
