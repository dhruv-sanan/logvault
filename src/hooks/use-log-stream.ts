"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Log } from "@/types/log";

interface StreamEvent {
  type: "logs";
  logs: (Log & { _id: string })[];
}

/**
 * useLogStream — subscribes to GET /api/logs/stream via EventSource (SSE).
 *
 * Returns:
 *   streamedLogs  - new logs that arrived after the stream connected
 *   isStreaming   - whether the connection is active
 *   toggleStream  - start/stop the stream
 *   clearStream   - discard buffered streamed logs
 */
export function useLogStream() {
  const [streamedLogs, setStreamedLogs] = useState<(Log & { _id: string })[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(() => {
    // Close any existing connection first
    stopStream();

    const es = new EventSource("/api/logs/stream");
    eventSourceRef.current = es;
    setIsStreaming(true);

    es.onmessage = (event) => {
      try {
        const data: StreamEvent = JSON.parse(event.data);
        if (data.type === "logs" && data.logs.length > 0) {
          // Prepend new logs — newest at the top
          setStreamedLogs((prev) => [...data.logs, ...prev]);
        }
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on error — we just update state to reflect it
      setIsStreaming(false);
      // Give it a moment, then mark as streaming again if connection recovers
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.OPEN) {
          setIsStreaming(true);
        }
      }, 3000);
    };
  }, [stopStream]);

  const toggleStream = useCallback(() => {
    if (isStreaming) {
      stopStream();
    } else {
      startStream();
    }
  }, [isStreaming, startStream, stopStream]);

  const clearStream = useCallback(() => {
    setStreamedLogs([]);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  return { streamedLogs, isStreaming, toggleStream, clearStream };
}
