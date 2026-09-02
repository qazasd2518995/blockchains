import { resolveUrlList } from './shared';
import type { AdminBrand } from './types';

export const adminBrand: AdminBrand = {
  realm: 'qmoney',
  pageTitle: '金寶寶代理後台',
  themeColor: '#7447d8',
  emblemAsset: '/brand/jin-baobao-avatar.webp',
  loginArtworkAsset: '/brand/jin-baobao-mascot.webp',
  shellArtworkAsset: '/brand/jin-baobao-mascot.webp',
  dashboardArtworkAsset: '/brand/jin-baobao-mascot.webp',
  controlArtworkAsset: '/brand/jin-baobao-mascot.webp',
  artworkMode: 'mascot',
  sessionStorageKey: 'bg-qmoney-admin-auth',
  localeStorageKey: 'bg.qmoney.admin.locale',
  shareHeading: '金寶寶娛樂城推廣連結',
  playerLoginUrls: resolveUrlList(import.meta.env.VITE_PLAYER_LOGIN_URLS, [
    'https://qmoney.yachiyo777.com',
  ]),
  agentLoginUrls: resolveUrlList(import.meta.env.VITE_AGENT_LOGIN_URLS, [
    'https://qmoney.yachiyo168.com',
  ]),
  copy: {
    'zh-Hant': {
      brand: '金寶寶代理後台',
      brandShort: '金寶寶後台',
      authTitle: '金寶寶代理後台',
      authSubtitle: '金寶寶獨立營運管理系統',
      heroEyebrow: '金寶寶代理後台',
      heroTitle: '金寶寶獨立管理平台，掌握代理、會員與遊戲營運。',
      heroDescription: '此後台僅管理金寶寶代理線與會員資料；帳號、點數、報表及控制設定均與其他平台分開。',
    },
    'zh-Hans': {
      brand: '金宝宝代理后台',
      brandShort: '金宝宝后台',
      authTitle: '金宝宝代理后台',
      authSubtitle: '金宝宝独立运营管理系统',
      heroEyebrow: '金宝宝代理后台',
      heroTitle: '金宝宝独立管理平台，掌握代理、会员与游戏运营。',
      heroDescription: '此后台仅管理金宝宝代理线与会员资料；账号、点数、报表及控制设定均与其他平台分开。',
    },
    en: {
      brand: 'Jin Baobao Agent Admin',
      brandShort: 'Jin Baobao Admin',
      authTitle: 'Jin Baobao Agent Admin',
      authSubtitle: 'Independent Operations Management',
      heroEyebrow: 'Jin Baobao Agent Admin',
      heroTitle: 'An independent console for Jin Baobao agents, members and game operations.',
      heroDescription: 'Accounts, points, reports and control settings in this console are isolated from every other platform.',
    },
  },
};

export const isQmoneyAdmin = true;
