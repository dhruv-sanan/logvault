import { NextResponse } from "next/server";
import esClient, { INDEX_NAME } from "@/lib/elasticsearch";

/**
 * GET /api/logs/raw
 *
 * Returns the unprocessed Elasticsearch _search response for the 5 most
 * recent logs. Exposes _index, _id, _score, _source and hits.total exactly
 * as Elasticsearch returns them — useful for verifying the ES integration
 * without needing Kibana access.
 */
export async function GET() {
  try {
    const response = await esClient.search({
      index: INDEX_NAME,
      size: 5,
      query: { match_all: {} },
      sort: [{ timestamp: { order: "desc" } }],
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
