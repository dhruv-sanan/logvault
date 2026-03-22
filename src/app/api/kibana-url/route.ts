import { NextResponse } from "next/server";
import { INDEX_NAME } from "@/lib/elasticsearch";

/**
 * GET /api/kibana-url
 *
 * Returns Kibana URLs derived from ELASTICSEARCH_URL (.es. → .kb.).
 * Returns null when running against local ES (no Kibana companion).
 *
 * devTools  — always works, no data view needed
 * discover  — requires a data view for the logs index to be created first
 * dataViews — management page to create the data view
 */
export async function GET() {
  const esUrl = process.env.ELASTICSEARCH_URL ?? "";

  if (!process.env.ELASTICSEARCH_API_KEY || !esUrl.includes(".es.")) {
    return NextResponse.json({ devTools: null, discover: null, dataViews: null });
  }

  const base = esUrl.replace(".es.", ".kb.");

  return NextResponse.json({
    devTools: `${base}/app/dev_tools#/console`,
    discover: `${base}/app/discover`,
    dataViews: `${base}/app/management/kibana/dataViews`,
    indexName: INDEX_NAME,
  });
}
