#!/usr/bin/env node
/**
 * generate-logs.js — Demo log generator for the Log Ingestor
 *
 * Usage:
 *   node scripts/generate-logs.js                        # defaults
 *   node scripts/generate-logs.js --rate 10              # 10 logs/sec
 *   node scripts/generate-logs.js --rate 0.5             # 1 log every 2 seconds
 *   node scripts/generate-logs.js --count 100            # stop after 100 logs
 *   node scripts/generate-logs.js --url https://your-app.vercel.app
 *   node scripts/generate-logs.js --url https://your-app.vercel.app --rate 5 --count 200
 *
 * Options:
 *   --url    Target ingestor URL  (default: http://localhost:3000)
 *   --rate   Logs per second      (default: 2, min: 0.1, max: 50)
 *   --count  Total logs to send   (default: 0 = run forever, Ctrl+C to stop)
 *   --batch  Logs per HTTP request (default: 5, max: 50)
 */

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const BASE_URL   = getArg("--url",   "http://localhost:3000");
const RATE       = Math.min(50, Math.max(0.1, parseFloat(getArg("--rate",  "2"))));
const MAX_COUNT  = parseInt(getArg("--count", "0"), 10); // 0 = infinite
const BATCH_SIZE = Math.min(50, Math.max(1, parseInt(getArg("--batch", "5"), 10)));

// ── Realistic log data pools ──────────────────────────────────────────────────
const RESOURCES = [
  "server-1001", "server-1002", "server-1003", "server-1004", "server-1005",
  "payment-service", "auth-service", "api-gateway", "cache-layer", "db-primary",
  "worker-queue", "notification-service", "analytics-engine", "cdn-edge-01",
];

const PARENT_RESOURCES = [
  "server-0987", "server-0001", "cluster-east-1", "cluster-west-2",
  "kubernetes-node-01", "kubernetes-node-02", "load-balancer-01",
];

const COMMITS = [
  "5e5342f", "a1b2c3d", "e4f5g6h", "i7j8k9l", "m0n1o2p",
  "q3r4s5t", "u6v7w8x", "y9z0a1b", "c2d3e4f", "g5h6i7j",
];

const LOG_TEMPLATES = [
  // errors
  { level: "error", message: "Failed to connect to DB",             weight: 4 },
  { level: "error", message: "Failed to process payment",           weight: 3 },
  { level: "error", message: "Unhandled exception in worker thread", weight: 2 },
  { level: "error", message: "Authentication service unreachable",   weight: 2 },
  { level: "error", message: "Request timeout after 30000ms",        weight: 3 },
  { level: "error", message: "Disk write error on volume /data",     weight: 1 },
  { level: "error", message: "Failed to acquire connection from pool", weight: 2 },
  // warns
  { level: "warn",  message: "High memory usage detected: 87%",     weight: 5 },
  { level: "warn",  message: "Cache miss rate exceeding threshold",  weight: 4 },
  { level: "warn",  message: "Slow query detected: 2340ms",         weight: 4 },
  { level: "warn",  message: "Rate limit approaching for API key",   weight: 3 },
  { level: "warn",  message: "Retry attempt 2 of 3 for downstream",  weight: 3 },
  { level: "warn",  message: "Certificate expiry in 14 days",        weight: 1 },
  // infos
  { level: "info",  message: "Service started successfully",         weight: 6 },
  { level: "info",  message: "Deployment completed for v2.4.1",      weight: 3 },
  { level: "info",  message: "Health check passed",                  weight: 8 },
  { level: "info",  message: "User login successful",                weight: 6 },
  { level: "info",  message: "Background job completed in 412ms",    weight: 5 },
  { level: "info",  message: "Config reloaded from environment",     weight: 2 },
  { level: "info",  message: "Scheduled task executed: cleanup_old_sessions", weight: 3 },
  // debugs
  { level: "debug", message: "Cache miss for key user_session_99",   weight: 5 },
  { level: "debug", message: "DB query executed in 12ms",            weight: 6 },
  { level: "debug", message: "Incoming request: GET /api/products",  weight: 7 },
  { level: "debug", message: "Token validation passed for user_id 4421", weight: 4 },
  { level: "debug", message: "Queue depth: 14 pending jobs",         weight: 3 },
];

// Build weighted selection array once
const WEIGHTED_TEMPLATES = LOGS_BY_WEIGHT();
function LOGS_BY_WEIGHT() {
  const out = [];
  for (const t of LOG_TEMPLATES) for (let i = 0; i < t.weight; i++) out.push(t);
  return out;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomId(prefix, digits = 3) {
  return `${prefix}-${String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, "0")}`;
}

function makeLog() {
  const template = pick(WEIGHTED_TEMPLATES);
  // Scatter timestamps across the last 24 hours for realistic time-series data
  const jitterMs = Math.floor(Math.random() * 86_400_000);
  const timestamp = new Date(Date.now() - jitterMs).toISOString();

  return {
    level:      template.level,
    message:    template.message,
    resourceId: pick(RESOURCES),
    timestamp,
    traceId:    randomId("trace", 6),
    spanId:     randomId("span", 4),
    commit:     pick(COMMITS),
    metadata:   { parentResourceId: pick(PARENT_RESOURCES) },
  };
}

// ── Ingestor call ─────────────────────────────────────────────────────────────
async function sendBatch(logs) {
  const url = `${BASE_URL}/api/ingest?refresh=true`;
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(logs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Main loop ─────────────────────────────────────────────────────────────────
let sent = 0;
let errors = 0;
const startTime = Date.now();

const intervalMs = (BATCH_SIZE / RATE) * 1000; // how often to fire a batch

console.log("\n📋  Log Generator — Sunket AI Assignment Demo");
console.log("─".repeat(50));
console.log(`  Target  : ${BASE_URL}`);
console.log(`  Rate    : ${RATE} logs/sec  (batch=${BATCH_SIZE}, interval=${Math.round(intervalMs)}ms)`);
console.log(`  Count   : ${MAX_COUNT > 0 ? MAX_COUNT : "∞  (Ctrl+C to stop)"}`);
console.log("─".repeat(50) + "\n");

async function tick() {
  if (MAX_COUNT > 0 && sent >= MAX_COUNT) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅  Done — sent ${sent} logs in ${elapsed}s  (${errors} errors)`);
    process.exit(0);
  }

  const remaining = MAX_COUNT > 0 ? MAX_COUNT - sent : Infinity;
  const thisBatch = Math.min(BATCH_SIZE, remaining);
  const logs = Array.from({ length: thisBatch }, makeLog);

  try {
    await sendBatch(logs);
    sent += thisBatch;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (sent / elapsed).toFixed(1);
    process.stdout.write(`\r  ✓ Sent ${sent.toLocaleString()} logs  |  ${rate}/s  |  ${elapsed}s elapsed  |  ${errors} errors`);
  } catch (err) {
    errors++;
    process.stdout.write(`\r  ✗ Error: ${err.message.slice(0, 60)}  (total errors: ${errors})`);
  }
}

// Run immediately then on interval
tick();
const timer = setInterval(tick, intervalMs);

// Graceful shutdown on Ctrl+C
process.on("SIGINT", () => {
  clearInterval(timer);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n⚠️  Interrupted — sent ${sent} logs in ${elapsed}s  (${errors} errors)\n`);
  process.exit(0);
});
