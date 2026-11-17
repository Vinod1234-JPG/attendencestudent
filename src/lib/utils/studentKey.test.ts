import { describe, it, expect } from 'vitest';
import {
  buildStudentKey,
  cleanDisplayText,
  validateStudentDetails,
  categoryLabel,
} from './normalization';

describe('Student identity (name + college)', () => {
  it('treats case, spacing and punctuation differences as the same student', () => {
    expect(buildStudentKey('Rahul K.', 'MIT Mysore')).toBe(buildStudentKey('  rahul   k ', 'mit  mysore'));
  });

  it('distinguishes the same name at different colleges', () => {
    expect(buildStudentKey('Rahul K', 'MIT Mysore')).not.toBe(buildStudentKey('Rahul K', 'NIE Mysore'));
  });

  it('keeps non-Latin letters', () => {
    expect(buildStudentKey('ರಾಹುಲ್', 'MIT Mysore')).toBe('ರಾಹುಲ್|mit mysore');
  });

  it('tidies display text', () => {
    expect(cleanDisplayText('  Asha   Rao ')).toBe('Asha Rao');
  });

  it('requires both name and college', () => {
    expect(validateStudentDetails('', 'MIT Mysore')).toMatch(/student name/i);
    expect(validateStudentDetails('Asha', '  ')).toMatch(/college/i);
    expect(validateStudentDetails('...', 'MIT')).toMatch(/valid student name/i);
    expect(validateStudentDetails('Asha Rao', 'MIT Mysore')).toBeNull();
  });

  it('rejects overly long input', () => {
    expect(validateStudentDetails('a'.repeat(121), 'MIT')).toMatch(/at most/);
  });

  it('labels categories', () => {
    expect(categoryLabel('student')).toBe('Student');
    expect(categoryLabel('guide')).toBe('Guide');
  });
});
