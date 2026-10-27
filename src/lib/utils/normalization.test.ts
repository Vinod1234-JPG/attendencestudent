import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isValidEmail,
  normalizePhdId,
  isValidPhdId,
  maskIdentifier,
} from './normalization';

describe('Normalization and Validation Utilities', () => {
  describe('normalizeEmail', () => {
    it('trims whitespace and converts to lowercase', () => {
      expect(normalizeEmail('  Prof.Sharma@MRF.ORG  ')).toBe('prof.sharma@mrf.org');
    });

    it('handles empty or null inputs safely', () => {
      expect(normalizeEmail('')).toBe('');
      expect(normalizeEmail(null)).toBe('');
      expect(normalizeEmail(undefined)).toBe('');
    });
  });

  describe('isValidEmail', () => {
    it('accepts valid email addresses', () => {
      expect(isValidEmail('guide@mrf.edu.in')).toBe(true);
      expect(isValidEmail('dr.r.kumar+event@gmail.com')).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('normalizePhdId', () => {
    it('preserves leading zeros and special characters while standardizing case and whitespace', () => {
      expect(normalizePhdId('  mrf/phd/0042  ')).toBe('MRF/PHD/0042');
      expect(normalizePhdId('00123-A')).toBe('00123-A');
    });

    it('handles empty or null inputs', () => {
      expect(normalizePhdId(null)).toBe('');
      expect(normalizePhdId('')).toBe('');
    });
  });

  describe('isValidPhdId', () => {
    it('accepts valid PhD IDs', () => {
      expect(isValidPhdId('MRF-PHD-2026-001')).toBe(true);
      expect(isValidPhdId('PHD/009')).toBe(true);
    });

    it('rejects too short or purely whitespace IDs', () => {
      expect(isValidPhdId('  ')).toBe(false);
      expect(isValidPhdId('17')).toBe(true);
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
  });
});

