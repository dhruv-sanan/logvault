"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface HealthData {
  status: string;
  elasticsearch: {
    status: string;
    version?: string;
    cluster_name?: string;
  };
}

export function VerifyEsDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [rawEs, setRawEs] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setHealth(null);
    setRawEs(null);

    try {
      const [healthRes, rawRes] = await Promise.all([
        fetch("/api/health"),
        fetch("/api/logs/raw"),
      ]);

      const healthData = await healthRes.json();
      const rawData = await rawRes.json();

      if (!healthRes.ok) throw new Error(healthData.error ?? "Health check failed");

      setHealth(healthData);
      setRawEs(rawData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    load();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} title="Verify Elasticsearch connection and see raw response">
        <ShieldCheck className="h-4 w-4 mr-2" />
        Verify ES
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Elasticsearch Verification</DialogTitle>
            <DialogDescription>
              Live proof that logs are stored in Elasticsearch — raw API responses, no processing.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Querying Elasticsearch…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              <XCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {!loading && health && (
            <div className="space-y-4">
              {/* Health */}
              <div className="rounded-md border bg-green-50/40 dark:bg-green-950/10 border-green-200 dark:border-green-800 px-4 py-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Elasticsearch connected
                </div>
                <div className="text-xs text-muted-foreground font-mono space-y-0.5 pl-6">
                  {health.elasticsearch.version && (
                    <p>version: <span className="text-foreground">{health.elasticsearch.version}</span></p>
                  )}
                  {health.elasticsearch.cluster_name && (
                    <p>cluster: <span className="text-foreground">{health.elasticsearch.cluster_name}</span></p>
                  )}
                </div>
              </div>

              {/* Raw ES response */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Raw Elasticsearch response — <code className="normal-case">GET /logs/_search</code>
                </p>
                <pre className="text-xs font-mono bg-muted border rounded-md p-3 overflow-auto max-h-80 leading-relaxed">
                  {JSON.stringify(rawEs, null, 2)}
                </pre>
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={load}>
                Refresh
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
