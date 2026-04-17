import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05060a',
          900: '#0a0c14',
          800: '#111420',
          700: '#1a1e2e',
          600: '#252b3f',
          500: '#384057',
          400: '#5a6380',
          300: '#9ba3bf',
          200: '#d4d8e5',
          100: '#eef0f6',
        },
        neon: {
          acid: '#d4ff3a',
          ember: '#ff4e50',
          toxic: '#00ffa3',
          blood: '#dc1f3b',
          amber: '#ffb547',
          ice: '#6df7ff',
        },
        bone: '#f4efe4',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['"Fraunces"', 'Georgia', 'serif'],
        display: ['"Bebas Neue"', '"Fraunces"', 'sans-serif'],
      },
      letterSpacing: {
        widest: '0.25em',
        ultra: '0.4em',
      },
      boxShadow: {
        'brutal': '6px 6px 0 0 rgba(0, 0, 0, 1)',
        'brutal-sm': '3px 3px 0 0 rgba(0, 0, 0, 1)',
        'acid-glow': '0 0 40px rgba(212, 255, 58, 0.3), 0 0 2px rgba(212, 255, 58, 0.9)',
        'ember-glow': '0 0 40px rgba(255, 78, 80, 0.35), 0 0 2px rgba(255, 78, 80, 0.9)',
        'toxic-glow': '0 0 40px rgba(0, 255, 163, 0.3), 0 0 2px rgba(0, 255, 163, 0.9)',
      },
      keyframes: {
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
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
        drift: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(2px, -3px)' },
          '66%': { transform: 'translate(-2px, 2px)' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        reveal: {
          '0%': { transform: 'translateY(20px)', opacity: '0', letterSpacing: '0.4em' },
          '100%': { transform: 'translateY(0)', opacity: '1', letterSpacing: '0.02em' },
        },
      },
      animation: {
        scan: 'scan 8s linear infinite',
        flicker: 'flicker 4s infinite',
        blink: 'blink 1s step-end infinite',
        drift: 'drift 6s ease-in-out infinite',
        ticker: 'ticker 40s linear infinite',
        reveal: 'reveal 0.8s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
} satisfies Config;
