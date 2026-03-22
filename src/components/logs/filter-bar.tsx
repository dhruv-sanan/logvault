"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogQueryParams } from "@/types/log";

/** Format a Date as YYYY-MM-DD in the user's local timezone (for date input value) */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DATE_PRESETS = [
  { label: "1h",  hours: 1 },
  { label: "6h",  hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d",  hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
] as const;

interface FilterBarProps {
  filters: LogQueryParams;
  onChange: (key: keyof LogQueryParams, value: string | undefined) => void;
  onBatchChange: (patch: Partial<LogQueryParams>) => void;
}

/**
 * FilterBar — all query controls in one place.
 *
 * Each input calls onChange with its field key and value.
 * The parent (useLogs hook) debounces the API call so we don't
 * fire a request on every single keystroke.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function FilterBar({ filters, onChange, onBatchChange }: FilterBarProps) {
  // Local draft values so the user can type freely; we only push to the
  // filter state when a complete YYYY-MM-DD string is entered.
  const [startDraft, setStartDraft] = useState(
    filters.startTime ? toLocalDateString(new Date(filters.startTime)) : ""
  );
  const [endDraft, setEndDraft] = useState(
    filters.endTime ? toLocalDateString(new Date(filters.endTime)) : ""
  );

  // Keep drafts in sync when presets or Clear update filters externally
  useEffect(() => {
    setStartDraft(filters.startTime ? toLocalDateString(new Date(filters.startTime)) : "");
  }, [filters.startTime]);
  useEffect(() => {
    setEndDraft(filters.endTime ? toLocalDateString(new Date(filters.endTime)) : "");
  }, [filters.endTime]);

  return (
    <div className="space-y-3">
      {/* Row 1: Full-text search + regex */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Full-text search
          </label>
          <Input
            placeholder="Search message..."
            value={filters.message ?? ""}
            onChange={(e) => onChange("message", e.target.value || undefined)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Regex pattern
          </label>
          <Input
            placeholder="e.g. fail or connect.*timeout"
            value={filters.regex ?? ""}
            onChange={(e) => onChange("regex", e.target.value || undefined)}
            className="font-mono"
          />
        </div>
      </div>

      {/* Row 2: Level + resourceId + traceId */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Level
          </label>
          <Select
            value={filters.level ?? "all"}
            onValueChange={(v) => onChange("level", v === "all" ? undefined : v || undefined)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="error">error</SelectItem>
              <SelectItem value="warn">warn</SelectItem>
              <SelectItem value="info">info</SelectItem>
              <SelectItem value="debug">debug</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Resource ID
          </label>
          <Input
            placeholder="e.g. server-1234"
            value={filters.resourceId ?? ""}
            onChange={(e) => onChange("resourceId", e.target.value || undefined)}
            className="font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Trace ID
          </label>
          <Input
            placeholder="e.g. abc-xyz-123"
            value={filters.traceId ?? ""}
            onChange={(e) => onChange("traceId", e.target.value || undefined)}
            className="font-mono"
          />
        </div>
      </div>

      {/* Row 3: spanId + commit + parentResourceId */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Span ID
          </label>
          <Input
            placeholder="e.g. span-456"
            value={filters.spanId ?? ""}
            onChange={(e) => onChange("spanId", e.target.value || undefined)}
            className="font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Commit
          </label>
          <Input
            placeholder="e.g. 5e5342f"
            value={filters.commit ?? ""}
            onChange={(e) => onChange("commit", e.target.value || undefined)}
            className="font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Parent Resource ID
          </label>
          <Input
            placeholder="e.g. server-0987"
            value={filters.parentResourceId ?? ""}
            onChange={(e) =>
              onChange("parentResourceId", e.target.value || undefined)
            }
            className="font-mono"
          />
        </div>
      </div>

      {/* Row 4: Date range */}
      <div className="space-y-2">
        {/* Quick presets — use onBatchChange so both dates update atomically */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Date range
          </span>
          <div className="flex gap-1 flex-wrap">
            {DATE_PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() =>
                  onBatchChange({
                    startTime: new Date(Date.now() - p.hours * 3_600_000).toISOString(),
                    endTime: new Date().toISOString(),
                  })
                }
              >
                Last {p.label}
              </Button>
            ))}
            {(filters.startTime || filters.endTime) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={() => onBatchChange({ startTime: undefined, endTime: undefined })}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Manual date inputs — plain text so user can type any year directly.
            Format: YYYY-MM-DD. Converted to local-timezone ISO on blur. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Start date <span className="text-muted-foreground/60">(YYYY-MM-DD)</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. 2023-09-10"
              value={startDraft}
              onChange={(e) => {
                const v = e.target.value;
                setStartDraft(v);
                if (!v) { onChange("startTime", undefined); return; }
                if (DATE_RE.test(v)) {
                  const d = new Date(`${v}T00:00:00`);
                  if (!isNaN(d.getTime())) onChange("startTime", d.toISOString());
                }
              }}
              onBlur={() => {
                // Reset draft to the last valid value (or empty) on blur
                setStartDraft(
                  filters.startTime ? toLocalDateString(new Date(filters.startTime)) : ""
                );
              }}
              className="font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              End date <span className="text-muted-foreground/60">(YYYY-MM-DD)</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. 2023-09-15"
              value={endDraft}
              onChange={(e) => {
                const v = e.target.value;
                setEndDraft(v);
                if (!v) { onChange("endTime", undefined); return; }
                if (DATE_RE.test(v)) {
                  const d = new Date(`${v}T23:59:59`);
                  if (!isNaN(d.getTime())) onChange("endTime", d.toISOString());
                }
              }}
              onBlur={() => {
                setEndDraft(
                  filters.endTime ? toLocalDateString(new Date(filters.endTime)) : ""
                );
              }}
              className="font-mono"
            />
          </div>
        </div>

        {/* Validation warning */}
        {filters.startTime && filters.endTime && filters.startTime > filters.endTime && (
          <p className="text-xs text-destructive">
            Start date must be before end date.
          </p>
        )}
      </div>
    </div>
  );
}
