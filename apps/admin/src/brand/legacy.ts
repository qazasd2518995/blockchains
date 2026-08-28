import { resolveUrlList } from './shared';
import type { AdminBrand } from './types';

export const adminBrand: AdminBrand = {
  realm: 'legacy',
  pageTitle: '八千代代理後台',
  themeColor: '#093040',
  emblemAsset: '/brand/yachiyo-emblem.png',
  loginArtworkAsset: '/backgrounds/admin-login.png',
  shellArtworkAsset: '/backgrounds/admin-shell-host.png',
  dashboardArtworkAsset: '/banners/dashboard-agent-host.png',
  controlArtworkAsset: '/banners/controls-risk-host.png',
  artworkMode: 'cover',
  sessionStorageKey: 'bg-admin-auth',
  localeStorageKey: 'bg.admin.locale',
  shareHeading: '八千代娛樂城推廣連結',
  playerLoginUrls: resolveUrlList(import.meta.env.VITE_PLAYER_LOGIN_URLS, [
    'https://yachiyo777.com',
    'https://yachiyo666.com',
  ]),
  agentLoginUrls: resolveUrlList(import.meta.env.VITE_AGENT_LOGIN_URLS, [
    'https://yachiyo168.com',
    'https://yachiyo188.com',
  ]),
  copy: {
    'zh-Hant': {
      brand: '八千代代理後台',
      brandShort: '八千代後台',
      authTitle: '八千代代理後台',
      authSubtitle: '代理營運管理系統',
      heroEyebrow: '八千代代理後台',
      heroTitle: '代理管理平台，協助你掌握團隊與會員帳務。',
      heroDescription: '登入後可查看代理層級、會員資料、餘額異動與報表紀錄，快速處理日常營運與帳務確認。',
    },
    'zh-Hans': {
      brand: '八千代代理后台',
      brandShort: '八千代后台',
      authTitle: '八千代代理后台',
      authSubtitle: '代理运营管理系统',
      heroEyebrow: '八千代代理后台',
      heroTitle: '代理管理平台，协助你掌握团队与会员账务。',
      heroDescription: '登录后可查看代理层级、会员资料、余额异动与报表记录，快速处理日常运营与账务确认。',
    },
    en: {
      brand: 'Yachiyo Agent Admin',
      brandShort: 'Yachiyo Admin',
      authTitle: 'Yachiyo Agent Admin',
      authSubtitle: 'Agent Operations Management',
      heroEyebrow: 'Yachiyo Agent Admin',
      heroTitle: 'Agent management platform for teams and member accounts.',
      heroDescription: 'Review hierarchy, member profiles, balance changes and reports for daily operations.',
    },
  },
};

export const isQmoneyAdmin = false;
