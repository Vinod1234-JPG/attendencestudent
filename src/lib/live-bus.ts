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
}

const EVENT = 'registration.created';
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

/** Subscribes to new registrations. Returns an unsubscribe function. */
export function onRegistration(listener: (registration: LiveRegistration) => void): () => void {
  bus().on(EVENT, listener);
  return () => {
    bus().off(EVENT, listener);
  };
}
