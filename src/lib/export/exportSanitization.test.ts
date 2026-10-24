import { describe, it, expect } from 'vitest';

function sanitizeCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

describe('Export Spreadsheet Formula Injection Protection', () => {
  it('escapes cells starting with formula trigger characters', () => {
    expect(sanitizeCell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
    expect(sanitizeCell('+cmd|')).toBe("'+cmd|");
    expect(sanitizeCell('-10+20')).toBe("'-10+20");
    expect(sanitizeCell('@dangerous')).toBe("'@dangerous");
  });

  it('leaves standard text and names unmodified', () => {
    expect(sanitizeCell('Dr. A. P. J. Kalam')).toBe('Dr. A. P. J. Kalam');
    expect(sanitizeCell('MRF-PHD-2026-001')).toBe('MRF-PHD-2026-001');
    expect(sanitizeCell('prof.sharma@mrf.org')).toBe('prof.sharma@mrf.org');
  });

  it('handles null and undefined values safely', () => {
    expect(sanitizeCell(null)).toBe('');
    expect(sanitizeCell(undefined)).toBe('');
  });
});
