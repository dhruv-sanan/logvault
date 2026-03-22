import { Client } from "@elastic/elasticsearch";

// Singleton ES client — created once and reused across requests.
// API key auth is optional: Elastic Cloud requires it, local Docker ES does not.
const client = new Client({
  node: process.env.ELASTICSEARCH_URL!,
  ...(process.env.ELASTICSEARCH_API_KEY
    ? { auth: { apiKey: process.env.ELASTICSEARCH_API_KEY } }
    : {}),
});

export const INDEX_NAME = process.env.ELASTICSEARCH_INDEX ?? "logs";

/**
 * Creates the logs index with explicit field mappings if it doesn't already exist.
 *
 * Why explicit mappings matter:
 * - "keyword" fields support exact-match filters and aggregations (level, resourceId, etc.)
 * - "text" fields are analyzed for full-text search (message)
 * - "date" fields enable range queries on timestamp
 *
 * Without mappings, ES would auto-detect types which can lead to
 * incorrect behavior (e.g., treating IDs as full-text).
 */
export async function ensureIndex(): Promise<void> {
  const exists = await client.indices.exists({ index: INDEX_NAME });
  if (exists) return;

  await client.indices.create({
    index: INDEX_NAME,
    mappings: {
      properties: {
        level: { type: "keyword" },       // exact match: "error", "warn", "info"
        message: {
          type: "text",                   // full-text search (analyzed, tokenized)
          fields: {
            keyword: { type: "keyword" }, // regex/exact match on full original string
          },
        },
        resourceId: { type: "keyword" },  // exact match
        timestamp: { type: "date" },      // range queries
        traceId: { type: "keyword" },
        spanId: { type: "keyword" },
        commit: { type: "keyword" },
        metadata: {
          properties: {
            parentResourceId: { type: "keyword" },
          },
        },
      },
    },
    settings: {
      // Elastic Cloud Serverless requires refresh_interval >= 5s.
      // Local ES allows "1s". We use an env flag to distinguish.
      refresh_interval: process.env.ELASTICSEARCH_API_KEY ? "5s" : "1s",
    },
  });
}

export default client;
