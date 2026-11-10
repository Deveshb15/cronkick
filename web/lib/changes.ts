import pg from 'pg';

// One LISTEN connection per web server, fanned out to the open dashboard streams of each installation.
// Postgres sends every notification to every listening server, so this works behind the load balancer.
type Listener = () => void;
type State = { subs: Map<number, Set<Listener>>; client: Promise<pg.Client> | null };
const g = globalThis as unknown as { cronkickChanges?: State };
const state: State = (g.cronkickChanges ??= { subs: new Map<number, Set<Listener>>(), client: null });

const everyone = () => state.subs.forEach((set) => set.forEach((fn) => fn()));

function listen(): Promise<pg.Client> {
  if (state.client) return state.client;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const p: Promise<pg.Client> = c.connect().then(() => c.query('LISTEN cronkick_changes')).then(() => c);
  const lost = () => {
    if (state.client !== p) return;
    state.client = null;
    c.end().catch(() => {});
    // Reconnect while anyone is watching, then nudge them all: notifications sent during the gap are gone.
    setTimeout(() => { if (state.subs.size) listen().then(everyone, () => {}); }, 2000);
  };
  c.on('notification', (n) => state.subs.get(Number(n.payload))?.forEach((fn) => fn()));
  c.on('error', lost);
  c.on('end', lost);
  p.catch(lost);
  return (state.client = p);
}

/** Call `fn` whenever installation `id` changes. Returns the unsubscribe function. */
export async function subscribe(id: number, fn: Listener): Promise<() => void> {
  await listen();
  const set = state.subs.get(id) ?? new Set<Listener>();
  state.subs.set(id, set.add(fn));
  return () => {
    set.delete(fn);
    if (!set.size) state.subs.delete(id);
  };
}
