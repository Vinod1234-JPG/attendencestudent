import { describe, it, expect } from 'vitest';
import { canSeeRegistration, isTeacher } from './staffScope';
import { isAdminRole } from './adminSession';

const teacherA = { id: 'ta', role: 'teacher' };
const teacherB = { id: 'tb', role: 'teacher' };
const admin = { id: 'ad', role: 'admin' };
const superAdmin = { id: 'sa', role: 'super_admin' };

describe('who sees which registration', () => {
  it('a teacher sees only the registrations they made', () => {
    expect(canSeeRegistration(teacherA, 'ta')).toBe(true);
    expect(canSeeRegistration(teacherA, 'tb')).toBe(false);
    expect(canSeeRegistration(teacherA, 'ad')).toBe(false);
    expect(canSeeRegistration(teacherA, null)).toBe(false);
    expect(canSeeRegistration(teacherA, undefined)).toBe(false);
  });

  it('a teacher can never widen their view with scope=all', () => {
    expect(canSeeRegistration(teacherB, 'ta', 'all')).toBe(false);
    expect(canSeeRegistration(teacherB, null, 'all')).toBe(false);
  });

  it('an admin sees their own and anonymous (nobody signed in) registrations by default', () => {
    expect(canSeeRegistration(admin, 'ad')).toBe(true);
    expect(canSeeRegistration(admin, null)).toBe(true);
    expect(canSeeRegistration(admin, 'ta')).toBe(false);
    expect(canSeeRegistration(superAdmin, 'sa')).toBe(true);
    expect(canSeeRegistration(superAdmin, 'tb')).toBe(false);
  });

  it('an admin sees everything with scope=all', () => {
    expect(canSeeRegistration(admin, 'ta', 'all')).toBe(true);
    expect(canSeeRegistration(admin, 'tb', 'all')).toBe(true);
    expect(canSeeRegistration(admin, null, 'all')).toBe(true);
  });

  it('a teacher with no id sees nothing', () => {
    expect(canSeeRegistration({ id: null, role: 'teacher' }, null)).toBe(false);
  });

  it('unknown roles see nothing', () => {
    expect(canSeeRegistration({ id: 'x', role: 'student' }, 'x')).toBe(false);
  });
});

describe('roles', () => {
  it('only admin and super_admin are admins', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('teacher')).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
    expect(isAdminRole('')).toBe(false);
  });

  it('isTeacher is true only for teachers', () => {
    expect(isTeacher(teacherA)).toBe(true);
    expect(isTeacher(admin)).toBe(false);
    expect(isTeacher(null)).toBe(false);
  });
});
