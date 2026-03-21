import { NextRequest, NextResponse } from "next/server";
import { writeLogs } from "@/lib/log-buffer";
import { Log } from "@/types/log";

/**
 * POST /api/ingest
 *
 * Accepts a single log object OR an array of log objects.
 * Uses Elasticsearch's _bulk API for efficient batch writes.
 *
 * Example (single):
 *   curl -X POST http://localhost:3000/api/ingest \
 *     -H "Content-Type: application/json" \
 *     -d '{"level":"error","message":"DB down","resourceId":"server-1","timestamp":"2023-09-15T08:00:00Z","traceId":"abc","spanId":"span-1","commit":"abc123","metadata":{"parentResourceId":"server-0"}}'
 *
 * Example (batch):
 *   curl -X POST http://localhost:3000/api/ingest \
 *     -H "Content-Type: application/json" \
 *     -d '[{"level":"info","message":"Started","resourceId":"server-1","timestamp":"2023-09-15T08:00:00Z","traceId":"t1","spanId":"s1","commit":"abc","metadata":{"parentResourceId":"p1"}}, ...]'
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const logs: Log[] = Array.isArray(body) ? body : [body];

    if (logs.length === 0) {
      return NextResponse.json({ error: "No logs provided" }, { status: 400 });
    }

    // Validate required fields
    for (const log of logs) {
      if (!log.level || !log.message || !log.timestamp) {
        return NextResponse.json(
          {
            error: "Each log must have: level, message, timestamp",
            received: log,
          },
          { status: 400 }
        );
      }
    }

    const { indexed } = await writeLogs(logs);

    return NextResponse.json(
      { accepted: indexed, message: `${indexed} log(s) indexed successfully` },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
