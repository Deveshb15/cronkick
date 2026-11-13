'use client';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CoverageGap, SlotView, Tick } from '@/lib/data';
import { fmtDelay, gapMarks } from '@/lib/live';
import { SLOT_LABEL } from './ui';
import { localTime, useArrivals } from './live';

export const COLOR: Record<Tick, string> = {
  ontime: 'bg-ontime', late: 'bg-late', waiting: 'tick-waiting', overdue: 'tick-overdue', unconfirmed: 'tick-unconfirmed', missed: 'bg-missed', idle: 'tick-skip',
};
// Same words as the status key.
export const WORD: Record<Tick, string> = {
  ontime: 'on time', late: 'late', waiting: 'sending', overdue: 'overdue', unconfirmed: 'unconfirmed', missed: 'refused or gave up', idle: 'skipped',
};
/** "+0.4 s" for a sent run; "—" when nothing was sent. */
const delay = (s: SlotView) => (s.sendDelayMs !== null ? `sent ${fmtDelay(s.sendDelayMs)}${s.tick === 'late' ? ' (late)' : ''}` : '');
const job = (c: string | null) => (c === 'success' ? 'run passed' : c ? `run ${c.replace('_', ' ')}` : '');
/**
 * The last runs of one schedule, oldest to newest, right-aligned in `positions` places. A dashed track fills the time
 * before tracking started; a hatched divider marks a Cronkick coverage gap between two runs (the strip counts runs, not
 * time, so a gap is a boundary, not a width). New runs grow in once.
 *
 * Read-only by default (an image with a text summary). `interactive` makes it one tab stop: arrow keys, Home and End
 * pick a run, and the panel underneath says what happened and links to it in the history.
 */
export function LiveStrip({ slots, positions = 48, height = 'h-7', gaps = [], interactive = false, label = 'runs', historyHref = '', keep = '' }: {
  slots: SlotView[]; positions?: number; height?: string; gaps?: CoverageGap[]; interactive?: boolean; label?: string;
  /** The workflow page, when the strip isn't on it; "Open in history" then goes there. */
  historyHref?: string;
  /** Query to keep when jumping to a run (the analysis range); a day filter is dropped on purpose, the run may be on another day. */
  keep?: string;
}) {
  const open = useRef<HTMLAnchorElement>(null);
  const fresh = useArrivals(slots.map((s) => s.id));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shown = slots.slice(-positions);
  // Keyed by run id, so a run arriving live doesn't silently move the selection. Starts on the newest.
  const [selId, setSelId] = useState<number | null>(null);
  const found = shown.findIndex((x) => x.id === selId);
  const pick = found >= 0 ? found : shown.length - 1;
  const setSel = (i: number) => setSelId(shown[Math.min(Math.max(i, 0), shown.length - 1)]?.id ?? null);
  const empty = positions - shown.length;
  const tip = (s: SlotView) => [mounted ? localTime(s.due) : `${s.due.slice(11, 16)} UTC`, SLOT_LABEL[s.display] ?? s.display, delay(s), job(s.conclusion)].filter(Boolean).join(' · ');
  const parts = (Object.keys(WORD) as Tick[]).flatMap((t) => { const n = shown.filter((s) => s.tick === t).length; return n ? [`${n} ${WORD[t]}`] : []; });
  const summary = `Last ${shown.length} ${label}: ${parts.join(', ') || 'none yet'}`;

  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); open.current?.click(); return; }
    const to = { ArrowLeft: pick - 1, ArrowRight: pick + 1, Home: 0, End: shown.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setSel(to);
  };
  const s = shown[pick];
  const marks = gapMarks(shown, gaps);

  return (
    <div>
      <div
        {...(interactive && shown.length
          ? { role: 'listbox', tabIndex: 0, 'aria-label': `${summary}. Arrow keys pick a run; Enter opens it in the history.`, 'aria-activedescendant': `tick-${s.id}`, onKeyDown: key }
          : { role: 'img', 'aria-label': summary })}
        className={`flex items-stretch rounded-sm ${positions > 60 ? 'gap-px sm:gap-[3px]' : 'gap-[3px]'} ${height}`}
      >
        {empty > 0 && <span aria-hidden="true" className="tick-track" style={{ flex: empty }} title="Before Cronkick started tracking this schedule" />}
        {shown.map((x, i) => (
          <Fragment key={x.id}>
            {marks.has(i) && <span aria-hidden="true" className="tick-gap" data-tip="Coverage gap: runs due here may not have been sent" />}
            <span
              id={interactive ? `tick-${x.id}` : undefined}
              role={interactive ? 'option' : undefined}
              aria-selected={interactive ? i === pick : undefined}
              aria-label={interactive ? tip(x) : undefined}
              data-tip={interactive ? tip(x) : undefined}
              onClick={interactive ? () => setSel(i) : undefined}
              className={`${interactive ? 'tip' : ''} tick ${COLOR[x.tick]} ${fresh.has(x.id) ? 'tick-new' : ''} ${interactive ? 'cursor-pointer' : ''} ${interactive && i === pick ? 'tick-selected' : ''}`}
            />
          </Fragment>
        ))}
      </div>
      {interactive && s && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm/6 text-zinc-300">
          {/* Ticks are a few pixels wide: on touch screens these step through them instead. */}
          <span className="flex gap-1">
            <button type="button" onClick={() => setSel(Math.max(pick - 1, 0))} disabled={pick === 0} aria-label="Previous run"
              className="inline-flex size-11 items-center justify-center rounded-lg bg-white/5 inset-ring inset-ring-white/10 hover:bg-white/10 disabled:opacity-40 sm:size-8">‹</button>
            <button type="button" onClick={() => setSel(Math.min(pick + 1, shown.length - 1))} disabled={pick === shown.length - 1} aria-label="Next run"
              className="inline-flex size-11 items-center justify-center rounded-lg bg-white/5 inset-ring inset-ring-white/10 hover:bg-white/10 disabled:opacity-40 sm:size-8">›</button>
          </span>
          <p className="flex flex-wrap items-center gap-x-2">
          <span className="text-zinc-400">Selected</span>
          <span className="tabular-nums">{tip(s)}</span>
          <a ref={open} href={`${historyHref}?${keep ? `${keep}&` : ''}before=${encodeURIComponent(new Date(Date.parse(s.due) + 1).toISOString())}#slot-${s.id}`}
            onClick={(e) => {
              const row = document.getElementById(`slot-${s.id}`);
              if (!row) return; // not on this page: follow the link to the page that starts with it
              e.preventDefault();
              history.replaceState(null, '', `#slot-${s.id}`);
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            }}
            className="inline-flex min-h-11 items-center font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white sm:min-h-0">Open in history</a>
          </p>
        </div>
      )}
    </div>
  );
}
