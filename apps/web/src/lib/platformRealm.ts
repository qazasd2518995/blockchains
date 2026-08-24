export type PlatformRealm = 'legacy' | 'qmoney';

export const platformRealm: PlatformRealm =
  import.meta.env.VITE_PLATFORM_REALM === 'qmoney' ? 'qmoney' : 'legacy';

export const isQmoneyRealm = platformRealm === 'qmoney';

export const platformLobbyPath = isQmoneyRealm ? '/qmoney/' : '/lobby';
