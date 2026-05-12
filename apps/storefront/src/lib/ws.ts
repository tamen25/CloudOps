"use client";

import { useEffect, useRef, useState } from "react";

export type OrderEventStatus =
  | "received"
  | "confirmed"
  | "packed"
  | "shipped"
  | "cancelled";

export interface OrderEvent {
  type: string;
  order_id: string;
  tenant_id: string;
  payload?: { status?: OrderEventStatus } & Record<string, unknown>;
  ts: string;
}

interface WsState {
  status: "connecting" | "open" | "reconnecting" | "closed";
  lastEvent: OrderEvent | null;
}

const MAX_BACKOFF_MS = 30 * 1000;

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/ws-token", { method: "POST" });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: string };
    return body.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribes to the WS endpoint and surfaces the latest event for `orderId`.
 * Reconnects with exponential backoff; UI consumers can branch on `state.status`.
 */
export function useOrderUpdates(orderId: string): WsState {
  const [state, setState] = useState<WsState>({
    status: "connecting",
    lastEvent: null,
  });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsBase = process.env.NEXT_PUBLIC_WS_BASE_URL ?? "";
    if (!wsBase) {
      setState({ status: "closed", lastEvent: null });
      return;
    }

    let cancelled = false;
    let backoff = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function open() {
      if (cancelled) return;
      const token = await fetchToken();
      if (!token || cancelled) {
        setState((s) => ({ ...s, status: "reconnecting" }));
        timer = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        return;
      }
      const ws = new WebSocket(wsBase, ["cloudops", token]);
      socketRef.current = ws;
      ws.onopen = () => {
        backoff = 1000;
        setState((s) => ({ ...s, status: "open" }));
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(String(msg.data)) as OrderEvent;
          if (data.order_id === orderId) {
            setState({ status: "open", lastEvent: data });
          }
        } catch {
          //ignore malformed frame
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setState((s) => ({ ...s, status: "reconnecting" }));
        timer = setTimeout(open, backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      };
      ws.onerror = () => {
        ws.close();
      };
    }

    open();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
    };
  }, [orderId]);

  return state;
}
