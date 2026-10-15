"use client";

import { Fragment, useState } from "react";

// CI/CD pipelines, sourced from .github/workflows/{app.yml,infra.yml} (verified
// 2026-06-07). Mirrors the ArchitectureFlow lane treatment so the two sit
// together on /architecture.
type Kind = "ci" | "build" | "scan" | "gate" | "deploy" | "target";

interface Stage {
  name: string;
  kind: Kind;
  desc: string;
  primary?: boolean;
}

interface Pipeline {
  id: string;
  label: string;
  accent: string;
  note: string;
  stages: Stage[];
}

const KIND_COLORS: Record<Kind, string> = {
  ci: "#539bf5", // blue — GitHub Actions
  build: "#ed7100", // amber — build/artifact
  scan: "#dd344c", // red — security scan
  gate: "#d29922", // gold — approval gate
  deploy: "#8c4fff", // violet — deploy
  target: "#2dd4bf", // teal — runtime target
};

const PIPELINES: Pipeline[] = [
  {
    id: "cicd-app",
    label: "App deploy",
    accent: KIND_COLORS.ci,
    note: ".github/workflows/app.yml · OIDC → AWS · digest-pinned",
    stages: [
      { name: "test", kind: "ci", desc: "lint · unit · openapi" },
      { name: "manifest-validation", kind: "ci", desc: "kubeconform" },
      { name: "build-and-push", kind: "build", desc: "buildx + Cosign sign → ECR" },
      { name: "image-scan", kind: "scan", desc: "Trivy HIGH+" },
      { name: "budget-check", kind: "gate", desc: "FinOps cap" },
      {
        name: "deploy",
        kind: "deploy",
        desc: "Cosign verify · kubectl",
        primary: true,
      },
      { name: "EKS rollout", kind: "target", desc: "zero-downtime" },
      { name: "integration-test", kind: "ci", desc: "smoke + traces" },
    ],
  },
  {
    id: "cicd-infra",
    label: "Infra apply",
    accent: KIND_COLORS.deploy,
    note: ".github/workflows/infra.yml · layered stacks · prod gate",
    stages: [
      { name: "quality", kind: "ci", desc: "fmt · validate · tflint" },
      { name: "plan", kind: "ci", desc: "terraform plan" },
      { name: "security-scan", kind: "scan", desc: "tfsec · trivy · checkov" },
      {
        name: "approve",
        kind: "gate",
        desc: "prod environment gate",
        primary: true,
      },
      { name: "apply", kind: "deploy", desc: "terraform apply" },
      { name: "compliance-scan", kind: "scan", desc: "post-apply audit" },
    ],
  },
];

