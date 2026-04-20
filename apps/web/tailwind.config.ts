import type { Config } from 'tailwindcss';
import { tokensPreset } from '@bg/ui-tokens';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  presets: [tokensPreset as Config],
  plugins: [],
} satisfies Config;
