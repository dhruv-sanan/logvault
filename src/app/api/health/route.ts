import { NextResponse } from "next/server";
import esClient from "@/lib/elasticsearch";

/**
 * GET /api/health
 *
 * Confirms the app is running and Elasticsearch is reachable.
 * Useful for evaluators to verify the system is live before running the ingestion script.
 */
export async function GET() {
  try {
    const info = await esClient.info();

    return NextResponse.json({
      status: "ok",
      elasticsearch: {
        status: "connected",
        version: info.version.number,
        cluster: info.cluster_name,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        elasticsearch: "unreachable",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
