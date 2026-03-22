"use client";

import { StatsData } from "@/hooks/use-stats";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StatsBarProps {
  stats: StatsData | null;
  loading: boolean;
  onRefresh: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  error: "text-red-600",
  warn: "text-yellow-600",
  info: "text-blue-600",
  debug: "text-gray-500",
};

export function StatsBar({ stats, loading, onRefresh }: StatsBarProps) {
  return (
    <div className="flex items-center justify-between bg-muted/40 border rounded-lg px-4 py-2 text-sm">
      <div className="flex items-center gap-6 flex-wrap">
        <div>
          <span className="text-muted-foreground mr-1.5">Total</span>
          <span className="font-semibold tabular-nums">
            {stats ? stats.totalLogs.toLocaleString() : "—"}
          </span>
        </div>

        {(["error", "warn", "info", "debug"] as const).map((level) => (
          <div key={level}>
            <span className={`font-mono text-xs uppercase mr-1.5 ${LEVEL_COLORS[level]}`}>
              {level}
            </span>
            <span className="font-semibold tabular-nums">
              {stats ? (stats.countByLevel[level] ?? 0).toLocaleString() : "—"}
            </span>
          </div>
        ))}

        <div>
          <span className="text-muted-foreground mr-1.5">Last 60s</span>
          <span className="font-semibold tabular-nums">
            {stats ? stats.recentIngestionRate.toLocaleString() : "—"}
          </span>
        </div>
      </div>

      <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading} className="h-7 px-2">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
