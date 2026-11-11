'use client';
import { useEffect, useState } from 'react';
import type { SlotView, Tick } from '@/lib/data';
import { fmtDelay } from '@/lib/live';
import { SLOT_LABEL } from './ui';
import { localTime, useArrivals } from './live';

const COLOR: Record<Tick, string> = {
  ontime: 'bg-ontime', late: 'bg-late', waiting: 'tick-waiting', overdue: 'tick-overdue', unconfirmed: 'tick-unconfirmed', missed: 'bg-missed', idle: 'tick-skip',
};
// Same words as the overview legend.
const WORD: Record<Tick, string> = {
  ontime: 'on time', late: 'late', waiting: 'sending', overdue: 'overdue', unconfirmed: 'unconfirmed', missed: 'refused or gave up', idle: 'skipped',
};
/** "+0.4 s" from the send; "tried +0.4 s" for a row that was tried but never confirmed sent. */
const delay = (s: SlotView) => (s.sendDelayMs !== null ? fmtDelay(s.sendDelayMs) : s.triedDelayMs !== null ? `tried ${fmtDelay(s.triedDelayMs)}` : '');
const job = (c: string | null) => (c === 'success' ? 'job passed' : c ? `job ${c}` : '');

/**
 * Real slots only, right-aligned in `positions` places: a dashed track for the time before tracking started, then one
 * tick per slot (hover for details), then an outlined tick for the next one. Slots that arrive later grow in once.
 */
export function LiveStrip({ slots, positions = 48, next = false, height = 'h-7', linkRows = false }: {
  slots: SlotView[]; positions?: number; next?: boolean; height?: string; linkRows?: boolean;
}) {
  const fresh = useArrivals(slots.map((s) => s.id));
  const [mounted, setMounted] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (!missing) return; const t = setTimeout(() => setMissing(false), 5000); return () => clearTimeout(t); }, [missing]);
  const shown = slots.slice(-(positions - (next ? 1 : 0)));
  const empty = positions - shown.length - (next ? 1 : 0);
  const tip = (s: SlotView) => [mounted ? localTime(s.due) : `${s.due.slice(11, 16)} UTC`, `${SLOT_LABEL[s.display] ?? s.display} ${delay(s)}`.trim(), job(s.conclusion)].filter(Boolean).join(' · ');
  const select = (id: number) => {
    const row = document.getElementById(`slot-${id}`);
    setMissing(!row);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('row-flash');
    void row.offsetWidth;
    row.classList.add('row-flash');
  };
  const parts = (Object.keys(WORD) as Tick[]).flatMap((t) => { const n = shown.filter((s) => s.tick === t).length; return n ? [`${n} ${WORD[t]}`] : []; });
  const summary = `Last ${shown.length} recorded times: ${parts.join(', ') || 'none yet'}`;
  return (
    <>
      {/* 96 ticks don't fit a phone with 3 px gaps; tighten them on small screens. */}
      <div role="img" aria-label={summary} className={`flex items-stretch ${positions > 60 ? 'gap-px sm:gap-[3px]' : 'gap-[3px]'} ${height}`}>
        {empty > 0 && <span aria-hidden="true" className="tick-track" style={{ flex: empty }} title="Before Cronkick started tracking this schedule" />}
        {shown.map((s) => (
          <span
            key={s.id}
            data-tip={tip(s)}
            onClick={linkRows ? () => select(s.id) : undefined}
            className={`tip tick ${COLOR[s.tick]} ${fresh.has(s.id) ? 'tick-new' : ''} ${linkRows ? 'cursor-pointer' : ''}`}
          />
        ))}
        {next && <span aria-hidden="true" className="tick tick-next" title="Next scheduled time" />}
      </div>
      {linkRows && <p role="status" className="text-xs/5 text-brand-300">{missing && <span className="mt-2 block">That run isn’t in the history below: it’s filtered out, on an older page, or outside your plan’s history. Choose All or Load older.</span>}</p>}
    </>
  );
}
