// Permitted email domains — the single source of truth for who can sign up and
// who tables/dashboards can be shared with. Add or remove a domain here and every
// check and message across the app updates automatically.
export const ALLOWED_DOMAINS = [
  'pearson.com',
  'pearsoncanada.com',
  'pearsoned.com',
];

/** True if the email's domain is on the allow-list (case- and whitespace-insensitive). */
export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return ALLOWED_DOMAINS.includes(domain);
}

/** Human-readable list for messages, e.g. "@pearson.com, @pearsoncanada.com or @pearsoned.com". */
export const ALLOWED_DOMAINS_LABEL = ALLOWED_DOMAINS.map((d) => `@${d}`).join(', ').replace(/, ([^,]*)$/, ' or $1');
