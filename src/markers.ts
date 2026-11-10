import { Lexer } from 'yaml';
import { CronExpressionParser } from 'cron-parser';

export type Marker = { cron: string; tz: string; line: number };
export type Flag = { line?: number; message: string };

// yaml Lexer control tokens that are not part of the source text.
const CONTROL = new Set(['\x02', '\x18', '\x1f', '\u{FEFF}']);
const MARKER = /^#\s*cronkick:\s*"([^"]*)"(?:\s+tz=(\S+))?\s*$/;

export function validTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function validCron(cron: string): boolean {
  if (cron.trim().split(/\s+/).length !== 5) return false;
  try {
    CronExpressionParser.parse(cron);
    return true;
  } catch {
    return false;
  }
}

/** Read `# cronkick: "<cron>" [tz=<IANA>]` comments. Comments inside block strings are not comments, so they're ignored. */
export function parseMarkers(text: string): { markers: Marker[]; flags: Flag[] } {
  const markers: Marker[] = [];
  const flags: Flag[] = [];
  let offset = 0;
  for (const token of new Lexer().lex(text)) {
    if (CONTROL.has(token)) continue;
    if (token.startsWith('#') && /^#\s*cronkick\b/.test(token)) {
      const line = text.slice(0, offset).split('\n').length;
      const m = MARKER.exec(token);
      if (!m) flags.push({ line, message: `Line ${line}: write the marker as # cronkick: "<5-field cron>" [tz=<IANA timezone>]` });
      else if (!validCron(m[1])) flags.push({ line, message: `Line ${line}: "${m[1]}" is not a valid 5-field cron expression` });
      else if (m[2] && !validTz(m[2])) flags.push({ line, message: `Line ${line}: "${m[2]}" is not an IANA timezone (e.g. Europe/Berlin)` });
      else markers.push({ cron: m[1].trim().replace(/\s+/g, ' '), tz: m[2] ?? 'UTC', line });
    }
    offset += token.length;
  }
  return { markers, flags };
}
