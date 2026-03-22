import { NextRequest, NextResponse } from "next/server";
import esClient, { INDEX_NAME } from "@/lib/elasticsearch";

const DEFAULT_N = 50;
const MAX_N = 200;

/**
 * GET /api/logs/tail?n=50
 *
 * Returns the N most recent logs sorted by timestamp descending.
 * No filters, no pagination — just a quick "what came in last?" view.
 *
 * Useful for evaluators to verify ingestion is working without
 * needing to open the UI or construct a query.
 *
 * Examples:
 *   GET /api/logs/tail          → last 50 logs
 *   GET /api/logs/tail?n=10     → last 10 logs
 *   GET /api/logs/tail?n=200    → last 200 logs (hard cap)
 */
export async function GET(request: NextRequest) {
  try {
    const raw = new URL(request.url).searchParams.get("n");
    const n = Math.min(MAX_N, Math.max(1, parseInt(raw ?? String(DEFAULT_N), 10) || DEFAULT_N));

    const response = await esClient.search({
      index: INDEX_NAME,
      size: n,
      query: { match_all: {} },
      sort: [{ timestamp: { order: "desc" } }],
    });

    const logs = response.hits.hits.map((hit) => ({
      _id: hit._id,
      ...(hit._source as object),
    }));

    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    return NextResponse.json({ n, total, logs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
