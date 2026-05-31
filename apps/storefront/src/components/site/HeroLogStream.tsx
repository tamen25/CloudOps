"use client";

import { useEffect, useMemo, useState } from "react";

const TENANTS = ["acme", "globex", "initech", "umbrella", "soylent"];
const EVENTS = [
  ["order_created", "order_id=\"%s\"", "dur_ms=%n"],
  ["jwt_verify_ok", "tenant=%t", "sub=\"%u\""],
  ["ws_connect", "conn_id=\"%c\"", "lag_ms=%n"],
  ["product_search", "q=\"%q\"", "hits=%n"],
  ["cart_add", "sku=\"%s\"", "qty=%n"],
  ["checkout_started", "saga_id=\"%c\"", "items=%n"],
  ["audit_appended", "event=\"order.created\"", "tenant=%t"],
  ["image_resized", "key=\"%s\"", "px=%n"],
  ["kinesis_publish", "shard=%n", "lag=%n ms"],
  ["otel_export", "spans=%n", "logs=%n"],
] as const;

const LEVELS = ["INFO", "INFO", "INFO", "WARN", "INFO", "INFO"];

function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function fmtLine(seed: number): string {
  const r = lcg(seed);
  const date = new Date(Date.UTC(2026, 4, 20, 14, 22, Math.floor(r() * 60), Math.floor(r() * 1000)));
  const ts = date.toISOString().slice(11, 23) + "Z";
  const lvl = LEVELS[Math.floor(r() * LEVELS.length)];
  const tenant = TENANTS[Math.floor(r() * TENANTS.length)];
  const ev = EVENTS[Math.floor(r() * EVENTS.length)];
  const parts = ev.map((p) =>
    p
      .replace("%s", () => Math.random().toString(36).slice(2, 10))
      .replace("%n", () => String(Math.floor(r() * 999)))
      .replace("%t", () => tenant)
      .replace("%u", () => Math.random().toString(36).slice(2, 14))
      .replace("%c", () => Math.random().toString(36).slice(2, 12))
      .replace("%q", () =>
        ["mug", "keyboard", "stickers", "tee", "tote"][Math.floor(r() * 5)],
      ),
  );
  return `${ts}  ${lvl}  tenant=${tenant}  ${parts.join("  ")}`;
}

function buildColumn(seed: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => fmtLine(seed + i * 977));
}

export function HeroLogStream() {
  const [enabled, setEnabled] = useState(true);
  const cols = useMemo(
    () => [buildColumn(1, 48), buildColumn(2, 48), buildColumn(3, 48)],
    [],
  );

  useEffect(() => {
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 grid grid-cols-3 overflow-hidden mask-edges-y"
      style={{ opacity: 0.06 }}
    >
      {cols.map((lines, idx) => {
        const anim = ["log-print-a", "log-print-b", "log-print-c"][idx];
        const dur = [38, 46, 32][idx];
        return (
          <div
            key={idx}
            className="relative mask-center-fade overflow-hidden"
          >
            <div
              data-motion="log-stream"
              className="absolute inset-x-0 top-0 flex flex-col gap-0.5 px-4 font-mono text-[10px] leading-relaxed text-fg-base whitespace-nowrap"
              style={
                enabled
                  ? {
                      animation: `${anim} ${dur}s linear infinite`,
                    }
                  : undefined
              }
            >
              {[...lines, ...lines].map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
