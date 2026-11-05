/** "password: hunter2", "PIN = 1234", "the password is Summer2024!". */
const SECRET =
  /\b(pass(?:word|code)s?|pwd|pins?|secrets?|tokens?|api[ _-]?keys?|recovery codes?)(\s*[:=]\s*|\s+(?:is|was)\s+(?=\S*[\d!@#$%^&*]))\S+/gi;

/**
 * Text with anything that looks like a password, PIN, token or key replaced
 * by "[redacted]", so it's never stored or sent on.
 */
export const redact = (text: string): string =>
  text.replace(SECRET, '$1$2[redacted]');
