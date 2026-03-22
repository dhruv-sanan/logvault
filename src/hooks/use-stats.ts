"use client";

import { useState, useCallback } from "react";

export interface StatsData {
  totalLogs: number;
  countByLevel: { error: number; warn: number; info: number; debug: number };
  recentIngestionRate: number;
}

export function useStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  return { stats, loading, fetchStats };
}
