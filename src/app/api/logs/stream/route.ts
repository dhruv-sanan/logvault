import { NextResponse } from "next/server";
import esClient, { INDEX_NAME } from "@/lib/elasticsearch";

/**
 * GET /api/logs/stream
 *
 * Server-Sent Events (SSE) endpoint for real-time log streaming.
 *
 * HOW SSE WORKS:
 * Unlike regular HTTP (request → response → connection closed), SSE keeps
 * the connection open. The server pushes data using the format:
 *   data: <json>\n\n
 * The browser's built-in EventSource API handles reconnection automatically.
 *
 * WHY SSE OVER WEBSOCKETS?
 * WebSockets are bidirectional. Log streaming only needs server → client.
 * SSE is simpler, works over plain HTTP/2, and needs no extra libraries.
 *
 * HOW NEW-LOG DETECTION WORKS:
 * We record `sinceTimestamp` when the stream connects (current time).
 * Every 2s we query Elasticsearch for logs with timestamp > sinceTimestamp,
 * sorted ascending so we always see them in arrival order.
 * After each poll we advance sinceTimestamp to the newest log we found,
 * so the next poll only picks up genuinely new documents.
 */
// Vercel free tier kills serverless functions at 10s; Pro at 60s.
// SSE needs a long-running connection — set maxDuration to the highest
// allowed value so Vercel doesn't prematurely close the stream.
export const maxDuration = 60;

export async function GET() {
  const encoder = new TextEncoder();

  // Cursor: only surface logs ingested after this connection was opened.
  // We use wall-clock time, not _seq_no — sorting by _seq_no is not
  // supported on Elastic Cloud Serverless and causes initCursor to throw,
  // leaving sinceSeqNo = -1 which dumps the entire index on the first poll.
  //
  // The trade-off: logs whose document `timestamp` is in the past (e.g.
  // from the batch demo generator) will not appear in the live feed.
  // The continuous demo generator uses current timestamps, so it works.
  let sinceTimestamp = new Date().toISOString();

  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      function send(data: unknown) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller closed — client disconnected
        }
      }

      async function poll() {
        try {
          const response = await esClient.search({
            index: INDEX_NAME,
            size: 50,
            query: {
              range: { timestamp: { gt: sinceTimestamp } },
            },
            sort: [{ timestamp: { order: "desc" } }],
          });

          const hits = response.hits.hits;

          if (hits.length > 0) {
            // Advance cursor to the newest timestamp seen
            const newest = hits[0]._source as { timestamp: string };
            sinceTimestamp = newest.timestamp;

            const logs = hits.map((hit) => ({
              _id: hit._id,
              ...(hit._source as object),
            }));

            send({ type: "logs", logs });
          }
        } catch (err) {
          console.error("[stream] Poll error:", err instanceof Error ? err.message : err);
        }
      }

      poll();
      pollTimer = setInterval(poll, 2000);

      // Keep-alive comment every 25s (proxies close idle connections at 30s)
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          // Client disconnected
        }
      }, 25000);
    },

    cancel() {
      if (pollTimer) clearInterval(pollTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      console.log("[stream] Client disconnected, intervals cleared");
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
