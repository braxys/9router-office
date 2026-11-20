'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/store/useAgentStore';
import { acceptsLive } from '@/lib/transport';
import type { AgentTelemetry } from '@/lib/types';

/** How often the browser asks the server for a fresh snapshot. */
const POLL_MS = 1_500;

interface TelemetryResponse {
  connected: boolean;
  agents?: AgentTelemetry[];
  error?: string;
}

/**
 * Keeps the Zustand store in sync with the local 9Router instance.
 *
 * Mode ownership:
 *   first successful poll   -> live owns the robots (simulation OFF)
 *   user starts simulation  -> live polls stop applying until the user leaves
 *   9Router goes away       -> simulation ON automatically
 *   9Router comes back      -> simulation OFF again, unless the user had
 *                              already chosen simulation before the outage
 *
 * A manual trigger switches simulation on (see `triggerMood` in the store), so
 * the next poll cannot erase a demo mid-performance.
 *
 * Mounted once from `CommandCenter`; renders nothing.
 */
export function TelemetryBridge() {
  const applyLiveTelemetry = useAgentStore((s) => s.applyLiveTelemetry);
  const setSimulationMode = useAgentStore((s) => s.setSimulationMode);
  const clearErrors = useAgentStore((s) => s.clearErrors);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Local to one mount: no React state, no extra renders.
    let firstPoll = true;
    // True only when this bridge paused the feed because 9Router vanished.
    let autoPaused = false;

    const handleConnected = (agents: AgentTelemetry[]) => {
      if (firstPoll || autoPaused) {
        autoPaused = false;
        // Claim the live source. Does not clear `paused`, so a frozen office
        // stays frozen even though the feed came back.
        setSimulationMode(false);
      }
      firstPoll = false;

      // A user-chosen demo or a paused office owns the roster; leave it alone.
      if (acceptsLive(useAgentStore.getState())) {
        applyLiveTelemetry(agents);
      }
    };

    const handleDisconnected = () => {
      firstPoll = false;
      // Only take over when the feed was actually live; a manual demo stays.
      if (acceptsLive(useAgentStore.getState())) {
        autoPaused = true;
        // The roster is kept so the office does not go blank, but its failure
        // text came from a database we can no longer read. Simulation keeps an
        // ERROR robot in ERROR (that is a deliberate demo), so without this a
        // live bubble would sit there for the rest of the session.
        clearErrors();
        // Fall back to the mock source. This deliberately leaves `paused`
        // alone: if the user froze the office, a failed poll must not restart it.
        setSimulationMode(true);
      }
    };

    const poll = async () => {
      // Pause while the tab is hidden — nothing to update off-screen.
      if (!document.hidden) {
        try {
          const response = await fetch('/api/telemetry', { cache: 'no-store' });
          const payload = (await response.json()) as TelemetryResponse;
          if (cancelled) return;

          if (payload.connected && payload.agents?.length) {
            handleConnected(payload.agents);
          } else {
            handleDisconnected();
          }
        } catch {
          if (!cancelled) handleDisconnected();
        }
      }

      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [applyLiveTelemetry, clearErrors, setSimulationMode]);

  return null;
}
