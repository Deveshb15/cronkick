import type { Engine } from '../../src/recipes.ts';
import { CopyButton } from './docs-nav';
import { Badge } from './ui';

export const ENGINE: Record<Engine, string> = { claude: 'Claude Code', codex: 'Codex' };

export function EngineBadge({ engine }: { engine: Engine }) {
  return <Badge>{ENGINE[engine]}</Badge>;
}

/** The four steps every recipe run takes, numbered like the home page's "How it works". */
export function RunSteps({ output, className = '' }: { output: string; className?: string }) {
  const steps: [string, string][] = [
    ['Checks first', 'A shell step looks for something to do. A quiet day skips the run and spends no tokens.'],
    ['Runs the agent', 'With a turn cap, a 30-minute timeout and only the tools it needs. It never pushes, labels or posts.'],
    ['Applies the result', `A plain shell step makes the change: ${output.charAt(0).toLowerCase()}${output.slice(1)}, tagged so the next run can see it.`],
    ['Sends a receipt', 'What it did, how many turns and what it cost, on that run in your Cronkick history.'],
  ];
  return (
    <ol role="list" className={`grid gap-x-8 gap-y-10 ${className}`}>
      {steps.map(([title, body], i) => (
        <li key={title} className="border-t border-white/10 pt-6">
          <p className="font-mono text-sm/6 text-zinc-500">{String(i + 1).padStart(2, '0')}</p>
          <h3 className="mt-2 text-base/7 font-semibold text-white">{title}</h3>
          <p className="mt-1 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">{body}</p>
        </li>
      ))}
    </ol>
  );
}

/** A workflow file in the same window frame as the home page's marker card; the marker line is highlighted. */
export function WorkflowFile({ filename, yaml }: { filename: string; yaml: string }) {
  const lines = yaml.replace(/\n$/, '').split('\n');
  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-950 inset-ring inset-ring-white/10">
      <div className="flex items-center gap-x-3 border-b border-white/5 py-2 pr-2 pl-4">
        <div aria-hidden="true" className="flex shrink-0 gap-x-1.5"><span className="size-2.5 rounded-full bg-white/10" /><span className="size-2.5 rounded-full bg-white/10" /><span className="size-2.5 rounded-full bg-white/10" /></div>
        <p className="min-w-0 flex-1 truncate font-mono text-sm/6 text-zinc-400 sm:text-xs/6">{filename}</p>
        <CopyButton text={yaml} />
      </div>
      <div className="overflow-x-auto py-4 font-mono text-[0.8125rem]/6 whitespace-pre text-zinc-300">
        <div className="w-max min-w-full">
          {lines.map((line, i) => {
            const marker = /^\s*#\s*cronkick:/.test(line);
            const comment = !marker && /^\s*#/.test(line);
            return (
              <div key={i} className={`flex pr-6 ${marker ? 'bg-brand-500/10 text-brand-300 shadow-[inset_2px_0_0_var(--color-brand-500)]' : comment ? 'text-zinc-500' : ''}`}>
                <span aria-hidden="true" className="w-12 shrink-0 pr-4 text-right text-zinc-700 select-none">{i + 1}</span>
                <span>{line || ' '}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
