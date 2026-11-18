'use client';

import { useAgentStore } from '@/store/useAgentStore';
import { playClick } from '@/lib/audio';
import { STATUS_META } from '@/lib/agents';
import { cn } from '@/lib/format';

/**
 * Provider roster for the simulation panel.
 *
 * Picking a row only moves `selectedAgentId`; every mood trigger reads that
 * selection, so this list is the panel's "who am I talking to" control.
 *
 * No height cap: every provider in the office must be reachable without a
 * nested scroll, and the panel already scrolls as a whole.
 */
export function ProviderPicker() {
  const agents = useAgentStore((s) => s.agents);
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);

  return (
    <section aria-label="Pilih provider" className="min-w-0">
      <p className="mb-2 text-[11px] font-bold tracking-wide text-ink-dim uppercase">
        Pilih provider
      </p>
      <div className="grid gap-1">
        {agents.map((agent) => {
          const meta = STATUS_META[agent.status];
          const isSelected = agent.id === selectedAgentId;
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                selectAgent(agent.id);
                playClick();
              }}
              aria-pressed={isSelected}
              className={cn(
                'flex min-h-8 cursor-pointer items-center gap-2 rounded-xl border-2 px-2 py-1 text-left transition-colors',
                isSelected
                  ? 'border-card-border bg-card-soft'
                  : 'border-transparent hover:bg-card-soft/70',
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-md"
                style={{ backgroundColor: agent.accentColor }}
                aria-hidden
              />
              <span className="truncate text-[11px] font-bold text-ink-strong">{agent.name}</span>
              <span
                className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold tracking-wide uppercase"
                style={{ color: meta.color, backgroundColor: `${meta.color}1f` }}
              >
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
