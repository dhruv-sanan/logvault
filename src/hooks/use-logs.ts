"use client";

import { useState, useCallback, useRef } from "react";
import { LogQueryParams, LogQueryResult } from "@/types/log";

const DEFAULT_RESULT: LogQueryResult = {
  logs: [],
  total: 0,
  page: 1,
  pageSize: 20,
};

/**
 * useLogs — custom hook that owns all query state for the UI.
 *
 * Responsibilities:
 * - Holds current filters, results, loading state, and error state
 * - Debounces fetch calls so we don't hammer the API on every keystroke
 * - Builds the query string from active filters and calls GET /api/logs
 *
 * WHY a custom hook?
 * Keeps the page component clean — it only handles layout/rendering.
 * All data-fetching logic lives here and is easily testable in isolation.
 */
export function useLogs() {
  const [filters, setFilters] = useState<LogQueryParams>({});
  const [result, setResult] = useState<LogQueryResult>(DEFAULT_RESULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [esQuery, setEsQuery] = useState<any>(null);

  // Debounce timer ref — cancelled and reset on every keystroke
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async (params: LogQueryParams) => {
    setLoading(true);
    setError(null);

    try {
      // Build query string — only include params that have a value
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.set(key, String(value));
        }
      });

      const res = await fetch(`/api/logs?${searchParams.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Query failed");
      }

      const data: LogQueryResult = await res.json();
      setResult(data);
      if (data.esQuery) setEsQuery(data.esQuery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setResult(DEFAULT_RESULT);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Update a single filter value and trigger a debounced fetch.
   * 300ms debounce means we wait for the user to stop typing before querying.
   */
  const updateFilter = useCallback(
    (key: keyof LogQueryParams, value: string | number | undefined) => {
      const newFilters = { ...filters, [key]: value, page: 1 };
      setFilters(newFilters);

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        fetchLogs(newFilters);
      }, 300);
    },
    [filters, fetchLogs]
  );

  /** Update multiple filter keys at once — avoids stale-closure overwrites when
   *  setting startTime + endTime together (e.g. from a date-range preset). */
  const updateFilters = useCallback(
    (patch: Partial<LogQueryParams>) => {
      const newFilters = { ...filters, ...patch, page: 1 };
      setFilters(newFilters);

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        fetchLogs(newFilters);
      }, 300);
    },
    [filters, fetchLogs]
  );

  const goToPage = useCallback(
    (page: number) => {
      const newFilters = { ...filters, page };
      setFilters(newFilters);
      fetchLogs(newFilters);
    },
    [filters, fetchLogs]
  );

  // Run an immediate fetch (used on mount and manual refresh)
  const search = useCallback(() => {
    fetchLogs(filters);
  }, [filters, fetchLogs]);

  return { filters, result, loading, error, esQuery, updateFilter, updateFilters, goToPage, search };
}
