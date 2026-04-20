import type { Config } from 'tailwindcss';

/**
 * 共用 Tailwind preset — 由 apps/web 與 apps/admin 共同繼承。
 * 改此檔會同時影響兩端。
 */
export const tokensPreset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#ffffff',
          100: '#f7f9ff',
          200: '#eef2fb',
          300: '#dde4f3',
          400: '#b8c2d9',
          500: '#7a85a3',
          600: '#515c7a',
          700: '#2e3650',
          800: '#1a1f35',
          900: '#0b0f1e',
          950: '#050716',
        },
        neon: {
          acid: '#5b4df8',
          ember: '#ff3b7f',
          toxic: '#00d68f',
          blood: '#ff4e6c',
          amber: '#ffb020',
          ice: '#00b8e6',
          violet: '#9b6cff',
        },
        paper: '#f7f9ff',
        bone: '#0b0f1e',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Orbitron"', '"Chakra Petch"', 'sans-serif'],
        hud: ['"Chakra Petch"', '"Rajdhani"', 'sans-serif'],
      },
      letterSpacing: {
        widest: '0.25em',
        ultra: '0.4em',
      },
      backgroundImage: {
        'grad-primary': 'linear-gradient(135deg, #5b4df8 0%, #9b6cff 100%)',
        'grad-win': 'linear-gradient(135deg, #00d68f 0%, #00b8e6 100%)',
        'grad-loss': 'linear-gradient(135deg, #ff3b7f 0%, #ff4e6c 100%)',
        'grad-gold': 'linear-gradient(135deg, #ffb020 0%, #ff3b7f 100%)',
        'grad-mesh':
          'radial-gradient(ellipse 60% 40% at 20% 10%, rgba(91, 77, 248, 0.15), transparent 50%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(0, 214, 143, 0.12), transparent 50%), radial-gradient(ellipse 50% 30% at 50% 50%, rgba(155, 108, 255, 0.08), transparent 60%)',
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(11, 15, 30, 0.06), 0 1px 2px -1px rgba(11, 15, 30, 0.04)',
        panel: '0 1px 0 0 rgba(255, 255, 255, 0.8) inset, 0 4px 16px -8px rgba(11, 15, 30, 0.12)',
        lift: '0 12px 32px -12px rgba(91, 77, 248, 0.3), 0 4px 12px -4px rgba(11, 15, 30, 0.08)',
        'acid-glow': '0 0 0 3px rgba(91, 77, 248, 0.12), 0 8px 24px -4px rgba(91, 77, 248, 0.4)',
        'ember-glow': '0 0 0 3px rgba(255, 59, 127, 0.12), 0 8px 24px -4px rgba(255, 59, 127, 0.4)',
        'toxic-glow': '0 0 0 3px rgba(0, 214, 143, 0.12), 0 8px 24px -4px rgba(0, 214, 143, 0.4)',
        'gold-glow': '0 0 0 3px rgba(255, 176, 32, 0.15), 0 8px 32px -4px rgba(255, 176, 32, 0.45)',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '45%': { opacity: '1' },
          '46%': { opacity: '0.3' },
          '47%': { opacity: '1' },
          '50%': { opacity: '0.6' },
          '52%': { opacity: '1' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        reveal: {
          '0%': { transform: 'translateY(20px)', opacity: '0', letterSpacing: '0.4em' },
          '100%': { transform: 'translateY(0)', opacity: '1', letterSpacing: '0.02em' },
        },
        glow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 8px rgba(91, 77, 248, 0.5))' },
          '50%': { filter: 'drop-shadow(0 0 16px rgba(91, 77, 248, 0.8))' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.04)' },
        },
      },
      animation: {
        flicker: 'flicker 4s infinite',
        blink: 'blink 1s step-end infinite',
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
        ticker: 'ticker 40s linear infinite',
        reveal: 'reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
        glow: 'glow 2s ease-in-out infinite',
      },
    },
  },
};

export default tokensPreset;
