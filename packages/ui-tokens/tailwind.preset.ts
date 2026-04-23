import type { Config } from 'tailwindcss';

/**
 * 華人娛樂城風 Tailwind preset
 * 配色：淺灰底 + 白卡片 + 深青強調 + 金色獎金
 * 字體：Inter + Noto Sans TC + 等寬數字
 */
const FULL_OPACITY_SCALE: Record<string, string> = (() => {
  const scale: Record<string, string> = {};
  for (let i = 0; i <= 100; i += 1) {
    scale[String(i)] = (i / 100).toString();
  }
  return scale;
})();

export const tokensPreset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      opacity: FULL_OPACITY_SCALE,
      backgroundOpacity: FULL_OPACITY_SCALE,
      textOpacity: FULL_OPACITY_SCALE,
      borderOpacity: FULL_OPACITY_SCALE,
      ringOpacity: FULL_OPACITY_SCALE,
      divideOpacity: FULL_OPACITY_SCALE,
      placeholderOpacity: FULL_OPACITY_SCALE,
      colors: {
        // 頁面 / 卡片
        page: '#ECECEC',
        card: '#FFFFFF',
        section: '#F5F7FA',
        dark: '#1A2530',
        // 文字
        ink: {
          50: '#FFFFFF',
          100: '#F5F7FA',
          200: '#E5E7EB',
          400: '#9CA3AF',
          500: '#4A5568',
          600: '#334155',
          700: '#1A2530',
          900: '#0F172A',
          primary: '#0F172A',
          secondary: '#4A5568',
          muted: '#9CA3AF',
          onDark: '#FFFFFF',
        },
        // 主題色（深青）
        teal: {
          50: '#E6F1F4',
          100: '#C0DCE3',
          200: '#7BB3C2',
          300: '#408A9D',
          400: '#266F85',
          500: '#186073',   // primary accent
          600: '#135566',
          700: '#0E4555',
          800: '#093040',
          900: '#051E2B',
        },
        // 金色（VIP / 獎金）
        gold: {
          50: '#FAF2D7',
          100: '#F3E5AE',
          200: '#E8D48A',   // 贏家榜 Top3 淡金
          300: '#DEBE66',
          400: '#D0AC4D',
          500: '#C9A247',   // 獎金 / 中獎跑馬燈字色
          600: '#AE8B35',
          700: '#876A27',
          800: '#5A471A',
          900: '#2F260D',
        },
        brass: {
          400: '#D0AC4D',
          500: '#C9A247',
          600: '#AE8B35',
        },
        wine: {
          500: '#B94538',
          600: '#8F3027',
        },
        neon: {
          acid: '#186073',
          ember: '#D4574A',
          toxic: '#09B826',
          ice: '#266F85',
        },
        // 公告紅
        alert: '#D4574A',
        // 成功 / 線上
        success: '#09B826',
        win: '#09B826',
        loss: '#D4574A',
        // 排名銀銅
        silver: '#C0C0C0',
        bronze: '#CD7F32',
        // 邊框
        border: {
          soft: '#E5E7EB',
          accent: '#186073',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif'],
        num: ['"Roboto Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
        display: ['Inter', '"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif'],
        brand: ['Inter', '"Noto Sans TC"', 'sans-serif'],
      },
      letterSpacing: {
        brand: '0.05em',
      },
      borderRadius: {
        card: '10px',
        btn: '6px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(15, 23, 42, 0.06)',
        cardHover: '0 8px 20px rgba(24, 96, 115, 0.18)',
        'dark': '0 2px 12px rgba(0, 0, 0, 0.3)',
        lift: '0 12px 28px -8px rgba(15, 23, 42, 0.18)',
        'teal-ring': '0 0 0 3px rgba(24, 96, 115, 0.25)',
        'acid-glow': '0 0 0 1px rgba(24, 96, 115, 0.25), 0 10px 24px -12px rgba(24, 96, 115, 0.45)',
        'ember-glow': '0 0 0 1px rgba(212, 87, 74, 0.25), 0 10px 24px -12px rgba(212, 87, 74, 0.4)',
        'toxic-glow': '0 0 0 1px rgba(9, 184, 38, 0.22), 0 10px 24px -12px rgba(9, 184, 38, 0.35)',
      },
      backgroundImage: {
        'grad-win': 'linear-gradient(135deg, rgba(9, 184, 38, 0.18), rgba(24, 96, 115, 0.08))',
        'grad-loss': 'linear-gradient(135deg, rgba(212, 87, 74, 0.18), rgba(26, 37, 48, 0.06))',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        breath: {
          '0%, 100%': { opacity: '0.8' },
          '50%': { opacity: '1' },
        },
        'card-lift': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-4px)' },
        },
        blink: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
      animation: {
        ticker: 'ticker 50s linear infinite',
        breath: 'breath 1.6s ease-in-out infinite',
        'card-lift': 'card-lift 0.3s ease-out forwards',
        blink: 'blink 1s step-end infinite',
      },
    },
  },
};

export default tokensPreset;
