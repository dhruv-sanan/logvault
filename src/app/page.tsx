"use client";

import { useEffect, useState } from "react";
import { useLogs } from "@/hooks/use-logs";
import { useLogStream } from "@/hooks/use-log-stream";
import { useStats } from "@/hooks/use-stats";
import { FilterBar } from "@/components/logs/filter-bar";
import { LogTable } from "@/components/logs/log-table";
import { Pagination } from "@/components/logs/pagination";
import { StatsBar } from "@/components/logs/stats-bar";
import { GenerateLogsDialog } from "@/components/logs/generate-logs-dialog";
import { VerifyEsDialog } from "@/components/logs/verify-es-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Database, AlertCircle, Radio, X, Download, Code2, ExternalLink } from "lucide-react";
import { LogQueryParams } from "@/types/log";

export default function HomePage() {
  const { filters, result, loading, error, esQuery, updateFilter, updateFilters, goToPage, search } =
    useLogs();

  const { streamedLogs, isStreaming, toggleStream, clearStream } =
    useLogStream();

  const { stats, loading: statsLoading, fetchStats } = useStats();
  const [showEsQuery, setShowEsQuery] = useState(false);
  const [showKibana, setShowKibana] = useState(false);

  useEffect(() => {
    // Show the Kibana button only when running against Elastic Cloud
    fetch("/api/kibana-url")
      .then((r) => r.json())
      .then((d) => setShowKibana(!!d.devTools))
      .catch(() => {});
  }, []);

  // Load all logs on first render
  useEffect(() => {
    search();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "" && k !== "page" && k !== "pageSize") {
        params.set(k, String(v));
      }
    });
    window.open(`/api/logs/export?${params.toString()}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Log Explorer</h1>
              <p className="text-xs text-muted-foreground">
                Ingest at{" "}
                <code className="font-mono bg-muted px-1 rounded">
                  POST /api/ingest
                </code>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {result.total > 0 && (
              <span className="text-sm text-muted-foreground">
                {result.total.toLocaleString()} logs indexed
              </span>
            )}

            {/* Generate demo logs */}
            <GenerateLogsDialog onDone={() => { search(); fetchStats(); }} />

            {/* Verify ES connection + raw response */}
            <VerifyEsDialog />

            {/* Live stream toggle */}
            <Button
              variant={isStreaming ? "default" : "outline"}
              size="sm"
              onClick={toggleStream}
            >
              <Radio className={`h-4 w-4 mr-2 ${isStreaming ? "animate-pulse" : ""}`} />
              {isStreaming ? "Live" : "Go Live"}
            </Button>

            <Button
              variant={showEsQuery ? "default" : "outline"}
              size="sm"
              onClick={() => setShowEsQuery((v) => !v)}
              title="Show raw Elasticsearch query"
            >
              <Code2 className="h-4 w-4 mr-2" />
              ES Query
            </Button>

            {showKibana && (
              <a href="/api/kibana-redirect" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" title="Open Kibana Discover with live auto-refresh">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Kibana
                </Button>
              </a>
            )}

            <Button variant="outline" size="sm" onClick={handleDownload} title="Download CSV">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={search}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats bar */}
        <StatsBar stats={stats} loading={statsLoading} onRefresh={fetchStats} />

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <FilterBar
              filters={filters}
              onChange={(key: keyof LogQueryParams, value: string | undefined) =>
                updateFilter(key, value)
              }
              onBatchChange={updateFilters}
            />
          </CardContent>
        </Card>

        {/* ES Query debug panel — for demo/interview: shows the exact query sent to Elasticsearch */}
        {showEsQuery && esQuery && (
          <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-amber-600" />
                  Elasticsearch Query
                  <Badge variant="outline" className="text-xs font-normal border-amber-300 text-amber-700">
                    live
                  </Badge>
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowEsQuery(false)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Exact JSON sent to ES on every search — updates as you change filters.
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <pre className="text-xs font-mono bg-background border rounded-md p-3 overflow-auto max-h-72 leading-relaxed">
                {JSON.stringify(esQuery, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Live stream section — shown only when streaming is active and has new logs */}
        {isStreaming && streamedLogs.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <h2 className="text-sm font-medium">Live feed</h2>
                <Badge variant="secondary" className="text-xs">
                  {streamedLogs.length} new
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={clearStream}>
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden border-green-200 bg-green-50/30 dark:bg-green-950/10">
              <LogTable logs={streamedLogs.slice(0, 50)} />
            </div>
          </div>
        )}

        {isStreaming && streamedLogs.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 border rounded-md px-4 py-3">
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Listening for new logs...
          </div>
        )}

        {/* Search results */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {loading
                ? "Searching..."
                : `${result.total.toLocaleString()} result${result.total !== 1 ? "s" : ""}`}
            </h2>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!error && (
            <div className={loading ? "opacity-50 pointer-events-none" : ""}>
              <LogTable logs={result.logs} />
            </div>
          )}

          {!error && (
            <Pagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              onPageChange={goToPage}
            />
          )}
        </div>
      </main>
    </div>
  );
}
