'use client';
import { useEffect, useState } from 'react';
import type { SlotView, Tick } from '@/lib/data';
import { fmtDelay } from '@/lib/live';
import { SLOT_LABEL } from './ui';
import { localTime, useArrivals } from './live';

const COLOR: Record<Tick, string> = { ontime: 'bg-ontime', late: 'bg-late', missed: 'bg-missed', idle: 'tick-skip' };
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
  useEffect(() => setMounted(true), []);
  const shown = slots.slice(-(positions - (next ? 1 : 0)));
  const empty = positions - shown.length - (next ? 1 : 0);
  const tip = (s: SlotView) => [mounted ? localTime(s.due) : `${s.due.slice(11, 16)} UTC`, `${SLOT_LABEL[s.state] ?? s.state} ${s.delayMs !== null ? fmtDelay(s.delayMs) : ''}`.trim(), job(s.conclusion)].filter(Boolean).join(' · ');
  const select = (id: number) => {
    const row = document.getElementById(`slot-${id}`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('row-flash');
    void row.offsetWidth;
    row.classList.add('row-flash');
  };
  const summary = `${shown.filter((s) => s.tick === 'ontime').length} of ${shown.length} recent slots on time`;
  return (
    <div role="img" aria-label={summary} className={`flex items-stretch gap-[3px] ${height}`}>
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
  );
}
