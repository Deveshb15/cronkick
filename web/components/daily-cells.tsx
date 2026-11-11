'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { DayCell } from '@/lib/data';
import { plural } from '@/lib/live';

const COLOR: Record<DayCell['state'], string> = {
  ontime: 'bg-ontime', late: 'bg-late', waiting: 'tick-waiting', overdue: 'tick-overdue', unconfirmed: 'tick-unconfirmed', missed: 'bg-missed',
  empty: 'day-empty', none: 'day-none',
};
const label = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Everything known about one day, in words: the text equivalent of a cell. */
export function describeDay(d: DayCell): string {
  const c = d.c;
  if (d.state === 'none') return `${label(d.day)} · no records (before tracking started)`;
  const parts = [
    c.due ? `${plural(c.due, 'run')} due${d.today ? ' so far' : ''}` : `nothing due${d.today ? ' so far' : ''}`,
    c.onTime && `${c.onTime} on time`, c.late && `${c.late} late`, c.waiting && `${c.waiting} sending`, c.overdue && `${c.overdue} overdue`,
    c.unconfirmed && `${c.unconfirmed} unconfirmed`, c.refused + c.gaveUp && `${c.refused + c.gaveUp} not sent`,
    c.failed && `${plural(c.failed, 'GitHub run')} failed`, d.gap && 'Cronkick coverage gap',
  ].filter(Boolean);
  return `${label(d.day)} · ${parts.join(' · ')}`;
}

/**
 * Calendar days of one workflow, oldest to newest: one cell per day coloured by its worst dispatch outcome, a red
 * corner for failed GitHub runs, a dashed edge for a coverage gap. One tab stop: arrow keys (or the buttons on touch)
 * pick a day; the panel underneath says everything about it and opens that day's history.
 */
export function DailyCells({ cells, href, keep = '', height = 'h-8', selected }: {
  cells: DayCell[]; href: string; height?: string;
  /** The day to start on (the one the page shows); today otherwise. */
  selected?: string;
  /** Query to carry into the day's history (range, filter), e.g. "range=30d&filter=late". */
  keep?: string;
}) {
  // Kept by date, not position: a shorter range or a new day keeps the same date selected, or falls back to today.
  const [selDay, setSelDay] = useState<string | null>(selected ?? null);
  const found = cells.findIndex((c) => c.day === selDay);
  const pick = found >= 0 ? found : cells.length - 1;
  const d = cells[pick];
  const move = (i: number) => setSelDay(cells[Math.min(Math.max(i, 0), cells.length - 1)].day);
  const open = useRef<HTMLAnchorElement>(null);
  // Up to 30 a row, so 90 days stay tappable on a phone (three rows of a month each).
  const wide = cells.length > 30;
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); open.current?.click(); return; }
    const to = { ArrowLeft: pick - 1, ArrowRight: pick + 1, Home: 0, End: cells.length - 1, ...(wide && { ArrowUp: pick - 30, ArrowDown: pick + 30 }) }[e.key];
    if (to !== undefined) { e.preventDefault(); move(to); }
  };
  const id = `days-${href.replace(/\W/g, '')}`;
  return (
    <div>
      <div role="listbox" tabIndex={0} onKeyDown={key} aria-activedescendant={`${id}-${pick}`}
        aria-label={`Daily dispatch, last ${cells.length} days. Arrow keys pick a day; Enter opens it.`}
        className={wide ? 'grid grid-cols-[repeat(30,minmax(0,1fr))] gap-[3px] rounded-sm *:h-6' : `flex gap-1 rounded-sm ${height}`}>
        {cells.map((c, i) => (
          <span key={c.day} id={`${id}-${i}`} role="option" aria-selected={i === pick} aria-label={describeDay(c)} title={describeDay(c)}
            onClick={() => move(i)}
            className={`relative ${wide ? '' : 'flex-1'} cursor-pointer rounded-[3px] ${COLOR[c.state]} ${c.gap ? 'day-gap' : ''} ${i === pick ? 'tick-selected' : ''}`}>
            {c.c.failed > 0 && <span aria-hidden="true" className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-red-400 ring-2 ring-ink" />}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]/5 text-zinc-300">
        <span className="flex gap-1">
          <button type="button" onClick={() => move(pick - 1)} disabled={pick === 0} aria-label="Previous day"
            className="inline-flex size-11 items-center justify-center rounded-lg bg-white/5 inset-ring inset-ring-white/10 hover:bg-white/10 disabled:opacity-40 sm:size-7">‹</button>
          <button type="button" onClick={() => move(pick + 1)} disabled={pick === cells.length - 1} aria-label="Next day"
            className="inline-flex size-11 items-center justify-center rounded-lg bg-white/5 inset-ring inset-ring-white/10 hover:bg-white/10 disabled:opacity-40 sm:size-7">›</button>
        </span>
        <span className="tabular-nums">{describeDay(d)}</span>
        {(d.state !== 'none' || d.gap) && (
          <a ref={open} href={`${href}?${keep ? `${keep}&` : ''}day=${d.day}#history`} className="inline-flex min-h-11 items-center font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white sm:min-h-0">Open this day</a>
        )}
      </div>
    </div>
  );
}
