/**
 * Integration tests for the Log Ingestor API.
 *
 * Tests call the Next.js App Router route handlers directly — no running server needed.
 * All tests use the "logs-test" index (set via ELASTICSEARCH_INDEX env var in globalSetup)
 * and call _refresh after each ingest so data is immediately searchable.
 */
import { NextRequest } from "next/server";
import { Client } from "@elastic/elasticsearch";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// MUST be set before importing route handlers so INDEX_NAME picks it up
process.env.ELASTICSEARCH_INDEX = "logs-test";

// Dynamic imports AFTER env is set
let POST_ingest: (req: NextRequest) => Promise<Response>;
let GET_logs: (req: NextRequest) => Promise<Response>;

const TEST_INDEX = "logs-test";

const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL!,
  ...(process.env.ELASTICSEARCH_API_KEY
    ? { auth: { apiKey: process.env.ELASTICSEARCH_API_KEY } }
    : {}),
});

// Helper: build a NextRequest for the ingest endpoint
function ingestRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Helper: build a NextRequest for the query endpoint
function logsRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/logs");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

// Helper: refresh test index so ingested docs are immediately searchable
async function refresh() {
  await esClient.indices.refresh({ index: TEST_INDEX });
}

// Helper: make a minimal valid log
function makeLog(overrides: Partial<{
  level: string; message: string; resourceId: string;
  timestamp: string; traceId: string; spanId: string;
  commit: string; metadata: { parentResourceId: string };
}> = {}) {
  return {
    level: "info",
    message: "Test log message",
    resourceId: "server-test",
    timestamp: "2023-09-15T08:00:00Z",
    traceId: "trace-001",
    spanId: "span-001",
    commit: "abc1234",
    metadata: { parentResourceId: "server-parent" },
    ...overrides,
  };
}

beforeAll(async () => {
  // Import route handlers after env var is set
  const ingestModule = await import("../app/api/ingest/route");
  POST_ingest = ingestModule.POST;
  const logsModule = await import("../app/api/logs/route");
  GET_logs = logsModule.GET;
}, 30_000);

afterEach(async () => {
  // Clean all docs between tests to keep tests isolated
  try {
    await esClient.deleteByQuery({
      index: TEST_INDEX,
      query: { match_all: {} },
      refresh: true,
    });
  } catch {
    // Index might not exist yet on first run — that's fine
  }
});

// ─── Test 1: Ingest single log → 200 ────────────────────────────────────────
test("1. Ingest a single log returns 200 with ingested=1", async () => {
  const res = await POST_ingest(ingestRequest(makeLog()));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ingested).toBe(1);
  expect(body.failed).toBe(0);
}, 15_000);

// ─── Test 2: Ingest batch of 5 → 200 ────────────────────────────────────────
test("2. Ingest batch of 5 logs returns 200 with ingested=5", async () => {
  const logs = Array.from({ length: 5 }, (_, i) =>
    makeLog({ message: `Batch log ${i}`, traceId: `trace-${i}` })
  );
  const res = await POST_ingest(ingestRequest(logs));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ingested).toBe(5);
  expect(body.failed).toBe(0);
}, 15_000);

// ─── Test 3: Missing required fields → 400 ──────────────────────────────────
test("3. Ingest with missing required fields returns 400", async () => {
  const res = await POST_ingest(ingestRequest({ resourceId: "server-1" }));
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.failed).toBeGreaterThan(0);
  expect(body.validationErrors).toBeDefined();
  expect(body.validationErrors[0].errors.length).toBeGreaterThan(0);
}, 15_000);

// ─── Test 4: Query by level=error ───────────────────────────────────────────
test("4. Query by level=error returns only error logs", async () => {
  await POST_ingest(ingestRequest([
    makeLog({ level: "error", message: "Error log one" }),
    makeLog({ level: "info",  message: "Info log one" }),
    makeLog({ level: "error", message: "Error log two" }),
  ]));
  await refresh();

  const res = await GET_logs(logsRequest({ level: "error" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total).toBe(2);
  expect(body.logs.every((l: { level: string }) => l.level === "error")).toBe(true);
}, 20_000);

// ─── Test 5: Full-text partial match ────────────────────────────────────────
test("5. Query message='Failed' matches logs containing 'Failed to connect'", async () => {
  await POST_ingest(ingestRequest([
    makeLog({ message: "Failed to connect to DB" }),
    makeLog({ message: "Service started successfully" }),
    makeLog({ message: "Failed to process payment" }),
  ]));
  await refresh();

  const res = await GET_logs(logsRequest({ message: "Failed" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total).toBe(2);
  expect(
    body.logs.every((l: { message: string }) => l.message.toLowerCase().includes("failed"))
  ).toBe(true);
}, 20_000);

// ─── Test 6: Date range filter ───────────────────────────────────────────────
test("6. Date range filter returns only logs within range", async () => {
  await POST_ingest(ingestRequest([
    makeLog({ timestamp: "2023-09-10T12:00:00Z" }), // inside range
    makeLog({ timestamp: "2023-09-12T12:00:00Z" }), // inside range
    makeLog({ timestamp: "2023-09-20T12:00:00Z" }), // outside range
  ]));
  await refresh();

  const res = await GET_logs(logsRequest({
    startTime: "2023-09-09T00:00:00Z",
    endTime:   "2023-09-15T23:59:59Z",
  }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total).toBe(2);
  body.logs.forEach((l: { timestamp: string }) => {
    const ts = new Date(l.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(new Date("2023-09-09T00:00:00Z").getTime());
    expect(ts).toBeLessThanOrEqual(new Date("2023-09-15T23:59:59Z").getTime());
  });
}, 20_000);

// ─── Test 7: Regex filter ────────────────────────────────────────────────────
test("7. Regex filter matches correct logs", async () => {
  await POST_ingest(ingestRequest([
    makeLog({ message: "Failed to connect to DB" }),
    makeLog({ message: "Service started successfully" }),
    makeLog({ message: "Failed to process payment" }),
  ]));
  await refresh();

  const res = await GET_logs(logsRequest({ regex: "Failed.*" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total).toBe(2);
  expect(
    body.logs.every((l: { message: string }) => l.message.startsWith("Failed"))
  ).toBe(true);
}, 20_000);

// ─── Test 8: Multi-filter (level + resourceId) ───────────────────────────────
test("8. Combining level + resourceId filters works correctly", async () => {
  await POST_ingest(ingestRequest([
    makeLog({ level: "error", resourceId: "server-A", message: "Error on A" }),
    makeLog({ level: "error", resourceId: "server-B", message: "Error on B" }),
    makeLog({ level: "info",  resourceId: "server-A", message: "Info on A" }),
  ]));
  await refresh();

  const res = await GET_logs(logsRequest({ level: "error", resourceId: "server-A" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.total).toBe(1);
  expect(body.logs[0].resourceId).toBe("server-A");
  expect(body.logs[0].level).toBe("error");
}, 20_000);

// ─── Test 9: Pagination ──────────────────────────────────────────────────────
test("9. Pagination — 25 logs, page 1 with pageSize=10 returns 10 and total=25", async () => {
  const logs = Array.from({ length: 25 }, (_, i) =>
    makeLog({ message: `Pagination log ${i}`, traceId: `pag-trace-${i}` })
  );
  await POST_ingest(ingestRequest(logs));
  await refresh();

  const res = await GET_logs(logsRequest({ page: "1", pageSize: "10" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.logs.length).toBe(10);
  expect(body.total).toBe(25);
  expect(body.page).toBe(1);
  expect(body.pageSize).toBe(10);
}, 20_000);
