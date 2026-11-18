import { requireStaff } from '@/lib/auth/requireAdmin';
import { canSeeRegistration, isTeacher } from '@/lib/auth/staffScope';
import { onRegistration, onReset } from '@/lib/live-bus';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // serverless hosts end long streams; the browser reconnects automatically

/** Server-Sent Events: pushes each new student registration to the Live Display. */
export async function GET(request: Request) {
  const auth = await requireStaff();
  if (auth.response) return auth.response;
  const staff = auth.admin;
  const scope = new URL(request.url).searchParams.get('scope') === 'all' && !isTeacher(staff) ? 'all' : 'own';

  const encoder = new TextEncoder();
  let cleanup: () => void = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const unsubscribe = onRegistration((registration) => {
        // each teacher's display only receives the students that teacher registered
        if (!canSeeRegistration(staff, registration.ownerId, scope)) return;
        write(`event: registration\ndata: ${JSON.stringify(registration)}\n\n`);
      });
      const unsubscribeReset = onReset(() => write('event: reset\ndata: {}\n\n'));
      const ping = setInterval(() => write(': ping\n\n'), 15000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unsubscribe();
        unsubscribeReset();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener('abort', cleanup);
      write('retry: 2000\n');
      write('event: ready\ndata: {}\n\n');
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
