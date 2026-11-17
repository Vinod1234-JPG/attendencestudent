import { describe, it, expect } from 'vitest';
import { emitRegistration, onRegistration, type LiveRegistration } from './live-bus';

const sample = (name: string): LiveRegistration => ({
  attendeeId: 'id-' + name,
  name,
  college: 'MIT Mysore',
  photoUrl: '/p.jpg',
  capturedAt: new Date().toISOString(),
});

describe('live registration bus', () => {
  it('delivers each registration to every subscriber', () => {
    const a: string[] = [];
    const b: string[] = [];
    const offA = onRegistration((r) => a.push(r.name));
    const offB = onRegistration((r) => b.push(r.name));
    emitRegistration(sample('Asha'));
    emitRegistration(sample('Ravi'));
    offA();
    offB();
    expect(a).toEqual(['Asha', 'Ravi']);
    expect(b).toEqual(['Asha', 'Ravi']);
  });

  it('stops delivering after unsubscribe', () => {
    const got: string[] = [];
    const off = onRegistration((r) => got.push(r.name));
    emitRegistration(sample('One'));
    off();
    emitRegistration(sample('Two'));
    expect(got).toEqual(['One']);
  });

  it('shares one bus across module reloads (globalThis singleton)', () => {
    const got: string[] = [];
    const off = onRegistration((r) => got.push(r.name));
    // a second import of the same module instance still reaches the same emitter
    emitRegistration(sample('Shared'));
    off();
    expect(got).toEqual(['Shared']);
  });

  it('never throws when nobody is listening', () => {
    expect(() => emitRegistration(sample('Nobody'))).not.toThrow();
  });
});
