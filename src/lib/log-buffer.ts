import esClient, { INDEX_NAME, ensureIndex } from "./elasticsearch";
import { Log } from "@/types/log";

/**
 * WHY _bulk?
 *
 * Elasticsearch's _bulk API is the recommended way to index many documents.
 * Instead of one HTTP round-trip per log, we send N logs in a single request.
 * This dramatically reduces network overhead and ES write queue pressure.
 *
 * At even higher scales (millions of logs/min), you'd place a message queue
 * (Kafka, Redis Streams) in front of this layer so the ingestor never blocks
 * on ES write latency. For this system, direct _bulk writes are fast enough.
 *
 * RELIABILITY NOTE:
 * We chose direct _bulk writes over a timer-based in-memory buffer because
 * Next.js App Router does not guarantee that async work (setTimeout callbacks)
 * continues after an HTTP response is sent. Direct writes are simpler and
 * fully reliable.
 */

let indexReady = false;

async function ensureIndexReady(): Promise<void> {
  if (indexReady) return;
  await ensureIndex();
  indexReady = true;
}

export interface BulkWriteError {
  index: number;        // position of the failed log in the input array
  log: Log;             // the original log document that failed
  reason: string;       // ES error reason string
  type: string;         // ES error type (e.g. "mapper_parsing_exception")
}

export interface BulkWriteResult {
  ingested: number;
  failed: number;
  errors: BulkWriteError[];
}

/**
 * Write one or many logs to Elasticsearch using the _bulk API.
 *
 * WHY WE PARSE THE BULK RESPONSE ITEM BY ITEM:
 * The _bulk API returns HTTP 200 even when some documents fail to index.
 * The top-level `errors` boolean is true if ANY item failed, but to know
 * WHICH ones failed and WHY, you must inspect each item in `result.items`.
 * Each item maps 1:1 to the original input — item[0] = log[0], etc.
 *
 * Possible per-item failures:
 *   - mapper_parsing_exception  — field value doesn't match the mapping type
 *   - document_missing_exception — document to update doesn't exist
 *   - cluster_block_exception   — index is read-only (e.g. disk watermark hit)
 *
 * We extract the failed items, log them server-side for observability,
 * and return a structured result so the HTTP layer can choose the right
 * status code (200 / 207 / 500).
 */
export async function writeLogs(logs: Log | Log[]): Promise<BulkWriteResult> {
  const logsArray = Array.isArray(logs) ? logs : [logs];

  await ensureIndexReady();

  // _bulk expects alternating action/document pairs:
  //   { index: { _index: "logs" } }
  //   { level: "error", message: "...", ... }
  const operations = logsArray.flatMap((log) => [
    { index: { _index: INDEX_NAME } },
    log,
  ]);

  const result = await esClient.bulk({ operations, refresh: false });

  // Fast path — no failures
  if (!result.errors) {
    return { ingested: logsArray.length, failed: 0, errors: [] };
  }

  // Slow path — at least one item failed. Walk result.items (parallel array
  // to logsArray) and collect failures with their reasons.
  const errors: BulkWriteError[] = [];

  result.items.forEach((item, i) => {
    const action = item.index;
    if (action?.error) {
      errors.push({
        index: i,
        log: logsArray[i],
        reason: action.error.reason ?? "unknown reason",
        type: action.error.type ?? "unknown_error",
      });

      // Server-side logging for observability — visible in server logs / Vercel logs
      console.error(
        `[ingest] Document ${i} failed — type: ${action.error.type}, reason: ${action.error.reason}`,
        { log: logsArray[i] }
      );
    }
  });

  const ingested = logsArray.length - errors.length;
  console.warn(`[ingest] Bulk partial failure: ${ingested} indexed, ${errors.length} failed`);

  return { ingested, failed: errors.length, errors };
}
