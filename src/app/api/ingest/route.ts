import { NextRequest, NextResponse } from "next/server";
import { writeLogs } from "@/lib/log-buffer";
import { validateAndNormalize } from "@/lib/validate-log";
import { Log } from "@/types/log";
import esClient, { INDEX_NAME } from "@/lib/elasticsearch";

const MAX_PAYLOAD_BYTES = 1_000_000; // 1 MB

/**
 * POST /api/ingest
 *
 * Accepts a single log object OR an array of log objects.
 *
 * Optional query param:
 *   ?refresh=true  — call indices.refresh() after the bulk write so documents
 *                    are immediately searchable. Useful for evaluators and tests.
 *                    Omit in production — the default 5s refresh interval is
 *                    better for throughput.
 *
 * Validation (applied per-log for batches — bad logs are rejected individually,
 * valid ones are still ingested):
 *   - Payload size capped at 1 MB
 *   - level must be one of: error | warn | info | debug (normalised to lowercase)
 *   - message required, capped at 10,000 chars (truncated, not rejected)
 *   - timestamp must be a valid ISO 8601 string
 *   - string fields capped at 256 chars
 *   - unknown top-level fields are stripped silently
 *
 * Response shape: { ingested, failed, validationErrors, esErrors }
 */
export async function POST(request: NextRequest) {
  try {
    // --- 1MB payload guard (check raw body size before JSON parsing) ---
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        { error: `Payload exceeds 1MB limit (${MAX_PAYLOAD_BYTES} bytes)` },
        { status: 413 }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rawLogs: unknown[] = Array.isArray(body) ? body : [body];

    if (rawLogs.length === 0) {
      return NextResponse.json({ error: "No logs provided" }, { status: 400 });
    }

    // --- Per-log validation ---
    const validLogs: Log[] = [];
    const validationErrors: Array<{ index: number; errors: { field: string; message: string }[] }> = [];

    rawLogs.forEach((raw, i) => {
      const result = validateAndNormalize(raw);
      if (result.valid && result.log) {
        validLogs.push(result.log);
      } else {
        validationErrors.push({ index: i, errors: result.errors });
      }
    });

    // If every log in the batch failed validation, return 400 immediately
    if (validLogs.length === 0) {
      return NextResponse.json(
        {
          ingested: 0,
          failed: rawLogs.length,
          validationErrors,
          esErrors: [],
        },
        { status: 400 }
      );
    }

    // --- Write valid logs to ES ---
    const { ingested, failed: esFailed, errors: esErrors } = await writeLogs(validLogs);

    // Optional immediate refresh — only when explicitly requested.
    // Bypasses the 5s Elastic Cloud Serverless refresh interval so callers
    // can query immediately. Never do this by default — it adds ~50ms latency
    // and defeats the batching benefit of the refresh interval.
    const shouldRefresh = new URL(request.url).searchParams.get("refresh") === "true";
    if (shouldRefresh) {
      await esClient.indices.refresh({ index: INDEX_NAME });
    }

    const totalFailed = validationErrors.length + esFailed;

    const responseBody = {
      ingested,
      failed: totalFailed,
      validationErrors,
      esErrors,
    };

    if (totalFailed === 0) return NextResponse.json(responseBody, { status: 200 });
    if (ingested === 0) return NextResponse.json(responseBody, { status: 500 });
    return NextResponse.json(responseBody, { status: 207 }); // partial success
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
