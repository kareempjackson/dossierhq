/**
 * Where to go after signing in, kept on this site: a path, never another
 * origin (`//evil.com`, `/\evil.com`). Anything else goes home.
 */
export function safeNextPath(value: unknown): string {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
    ? value
    : '/';
}
