import { NextResponse } from 'next/server';
import { readTelemetrySnapshot } from '@/lib/routerAdapter';

/**
 * GET /api/telemetry
 *
 * Returns the live 9Router snapshot, or `connected: false` when the local
 * instance is unreachable so the client can drop back to Simulation Mode.
 *
 * Runs on the Node runtime (reads the local SQLite file) and is never cached —
 * `cache-control: no-store` is set on both the success and failure responses.
 */
export async function GET() {
  try {
    const snapshot = await readTelemetrySnapshot();
    return NextResponse.json(
      { connected: true, ...snapshot },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        agents: [],
        error: error instanceof Error ? error.message : 'Unknown telemetry error',
        readAt: Date.now(),
      },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}
