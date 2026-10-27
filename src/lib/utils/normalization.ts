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
  const trimmed = String(id).trim();
  // Standardize hyphens/slashes while preserving leading zeros
  return trimmed.replace(/\s+/g, ' ').toUpperCase();
}

/**
 * Validates an official MRF PhD ID.
 * Must contain at least one alphanumeric character.
 */
export function isValidPhdId(id: string | null | undefined): boolean {
  if (!id) return false;
  const normalized = normalizePhdId(String(id));
  // Ensure it has at least 1 character and contains alphanumeric characters
  return normalized.length >= 1 && /[A-Z0-9]/.test(normalized);
}

/**
 * Masks an identifier for privacy on public or confirmation screens.
 * Short identifiers (<= 4 characters) are preserved as-is.
 * Guide: "j****@domain.com"
 * PhD ID: "MRF-***-042"
 */
export function maskIdentifier(identifier: string, category: 'guide' | 'phd_scholar'): string {
  if (!identifier) return '';
  if (category === 'guide') {
    const parts = identifier.split('@');
    if (parts.length !== 2) return identifier;
    const [user, domain] = parts;
    if (user.length <= 2) {
      return `${user[0]}***@${domain}`;
    }
    return `${user[0]}***${user[user.length - 1]}@${domain}`;
  } else {
    // PhD ID
    const clean = identifier.trim();
    if (clean.length <= 4) return clean; // Do not hide short IDs into ****
    const prefix = clean.slice(0, 2);
    const suffix = clean.slice(-2);
    return `${prefix}***${suffix}`;
  }
}

/**
 * Verifies if an entered attendee name matches the registered attendee name.
 * Handles case-insensitivity, academic titles (Dr., Prof., Mr., Ms., Mrs.),
 * extraneous spacing, punctuation, and multi-word ordering/subsets.
 */
export function isNameMatching(
  inputName: string | null | undefined,
  registeredName: string | null | undefined
): boolean {
  if (!inputName || !registeredName) return false;

  const clean = (str: string) =>
    str
      .toLowerCase()
      .replace(/\b(dr|prof|mr|ms|mrs)\b\.?/gi, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const cleanInput = clean(inputName);
  const cleanReg = clean(registeredName);

  if (!cleanInput || !cleanReg) return false;
  if (cleanInput === cleanReg) return true;

  // Substring check (e.g. "Deepika" matches "Deepika Sharma" or vice versa)
  if (cleanReg.includes(cleanInput) || cleanInput.includes(cleanReg)) {
    return true;
  }

  // Word token overlap check
  const inputWords = cleanInput.split(' ').filter((w) => w.length >= 2);
  const regWords = cleanReg.split(' ').filter((w) => w.length >= 2);

  if (inputWords.length === 0 || regWords.length === 0) return false;

  // At least one significant name token (first or last name) must match
  const hasCommonWord = inputWords.some((w) => regWords.includes(w));
  return hasCommonWord;
}
