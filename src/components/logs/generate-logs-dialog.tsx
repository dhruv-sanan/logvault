"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, CheckCircle2, XCircle, Loader2, Radio, Square } from "lucide-react";

// ── Log generation data ───────────────────────────────────────────────────────

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
  { level: "error", message: "Failed to connect to DB",              weight: 4 },
  { level: "error", message: "Failed to process payment",            weight: 3 },
  { level: "error", message: "Unhandled exception in worker thread", weight: 2 },
  { level: "error", message: "Authentication service unreachable",   weight: 2 },
  { level: "error", message: "Request timeout after 30000ms",        weight: 3 },
  { level: "error", message: "Disk write error on volume /data",     weight: 1 },
  { level: "error", message: "Failed to acquire connection from pool", weight: 2 },
  { level: "warn",  message: "High memory usage detected: 87%",      weight: 5 },
  { level: "warn",  message: "Cache miss rate exceeding threshold",   weight: 4 },
  { level: "warn",  message: "Slow query detected: 2340ms",          weight: 4 },
  { level: "warn",  message: "Rate limit approaching for API key",    weight: 3 },
  { level: "warn",  message: "Retry attempt 2 of 3 for downstream",  weight: 3 },
  { level: "warn",  message: "Certificate expiry in 14 days",        weight: 1 },
  { level: "info",  message: "Service started successfully",          weight: 6 },
  { level: "info",  message: "Deployment completed for v2.4.1",      weight: 3 },
  { level: "info",  message: "Health check passed",                  weight: 8 },
  { level: "info",  message: "User login successful",                weight: 6 },
  { level: "info",  message: "Background job completed in 412ms",    weight: 5 },
  { level: "info",  message: "Config reloaded from environment",     weight: 2 },
  { level: "info",  message: "Scheduled task executed: cleanup_old_sessions", weight: 3 },
  { level: "debug", message: "Cache miss for key user_session_99",   weight: 5 },
  { level: "debug", message: "DB query executed in 12ms",            weight: 6 },
  { level: "debug", message: "Incoming request: GET /api/products",  weight: 7 },
  { level: "debug", message: "Token validation passed for user_id 4421", weight: 4 },
  { level: "debug", message: "Queue depth: 14 pending jobs",         weight: 3 },
];
const WEIGHTED = LOG_TEMPLATES.flatMap((t) => Array(t.weight).fill(t));

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomId(prefix: string, digits = 3) {
  return `${prefix}-${String(Math.floor(Math.random() * 10 ** digits)).padStart(digits, "0")}`;
}
// live=true  → current timestamp so the SSE stream (timestamp > now) picks it up
// live=false → scattered over last 24h so the date-range filter demo is interesting
function makeLog(live = false) {
  const t = pick(WEIGHTED);
  const jitterMs = live ? 0 : Math.floor(Math.random() * 86_400_000);
  return {
    level: t.level, message: t.message,
    resourceId: pick(RESOURCES),
    timestamp: new Date(Date.now() - jitterMs).toISOString(),
    traceId: randomId("trace", 6), spanId: randomId("span", 4),
    commit: pick(COMMITS),
    metadata: { parentResourceId: pick(PARENT_RESOURCES) },
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_PRESETS = [
  { label: "50",  count: 50 },
  { label: "200", count: 200 },
  { label: "500", count: 500 },
];

const SPEED_PRESETS = [
  { label: "Slow",   rate: 30 },
  { label: "Normal", rate: 100 },
  { label: "Fast",   rate: 300 },
];

const CONTINUOUS_LIMIT_SEC = 60; // safety auto-stop
const BATCH_SIZE = 10;           // logs per HTTP request

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode   = "batch" | "continuous";
type Status = "idle" | "running" | "done" | "error";

interface Props { onDone?: () => void; }

// ── Component ─────────────────────────────────────────────────────────────────

export function GenerateLogsDialog({ onDone }: Props) {
  const [open, setOpen]     = useState(false);
  const [mode, setMode]     = useState<Mode>("batch");
  const [status, setStatus] = useState<Status>("idle");
  const [ingested, setIngested] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // batch
  const [batchCount, setBatchCount] = useState(200);

  // continuous
  const [rate, setRate] = useState(100); // logs per minute
  const [elapsed, setElapsed] = useState(0); // seconds

  const abortRef    = useRef(false);
  const rateRef     = useRef(rate);       // always current rate for the loop
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const ingestedRef = useRef(0);

  // keep rateRef in sync
  useEffect(() => { rateRef.current = rate; }, [rate]);

  function stopAll() {
    abortRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }

  function reset() {
    stopAll();
    setStatus("idle");
    setIngested(0);
    setElapsed(0);
    setErrorMsg(null);
    ingestedRef.current = 0;
    abortRef.current = false;
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // closing while running → keep generation going in the background, don't reset
    if (!next && status !== "running") reset();
  }

  // ── Batch mode ──────────────────────────────────────────────────────────────

  async function runBatch() {
    abortRef.current = false;
    setStatus("running");
    setIngested(0);

    let sent = 0;
    try {
      while (sent < batchCount) {
        if (abortRef.current) break;
        const n = Math.min(BATCH_SIZE, batchCount - sent);
        const res = await fetch("/api/ingest?refresh=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Array.from({ length: n }, makeLog)),
        });
        if (!res.ok && res.status !== 207) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.error ?? `HTTP ${res.status}`);
        }
        sent += n;
        setIngested(sent);
      }
      setStatus("done");
      onDone?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  // ── Continuous mode ─────────────────────────────────────────────────────────

  const sendNextBatch = useCallback(async (startedAt: number) => {
    if (abortRef.current) return;

    const elapsedSec = (Date.now() - startedAt) / 1000;
    if (elapsedSec >= CONTINUOUS_LIMIT_SEC) {
      stopAll();
      setStatus("done");
      onDone?.();
      return;
    }

    try {
      const res = await fetch("/api/ingest?refresh=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Array.from({ length: BATCH_SIZE }, () => makeLog(true))),
      });
      if (!res.ok && res.status !== 207) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      ingestedRef.current += BATCH_SIZE;
      setIngested(ingestedRef.current);
    } catch (err) {
      stopAll();
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
      return;
    }

    if (!abortRef.current) {
      // interval = time to send BATCH_SIZE logs at current rate
      const intervalMs = (BATCH_SIZE / rateRef.current) * 60_000;
      timerRef.current = setTimeout(() => sendNextBatch(startedAt), intervalMs);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startContinuous() {
    abortRef.current = false;
    ingestedRef.current = 0;
    setStatus("running");
    setIngested(0);
    setElapsed(0);

    const startedAt = Date.now();

    // 1-second UI ticker
    elapsedRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(sec);
    }, 1000);

    // Single entry point — sendNextBatch schedules all subsequent calls itself.
    // Do NOT also set a setTimeout here; that would create two concurrent chains
    // and stopAll() would only cancel one of them.
    sendNextBatch(startedAt);
  }

  function stopContinuous() {
    stopAll();
    setStatus("done");
    onDone?.();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const batchProgress = status !== "idle"
    ? Math.min(100, Math.round((ingested / batchCount) * 100))
    : 0;

  const timeProgress = Math.min(100, Math.round((elapsed / CONTINUOUS_LIMIT_SEC) * 100));
  const remaining    = Math.max(0, CONTINUOUS_LIMIT_SEC - elapsed);
  const hitLimit     = status === "done" && mode === "continuous" && elapsed >= CONTINUOUS_LIMIT_SEC;

  return (
    <>
      <Button
        variant={status === "running" ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {status === "running" ? (
          <>
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-foreground opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-foreground" />
            </span>
            {ingested} sent…
          </>
        ) : (
          <>
            <Zap className="h-4 w-4 mr-2" />
            Generate Logs
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Demo Logs</DialogTitle>
            <DialogDescription>
              Ingest realistic sample logs into Elasticsearch to explore filters and live streaming.
            </DialogDescription>
          </DialogHeader>

          {/* ── Mode toggle (only when idle) ── */}
          {status === "idle" && (
            <div className="flex rounded-md border overflow-hidden text-sm font-medium">
              {(["batch", "continuous"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 capitalize transition-colors
                    ${mode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted text-muted-foreground"
                    }`}
                >
                  {m === "batch" ? "One-shot batch" : "Continuous stream"}
                </button>
              ))}
            </div>
          )}

          {/* ── BATCH mode — idle ── */}
          {mode === "batch" && status === "idle" && (
            <div className="space-y-3 py-1">
              <p className="text-sm font-medium">How many logs?</p>
              <div className="flex gap-2">
                {BATCH_PRESETS.map((p) => (
                  <button
                    key={p.count}
                    onClick={() => setBatchCount(p.count)}
                    className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors
                      ${batchCount === p.count
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                      }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Logs are spread across the last 24 hours with realistic levels and messages.
              </p>
            </div>
          )}

          {/* ── BATCH mode — progress ── */}
          {mode === "batch" && status !== "idle" && (
            <div className="space-y-3 py-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {status === "done" ? "Complete" : "Ingesting…"}
                </span>
                <span className="font-medium tabular-nums">{ingested} / {batchCount}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${status === "done" ? "bg-green-500" : "bg-primary"}`}
                  style={{ width: `${batchProgress}%` }}
                />
              </div>
              {status === "done" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {ingested} logs ingested — results are now searchable.
                </div>
              )}
            </div>
          )}

          {/* ── CONTINUOUS mode — idle ── */}
          {mode === "continuous" && status === "idle" && (
            <div className="space-y-4 py-1">
              {/* Speed presets */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Speed</p>
                <div className="flex gap-2">
                  {SPEED_PRESETS.map((p) => (
                    <button
                      key={p.rate}
                      onClick={() => setRate(p.rate)}
                      className={`flex-1 rounded-md border py-2 text-sm font-medium transition-colors
                        ${rate === p.rate
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted"
                        }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Fine control */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button" variant="outline" size="sm" className="h-8 w-8 p-0 text-base"
                    onClick={() => setRate((r) => Math.max(10, r - 10))}
                  >−</Button>
                  <div className="flex-1 text-center text-sm font-medium tabular-nums">
                    {rate} logs / min
                  </div>
                  <Button
                    type="button" variant="outline" size="sm" className="h-8 w-8 p-0 text-base"
                    onClick={() => setRate((r) => Math.min(600, r + 10))}
                  >+</Button>
                </div>
              </div>

              {/* Safety notice */}
              <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-400">
                Auto-stops after <strong>1 minute</strong> — even if you forget to click Stop.
              </div>
            </div>
          )}

          {/* ── CONTINUOUS mode — running ── */}
          {mode === "continuous" && status === "running" && (
            <div className="space-y-3 py-1">
              {/* Pulsing indicator + stats */}
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                </span>
                <span className="text-sm font-medium">Streaming at {rate} logs/min</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">Sent</p>
                  <p className="font-medium tabular-nums">{ingested.toLocaleString()}</p>
                </div>
                <div className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs text-muted-foreground">Stops in</p>
                  <p className="font-medium tabular-nums">{remaining}s</p>
                </div>
              </div>

              {/* Time progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{elapsed}s elapsed</span>
                  <span>{CONTINUOUS_LIMIT_SEC}s limit</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-400 transition-all duration-1000"
                    style={{ width: `${timeProgress}%` }}
                  />
                </div>
              </div>

              {/* Speed adjustment while running */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">Adjust speed:</span>
                <Button
                  type="button" variant="outline" size="sm" className="h-7 w-7 p-0"
                  onClick={() => setRate((r) => Math.max(10, r - 10))}
                >−</Button>
                <span className="text-sm font-medium tabular-nums w-24 text-center">
                  {rate} / min
                </span>
                <Button
                  type="button" variant="outline" size="sm" className="h-7 w-7 p-0"
                  onClick={() => setRate((r) => Math.min(600, r + 10))}
                >+</Button>
              </div>
            </div>
          )}

          {/* ── CONTINUOUS mode — done ── */}
          {mode === "continuous" && status === "done" && (
            <div className="space-y-2 py-1">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Stopped — {ingested.toLocaleString()} logs ingested.
              </div>
              {hitLimit && (
                <p className="text-xs text-amber-600">
                  Auto-stopped after the 1-minute safety limit.
                </p>
              )}
            </div>
          )}

          {/* ── Error state ── */}
          {status === "error" && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── Footer ── */}
          <DialogFooter className="gap-2">
            {status === "idle" && (
              <>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                {mode === "batch" ? (
                  <Button onClick={runBatch}>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate {batchCount} logs
                  </Button>
                ) : (
                  <Button onClick={startContinuous}>
                    <Radio className="h-4 w-4 mr-2" />
                    Start streaming
                  </Button>
                )}
              </>
            )}

            {status === "running" && mode === "batch" && (
              <Button variant="outline" onClick={() => { abortRef.current = true; }}>
                Stop
              </Button>
            )}

            {status === "running" && mode === "continuous" && (
              <Button variant="outline" onClick={stopContinuous}>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            )}

            {(status === "done" || status === "error") && (
              <>
                <Button variant="outline" onClick={reset}>Generate more</Button>
                <Button onClick={() => handleOpenChange(false)}>Close</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
