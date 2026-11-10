'use client';
import { useEffect, useRef, useState } from 'react';
import { countdown, newIds } from '@/lib/live';

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

const utcHm = (iso: string) => `${iso.slice(11, 16)} UTC`;
/** "21:45" today, "Nov 8 21:45" otherwise, in the viewer's time zone. */
export function localTime(iso: string): string {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toDateString() === new Date().toDateString() ? hm : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hm}`;
}

/** A timestamp in local time, with UTC on hover. Renders UTC until mounted, so server and client markup match. */
export function Time({ iso, className = '' }: { iso: string; className?: string }) {
  const [text, setText] = useState(utcHm(iso));
  useEffect(() => setText(localTime(iso)), [iso]);
  return <time dateTime={iso} title={iso.replace('T', ' ').slice(0, 19) + ' UTC'} className={className}>{text}</time>;
}

/** Counts down to `to` (ISO). Shows "Due now" at zero and never goes negative. */
export function Countdown({ to, className = '' }: { to: string; className?: string }) {
  const now = useNow();
  if (now === null) return <span className={`tabular-nums ${className}`}>--:--</span>;
  const c = countdown(new Date(to).getTime() - now);
  return <span className={`tabular-nums ${className}`}>{c.due ? 'Due now' : c.text}</span>;
}

/** A number that lifts in when it changes after the first render. */
export function Counter({ value }: { value: number | string }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (prev.current !== value) { prev.current = value; setBump((b) => b + 1); }
  }, [value]);
  return <span key={bump} className={bump ? 'inline-block animate-rise-sm' : undefined}>{value}</span>;
}
