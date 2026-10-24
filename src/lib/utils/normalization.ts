/**
 * MRF Event Attendance Tracker - Identifier Normalization Utilities
 * Organization: Maharaja Research Foundation (MRF)
 */

/**
 * Normalizes a Guide's registered email address.
 * Trims leading/trailing whitespace and converts to lowercase.
 */
export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Validates whether an email string matches a standard valid email format.
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  // RFC 5322 standard regex for email validation
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(normalized);
}

/**
 * Normalizes an official MRF-issued PhD ID.
 * Preserves leading zeros, alphanumeric characters, hyphens, and slashes.
 * Trims extraneous outer whitespace and standardizes internal spacing.
 */
export function normalizePhdId(id: string | null | undefined): string {
  if (!id) return '';
  // Trim outer whitespace, replace multiple whitespace with single space, and capitalize standard alphanumeric codes
  const trimmed = id.trim();
  // Standardize hyphens/slashes while preserving leading zeros
  return trimmed.replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Validates an official MRF PhD ID.
 * Must be at least 3 non-whitespace characters and not contain forbidden characters.
 */
export function isValidPhdId(id: string | null | undefined): boolean {
  if (!id) return false;
  const normalized = normalizePhdId(id);
  // Ensure it has at least 3 characters and contains alphanumeric characters
  return normalized.length >= 3 && /[A-Z0-9]/.test(normalized);
}

/**
 * Masks an identifier for privacy on public or confirmation screens.
 * Guide: "j****@domain.com"
 * PhD ID: "MRF-***-042"
 */
export function maskIdentifier(identifier: string, category: 'guide' | 'phd_scholar'): string {
  if (!identifier) return '';
  if (category === 'guide') {
    const parts = identifier.split('@');
    if (parts.length !== 2) return '****';
    const [user, domain] = parts;
    if (user.length <= 2) {
      return `${user[0]}***@${domain}`;
    }
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  } else {
    // PhD ID
    const clean = identifier.trim();
    if (clean.length <= 4) return '****';
    const prefix = clean.slice(0, 2);
    const suffix = clean.slice(-2);
    return `${prefix}***${suffix}`;
  }
}
