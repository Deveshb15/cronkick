'use client';
import { useEffect, useRef, useState } from 'react';
import { countdown, newIds, tzAbbrev } from '@/lib/live';

/** Current time, ticking every second in the browser. null during server render and the first client render. */
export function useNow(everyMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

/** Ids that arrived since the last render. Empty on the first render, so loads and reloads never animate. */
export function useArrivals(ids: number[]): Set<number> {
  const seen = useRef(new Set<number>());
  const first = useRef(true);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const key = ids.join(',');
  useEffect(() => {
    const f = newIds(seen.current, ids, first.current);
    first.current = false;
    if (f.length) setFresh(new Set(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return fresh;
}

const hm = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
const md = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
const utcHm = (iso: string) => `${iso.slice(11, 16)} UTC`;
/** "21:45" today, "Nov 8 21:45" otherwise, in the viewer's time zone. */
export function localTime(iso: string): string {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toDateString() === new Date().toDateString() ? hm : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hm}`;
}

/**
 * A timestamp in local time, with UTC on hover; `zone` adds the time zone's short name ("13:30 IST").
 * Renders UTC until mounted, so server and client markup match.
 */
export function Time({ iso, className = '', zone = false, clock = false, date = false }: { iso: string; className?: string; zone?: boolean; clock?: boolean; date?: boolean }) {
  const [text, setText] = useState(utcHm(iso));
  // `clock`: just "21:45", for rows that already sit under a day header.
  useEffect(() => {
    // `date`: always "Nov 11 13:30", even today (for ranges).
    const t = clock ? hm(new Date(iso)) : date ? `${md(new Date(iso))} ${hm(new Date(iso))}` : localTime(iso);
    setText(zone ? `${t} ${tzAbbrev(undefined, new Date(iso))}` : t);
  }, [iso, zone, clock, date]);
  return <time dateTime={iso} title={iso.replace('T', ' ').slice(0, 19) + ' UTC'} className={className}>{text}</time>;
}

/** "Nov 11, 07:19–07:59 IST" in the viewer's time zone (UTC until mounted). */
export function TimeRange({ start, end, className = '' }: { start: string; end: string; className?: string }) {
  const [text, setText] = useState(`${start.slice(11, 16)}–${end.slice(11, 16)} UTC`);
  useEffect(() => {
    const [s, e] = [new Date(start), new Date(end)];
    setText(`${md(s)}, ${hm(s)}–${s.toDateString() === e.toDateString() ? '' : `${md(e)}, `}${hm(e)} ${tzAbbrev(undefined, s)}`);
  }, [start, end]);
  return <time dateTime={start} className={className}>{text}</time>;
}

/** The viewer's time zone short name, e.g. "IST". "UTC" until mounted. */
export function Zone() {
  const [z, setZ] = useState('UTC');
  useEffect(() => setZ(tzAbbrev()), []);
  return <>{z}</>;
}

/** How long until `to` (ISO), in words: "in 4 min", "now". Ticks every second; empty during server render. */
export function Countdown({ to, className = '' }: { to: string; className?: string }) {
  const now = useNow();
  return <span className={`tabular-nums ${className}`}>{now === null ? '' : countdown(new Date(to).getTime() - now)}</span>;
}

/** Copies `text` and says so for 1.5 s. */
export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); });
  return <button type="button" onClick={copy} className={className}>{done ? 'Copied ✓' : label}<span className="sr-only" aria-live="polite">{done ? ' copied to clipboard' : ''}</span></button>;
}
