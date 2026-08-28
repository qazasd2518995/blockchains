import type { Locale } from '@/i18n/types';

export type AdminRealm = 'legacy' | 'qmoney';
export type AdminArtworkMode = 'cover' | 'mascot';

export interface LocalizedAdminBrand {
  brand: string;
  brandShort: string;
  authTitle: string;
  authSubtitle: string;
  heroEyebrow: string;
  heroTitle: string;
  heroDescription: string;
}

export interface AdminBrand {
  realm: AdminRealm;
  pageTitle: string;
  themeColor: string;
  emblemAsset: string;
  loginArtworkAsset: string;
  shellArtworkAsset: string;
  dashboardArtworkAsset: string;
  controlArtworkAsset: string;
  artworkMode: AdminArtworkMode;
  sessionStorageKey: string;
  localeStorageKey: string;
  shareHeading: string;
  playerLoginUrls: readonly string[];
  agentLoginUrls: readonly string[];
  copy: Record<Locale, LocalizedAdminBrand>;
}
