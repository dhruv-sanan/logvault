import { NextRequest, NextResponse } from "next/server";
import esClient, { INDEX_NAME } from "@/lib/elasticsearch";
import { LogQueryResult } from "@/types/log";

/**
 * GET /api/logs
 *
 * Query logs with any combination of filters. All params are optional.
 *
 * Query params:
 *   message          - full-text search on the message field
 *   level            - exact match (e.g. "error", "warn", "info")
 *   resourceId       - exact match
 *   traceId          - exact match
 *   spanId           - exact match
 *   commit           - exact match
 *   parentResourceId - exact match on metadata.parentResourceId
 *   startTime        - ISO timestamp, start of date range
 *   endTime          - ISO timestamp, end of date range
 *   regex            - regex pattern applied to the message field
 *   page             - page number, default 1
 *   pageSize         - results per page, default 20, max 100
 *
 * Examples:
 *   GET /api/logs?level=error
 *   GET /api/logs?message=Failed+to+connect
 *   GET /api/logs?resourceId=server-1234
 *   GET /api/logs?startTime=2023-09-10T00:00:00Z&endTime=2023-09-15T23:59:59Z
 *   GET /api/logs?level=error&message=DB&startTime=2023-09-01T00:00:00Z
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // --- Parse query params ---
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
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10))
    );

    /**
     * HOW THE QUERY WORKS — ES bool query anatomy:
     *
     * A bool query is Elasticsearch's way of combining multiple conditions.
     * It has four clause types:
     *   - must:   conditions that MUST match (affects relevance score)
     *   - filter: conditions that MUST match (no scoring, faster — used for exact matches)
     *   - should: conditions that SHOULD match (boosts score if they do)
     *   - must_not: conditions that MUST NOT match
     *
     * We use:
     *   - `must` for full-text search (message, regex) — scoring matters here
     *   - `filter` for exact matches and ranges — faster, no scoring needed
     *
     * All active clauses are combined with AND logic automatically.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mustClauses: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterClauses: any[] = [];

    // Full-text search on message (analyzed text field)
    if (message) {
      mustClauses.push({
        match: {
          message: {
            query: message,
            operator: "and", // all words must appear, not just any one
          },
        },
      });
    }

    // Regex search on message.keyword (the full, unanalyzed string)
    // We cannot use regex on the `message` text field because it's tokenized
    // into individual words. `message.keyword` stores the original string intact,
    // so patterns like "Failed.*DB" or "connect(ion)?" work correctly.
    if (regex) {
      mustClauses.push({
        regexp: {
          "message.keyword": {
            value: regex,
            flags: "ALL",
            case_insensitive: true,
          },
        },
      });
    }

    // Exact match filters — use `term` on keyword fields
    // keyword fields are not analyzed, so "server-1234" matches exactly "server-1234"
    if (level) filterClauses.push({ term: { level } });
    if (resourceId) filterClauses.push({ term: { resourceId } });
    if (traceId) filterClauses.push({ term: { traceId } });
    if (spanId) filterClauses.push({ term: { spanId } });
    if (commit) filterClauses.push({ term: { commit } });
    if (parentResourceId) {
      filterClauses.push({ term: { "metadata.parentResourceId": parentResourceId } });
    }

    // Date range filter on timestamp
    // gte = greater than or equal, lte = less than or equal
    if (startTime || endTime) {
      filterClauses.push({
        range: {
          timestamp: {
            ...(startTime && { gte: startTime }),
            ...(endTime && { lte: endTime }),
          },
        },
      });
    }

    // If no filters provided, match_all returns every document
    const query =
      mustClauses.length === 0 && filterClauses.length === 0
        ? { match_all: {} }
        : {
            bool: {
              ...(mustClauses.length > 0 && { must: mustClauses }),
              ...(filterClauses.length > 0 && { filter: filterClauses }),
            },
          };

    const response = await esClient.search({
      index: INDEX_NAME,
      from: (page - 1) * pageSize, // pagination offset
      size: pageSize,
      query,
      sort: [{ timestamp: { order: "desc" } }], // newest logs first
    });

    const total =
      typeof response.hits.total === "number"
        ? response.hits.total
        : response.hits.total?.value ?? 0;

    const logs = response.hits.hits.map((hit) => ({
      _id: hit._id,
      ...(hit._source as object),
    }));

    const result: LogQueryResult = {
      logs: logs as LogQueryResult["logs"],
      total,
      page,
      pageSize,
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
