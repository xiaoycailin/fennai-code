"use client";

import { useEffect, useRef } from "react";
import type { AgentEvent } from "@/types/events";

type UseAgentStreamOptions = {
  sessionId: string;
  onEvents: (events: AgentEvent[]) => void;
};

const DELTA_TYPES = new Set(["message.delta", "thinking.delta"]);

export function useAgentStream({ sessionId, onEvents }: UseAgentStreamOptions) {
  const lastEventIdRef = useRef<string | null>(null);
  const pendingRef = useRef<AgentEvent[]>([]);
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let closed = false;
    let source: EventSource | null = null;

    function flush() {
      const batch = pendingRef.current;
      pendingRef.current = [];
      flushRef.current = null;
      if (batch.length) onEvents(batch);
    }

    function enqueue(event: AgentEvent) {
      if (DELTA_TYPES.has(event.type)) {
        if (flushRef.current) {
          clearTimeout(flushRef.current);
          flushRef.current = null;
        }
        pendingRef.current.push(event);
        flush();
        return;
      }
      pendingRef.current.push(event);
      if (!flushRef.current) flushRef.current = setTimeout(flush, 50);
    }

    function connect() {
      if (closed) return;
      const url = lastEventIdRef.current
        ? `/api/sessions/${sessionId}/stream?lastEventId=${encodeURIComponent(lastEventIdRef.current)}`
        : `/api/sessions/${sessionId}/stream`;
      source = new EventSource(url);
      source.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data) as AgentEvent;
          lastEventIdRef.current = event.id;
          enqueue(event);
        } catch {
          // ignore parse error
        }
      };
      source.onerror = () => {
        source?.close();
        if (!closed) window.setTimeout(connect, 900);
      };
    }

    connect();
    return () => {
      closed = true;
      source?.close();
      if (flushRef.current) clearTimeout(flushRef.current);
    };
  }, [onEvents, sessionId]);
}
