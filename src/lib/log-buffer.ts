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

/**
 * Write one or many logs to Elasticsearch using the _bulk API.
 * Awaited directly in the ingest route so we know the write succeeded.
 */
export async function writeLogs(logs: Log | Log[]): Promise<{ indexed: number }> {
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

  if (result.errors) {
    const failed = result.items.filter((i) => i.index?.error).length;
    console.error(`[ingest] ${failed}/${logsArray.length} logs failed to index`);
  }

  return { indexed: logsArray.length };
}
