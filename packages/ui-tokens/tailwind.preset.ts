import type { Config } from 'tailwindcss';

/**
 * The Gilded Salon — 共用 Tailwind preset
 *
 * 由 apps/web 與 apps/admin 共同繼承。
 * 設計語言：Monte Carlo 高級俱樂部（象牙 / 祖母綠絨布 / 黃銅 / 酒紅 / 瀝青黑）。
 */
export const tokensPreset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 象牙層（背景主色）
        ivory: {
          50: '#FFFDF8',
          100: '#FBF9F4',
          200: '#F6EFE0',
          300: '#EEE4CC',
          400: '#DCD0B3',
          500: '#B8AC8E',
          600: '#8A7F6E',
          700: '#5A4F3D',
          800: '#3A332B',
          900: '#1A1510',
          950: '#0A0806',
        },
        // 綠絨（牌桌）
        felt: {
          50: '#E8F1EC',
          100: '#BFD6C8',
          200: '#86B49C',
          300: '#4D8E6F',
          400: '#26704F',
          500: '#14563E',
          600: '#0C4632',
          700: '#073026',
          800: '#041D18',
          900: '#02100D',
        },
        // 黃銅
        brass: {
          50: '#FCF6E1',
          100: '#F6E8B8',
          200: '#EDD788',
          300: '#E0BF6E',
          400: '#D1AD5A',
          500: '#C9A24C',
          600: '#A88338',
          700: '#8A6B2A',
          800: '#5E491C',
          900: '#3A2D12',
        },
        // 酒紅
        wine: {
          50: '#F6E5E7',
          100: '#E5B7BD',
          200: '#CC7F8A',
          300: '#A73A4A',
          400: '#8B1A2A',
          500: '#6B0F1A',
          600: '#550B14',
          700: '#40080F',
          800: '#2A050A',
          900: '#150205',
        },
        // 語意
        win: '#1E7A4F',
        loss: '#8B1A2A',
        live: '#B8853A',
        // 向下相容別名（讓尚未改的舊 class 不爆）
        ink: {
          50: '#FFFDF8',
          100: '#FBF9F4',
          200: '#F6EFE0',
          300: '#EEE4CC',
          400: '#DCD0B3',
          500: '#8A7F6E',
          600: '#5A4F3D',
          700: '#3A332B',
          800: '#1A1510',
          900: '#0A0806',
          950: '#050403',
        },
        neon: {
          acid: '#C9A24C',
          ember: '#8B1A2A',
          toxic: '#1E7A4F',
          blood: '#6B0F1A',
          amber: '#E0BF6E',
          ice: '#86B49C',
          violet: '#A88338',
        },
        paper: '#FBF9F4',
        bone: '#0A0806',
      },
      fontFamily: {
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Bodoni Moda"', 'Didot', '"Playfair Display"', 'serif'],
        mono: ['"IBM Plex Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
        display: ['"Bodoni Moda"', 'Didot', 'serif'],
        hud: ['"Inter Tight"', 'ui-sans-serif', 'system-ui'],
        script: ['"Italiana"', '"Bodoni Moda"', 'serif'],
      },
      letterSpacing: {
        widest: '0.25em',
        ultra: '0.4em',
        salon: '0.12em',
      },
      backgroundImage: {
        'grad-brass':
          'linear-gradient(135deg, #E0BF6E 0%, #C9A24C 45%, #8A6B2A 100%)',
        'grad-brass-soft':
          'linear-gradient(135deg, #F6E8B8 0%, #D1AD5A 50%, #A88338 100%)',
        'grad-felt':
          'radial-gradient(ellipse at center, #14563E 0%, #0C4632 45%, #073026 100%)',
        'grad-felt-flat':
          'linear-gradient(180deg, #0C4632 0%, #073026 100%)',
        'grad-wine':
          'linear-gradient(135deg, #8B1A2A 0%, #6B0F1A 50%, #40080F 100%)',
        'grad-crystal':
          'radial-gradient(ellipse 900px 420px at 50% 0%, rgba(224, 191, 110, 0.22) 0%, rgba(224, 191, 110, 0.06) 40%, transparent 70%)',
        'grad-marble':
          'linear-gradient(135deg, #FBF9F4 0%, #F6EFE0 55%, #FBF9F4 100%)',
        'grad-ivory-soft':
          'linear-gradient(180deg, #FFFDF8 0%, #FBF9F4 60%, #F6EFE0 100%)',
        // 舊名相容（避免尚未改的地方爆）
        'grad-primary': 'linear-gradient(135deg, #C9A24C 0%, #8A6B2A 100%)',
        'grad-win': 'linear-gradient(135deg, #1E7A4F 0%, #14563E 100%)',
        'grad-loss': 'linear-gradient(135deg, #8B1A2A 0%, #6B0F1A 100%)',
        'grad-gold': 'linear-gradient(135deg, #E0BF6E 0%, #8A6B2A 100%)',
        'grad-mesh':
          'radial-gradient(ellipse 900px 420px at 50% 0%, rgba(224, 191, 110, 0.18), transparent 60%), radial-gradient(ellipse 60% 40% at 20% 80%, rgba(12, 70, 50, 0.08), transparent 60%)',
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(10, 8, 6, 0.08), 0 1px 2px -1px rgba(10, 8, 6, 0.04)',
        panel:
          '0 1px 0 0 rgba(255, 253, 248, 0.9) inset, 0 4px 18px -8px rgba(10, 8, 6, 0.12)',
        lift:
          '0 14px 30px -10px rgba(10, 8, 6, 0.22), 0 4px 12px -4px rgba(201, 162, 76, 0.16)',
        deep:
          '0 24px 48px -12px rgba(10, 8, 6, 0.28), 0 8px 16px -4px rgba(107, 15, 26, 0.16)',
        brass:
          '0 0 0 1px #8A6B2A, 0 0 0 3px #FBF9F4, 0 0 0 4px #C9A24C',
        'brass-inner':
          'inset 0 0 0 1px rgba(201, 162, 76, 0.35), inset 0 1px 0 0 rgba(255, 253, 248, 0.5)',
        crystal: '0 0 40px rgba(224, 191, 110, 0.28)',
        'brass-glow':
          '0 0 0 3px rgba(201, 162, 76, 0.18), 0 8px 24px -4px rgba(201, 162, 76, 0.38)',
        'felt-glow':
          '0 0 0 3px rgba(30, 122, 79, 0.18), 0 8px 24px -4px rgba(12, 70, 50, 0.4)',
        'wine-glow':
          '0 0 0 3px rgba(139, 26, 42, 0.18), 0 8px 24px -4px rgba(107, 15, 26, 0.45)',
        // 舊名相容
        'acid-glow':
          '0 0 0 3px rgba(201, 162, 76, 0.18), 0 8px 24px -4px rgba(201, 162, 76, 0.38)',
        'ember-glow':
          '0 0 0 3px rgba(139, 26, 42, 0.18), 0 8px 24px -4px rgba(107, 15, 26, 0.45)',
        'toxic-glow':
          '0 0 0 3px rgba(30, 122, 79, 0.18), 0 8px 24px -4px rgba(12, 70, 50, 0.4)',
        'gold-glow': '0 0 40px rgba(224, 191, 110, 0.28)',
      },
      keyframes: {
        // 黃銅邊緩慢光澤
        'brass-shimmer': {
          '0%': { backgroundPosition: '-160% 0' },
          '100%': { backgroundPosition: '260% 0' },
        },
        // 蠟封脈動
        'seal-breath': {
          '0%, 100%': { transform: 'scale(1) rotate(0deg)' },
          '50%': { transform: 'scale(1.04) rotate(0.5deg)' },
        },
        // 水晶呼吸
        'crystal-breath': {
          '0%, 100%': { opacity: '0.85' },
          '50%': { opacity: '1' },
        },
        // 舊 keyframe 保留，色彩替換
        flicker: {
          '0%, 100%': { opacity: '1' },
          '45%': { opacity: '1' },
          '46%': { opacity: '0.6' },
          '47%': { opacity: '1' },
          '50%': { opacity: '0.75' },
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
          '0%': { transform: 'translateY(24px)', opacity: '0', letterSpacing: '0.4em' },
          '100%': { transform: 'translateY(0)', opacity: '1', letterSpacing: '0.02em' },
        },
        glow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 6px rgba(201, 162, 76, 0.5))' },
          '50%': { filter: 'drop-shadow(0 0 16px rgba(201, 162, 76, 0.8))' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.04)' },
        },
        'chip-flip': {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(360deg)' },
        },
      },
      animation: {
        flicker: 'flicker 5s infinite',
        blink: 'blink 1.2s step-end infinite',
        'pulse-ring': 'pulse-ring 2.4s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
        ticker: 'ticker 50s linear infinite',
        reveal: 'reveal 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        glow: 'glow 2.4s ease-in-out infinite',
        'brass-shimmer': 'brass-shimmer 8s linear infinite',
        'seal-breath': 'seal-breath 3.2s ease-in-out infinite',
        'crystal-breath': 'crystal-breath 6s ease-in-out infinite',
        'chip-flip': 'chip-flip 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
};

export default tokensPreset;
