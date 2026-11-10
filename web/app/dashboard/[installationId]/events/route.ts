import { subscribe } from '@/lib/changes';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const enc = new TextEncoder();

/** Server-Sent Events: one `change` message each time this installation's data changes. */
export async function GET(req: Request, { params }: { params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await getSession();
  if (!s?.installs.includes(id)) return new Response(null, { status: 401 });

  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => { ctl = c; }, cancel: () => close() });
  let open = true;
  let unsubscribe = () => {};
  let beat: ReturnType<typeof setInterval> | undefined;
  let expire: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (!open) return;
    open = false;
    clearInterval(beat);
    clearTimeout(expire);
    unsubscribe();
    try { ctl.close(); } catch {}
  };
  const send = (chunk: string) => {
    if (!open) return;
    try { ctl.enqueue(enc.encode(chunk)); } catch { close(); }
  };

  try {
    unsubscribe = await subscribe(id, () => send('data: change\n\n'));
  } catch {
    close();
    return new Response(null, { status: 503 });
  }
  send('retry: 3000\n\n');
  // Comments keep the load balancer (60 s idle timeout) and Cloudflare from cutting a quiet stream.
  beat = setInterval(() => send(': ping\n\n'), 25_000);
  // End with the session, so the browser reconnects and is checked again.
  expire = setTimeout(close, Math.max(0, s.exp - Date.now()));
  req.signal.addEventListener('abort', close);

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
