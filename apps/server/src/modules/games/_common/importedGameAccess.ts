import { isImportedGameTestUsername } from '@bg/shared';

/**
 * Keep imported games closed to regular members while allowing the API control
 * matrix to create an isolated fixture account in a non-production database.
 * The prefix is ignored in production even if it is accidentally configured.
 */
export function isImportedGameAccessUsername(username?: string | null): boolean {
  if (isImportedGameTestUsername(username)) return true;
  if (!username || process.env.NODE_ENV === 'production') return false;

  const prefix = process.env.CONTROL_API_FIXTURE_PREFIX?.trim();
  return Boolean(prefix && username.startsWith(`${prefix}_`));
}
