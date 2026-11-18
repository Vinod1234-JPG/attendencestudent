import { EventEmitter } from 'events';

/**
 * In-process publish/subscribe channel used by the Live Display.
 * Kept on `globalThis` so it survives dev-mode hot reloads and is shared by every route in the process.
 *
 * Note: this only reaches subscribers connected to the SAME server process. On serverless hosting
 * (e.g. Vercel) requests can be handled by different instances, so the Live Display page also does a
 * light safety poll of /api/admin/live/latest.
 */
export interface LiveRegistration {
  attendeeId: string;
  name: string;
  college: string;
  photoUrl: string;
  capturedAt: string;
  /** Who registered the student (admin or teacher id). null/undefined = nobody was signed in at the kiosk. */
  ownerId?: string | null;
}

const EVENT = 'registration.created';
const RESET_EVENT = 'registration.reset';
const g = globalThis as unknown as { __mitmLiveBus?: EventEmitter };

function bus(): EventEmitter {
  if (!g.__mitmLiveBus) {
    g.__mitmLiveBus = new EventEmitter();
    g.__mitmLiveBus.setMaxListeners(200);
  }
  return g.__mitmLiveBus;
}

export function emitRegistration(registration: LiveRegistration): void {
  try {
    bus().emit(EVENT, registration);
  } catch (err) {
    console.warn('[live-bus] emit failed:', err);
  }
}

/** Tells every Live Display that all data was removed so it can go back to the waiting screen. */
export function emitReset(): void {
  try {
    bus().emit(RESET_EVENT);
  } catch (err) {
    console.warn('[live-bus] reset emit failed:', err);
  }
}

export function onReset(listener: () => void): () => void {
  bus().on(RESET_EVENT, listener);
  return () => {
    bus().off(RESET_EVENT, listener);
  };
}

/** Subscribes to new registrations. Returns an unsubscribe function. */
export function onRegistration(listener: (registration: LiveRegistration) => void): () => void {
  bus().on(EVENT, listener);
  return () => {
    bus().off(EVENT, listener);
  };
}
