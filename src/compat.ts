import { parse } from 'yaml';
import { parseMarkers, type Flag, type Marker } from './markers.ts';
import { minIntervalMinutes } from './slots.ts';

export type WorkflowCheck = { markers: Marker[]; flags: Flag[]; suggestedDiff: string | null };

type On = Record<string, any>;

function triggers(doc: any): On {
  const on = doc?.on;
  if (typeof on === 'string') return { [on]: null };
  if (Array.isArray(on)) return Object.fromEntries(on.map((k) => [k, null]));
  return on && typeof on === 'object' ? on : {};
}

/** Marker lines that reproduce a native `schedule:` block, keeping every cron and its timezone. */
export function importFromSchedule(on: On): string | null {
  const entries = Array.isArray(on.schedule) ? on.schedule : [];
  const lines = entries
    .filter((e: any) => typeof e?.cron === 'string')
    .map((e: any) => `# cronkick: "${e.cron}"${e.timezone ? ` tz=${e.timezone}` : ''}`);
  return lines.length ? lines.join('\n') : null;
}

/**
 * Everything that must be true before Cronkick turns a workflow on.
 * Any flag means the workflow is never activated silently.
 */
export function checkWorkflow(text: string, floorMinutes: number): WorkflowCheck {
  const { markers, flags } = parseMarkers(text);
  let doc: any;
  try {
    doc = parse(text);
  } catch (e) {
    // The parser quotes the offending source line after its first line, and an alias error names the alias; both are
    // the user's code, so neither is stored.
    const at = (e as { linePos?: { line: number; col: number }[] }).linePos?.[0];
    const first = (e as Error).message.split('\n')[0].replace(/:$/, '').replace(/^(Unresolved alias[^:]*):.*/, '$1');
    const where = at && !/at line \d+/.test(first) ? ` at line ${at.line}, column ${at.col}` : '';
    return { markers: [], flags: [{ line: at?.line, message: `The workflow file isn't valid YAML: ${first}${where}` }], suggestedDiff: null };
  }
  const on = triggers(doc);
  const suggestedDiff = importFromSchedule(on);
  if (!markers.length && !flags.length) return { markers, flags, suggestedDiff };

  if (!('workflow_dispatch' in on)) flags.push({ message: 'Add `workflow_dispatch:` under `on:` — Cronkick triggers the workflow through it.' });
  const inputs = on.workflow_dispatch?.inputs ?? {};
  for (const [name, input] of Object.entries<any>(inputs)) {
    if (input?.required && input.default === undefined) flags.push({ message: `The workflow_dispatch input "${name}" is required and has no default, so Cronkick can't trigger it.` });
  }
  if ('schedule' in on) flags.push({ message: 'Remove the native `schedule:` block, or GitHub and Cronkick will both run it.' });
  if (/github\.event\.schedule/.test(text)) flags.push({ message: '`github.event.schedule` is empty for dispatched runs. Remove or replace it.' });
  if (/event_name\s*[!=]=\s*['"]schedule['"]/.test(text)) flags.push({ message: "`github.event_name == 'schedule'` is false for dispatched runs; check for 'workflow_dispatch' too." });
  if (markers.length) {
    const gap = minIntervalMinutes(markers);
    if (gap < floorMinutes) flags.push({ message: `These schedules run every ${gap} min; your plan allows every ${floorMinutes} min or slower.` });
  }
  return { markers, flags, suggestedDiff };
}
