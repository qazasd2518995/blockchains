import type { Config } from 'tailwindcss';

/**
 * 華人娛樂城風 Tailwind preset
 * 配色：淺灰底 + 白卡片 + 深青強調 + 金色獎金
 * 字體：Inter + Noto Sans TC + 等寬數字
 */
export const tokensPreset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 頁面 / 卡片
        page: '#ECECEC',
        card: '#FFFFFF',
        section: '#F5F7FA',
        dark: '#1A2530',
        // 文字
        ink: {
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
        // 公告紅
        alert: '#D4574A',
        // 成功 / 線上
        success: '#09B826',
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
        'teal-ring': '0 0 0 3px rgba(24, 96, 115, 0.25)',
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
      },
      animation: {
        ticker: 'ticker 50s linear infinite',
        breath: 'breath 1.6s ease-in-out infinite',
        'card-lift': 'card-lift 0.3s ease-out forwards',
      },
    },
  },
};

export default tokensPreset;
