"use client";

import { Log } from "@/types/log";
import { LogLevelBadge } from "./log-level-badge";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface LogTableProps {
  logs: (Log & { _id: string })[];
}

/**
 * LogTable — renders each log as a row.
 * Clicking a row expands it to show full metadata (traceId, spanId, commit, parentResourceId).
 *
 * WHY expandable rows?
 * Log rows are dense. Showing every field inline would make the table unreadable.
 * The primary columns (timestamp, level, message, resourceId) are enough to scan.
 * Full details are one click away.
 */
export function LogTable({ logs }: LogTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (logs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">No logs found. Try adjusting your filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[20px_140px_80px_1fr_140px] gap-3 px-4 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
        <div />
        <div>Timestamp</div>
        <div>Level</div>
        <div>Message</div>
        <div>Resource ID</div>
      </div>

      {/* Rows */}
      {logs.map((log) => {
        const isExpanded = expandedId === log._id;
        return (
          <div key={log._id} className="border-b last:border-0">
            {/* Main row */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : log._id)}
              className="w-full grid grid-cols-[20px_140px_80px_1fr_140px] gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors items-start"
            >
              <span className="text-muted-foreground mt-0.5">
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </span>
              <span className="text-xs text-muted-foreground font-mono truncate">
                {new Date(log.timestamp).toLocaleString()}
              </span>
              <span>
                <LogLevelBadge level={log.level} />
              </span>
              <span className="text-sm truncate">{log.message}</span>
              <span className="text-xs font-mono text-muted-foreground truncate">
                {log.resourceId}
              </span>
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-4 pb-4 pt-1 bg-muted/20">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5">Trace ID</p>
                    <p className="font-mono">{log.traceId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5">Span ID</p>
                    <p className="font-mono">{log.spanId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5">Commit</p>
                    <p className="font-mono">{log.commit}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-medium mb-0.5">Parent Resource ID</p>
                    <p className="font-mono">{log.metadata?.parentResourceId}</p>
                  </div>
                  <div className="col-span-2 md:col-span-4">
                    <p className="text-muted-foreground font-medium mb-0.5">Full timestamp</p>
                    <p className="font-mono">{log.timestamp}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
