import { NextRequest, NextResponse } from "next/server";
import esClient, { INDEX_NAME } from "@/lib/elasticsearch";
import { Log } from "@/types/log";

const EXPORT_CAP = 10_000;

const CSV_HEADERS = [
  "timestamp", "level", "message", "resourceId",
  "traceId", "spanId", "commit", "parentResourceId",
];

/**
 * Escape a single CSV field per RFC 4180:
 * - Wrap in double-quotes if the value contains a comma, double-quote, or newline
 * - Escape internal double-quotes by doubling them ("" inside quoted field)
 */
function csvField(value: string | undefined): string {
  const str = value ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function logToRow(log: Log): string {
  return [
    csvField(log.timestamp),
    csvField(log.level),
    csvField(log.message),
    csvField(log.resourceId),
    csvField(log.traceId),
    csvField(log.spanId),
    csvField(log.commit),
    csvField(log.metadata?.parentResourceId),
  ].join(",");
}

/**
 * GET /api/logs/export
 *
 * Accepts the same filter params as GET /api/logs (no pagination).
 * Returns a CSV file with Content-Disposition: attachment.
 * Capped at 10,000 documents to prevent runaway exports.
 *
 * No third-party CSV libraries — RFC 4180 is simple enough to implement
 * correctly with proper quote-escaping.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const message = searchParams.get("message") ?? undefined;
    const level = searchParams.get("level") ?? undefined;
    const resourceId = searchParams.get("resourceId") ?? undefined;
    const traceId = searchParams.get("traceId") ?? undefined;
    const spanId = searchParams.get("spanId") ?? undefined;
    const commit = searchParams.get("commit") ?? undefined;
    const parentResourceId = searchParams.get("parentResourceId") ?? undefined;
    const startTime = searchParams.get("startTime") ?? undefined;
    const endTime = searchParams.get("endTime") ?? undefined;
    const regex = searchParams.get("regex") ?? undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mustClauses: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterClauses: any[] = [];

    if (message) mustClauses.push({ match_phrase_prefix: { message: { query: message, max_expansions: 50 } } });
    if (regex) mustClauses.push({ regexp: { "message.keyword": { value: regex, flags: "ALL", case_insensitive: true } } });
    if (level) filterClauses.push({ term: { level } });
    if (resourceId) filterClauses.push({ term: { resourceId } });
    if (traceId) filterClauses.push({ term: { traceId } });
    if (spanId) filterClauses.push({ term: { spanId } });
    if (commit) filterClauses.push({ term: { commit } });
    if (parentResourceId) filterClauses.push({ term: { "metadata.parentResourceId": parentResourceId } });
    if (startTime || endTime) {
      filterClauses.push({ range: { timestamp: { ...(startTime && { gte: startTime }), ...(endTime && { lte: endTime }) } } });
    }

    const query =
      mustClauses.length === 0 && filterClauses.length === 0
        ? { match_all: {} }
        : { bool: { ...(mustClauses.length > 0 && { must: mustClauses }), ...(filterClauses.length > 0 && { filter: filterClauses }) } };

    const response = await esClient.search({
      index: INDEX_NAME,
      size: EXPORT_CAP,
      query,
      sort: [{ timestamp: { order: "desc" } }],
    });

    const logs = response.hits.hits.map((h) => h._source as Log);

    // Build CSV — header row + one row per document
    const rows = [
      CSV_HEADERS.join(","),
      ...logs.map(logToRow),
    ];
    const csv = rows.join("\r\n"); // RFC 4180 line endings

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="logs-export.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
