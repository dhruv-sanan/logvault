import { NextResponse } from "next/server";
import esClient, { INDEX_NAME } from "@/lib/elasticsearch";

/**
 * GET /api/stats
 *
 * Returns aggregate statistics in a single ES request using aggregations.
 * No pagination — this is a summary view, not a document fetch.
 *
 * Single ES request with:
 *   - track_total_hits: true        → totalLogs
 *   - terms agg on "level"          → countByLevel
 *   - filter agg (range last 60s)   → recentIngestionRate
 */
export async function GET() {
  try {
    const response = await esClient.search({
      index: INDEX_NAME,
      size: 0, // don't return documents — aggregations only
      track_total_hits: true,
      aggregations: {
        by_level: {
          terms: { field: "level", size: 10 },
        },
        recent_60s: {
          filter: {
            range: { timestamp: { gte: "now-60s" } },
          },
        },
      },
    });

    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    // Extract level counts from the terms aggregation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byLevelBuckets = (response.aggregations?.by_level as any)?.buckets ?? [];
    const countByLevel: Record<string, number> = { error: 0, warn: 0, info: 0, debug: 0 };
    for (const bucket of byLevelBuckets) {
      countByLevel[bucket.key] = bucket.doc_count;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recentIngestionRate = (response.aggregations?.recent_60s as any)?.doc_count ?? 0;

    return NextResponse.json({
      totalLogs: total,
      countByLevel,
      recentIngestionRate,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
