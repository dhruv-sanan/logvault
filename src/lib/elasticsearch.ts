import { Client } from "@elastic/elasticsearch";

// Singleton ES client — created once and reused across requests
const client = new Client({
  node: process.env.ELASTICSEARCH_URL!,
  auth: {
    apiKey: process.env.ELASTICSEARCH_API_KEY!,
  },
});

export const INDEX_NAME = "logs";

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
      // Serverless ES requires refresh_interval >= 5s or -1 (disable auto-refresh).
      // "5s" means new logs are searchable within 5 seconds of ingestion.
      refresh_interval: "5s",
    },
  });
}

export default client;