function StageTile({ stage }: { stage: Stage }) {
  const c = KIND_COLORS[stage.kind];
  return (
    <div
      className="flex min-w-0 flex-1 basis-0 flex-col gap-1 rounded-lg border bg-bg-raised/70 px-2.5 py-2.5 transition-all duration-200"
      style={{
        borderColor: stage.primary ? "rgba(94,234,212,0.45)" : undefined,
        borderTopColor: c,
        borderTopWidth: 2,
        background: stage.primary ? "rgba(45,212,191,0.06)" : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="block h-2 w-2 shrink-0 rounded-sm"
          style={{
            backgroundColor: c,
            boxShadow: stage.primary ? `0 0 8px ${c}` : undefined,
          }}
        />
        <span className="truncate font-mono text-[12px] text-fg-base">
          {stage.name}
        </span>
      </div>
      <span className="truncate font-mono text-[10.5px] text-fg-subtle">
        {stage.desc}
      </span>
    </div>
  );
}

function PipelineTrack({
  accent,
  stages,
  active,
  seed,
}: {
  accent: string;
  stages: number;
  active: boolean;
  seed: number;
}) {
  const stops = Math.max(2, stages);
  return (
    <div
      aria-hidden
      className="relative mt-3 h-[22px] transition-opacity duration-300"
      style={{ opacity: active ? 1 : 0.4 }}
    >
      <div
        className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent} 8%, ${accent} 92%, transparent)`,
          opacity: 0.35,
          boxShadow: `0 0 8px ${accent}`,
        }}
      />
      <div className="absolute inset-x-2 inset-y-0 flex items-center justify-between">
        {Array.from({ length: stops }).map((_, i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full"
            style={{
              backgroundColor: accent,
              opacity: 0.55,
              boxShadow: `0 0 6px ${accent}`,
            }}
          />
        ))}
      </div>
      <span
        className="flow-packet absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 9,
          height: 9,
          backgroundColor: accent,
          boxShadow: `0 0 14px ${accent}, 0 0 4px ${accent}`,
          animation: "flow-move 4.6s linear infinite",
          animationDelay: `${(seed * -0.9).toFixed(2)}s`,
        }}
      />
      <span
        className="flow-packet absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 6,
          height: 6,
          backgroundColor: "#5eead4",
          boxShadow: "0 0 10px #5eead4",
          animation: "flow-move 4.6s linear infinite",
          animationDelay: `${(seed * -0.9 - 2.3).toFixed(2)}s`,
          opacity: 0.85,
        }}
      />
    </div>
  );
}

function PipelineRow({
  pipeline,
  idx,
  hoveredIdx,
  onEnter,
  onLeave,
}: {
  pipeline: Pipeline;
  idx: number;
  hoveredIdx: number;
  onEnter: (idx: number) => void;
  onLeave: () => void;
}) {
  const dimmed = hoveredIdx !== -1 && hoveredIdx !== idx;
  const isLast = idx === PIPELINES.length - 1;
  return (
    <div
      id={pipeline.id}
      className="relative scroll-mt-32 py-6 transition-opacity duration-300"
      style={{
        opacity: dimmed ? 0.45 : 1,
        borderBottom: isLast ? "none" : "1px solid var(--border-default)",
      }}
      onMouseEnter={() => onEnter(idx)}
      onMouseLeave={onLeave}
    >
      <span
        aria-hidden
        className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full transition-opacity duration-300"
        style={{
          backgroundColor: pipeline.accent,
          opacity: hoveredIdx === idx ? 1 : 0.55,
        }}
      />
      <div className="pl-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
              PIPELINE · {String(idx + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display text-2xl text-fg-base">
              {pipeline.label}
            </h3>
          </div>
          <p className="font-mono text-[11.5px] text-fg-muted">{pipeline.note}</p>
        </div>

        <div className="flex flex-nowrap items-stretch gap-0">
          {pipeline.stages.map((s, i) => (
            <Fragment key={s.name}>
              <StageTile stage={s} />
              {i < pipeline.stages.length - 1 ? (
                <span
                  aria-hidden
                  className="mx-1 shrink-0 self-center font-mono text-sm text-fg-subtle select-none"
                >
                  ›
                </span>
              ) : null}
            </Fragment>
          ))}
        </div>

        <PipelineTrack
          accent={pipeline.accent}
          stages={pipeline.stages.length}
          active={hoveredIdx === idx || hoveredIdx === -1}
          seed={idx}
        />
      </div>
    </div>
  );
}

export function PipelineFlow() {
  const [hovered, setHovered] = useState(-1);

  return (
    <section
      id="pipelines"
      className="border-b border-border-muted/60 py-20"
    >
      <div className="mx-auto max-w-7xl px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          ci/cd · two pipelines
        </p>
        <h2 className="mt-3 max-w-3xl text-balance text-4xl font-medium leading-tight tracking-tight text-fg-base sm:text-5xl">
          Signed, scanned,{" "}
          <span className="display-italic text-brand-400">gated to ship.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-base text-fg-muted">
          The same flow you&apos;d trace in Actions. Hover a row to focus.
          Cosign-signed images, Trivy-scanned, deployed behind an approval gate.
        </p>

        <div className="mt-10 rounded-2xl border border-border-default/80 bg-bg-raised/40 p-5 backdrop-blur-md">
          {PIPELINES.map((p, i) => (
            <PipelineRow
              key={p.id}
              pipeline={p}
              idx={i}
              hoveredIdx={hovered}
              onEnter={setHovered}
              onLeave={() => setHovered(-1)}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border-default bg-bg-raised/40 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
            stage kinds:
          </span>
          {(Object.entries(KIND_COLORS) as [Kind, string][]).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="block h-2 w-2 rounded-sm"
                style={{ backgroundColor: c }}
              />
              <span className="font-mono text-[11px] text-fg-muted">{k}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
