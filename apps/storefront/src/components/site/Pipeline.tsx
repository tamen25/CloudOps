"use client";

import { useState } from "react";
import { useInView } from "./useInView";

interface Stage {
  name: string;
  tool: string;
  path: string;
}

const STAGES: Stage[] = [
  { name: "PR", tool: "GitHub", path: ".github/PULL_REQUEST_TEMPLATE.md" },
  { name: "Lint", tool: "eslint", path: ".github/workflows/app.yml" },
  { name: "Test", tool: "vitest", path: ".github/workflows/app.yml" },
  { name: "Build", tool: "next + tsc", path: ".github/workflows/app.yml" },
  { name: "Sign", tool: "cosign", path: ".github/workflows/app.yml" },
  { name: "Scan", tool: "trivy", path: ".github/workflows/app.yml" },
  { name: "Plan", tool: "terraform", path: ".github/workflows/infra.yml" },
  { name: "Approve", tool: "OIDC env", path: ".github/workflows/app.yml" },
  { name: "Deploy", tool: "kubectl", path: ".github/workflows/app.yml" },
  { name: "Verify", tool: "/ready", path: ".github/workflows/app.yml" },
  { name: "Rollback", tool: "auto", path: ".github/workflows/app.yml" },
];

const WIDTH = 1100;
const HEIGHT = 140;
const LEFT = 60;
const RIGHT = WIDTH - 60;

export function Pipeline() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.2 });
  const [hover, setHover] = useState<number | null>(null);

  return (
    <section className="border-b border-border-muted/60 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          pipeline · 11 stages
        </p>
        <h2 className="mt-3 max-w-3xl text-4xl font-medium leading-tight tracking-tight text-fg-base sm:text-5xl">
          Every commit, <span className="display-italic">the same gauntlet.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-base text-fg-muted">
          GitHub Actions runs the full chain on every PR. The same workflow is
          what deploys to prod. Hover any stage to see its workflow file.
        </p>

        <div ref={ref} className="mt-12 overflow-x-auto">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="block min-w-[900px]"
            role="img"
            aria-label="CI pipeline stages"
          >
            <line
              x1={LEFT}
              y1={HEIGHT / 2}
              x2={RIGHT}
              y2={HEIGHT / 2}
              stroke="#30363d"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <line
              x1={LEFT}
              y1={HEIGHT / 2}
              x2={RIGHT}
              y2={HEIGHT / 2}
              stroke="#2dd4bf"
              strokeWidth="1.5"
              data-motion="line-draw"
              style={
                inView
                  ? {
                      strokeDasharray: RIGHT - LEFT,
                      strokeDashoffset: 0,
                      transition: "stroke-dashoffset 1.6s ease-out",
                    }
                  : {
                      strokeDasharray: RIGHT - LEFT,
                      strokeDashoffset: RIGHT - LEFT,
                    }
              }
            />

            {STAGES.map((s, i) => {
              const x = LEFT + ((RIGHT - LEFT) / (STAGES.length - 1)) * i;
              const delay = inView ? i * 220 : 0;
              return (
                <g
                  key={s.name}
                  transform={`translate(${x}, ${HEIGHT / 2})`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                >
                  <circle
                    r="9"
                    fill={inView ? "#0d1117" : "#0d1117"}
                    stroke={inView ? "#2dd4bf" : "#30363d"}
                    strokeWidth="1.5"
                    style={{
                      transition: "stroke 220ms ease-out",
                      transitionDelay: `${delay}ms`,
                    }}
                  />
                  <circle
                    r="3.5"
                    fill="#2dd4bf"
                    opacity={inView ? 1 : 0}
                    style={{
                      transition: "opacity 220ms ease-out",
                      transitionDelay: `${delay}ms`,
                    }}
                  />
                  <text
                    y="-22"
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                    fill="#cdd9e5"
                  >
                    {s.name}
                  </text>
                  <text
                    y="32"
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                    fill="#687480"
                  >
                    {s.tool}
                  </text>
                </g>
              );
            })}

            {hover !== null
              ? (() => {
                  const x =
                    LEFT + ((RIGHT - LEFT) / (STAGES.length - 1)) * hover;
                  return (
                    <g transform={`translate(${x}, ${HEIGHT / 2 + 50})`}>
                      <rect
                        x={-110}
                        y={0}
                        width={220}
                        height={28}
                        rx={6}
                        fill="#21262d"
                        stroke="#30363d"
                      />
                      <text
                        x={0}
                        y={18}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="var(--font-mono)"
                        fill="#cdd9e5"
                      >
                        {STAGES[hover].path}
                      </text>
                    </g>
                  );
                })()
              : null}
          </svg>
        </div>
      </div>
    </section>
  );
}
