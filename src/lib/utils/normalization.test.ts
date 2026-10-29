import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isValidEmail,
  normalizePhdId,
  isValidPhdId,
  maskIdentifier,
  isNameMatching,
} from './normalization';

describe('Normalization and Validation Utilities', () => {
  describe('normalizeEmail', () => {
    it('trims whitespace and converts to lowercase', () => {
      expect(normalizeEmail('  Prof.Sharma@MRF.ORG  ')).toBe('prof.sharma@mrf.org');
    });

    it('returns empty string for null or undefined', () => {
      expect(normalizeEmail(null)).toBe('');
      expect(normalizeEmail(undefined)).toBe('');
    });
  });

  describe('isValidEmail', () => {
    it('accepts valid email addresses', () => {
      expect(isValidEmail('guide@mrf.ac.in')).toBe(true);
      expect(isValidEmail('first.last+event@univ.edu')).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(isValidEmail('plainaddress')).toBe(false);
      expect(isValidEmail('@missingusername.com')).toBe(false);
      expect(isValidEmail('missingdomain@.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });
  });

  describe('normalizePhdId', () => {
    it('trims whitespace, capitalizes alphanumeric tokens, and preserves leading zeros', () => {
      expect(normalizePhdId('  mrf-phd-2026-0042  ')).toBe('MRF-PHD-2026-0042');
      expect(normalizePhdId('phd/0007')).toBe('PHD/0007');
      expect(normalizePhdId('4mh24cs175')).toBe('4MH24CS175');
    });

    it('normalizes email addresses entered into PhD ID field as lowercase', () => {
      expect(normalizePhdId('4MH24CS175@GMAIL.COM')).toBe('4mh24cs175@gmail.com');
      expect(normalizePhdId('scholar.name@univ.edu')).toBe('scholar.name@univ.edu');
    });

    it('returns empty string for null or undefined', () => {
      expect(normalizePhdId(null)).toBe('');
      expect(normalizePhdId('')).toBe('');
    });
  });

  describe('isValidPhdId', () => {
    it('accepts valid PhD IDs', () => {
      expect(isValidPhdId('MRF-PHD-2026-001')).toBe(true);
      expect(isValidPhdId('PHD/009')).toBe(true);
      expect(isValidPhdId('17')).toBe(true);
    });

    it('rejects empty or purely whitespace IDs', () => {
      expect(isValidPhdId('  ')).toBe(false);
      expect(isValidPhdId('')).toBe(false);
      expect(isValidPhdId(null)).toBe(false);
    });
  });

  describe('maskIdentifier', () => {
    it('correctly masks email for Guides', () => {
      const masked = maskIdentifier('john.doe@example.com', 'guide');
      expect(masked).toContain('j***');
      expect(masked).toContain('@example.com');
    });

    it('correctly masks PhD ID for Scholars', () => {
      const masked = maskIdentifier('MRF-PHD-042', 'phd_scholar');
      expect(masked).toBe('MR***42');
    });

    it('preserves short IDs without masking to asterisks', () => {
      expect(maskIdentifier('17', 'phd_scholar')).toBe('17');
    });
  });

  describe('isNameMatching', () => {
    it('matches identical names ignoring case and whitespace', () => {
      expect(isNameMatching('bhavish', 'bhavish')).toBe(true);
      expect(isNameMatching('  Bhavish  ', 'bhavish')).toBe(true);
      expect(isNameMatching('BHAVISH', 'bhavish')).toBe(true);
      expect(isNameMatching('yashavanth b n', 'YASHAVANTH B N')).toBe(true);
      expect(isNameMatching('DR. YASHAVANTH B N', 'yashavanth b n')).toBe(true);
    });

    it('handles honorific titles like Dr. and Prof.', () => {
      expect(isNameMatching('Dr. Anand Sharma', 'Anand Sharma')).toBe(true);
      expect(isNameMatching('Prof. Meenakshi Iyer', 'Meenakshi Iyer')).toBe(true);
      expect(isNameMatching('Anand Sharma', 'Dr. Anand Sharma')).toBe(true);
    });

    it('matches partial names and subsets', () => {
      expect(isNameMatching('vishesh', 'vishesh G devanur')).toBe(true);
      expect(isNameMatching('Deepika', 'Deepika Sharma')).toBe(true);
      expect(isNameMatching('vinod', 'vinod patel')).toBe(true);
    });

    it('rejects mismatched names', () => {
      expect(isNameMatching('bhavish', 'rahul')).toBe(false);
      expect(isNameMatching('Alice', 'Bob')).toBe(false);
      expect(isNameMatching('bhavish', 'vinod patel')).toBe(false);
    });
  });
});
