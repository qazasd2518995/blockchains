import { isImportedGameTestUsername } from '@bg/shared';

type PlatformRealm = 'legacy' | 'qmoney';

/**
 * Imported games are available to every authenticated Jin Baobao member. The
 * legacy platform keeps its existing test allowlist and isolated control-test
 * fixture support.
 */
export function isImportedGameAccessUsername(
  username: string | null | undefined,
  realm: PlatformRealm,
): boolean {
  const normalized = username?.normalize('NFKC').trim();
  if (!normalized) return false;
  if (realm === 'qmoney') return true;
  if (isImportedGameTestUsername(normalized)) return true;
  if (process.env.NODE_ENV === 'production') return false;

  const prefix = process.env.CONTROL_API_FIXTURE_PREFIX?.trim();
  return Boolean(prefix && normalized.startsWith(`${prefix}_`));
}
