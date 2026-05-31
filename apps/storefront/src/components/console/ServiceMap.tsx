"use client";

import { useMemo } from "react";
import type { Topology, TopologyEdge } from "@/lib/observe";

// Deterministic layered layout. We place nodes in columns by their distance
// from the root (api-gateway), so the trace fan-out reads left→right. No
// physics sim — stable positions make the map calm to watch under live polling.

interface Positioned {
  id: string;
  x: number;
  y: number;
  depth: number;
}

const W = 920;
const H = 460;
const COL_GAP = 150;
const ROOT = "api-gateway";

function computeDepths(nodes: string[], edges: TopologyEdge[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }
  const depth = new Map<string, number>();
  const root = nodes.includes(ROOT) ? ROOT : nodes[0];
  if (!root) return depth;
  const queue: Array<[string, number]> = [[root, 0]];
  depth.set(root, 0);
  while (queue.length) {
    const [n, d] = queue.shift()!;
    for (const next of adj.get(n) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, d + 1);
        queue.push([next, d + 1]);
      }
    }
  }
  // Orphans (no inbound edge from root, e.g. projection-worker) go to the last
  // column so they are still shown.
  let maxDepth = 0;
  for (const d of depth.values()) maxDepth = Math.max(maxDepth, d);
  for (const n of nodes) if (!depth.has(n)) depth.set(n, maxDepth + 1);
  return depth;
}

function layout(topo: Topology): Positioned[] {
  const depth = computeDepths(topo.nodes, topo.edges);
  const byCol = new Map<number, string[]>();
  for (const n of topo.nodes) {
    const d = depth.get(n) ?? 0;
    if (!byCol.has(d)) byCol.set(d, []);
    byCol.get(d)!.push(n);
  }
  const positioned: Positioned[] = [];
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  const marginX = 70;
  for (const col of cols) {
    const ids = byCol.get(col)!;
    const x = marginX + col * COL_GAP;
    ids.forEach((id, i) => {
      const slot = (i + 1) / (ids.length + 1);
      positioned.push({ id, x, y: slot * H, depth: col });
    });
  }
  return positioned;
}

function edgeColor(e: TopologyEdge): string {
  const ratio = e.callRate > 0 ? e.errorRate / e.callRate : 0;
  if (ratio >= 0.1) return "var(--danger)";
  if (ratio >= 0.01) return "var(--warning)";
  return "var(--brand-500)";
}

export function ServiceMap({ topology }: { topology: Topology }) {
  const positions = useMemo(() => layout(topology), [topology]);
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);

  if (topology.nodes.length === 0) {
    return (
      <div className="grid h-[460px] place-items-center rounded-lg border border-border-muted/60 bg-bg-elev/30">
        <p className="font-mono text-sm text-fg-subtle">
          no traffic yet — start a run on <span className="text-brand-400">/load</span>
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border-muted/60 bg-bg-elev/20">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Service map">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-subtle)" />
          </marker>
        </defs>

        {/* edges */}
        {topology.edges.map((e) => {
          const a = posById.get(e.source);
          const b = posById.get(e.target);
          if (!a || !b) return null;
          const color = edgeColor(e);
          return (
            <g key={`${e.source}->${e.target}`}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={color} strokeOpacity={0.5} strokeWidth={Math.min(1 + e.callRate, 4)}
                markerEnd="url(#arrow)"
              />
            </g>
          );
        })}

        {/* nodes */}
        {positions.map((p) => (
          <g key={p.id} transform={`translate(${p.x},${p.y})`}>
            <circle r={p.id === ROOT ? 9 : 6} fill="var(--bg-base)" stroke="var(--brand-500)" strokeWidth={1.5} />
            <circle r={p.id === ROOT ? 9 : 6} fill="var(--brand-500)" fillOpacity={0.15}>
              <animate attributeName="fill-opacity" values="0.15;0.35;0.15" dur="3s" repeatCount="indefinite" />
            </circle>
            <text
              x={0} y={p.id === ROOT ? -16 : -12}
              textAnchor="middle"
              className="fill-fg-muted"
              style={{ font: "500 11px var(--font-mono)" }}
            >
              {p.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
