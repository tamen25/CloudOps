"use client";

import { useState } from "react";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { usePoll } from "@/components/console/usePoll";

const SCENARIOS = ["browse", "place-order", "burst", "mixed", "chaos"] as const;
type Scenario = (typeof SCENARIOS)[number];

interface Status {
  running?: boolean;
  scenario?: string | null;
  rps?: number;
  sent?: number;
  ok?: number;
  failed?: number;
  inflight?: number;
  configured?: boolean;
}

export default function LoadPage() {
  const [scenario, setScenario] = useState<Scenario>("mixed");
  const [rps, setRps] = useState(20);
  const [duration, setDuration] = useState(120);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const status = usePoll<Status>("/api/load/status", 2000);
  const s = status.data ?? {};

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/load/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario, rps, durationSeconds: duration }),
      });
      const body = await res.json().catch(() => ({}));
      setMsg(res.ok ? `started ${scenario} @ ${body.rps}rps for ${body.durationSeconds}s` : `error: ${body.error ?? res.status}`);
    } catch {
      setMsg("error: request failed");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      const res = await fetch("/api/load/stop", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setMsg(res.ok ? "stopped" : `error: ${body.error ?? res.status}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative isolate min-h-screen">
      <div className="absolute inset-0 -z-10 line-grid opacity-[0.12]" aria-hidden />
      <div className="mx-auto max-w-3xl px-6 py-16">
        <ConsoleHeader
          active="/load"
          title="Traffic generator"
          subtitle="Drive synthetic traffic through the gateway to light up the service map. Runs are tagged synthetic, rate-limited, and bounded — admin only."
        />

        <div className="grid gap-6 rounded-lg border border-border-muted/60 bg-bg-elev/20 p-6">
          {/* scenario picker */}
          <div>
            <label className="mb-2 block text-[11px] uppercase tracking-widest text-fg-subtle">scenario</label>
            <div className="flex flex-wrap gap-2">
              {SCENARIOS.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setScenario(sc)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    scenario === sc
                      ? "border-brand-500/40 bg-brand-500/10 text-brand-400"
                      : "border-border-muted/60 text-fg-muted hover:text-fg-base"
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>

          {/* rps + duration */}
          <div className="grid grid-cols-2 gap-6">
            <Slider label="target rps" value={rps} min={1} max={200} onChange={setRps} suffix="/s" />
            <Slider label="duration" value={duration} min={5} max={600} step={5} onChange={setDuration} suffix="s" />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={start}
              disabled={busy}
              className="rounded-md bg-brand-500 px-4 py-2 font-mono text-sm font-medium text-bg-base transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Start run
            </button>
            <button
              onClick={stop}
              disabled={busy}
              className="rounded-md border border-border-muted px-4 py-2 font-mono text-sm text-fg-muted transition-colors hover:text-fg-base disabled:opacity-50"
            >
              Stop
            </button>
            {msg && <span className="font-mono text-xs text-fg-subtle">{msg}</span>}
          </div>
        </div>

        {/* live counters */}
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-muted/60 bg-border-muted/40 sm:grid-cols-4">
          <Counter label="state" value={s.running ? "running" : "idle"} tone={s.running ? "brand" : "subtle"} />
          <Counter label="sent" value={String(s.sent ?? 0)} />
          <Counter label="ok" value={String(s.ok ?? 0)} tone="success" />
          <Counter label="failed" value={String(s.failed ?? 0)} tone={(s.failed ?? 0) > 0 ? "danger" : "subtle"} />
        </dl>
        {s.configured === false && (
          <p className="mt-3 font-mono text-[11px] text-warning">loadgen not configured in this environment</p>
        )}
      </div>
    </main>
  );
}

function Slider({
  label, value, min, max, step = 1, onChange, suffix,
}: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; suffix: string;
}) {
  return (
    <div>
      <label className="mb-2 flex items-baseline justify-between text-[11px] uppercase tracking-widest text-fg-subtle">
        {label}
        <span className="font-mono text-base text-brand-400">{value}{suffix}</span>
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
    </div>
  );
}

function Counter({ label, value, tone = "base" }: { label: string; value: string; tone?: "brand" | "base" | "success" | "danger" | "subtle" }) {
  const toneClass = {
    brand: "text-brand-400", base: "text-fg-base", success: "text-success", danger: "text-danger", subtle: "text-fg-subtle",
  }[tone];
  return (
    <div className="bg-bg-base px-4 py-3">
      <dt className="text-[10px] uppercase tracking-widest text-fg-subtle">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl ${toneClass}`}>{value}</dd>
    </div>
  );
}
