import { describe, it, expect } from 'vitest';
import { normalizeEmail, isValidEmail, normalizePhdId, isValidPhdId } from '../utils/normalization';

describe('Import Validation Logic', () => {
  it('identifies and validates Guide import rows', () => {
    const rawGuide = { name: 'Dr. Ramesh Sharma', email: '  R.Sharma@MRF.ORG  ' };
    const normalized = normalizeEmail(rawGuide.email);
    expect(isValidEmail(normalized)).toBe(true);
    expect(normalized).toBe('r.sharma@mrf.org');
    expect(rawGuide.name.trim()).toBe('Dr. Ramesh Sharma');
  });

  it('rejects Guide rows with invalid or missing emails', () => {
    expect(isValidEmail(normalizeEmail('not-an-email'))).toBe(false);
    expect(isValidEmail(normalizeEmail(''))).toBe(false);
    expect(isValidEmail(normalizeEmail(undefined))).toBe(false);
  });

  it('identifies and validates PhD Scholar import rows', () => {
    const rawScholar = { name: 'Ananya Roy', phd_id: '  mrf-phd-2026-089 ' };
    const normalizedId = normalizePhdId(rawScholar.phd_id);
    expect(isValidPhdId(normalizedId)).toBe(true);
    expect(normalizedId).toBe('MRF-PHD-2026-089');
  });

  it('preserves leading zeros in PhD Scholar IDs', () => {
    const idWithZeros = normalizePhdId('00042-PHD');
    expect(idWithZeros).toBe('00042-PHD');
  });

  it('detects duplicates within a dataset', () => {
    const emails = ['guide1@mrf.org', 'GUIDE1@mrf.org', 'guide2@mrf.org'];
    const seen = new Set<string>();
    const duplicates: string[] = [];

    emails.forEach((email) => {
      const norm = normalizeEmail(email);
      if (seen.has(norm)) {
        duplicates.push(norm);
      } else {
        seen.add(norm);
      }
    });

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]).toBe('guide1@mrf.org');
    expect(seen.size).toBe(2);
  });
});
