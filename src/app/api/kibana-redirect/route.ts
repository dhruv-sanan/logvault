import { NextResponse } from "next/server";
import { INDEX_NAME } from "@/lib/elasticsearch";

/**
 * GET /api/kibana-redirect
 *
 * 1. Derives the Kibana base URL from ELASTICSEARCH_URL (.es. → .kb.)
 * 2. Ensures a data view exists for the logs index via the Kibana data views API
 *    (creates one if it doesn't exist yet — idempotent)
 * 3. Redirects to Kibana Discover with:
 *    - The correct data view selected
 *    - Last 24 hours time range
 *    - 5-second auto-refresh (live logs)
 *    - Sorted by timestamp descending
 */
export async function GET() {
  const esUrl = process.env.ELASTICSEARCH_URL ?? "";
  const apiKey = process.env.ELASTICSEARCH_API_KEY ?? "";

  if (!apiKey || !esUrl.includes(".es.")) {
    return NextResponse.json(
      { error: "Kibana is only available with Elastic Cloud" },
      { status: 404 }
    );
  }

  const kibanaBase = esUrl.replace(".es.", ".kb.");
  const headers = {
    "Content-Type": "application/json",
    "kbn-xsrf": "true",
    Authorization: `ApiKey ${apiKey}`,
  };

  // ── Step 1: look for an existing data view for our index ──────────────────
  let dataViewId: string | null = null;

  try {
    const listRes = await fetch(`${kibanaBase}/api/data_views`, { headers });
    if (listRes.ok) {
      const { data_view: list } = await listRes.json();
      const match = (list as { id: string; title: string }[]).find(
        (dv) => dv.title === INDEX_NAME
      );
      if (match) dataViewId = match.id;
    }
  } catch {
    // network error — fall through to creation attempt
  }

  // ── Step 2: create data view if it doesn't exist yet ─────────────────────
  if (!dataViewId) {
    try {
      const createRes = await fetch(`${kibanaBase}/api/data_views/data_view`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data_view: {
            title: INDEX_NAME,
            timeFieldName: "timestamp",
            name: `${INDEX_NAME} logs`,
          },
        }),
      });

      if (createRes.ok) {
        const { data_view } = await createRes.json();
        dataViewId = data_view?.id ?? null;
      }
    } catch {
      // fall through — redirect to Discover anyway without a specific data view
    }
  }

  // ── Step 3: build a Kibana Discover URL in ES|QL mode ────────────────────
  //
  // We use ES|QL instead of KQL + time-range Discover because:
  //
  // 1. KQL Discover with any time range (even "Last 15 min") triggers a
  //    Safari/WebKit bug:
  //      this.requests.values().filter is not a function
  //    The bug is in Kibana's request-deduplication code which calls
  //    .filter() on a Map iterator — valid in Chrome/V8, not in Safari.
  //
  // 2. Discover defaults to "Last 15 minutes" which hides batch-generated
  //    logs whose timestamps are scattered over the past 24 hours.
  //
  // ES|QL uses a different rendering path that avoids both issues.
  // The query itself selects data, so no Kibana time-range filter is needed.
  //
  // The | pipe must be encoded as %7C inside the URL hash fragment.

  const esql = `FROM ${INDEX_NAME} | SORT timestamp DESC | LIMIT 100`;
  const esqlEncoded = esql.replace(/\|/g, "%7C");

  // Do NOT set refreshInterval here — Kibana's auto-refresh polling calls
  // Map.values().filter() which crashes in Safari/WebKit (works in Chrome).
  // Opening without a refresh interval lets Kibana load cleanly.
  // Users can enable auto-refresh manually in Kibana, or just use Chrome.
  const globalState = `(refreshInterval:(pause:!t,value:5000))`;
  const appState = `(query:(esql:'${esqlEncoded}'))`;

  const discoverUrl = `${kibanaBase}/app/discover#/?_g=${globalState}&_a=${appState}`;

  return NextResponse.redirect(discoverUrl);
}
